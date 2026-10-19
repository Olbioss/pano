import { and, eq } from "drizzle-orm";
import type { SubscriptionResult } from "@/shared/posts";
import type { Database, Transaction } from "../db/client";
import { posts, subscriptions } from "../db/schema";
import { AppError } from "../lib/errors";

/**
 * Subscribes someone to a post unless they already are. Posting, voting and
 * commenting call it inside their own transaction, which already holds the
 * post's lock, so it can't land on a post a merge just moved away.
 */
export async function subscribe(
  tx: Transaction,
  postId: number,
  userId: string
) {
  await tx
    .insert(subscriptions)
    .values({ postId, userId })
    .onConflictDoNothing();
}

/**
 * Sets whether someone follows a post. Like a vote, it sends the state
 * wanted, so repeating it changes nothing.
 */
export async function setSubscription(
  db: Database,
  input: { postId: number; userId: string; subscribed: boolean }
): Promise<SubscriptionResult> {
  return db.transaction(async (tx) => {
    const [post] = await tx
      .select({ mergedIntoId: posts.mergedIntoId })
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
    if (input.subscribed) {
      await subscribe(tx, input.postId, input.userId);
    } else {
      await tx
        .delete(subscriptions)
        .where(
          and(
            eq(subscriptions.postId, input.postId),
            eq(subscriptions.userId, input.userId)
          )
        );
    }
    return { subscribed: input.subscribed };
  });
}
