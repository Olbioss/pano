import { createDb, type Database } from "./db/client";
import type { Bindings } from "./env";
import { type Mailer, mailerFor } from "./mail/mailer";
import { resetDemo } from "./services/demo-reset";
import { OUTBOX_PENDING, sendQueuedEmails } from "./services/outbox";

/** The triggers in wrangler.jsonc. */
export const EVERY_FIVE_MINUTES = "*/5 * * * *";
export const NIGHTLY = "0 1 * * *";

type CronDeps = {
  mailer?: Mailer;
  send?: typeof sendQueuedEmails;
  reset?: typeof resetDemo;
};

/**
 * What a cron trigger does, kept free of Workers globals so it runs under
 * Node in tests.
 *
 * - Every five minutes: send queued emails. Neon's free plan counts the
 *   hours its database is awake, and the database sleeps after five quiet
 *   minutes, so a query every five minutes would keep it awake all month.
 *   The cron connects only while a status change's flag says emails wait.
 * - Every night: reset the demo workspace, then send whatever is queued, in
 *   case a flag was lost.
 */
export async function runScheduled(
  cron: string,
  env: Bindings,
  { mailer, send = sendQueuedEmails, reset = resetDemo }: CronDeps = {}
) {
  if (cron === EVERY_FIVE_MINUTES) {
    if (!(await env.FLAGS.get(OUTBOX_PENDING))) return;
    await withDb(env, (db) => sendOutbox(db, env, mailer, send));
  } else if (cron === NIGHTLY) {
    await withDb(env, async (db) => {
      try {
        const demo = await reset(db);
        console.log(
          `[demo] reset: ${demo.posts} requests, ${demo.votes} votes, ${demo.comments} comments`
        );
      } catch (error) {
        console.error("[demo] reset failed:", error);
      }
      await sendOutbox(db, env, mailer, send);
    });
  }
}

async function withDb(env: Bindings, run: (db: Database) => Promise<void>) {
  const { db, close } = createDb(env.HYPERDRIVE.connectionString);
  try {
    await run(db);
  } finally {
    await close();
  }
}

async function sendOutbox(
  db: Database,
  env: Bindings,
  mailer: Mailer | undefined,
  send: typeof sendQueuedEmails
) {
  const result = await send(db, mailer ?? mailerFor(env), {
    origin: env.BETTER_AUTH_URL,
  });
  if (result.sent + result.failed > 0) {
    console.log(`[outbox] sent ${result.sent}, failed ${result.failed}`);
  }
}
