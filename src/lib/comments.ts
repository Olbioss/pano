import { infiniteQueryOptions } from "@tanstack/react-query";
import { api, unwrap } from "./api";
import { commentKeys } from "./keys";

const PAGE_SIZE = 20;

/** The API's paging query: the page before the comment `before`, if any. */
const pageQuery = (before: number | null) => ({
  limit: String(PAGE_SIZE),
  ...(before === null ? {} : { before: String(before) }),
});

/** A post's top-level comments, newest first; each next page is older. */
export const threadQueryOptions = (postId: number) =>
  infiniteQueryOptions({
    queryKey: commentKeys.thread(postId),
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.posts[":id"].comments.$get({
          param: { id: String(postId) },
          query: pageQuery(pageParam),
        })
      ),
    initialPageParam: null as number | null,
    // The oldest comment so far is the last one.
    getNextPageParam: (page) =>
      page.hasMore ? (page.items.at(-1)?.id ?? null) : null,
    staleTime: 30_000,
  });

/** A comment's replies: newest page first, each page oldest first. */
export const repliesQueryOptions = (postId: number, commentId: number) =>
  infiniteQueryOptions({
    queryKey: commentKeys.replies(postId, commentId),
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.comments[":id"].replies.$get({
          param: { id: String(commentId) },
          query: pageQuery(pageParam),
        })
      ),
    initialPageParam: null as number | null,
    // The oldest reply so far is the first one on the last page.
    getNextPageParam: (page) =>
      page.hasMore ? (page.items[0]?.id ?? null) : null,
    staleTime: 30_000,
  });

export async function addComment(
  postId: number,
  json: { body: string; parentId?: number }
) {
  return unwrap(
    await api.posts[":id"].comments.$post({
      param: { id: String(postId) },
      json,
    })
  );
}

export async function removeComment(commentId: number) {
  return unwrap(
    await api.comments[":id"].$delete({ param: { id: String(commentId) } })
  );
}

export async function pinComment(postId: number, commentId: number | null) {
  return unwrap(
    await api.posts[":id"].pin.$put({
      param: { id: String(postId) },
      json: { commentId },
    })
  );
}
