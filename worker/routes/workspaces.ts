import { APIError } from "better-auth/api";
import { and, asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { SuccessResponse } from "@/shared/envelope";
import type { Locale } from "@/shared/locale";
import {
  createBoardSchema,
  createWorkspaceSchema,
  renameBoardSchema,
  reorderBoardsSchema,
  updateWorkspaceSchema,
} from "@/shared/schemas";
import { slugify } from "@/shared/slug";
import type { Auth } from "../auth";
import type { Database } from "../db/client";
import { pgErrorCode, UNIQUE_VIOLATION } from "../db/errors";
import { boards, organization, workspaceSettings } from "../db/schema";
import type { AppEnv } from "../env";
import { AppError } from "../lib/errors";
import { validate } from "../lib/validate";
import { confineDemo, readOnlyInDemo } from "../middleware/demo";
import { requireUser } from "../middleware/session";
import { requireTeam } from "../middleware/team";

export type WorkspaceSummary = {
  id: string;
  slug: string;
  name: string;
  defaultLocale: Locale;
  /** The sandbox the demo logins open: its settings are read-only. */
  isDemo: boolean;
};

export type Board = {
  id: string;
  slug: string;
  name: string;
  position: number;
};
export type WorkspaceView = WorkspaceSummary & { boards: Board[] };

const boardColumns = {
  id: boards.id,
  slug: boards.slug,
  name: boards.name,
  position: boards.position,
};

const boardParamSchema = z.object({ slug: z.string(), boardId: z.uuid() });

const boardNotFound = () => new AppError(404, "NOT_FOUND", "Board not found");

async function listBoards(
  db: Pick<Database, "select">,
  workspaceId: string
): Promise<Board[]> {
  return db
    .select(boardColumns)
    .from(boards)
    .where(eq(boards.organizationId, workspaceId))
    .orderBy(asc(boards.position), asc(boards.createdAt));
}

const slugTaken = () =>
  new AppError(409, "CONFLICT", "That address is taken", {
    slug: "SLUG_TAKEN",
  });

/** Better Auth's createOrganization, with its refusals turned into ours. */
async function createOrganization(
  auth: Auth,
  headers: Headers,
  name: string,
  slug: string
) {
  try {
    const org = await auth.api.createOrganization({
      body: { name, slug },
      headers,
    });
    if (!org) throw new Error("Better Auth returned no organization");
    return org;
  } catch (err) {
    if (err instanceof APIError) {
      const code = (err.body as { code?: string } | undefined)?.code;
      if (code === "ORGANIZATION_ALREADY_EXISTS") throw slugTaken();
      if (code === "YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS") {
        throw new AppError(409, "WORKSPACE_LIMIT", "One workspace per account");
      }
    }
    // Two people claiming one address at once can both pass Better Auth's
    // own check; the unique index on organization.slug settles it.
    if (pgErrorCode(err) === UNIQUE_VIOLATION) throw slugTaken();
    throw err;
  }
}

export async function findWorkspace(
  db: Database,
  slug: string
): Promise<WorkspaceSummary> {
  const [row] = await db
    .select({
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      defaultLocale: workspaceSettings.defaultLocale,
      isDemo: workspaceSettings.isDemo,
    })
    .from(organization)
    .leftJoin(
      workspaceSettings,
      eq(workspaceSettings.organizationId, organization.id)
    )
    .where(eq(organization.slug, slug))
    .limit(1);
  if (!row) throw new AppError(404, "NOT_FOUND", "Workspace not found");
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    defaultLocale: row.defaultLocale ?? "en",
    isDemo: row.isDemo ?? false,
  };
}

