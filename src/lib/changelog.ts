import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "./api";
import { postKeys } from "./keys";

export const changelogQueryOptions = (workspace: string, page: number) =>
  queryOptions({
    queryKey: postKeys.changelog(workspace, page),
    queryFn: async () =>
      unwrap(
        await api.workspaces[":slug"].changelog.$get({
          param: { slug: workspace },
          query: { page: String(page) },
        })
      ),
  });

/** The changelog's Atom feed, for feed readers. */
export const changelogFeedUrl = (workspace: string) =>
  `/api/workspaces/${encodeURIComponent(workspace)}/changelog.atom`;
