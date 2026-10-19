import { Hono } from "hono";
import type { SuccessResponse } from "@/shared/envelope";
import type { Roadmap } from "@/shared/posts";
import type { AppEnv } from "../env";
import { readViewerId } from "../middleware/session";
import { listRoadmap } from "../services/roadmap";
import { findWorkspace } from "./workspaces";

/** Under /workspaces: a workspace's public roadmap. */
export const workspaceRoadmapRoutes = new Hono<AppEnv>().get(
  "/:slug/roadmap",
  async (c) => {
    const workspace = await findWorkspace(c.var.db, c.req.param("slug"));
    const roadmap = await listRoadmap(c.var.db, {
      workspaceId: workspace.id,
      viewerId: await readViewerId(c),
    });
    return c.json<SuccessResponse<Roadmap>>({ success: true, data: roadmap });
  }
);
