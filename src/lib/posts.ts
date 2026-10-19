import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import type { PostStatus } from "@/shared/status";
import { api, unwrap } from "./api";
import { type FeedParams, postKeys } from "./keys";

/** The feed's filters as the API reads them: strings, empty ones left out. */
function feedQuery(params: FeedParams) {
  return {
    sort: params.sort,
    page: String(params.page),
    ...(params.board ? { board: params.board } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.q ? { q: params.q } : {}),
  };
}

export const feedQueryOptions = (workspace: string, params: FeedParams) =>
  queryOptions({
    queryKey: postKeys.feed(workspace, params),
    queryFn: async () =>
      unwrap(
        await api.workspaces[":slug"].posts.$get({
          param: { slug: workspace },
          query: feedQuery(params),
        })
      ),
    // Keep the current page on screen while the next one loads.
    placeholderData: keepPreviousData,
  });

export const postQueryOptions = (id: number) =>
  queryOptions({
    queryKey: postKeys.detail(id),
    queryFn: async () =>
      unwrap(await api.posts[":id"].$get({ param: { id: String(id) } })),
  });

export const similarQueryOptions = (workspace: string, q: string) =>
  queryOptions({
    queryKey: postKeys.similar(workspace, q),
    queryFn: async () =>
      unwrap(
        await api.workspaces[":slug"].similar.$get({
          param: { slug: workspace },
          query: { q },
        })
      ),
    enabled: q.length >= 3,
    staleTime: 30_000,
  });

export async function createPost(
  workspace: string,
  json: { boardId: string; title: string; body: string }
) {
  return unwrap(
    await api.workspaces[":slug"].posts.$post({
      param: { slug: workspace },
      json,
    })
  );
}

export async function updatePost(
  id: number,
  json: { title?: string; body?: string }
) {
  return unwrap(
    await api.posts[":id"].$patch({ param: { id: String(id) }, json })
  );
}

export async function deletePost(id: number) {
  return unwrap(await api.posts[":id"].$delete({ param: { id: String(id) } }));
}

export async function castVote(id: number, voted: boolean) {
  return unwrap(
    await api.posts[":id"].vote.$put({
      param: { id: String(id) },
      json: { voted },
    })
  );
}

export const roadmapQueryOptions = (workspace: string) =>
  queryOptions({
    queryKey: postKeys.roadmap(workspace),
    queryFn: async () =>
      unwrap(
        await api.workspaces[":slug"].roadmap.$get({
          param: { slug: workspace },
        })
      ),
  });

export async function changeStatus(
  id: number,
  json: { status: PostStatus; note?: string }
) {
  return unwrap(
    await api.posts[":id"].status.$patch({ param: { id: String(id) }, json })
  );
}

export async function mergePost(id: number, intoId: number) {
  return unwrap(
    await api.posts[":id"].merge.$post({
      param: { id: String(id) },
      json: { intoId },
    })
  );
}

export async function setSubscription(id: number, subscribed: boolean) {
  return unwrap(
    await api.posts[":id"].subscription.$put({
      param: { id: String(id) },
      json: { subscribed },
    })
  );
}
