import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createDb } from "../db/client";
import { session, user } from "../db/schema";
import { cookieFrom, ORIGIN, testApp, uniqueEmail } from "../test/app";
import { testEnv } from "../test/env";

/** Just the session token: what a browser sends once the cache cookie expired. */
const tokenOnly = (cookie: string) =>
  cookie
    .split("; ")
    .filter((part) => part.startsWith("better-auth.session_token="))
    .join("; ");

const setCookies = (res: { headers: Headers }) =>
  res.headers.getSetCookie().join("\n");

describe("email-code sign-in", () => {
  it("signs a new user in with the emailed code", async () => {
    const t = testApp();
    const email = uniqueEmail("ayse");

    const sent = await t.sendCode(email);
    expect(sent.status).toBe(200);
    expect(t.mail.sent).toEqual([
      expect.objectContaining({ to: email, locale: "en" }),
    ]);

    const res = await t.post("/api/auth/sign-in/email-otp", {
      email,
      otp: t.lastCode(email),
    });
    expect(res.status).toBe(200);

    const me = await t.client.api.me.$get(undefined, {
      headers: { cookie: cookieFrom(res) },
    });
    expect(await me.json()).toEqual({
      success: true,
      data: {
        user: { id: expect.any(String), email, name: email.split("@")[0] },
        workspaces: [],
      },
    });
    await t.settle();
  });

  it("refuses a wrong code and creates no session", async () => {
    const t = testApp();
    const email = uniqueEmail();
    await t.sendCode(email);
    const wrong = t.lastCode(email) === "000000" ? "111111" : "000000";

    const res = await t.post("/api/auth/sign-in/email-otp", {
      email,
      otp: wrong,
    });
    expect(res.ok).toBe(false);

    const me = await t.client.api.me.$get(undefined, {
      headers: { cookie: cookieFrom(res) },
    });
    expect(await me.json()).toMatchObject({ data: { user: null } });
    await t.settle();
  });

  it("answers /api/me with no user when signed out", async () => {
    const t = testApp();
    const me = await t.client.api.me.$get();
    expect(await me.json()).toEqual({
      success: true,
      data: { user: null, workspaces: [] },
    });
    await t.settle();
  });

  it("writes the code email in the browser's language", async () => {
    const t = testApp();
    const email = uniqueEmail();
    await t.sendCode(email, { "accept-language": "tr-TR,tr;q=0.9,en;q=0.8" });
    expect(t.mail.sent.at(-1)).toMatchObject({ to: email, locale: "tr" });
    await t.settle();
  });

  it("limits code requests from one address in production", async () => {
    const t = testApp({ ENVIRONMENT: "production" });
    const ip = {
      "cf-connecting-ip": `203.0.113.${Math.floor(Math.random() * 250) + 1}`,
    };
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      statuses.push((await t.sendCode(uniqueEmail(), ip)).status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
    await t.settle();
  });
  it("tells the person when the code email couldn't be sent", async () => {
    const app = createApp({
      mailer: {
        async sendSignInCode() {
          throw new Error("Brevo refused the email: 401 unauthorized");
        },
      },
    });
    const { env, ctx, settle } = testEnv();
    const res = await app.request(
      "/api/auth/email-otp/send-verification-otp",
      {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify({ email: uniqueEmail(), type: "sign-in" }),
      },
      env,
      ctx
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ success: false });
    await settle();
  });
});

describe("session cookies", () => {
  it("renews the cache cookie on /api/me once it has run out", async () => {
    const t = testApp();
    const { cookie } = await t.signIn();
    const res = await t.request("/api/me", {
      headers: { cookie: tokenOnly(cookie) },
    });
    expect(res.status).toBe(200);
    expect(setCookies(res)).toContain("better-auth.session_data=");
    await t.settle();
  });

  it("renews it on routes that need a signed-in user too", async () => {
    const t = testApp();
    const { cookie } = await t.signIn();
    const res = await t.client.api.workspaces.$post(
      {
        json: {
          name: "Acme",
          slug: `ws-${crypto.randomUUID().slice(0, 8)}`,
          defaultLocale: "en",
        },
      },
      { headers: { cookie: tokenOnly(cookie) } }
    );
    expect(res.status).toBe(201);
    expect(setCookies(res)).toContain("better-auth.session_data=");
    await t.settle();
  });

  it("keeps an active person signed in past the first week", async () => {
    const t = testApp();
    const { email, cookie } = await t.signIn();
    // Make the session due for renewal: it now runs out in a minute.
    const { db, close } = createDb(String(process.env.TEST_DATABASE_URL));
    const [row] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email));
    await db
      .update(session)
      .set({ expiresAt: new Date(Date.now() + 60_000) })
      .where(eq(session.userId, row!.id));
    await close();

    const res = await t.request("/api/me", {
      headers: { cookie: tokenOnly(cookie) },
    });
    const token = res.headers
      .getSetCookie()
      .find((part) => part.startsWith("better-auth.session_token="));
    expect(token).toMatch(/Max-Age=604800/);
    await t.settle();
  });
});
