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

/**
 * The workspace an account owns. There's one at most, and being on another
 * team doesn't count, so someone invited elsewhere can still make theirs.
 */
export function ownedWorkspace<W extends { role: string }>(workspaces: W[]) {
  return workspaces.find((workspace) => workspace.role === "owner");
}
