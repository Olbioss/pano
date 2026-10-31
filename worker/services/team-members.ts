import { and, asc, eq, sql } from "drizzle-orm";
import type {
  AssignableRole,
  PendingInvitation,
  TeamMember,
  TeamRole,
  TeamView,
} from "@/shared/team";
import type { Database } from "../db/client";
import { invitation, member, user as users } from "../db/schema";
import { AppError } from "../lib/errors";

/** What Settings → Team shows of a pending invitation; join the inviter as `users`. */
export const pendingInvitationColumns = {
  id: invitation.id,
  email: invitation.email,
  role: invitation.role,
  expiresAt: invitation.expiresAt,
  invitedBy: users.name,
};

export function toPendingInvitation(row: {
  id: string;
  email: string;
  role: string | null;
  expiresAt: Date;
  invitedBy: string | null;
}): PendingInvitation {
  return {
    id: row.id,
    email: row.email,
    role: row.role === "admin" ? "admin" : "member",
    expiresAt: row.expiresAt.toISOString(),
    invitedBy: row.invitedBy ?? "",
  };
}

/**
 * A workspace's team, owner first, then admins, then members, each group by
 * when they joined, and its pending invitations, oldest first. In the demo
 * the addresses are made up, so they're left out.
 */
export async function listTeam(
  db: Database,
  workspace: { id: string; isDemo: boolean }
): Promise<TeamView> {
  const people = await db
    .select({
      userId: member.userId,
      name: users.name,
      email: users.email,
      role: member.role,
      joinedAt: member.createdAt,
    })
    .from(member)
    .innerJoin(users, eq(users.id, member.userId))
    .where(eq(member.organizationId, workspace.id))
    .orderBy(
      sql`case ${member.role} when 'owner' then 0 when 'admin' then 1 else 2 end`,
      asc(member.createdAt)
    );
  const pending = workspace.isDemo
    ? []
    : await db
        .select(pendingInvitationColumns)
        .from(invitation)
        .leftJoin(users, eq(users.id, invitation.inviterId))
        .where(
          and(
            eq(invitation.organizationId, workspace.id),
            eq(invitation.status, "pending")
          )
        )
        .orderBy(asc(invitation.createdAt));
  return {
    members: people.map(
      (row): TeamMember => ({
        userId: row.userId,
        name: row.name,
        email: workspace.isDemo ? null : row.email,
        role: row.role as TeamRole,
        joinedAt: row.joinedAt.toISOString(),
      })
    ),
    invitations: pending.map(toPendingInvitation),
  };
}

/** The membership `userId` has on the workspace's team; the owner's can't change. */
async function changeableMember(
  db: Database,
  workspaceId: string,
  userId: string
) {
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(eq(member.organizationId, workspaceId), eq(member.userId, userId))
    )
    .limit(1);
  if (!row)
    throw new AppError(404, "NOT_FOUND", "That person isn't on the team");
  if (row.role === "owner") {
    throw new AppError(
      403,
      "OWNER_PROTECTED",
      "The workspace's owner can't be changed or removed"
    );
  }
}

/** Makes someone on the team an admin or a member. */
export async function changeRole(
  db: Database,
  input: { workspaceId: string; userId: string; role: AssignableRole }
) {
  await changeableMember(db, input.workspaceId, input.userId);
  await db
    .update(member)
    .set({ role: input.role })
    .where(
      and(
        eq(member.organizationId, input.workspaceId),
        eq(member.userId, input.userId)
      )
    );
}

/** Takes someone off the team: removed by an admin, or leaving. */
export async function removeMember(
  db: Database,
  input: { workspaceId: string; userId: string }
) {
  await changeableMember(db, input.workspaceId, input.userId);
  await db
    .delete(member)
    .where(
      and(
        eq(member.organizationId, input.workspaceId),
        eq(member.userId, input.userId)
      )
    );
}
