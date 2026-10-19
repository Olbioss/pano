import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "use-intl";
import { apiErrorKey } from "@/lib/error-text";
import { postKeys, subscriptionKey } from "@/lib/keys";
import { applyOptimistic, patch } from "@/lib/optimistic";
import { setSubscription } from "@/lib/posts";
import type { PostDetail } from "@/shared/posts";

/**
 * Follows or unfollows one post. Like votes, each request sends the state
 * clicked, one at a time, so rapid clicks end where the last one did.
 */
export function useSubscription(postId: number) {
  const qc = useQueryClient();
  const tErrors = useTranslations("errors");
  const mutationKey = subscriptionKey(postId);
  const isLast = () => qc.isMutating({ mutationKey }) === 1;
  return useMutation({
    mutationKey,
    scope: { id: `subscription:${postId}` },
    networkMode: "always",
    mutationFn: (subscribed: boolean) => setSubscription(postId, subscribed),
    onMutate: async (subscribed) => ({
      rollback: await applyOptimistic(qc, [
        patch<PostDetail>({ queryKey: postKeys.detail(postId) }, (post) => {
          post.subscribed = subscribed;
        }),
      ]),
    }),
    onError: (error, _subscribed, context) => {
      context?.rollback();
      toast.error(tErrors(apiErrorKey(error)));
    },
    onSettled: () => {
      if (isLast()) {
        void qc.invalidateQueries({ queryKey: postKeys.detail(postId) });
      }
    },
  });
}
