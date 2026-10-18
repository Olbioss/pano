import type { FeedSort } from "@/shared/schemas";
import type { PostStatus } from "@/shared/status";

export type FeedParams = {
  board?: string;
  sort: FeedSort;
  status?: PostStatus;
  q?: string;
  page: number;
};

/**
 * Query keys for posts. Prefixes let one call reach every copy of a post: all
 * feed pages, its own page, and the similar-requests lists.
 */
export const postKeys = {
  all: ["posts"] as const,
  feedsAll: ["posts", "feed"] as const,
  feeds: (workspace: string) => ["posts", "feed", workspace] as const,
  feed: (workspace: string, params: FeedParams) =>
    ["posts", "feed", workspace, params] as const,
  detail: (id: number) => ["posts", "detail", id] as const,
  similarAll: ["posts", "similar"] as const,
  similar: (workspace: string, q: string) =>
    ["posts", "similar", workspace, q] as const,
};

/** Every vote on one post shares this key, so they can be counted. */
export const voteKey = (postId: number) => ["vote", postId] as const;

/**
 * Query keys for comments. A post's thread and every reply page under it
 * share the post's prefix, so one call reaches all of them.
 */
export const commentKeys = {
  all: ["comments"] as const,
  post: (postId: number) => ["comments", postId] as const,
  thread: (postId: number) => ["comments", postId, "thread"] as const,
  replies: (postId: number, commentId: number) =>
    ["comments", postId, "replies", commentId] as const,
};

/** Every change to one post's comments shares this key, so they can be counted. */
export const commentMutationKey = (postId: number) =>
  ["comment", postId] as const;
