import type { QueryClient } from "@tanstack/react-query";
import { everyCopyOfPost } from "@/features/posts/post-cache";
import { applyOptimistic, patchQueries } from "@/lib/optimistic";
import type { VoteResult } from "@/shared/posts";

/** Flips this person's vote everywhere at once; resolves to a rollback. */
export function optimisticVote(
  qc: QueryClient,
  postId: number,
  voted: boolean
) {
  return applyOptimistic(
    qc,
    everyCopyOfPost(postId, (post) => {
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
    everyCopyOfPost(postId, (post) => {
      post.voted = result.voted;
      post.voteCount = result.voteCount;
    })
  );
}
