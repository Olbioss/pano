import { createMiddleware } from "hono/factory";
import { createAuth } from "../auth";
import type { AppEnv } from "../env";
import { type CodeMailer, mailerFor } from "../mail/mailer";
import { claimCodeForAddress, claimDailyEmail } from "../services/email-budget";

/**
 * Builds Better Auth for this request. The mailer is picked only when a code
 * is actually sent, so a missing Brevo key can't break unrelated routes.
 *
 * In production a code first takes its place in two limits: three per
 * address in ten minutes, and the day's email budget. A code either limit
 * refuses isn't sent, and the /auth route says which one.
 */
export const withAuth = (mailer?: CodeMailer) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const mail: AppEnv["Variables"]["mail"] = { failed: false };
    const lazyMailer: CodeMailer = {
      async sendSignInCode(message) {
        if (c.env.ENVIRONMENT === "production") {
          if (!(await claimCodeForAddress(c.var.db, message.to))) {
            mail.refused = "CODE_LIMIT";
            return;
          }
          if (!(await claimDailyEmail(c.var.db, "code"))) {
            mail.refused = "EMAIL_BUDGET";
            return;
          }
        }
        try {
          await (mailer ?? mailerFor(c.env)).sendSignInCode(message);
        } catch (err) {
          // Better Auth logs the error but still answers 200, so remember it
          // for the /auth route to report.
          mail.failed = true;
          throw err;
        }
      },
    };
    c.set("mail", mail);
    c.set("auth", createAuth({ db: c.var.db, env: c.env, mailer: lazyMailer }));
    await next();
  });
