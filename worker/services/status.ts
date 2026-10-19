import { desc, eq, sql } from "drizzle-orm";
import type { StatusChangeView } from "@/shared/posts";
import type { PostStatus } from "@/shared/status";
import type { Database } from "../db/client";
import { posts, statusChanges, user as users } from "../db/schema";
import { AppError } from "../lib/errors";
import { queueShippedEmails, takeBackShippedEmails } from "./outbox";
import { onTeam } from "./team";

/** How many of a post's latest status changes its page shows. */
const TIMELINE_LENGTH = 50;

/**
 * Moves a post to `status` as someone on its workspace's team, with an
 * optional note for the timeline.
 *
 * It locks the post row first, like every write to a post, so moves sent at
 * once run one after another and only the first one changes anything.
 * Moving to Shipped queues the subscribers' emails in the same transaction.
 * Moving back out before the cron sends them takes the unsent ones back.
 */
export async function changeStatus(
  db: Database,
  input: { postId: number; userId: string; status: PostStatus; note?: string }
) {
  await db.transaction(async (tx) => {
    const [post] = await tx
      .select({
        status: posts.status,
        title: posts.title,
        organizationId: posts.organizationId,
        mergedIntoId: posts.mergedIntoId,
        isTeam: onTeam(input.userId),
      })
      .from(posts)
      .where(eq(posts.id, input.postId))
      .for("update");
    if (!post) throw new AppError(404, "NOT_FOUND", "Post not found");
    if (!post.isTeam) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Only the workspace team can do that"
      );
    }
    if (post.mergedIntoId !== null) {
      throw new AppError(
        409,
        "POST_MERGED",
        "This request was merged into another one"
      );
    }
    if (post.status === input.status) return;
    const note = input.note ? input.note : null;
    await tx
      .update(posts)
      .set({ status: input.status, statusChangedAt: sql`now()` })
      .where(eq(posts.id, input.postId));
    await tx.insert(statusChanges).values({
      postId: input.postId,
      fromStatus: post.status,
      toStatus: input.status,
      note,
      changedBy: input.userId,
    });
    if (input.status === "shipped") {
      await queueShippedEmails(
        tx,
        {
          id: input.postId,
          title: post.title,
          organizationId: post.organizationId,
        },
        { actorId: input.userId, note }
      );
    } else if (post.status === "shipped") {
      await takeBackShippedEmails(tx, input.postId);
    }
  });
}

/** A post's latest status changes, oldest first. */
export async function findTimeline(
  db: Database,
  postId: number
): Promise<StatusChangeView[]> {
  const rows = await db
    .select({
      id: statusChanges.id,
      from: statusChanges.fromStatus,
      to: statusChanges.toStatus,
      note: statusChanges.note,
      changedBy: statusChanges.changedBy,
      name: users.name,
      createdAt: statusChanges.createdAt,
    })
    .from(statusChanges)
    .leftJoin(users, eq(users.id, statusChanges.changedBy))
    .where(eq(statusChanges.postId, postId))
    .orderBy(desc(statusChanges.id))
    .limit(TIMELINE_LENGTH);
  return rows.reverse().map((row) => ({
    id: row.id,
    from: row.from,
    to: row.to,
    note: row.note,
    by: row.changedBy === null ? null : { name: row.name ?? "" },
    createdAt: row.createdAt.toISOString(),
  }));
}
