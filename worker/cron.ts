import { createDb, type Database } from "./db/client";
import type { Bindings } from "./env";
import { type Mailer, mailerFor } from "./mail/mailer";
import { resetDemo } from "./services/demo-reset";
import { pruneEmailCounters } from "./services/email-budget";
import {
  markOutboxPending,
  OUTBOX_BATCH,
  OUTBOX_PAUSED,
  OUTBOX_PENDING,
  pauseOutboxUntilTomorrow,
  sendQueuedEmails,
} from "./services/outbox";

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
 *   The cron connects only while a status change's flag says emails wait,
 *   and puts the flag back up while some are left. Once the day's email is
 *   spent, a second flag keeps it from connecting until the next UTC day.
 * - Every night: reset the demo workspace, prune old email counters, then
 *   send whatever is queued, in case a flag was lost.
 */
export async function runScheduled(
  cron: string,
  env: Bindings,
  { mailer, send = sendQueuedEmails, reset = resetDemo }: CronDeps = {}
) {
  if (cron === EVERY_FIVE_MINUTES) {
    if (await env.FLAGS.get(OUTBOX_PAUSED)) return;
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
      try {
        await pruneEmailCounters(db);
      } catch (error) {
        console.error("[email] pruning counters failed:", error);
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
    budget: env.ENVIRONMENT === "production",
  });
  if (result.sent + result.failed > 0) {
    console.log(`[outbox] sent ${result.sent}, failed ${result.failed}`);
  }
  if (result.budgetSpent) {
    console.log("[outbox] the day's email is spent; waiting for tomorrow");
    await pauseOutboxUntilTomorrow(env.FLAGS);
    return;
  }
  // A full batch may have left more behind, and a failed email gets another
  // try: keep the five-minute cron looking. One KV write a run, only while
  // emails are waiting.
  if (result.sent + result.failed >= OUTBOX_BATCH || result.failed > 0) {
    await markOutboxPending(env.FLAGS);
  }
}
