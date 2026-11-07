import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { EVERY_FIVE_MINUTES, NIGHTLY, runScheduled } from "./cron";
import { createDb } from "./db/client";
import { emailCounters } from "./db/schema";
import { changelogKey } from "./services/changelog";
import type { resetDemo } from "./services/demo-reset";
import {
  markOutboxPending,
  OUTBOX_BATCH,
  OUTBOX_PAUSED,
  OUTBOX_PENDING,
  OUTBOX_RETRY,
  pauseOutboxUntilTomorrow,
  type sendQueuedEmails,
} from "./services/outbox";
import { capturingMailer } from "./test/app";
import { testEnv } from "./test/env";

const nothingToSend = () =>
  vi.fn<typeof sendQueuedEmails>(async () => ({ sent: 0, failed: 0 }));
const fakeReset = () =>
  vi.fn<typeof resetDemo>(async () => ({ posts: 0, votes: 0, comments: 0 }));

/** Bindings whose database can't be reached: any connection would fail. */
function offlineEnv() {
  const { env } = testEnv();
  return {
    ...env,
    HYPERDRIVE: { connectionString: "postgresql://nobody@127.0.0.1:1/none" },
  };
}

describe("runScheduled", () => {
  it("sends queued emails every five minutes once a flag says some wait, linking to this app", async () => {
    const { env } = testEnv();
    await markOutboxPending(env.FLAGS);
    const send = nothingToSend();
    const { mailer } = capturingMailer();
    await runScheduled(EVERY_FIVE_MINUTES, env, { mailer, send });
    expect(send).toHaveBeenCalledOnce();
    const [, usedMailer, options] = send.mock.calls[0]!;
    expect(usedMailer).toBe(mailer);
    expect(options).toEqual({ origin: "http://localhost", budget: false });
  });

  it("leaves the database alone when no flag is up", async () => {
    const env = offlineEnv();
    const send = nothingToSend();
    await runScheduled(EVERY_FIVE_MINUTES, env, { send });
    expect(send).not.toHaveBeenCalled();
    expect(await env.FLAGS.get(OUTBOX_PENDING)).toBeNull();
  });

  it("draws on the day's email budget in production", async () => {
    const { env } = testEnv();
    await markOutboxPending(env.FLAGS);
    const send = nothingToSend();
    const production = { ...env, ENVIRONMENT: "production" };
    await runScheduled(EVERY_FIVE_MINUTES, production, {
      mailer: capturingMailer().mailer,
      send,
    });
    expect(send.mock.calls[0]![2]).toMatchObject({ budget: true });
  });

  it("pauses until the next UTC day once the day's email is spent", async () => {
    const { env } = testEnv();
    await markOutboxPending(env.FLAGS);
    const put = vi.spyOn(env.FLAGS, "put");
    const send = vi.fn<typeof sendQueuedEmails>(async () => ({
      sent: 2,
      failed: 0,
      budgetSpent: true,
    }));
    const logged = vi.spyOn(console, "log").mockImplementation(() => {});
    await runScheduled(EVERY_FIVE_MINUTES, env, { send });
    logged.mockRestore();
    expect(put).toHaveBeenCalledOnce();
    expect(put.mock.calls[0]![0]).toBe(OUTBOX_PAUSED);
    const expiration = put.mock.calls[0]![2]?.expiration ?? 0;
    expect(expiration * 1000).toBeGreaterThan(Date.now());
    expect(expiration * 1000).toBeLessThanOrEqual(Date.now() + 86_400_000);
  });

  it("leaves the database alone while the day's email is spent", async () => {
    const env = offlineEnv();
    await markOutboxPending(env.FLAGS);
    await pauseOutboxUntilTomorrow(env.FLAGS);
    const send = nothingToSend();
    await runScheduled(EVERY_FIVE_MINUTES, env, { send });
    expect(send).not.toHaveBeenCalled();
  });

  it("drops the demo's cached feed once the reset rebuilt it", async () => {
    const { env } = testEnv();
    await env.FLAGS.put(changelogKey("demo"), "stale");
    const logged = vi.spyOn(console, "log").mockImplementation(() => {});
    await runScheduled(NIGHTLY, env, {
      send: nothingToSend(),
      reset: fakeReset(),
    });
    logged.mockRestore();
    expect(await env.FLAGS.get(changelogKey("demo"))).toBeNull();
  });

  it("prunes old email counters every night", async () => {
    const { env } = testEnv();
    const { db, close } = createDb(env.HYPERDRIVE.connectionString);
    await db.insert(emailCounters).values({
      key: "cron-test",
      windowStart: new Date(Date.now() - 3 * 86_400_000),
      count: 1,
    });
    await runScheduled(NIGHTLY, env, {
      send: nothingToSend(),
      reset: fakeReset(),
    });
    const left = await db
      .select()
      .from(emailCounters)
      .where(eq(emailCounters.key, "cron-test"));
    await close();
    expect(left).toEqual([]);
  });

  it("resets the demo every night, then sends what's queued", async () => {
    const send = nothingToSend();
    const reset = fakeReset();
    await runScheduled(NIGHTLY, testEnv().env, { send, reset });
    expect(reset).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledOnce();
  });

  it("still sends the night's emails when the reset fails", async () => {
    const send = nothingToSend();
    const reset = vi.fn<typeof resetDemo>(async () => {
      throw new Error("demo reset broke");
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await runScheduled(NIGHTLY, testEnv().env, { send, reset });
    expect(send).toHaveBeenCalledOnce();
    expect(logged).toHaveBeenCalledWith(
      "[demo] reset failed:",
      expect.any(Error)
    );
    logged.mockRestore();
  });

  it("keeps the flag up after a full batch, so the rest go out five minutes later", async () => {
    const { env } = testEnv();
    await markOutboxPending(env.FLAGS);
    const put = vi.spyOn(env.FLAGS, "put");
    const send = vi.fn<typeof sendQueuedEmails>(async () => ({
      sent: OUTBOX_BATCH,
      failed: 0,
    }));
    await runScheduled(EVERY_FIVE_MINUTES, env, { send });
    expect(put).toHaveBeenCalledWith(OUTBOX_PENDING, "1", {
      expirationTtl: 1800,
    });
  });

  it("notes when a failed email's next try is due, instead of keeping the flag up", async () => {
    const { env } = testEnv();
    await markOutboxPending(env.FLAGS);
    const put = vi.spyOn(env.FLAGS, "put");
    const due = new Date(Date.now() + 5 * 60_000);
    const send = vi.fn<typeof sendQueuedEmails>(async () => ({
      sent: 3,
      failed: 2,
      nextRetryAt: due,
    }));
    await runScheduled(EVERY_FIVE_MINUTES, env, { send });
    expect(put).toHaveBeenCalledExactlyOnceWith(
      OUTBOX_RETRY,
      String(due.getTime()),
      { expiration: Math.ceil((due.getTime() + 30 * 60_000) / 1000) }
    );
  });

  it("leaves the database alone until a retry is due", async () => {
    const env = offlineEnv();
    await env.FLAGS.put(OUTBOX_RETRY, String(Date.now() + 60_000));
    const send = nothingToSend();
    await runScheduled(EVERY_FIVE_MINUTES, env, { send });
    expect(send).not.toHaveBeenCalled();
  });

  it("sends once a retry is due, and clears the note when nothing waits", async () => {
    const { env } = testEnv();
    await env.FLAGS.put(OUTBOX_RETRY, String(Date.now() - 1000));
    const send = vi.fn<typeof sendQueuedEmails>(async () => ({
      sent: 1,
      failed: 0,
    }));
    await runScheduled(EVERY_FIVE_MINUTES, env, { send });
    expect(send).toHaveBeenCalledOnce();
    expect(await env.FLAGS.get(OUTBOX_RETRY)).toBeNull();
  });

  it("lets the flag lapse once a run leaves nothing behind", async () => {
    const { env } = testEnv();
    await markOutboxPending(env.FLAGS);
    const put = vi.spyOn(env.FLAGS, "put");
    const send = vi.fn<typeof sendQueuedEmails>(async () => ({
      sent: 3,
      failed: 0,
    }));
    await runScheduled(EVERY_FIVE_MINUTES, env, { send });
    expect(put).not.toHaveBeenCalled();
  });

  it("hands a full nightly batch on to the five-minute cron", async () => {
    const { env } = testEnv();
    const put = vi.spyOn(env.FLAGS, "put");
    const send = vi.fn<typeof sendQueuedEmails>(async () => ({
      sent: OUTBOX_BATCH,
      failed: 0,
    }));
    await runScheduled(NIGHTLY, env, { send, reset: fakeReset() });
    expect(put).toHaveBeenCalledOnce();
  });

  it("ignores other triggers", async () => {
    const send = nothingToSend();
    const reset = fakeReset();
    await runScheduled("0 12 * * *", testEnv().env, { send, reset });
    expect(send).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });
});
