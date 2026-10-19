import { and, asc, desc, eq, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import {
  type CommentChange,
  type CommentPage,
  type CommentView,
  replyDepth,
  replyParentId,
} from "@/shared/comments";
import type { Database } from "../db/client";
import { comments, posts, user as users } from "../db/schema";
import { AppError } from "../lib/errors";
import { subscribe } from "./subscriptions";
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
    await subscribe(tx, input.postId, input.authorId);
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

/** How many of each comment's latest replies come with it. */
const PREVIEW_REPLIES = 2;

/** The viewer of a post's comments, or null when the post doesn't exist. */
async function viewerOf(
  db: Database,
  postId: number,
  viewerId: string | null
): Promise<Viewer | null> {
  const [post] = await db
    .select({ isTeam: viewerId ? onTeam(viewerId) : sql<boolean>`false` })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);
  return post ? { id: viewerId, isTeam: post.isTeam } : null;
}

/**
 * Up to `limit` comments under `parentId` (null: the top level), newest
 * first, all older than the comment `before`. Ids follow insertion order,
 * so a comment added meanwhile never shifts a later page.
 */
async function pageOf(
  db: Database,
  input: {
    postId: number;
    parentId: number | null;
    before?: number;
    limit: number;
  }
) {
  const rows = await db
    .select(commentColumns)
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorId))
    .where(
      and(
        eq(comments.postId, input.postId),
        input.parentId === null
          ? isNull(comments.parentId)
          : eq(comments.parentId, input.parentId),
        input.before === undefined ? undefined : lt(comments.id, input.before)
      )
    )
    .orderBy(desc(comments.id))
    .limit(input.limit + 1);
  return {
    rows: rows.slice(0, input.limit),
    hasMore: rows.length > input.limit,
  };
}

/** The latest replies of each of `parentIds`, oldest first, in one query. */
async function latestReplies(
  db: Database,
  postId: number,
  parentIds: number[]
) {
  if (parentIds.length === 0) return [];
  const ranked = db
    .select({
      id: comments.id,
      rank: sql<number>`row_number() over (partition by ${comments.parentId} order by ${comments.id} desc)`.as(
        "rank"
      ),
    })
    .from(comments)
    .where(
      and(eq(comments.postId, postId), inArray(comments.parentId, parentIds))
    )
    .as("ranked");
  return db
    .select(commentColumns)
    .from(comments)
    .innerJoin(ranked, eq(ranked.id, comments.id))
    .leftJoin(users, eq(users.id, comments.authorId))
    .where(lte(ranked.rank, PREVIEW_REPLIES))
    .orderBy(asc(comments.id));
}

/**
 * The rows as views, each carrying its latest replies, and those replies
 * theirs, down to the deepest level: a reply someone just wrote under a
 * shown comment is its newest, so it stays shown when the thread is read
 * again. One query per level; depth-3 comments have no replies, so it ends.
 */
async function withReplies(
  db: Database,
  postId: number,
  rows: CommentRow[],
  viewer: Viewer
): Promise<CommentView[]> {
  const parents = rows.filter((row) => row.replyCount > 0).map((row) => row.id);
  const replies = await latestReplies(db, postId, parents);
  const shown =
    replies.length === 0 ? [] : await withReplies(db, postId, replies, viewer);
  return rows.map((row) =>
    toView(
      row,
      viewer,
      shown.filter((reply) => reply.parentId === row.id)
    )
  );
}

export async function listComments(
  db: Database,
  input: {
    postId: number;
    before?: number;
    limit: number;
    viewerId: string | null;
  }
): Promise<CommentPage> {
  const viewer = await viewerOf(db, input.postId, input.viewerId);
  if (!viewer) throw new AppError(404, "NOT_FOUND", "Post not found");
  const page = await pageOf(db, { ...input, parentId: null });
  return {
    items: await withReplies(db, input.postId, page.rows, viewer),
    hasMore: page.hasMore,
  };
}

