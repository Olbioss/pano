import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "./api";

/** What /invite/<id> shows; it depends on who's signed in. */
export const invitationQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["invitation", id],
    queryFn: async () =>
      unwrap(await api.invitations[":id"].$get({ param: { id } })),
  });

/** Joins the team; answers the workspace's slug. */
export async function acceptInvitation(id: string) {
  return unwrap(await api.invitations[":id"].accept.$post({ param: { id } }));
}
