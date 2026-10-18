import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { Draft } from "immer";
import { everyCopyOfPost } from "@/features/posts/post-cache";
import { commentKeys, postKeys } from "@/lib/keys";
import {
  applyOptimistic,
  type CachePatch,
  patch,
  patchQueries,
} from "@/lib/optimistic";
import {
  type CommentPage,
  type CommentView,
  replyDepth,
  replyParentId,
} from "@/shared/comments";
import type { PostDetail } from "@/shared/posts";

type Pages = InfiniteData<CommentPage>;
type Edit = (comment: Draft<CommentView>) => void;

let lastDraftId = 0;

/**
 * A comment as it will look once saved, to show while it's sent. Its id is
 * negative, which marks it as a draft, until the server's copy replaces it.
 */
export function draftComment(input: {
  postId: number;
  parent: CommentView | null;
  body: string;
  authorName: string;
  official: boolean;
}): CommentView {
  lastDraftId -= 1;
  return {
    id: lastDraftId,
    postId: input.postId,
    parentId: input.parent ? replyParentId(input.parent) : null,
    depth: input.parent ? replyDepth(input.parent) : 0,
    body: input.body.trim(),
    author: { name: input.authorName },
    official: input.official,
    deleted: false,
    replyCount: 0,
    replies: [],
    canDelete: false,
    createdAt: new Date().toISOString(),
  };
}

export const isDraft = (comment: Pick<CommentView, "id">) => comment.id < 0;

function editAll(list: Draft<CommentView>[], edit: Edit) {
  for (const comment of list) {
    edit(comment);
    editAll(comment.replies, edit);
  }
}

/**
 * The same edit to every cached comment of a post: its thread, its open
 * reply pages, and the replies shown inside them.
 */
function everyComment(postId: number, edit: Edit): CachePatch {
  return patch<Pages>({ queryKey: commentKeys.post(postId) }, (data) => {
    for (const page of data.pages) editAll(page.items, edit);
  });
}

function countBy(postId: number, delta: number): CachePatch[] {
  return everyCopyOfPost(postId, (post) => {
    post.commentCount = Math.max(0, post.commentCount + delta);
  });
}

function pinnedIs(postId: number, comment: CommentView | null): CachePatch {
  return patch<PostDetail>({ queryKey: postKeys.detail(postId) }, (post) => {
    // The pinned copy shows without replies; the thread has them.
    post.pinned = comment === null ? null : { ...comment, replies: [] };
  });
}

/**
 * Shows a new comment at once: atop the thread, or last among its parent's
 * replies, and counts it on the parent and the post. Resolves to a rollback.
 */
export function optimisticAddComment(qc: QueryClient, draft: CommentView) {
  const { postId, parentId } = draft;
  const patches = countBy(postId, 1);
  if (parentId === null) {
    patches.push(
      patch<Pages>(
        { queryKey: commentKeys.thread(postId), exact: true },
        (data) => {
          data.pages[0]?.items.unshift(draft);
        }
      )
    );
  } else {
    patches.push(
      everyComment(postId, (comment) => {
        if (comment.id !== parentId) return;
        comment.replyCount += 1;
        comment.replies.push(draft);
      }),
      // The parent's reply pages, when open: the first page holds the newest
      // replies, oldest first.
      patch<Pages>(
        { queryKey: commentKeys.replies(postId, parentId), exact: true },
        (data) => {
          data.pages[0]?.items.push(draft);
        }
      )
    );
  }
  return applyOptimistic(qc, patches);
}

/** Puts the server's copy of a comment where its draft was. */
export function replaceDraft(
  qc: QueryClient,
  draftId: number,
  saved: CommentView
) {
  patchQueries(qc, [
    everyComment(saved.postId, (comment) => {
      if (comment.id === draftId) Object.assign(comment, saved);
    }),
  ]);
}

/**
 * Shows a comment as deleted at once: a placeholder, unpinned, and no longer
 * counted on the post. Resolves to a rollback.
 */
export function optimisticDeleteComment(qc: QueryClient, target: CommentView) {
  return applyOptimistic(qc, [
    everyComment(target.postId, (comment) => {
      if (comment.id !== target.id) return;
      comment.deleted = true;
      comment.body = "";
      comment.author = null;
      comment.official = false;
      comment.canDelete = false;
    }),
    patch<PostDetail>({ queryKey: postKeys.detail(target.postId) }, (post) => {
      if (post.pinned?.id === target.id) post.pinned = null;
    }),
    ...countBy(target.postId, -1),
  ]);
}

/** Pins `comment` above the thread at once, or unpins with null. Resolves to a rollback. */
export function optimisticPin(
  qc: QueryClient,
  postId: number,
  comment: CommentView | null
) {
  return applyOptimistic(qc, [pinnedIs(postId, comment)]);
}

export function writePin(
  qc: QueryClient,
  postId: number,
  pinned: CommentView | null
) {
  patchQueries(qc, [pinnedIs(postId, pinned)]);
}

/** Writes the server's comment count wherever the post is cached. */
export function writeCommentCount(
  qc: QueryClient,
  postId: number,
  commentCount: number
) {
  patchQueries(
    qc,
    everyCopyOfPost(postId, (post) => {
      post.commentCount = commentCount;
    })
  );
}
