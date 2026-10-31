import { APIError } from "better-auth/api";
import { and, count, eq } from "drizzle-orm";
import type { InvitationState } from "@/shared/invitations";
import type { Locale } from "@/shared/locale";
import {
  type AssignableRole,
  INVITATION_DAYS,
  type PendingInvitation,
  TEAM_SIZE,
} from "@/shared/team";
import type { Database } from "../db/client";
import {
  invitation,
  member,
  organization,
  user as users,
  workspaceSettings,
} from "../db/schema";
import { AppError } from "../lib/errors";
import { pendingInvitationColumns, toPendingInvitation } from "./team-members";

const teamFull = () =>
  new AppError(409, "TEAM_FULL", `A team can have ${TEAM_SIZE} people`);

export const alreadyOnTeam = () =>
  new AppError(409, "ALREADY_ON_TEAM", "That person is already on the team");

export const invitationNotFound = () =>
  new AppError(404, "INVITATION_NOT_FOUND", "No such invitation");

export const wrongAddress = () =>
  new AppError(
    403,
    "INVITATION_WRONG_ADDRESS",
    "This invitation is for another address"
  );

/** Better Auth's refusals as Pano's codes; anything else is rethrown. */
export function fromBetterAuth(err: unknown): never {
  if (err instanceof APIError) {
    const code = (err.body as { code?: string } | undefined)?.code;
    if (code === "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION") {
      throw alreadyOnTeam();
    }
    if (code === "INVITATION_LIMIT_REACHED") {
      throw new AppError(
        409,
        "TOO_MANY_INVITATIONS",
        "This workspace has too many invitations waiting"
      );
    }
    if (code === "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED") throw teamFull();
    // Pano checks these first; Better Auth's checks cover a race.
    if (code === "INVITATION_NOT_FOUND") throw invitationNotFound();
    if (code === "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION") {
      throw wrongAddress();
    }
  }
  throw err;
}

/** An invitation with its workspace and inviter, for /invite/<id>. */
export async function findInvitation(db: Database, id: string) {
  const [row] = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      organizationId: invitation.organizationId,
      workspaceName: organization.name,
      workspaceSlug: organization.slug,
      inviterName: users.name,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .leftJoin(users, eq(users.id, invitation.inviterId))
    .where(eq(invitation.id, id))
    .limit(1);
  if (!row) throw invitationNotFound();
  return row;
}

/** Better Auth keeps an expired invitation pending; Pano says expired. */
export function invitationState(
  row: { status: string; expiresAt: Date },
  now = new Date()
): InvitationState {
  if (row.status === "accepted") return "accepted";
  if (row.status !== "pending") return "canceled";
  return row.expiresAt < now ? "expired" : "pending";
}

export async function isOnTeam(
  db: Database,
  organizationId: string,
  userId: string
) {
  const [row] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(eq(member.organizationId, organizationId), eq(member.userId, userId))
    )
    .limit(1);
  return row !== undefined;
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

/**
 * Readies an address's waiting invitation for Better Auth's resend, which
 * finds only invitations that haven't expired and renews only the expiry:
 * the invitation takes the role it's sent with now, and an expired one
 * comes back instead of getting a twin.
 */
export async function refreshPending(
  db: Database,
  input: { organizationId: string; email: string; role: AssignableRole },
  now = new Date()
) {
  await db
    .update(invitation)
    .set({
      role: input.role,
      expiresAt: new Date(now.getTime() + INVITATION_DAYS * 86_400_000),
    })
    .where(
      and(
        eq(invitation.organizationId, input.organizationId),
        eq(invitation.email, input.email),
        eq(invitation.status, "pending")
      )
    );
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
