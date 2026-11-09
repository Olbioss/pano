import { afterEach, describe, expect, it, vi } from "vitest";
import { WRONG_PASSWORDS_PER_HOUR } from "../services/password-attempts";
import { cookieFrom, testApp, uniqueEmail } from "../test/app";
import { startMidWindow } from "../test/clock";

/** A client address of its own: no other test file uses 10.82.x.x. */
const ip = () => ({
  "cf-connecting-ip": `10.82.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`,
});

/** Just the session token: what a browser sends once the cache cookie expired. */
const tokenOnly = (cookie: string) =>
  cookie
    .split("; ")
    .filter((part) => part.startsWith("better-auth.session_token="))
    .join("; ");

async function signedIn(t: ReturnType<typeof testApp>, cookie: string) {
  const res = await t.client.api.me.$get(undefined, { headers: { cookie } });
  const body = await res.json();
  return body.success && body.data.user !== null;
}

function requestReset(t: ReturnType<typeof testApp>, email: string) {
  return t.post("/api/auth/email-otp/request-password-reset", { email });
}

function resetPassword(
  t: ReturnType<typeof testApp>,
  email: string,
  otp: string,
  password: string
) {
  return t.post("/api/auth/email-otp/reset-password", {
    email,
    otp,
    password,
  });
}

describe("forgot password", () => {
  it("emails a reset code, and the code sets a new password", async () => {
    const t = testApp();
    const { email, password } = await t.signUpConfirmed();

    expect((await requestReset(t, email)).status).toBe(200);
    const code = t.lastCode(email, "reset");
    const res = await resetPassword(t, email, code, "a brand new password");
    expect(res.status).toBe(200);

    expect(
      (await t.signInWithPassword(email, "a brand new password")).status
    ).toBe(200);
    expect((await t.signInWithPassword(email, password)).status).toBe(401);
    await t.settle();
  });

  it("signs every session out", async () => {
    const t = testApp();
    const { email, cookie } = await t.signUpConfirmed();

    await requestReset(t, email);
    await resetPassword(
      t,
      email,
      t.lastCode(email, "reset"),
      "a brand new password"
    );
    expect(await signedIn(t, tokenOnly(cookie))).toBe(false);
    await t.settle();
  });

  it("answers an unknown address the same way, and emails nothing", async () => {
    const t = testApp();
    const { email } = await t.signUpConfirmed();
    const known = await requestReset(t, email);
    const unknown = await requestReset(t, uniqueEmail());

    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
    expect(t.mail.sent.filter((sent) => sent.kind === "reset")).toHaveLength(1);
    await t.settle();
  });

  it("gives an account made with email codes its first password", async () => {
    const t = testApp();
    const { email } = await t.signIn();

    await requestReset(t, email);
    await resetPassword(t, email, t.lastCode(email, "reset"), "first password");
    expect((await t.signInWithPassword(email, "first password")).status).toBe(
      200
    );
    await t.settle();
  });

  it("confirms an unconfirmed sign-up with the new password", async () => {
    const t = testApp();
    const email = uniqueEmail();
    await t.signUp(email, "someone else's password");

    await requestReset(t, email);
    await resetPassword(
      t,
      email,
      t.lastCode(email, "reset"),
      "my own password"
    );
    expect((await t.signInWithPassword(email, "my own password")).status).toBe(
      200
    );
    expect(
      (await t.signInWithPassword(email, "someone else's password")).status
    ).toBe(401);
    await t.settle();
  });
});

