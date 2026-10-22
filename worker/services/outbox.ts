import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { postRef } from "@/shared/ref";
import type { Database, Transaction } from "../db/client";
import {
  emailOutbox,
  organization,
  type ShippedPayload,
  user as users,
  workspaceSettings,
} from "../db/schema";
import type { Flags } from "../env";
import type { Mailer } from "../mail/mailer";

/**
 * Queues a Shipped email to each of the post's subscribers but the person
 * who shipped it, and answers how many. It runs in the status change's
 * transaction, so the emails exist exactly when the change does. Someone
 * already emailed about this post shipping isn't emailed again. The demo
 * workspace queues none: its people have no inboxes.
 */
export async function queueShippedEmails(
  tx: Transaction,
  post: { id: number; title: string; organizationId: string },
  input: { actorId: string; note: string | null }
): Promise<number> {
  const [workspace] = await tx
    .select({
      name: organization.name,
      defaultLocale: workspaceSettings.defaultLocale,
      isDemo: workspaceSettings.isDemo,
    })
    .from(organization)
    .leftJoin(
      workspaceSettings,
      eq(workspaceSettings.organizationId, organization.id)
    )
    .where(eq(organization.id, post.organizationId))
    .limit(1);
  if (workspace?.isDemo) return 0;
  const payload: ShippedPayload = {
    title: post.title,
    ref: postRef(post.id, post.title),
    workspaceName: workspace?.name ?? "",
    // People have no stored language, so it's the workspace's.
    locale: workspace?.defaultLocale ?? "en",
    note: input.note,
  };
  // Raw SQL: Drizzle's insert … select wants every column, the generated
  // id included, so it can't fill this table from a query.
  const queued = await tx.execute(sql`
    insert into email_outbox (user_id, post_id, kind, payload)
    select user_id, ${post.id}::bigint, 'shipped', ${JSON.stringify(payload)}::jsonb
    from subscriptions
    where post_id = ${post.id} and user_id <> ${input.actorId}
    on conflict do nothing`);
  return queued.count;
}

/** The flag that tells the five-minute cron emails are waiting. */
export const OUTBOX_PENDING = "outbox:pending";

/**
 * Raises that flag for half an hour: long enough for every try at a batch
 * (5 tries, 5 minutes apart). It lapses by itself, so it never needs
 * clearing, and two status changes at once can't lose each other's emails.
 */
export function markOutboxPending(flags: Flags) {
  return flags.put(OUTBOX_PENDING, "1", { expirationTtl: 30 * 60 });
}

/** A post moved back out of Shipped: drop its emails that haven't gone out. */
export async function takeBackShippedEmails(tx: Transaction, postId: number) {
  await tx
    .delete(emailOutbox)
    .where(
      and(
        eq(emailOutbox.postId, postId),
        eq(emailOutbox.kind, "shipped"),
        isNull(emailOutbox.sentAt),
        isNull(emailOutbox.claimedAt)
      )
    );
}

/** After this many failed tries, an email stays unsent with its last error. */
const MAX_ATTEMPTS = 5;

/**
 * Sends the oldest unsent emails, at most `batch` of them: Brevo's free plan
 * allows 300 a day, and the cron runs every five minutes.
 *
 * Each email is claimed before it's sent, skipping rows another run has
 * locked, so overlapping runs send different ones. A claim left by a run
 * that died lapses after ten minutes. A failed email is tried again on
 * later runs. `postIds` limits a run to those posts' emails; the cron sends
 * them all, and tests pass their own posts so test files running at once
 * leave each other's emails alone.
 */
export async function sendQueuedEmails(
  db: Database,
  mailer: Mailer,
  options: { origin: string; batch?: number; postIds?: number[] }
) {
  const due = db
    .select({ id: emailOutbox.id })
    .from(emailOutbox)
    .where(
      and(
        isNull(emailOutbox.sentAt),
        lt(emailOutbox.attempts, MAX_ATTEMPTS),
        or(
          isNull(emailOutbox.claimedAt),
          lt(emailOutbox.claimedAt, sql`now() - interval '10 minutes'`)
        ),
        options.postIds
          ? inArray(emailOutbox.postId, options.postIds)
          : undefined
      )
    )
    .orderBy(asc(emailOutbox.id))
    .limit(options.batch ?? 20)
    .for("update", { skipLocked: true });
  const claimed = await db
    .update(emailOutbox)
    .set({
      claimedAt: sql`now()`,
      attempts: sql`${emailOutbox.attempts} + 1`,
    })
    .where(inArray(emailOutbox.id, due))
    .returning({
      id: emailOutbox.id,
      userId: emailOutbox.userId,
      payload: emailOutbox.payload,
    });
  if (claimed.length === 0) return { sent: 0, failed: 0 };
  const recipients = new Map(
    (
      await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(
          inArray(users.id, [...new Set(claimed.map((row) => row.userId))])
        )
    ).map((row) => [row.id, row.email])
  );
  let sent = 0;
  // One at a time: a run stays well inside the Workers subrequest limit.
  for (const email of claimed.sort((a, b) => a.id - b.id)) {
    try {
      const to = recipients.get(email.userId);
      if (!to) throw new Error("the recipient has no email address");
      const { title, ref, workspaceName, locale, note } = email.payload;
      await mailer.sendShipped({
        to,
        locale,
        title,
        url: new URL(`/p/${ref}`, options.origin).toString(),
        workspaceName,
        note,
      });
      await db
        .update(emailOutbox)
        .set({ sentAt: sql`now()`, lastError: null })
        .where(eq(emailOutbox.id, email.id));
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db
        .update(emailOutbox)
        .set({ claimedAt: null, lastError: message.slice(0, 500) })
        .where(eq(emailOutbox.id, email.id));
    }
  }
  return { sent, failed: claimed.length - sent };
}
