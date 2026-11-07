import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "./api";

/**
 * What /invite/<id> shows. It depends on who's signed in, so their id is in
 * the key: signing in or out never shows one person another's answer.
 */
export const invitationQueryOptions = (id: string, viewerId: string | null) =>
  queryOptions({
    queryKey: ["invitation", id, viewerId],
    queryFn: async () =>
      unwrap(await api.invitations[":id"].$get({ param: { id } })),
  });

/** Joins the team; answers the workspace's slug. */
export async function acceptInvitation(id: string) {
  return unwrap(await api.invitations[":id"].accept.$post({ param: { id } }));
}
