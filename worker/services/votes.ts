import { and, eq, sql } from "drizzle-orm";
import type { VoteResult } from "@/shared/posts";
import type { Database } from "../db/client";
import { posts, votes } from "../db/schema";
import { AppError } from "../lib/errors";

/**
 * Sets one person's vote on a post to `voted` and returns the new count.
 *
 * The post row is locked first, so every vote on it (and, from Phase 4, a
 * merge) waits for the one in progress. The vote row is written as the
 * desired state, not toggled, and the count moves only by the rows that
 * actually changed. Repeating a request, or racing it against itself,
 * can't drift.
 */
export async function setVote(
  db: Database,
  input: { postId: number; userId: string; voted: boolean }
): Promise<VoteResult> {
  return db.transaction(async (tx) => {
    const [post] = await tx
      .select({ voteCount: posts.voteCount, mergedIntoId: posts.mergedIntoId })
      .from(posts)
      .where(eq(posts.id, input.postId))
      .for("update");
    if (!post) throw new AppError(404, "NOT_FOUND", "Post not found");
    if (post.mergedIntoId !== null) {
      throw new AppError(
        409,
        "POST_MERGED",
        "This request was merged into another one"
      );
    }
    const changed = input.voted
      ? await tx
          .insert(votes)
          .values({ postId: input.postId, userId: input.userId })
          .onConflictDoNothing()
          .returning({ postId: votes.postId })
      : await tx
          .delete(votes)
          .where(
            and(eq(votes.postId, input.postId), eq(votes.userId, input.userId))
          )
          .returning({ postId: votes.postId });
    if (changed.length === 0) {
      return { voted: input.voted, voteCount: post.voteCount };
    }
    const [updated] = await tx
      .update(posts)
      .set({ voteCount: sql`${posts.voteCount} + ${input.voted ? 1 : -1}` })
      .where(eq(posts.id, input.postId))
      .returning({ voteCount: posts.voteCount });
    return {
      voted: input.voted,
      voteCount: updated?.voteCount ?? post.voteCount,
    };
  });
}
