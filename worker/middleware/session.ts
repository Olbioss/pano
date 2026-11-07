import { getCookieCache, getSessionCookie } from "better-auth/cookies";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { AppEnv, Bindings } from "../env";
import { AppError } from "../lib/errors";

export type SessionUser = { id: string; name: string; email: string };

export type UserEnv = {
  Bindings: Bindings;
  Variables: AppEnv["Variables"] & { user: SessionUser };
};

/**
 * The request's session, or null. Without a session cookie it's null at
 * once, and a valid five-minute cache cookie answers by itself: neither
 * builds Better Auth. Otherwise Better Auth reads it, which can renew it: a
 * fresh cache cookie, a later expiry for someone who keeps using the app.
 * Called through auth.api those cookies would be dropped, so they're passed
 * on to this response.
 */
export async function readSession(
  c: Pick<Context<AppEnv>, "req" | "header" | "env"> & {
    var: Pick<AppEnv["Variables"], "auth">;
  }
) {
  const token = getSessionCookie(c.req.raw.headers);
  // No session cookie: signed out, without building Better Auth.
  if (!token) return null;
  const cached = await cachedSession(c.req.raw.headers, token, c.env);
  if (cached) return cached;
  const { headers, response } = await c.var.auth().api.getSession({
    headers: c.req.raw.headers,
    returnHeaders: true,
  });
  for (const cookie of headers.getSetCookie()) {
    c.header("set-cookie", cookie, { append: true });
  }
  return response;
}

/**
 * The session from Better Auth's five-minute cache cookie, checked the way
 * Better Auth checks it: signed with the secret, not expired, and for the
 * token this request carries. null sends the request through Better Auth.
 */
async function cachedSession(
  headers: Headers,
  signedToken: string,
  env: Pick<Bindings, "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL">
) {
  const cache = await getCookieCache(headers, {
    secret: env.BETTER_AUTH_SECRET,
    isSecure: env.BETTER_AUTH_URL.startsWith("https://"),
  });
  if (!cache) return null;
  const value = decodeURIComponent(signedToken);
  const dot = value.lastIndexOf(".");
  if (dot === -1 || value.slice(0, dot) !== cache.session.token) return null;
  return cache;
}

/** Answers 401 unless the request carries a valid session; sets c.var.user. */
export const requireUser = createMiddleware<UserEnv>(async (c, next) => {
  const session = await readSession(c);
  if (!session) throw new AppError(401, "UNAUTHORIZED", "Sign in first");
  const { id, name, email } = session.user;
  c.set("user", { id, name, email });
  await next();
});

/** The signed-in person's id, or null: for routes anyone may call. */
export async function readViewerId(c: Parameters<typeof readSession>[0]) {
  return (await readSession(c))?.user.id ?? null;
}
