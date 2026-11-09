import { createMiddleware } from "hono/factory";
import { type Auth, createAuth } from "../auth";
import { isBreached } from "../auth/password";
import type { AppEnv } from "../env";
import type { CodeMailer } from "../mail/mailer";
import { claimCodeForAddress, claimDailyEmail } from "../services/email-budget";

/**
 * Supplies Better Auth for this request, built the first time something
 * asks for it: building it is most of a cold request's CPU, and signed-out
 * visitors never need it. Runs after withMailer.
 *
 * In production a code email (sign-in, confirmation or reset) first takes
 * its place in two limits: three per address in ten minutes, and the day's
 * email budget. It claims before Better Auth makes the code, so a refused
 * request leaves the last code sent working, and the /auth route says which
 * limit refused it. New passwords are checked against Have I Been Pwned in
 * production only, so development and tests never call it.
 */
export const withAuth = createMiddleware<AppEnv>(async (c, next) => {
  const mail: AppEnv["Variables"]["mail"] = { failed: false };
  async function claimCode(email: string) {
    if (c.env.ENVIRONMENT !== "production") return true;
    if (!(await claimCodeForAddress(c.var.db, email))) {
      mail.refused = "CODE_LIMIT";
      return false;
    }
    if (!(await claimDailyEmail(c.var.db, "code"))) {
      mail.refused = "EMAIL_BUDGET";
      return false;
    }
    return true;
  }
  const codes: CodeMailer = {
    async sendCode(message) {
      try {
        await c.var.mailer.sendCode(message);
      } catch (err) {
        // Better Auth logs the error but still answers 200, so remember it
        // for the /auth route to report.
        mail.failed = true;
        throw err;
      }
    },
  };
  c.set("mail", mail);
  // Loaded only where it's used: see worker/auth/passkeys.ts. Only a
  // dynamic import keeps it out of every other request's startup.
  const passkeys = c.req.path.startsWith("/api/auth/passkey/")
    ? (await import("../auth/passkeys")).passkeyPlugin(c.env)
    : undefined;
  let auth: Auth | undefined;
  c.set("auth", () => {
    auth ??= createAuth({
      db: c.var.db,
      env: c.env,
      mailer: codes,
      claimCode,
      checkBreach: c.env.ENVIRONMENT === "production" ? isBreached : undefined,
      passkeys,
    });
    return auth;
  });
  await next();
});
