import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { session, user } from "../db/schema";
import { resetDemo } from "../services/demo-reset";
import { testApp } from "../test/app";
import { testDb } from "../test/db";

const { db, close } = testDb();
beforeAll(() => resetDemo(db));
afterAll(() => close());

/** A client address of its own: no other test file uses 10.83.x.x. */
const ip = () => ({
  "cf-connecting-ip": `10.83.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`,
});

/** Just the session token, so the request reads the session from the database. */
const tokenOnly = (cookie: string) =>
  cookie
    .split("; ")
    .filter((part) => part.startsWith("better-auth.session_token="))
    .join("; ");

function setPassword(
  t: ReturnType<typeof testApp>,
  cookie: string,
  password: string,
  headers: Record<string, string> = {}
) {
  return t.post("/api/me/password", { password }, { cookie, ...headers });
}

/** Makes every session of the account look like it signed in `hours` ago. */
async function ageSessions(email: string, hours: number) {
  const started = new Date(Date.now() - hours * 60 * 60 * 1000);
  const [owner] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email));
  await db
    .update(session)
    .set({ createdAt: started })
    .where(eq(session.userId, owner!.id));
}

describe("GET /api/me", () => {
  it("says when the session signed in", async () => {
    const t = testApp();
    const before = Date.now();
    const { cookie } = await t.signIn();
    const res = await t.client.api.me.$get(undefined, { headers: { cookie } });
    const body = await res.json();
    if (!body.success || !body.data.user) throw new Error("not signed in");
    const started = Date.parse(body.data.user.sessionStartedAt);
    expect(started).toBeGreaterThanOrEqual(before - 1000);
    expect(started).toBeLessThanOrEqual(Date.now());
    await t.settle();
  });

  it("offers GitHub sign-in only when both of its secrets are set", async () => {
    const answer = async (overrides: Record<string, string>) => {
      const t = testApp(overrides);
      const body = await (await t.client.api.me.$get()).json();
      await t.settle();
      return body.success ? body.data.signIn : null;
    };
    expect(await answer({})).toEqual({ github: false });
    expect(await answer({ GITHUB_CLIENT_ID: "id" })).toEqual({ github: false });
    expect(
      await answer({ GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: "secret" })
    ).toEqual({ github: true });
  });
});

describe("POST /api/me/password", () => {
  it("gives an account made with email codes its first password", async () => {
    const t = testApp();
    const { email, cookie } = await t.signIn();

    const res = await setPassword(t, cookie, "my first password");
    expect(res.status).toBe(200);
    expect(
      (await t.signInWithPassword(email, "my first password")).status
    ).toBe(200);
    await t.settle();
  });

  it("refuses an account that has a password already", async () => {
    const t = testApp();
    const { cookie } = await t.signUpConfirmed();
    const res = await setPassword(t, cookie, "another password");
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "PASSWORD_EXISTS" });
    await t.settle();
  });

  it("needs a session that signed in within the last day", async () => {
    const t = testApp();
    const { email, cookie } = await t.signIn();
    await ageSessions(email, 25);

    const res = await setPassword(t, tokenOnly(cookie), "my first password");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "SESSION_NOT_FRESH" });
    await t.settle();
  });

  it("refuses demo guests", async () => {
    const t = testApp();
    const { cookie } = await t.signInDemo("member");
    const res = await setPassword(t, cookie, "my first password");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "DEMO_ONLY" });
    await t.settle();
  });

  it("refuses a password shorter than 8 characters", async () => {
    const t = testApp();
    const { cookie } = await t.signIn();
    expect((await setPassword(t, cookie, "short12")).status).toBe(400);
    await t.settle();
  });

  it("needs a signed-in user", async () => {
    const t = testApp();
    expect((await setPassword(t, "", "my first password")).status).toBe(401);
    await t.settle();
  });
});

describe("POST /api/me/password in production", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("refuses a leaked password", async () => {
    const t = testApp({ ENVIRONMENT: "production" });
    const { cookie } = await t.signIn(undefined, ip());
    // SHA-1 of "password" starts 5BAA6; the rest is listed.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("1E4C9B93F3F0682250B6CF8331B7EE68FD8:42"))
    );
    const res = await setPassword(t, cookie, "password", ip());
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "PASSWORD_COMPROMISED" });
    await t.settle();
  });

  it("allows five tries an hour", async () => {
    const t = testApp({ ENVIRONMENT: "production" });
    const { cookie } = await t.signIn(undefined, ip());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(""))
    );
    // Too short: refused after the limit counts it, so nothing gets set.
    for (let i = 0; i < 5; i++) {
      expect((await setPassword(t, cookie, "short", ip())).status).toBe(400);
    }
    expect((await setPassword(t, cookie, "long enough now", ip())).status).toBe(
      429
    );
    await t.settle();
  });
});

describe("changing a password as a demo guest", () => {
  it("is refused as a demo action", async () => {
    const t = testApp();
    const { cookie } = await t.signInDemo("member");
    const res = await t.post(
      "/api/auth/change-password",
      { currentPassword: "anything", newPassword: "something new" },
      { cookie }
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "DEMO_ONLY" });
    await t.settle();
  });
});
