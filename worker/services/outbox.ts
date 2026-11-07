import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  min,
  or,
  sql,
} from "drizzle-orm";
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
import { claimDailyEmail, nextUtcMidnight } from "./email-budget";

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
 * Raises that flag for half an hour: long enough for a batch's first try,
 * and for a full batch to hand the rest on. It lapses by itself, so it never
 * needs clearing, and two status changes at once can't lose each other's
 * emails.
 */
export function markOutboxPending(flags: Flags) {
  return flags.put(OUTBOX_PENDING, "1", { expirationTtl: 30 * 60 });
}

/**
 * When the earliest failed email is due for its next try, in epoch
 * milliseconds. Only the cron writes it, so a status change's flag and this
 * can't overwrite each other's times; until then the cron leaves Neon asleep.
 */
export const OUTBOX_RETRY = "outbox:retry";

/** Notes when the next retry is due; the note lapses half an hour after. */
export function markOutboxRetry(flags: Flags, at: Date) {
  return flags.put(OUTBOX_RETRY, String(at.getTime()), {
    expiration: Math.ceil((at.getTime() + 30 * 60_000) / 1000),
  });
}

/** The flag that holds the five-minute cron back until the next UTC day. */
export const OUTBOX_PAUSED = "outbox:paused";

/**
 * The day's email is spent: the five-minute cron stops connecting until the
 * next UTC midnight, so Neon can sleep meanwhile. The 01:00 run sends the
 * next batch, and raises the pending flag again if it was a full one.
 */
export function pauseOutboxUntilTomorrow(flags: Flags, now = new Date()) {
  // KV wants an expiry at least a minute away.
  const until = Math.max(
    nextUtcMidnight(now).getTime(),
    now.getTime() + 60_000
  );
  return flags.put(OUTBOX_PAUSED, "1", {
    expiration: Math.ceil(until / 1000),
  });
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

/**
 * Someone stopped following a post: drop their emails about it that no run
 * has picked up. One already being sent still goes out.
 */
export async function takeBackEmailsTo(
  tx: Transaction,
  input: { postId: number; userId: string }
) {
  await tx
    .delete(emailOutbox)
    .where(
      and(
        eq(emailOutbox.postId, input.postId),
        eq(emailOutbox.userId, input.userId),
        isNull(emailOutbox.sentAt),
        isNull(emailOutbox.claimedAt)
      )
    );
}

/** After this many failed tries, an email stays unsent with its last error. */
const MAX_ATTEMPTS = 5;

/**
 * How long a failed email waits before its next try, by how many tries it
 * has had: it rides out a Brevo outage of about ten hours.
 */
export const RETRY_MINUTES = [5, 30, 120, 480] as const;

/** The most emails one run sends. */
export const OUTBOX_BATCH = 20;

/**
 * Sends the oldest unsent emails, at most `batch` of them: Brevo's free plan
 * allows 300 a day, and the cron runs every five minutes.
 *
 * Each email is claimed before it's sent, skipping rows another run has
 * locked, so overlapping runs send different ones. A claim left by a run
 * that died lapses after ten minutes. A failed email waits longer after
 * each try (RETRY_MINUTES), and the result's `nextRetryAt` says when the
 * earliest waiting one is due. `postIds` limits a run to those posts'
 * emails; the cron sends them all, and tests pass their own posts so test
 * files running at once leave each other's emails alone.
 *
 * With `budget` (production), each email first takes one of the day's
 * emails. Once the day's share is spent, the run stops: the rest wait for
 * tomorrow without this run counting as one of their tries, and the result
 * says `budgetSpent`.
 */
export async function sendQueuedEmails(
  db: Database,
  mailer: Mailer,
  options: {
    origin: string;
    batch?: number;
    postIds?: number[];
    budget?: boolean;
    now?: Date;
  }
): Promise<{
  sent: number;
  failed: number;
  budgetSpent?: true;
  nextRetryAt?: Date;
}> {
  const due = db
    .select({ id: emailOutbox.id })
    .from(emailOutbox)
    .where(
      and(
        isNull(emailOutbox.sentAt),
        lt(emailOutbox.attempts, MAX_ATTEMPTS),
        lte(emailOutbox.nextAttemptAt, sql`now()`),
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
    .limit(options.batch ?? OUTBOX_BATCH)
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
      attempts: emailOutbox.attempts,
    });
  if (claimed.length === 0) {
    return withNextRetry(db, { sent: 0, failed: 0 }, options.postIds);
  }
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
  const inOrder = claimed.sort((a, b) => a.id - b.id);
  // One at a time: a run stays well inside the Workers subrequest limit.
  for (const [index, email] of inOrder.entries()) {
    if (options.budget && !(await claimDailyEmail(db, "notice", options.now))) {
      await db
        .update(emailOutbox)
        .set({
          claimedAt: null,
          attempts: sql`${emailOutbox.attempts} - 1`,
        })
        .where(
          inArray(
            emailOutbox.id,
            inOrder.slice(index).map((row) => row.id)
          )
        );
      return { sent, failed: index - sent, budgetSpent: true };
    }
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
      const minutes = RETRY_MINUTES[email.attempts - 1] ?? 0;
      await db
        .update(emailOutbox)
        .set({
          claimedAt: null,
          lastError: message.slice(0, 500),
          nextAttemptAt: sql`now() + make_interval(mins => ${minutes})`,
        })
        .where(eq(emailOutbox.id, email.id));
    }
  }
  return withNextRetry(
    db,
    { sent, failed: claimed.length - sent },
    options.postIds
  );
}

/** Adds when the earliest email waiting for another try is due, if any. */
async function withNextRetry<T extends { sent: number; failed: number }>(
  db: Database,
  result: T,
  postIds?: number[]
): Promise<T & { nextRetryAt?: Date }> {
  const [row] = await db
    .select({ at: min(emailOutbox.nextAttemptAt) })
    .from(emailOutbox)
    .where(
      and(
        isNull(emailOutbox.sentAt),
        gt(emailOutbox.attempts, 0),
        lt(emailOutbox.attempts, MAX_ATTEMPTS),
        gt(emailOutbox.nextAttemptAt, sql`now()`),
        postIds ? inArray(emailOutbox.postId, postIds) : undefined
      )
    );
  return row?.at ? { ...result, nextRetryAt: row.at } : result;
}
