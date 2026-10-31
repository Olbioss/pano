import { Hono } from "hono";
import type { SuccessResponse } from "@/shared/envelope";
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
import { requireUser } from "../middleware/session";
import {
  requireAdmin,
  requireTeam,
  type TeamWorkspace,
} from "../middleware/team";
import { claimDailyEmail } from "../services/email-budget";
import {
  findPending,
  fromBetterAuth,
  refuseFullTeam,
  workspaceLocale,
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
 * same address gets a fresh expiry instead of a twin. Answers its id.
 */
async function invite(
  auth: Auth,
  headers: Headers,
  input: { organizationId: string; email: string; role: AssignableRole }
) {
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
    rateLimit("invite", INVITES_PER_HOUR, 3600),
    async (c) => {
      const { email, role } = c.req.valid("json");
      const workspace = c.var.workspace;
      await refuseFullTeam(c.var.db, workspace.id);
      await claimEmail(c.var.db, c.env);
      const id = await invite(c.var.auth, c.req.raw.headers, {
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
    rateLimit("invite", INVITES_PER_HOUR, 3600),
    async (c) => {
      const workspace = c.var.workspace;
      const pending = await findPending(
        c.var.db,
        workspace.id,
        c.req.param("id")
      );
      await claimEmail(c.var.db, c.env);
      const id = await invite(c.var.auth, c.req.raw.headers, {
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
        await c.var.auth.api.cancelInvitation({
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
