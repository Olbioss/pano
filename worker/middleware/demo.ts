import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { isDemoEmail } from "@/shared/demo";
import type { Database } from "../db/client";
import { organization, posts, workspaceSettings } from "../db/schema";
import { AppError } from "../lib/errors";
import type { UserEnv } from "./session";
import type { TeamEnv } from "./team";

type Target = "new-workspace" | "workspace" | "post";

/**
 * Demo accounts act only inside the demo workspace; runs after requireUser.
 * Anyone can get one with a click, so without this they would be a way to
 * post, vote and comment on real boards with no email at all.
 *
 * - "new-workspace": a demo account can't create a workspace.
 * - "workspace": the workspace in `:slug` must be the demo.
 * - "post": the post in `:id` must be in the demo.
 *
 * A target that doesn't exist passes, so the route answers its own 404.
 */
export const confineDemo = (target: Target) =>
  createMiddleware<UserEnv>(async (c, next) => {
    if (isDemoEmail(c.var.user.email)) {
      const inDemo =
        target === "new-workspace"
          ? false
          : target === "workspace"
            ? await workspaceIsDemo(c.var.db, c.req.param("slug") ?? "")
            : await postIsInDemo(c.var.db, Number(c.req.param("id")));
      if (inDemo === false) {
        throw new AppError(
          403,
          "DEMO_ONLY",
          "Demo accounts can only act in the demo workspace"
        );
      }
    }
    await next();
  });

/**
 * The demo workspace's name, language and boards stay as the nightly reset
 * makes them: one visitor deleting a board would empty the demo for everyone
 * until then. Runs after requireTeam.
 */
export const readOnlyInDemo = createMiddleware<TeamEnv>(async (c, next) => {
  if (c.var.workspace.isDemo) {
    throw new AppError(
      403,
      "DEMO_READ_ONLY",
      "The demo workspace's settings can't be changed"
    );
  }
  await next();
});

/** Whether the workspace is the demo, or null when there's no such workspace. */
async function workspaceIsDemo(db: Database, slug: string) {
  const [row] = await db
    .select({ isDemo: workspaceSettings.isDemo })
    .from(organization)
    .leftJoin(
      workspaceSettings,
      eq(workspaceSettings.organizationId, organization.id)
    )
    .where(eq(organization.slug, slug))
    .limit(1);
  return row ? (row.isDemo ?? false) : null;
}

/** Whether the post is in the demo, or null when there's no such post. */
async function postIsInDemo(db: Database, postId: number) {
  const [row] = await db
    .select({ isDemo: workspaceSettings.isDemo })
    .from(posts)
    .leftJoin(
      workspaceSettings,
      eq(workspaceSettings.organizationId, posts.organizationId)
    )
    .where(eq(posts.id, postId))
    .limit(1);
  return row ? (row.isDemo ?? false) : null;
}
