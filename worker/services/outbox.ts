import { and, eq, isNull, sql } from "drizzle-orm";
import { postRef } from "@/shared/ref";
import type { Transaction } from "../db/client";
import {
  emailOutbox,
  organization,
  type ShippedPayload,
  workspaceSettings,
} from "../db/schema";

/**
 * Queues a Shipped email to each of the post's subscribers but the person
 * who shipped it. It runs in the status change's transaction, so the
 * emails exist exactly when the change does. Someone already emailed about
 * this post shipping isn't emailed again.
 */
export async function queueShippedEmails(
  tx: Transaction,
  post: { id: number; title: string; organizationId: string },
  input: { actorId: string; note: string | null }
) {
  const [workspace] = await tx
    .select({
      name: organization.name,
      defaultLocale: workspaceSettings.defaultLocale,
    })
    .from(organization)
    .leftJoin(
      workspaceSettings,
      eq(workspaceSettings.organizationId, organization.id)
    )
    .where(eq(organization.id, post.organizationId))
    .limit(1);
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
  await tx.execute(sql`
    insert into email_outbox (user_id, post_id, kind, payload)
    select user_id, ${post.id}::bigint, 'shipped', ${JSON.stringify(payload)}::jsonb
    from subscriptions
    where post_id = ${post.id} and user_id <> ${input.actorId}
    on conflict do nothing`);
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
