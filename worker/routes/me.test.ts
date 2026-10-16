import { describe, expect, it } from "vitest";
import { cookieFrom, testApp, uniqueEmail } from "../test/app";

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
});
