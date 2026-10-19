import { asc, eq, inArray, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { emailOutbox, user as users } from "../db/schema";
import type { Mailer, ShippedNotice } from "../mail/mailer";
import { capturingMailer, testApp } from "../test/app";
import { testDb } from "../test/db";
import { setupWorkspace, submitPost } from "../test/fixtures";
import { sendQueuedEmails } from "./outbox";

const { db, close } = testDb();
afterAll(() => close());

const ORIGIN = "http://localhost";

/** A post with a Shipped email queued for each of `people` new accounts. */
async function queued(people: number) {
  const t = testApp();
  const { owner, slug, boards } = await setupWorkspace(t);
  const post = await submitPost(t, owner.cookie, slug, {
    boardId: boards[0]!.id,
    title: "Dark mode",
  });
  const emails: string[] = [];
  for (let i = 0; i < people; i++) emails.push((await t.signIn()).email);
  await t.settle();
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.email, emails));
  await db.insert(emailOutbox).values(
    rows.map((row) => ({
      userId: row.id,
      postId: post.id,
      kind: "shipped" as const,
      payload: {
        title: "Dark mode",
        ref: `${post.id}-dark-mode`,
        workspaceName: "Acme",
        locale: "en" as const,
        note: null,
      },
    }))
  );
  return { postId: post.id, emails: emails.sort() };
}

const rowsOf = (postId: number) =>
  db
    .select({
      id: emailOutbox.id,
      sentAt: emailOutbox.sentAt,
      attempts: emailOutbox.attempts,
      lastError: emailOutbox.lastError,
      claimedAt: emailOutbox.claimedAt,
    })
    .from(emailOutbox)
    .where(eq(emailOutbox.postId, postId))
    .orderBy(asc(emailOutbox.id));

const failing: Mailer = {
  ...capturingMailer().mailer,
  async sendShipped() {
    throw new Error("Brevo is down");
  },
};

describe("sendQueuedEmails", () => {
  it("sends each queued email once, with a link to the post", async () => {
    const { postId, emails } = await queued(2);
    const mail = capturingMailer();
    const run = (options = { origin: ORIGIN, postIds: [postId] }) =>
      sendQueuedEmails(db, mail.mailer, options);
    expect(await run()).toEqual({ sent: 2, failed: 0 });
    expect(mail.shipped.map((notice) => notice.to).sort()).toEqual(emails);
    expect(mail.shipped[0]).toMatchObject({
      title: "Dark mode",
      url: `http://localhost/p/${postId}-dark-mode`,
      locale: "en",
      workspaceName: "Acme",
      note: null,
    });
    expect((await rowsOf(postId)).every((row) => row.sentAt !== null)).toBe(
      true
    );
    expect(await run()).toEqual({ sent: 0, failed: 0 });
    expect(mail.shipped).toHaveLength(2);
  });

  it("tries a failed email again on later runs, five times at most", async () => {
    const { postId } = await queued(1);
    const options = { origin: ORIGIN, postIds: [postId] };
    for (let run = 1; run <= 5; run++) {
      expect(await sendQueuedEmails(db, failing, options)).toEqual({
        sent: 0,
        failed: 1,
      });
    }
    expect(await rowsOf(postId)).toMatchObject([
      {
        sentAt: null,
        attempts: 5,
        lastError: "Brevo is down",
        claimedAt: null,
      },
    ]);
    const mail = capturingMailer();
    expect(await sendQueuedEmails(db, mail.mailer, options)).toEqual({
      sent: 0,
      failed: 0,
    });
    expect(mail.shipped).toEqual([]);
  });

  it("sends each email once when two runs overlap", async () => {
    const { postId, emails } = await queued(4);
    const second = testDb();
    const delivered: string[] = [];
    const slow: Mailer = {
      ...capturingMailer().mailer,
      async sendShipped(notice: ShippedNotice) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        delivered.push(notice.to);
      },
    };
    const options = { origin: ORIGIN, postIds: [postId], batch: 4 };
    const runs = await Promise.all([
      sendQueuedEmails(db, slow, options),
      sendQueuedEmails(second.db, slow, options),
    ]);
    await second.close();
    expect(runs[0].sent + runs[1].sent).toBe(4);
    expect(delivered.sort()).toEqual(emails);
  });

  it("sends an email left claimed by a run that died, once the claim lapses", async () => {
    const { postId } = await queued(2);
    const [stale, fresh] = await rowsOf(postId);
    await db
      .update(emailOutbox)
      .set({ claimedAt: sql`now() - interval '11 minutes'`, attempts: 1 })
      .where(eq(emailOutbox.id, stale!.id));
    await db
      .update(emailOutbox)
      .set({ claimedAt: sql`now()`, attempts: 1 })
      .where(eq(emailOutbox.id, fresh!.id));
    const mail = capturingMailer();
    expect(
      await sendQueuedEmails(db, mail.mailer, {
        origin: ORIGIN,
        postIds: [postId],
      })
    ).toEqual({ sent: 1, failed: 0 });
    const after = await rowsOf(postId);
    expect(after.map((row) => row.sentAt !== null)).toEqual([true, false]);
  });

  it("sends at most a batch a run, oldest first", async () => {
    const { postId } = await queued(3);
    const mail = capturingMailer();
    const options = { origin: ORIGIN, postIds: [postId], batch: 2 };
    expect(await sendQueuedEmails(db, mail.mailer, options)).toEqual({
      sent: 2,
      failed: 0,
    });
    expect((await rowsOf(postId)).map((row) => row.sentAt !== null)).toEqual([
      true,
      true,
      false,
    ]);
    expect(await sendQueuedEmails(db, mail.mailer, options)).toEqual({
      sent: 1,
      failed: 0,
    });
  });
});
