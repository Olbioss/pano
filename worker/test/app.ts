import { testClient } from "hono/testing";
import { createApp } from "../app";
import type { Bindings } from "../env";
import type { Mailer, SignInCode } from "../mail/mailer";
import { testEnv } from "./env";

/** Matches BETTER_AUTH_URL in testEnv, so Better Auth trusts the requests. */
export const ORIGIN = "http://localhost";

/** A mailer that keeps what it would have sent, so tests can read the codes. */
export function capturingMailer() {
  const sent: SignInCode[] = [];
  const mailer: Mailer = {
    async sendSignInCode(message) {
      sent.push(message);
    },
  };
  return { mailer, sent };
}

/** The Cookie header a browser would send after this response. */
export function cookieFrom(res: Response) {
  return res.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

/** `cookie` with whatever `res` set replaced, the way a browser keeps them. */
export function updateCookie(cookie: string, res: { headers: Headers }) {
  const jar = new Map<string, string>();
  const add = (pair: string) => {
    const at = pair.indexOf("=");
    if (at > 0) jar.set(pair.slice(0, at), pair.slice(at + 1));
  };
  for (const pair of cookie.split("; ")) add(pair);
  for (const set of res.headers.getSetCookie()) add(set.split(";")[0] ?? "");
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

export const uniqueEmail = (prefix = "user") =>
  `${prefix}-${crypto.randomUUID().slice(0, 8)}@example.com`;

/**
 * The real app with a capturing mailer, bound to the test database. `signIn`
 * runs the actual email-code flow and returns the session cookie.
 */
export function testApp(overrides: Partial<Bindings> = {}) {
  const mail = capturingMailer();
  const app = createApp({ mailer: mail.mailer });
  const base = testEnv();
  const env: Bindings = { ...base.env, ...overrides };
  // Browsers send Origin on every non-GET request, and csrf() refuses a
  // body-less one (a DELETE) without it. The typed client does the same.
  const client = testClient(app, env, base.ctx, {
    headers: { origin: ORIGIN },
  });
  const request = (path: string, init: RequestInit = {}) =>
    app.request(path, init, env, base.ctx);
  const post = (
    path: string,
    body: unknown,
    headers: Record<string, string> = {}
  ) =>
    request(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        ...headers,
      },
      body: JSON.stringify(body),
    });

  const sendCode = (email: string, headers: Record<string, string> = {}) =>
    post(
      "/api/auth/email-otp/send-verification-otp",
      { email, type: "sign-in" },
      headers
    );

  function lastCode(email: string) {
    const message = mail.sent.findLast((sent) => sent.to === email);
    if (!message) throw new Error(`no code was sent to ${email}`);
    return message.code;
  }

  async function signIn(email = uniqueEmail()) {
    await sendCode(email);
    const res = await post("/api/auth/sign-in/email-otp", {
      email,
      otp: lastCode(email),
    });
    if (!res.ok) throw new Error(`sign-in failed with ${res.status}`);
    return { email, cookie: cookieFrom(res) };
  }

  return {
    app,
    env,
    client,
    request,
    post,
    sendCode,
    lastCode,
    signIn,
    mail,
    settle: base.settle,
  };
}
