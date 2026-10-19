import { createDb } from "./db/client";
import type { Bindings } from "./env";
import { type Mailer, mailerFor } from "./mail/mailer";
import { sendQueuedEmails } from "./services/outbox";

/** The trigger in wrangler.jsonc that sends queued emails. */
export const EVERY_FIVE_MINUTES = "*/5 * * * *";

type CronDeps = {
  mailer?: Mailer;
  send?: typeof sendQueuedEmails;
};

/**
 * What a cron trigger does, kept free of Workers globals so it runs under
 * Node in tests: every five minutes, send queued emails.
 */
export async function runScheduled(
  cron: string,
  env: Bindings,
  { mailer, send = sendQueuedEmails }: CronDeps = {}
) {
  if (cron !== EVERY_FIVE_MINUTES) return;
  const { db, close } = createDb(env.HYPERDRIVE.connectionString);
  try {
    const result = await send(db, mailer ?? mailerFor(env), {
      origin: env.BETTER_AUTH_URL,
    });
    if (result.sent + result.failed > 0) {
      console.log(`[outbox] sent ${result.sent}, failed ${result.failed}`);
    }
  } finally {
    await close();
  }
}
