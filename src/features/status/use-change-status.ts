import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "use-intl";
import { apiErrorKey } from "@/lib/error-text";
import { postKeys, statusMutationKey } from "@/lib/keys";
import { changeStatus } from "@/lib/posts";
import type { PostSummary } from "@/shared/posts";
import type { PostStatus } from "@/shared/status";
import { optimisticStatus } from "./status-cache";

/** One status change: the post, its workspace's slug, and where it goes. */
export type StatusMove = {
  post: PostSummary;
  workspace: string;
  status: PostStatus;
  note?: string;
};

/**
 * Changes posts' statuses, from the post page or the roadmap. Every change
 * waits in one queue (`scope`), so a card moved twice ends where it was
 * dropped last; each shows at once and rolls back on failure. The server's
 * post is written once no later change to it is waiting, and the lists are
 * fetched again once no change at all is, so a card still waiting its turn
 * doesn't jump back.
 */
export function useChangeStatus() {
  const qc = useQueryClient();
  const tErrors = useTranslations("errors");
  // In its own callbacks a mutation still counts itself.
  const pending = (postId?: number) =>
    qc.isMutating({
      mutationKey: statusMutationKey,
      predicate: (mutation) =>
        postId === undefined ||
        (mutation.state.variables as StatusMove | undefined)?.post.id ===
          postId,
    });
  return useMutation({
    mutationKey: statusMutationKey,
    scope: { id: "status" },
    // Offline, fail at once with a toast instead of waiting unseen.
    networkMode: "always",
    mutationFn: ({ post, status, note }: StatusMove) =>
      changeStatus(post.id, note ? { status, note } : { status }),
    onMutate: async (move) => ({ rollback: await optimisticStatus(qc, move) }),
    onError: (error, _move, context) => {
      context?.rollback();
      toast.error(tErrors(apiErrorKey(error)));
    },
    onSuccess: (detail, { post }) => {
      if (pending(post.id) === 1)
        qc.setQueryData(postKeys.detail(post.id), detail);
    },
    onSettled: () => {
      if (pending() === 1)
        void qc.invalidateQueries({ queryKey: postKeys.all });
    },
  });
}
