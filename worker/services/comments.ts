import { and, eq, sql } from "drizzle-orm";
import {
  type CommentChange,
  type CommentView,
  replyDepth,
  replyParentId,
} from "@/shared/comments";
import type { Database } from "../db/client";
import { comments, posts, user as users } from "../db/schema";
import { AppError } from "../lib/errors";
import { onTeam } from "./team";

/** Who's reading: their id, and whether they're on the post's team. */
export type Viewer = { id: string | null; isTeam: boolean };

/**
 * What every comment view selects. Queries using it left-join `users` on
 * the author.
 */
const commentColumns = {
  id: comments.id,
  postId: comments.postId,
  parentId: comments.parentId,
  depth: comments.depth,
  body: comments.body,
  authorId: comments.authorId,
  authorName: users.name,
  official: comments.isOfficial,
  replyCount: comments.replyCount,
  deletedAt: comments.deletedAt,
  createdAt: comments.createdAt,
};

type CommentRow = {
  id: number;
  postId: number;
  parentId: number | null;
  depth: number;
  body: string;
  authorId: string | null;
  authorName: string | null;
  official: boolean;
  replyCount: number;
  deletedAt: Date | null;
  createdAt: Date;
};

/** A deleted comment keeps its place and its replies, not its words or author. */
function toView(
  row: CommentRow,
  viewer: Viewer,
  replies: CommentView[] = []
): CommentView {
  const deleted = row.deletedAt !== null;
  return {
    id: row.id,
    postId: row.postId,
    parentId: row.parentId,
    depth: row.depth,
    body: deleted ? "" : row.body,
    author:
      deleted || row.authorId === null ? null : { name: row.authorName ?? "" },
    official: !deleted && row.official,
    deleted,
    replyCount: row.replyCount,
    replies,
    canDelete:
      !deleted &&
      viewer.id !== null &&
      (row.authorId === viewer.id || viewer.isTeam),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function findComment(
  db: Database,
  id: number,
  viewer: Viewer
): Promise<CommentView | null> {
  const [row] = await db
    .select(commentColumns)
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.id, id))
    .limit(1);
  return row ? toView(row, viewer) : null;
}

/**
 * Adds a comment, or a reply when `parentId` is set, and counts it.
 *
 * Every change to a post's comments locks the post row first, so the
 * counts move one change at a time, by exactly what changed. From Phase 4,
 * a merge takes the same lock, so a comment can't land on a post that was
 * just merged away.
 */
export async function createComment(
  db: Database,
  input: { postId: number; authorId: string; body: string; parentId?: number }
): Promise<CommentChange> {
  const saved = await db.transaction(async (tx) => {
    const [post] = await tx
      .select({
        mergedIntoId: posts.mergedIntoId,
        isTeam: onTeam(input.authorId),
      })
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
    let parentId: number | null = null;
    let depth = 0;
    if (input.parentId !== undefined) {
      const [parent] = await tx
        .select({
          id: comments.id,
          parentId: comments.parentId,
          depth: comments.depth,
        })
        .from(comments)
        .where(
          and(
            eq(comments.id, input.parentId),
            eq(comments.postId, input.postId)
          )
        )
        .limit(1);
      if (!parent) {
        throw new AppError(
          400,
          "BAD_REQUEST",
          "That comment isn't on this post",
          { parentId: "COMMENT_UNKNOWN" }
        );
      }
      parentId = replyParentId(parent);
      depth = replyDepth(parent);
      await tx
        .update(comments)
        .set({ replyCount: sql`${comments.replyCount} + 1` })
        .where(eq(comments.id, parentId));
    }
    const [created] = await tx
      .insert(comments)
      .values({
        postId: input.postId,
        authorId: input.authorId,
        parentId,
        depth,
        body: input.body,
        isOfficial: post.isTeam,
      })
      .returning({ id: comments.id });
    const [counted] = await tx
      .update(posts)
      .set({ commentCount: sql`${posts.commentCount} + 1` })
      .where(eq(posts.id, input.postId))
      .returning({ commentCount: posts.commentCount });
    if (!created || !counted) {
      throw new Error("the comment insert returned nothing");
    }
    return {
      id: created.id,
      commentCount: counted.commentCount,
      isTeam: post.isTeam,
    };
  });
  const comment = await findComment(db, saved.id, {
    id: input.authorId,
    isTeam: saved.isTeam,
  });
  if (!comment) throw new Error("the new comment is missing");
  return { comment, commentCount: saved.commentCount };
}
