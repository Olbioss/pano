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
 * The request's session, or null. Reading it can renew it: a fresh cache
 * cookie after the five-minute one runs out, a later expiry for someone who
 * keeps using the app. Called through auth.api those cookies would be
 * dropped, so they're passed on to this response.
 */
export async function readSession(
  c: Pick<Context<AppEnv>, "req" | "header"> & {
    var: Pick<AppEnv["Variables"], "auth">;
  }
) {
  const { headers, response } = await c.var.auth.api.getSession({
    headers: c.req.raw.headers,
    returnHeaders: true,
  });
  for (const cookie of headers.getSetCookie()) {
    c.header("set-cookie", cookie, { append: true });
  }
  return response;
}

/** Answers 401 unless the request carries a valid session; sets c.var.user. */
export const requireUser = createMiddleware<UserEnv>(async (c, next) => {
  const session = await readSession(c);
  if (!session) throw new AppError(401, "UNAUTHORIZED", "Sign in first");
  const { id, name, email } = session.user;
  c.set("user", { id, name, email });
  await next();
});
