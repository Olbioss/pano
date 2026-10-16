import type { Locale } from "@/shared/locale";
import type { Bindings } from "../env";
import { signInCodeEmail } from "./templates";

export type SignInCode = { to: string; code: string; locale: Locale };

export interface Mailer {
  sendSignInCode(message: SignInCode): Promise<void>;
}

/** Local dev: the code goes to the terminal instead of an inbox. */
export const consoleMailer: Mailer = {
  async sendSignInCode({ to, code }) {
    console.log(`[mail] sign-in code for ${to}: ${code}`);
  },
};

export type SendFn = (url: string, init: RequestInit) => Promise<Response>;

/** Brevo's transactional email API (its free tier allows 300 emails a day). */
export function brevoMailer(
  apiKey: string,
  from: string,
  send: SendFn = (url, init) => fetch(url, init)
): Mailer {
  return {
    async sendSignInCode({ to, code, locale }) {
      const { subject, text, html } = signInCodeEmail(code, locale);
      const res = await send("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
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
    },
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
