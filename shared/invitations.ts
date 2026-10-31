import type { AssignableRole } from "./team";

/**
 * "sam@studio.dev" → "s•••@studio.dev": enough for its owner to recognize,
 * not enough for someone else holding the link to read.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "•••";
  return `${email[0]}•••${email.slice(at)}`;
}

/** Where an invitation stands; a declined one reads as cancelled. */
export type InvitationState = "pending" | "expired" | "accepted" | "canceled";

/** What /invite/<id> shows to whoever has the link. */
export type InvitationView = {
  id: string;
  workspace: { name: string; slug: string };
  /** Who invited: their display name, or the workspace's when they have none. */
  inviter: string;
  role: AssignableRole;
  /** The invited address, masked. */
  email: string;
  state: InvitationState;
  /** Whether the person signed in is the invited address. */
  forYou: boolean;
  /** Whether the person signed in is on that team already. */
  onTeam: boolean;
};