describe("changing a password", () => {
  const change = (
    t: ReturnType<typeof testApp>,
    cookie: string,
    body: Record<string, unknown>
  ) =>
    t.post("/api/auth/change-password", body, {
      cookie,
    });

  it("needs the current password", async () => {
    const t = testApp();
    const { cookie } = await t.signUpConfirmed();
    const res = await change(t, cookie, {
      currentPassword: "not my password",
      newPassword: "a brand new password",
    });
    expect(res.status).toBe(400);
    await t.settle();
  });

  it("signs out the other devices, even when asked not to", async () => {
    const t = testApp();
    const { email, password, cookie } = await t.signUpConfirmed();
    const other = cookieFrom(await t.signInWithPassword(email, password));

    const res = await change(t, cookie, {
      currentPassword: password,
      newPassword: "a brand new password",
      revokeOtherSessions: false,
    });
    expect(res.status).toBe(200);
    expect(await signedIn(t, tokenOnly(other))).toBe(false);
    expect(await signedIn(t, cookieFrom(res))).toBe(true);
    await t.settle();
  });
});

describe("wrong passwords", () => {
  it(`pauses password sign-in for an address after ${WRONG_PASSWORDS_PER_HOUR} in an hour`, async () => {
    startMidWindow(60 * 60 * 1000);
    const t = testApp();
    const { email, password } = await t.signUpConfirmed();

    for (let i = 0; i < WRONG_PASSWORDS_PER_HOUR; i++) {
      expect((await t.signInWithPassword(email, `wrong ${i}`)).status).toBe(
        401
      );
    }
    const paused = await t.signInWithPassword(email, password);
    expect(paused.status).toBe(429);
    expect(await paused.json()).toMatchObject({ code: "PASSWORD_PAUSED" });

    // An email code still signs the owner in.
    expect((await t.signIn(email)).cookie).not.toBe("");
    await t.settle();
  });

  it("pauses an address with no account the same way", async () => {
    startMidWindow(60 * 60 * 1000);
    const t = testApp();
    const email = uniqueEmail();
    for (let i = 0; i < WRONG_PASSWORDS_PER_HOUR; i++) {
      await t.signInWithPassword(email, `wrong ${i}`);
    }
    const paused = await t.signInWithPassword(email, "anything at all");
    expect(paused.status).toBe(429);
    expect(await paused.json()).toMatchObject({ code: "PASSWORD_PAUSED" });
    await t.settle();
  });
});

describe("password limits in production", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("counts a reset code against the address's three in ten minutes", async () => {
    startMidWindow(10 * 60 * 1000);
    const t = testApp({ ENVIRONMENT: "production" });
    const email = uniqueEmail();
    for (let i = 0; i < 3; i++) await t.sendCode(email, ip());
    const refused = await t.post(
      "/api/auth/email-otp/request-password-reset",
      { email },
      ip()
    );
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ code: "CODE_LIMIT" });
    await t.settle();
  });

  it("refuses a leaked password as the new one on reset and on change", async () => {
    const t = testApp({ ENVIRONMENT: "production" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(""))
    );
    const { email, password, cookie } = await t.signUpConfirmed(
      undefined,
      undefined,
      ip()
    );
    // SHA-1 of "password" starts 5BAA6; the rest is listed.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("1E4C9B93F3F0682250B6CF8331B7EE68FD8:42"))
    );
    const changed = await t.post(
      "/api/auth/change-password",
      { currentPassword: password, newPassword: "password" },
      { cookie, ...ip() }
    );
    expect(await changed.json()).toMatchObject({
      code: "PASSWORD_COMPROMISED",
    });

    await t.post("/api/auth/email-otp/request-password-reset", { email }, ip());
    const reset = await t.post(
      "/api/auth/email-otp/reset-password",
      { email, otp: t.lastCode(email, "reset"), password: "password" },
      ip()
    );
    expect(await reset.json()).toMatchObject({ code: "PASSWORD_COMPROMISED" });
    await t.settle();
  });

  it("allows three reset requests a minute from one address", async () => {
    const t = testApp({ ENVIRONMENT: "production" });
    const from = ip();
    for (let i = 0; i < 3; i++) {
      const res = await t.post(
        "/api/auth/email-otp/request-password-reset",
        { email: uniqueEmail() },
        from
      );
      expect(res.status).toBe(200);
    }
    const refused = await t.post(
      "/api/auth/email-otp/request-password-reset",
      { email: uniqueEmail() },
      from
    );
    expect(refused.status).toBe(429);
    await t.settle();
  });
});
