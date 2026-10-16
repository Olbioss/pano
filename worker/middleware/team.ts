import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { member, organization } from "../db/schema";
import type { AppEnv, Bindings } from "../env";
import { AppError } from "../lib/errors";
import type { SessionUser } from "./session";

export type TeamWorkspace = {
  id: string;
  slug: string;
  name: string;
  role: string;
};

type TeamEnv = {
  Bindings: Bindings;
  Variables: AppEnv["Variables"] & {
    user: SessionUser;
    workspace: TeamWorkspace;
  };
};

/**
 * For routes under /workspaces/:slug that only the workspace's team may use;
 * runs after requireUser. Any membership counts: owner, admin or member.
 * Unknown workspace → 404. Signed in but not on the team → 403.
 */
export const requireTeam = createMiddleware<TeamEnv>(async (c, next) => {
  const slug = c.req.param("slug") ?? "";
  const [row] = await c.var.db
    .select({
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      role: member.role,
    })
    .from(organization)
    .leftJoin(
      member,
      and(
        eq(member.organizationId, organization.id),
        eq(member.userId, c.var.user.id)
      )
    )
    .where(eq(organization.slug, slug))
    .limit(1);
  if (!row) throw new AppError(404, "NOT_FOUND", "Workspace not found");
  if (!row.role) {
    throw new AppError(403, "FORBIDDEN", "Only the workspace team can do that");
  }
  c.set("workspace", {
    id: row.id,
    slug: row.slug,
    name: row.name,
    role: row.role,
  });
  await next();
});