export async function listReplies(
  db: Database,
  input: {
    commentId: number;
    before?: number;
    limit: number;
    viewerId: string | null;
  }
): Promise<CommentPage> {
  const [parent] = await db
    .select({ postId: comments.postId })
    .from(comments)
    .where(eq(comments.id, input.commentId))
    .limit(1);
  const viewer = parent
    ? await viewerOf(db, parent.postId, input.viewerId)
    : null;
  if (!parent || !viewer) {
    throw new AppError(404, "NOT_FOUND", "Comment not found");
  }
  const page = await pageOf(db, {
    postId: parent.postId,
    parentId: input.commentId,
    before: input.before,
    limit: input.limit,
  });
  // The query brings the newest first; a page of replies reads oldest first.
  return {
    items: await withReplies(db, parent.postId, page.rows.reverse(), viewer),
    hasMore: page.hasMore,
  };
}

/**
 * Pins one of the post's comments above its thread, or unpins with null.
 * Only the team may, and only a comment of this post that isn't deleted.
 */
export async function setPin(
  db: Database,
  input: { postId: number; userId: string; commentId: number | null }
): Promise<CommentView | null> {
  await db.transaction(async (tx) => {
    // The same lock a delete takes, so a comment can't be pinned while it's
    // being deleted.
    const [post] = await tx
      .select({ isTeam: onTeam(input.userId) })
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
    if (input.commentId !== null) {
      const [comment] = await tx
        .select({ id: comments.id })
        .from(comments)
        .where(
          and(
            eq(comments.id, input.commentId),
            eq(comments.postId, input.postId),
            isNull(comments.deletedAt)
          )
        )
        .limit(1);
      if (!comment) {
        throw new AppError(
          400,
          "BAD_REQUEST",
          "That comment isn't on this post",
          { commentId: "COMMENT_UNKNOWN" }
        );
      }
    }
    await tx
      .update(posts)
      .set({ pinnedCommentId: input.commentId })
      .where(eq(posts.id, input.postId));
  });
  return input.commentId === null
    ? null
    : findComment(db, input.commentId, { id: input.userId, isTeam: true });
}

/**
 * Deletes a comment as its author or as the team. The row stays, so its
 * replies keep their place, but its words go. Only the first delete changes
 * the row, so repeating one, or racing it against itself, uncounts it once.
 * A deleted comment can't stay pinned.
 */
export async function deleteComment(
  db: Database,
  input: { commentId: number; userId: string }
): Promise<CommentChange> {
  const [target] = await db
    .select({ postId: comments.postId })
    .from(comments)
    .where(eq(comments.id, input.commentId))
    .limit(1);
  if (!target) throw new AppError(404, "NOT_FOUND", "Comment not found");
  const saved = await db.transaction(async (tx) => {
    // Post first, like every comment write, so writes queue in one order.
    const [post] = await tx
      .select({
        commentCount: posts.commentCount,
        pinnedCommentId: posts.pinnedCommentId,
        isTeam: onTeam(input.userId),
      })
      .from(posts)
      .where(eq(posts.id, target.postId))
      .for("update");
    const [comment] = await tx
      .select({ authorId: comments.authorId })
      .from(comments)
      .where(
        and(
          eq(comments.id, input.commentId),
          eq(comments.postId, target.postId)
        )
      )
      .limit(1);
    if (!post || !comment) {
      throw new AppError(404, "NOT_FOUND", "Comment not found");
    }
    if (comment.authorId !== input.userId && !post.isTeam) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Only the author or the workspace team can do that"
      );
    }
    const changed = await tx
      .update(comments)
      .set({ deletedAt: sql`now()`, body: "" })
      .where(and(eq(comments.id, input.commentId), isNull(comments.deletedAt)))
      .returning({ id: comments.id });
    if (changed.length === 0) {
      return { commentCount: post.commentCount, isTeam: post.isTeam };
    }
    const [counted] = await tx
      .update(posts)
      .set({
        commentCount: sql`${posts.commentCount} - 1`,
        ...(post.pinnedCommentId === input.commentId
          ? { pinnedCommentId: null }
          : {}),
      })
      .where(eq(posts.id, target.postId))
      .returning({ commentCount: posts.commentCount });
    return {
      commentCount: counted?.commentCount ?? post.commentCount,
      isTeam: post.isTeam,
    };
  });
  const comment = await findComment(db, input.commentId, {
    id: input.userId,
    isTeam: saved.isTeam,
  });
  if (!comment) throw new AppError(404, "NOT_FOUND", "Comment not found");
  return { comment, commentCount: saved.commentCount };
}
