import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { SuccessResponse } from "@/shared/envelope";
import { updateMeSchema } from "@/shared/schemas";
import type { Database } from "../db/client";
import { member, organization } from "../db/schema";
import type { AppEnv } from "../env";
import { cleanDisplayName } from "../lib/display-name";
import { validate } from "../lib/validate";
import { readSession, requireUser } from "../middleware/session";

type Me = {
  user: { id: string; name: string; email: string } | null;
  workspaces: { id: string; slug: string; name: string; role: string }[];
};

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
        data: { user: null, workspaces: [] },
      });
    }
    const { id, name, email } = session.user;
    return c.json<SuccessResponse<Me>>({
      success: true,
      data: {
        user: { id, name, email },
        workspaces: await workspacesOf(c.var.db, id),
      },
    });
  })
  .patch("/", requireUser, validate("json", updateMeSchema), async (c) => {
    const name = cleanDisplayName(c.req.valid("json").name);
    // Through Better Auth, so the session's cached copy of the user is
    // rewritten too; its cookie goes back with this response.
    const { headers } = await c.var.auth.api.updateUser({
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
        user: { id, name, email },
        workspaces: await workspacesOf(c.var.db, id),
      },
    });
  });
