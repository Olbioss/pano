/** How deep replies go: a top-level comment is depth 0, replies reach 3. */
export const MAX_COMMENT_DEPTH = 3;

/** A comment as threads show it. */
export type CommentView = {
  id: number;
  postId: number;
  /** null for a top-level comment. */
  parentId: number | null;
  depth: number;
  /** "" once deleted. */
  body: string;
  /** null once deleted or once the account is gone; name is "" until they pick one. */
  author: { name: string } | null;
  /** Written by someone on the workspace's team: shows the Team badge. */
  official: boolean;
  deleted: boolean;
  /** Direct replies, deleted ones included: they keep their place. */
  replyCount: number;
  /**
   * The latest replies, oldest first: up to two on each comment a page
   * lists, none on the replies inside them.
   */
  replies: CommentView[];
  /** The person asking may delete it: they wrote it, or they're on the team. */
  canDelete: boolean;
  createdAt: string;
};

/**
 * A page of comments. Top-level comments come newest first. Replies come
 * oldest first within a page, and each next page holds the ones before it.
 */
export type CommentPage = { items: CommentView[]; hasMore: boolean };

/** A comment just added or deleted, and its post's new comment count. */
export type CommentChange = { comment: CommentView; commentCount: number };

export type PinResult = { pinned: CommentView | null };

/**
 * The comment a reply to `comment` goes under: that comment, or, once the
 * thread is as deep as it goes, its parent, so the reply lands beside it.
 */
export function replyParentId(
  comment: Pick<CommentView, "id" | "parentId" | "depth">
): number {
  return comment.depth >= MAX_COMMENT_DEPTH && comment.parentId !== null
    ? comment.parentId
    : comment.id;
}

/** The depth of a reply to `comment`. */
export function replyDepth(comment: Pick<CommentView, "depth">): number {
  return Math.min(comment.depth + 1, MAX_COMMENT_DEPTH);
}
