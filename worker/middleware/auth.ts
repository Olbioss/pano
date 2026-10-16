import { createMiddleware } from "hono/factory";
import { createAuth } from "../auth";
import type { AppEnv } from "../env";
import { type Mailer, mailerFor } from "../mail/mailer";

/**
 * Builds Better Auth for this request. The mailer is picked only when a code
 * is actually sent, so a missing Brevo key can't break unrelated routes.
 */
export const withAuth = (mailer?: Mailer) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const lazyMailer: Mailer = {
      sendSignInCode: (message) =>
        (mailer ?? mailerFor(c.env)).sendSignInCode(message),
    };
    c.set("auth", createAuth({ db: c.var.db, env: c.env, mailer: lazyMailer }));
    await next();
  });
