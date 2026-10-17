import type { QueryClient } from "@tanstack/react-query";
import type { Draft } from "immer";
import { postKeys } from "@/lib/keys";
import {
  applyOptimistic,
  type CachePatch,
  patch,
  patchQueries,
} from "@/lib/optimistic";
import type {
  FeedPage,
  PostDetail,
  PostSummary,
  VoteResult,
} from "@/shared/posts";

type Edit = (post: Draft<PostSummary>) => void;

/** The same edit to one post wherever it's cached. */
function everyCopy(postId: number, edit: Edit): CachePatch[] {
  return [
    patch<FeedPage>({ queryKey: postKeys.feedsAll }, (page) => {
      for (const item of page.items) {
        if (item.id === postId) edit(item);
      }
    }),
    patch<PostDetail>({ queryKey: postKeys.detail(postId) }, edit),
    patch<PostSummary[]>({ queryKey: postKeys.similarAll }, (list) => {
      for (const item of list) {
        if (item.id === postId) edit(item);
      }
    }),
  ];
}

/** Flips this person's vote everywhere at once; resolves to a rollback. */
export function optimisticVote(
  qc: QueryClient,
  postId: number,
  voted: boolean
) {
  return applyOptimistic(
    qc,
    everyCopy(postId, (post) => {
      if (post.voted === voted) return;
      post.voted = voted;
      post.voteCount += voted ? 1 : -1;
    })
  );
}

/** Writes the server's answer everywhere: its count includes other people. */
export function writeVoteResult(
  qc: QueryClient,
  postId: number,
  result: VoteResult
) {
  patchQueries(
    qc,
    everyCopy(postId, (post) => {
      post.voted = result.voted;
      post.voteCount = result.voteCount;
    })
  );
}
