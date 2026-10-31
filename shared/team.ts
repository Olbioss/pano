/** Roles on a workspace's team: Better Auth's organization roles. */
export const TEAM_ROLES = ["owner", "admin", "member"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

/** What an invitation or a role change can give: a workspace has one owner. */
export const ASSIGNABLE_ROLES = ["admin", "member"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

/** Owners and admins manage the team and the workspace's settings. */
export function managesTeam(role: string | undefined): boolean {
  return role === "owner" || role === "admin";
}

export type TeamMember = {
  userId: string;
  name: string;
  /** Null in the demo, where the addresses are made up. */
  email: string | null;
  role: TeamRole;
  joinedAt: string;
};

export type PendingInvitation = {
  id: string;
  email: string;
  role: AssignableRole;
  expiresAt: string;
  /** The inviter's display name; empty when they haven't set one. */
  invitedBy: string;
};

/** Settings → Team: the people on it, and who's been invited. */
export type TeamView = {
  members: TeamMember[];
  invitations: PendingInvitation[];
};

/** The most people a workspace's team can have. */
export const TEAM_SIZE = 50;

/** The most invitations a workspace can have waiting at once. */
export const PENDING_INVITATIONS = 20;

/** How long an invitation's link works. */
export const INVITATION_DAYS = 7;

/** An invitation sent, or sent again, and whether its email went out. */
export type SentInvitation = {
  invitation: PendingInvitation;
  emailSent: boolean;
};
