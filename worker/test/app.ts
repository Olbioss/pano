import { testClient } from "hono/testing";
import type { DemoRole } from "@/shared/demo";
import { createApp } from "../app";
import type { Bindings } from "../env";
import type {
  CodeKind,
  CodeMessage,
  InvitationNotice,
  Mailer,
  ShippedNotice,
} from "../mail/mailer";
import { testEnv } from "./env";

/** Matches BETTER_AUTH_URL in testEnv, so Better Auth trusts the requests. */
export const ORIGIN = "http://localhost";

/** A mailer that keeps what it would have sent, so tests can read it. */
export function capturingMailer() {
  const sent: CodeMessage[] = [];
  const shipped: ShippedNotice[] = [];
  const invited: InvitationNotice[] = [];
  const mailer: Mailer = {
    async sendCode(message) {
      sent.push(message);
    },
    async sendShipped(message) {
      shipped.push(message);
    },
    async sendInvitation(message) {
      invited.push(message);
    },
  };
  return { mailer, sent, shipped, invited };
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

  function lastCode(email: string, kind?: CodeKind) {
    const message = mail.sent.findLast(
      (sent) => sent.to === email && (!kind || sent.kind === kind)
    );
    if (!message) throw new Error(`no ${kind ?? ""} code was sent to ${email}`);
    return message.code;
  }

  /** Password sign-up: the account waits for its confirmation code. */
  const signUp = (
    email: string,
    password: string,
    headers: Record<string, string> = {}
  ) => post("/api/auth/sign-up/email", { email, password, name: "" }, headers);

  /** Enters a confirmation code, with the password the sign-up page holds. */
  const confirm = (
    email: string,
    otp: string,
    password?: string,
    headers: Record<string, string> = {}
  ) =>
    post("/api/auth/email-otp/verify-email", { email, otp, password }, headers);

  const signInWithPassword = (
    email: string,
    password: string,
    headers: Record<string, string> = {}
  ) => post("/api/auth/sign-in/email", { email, password }, headers);

  /**
   * A confirmed password account, signed in: its email and cookie.
   * `headers`: a production test gives its own client address.
   */
  async function signUpConfirmed(
    email = uniqueEmail(),
    password = "correct horse battery",
    headers: Record<string, string> = {}
  ) {
    const res = await signUp(email, password, headers);
    if (!res.ok) throw new Error(`sign-up failed with ${res.status}`);
    const confirmed = await confirm(
      email,
      lastCode(email, "confirm"),
      password,
      headers
    );
    if (!confirmed.ok)
      throw new Error(`confirming failed with ${confirmed.status}`);
    return { email, password, cookie: cookieFrom(confirmed) };
  }

  /** `headers`: a production test gives its own client address. */
  async function signIn(
    email = uniqueEmail(),
    headers: Record<string, string> = {}
  ) {
    await sendCode(email, headers);
    const res = await post(
      "/api/auth/sign-in/email-otp",
      { email, otp: lastCode(email) },
      headers
    );
    if (!res.ok) throw new Error(`sign-in failed with ${res.status}`);
    return { email, cookie: cookieFrom(res) };
  }

  /** "Try as team" or "Try as member": a new guest account and its cookie. */
  async function signInDemo(
    as: DemoRole,
    headers: Record<string, string> = {}
  ) {
    const res = await post("/api/auth/demo/sign-in", { as }, headers);
    if (!res.ok) throw new Error(`demo sign-in failed with ${res.status}`);
    const body = (await res.json()) as { name: string; team: boolean };
    return { cookie: cookieFrom(res), ...body };
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
    signInDemo,
    signUp,
    confirm,
    signInWithPassword,
    signUpConfirmed,
    mail,
    settle: base.settle,
  };
}
