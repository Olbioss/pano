import { describe, expect, it, vi } from "vitest";
import { EVERY_FIVE_MINUTES, runScheduled } from "./cron";
import type { sendQueuedEmails } from "./services/outbox";
import { capturingMailer } from "./test/app";
import { testEnv } from "./test/env";

const nothingToSend = () =>
  vi.fn<typeof sendQueuedEmails>(async () => ({ sent: 0, failed: 0 }));

describe("runScheduled", () => {
  it("sends queued emails every five minutes, linking to this app", async () => {
    const send = nothingToSend();
    const { mailer } = capturingMailer();
    await runScheduled(EVERY_FIVE_MINUTES, testEnv().env, { mailer, send });
    expect(send).toHaveBeenCalledOnce();
    const [, usedMailer, options] = send.mock.calls[0]!;
    expect(usedMailer).toBe(mailer);
    expect(options).toEqual({ origin: "http://localhost" });
  });

  it("ignores other triggers", async () => {
    const send = nothingToSend();
    await runScheduled("0 1 * * *", testEnv().env, { send });
    expect(send).not.toHaveBeenCalled();
  });
});
