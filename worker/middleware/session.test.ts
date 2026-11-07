import { describe, expect, it, vi } from "vitest";
import { createAuth } from "../auth";
import { cookieFrom, testApp } from "../test/app";
import { testEnv } from "../test/env";
import { setupWorkspace } from "../test/fixtures";

// Counts how often a request builds Better Auth, the costliest part of a
// cold request.
vi.mock("../auth", async (importOriginal) => {
  const auth = await importOriginal<typeof import("../auth")>();
  return { ...auth, createAuth: vi.fn(auth.createAuth) };
});
const built = vi.mocked(createAuth);

/** Just the session token: what a browser sends once the cache cookie expired. */
const tokenOnly = (cookie: string) =>
  cookie
    .split("; ")
    .filter((part) => part.startsWith("better-auth.session_token="))
    .join("; ");

/** Just the five-minute cache cookie. */
const cacheOnly = (cookie: string) =>
  cookie
    .split("; ")
    .filter((part) => part.startsWith("better-auth.session_data="))
    .join("; ");

async function me(t: ReturnType<typeof testApp>, cookie?: string) {
  const res = await t.request("/api/me", {
    headers: cookie ? { cookie } : {},
  });
  const body = (await res.json()) as {
    data: { user: { email: string } | null };
  };
  return body.data.user;
}

describe("reading the session", () => {
  it("answers a signed-out request without building Better Auth", async () => {
    const t = testApp();
    const { slug } = await setupWorkspace(t);
    built.mockClear();
    expect(await me(t)).toBeNull();
    const feed = await t.request(`/api/workspaces/${slug}/posts`);
    expect(feed.status).toBe(200);
    expect(built).not.toHaveBeenCalled();
    await t.settle();
  });

  it("reads a signed-in request from the cache cookie without building Better Auth", async () => {
    const t = testApp();
    const { email, cookie } = await t.signIn();
    built.mockClear();
    expect(await me(t, cookie)).toMatchObject({ email });
    expect(built).not.toHaveBeenCalled();
    await t.settle();
  });

  it("reads production's __Secure- cookies the same way", async () => {
    const site = "https://pano.test";
    const t = testApp({ BETTER_AUTH_URL: site });
    const { ctx, settle } = testEnv();
    // From the site itself, as a browser on it would send them.
    const call = (path: string, init: RequestInit = {}) =>
      t.app.request(`${site}${path}`, init, t.env, ctx);
    const post = (path: string, body: unknown) =>
      call(path, {
        method: "POST",
        headers: { "content-type": "application/json", origin: site },
        body: JSON.stringify(body),
      });
    const email = `secure-${crypto.randomUUID().slice(0, 8)}@example.com`;
    await post("/api/auth/email-otp/send-verification-otp", {
      email,
      type: "sign-in",
    });
    const signedIn = await post("/api/auth/sign-in/email-otp", {
      email,
      otp: t.lastCode(email),
    });
    const cookie = cookieFrom(signedIn);
    expect(cookie).toContain("__Secure-better-auth.session_data=");
    built.mockClear();
    const res = await call("/api/me", { headers: { cookie } });
    expect(await res.json()).toMatchObject({ data: { user: { email } } });
    expect(built).not.toHaveBeenCalled();
    await settle();
    await t.settle();
  });

  it("asks Better Auth once the cache cookie has run out", async () => {
    const t = testApp();
    const { email, cookie } = await t.signIn();
    built.mockClear();
    expect(await me(t, tokenOnly(cookie))).toMatchObject({ email });
    expect(built).toHaveBeenCalledTimes(1);
    await t.settle();
  });

  it("doesn't take another session's cache cookie", async () => {
    const t = testApp();
    const ayse = await t.signIn();
    const sam = await t.signIn();
    const mixed = `${tokenOnly(sam.cookie)}; ${cacheOnly(ayse.cookie)}`;
    expect(await me(t, mixed)).toMatchObject({ email: sam.email });
    await t.settle();
  });

  it("doesn't take a cache cookie signed with another secret", async () => {
    const t = testApp();
    const { cookie } = await t.signIn();
    const other = testApp({
      BETTER_AUTH_SECRET: "another-secret-another-secret-0123456",
    });
    expect(await me(other, cookie)).toBeNull();
    await t.settle();
    await other.settle();
  });
});
