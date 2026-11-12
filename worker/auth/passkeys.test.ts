import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PASSKEYS_PER_ACCOUNT } from "@/shared/account";
import { passkey, session, user } from "../db/schema";
import { resetDemo } from "../services/demo-reset";
import { testApp, updateCookie } from "../test/app";
import { testDb } from "../test/db";
import { softPasskey } from "../test/passkey";

const { db, close } = testDb();
beforeAll(() => resetDemo(db));
afterAll(() => close());

type Device = Awaited<ReturnType<typeof softPasskey>>;

/** The account page's "Add a passkey": options, the device's answer, the check. */
async function addPasskey(
  t: ReturnType<typeof testApp>,
  cookie: string,
  device: Device,
  name = "Chrome on macOS"
) {
  const options = await t.request(
    "/api/auth/passkey/generate-register-options",
    { headers: { cookie } }
  );
  if (!options.ok) return options;
  const response = await device.register(await options.json());
  return t.post(
    "/api/auth/passkey/verify-registration",
    { response, name },
    { cookie: updateCookie(cookie, options) }
  );
}

/** "Sign in with a passkey" on the sign-in page. */
async function signInWithPasskey(
  t: ReturnType<typeof testApp>,
  device: Device
) {
  const options = await t.request(
    "/api/auth/passkey/generate-authenticate-options"
  );
  const response = await device.authenticate(await options.json());
  return t.post(
    "/api/auth/passkey/verify-authentication",
    { response },
    { cookie: updateCookie("", options) }
  );
}

async function me(t: ReturnType<typeof testApp>, cookie: string) {
  const res = await t.client.api.me.$get(undefined, { headers: { cookie } });
  const body = await res.json();
  return body.success ? body.data.user : null;
}

describe("passkeys", () => {
  it("adds a passkey, which then signs in without an email", async () => {
    const t = testApp();
    const { cookie } = await t.signIn();
    const owner = await me(t, cookie);
    const device = await softPasskey();

    expect((await addPasskey(t, cookie, device)).status).toBe(200);
    const res = await signInWithPasskey(t, device);
    expect(res.status).toBe(200);
    expect(await me(t, updateCookie("", res))).toMatchObject({
      id: owner?.id,
    });
    await t.settle();
  });

  it("labels the passkey with the account's email, not the device's name", async () => {
    const t = testApp();
    const { email, cookie } = await t.signIn();
    // The app sends the device's name for Pano's own list. The password
    // manager should still file the passkey under the account.
    const res = await t.request(
      "/api/auth/passkey/generate-register-options?name=Chrome%20on%20macOS",
      { headers: { cookie } }
    );
    const options = (await res.json()) as { user: { name: string } };
    expect(options.user.name).toBe(email);
    await t.settle();
  });

  it("lists each passkey with its name and when it was added", async () => {
    const t = testApp();
    const { cookie } = await t.signIn();
    await addPasskey(t, cookie, await softPasskey(), "Safari on iPhone");

    const res = await t.request("/api/auth/passkey/list-user-passkeys", {
      headers: { cookie },
    });
    expect(await res.json()).toEqual([
      expect.objectContaining({
        name: "Safari on iPhone",
        createdAt: expect.any(String),
      }),
    ]);
    await t.settle();
  });

  it("stops signing in once removed", async () => {
    const t = testApp();
    const { cookie } = await t.signIn();
    const device = await softPasskey();
    await addPasskey(t, cookie, device);
    const listed = await t.request("/api/auth/passkey/list-user-passkeys", {
      headers: { cookie },
    });
    const [added] = (await listed.json()) as { id: string }[];

    const removed = await t.post(
      "/api/auth/passkey/delete-passkey",
      { id: added?.id },
      { cookie }
    );
    expect(removed.status).toBe(200);
    expect((await signInWithPasskey(t, device)).ok).toBe(false);
    await t.settle();
  });

  it("refuses a passkey made for another site", async () => {
    const t = testApp();
    const { cookie } = await t.signIn();
    const device = await softPasskey("https://elsewhere.example");
    expect((await addPasskey(t, cookie, device)).ok).toBe(false);
    await t.settle();
  });

  it(`stops at ${PASSKEYS_PER_ACCOUNT} passkeys an account`, async () => {
    const t = testApp();
    const { email, cookie } = await t.signIn();
    const [owner] = await db.select().from(user).where(eq(user.email, email));
    await db.insert(passkey).values(
      Array.from({ length: PASSKEYS_PER_ACCOUNT }, (_, i) => ({
        id: crypto.randomUUID(),
        publicKey: "test",
        userId: owner!.id,
        credentialID: `credential-${crypto.randomUUID()}-${i}`,
        counter: 0,
        deviceType: "singleDevice",
        backedUp: false,
      }))
    );

    const res = await addPasskey(t, cookie, await softPasskey());
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "PASSKEY_LIMIT" });
    await t.settle();
  });

  it("needs a session that signed in within the last day", async () => {
    const t = testApp();
    const { email, cookie } = await t.signIn();
    const [owner] = await db.select().from(user).where(eq(user.email, email));
    await db
      .update(session)
      .set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(session.userId, owner!.id));
    const tokenOnly = cookie
      .split("; ")
      .filter((part) => part.startsWith("better-auth.session_token="))
      .join("; ");

    const res = await addPasskey(t, tokenOnly, await softPasskey());
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "SESSION_NOT_FRESH" });
    await t.settle();
  });

  it("refuses demo guests", async () => {
    const t = testApp();
    const { cookie } = await t.signInDemo("member");
    const res = await addPasskey(t, cookie, await softPasskey());
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "DEMO_ONLY" });
    await t.settle();
  });

  it("needs a signed-in user to add one", async () => {
    const t = testApp();
    const res = await addPasskey(t, "", await softPasskey());
    expect(res.status).toBe(401);
    await t.settle();
  });
});
