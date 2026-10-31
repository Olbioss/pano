import { queryOptions } from "@tanstack/react-query";
import type { AssignableRole } from "@/shared/team";
import { api, unwrap } from "./api";

/** Settings → Team: the people on it and the invitations waiting. */
export const teamQueryOptions = (slug: string) =>
  queryOptions({
    queryKey: ["team", slug],
    queryFn: async () =>
      unwrap(await api.workspaces[":slug"].team.$get({ param: { slug } })),
  });

export async function invite(
  slug: string,
  json: { email: string; role: AssignableRole }
) {
  return unwrap(
    await api.workspaces[":slug"].invitations.$post({ param: { slug }, json })
  );
}

export async function resendInvitation(slug: string, id: string) {
  return unwrap(
    await api.workspaces[":slug"].invitations[":id"].resend.$post({
      param: { slug, id },
    })
  );
}

export async function cancelInvitation(slug: string, id: string) {
  return unwrap(
    await api.workspaces[":slug"].invitations[":id"].$delete({
      param: { slug, id },
    })
  );
}

export async function changeRole(
  slug: string,
  userId: string,
  role: AssignableRole
) {
  return unwrap(
    await api.workspaces[":slug"].members[":userId"].$patch({
      param: { slug, userId },
      json: { role },
    })
  );
}

/** Removes someone from the team, or, with your own id, leaves it. */
export async function removeFromTeam(slug: string, userId: string) {
  return unwrap(
    await api.workspaces[":slug"].members[":userId"].$delete({
      param: { slug, userId },
    })
  );
}
