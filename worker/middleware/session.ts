import { createMiddleware } from "hono/factory";
import type { AppEnv, Bindings } from "../env";
import { AppError } from "../lib/errors";

export type SessionUser = { id: string; name: string; email: string };

export type UserEnv = {
  Bindings: Bindings;
  Variables: AppEnv["Variables"] & { user: SessionUser };
};

/** Answers 401 unless the request carries a valid session; sets c.var.user. */
export const requireUser = createMiddleware<UserEnv>(async (c, next) => {
  const session = await c.var.auth.api.getSession({
    headers: c.req.raw.headers,
  });
  if (!session) throw new AppError(401, "UNAUTHORIZED", "Sign in first");
  const { id, name, email } = session.user;
  c.set("user", { id, name, email });
  await next();
});
