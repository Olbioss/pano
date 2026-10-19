import { asc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { comments, posts } from "../db/schema";
import { AppError } from "../lib/errors";
import { onTeam } from "./team";

/**
 * Merges a duplicate into another post of the same workspace, as its team.
 * Votes, subscriptions and comments move in one transaction: someone who
 * voted on both counts once, and threads keep their shape. The merged post
 * stays, pointing at the other, so its address keeps working.
 *
 * Both rows are locked, lower id first, so the merge waits for votes and
 * comments in progress on either post, two merges can't deadlock, and
 * anything arriving after it sees the merge and is refused.
 */
export async function mergePost(
  db: Database,
  input: { postId: number; intoId: number; userId: string }
) {
  if (input.postId === input.intoId) {
    throw new AppError(
      400,
      "BAD_REQUEST",
      "A post can't be merged into itself",
      { intoId: "MERGE_SELF" }
    );
  }
  await db.transaction(async (tx) => {
    const locked = await tx
      .select({
        id: posts.id,
        organizationId: posts.organizationId,
        mergedIntoId: posts.mergedIntoId,
        commentCount: posts.commentCount,
        isTeam: onTeam(input.userId),
      })
      .from(posts)
      .where(inArray(posts.id, [input.postId, input.intoId]))
      .orderBy(asc(posts.id))
      .for("update");
    const source = locked.find((row) => row.id === input.postId);
    const target = locked.find((row) => row.id === input.intoId);
    if (!source) throw new AppError(404, "NOT_FOUND", "Post not found");
    if (!source.isTeam) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Only the workspace team can do that"
      );
    }
    if (source.mergedIntoId !== null) {
      throw new AppError(
        409,
        "POST_MERGED",
        "This request was merged into another one"
      );
    }
    if (
      !target ||
      target.organizationId !== source.organizationId ||
      target.mergedIntoId !== null
    ) {
      throw new AppError(
        400,
        "BAD_REQUEST",
        "Merge into an unmerged post of the same workspace",
        { intoId: "MERGE_TARGET" }
      );
    }
    // Raw SQL: Drizzle's insert … select wants every column of the table.
    // A voter already on the target keeps one vote there, and a vote keeps
    // its time, which trending counts.
    const moved = await tx.execute(sql`
      insert into votes (post_id, user_id, created_at)
      select ${input.intoId}::bigint, user_id, created_at
      from votes where post_id = ${input.postId}
      on conflict do nothing
      returning user_id`);
    await tx.execute(sql`delete from votes where post_id = ${input.postId}`);
    await tx.execute(sql`
      insert into subscriptions (post_id, user_id, created_at)
      select ${input.intoId}::bigint, user_id, created_at
      from subscriptions where post_id = ${input.postId}
      on conflict do nothing`);
    await tx.execute(
      sql`delete from subscriptions where post_id = ${input.postId}`
    );
    // Replies move with their comments, so threads keep their shape.
    await tx
      .update(comments)
      .set({ postId: input.intoId })
      .where(eq(comments.postId, input.postId));
    await tx
      .update(posts)
      .set({
        voteCount: sql`${posts.voteCount} + ${moved.length}`,
        commentCount: sql`${posts.commentCount} + ${source.commentCount}`,
      })
      .where(eq(posts.id, input.intoId));
    await tx
      .update(posts)
      .set({
        mergedIntoId: input.intoId,
        voteCount: 0,
        commentCount: 0,
        // Its comments, the pinned one included, live on the target now.
        pinnedCommentId: null,
      })
      .where(eq(posts.id, input.postId));
    // Posts merged into this one before now point straight at the target.
    await tx
      .update(posts)
      .set({ mergedIntoId: input.intoId })
      .where(eq(posts.mergedIntoId, input.postId));
  });
}
