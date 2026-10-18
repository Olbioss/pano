import { Hono } from "hono";
import type { CommentChange } from "@/shared/comments";
import type { SuccessResponse } from "@/shared/envelope";
import { createCommentSchema } from "@/shared/schemas";
import type { AppEnv } from "../env";
import { idParamSchema, validate } from "../lib/validate";
import { rateLimit } from "../middleware/rate-limit";
import { requireUser } from "../middleware/session";
import { createComment } from "../services/comments";

/** Under /posts: a post's comments. */
export const postCommentRoutes = new Hono<AppEnv>().post(
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
