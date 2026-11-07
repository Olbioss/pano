import { DEMO_WORKSPACE_SLUG } from "@/shared/demo";
import { createDb, type Database } from "./db/client";
import type { Bindings } from "./env";
import { type Mailer, mailerFor } from "./mail/mailer";
import { dropChangelog } from "./services/changelog";
import { resetDemo } from "./services/demo-reset";
import { pruneEmailCounters } from "./services/email-budget";
import {
  markOutboxPending,
  markOutboxRetry,
  OUTBOX_BATCH,
  OUTBOX_PAUSED,
  OUTBOX_PENDING,
  OUTBOX_RETRY,
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
 *   or once a failed email's next try is due, and puts the flag back up
 *   while a full batch left some behind. Once the day's email is spent, a
 *   third flag keeps it from connecting until the next UTC day.
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
    const pending = await env.FLAGS.get(OUTBOX_PENDING);
    const retry = await env.FLAGS.get(OUTBOX_RETRY);
    if (!pending && !(retry && Number(retry) <= Date.now())) return;
    await withDb(env, (db) =>
      sendOutbox(db, env, mailer, send, retry !== null)
    );
  } else if (cron === NIGHTLY) {
    await withDb(env, async (db) => {
      try {
        const demo = await reset(db);
        console.log(
          `[demo] reset: ${demo.posts} requests, ${demo.votes} votes, ${demo.comments} comments`
        );
        // Its shipped requests were rebuilt: the next feed reader gets them.
        await dropChangelog(env.FLAGS, DEMO_WORKSPACE_SLUG);
      } catch (error) {
        console.error("[demo] reset failed:", error);
      }
      try {
        await pruneEmailCounters(db);
      } catch (error) {
        console.error("[email] pruning counters failed:", error);
      }
      const retry = await env.FLAGS.get(OUTBOX_RETRY);
      await sendOutbox(db, env, mailer, send, retry !== null);
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

/** `retryNoted`: OUTBOX_RETRY was set, so a run that leaves none clears it. */
async function sendOutbox(
  db: Database,
  env: Bindings,
  mailer: Mailer | undefined,
  send: typeof sendQueuedEmails,
  retryNoted: boolean
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
  // A full batch may have left more behind: keep the five-minute cron
  // looking. One KV write a run, only while emails are waiting.
  if (result.sent + result.failed >= OUTBOX_BATCH) {
    await markOutboxPending(env.FLAGS);
  }
  // A failed email waits for its next try; until then the cron reads KV.
  if (result.nextRetryAt) await markOutboxRetry(env.FLAGS, result.nextRetryAt);
  else if (retryNoted) await env.FLAGS.delete(OUTBOX_RETRY);
}
