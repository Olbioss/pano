import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "./api";

/** Who's signed in, and their workspaces. Invalidate after sign-in or out. */
export const meQueryOptions = queryOptions({
  queryKey: ["me"],
  queryFn: async () => unwrap(await api.me.$get()),
  staleTime: 60_000,
});

/** Sets the signed-in person's display name. */
export async function updateMe(name: string) {
  return unwrap(await api.me.$patch({ json: { name } }));
}
