import { Hono } from "hono";
import type { CommentChange, CommentPage } from "@/shared/comments";
import type { SuccessResponse } from "@/shared/envelope";
import { commentPageQuerySchema, createCommentSchema } from "@/shared/schemas";
import type { AppEnv } from "../env";
import { idParamSchema, validate } from "../lib/validate";
import { rateLimit } from "../middleware/rate-limit";
import { readViewerId, requireUser } from "../middleware/session";
import { createComment, listComments, listReplies } from "../services/comments";

/** Under /posts: a post's thread, and commenting on it. */
export const postCommentRoutes = new Hono<AppEnv>()
  .get(
    "/:id/comments",
    validate("param", idParamSchema),
    validate("query", commentPageQuerySchema),
    async (c) => {
      const page = await listComments(c.var.db, {
        postId: c.req.valid("param").id,
        ...c.req.valid("query"),
        viewerId: await readViewerId(c),
      });
      return c.json<SuccessResponse<CommentPage>>({
        success: true,
        data: page,
      });
    }
  )
  .post(
    "/:id/comments",
    requireUser,
    validate("param", idParamSchema),
    validate("json", createCommentSchema),
    rateLimit("comment", 30, 3600),
    async (c) => {
      const { body, parentId } = c.req.valid("json");
      const result = await createComment(c.var.db, {
        postId: c.req.valid("param").id,
        authorId: c.var.user.id,
        body,
        parentId,
      });
      return c.json<SuccessResponse<CommentChange>>(
        { success: true, data: result },
        201
      );
    }
  );

/** Under /comments: one comment's replies. */
export const commentRoutes = new Hono<AppEnv>().get(
  "/:id/replies",
  validate("param", idParamSchema),
  validate("query", commentPageQuerySchema),
  async (c) => {
    const page = await listReplies(c.var.db, {
      commentId: c.req.valid("param").id,
      ...c.req.valid("query"),
      viewerId: await readViewerId(c),
    });
    return c.json<SuccessResponse<CommentPage>>({ success: true, data: page });
  }
);
