import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "use-intl";
import { addComment, pinComment, removeComment } from "@/lib/comments";
import { apiErrorKey } from "@/lib/error-text";
import { commentKeys, commentMutationKey, postKeys } from "@/lib/keys";
import type { CommentView } from "@/shared/comments";
import {
  optimisticAddComment,
  optimisticDeleteComment,
  optimisticPin,
  replaceDraft,
  writeCommentCount,
  writePin,
} from "./comment-cache";

/**
 * What every change to one post's comments shares. The cache changes at
 * once and rolls back on failure, with a toast. Answers are written as they
 * arrive. Once the last change to the post settles, everything showing its
 * comments or its count is fetched again. That also mends anything a
 * neighbouring change's rollback undid.
 */
function useCommentChange(postId: number) {
  const qc = useQueryClient();
  const tErrors = useTranslations("errors");
  const mutationKey = commentMutationKey(postId);
  // In its own callbacks a mutation still counts itself.
  const isLast = () => qc.isMutating({ mutationKey }) === 1;
  const fail = (error: unknown) => {
    toast.error(tErrors(apiErrorKey(error)));
  };
  const resync = async () => {
    if (!isLast()) return;
    await Promise.all([
      qc.invalidateQueries({ queryKey: commentKeys.post(postId) }),
      qc.invalidateQueries({ queryKey: postKeys.all }),
    ]);
  };
  return { qc, mutationKey, isLast, fail, resync };
}

/**
 * Adds a comment or a reply. The draft (from draftComment) shows at once,
 * then gives way to the server's copy, or disappears if saving fails.
 */
export function useAddComment(postId: number) {
  const { qc, mutationKey, isLast, fail, resync } = useCommentChange(postId);
  return useMutation({
    mutationKey,
    mutationFn: (draft: CommentView) =>
      addComment(
        postId,
        draft.parentId === null
          ? { body: draft.body }
          : { body: draft.body, parentId: draft.parentId }
      ),
    onMutate: async (draft) => ({
      rollback: await optimisticAddComment(qc, draft),
    }),
    onError: (error, _draft, context) => {
      context?.rollback();
      fail(error);
    },
    onSuccess: (result, draft) => {
      replaceDraft(qc, draft.id, result.comment);
      if (isLast()) writeCommentCount(qc, postId, result.commentCount);
    },
    onSettled: resync,
  });
}

/** Deletes a comment: it turns into a placeholder at once. */
export function useDeleteComment(postId: number) {
  const { qc, mutationKey, isLast, fail, resync } = useCommentChange(postId);
  return useMutation({
    mutationKey,
    mutationFn: (comment: CommentView) => removeComment(comment.id),
    onMutate: async (comment) => ({
      rollback: await optimisticDeleteComment(qc, comment),
    }),
    onError: (error, _comment, context) => {
      context?.rollback();
      fail(error);
    },
    onSuccess: (result) => {
      if (isLast()) writeCommentCount(qc, postId, result.commentCount);
    },
    onSettled: resync,
  });
}

/** Pins a comment, or unpins with null. Pins go one at a time, so the last click wins. */
export function usePinComment(postId: number) {
  const { qc, mutationKey, isLast, fail, resync } = useCommentChange(postId);
  return useMutation({
    mutationKey,
    scope: { id: `pin:${postId}` },
    mutationFn: (comment: CommentView | null) =>
      pinComment(postId, comment?.id ?? null),
    onMutate: async (comment) => ({
      rollback: await optimisticPin(qc, postId, comment),
    }),
    onError: (error, _comment, context) => {
      context?.rollback();
      fail(error);
    },
    onSuccess: (result) => {
      if (isLast()) writePin(qc, postId, result.pinned);
    },
    onSettled: resync,
  });
}
