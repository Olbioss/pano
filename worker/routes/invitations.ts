import { Hono } from "hono";
import { isDemoEmail } from "@/shared/demo";
import type { SuccessResponse } from "@/shared/envelope";
import { type InvitationView, maskEmail } from "@/shared/invitations";
import { inviteSchema } from "@/shared/schemas";
import type { AssignableRole, SentInvitation } from "@/shared/team";
import type { Auth } from "../auth";
import type { Database } from "../db/client";
import type { AppEnv, Bindings } from "../env";
import { AppError } from "../lib/errors";
import { validate } from "../lib/validate";
import type { AppMailer } from "../mail/mailer";
import { readOnlyInDemo } from "../middleware/demo";
import { rateLimit } from "../middleware/rate-limit";
import { readSession, requireUser } from "../middleware/session";
import {
  requireAdmin,
  requireTeam,
  type TeamWorkspace,
} from "../middleware/team";
import { claimDailyEmail } from "../services/email-budget";
import {
  alreadyOnTeam,
  findInvitation,
  findPending,
  fromBetterAuth,
  invitationNotFound,
  invitationState,
  isOnTeam,
  refreshPending,
  refuseFullTeam,
  workspaceLocale,
  wrongAddress,
} from "../services/invitations";

/** Invitations and resends one person can send an hour, in production. */
const INVITES_PER_HOUR = 10;

/** In production every invitation takes one of the day's emails first. */
async function claimEmail(db: Database, env: Bindings) {
  if (
    env.ENVIRONMENT === "production" &&
    !(await claimDailyEmail(db, "notice"))
  ) {
    throw new AppError(429, "EMAIL_BUDGET", "Today's email is spent");
  }
}

/**
 * Invites `email` through Better Auth, which checks the inviter's role and
 * whether the address is on the team already. A pending invitation for the
 * same address, expired or not, gets the role asked for and a fresh expiry
 * instead of a twin. Answers its id.
 */
async function invite(
  auth: Auth,
  db: Database,
  headers: Headers,
  input: { organizationId: string; email: string; role: AssignableRole }
) {
  await refreshPending(db, input);
  try {
    const sent = await auth.api.createInvitation({
      body: { ...input, resend: true },
      headers,
    });
    return sent.id;
  } catch (err) {
    fromBetterAuth(err);
  }
}

/**
 * Emails the invitation in the workspace's language, from the person
 * sending it (or the workspace, when they have no name). A failed email
 * leaves the invitation waiting, and the answer says so.
 */
async function emailInvitation(
  deps: {
    db: Database;
    mailer: AppMailer;
    origin: string;
    workspace: TeamWorkspace;
    senderName: string;
  },
  id: string
): Promise<SentInvitation> {
  const invitation = await findPending(deps.db, deps.workspace.id, id);
  try {
    await deps.mailer.sendInvitation({
      to: invitation.email,
      locale: await workspaceLocale(deps.db, deps.workspace.id),
      inviter: deps.senderName || deps.workspace.name,
      workspaceName: deps.workspace.name,
      role: invitation.role,
      url: new URL(`/invite/${invitation.id}`, deps.origin).toString(),
      expiresAt: new Date(invitation.expiresAt),
    });
    return { invitation, emailSent: true };
  } catch (err) {
    console.error("[invite] the email couldn't be sent:", err);
    return { invitation, emailSent: false };
  }
}

/**
 * Under /workspaces: inviting people to the team, and resending and
 * cancelling invitations. Owners and admins only; never in the demo.
 */
