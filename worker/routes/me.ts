import { and, asc, eq, isNotNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { isSessionFresh } from "@/shared/account";
import { isDemoEmail } from "@/shared/demo";
import type { SuccessResponse } from "@/shared/envelope";
import { passwordSchema } from "@/shared/password";
import { updateMeSchema } from "@/shared/schemas";
import { isBreached } from "../auth/password";
import type { Database } from "../db/client";
import { account, member, organization } from "../db/schema";
import type { AppEnv, Bindings } from "../env";
import { cleanDisplayName } from "../lib/display-name";
import { AppError } from "../lib/errors";
import { validate } from "../lib/validate";
import { rateLimit } from "../middleware/rate-limit";
import { readSession, requireUser } from "../middleware/session";

type Me = {
  user: {
    id: string;
    name: string;
    email: string;
    /** When this session signed in: adding a sign-in method needs it recent. */
    sessionStartedAt: string;
  } | null;
  workspaces: { id: string; slug: string; name: string; role: string }[];
  /** The ways to sign in this deployment offers besides codes and passwords. */
  signIn: { github: boolean };
};

const setPasswordSchema = z.object({ password: passwordSchema });

/** GitHub sign-in is on only when both of its secrets are set. */
function signInMethods(env: Bindings): Me["signIn"] {
  return { github: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) };
}

function workspacesOf(db: Database, userId: string) {
  return db
    .select({
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId))
    .orderBy(asc(organization.createdAt));
}

/** Who's signed in, the workspaces where they're on the team, and renaming. */
export const meRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const session = await readSession(c);
    if (!session) {
      return c.json<SuccessResponse<Me>>({
        success: true,
        data: { user: null, workspaces: [], signIn: signInMethods(c.env) },
      });
    }
    const { id, name, email } = session.user;
    return c.json<SuccessResponse<Me>>({
      success: true,
      data: {
        user: {
          id,
          name,
          email,
          sessionStartedAt: new Date(session.session.createdAt).toISOString(),
        },
        workspaces: await workspacesOf(c.var.db, id),
        signIn: signInMethods(c.env),
      },
    });
  })
  .patch("/", requireUser, validate("json", updateMeSchema), async (c) => {
    const name = cleanDisplayName(c.req.valid("json").name);
    // Through Better Auth, so the session's cached copy of the user is
    // rewritten too; its cookie goes back with this response.
    const { headers } = await c.var.auth().api.updateUser({
      body: { name },
      headers: c.req.raw.headers,
      returnHeaders: true,
    });
    for (const cookie of headers.getSetCookie()) {
      c.header("set-cookie", cookie, { append: true });
    }
    const { id, email } = c.var.user;
    return c.json<SuccessResponse<Me>>({
      success: true,
      data: {
        user: {
          id,
          name,
          email,
          sessionStartedAt: c.var.sessionStartedAt.toISOString(),
        },
        workspaces: await workspacesOf(c.var.db, id),
        signIn: signInMethods(c.env),
      },
    });
  })
  /**
   * A first password for an account made with email codes or GitHub.
   * Better Auth's own set-password can only be called from the server.
   * Changing an existing password goes through Better Auth's
   * /change-password, which asks for the current one.
   */
  .post(
    "/password",
    requireUser,
    rateLimit("set-password", 5, 3600),
    validate("json", setPasswordSchema),
    async (c) => {
      if (isDemoEmail(c.var.user.email)) {
        throw new AppError(
          403,
          "DEMO_ONLY",
          "Demo accounts can't add a way to sign in"
        );
      }
      if (!isSessionFresh(c.var.sessionStartedAt)) {
        throw new AppError(
          403,
          "SESSION_NOT_FRESH",
          "Sign in again to add a way to sign in"
        );
      }
      if (await hasPassword(c.var.db, c.var.user.id)) {
        throw new AppError(
          409,
          "PASSWORD_EXISTS",
          "There's a password already"
        );
      }
      const { password } = c.req.valid("json");
      if (c.env.ENVIRONMENT === "production" && (await isBreached(password))) {
        throw new AppError(
          400,
          "PASSWORD_COMPROMISED",
          "This password appears in a data breach"
        );
      }
      await c.var.auth().api.setPassword({
        body: { newPassword: password },
        headers: c.req.raw.headers,
      });
      return c.json<SuccessResponse<{ password: true }>>({
        success: true,
        data: { password: true },
      });
    }
  );

async function hasPassword(db: Database, userId: string) {
  const [found] = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, "credential"),
        isNotNull(account.password)
      )
    )
    .limit(1);
  return found !== undefined;
}
