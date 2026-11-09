import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";
import { type AppMailer, mailerFor } from "../mail/mailer";

/**
 * The request's mailer. Tests pass their own; otherwise it picks Brevo or
 * the console on first use, so a missing Brevo key can't break routes that
 * send nothing.
 */
export const withMailer = (mailer?: AppMailer) =>
  createMiddleware<AppEnv>(async (c, next) => {
    c.set(
      "mailer",
      mailer ?? {
        sendCode: (message) => mailerFor(c.env).sendCode(message),
        sendInvitation: (message) => mailerFor(c.env).sendInvitation(message),
      }
    );
    await next();
  });