export const workspaceInvitationRoutes = new Hono<AppEnv>()
  .post(
    "/:slug/invitations",
    requireUser,
    requireTeam,
    readOnlyInDemo,
    requireAdmin,
    validate("json", inviteSchema),
    rateLimit("invite", INVITES_PER_HOUR, 3600, "INVITE_LIMIT"),
    async (c) => {
      const { email, role } = c.req.valid("json");
      const workspace = c.var.workspace;
      await refuseFullTeam(c.var.db, workspace.id);
      await claimEmail(c.var.db, c.env);
      const id = await invite(c.var.auth(), c.var.db, c.req.raw.headers, {
        organizationId: workspace.id,
        email: email.toLowerCase(),
        role,
      });
      const sent = await emailInvitation(
        {
          db: c.var.db,
          mailer: c.var.mailer,
          origin: c.env.BETTER_AUTH_URL,
          workspace,
          senderName: c.var.user.name,
        },
        id
      );
      return c.json<SuccessResponse<SentInvitation>>(
        { success: true, data: sent },
        201
      );
    }
  )
  .post(
    "/:slug/invitations/:id/resend",
    requireUser,
    requireTeam,
    readOnlyInDemo,
    requireAdmin,
    rateLimit("invite", INVITES_PER_HOUR, 3600, "INVITE_LIMIT"),
    async (c) => {
      const workspace = c.var.workspace;
      const pending = await findPending(
        c.var.db,
        workspace.id,
        c.req.param("id")
      );
      await claimEmail(c.var.db, c.env);
      const id = await invite(c.var.auth(), c.var.db, c.req.raw.headers, {
        organizationId: workspace.id,
        email: pending.email,
        role: pending.role,
      });
      const sent = await emailInvitation(
        {
          db: c.var.db,
          mailer: c.var.mailer,
          origin: c.env.BETTER_AUTH_URL,
          workspace,
          senderName: c.var.user.name,
        },
        id
      );
      return c.json<SuccessResponse<SentInvitation>>({
        success: true,
        data: sent,
      });
    }
  )
  .delete(
    "/:slug/invitations/:id",
    requireUser,
    requireTeam,
    readOnlyInDemo,
    requireAdmin,
    async (c) => {
      const pending = await findPending(
        c.var.db,
        c.var.workspace.id,
        c.req.param("id")
      );
      try {
        await c.var.auth().api.cancelInvitation({
          body: { invitationId: pending.id },
          headers: c.req.raw.headers,
        });
      } catch (err) {
        fromBetterAuth(err);
      }
      return c.json<SuccessResponse<{ id: string }>>({
        success: true,
        data: { id: pending.id },
      });
    }
  );

/**
 * Under /invitations: the page an invitation's link opens. Anyone with the
 * link sees the workspace, the inviter, the role and the masked address;
 * only the invited address can accept.
 */
export const invitationRoutes = new Hono<AppEnv>()
  .get("/:id", async (c) => {
    const row = await findInvitation(c.var.db, c.req.param("id"));
    const viewer = (await readSession(c))?.user ?? null;
    const view: InvitationView = {
      id: row.id,
      workspace: { name: row.workspaceName, slug: row.workspaceSlug },
      inviter: row.inviterName || row.workspaceName,
      role: row.role === "admin" ? "admin" : "member",
      email: maskEmail(row.email),
      state: invitationState(row),
      forYou:
        viewer !== null &&
        viewer.email.toLowerCase() === row.email.toLowerCase(),
      onTeam:
        viewer !== null &&
        (await isOnTeam(c.var.db, row.organizationId, viewer.id)),
    };
    return c.json<SuccessResponse<InvitationView>>({
      success: true,
      data: view,
    });
  })
  .post("/:id/accept", requireUser, async (c) => {
    const user = c.var.user;
    if (isDemoEmail(user.email)) {
      throw new AppError(
        403,
        "DEMO_ONLY",
        "Demo accounts can only act in the demo workspace"
      );
    }
    const row = await findInvitation(c.var.db, c.req.param("id"));
    const state = invitationState(row);
    if (state === "expired") {
      throw new AppError(410, "INVITATION_EXPIRED", "This invitation expired");
    }
    if (state !== "pending") throw invitationNotFound();
    if (user.email.toLowerCase() !== row.email.toLowerCase()) {
      throw wrongAddress();
    }
    // Better Auth would add a second membership.
    if (await isOnTeam(c.var.db, row.organizationId, user.id)) {
      throw alreadyOnTeam();
    }
    try {
      await c.var.auth().api.acceptInvitation({
        body: { invitationId: row.id },
        headers: c.req.raw.headers,
      });
    } catch (err) {
      fromBetterAuth(err);
    }
    return c.json<SuccessResponse<{ slug: string }>>({
      success: true,
      data: { slug: row.workspaceSlug },
    });
  });
