import { queryOptions } from "@tanstack/react-query";
import type { Locale } from "@/shared/locale";
import { api, unwrap } from "./api";

export const workspaceQueryOptions = (slug: string) =>
  queryOptions({
    queryKey: ["workspace", slug],
    queryFn: async () =>
      unwrap(await api.workspaces[":slug"].$get({ param: { slug } })),
  });

export async function createWorkspace(json: {
  name: string;
  slug: string;
  defaultLocale: Locale;
}) {
  return unwrap(await api.workspaces.$post({ json }));
}

export async function updateWorkspace(
  slug: string,
  json: { name?: string; defaultLocale?: Locale }
) {
  return unwrap(
    await api.workspaces[":slug"].$patch({ param: { slug }, json })
  );
}

export async function createBoard(slug: string, name: string) {
  return unwrap(
    await api.workspaces[":slug"].boards.$post({
      param: { slug },
      json: { name },
    })
  );
}

export async function renameBoard(slug: string, boardId: string, name: string) {
  return unwrap(
    await api.workspaces[":slug"].boards[":boardId"].$patch({
      param: { slug, boardId },
      json: { name },
    })
  );
}

export async function deleteBoard(slug: string, boardId: string) {
  return unwrap(
    await api.workspaces[":slug"].boards[":boardId"].$delete({
      param: { slug, boardId },
    })
  );
}

export async function reorderBoards(slug: string, ids: string[]) {
  return unwrap(
    await api.workspaces[":slug"].boards.order.$put({
      param: { slug },
      json: { ids },
    })
  );
}