export const workspaceRoutes = new Hono<AppEnv>()
  .post(
    "/",
    requireUser,
    confineDemo("new-workspace"),
    validate("json", createWorkspaceSchema),
    async (c) => {
      const { name, slug, defaultLocale } = c.req.valid("json");
      const org = await createOrganization(
        c.var.auth,
        c.req.raw.headers,
        name,
        slug
      );
      // Not in one transaction with Better Auth's insert: if this fails, the
      // workspace reads as the defaults and PATCH writes the row later.
      await c.var.db
        .insert(workspaceSettings)
        .values({ organizationId: org.id, defaultLocale })
        .onConflictDoNothing();
      return c.json<SuccessResponse<WorkspaceSummary>>(
        {
          success: true,
          data: {
            id: org.id,
            slug: org.slug,
            name: org.name,
            defaultLocale,
            isDemo: false,
          },
        },
        201
      );
    }
  )
  .get("/:slug", async (c) => {
    const workspace = await findWorkspace(c.var.db, c.req.param("slug"));
    const list = await listBoards(c.var.db, workspace.id);
    return c.json<SuccessResponse<WorkspaceView>>({
      success: true,
      data: { ...workspace, boards: list },
    });
  })
  .patch(
    "/:slug",
    requireUser,
    requireTeam,
    readOnlyInDemo,
    validate("json", updateWorkspaceSchema),
    async (c) => {
      const { name, defaultLocale } = c.req.valid("json");
      const { id, slug } = c.var.workspace;
      if (name !== undefined) {
        await c.var.db
          .update(organization)
          .set({ name })
          .where(eq(organization.id, id));
      }
      if (defaultLocale !== undefined) {
        await c.var.db
          .insert(workspaceSettings)
          .values({ organizationId: id, defaultLocale })
          .onConflictDoUpdate({
            target: workspaceSettings.organizationId,
            set: { defaultLocale },
          });
      }
      return c.json<SuccessResponse<WorkspaceSummary>>({
        success: true,
        data: await findWorkspace(c.var.db, slug),
      });
    }
  )
  .post(
    "/:slug/boards",
    requireUser,
    requireTeam,
    readOnlyInDemo,
    validate("json", createBoardSchema),
    async (c) => {
      const { name } = c.req.valid("json");
      const workspaceId = c.var.workspace.id;
      try {
        const [board] = await c.var.db
          .insert(boards)
          .values({
            organizationId: workspaceId,
            slug: slugify(name),
            name,
            // New boards go last.
            position: sql`(select coalesce(max(${boards.position}), -1) + 1 from ${boards} where ${boards.organizationId} = ${workspaceId})`,
          })
          .returning(boardColumns);
        return c.json<SuccessResponse<Board>>(
          { success: true, data: board! },
          201
        );
      } catch (err) {
        if (pgErrorCode(err) === UNIQUE_VIOLATION) {
          throw new AppError(409, "CONFLICT", "A board with that name exists", {
            name: "BOARD_EXISTS",
          });
        }
        throw err;
      }
    }
  )
  .patch(
    "/:slug/boards/:boardId",
    requireUser,
    requireTeam,
    readOnlyInDemo,
    validate("param", boardParamSchema),
    validate("json", renameBoardSchema),
    async (c) => {
      const { boardId } = c.req.valid("param");
      const { name } = c.req.valid("json");
      const [board] = await c.var.db
        .update(boards)
        .set({ name })
        .where(
          and(
            eq(boards.id, boardId),
            eq(boards.organizationId, c.var.workspace.id)
          )
        )
        .returning(boardColumns);
      if (!board) throw boardNotFound();
      return c.json<SuccessResponse<Board>>({ success: true, data: board });
    }
  )
  .delete(
    "/:slug/boards/:boardId",
    requireUser,
    requireTeam,
    readOnlyInDemo,
    validate("param", boardParamSchema),
    async (c) => {
      const { boardId } = c.req.valid("param");
      const [deleted] = await c.var.db
        .delete(boards)
        .where(
          and(
            eq(boards.id, boardId),
            eq(boards.organizationId, c.var.workspace.id)
          )
        )
        .returning({ id: boards.id });
      if (!deleted) throw boardNotFound();
      return c.json<SuccessResponse<{ id: string }>>({
        success: true,
        data: deleted,
      });
    }
  )
  .put(
    "/:slug/boards/order",
    requireUser,
    requireTeam,
    readOnlyInDemo,
    validate("json", reorderBoardsSchema),
    async (c) => {
      const { ids } = c.req.valid("json");
      const workspaceId = c.var.workspace.id;
      const ordered = await c.var.db.transaction(async (tx) => {
        // Lock the workspace's boards so two reorders can't interleave.
        const current = await tx
          .select({ id: boards.id })
          .from(boards)
          .where(eq(boards.organizationId, workspaceId))
          .for("update");
        const known = new Set(current.map((board) => board.id));
        const listsEachOnce =
          ids.length === known.size &&
          new Set(ids).size === ids.length &&
          ids.every((id) => known.has(id));
        if (!listsEachOnce) {
          throw new AppError(
            400,
            "BAD_REQUEST",
            "The order must list every board once",
            { ids: "ORDER_MISMATCH" }
          );
        }
        for (const [position, id] of ids.entries()) {
          await tx.update(boards).set({ position }).where(eq(boards.id, id));
        }
        return listBoards(tx, workspaceId);
      });
      return c.json<SuccessResponse<Board[]>>({ success: true, data: ordered });
    }
  );
