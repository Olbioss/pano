import type { Draft } from "immer";
import { postKeys } from "@/lib/keys";
import { type CachePatch, patch } from "@/lib/optimistic";
import type {
  FeedPage,
  PostDetail,
  PostSummary,
  Roadmap,
} from "@/shared/posts";
import { ROADMAP_STATUSES } from "@/shared/status";

/**
 * The same edit to one post wherever it's cached: every feed page, its own
 * page, the similar-requests lists, and the roadmaps.
 */
export function everyCopyOfPost(
  postId: number,
  edit: (post: Draft<PostSummary>) => void
): CachePatch[] {
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
    patch<Roadmap>({ queryKey: postKeys.roadmapAll }, (board) => {
      for (const status of ROADMAP_STATUSES) {
        for (const item of board[status]) {
          if (item.id === postId) edit(item);
        }
      }
    }),
  ];
}
