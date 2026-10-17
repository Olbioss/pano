import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { SuccessResponse } from "@/shared/envelope";
import { member, organization } from "../db/schema";
import type { AppEnv } from "../env";
import { readSession } from "../middleware/session";

type Me = {
  user: { id: string; name: string; email: string } | null;
  workspaces: { id: string; slug: string; name: string; role: string }[];
};

/** Who's signed in, and the workspaces where they're on the team. */
export const meRoutes = new Hono<AppEnv>().get("/", async (c) => {
  const session = await readSession(c);
  if (!session) {
    return c.json<SuccessResponse<Me>>({
      success: true,
      data: { user: null, workspaces: [] },
    });
  }
  const { id, name, email } = session.user;
  const workspaces = await c.var.db
    .select({
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, id))
    .orderBy(asc(organization.createdAt));
  return c.json<SuccessResponse<Me>>({
    success: true,
    data: { user: { id, name, email }, workspaces },
  });
});
