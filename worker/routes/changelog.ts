import { Hono } from "hono";
import type { ChangelogPage } from "@/shared/changelog";
import type { SuccessResponse } from "@/shared/envelope";
import { changelogQuerySchema } from "@/shared/schemas";
import type { AppEnv } from "../env";
import { validate } from "../lib/validate";
import {
  CHANGELOG_CACHE_SECONDS,
  changelogFeed,
  changelogKey,
  listChangelog,
} from "../services/changelog";
import { findWorkspace } from "./workspaces";

/** Under /workspaces: what a workspace has shipped, for anyone to read. */
export const workspaceChangelogRoutes = new Hono<AppEnv>()
  .get(
    "/:slug/changelog",
    validate("query", changelogQuerySchema),
    async (c) => {
      const workspace = await findWorkspace(c.var.db, c.req.param("slug"));
      const page = await listChangelog(c.var.db, {
        workspaceId: workspace.id,
        page: c.req.valid("query").page,
      });
      return c.json<SuccessResponse<ChangelogPage>>({
        success: true,
        data: page,
      });
    }
  )
  // Feed readers come back every hour or so. Each visit that reached
  // Postgres would wake Neon, so the rendered feed waits in KV for an hour,
  // and a hit never opens a connection. Changes drop it (dropChangelog).
  .get("/:slug/changelog.atom", async (c) => {
    const slug = c.req.param("slug");
    const key = changelogKey(slug);
    let feed = await c.env.FLAGS.get(key);
    if (feed === null) {
      const workspace = await findWorkspace(c.var.db, slug);
      const { entries } = await listChangelog(c.var.db, {
        workspaceId: workspace.id,
        page: 1,
      });
      feed = changelogFeed({
        origin: c.env.BETTER_AUTH_URL,
        workspace,
        entries,
      });
      c.executionCtx.waitUntil(
        c.env.FLAGS.put(key, feed, { expirationTtl: CHANGELOG_CACHE_SECONDS })
      );
    }
    return c.body(feed, 200, {
      "content-type": "application/atom+xml; charset=utf-8",
    });
  });
