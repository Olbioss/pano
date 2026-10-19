import { Hono } from "hono";
import type { SuccessResponse } from "@/shared/envelope";
import type {
  FeedPage,
  PostDetail,
  PostSummary,
  SubscriptionResult,
  VoteResult,
} from "@/shared/posts";
import {
  changeStatusSchema,
  createPostSchema,
  feedQuerySchema,
  similarQuerySchema,
  subscriptionSchema,
  updatePostSchema,
  voteSchema,
} from "@/shared/schemas";
import type { Database } from "../db/client";
import type { AppEnv } from "../env";
import { AppError } from "../lib/errors";
import { idParamSchema, validate } from "../lib/validate";
import { rateLimit } from "../middleware/rate-limit";
import { readViewerId, requireUser } from "../middleware/session";
import {
  boardInWorkspace,
  createPost,
  deletePost,
  findPostDetail,
  requireCanEdit,
  updatePost,
} from "../services/posts";
import { listFeed } from "../services/ranking";
import { findSimilar } from "../services/similar";
import { changeStatus } from "../services/status";
import { setSubscription } from "../services/subscriptions";
import { setVote } from "../services/votes";
import { findWorkspace } from "./workspaces";

async function postDetail(db: Database, id: number, viewerId: string | null) {
  const post = await findPostDetail(db, id, viewerId);
  if (!post) throw new AppError(404, "NOT_FOUND", "Post not found");
  return post;
}

/** Under /workspaces: a workspace's feed, posting into it, and similar requests. */
export const workspacePostRoutes = new Hono<AppEnv>()
  .get("/:slug/posts", validate("query", feedQuerySchema), async (c) => {
    const workspace = await findWorkspace(c.var.db, c.req.param("slug"));
    const page = await listFeed(c.var.db, {
      ...c.req.valid("query"),
      workspaceId: workspace.id,
      viewerId: await readViewerId(c),
    });
    return c.json<SuccessResponse<FeedPage>>({ success: true, data: page });
  })
  .post(
    "/:slug/posts",
    requireUser,
    validate("json", createPostSchema),
    rateLimit("post", 5, 3600),
    async (c) => {
      const { boardId, title, body } = c.req.valid("json");
      const workspace = await findWorkspace(c.var.db, c.req.param("slug"));
      if (!(await boardInWorkspace(c.var.db, boardId, workspace.id))) {
        throw new AppError(
          400,
          "BAD_REQUEST",
          "That board isn't in this workspace",
          { boardId: "BOARD_UNKNOWN" }
        );
      }
      const id = await createPost(c.var.db, {
        workspaceId: workspace.id,
        locale: workspace.defaultLocale,
        boardId,
        authorId: c.var.user.id,
        title,
        body,
      });
      return c.json<SuccessResponse<PostDetail>>(
        { success: true, data: await postDetail(c.var.db, id, c.var.user.id) },
        201
      );
    }
  )
  .get("/:slug/similar", validate("query", similarQuerySchema), async (c) => {
    const workspace = await findWorkspace(c.var.db, c.req.param("slug"));
    const { q, board } = c.req.valid("query");
    const items = await findSimilar(c.var.db, {
      workspaceId: workspace.id,
      q,
      boardSlug: board,
      viewerId: await readViewerId(c),
    });
    return c.json<SuccessResponse<PostSummary[]>>({
      success: true,
      data: items,
    });
  });

/** Under /posts: one post, and changing or deleting it. */
export const postRoutes = new Hono<AppEnv>()
  .get("/:id", validate("param", idParamSchema), async (c) => {
    const { id } = c.req.valid("param");
    return c.json<SuccessResponse<PostDetail>>({
      success: true,
      data: await postDetail(c.var.db, id, await readViewerId(c)),
    });
  })
  .patch(
    "/:id",
    requireUser,
    validate("param", idParamSchema),
    validate("json", updatePostSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      await requireCanEdit(c.var.db, id, c.var.user.id);
      await updatePost(c.var.db, id, c.req.valid("json"));
      return c.json<SuccessResponse<PostDetail>>({
        success: true,
        data: await postDetail(c.var.db, id, c.var.user.id),
      });
    }
  )
  .delete("/:id", requireUser, validate("param", idParamSchema), async (c) => {
    const { id } = c.req.valid("param");
    await requireCanEdit(c.var.db, id, c.var.user.id);
    await deletePost(c.var.db, id);
    return c.json<SuccessResponse<{ id: number }>>({
      success: true,
      data: { id },
    });
  })
  .put(
    "/:id/vote",
    requireUser,
    validate("param", idParamSchema),
    validate("json", voteSchema),
    rateLimit("vote", 120, 3600),
    async (c) => {
      const { id } = c.req.valid("param");
      const result = await setVote(c.var.db, {
        postId: id,
        userId: c.var.user.id,
        voted: c.req.valid("json").voted,
      });
      return c.json<SuccessResponse<VoteResult>>({
        success: true,
        data: result,
      });
    }
  )
  .put(
    "/:id/subscription",
    requireUser,
    validate("param", idParamSchema),
    validate("json", subscriptionSchema),
    async (c) => {
      const result = await setSubscription(c.var.db, {
        postId: c.req.valid("param").id,
        userId: c.var.user.id,
        subscribed: c.req.valid("json").subscribed,
      });
      return c.json<SuccessResponse<SubscriptionResult>>({
        success: true,
        data: result,
      });
    }
  )
  .patch(
    "/:id/status",
    requireUser,
    validate("param", idParamSchema),
    validate("json", changeStatusSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      await changeStatus(c.var.db, {
        postId: id,
        userId: c.var.user.id,
        ...c.req.valid("json"),
      });
      return c.json<SuccessResponse<PostDetail>>({
        success: true,
        data: await postDetail(c.var.db, id, c.var.user.id),
      });
    }
  );
