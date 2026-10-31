import { Hono } from "hono";
import type { SuccessResponse } from "@/shared/envelope";
import { changeRoleSchema } from "@/shared/schemas";
import { managesTeam, type TeamView } from "@/shared/team";
import type { AppEnv } from "../env";
import { validate } from "../lib/validate";
import { readOnlyInDemo } from "../middleware/demo";
import { requireUser } from "../middleware/session";
import { adminsOnly, requireAdmin, requireTeam } from "../middleware/team";
import { changeRole, listTeam, removeMember } from "../services/team-members";

/**
 * Under /workspaces: Settings → Team. Everyone on the team sees it; owners
 * and admins change roles and remove people, and anyone but the owner can
 * leave. The demo's team stays as the nightly reset makes it.
 */
export const workspaceTeamRoutes = new Hono<AppEnv>()
  .get("/:slug/team", requireUser, requireTeam, async (c) => {
    return c.json<SuccessResponse<TeamView>>({
      success: true,
      data: await listTeam(c.var.db, c.var.workspace),
    });
  })
  .patch(
    "/:slug/members/:userId",
    requireUser,
    requireTeam,
    readOnlyInDemo,
    requireAdmin,
    validate("json", changeRoleSchema),
    async (c) => {
      await changeRole(c.var.db, {
        workspaceId: c.var.workspace.id,
        userId: c.req.param("userId"),
        role: c.req.valid("json").role,
      });
      return c.json<SuccessResponse<TeamView>>({
        success: true,
        data: await listTeam(c.var.db, c.var.workspace),
      });
    }
  )
  .delete(
    "/:slug/members/:userId",
    requireUser,
    requireTeam,
    readOnlyInDemo,
    async (c) => {
      const userId = c.req.param("userId");
      const leaving = userId === c.var.user.id;
      if (!leaving && !managesTeam(c.var.workspace.role)) throw adminsOnly();
      await removeMember(c.var.db, {
        workspaceId: c.var.workspace.id,
        userId,
      });
      return c.json<SuccessResponse<{ userId: string }>>({
        success: true,
        data: { userId },
      });
    }
  );
