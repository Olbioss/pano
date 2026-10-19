import type { QueryClient } from "@tanstack/react-query";
import type { Draft } from "immer";
import { everyCopyOfPost } from "@/features/posts/post-cache";
import { postKeys } from "@/lib/keys";
import { applyOptimistic, patch } from "@/lib/optimistic";
import type { PostSummary, Roadmap } from "@/shared/posts";
import {
  isRoadmapStatus,
  type PostStatus,
  ROADMAP_STATUSES,
} from "@/shared/status";

/**
 * A post as a roadmap card, at `status`. The caller may hold a whole post
 * page; the board keeps only what a card shows.
 */
export function cardOf(post: PostSummary, status: PostStatus): PostSummary {
  const { id, ref, title, excerpt, voteCount, commentCount, voted } = post;
  const { board, author, createdAt } = post;
  return {
    ...{ id, ref, title, excerpt, status, voteCount, commentCount, voted },
    ...{ board, author, createdAt },
  };
}

/**
 * Puts `card` in the column for its status, the way the server orders it:
 * shipped latest first, the others most voted first. A status off the
 * roadmap takes it off.
 */
export function placeOnRoadmap(board: Draft<Roadmap>, card: PostSummary) {
  for (const status of ROADMAP_STATUSES) {
    const at = board[status].findIndex((item) => item.id === card.id);
    if (at !== -1) board[status].splice(at, 1);
  }
  if (!isRoadmapStatus(card.status)) return;
  const column = board[card.status];
  const at =
    card.status === "shipped"
      ? 0
      : column.findIndex((item) => item.voteCount < card.voteCount);
  column.splice(at === -1 ? column.length : at, 0, card);
}

/**
 * Shows a post at its new status everywhere at once, moving its card on its
 * workspace's roadmap. Resolves to a rollback.
 */
export function optimisticStatus(
  qc: QueryClient,
  input: { post: PostSummary; workspace: string; status: PostStatus }
) {
  const card = cardOf(input.post, input.status);
  return applyOptimistic(qc, [
    ...everyCopyOfPost(input.post.id, (copy) => {
      copy.status = input.status;
    }),
    patch<Roadmap>(
      { queryKey: postKeys.roadmap(input.workspace), exact: true },
      (board) => placeOnRoadmap(board, card)
    ),
  ]);
}
