import { Hono } from "hono";
import type { ChangelogPage } from "@/shared/changelog";
import type { SuccessResponse } from "@/shared/envelope";
import { changelogQuerySchema } from "@/shared/schemas";
import type { AppEnv } from "../env";
import { validate } from "../lib/validate";
import { listChangelog } from "../services/changelog";
import { findWorkspace } from "./workspaces";

/** Under /workspaces: what a workspace has shipped, for anyone to read. */
export const workspaceChangelogRoutes = new Hono<AppEnv>().get(
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
);
