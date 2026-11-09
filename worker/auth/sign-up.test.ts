import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_EMAIL_DOMAIN } from "@/shared/demo";
import { cookieFrom, testApp, uniqueEmail } from "../test/app";
import { startMidWindow } from "../test/clock";

const PASSWORD = "correct horse battery";
/** A client address of its own: no other test file uses 10.81.x.x. */
const ip = () => ({
  "cf-connecting-ip": `10.81.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`,
});

async function whoIsSignedIn(t: ReturnType<typeof testApp>, cookie: string) {
  const res = await t.client.api.me.$get(undefined, { headers: { cookie } });
  const body = await res.json();
  return body.success ? body.data.user : null;
}

describe("password sign-up", () => {
  it("emails a confirmation code, and the code with the password signs in", async () => {
    const t = testApp();
    const email = uniqueEmail("ayse");

    const res = await t.signUp(email, PASSWORD);
    expect(res.status).toBe(200);
    expect(t.mail.sent).toEqual([
      expect.objectContaining({ to: email, kind: "confirm" }),
    ]);

    const confirmed = await t.confirm(email, t.lastCode(email), PASSWORD);
    expect(confirmed.status).toBe(200);
    expect(await whoIsSignedIn(t, cookieFrom(confirmed))).toMatchObject({
      email,
    });

    const again = await t.signInWithPassword(email, PASSWORD);
    expect(again.status).toBe(200);
    await t.settle();
  });

  it("refuses the password until the address is confirmed", async () => {
    const t = testApp();
    const email = uniqueEmail();
    await t.signUp(email, PASSWORD);

    const res = await t.signInWithPassword(email, PASSWORD);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    await t.settle();
  });

  it("refuses a password shorter than 8 characters, and sends nothing", async () => {
    const t = testApp();
    const res = await t.signUp(uniqueEmail(), "short12");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "PASSWORD_TOO_SHORT" });
    expect(t.mail.sent).toEqual([]);
    await t.settle();
  });

  it("refuses demo addresses", async () => {
    const t = testApp();
    const res = await t.signUp(`someone@${DEMO_EMAIL_DOMAIN}`, PASSWORD);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "DEMO_ONLY" });
    await t.settle();
  });
});

describe("confirming a sign-up", () => {
  it("confirms but keeps no password when the code comes with another password", async () => {
    const t = testApp();
    const email = uniqueEmail();
    await t.signUp(email, PASSWORD);

    const confirmed = await t.confirm(email, t.lastCode(email), "not the one");
    expect(confirmed.status).toBe(200);
    expect(await whoIsSignedIn(t, cookieFrom(confirmed))).toMatchObject({
      email,
    });

    // The sign-up's password never took: someone else may have typed it.
    const res = await t.signInWithPassword(email, PASSWORD);
    expect(res.status).toBe(401);
    await t.settle();
  });

  it("keeps no password when the code comes alone", async () => {
    const t = testApp();
    const email = uniqueEmail();
    await t.signUp(email, PASSWORD);

    expect((await t.confirm(email, t.lastCode(email))).status).toBe(200);
    expect((await t.signInWithPassword(email, PASSWORD)).status).toBe(401);
    await t.settle();
  });

  it("answers a wrong code and an unknown address the same way", async () => {
    const t = testApp();
    const email = uniqueEmail();
    await t.signUp(email, PASSWORD);

    const wrong = await t.confirm(email, "000000", PASSWORD);
    const unknown = await t.confirm(uniqueEmail(), "000000", PASSWORD);
    expect(wrong.status).toBe(400);
    expect(unknown.status).toBe(400);
    expect(await wrong.json()).toEqual(await unknown.json());
    await t.settle();
  });
});

describe("signing up again", () => {
  it("replaces a sign-up that was never confirmed", async () => {
    const t = testApp();
    const email = uniqueEmail();
    await t.signUp(email, "first password!");
    await t.signUp(email, PASSWORD);

    await t.confirm(email, t.lastCode(email), PASSWORD);
    expect((await t.signInWithPassword(email, PASSWORD)).status).toBe(200);
    expect((await t.signInWithPassword(email, "first password!")).status).toBe(
      401
    );
    await t.settle();
  });

  it("answers an existing account's address like a new one, and emails its owner a sign-in code", async () => {
    const t = testApp();
    const { email, cookie } = await t.signIn();
    const owner = await whoIsSignedIn(t, cookie);

    const res = await t.signUp(email, PASSWORD);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ token: null, user: { email } });
    expect(t.mail.sent.at(-1)).toMatchObject({
      to: email,
      kind: "existing-account",
    });

    // The code signs the owner in; the password typed isn't saved.
    const confirmed = await t.confirm(email, t.lastCode(email), PASSWORD);
    expect(confirmed.status).toBe(200);
    expect(await whoIsSignedIn(t, cookieFrom(confirmed))).toMatchObject({
      id: owner?.id,
    });
    expect((await t.signInWithPassword(email, PASSWORD)).status).toBe(401);
    await t.settle();
  });

  it("leaves an existing account's password alone", async () => {
    const t = testApp();
    const { email, password } = await t.signUpConfirmed();

    await t.signUp(email, "an attacker's guess");
    await t.confirm(email, t.lastCode(email, "existing-account"), "whatever");
    expect((await t.signInWithPassword(email, password)).status).toBe(200);
    await t.settle();
  });
});

describe("codes and routes", () => {
  it("sends codes of other kinds only from their own flows", async () => {
    const t = testApp();
    const res = await t.post("/api/auth/email-otp/send-verification-otp", {
      email: uniqueEmail(),
      type: "email-verification",
    });
    expect(res.status).toBe(400);
    expect(t.mail.sent).toEqual([]);
    await t.settle();
  });

  it.each([
    "/api/auth/email-otp/check-verification-otp",
    "/api/auth/forget-password/email-otp",
    "/api/auth/email-otp/request-email-change",
    "/api/auth/send-verification-email",
  ])("closes %s, which Pano doesn't use", async (path) => {
    const t = testApp();
    const res = await t.post(path, { email: uniqueEmail() });
    expect(res.status).toBe(404);
    await t.settle();
  });
});

describe("sign-up limits in production", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("counts a sign-up's code against the address's three in ten minutes", async () => {
    startMidWindow(10 * 60 * 1000);
    const t = testApp({ ENVIRONMENT: "production" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 200 }))
    );
    const email = uniqueEmail();
    for (let i = 0; i < 3; i++) {
      expect((await t.signUp(email, PASSWORD, ip())).status).toBe(200);
    }
    const refused = await t.signUp(email, PASSWORD, ip());
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ code: "CODE_LIMIT" });
    expect(t.mail.sent).toHaveLength(3);
    await t.settle();
  });

  it("refuses a password from a data breach before sending anything", async () => {
    const t = testApp({ ENVIRONMENT: "production" });
    // SHA-1 of "password" starts 5BAA6; the rest is listed.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("1E4C9B93F3F0682250B6CF8331B7EE68FD8:42"))
    );
    const res = await t.signUp(uniqueEmail(), "password", ip());
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "PASSWORD_COMPROMISED" });
    expect(t.mail.sent).toEqual([]);
    await t.settle();
  });

  it("allows three sign-ups a minute from one address", async () => {
    const t = testApp({ ENVIRONMENT: "production" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 200 }))
    );
    const from = ip();
    for (let i = 0; i < 3; i++) {
      expect((await t.signUp(uniqueEmail(), PASSWORD, from)).status).toBe(200);
    }
    expect((await t.signUp(uniqueEmail(), PASSWORD, from)).status).toBe(429);
    await t.settle();
  });
});
