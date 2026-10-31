import { APIError } from "better-auth/api";
import { and, count, eq } from "drizzle-orm";
import type { Locale } from "@/shared/locale";
import { type PendingInvitation, TEAM_SIZE } from "@/shared/team";
import type { Database } from "../db/client";
import {
  invitation,
  member,
  user as users,
  workspaceSettings,
} from "../db/schema";
import { AppError } from "../lib/errors";
import { pendingInvitationColumns, toPendingInvitation } from "./team-members";

const teamFull = () =>
  new AppError(409, "TEAM_FULL", `A team can have ${TEAM_SIZE} people`);

/** Better Auth's refusals as Pano's codes; anything else is rethrown. */
export function fromBetterAuth(err: unknown): never {
  if (err instanceof APIError) {
    const code = (err.body as { code?: string } | undefined)?.code;
    if (code === "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION") {
      throw new AppError(
        409,
        "ALREADY_ON_TEAM",
        "That person is already on the team"
      );
    }
    if (code === "INVITATION_LIMIT_REACHED") {
      throw new AppError(
        409,
        "TOO_MANY_INVITATIONS",
        "This workspace has too many invitations waiting"
      );
    }
    if (code === "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED") throw teamFull();
  }
  throw err;
}

/** One of the workspace's pending invitations, as Settings → Team lists it. */
export async function findPending(
  db: Database,
  workspaceId: string,
  id: string
): Promise<PendingInvitation> {
  const [row] = await db
    .select(pendingInvitationColumns)
    .from(invitation)
    .leftJoin(users, eq(users.id, invitation.inviterId))
    .where(
      and(
        eq(invitation.id, id),
        eq(invitation.organizationId, workspaceId),
        eq(invitation.status, "pending")
      )
    )
    .limit(1);
  if (!row) throw new AppError(404, "NOT_FOUND", "No such invitation");
  return toPendingInvitation(row);
}

/** Refuses another invitation once the team is as big as it can be. */
export async function refuseFullTeam(db: Database, workspaceId: string) {
  const [row] = await db
    .select({ people: count() })
    .from(member)
    .where(eq(member.organizationId, workspaceId));
  if ((row?.people ?? 0) >= TEAM_SIZE) throw teamFull();
}

/** Invitations are written in the workspace's language. */
export async function workspaceLocale(
  db: Database,
  workspaceId: string
): Promise<Locale> {
  const [row] = await db
    .select({ locale: workspaceSettings.defaultLocale })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);
  return row?.locale ?? "en";
}
