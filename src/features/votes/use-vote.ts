import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "use-intl";
import { apiErrorKey } from "@/lib/error-text";
import { postKeys, voteKey } from "@/lib/keys";
import { castVote } from "@/lib/posts";
import { optimisticVote, writeVoteResult } from "./vote-cache";

/**
 * Votes on one post. Requests for the same post go one at a time (`scope`),
 * each sending the state the person clicked, so rapid clicks end where the
 * last one did. The cache flips at once and rolls back on failure. The
 * server's answer is written, and the post refetched, only once no other
 * vote on it is waiting.
 */
export function useVote(postId: number) {
  const qc = useQueryClient();
  const tErrors = useTranslations("errors");
  const mutationKey = voteKey(postId);
  // In its own callbacks a mutation still counts itself.
  const isLast = () => qc.isMutating({ mutationKey }) === 1;
  return useMutation({
    mutationKey,
    scope: { id: `vote:${postId}` },
    mutationFn: (voted: boolean) => castVote(postId, voted),
    onMutate: async (voted) => ({
      rollback: await optimisticVote(qc, postId, voted),
    }),
    onError: (error, _voted, context) => {
      context?.rollback();
      toast.error(tErrors(apiErrorKey(error)));
    },
    onSuccess: (result) => {
      if (isLast()) writeVoteResult(qc, postId, result);
    },
    onSettled: async () => {
      if (isLast()) await qc.invalidateQueries({ queryKey: postKeys.all });
    },
  });
}
