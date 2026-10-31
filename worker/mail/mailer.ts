import type { Locale } from "@/shared/locale";
import type { Bindings } from "../env";
import {
  type InvitationNotice,
  invitationEmail,
  type ShippedNotice,
  shippedEmail,
  signInCodeEmail,
} from "./templates";

export type { InvitationNotice, ShippedNotice } from "./templates";

export type SignInCode = { to: string; code: string; locale: Locale };

export interface Mailer {
  sendSignInCode(message: SignInCode): Promise<void>;
  sendShipped(message: ShippedNotice): Promise<void>;
  sendInvitation(message: InvitationNotice): Promise<void>;
}

/** What sign-in needs from a mailer. */
export type CodeMailer = Pick<Mailer, "sendSignInCode">;

/** What the API's routes send: sign-in codes and invitations. */
export type AppMailer = Pick<Mailer, "sendSignInCode" | "sendInvitation">;

/** Local dev: emails go to the terminal instead of an inbox. */
export const consoleMailer: Mailer = {
  async sendSignInCode({ to, code }) {
    console.log(`[mail] sign-in code for ${to}: ${code}`);
  },
  async sendShipped({ to, title, url }) {
    console.log(`[mail] shipped notice for ${to}: ${title} ${url}`);
  },
  async sendInvitation({ to, url }) {
    console.log(`[mail] invitation for ${to}: ${url}`);
  },
};

export type SendFn = (url: string, init: RequestInit) => Promise<Response>;

/** How long a Brevo call may take before it's given up. */
export const BREVO_TIMEOUT_MS = 10_000;

/** Brevo's transactional email API (its free tier allows 300 emails a day). */
export function brevoMailer(
  apiKey: string,
  from: string,
  send: SendFn = (url, init) => fetch(url, init),
  timeoutMs = BREVO_TIMEOUT_MS
): Mailer {
  async function deliver(
    to: string,
    { subject, text, html }: { subject: string; text: string; html: string }
  ) {
    const res = await send("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      // A stuck call would hold up the request or the cron run, and past
      // the outbox's ten-minute claim another run could send it again.
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: "Pano", email: from },
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html,
      }),
    });
    if (!res.ok) {
      throw new Error(
        `Brevo refused the email: ${res.status} ${await res.text()}`
      );
    }
  }
  return {
    sendSignInCode: ({ to, code, locale }) =>
      deliver(to, signInCodeEmail(code, locale)),
    sendShipped: (message) => deliver(message.to, shippedEmail(message)),
    sendInvitation: (message) => deliver(message.to, invitationEmail(message)),
  };
}

export type MailEnv = Pick<
  Bindings,
  "ENVIRONMENT" | "BREVO_API_KEY" | "MAIL_FROM"
>;

/**
 * Production sends through Brevo. Without a key, local dev prints codes; a
 * production deploy without one fails loudly rather than logging codes.
 */
export function mailerFor(env: MailEnv): Mailer {
  if (env.BREVO_API_KEY) {
    if (!env.MAIL_FROM) throw new Error("MAIL_FROM is not set");
    return brevoMailer(env.BREVO_API_KEY, env.MAIL_FROM);
  }
  if (env.ENVIRONMENT === "production") {
    throw new Error("BREVO_API_KEY is not set");
  }
  return consoleMailer;
}
