import { describe, expect, it, vi } from "vitest";
import { EVERY_FIVE_MINUTES, NIGHTLY, runScheduled } from "./cron";
import type { resetDemo } from "./services/demo-reset";
import {
  markOutboxPending,
  OUTBOX_PENDING,
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
    expect(options).toEqual({ origin: "http://localhost" });
  });

  it("leaves the database alone when no flag is up", async () => {
    const env = offlineEnv();
    const send = nothingToSend();
    await runScheduled(EVERY_FIVE_MINUTES, env, { send });
    expect(send).not.toHaveBeenCalled();
    expect(await env.FLAGS.get(OUTBOX_PENDING)).toBeNull();
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

  it("ignores other triggers", async () => {
    const send = nothingToSend();
    const reset = fakeReset();
    await runScheduled("0 12 * * *", testEnv().env, { send, reset });
    expect(send).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });
});
