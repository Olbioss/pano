import { Hono } from "hono";
import { csrf } from "hono/csrf";
import type { ErrorResponse } from "@/shared/envelope";
import type { AppEnv } from "./env";
import { handleError, handleNotFound } from "./lib/errors";
import type { Mailer } from "./mail/mailer";
import { withAuth } from "./middleware/auth";
import { withDb } from "./middleware/db";
import { commentRoutes, postCommentRoutes } from "./routes/comments";
import { healthRoutes } from "./routes/health";
import { meRoutes } from "./routes/me";
import { postRoutes, workspacePostRoutes } from "./routes/posts";
import { workspaceRoutes } from "./routes/workspaces";

export type AppDeps = { mailer?: Mailer };

/**
 * The whole API as one chained Hono app, so AppType carries every route.
 * Keep it runtime-agnostic: the browser project typechecks this file through
 * AppType, and tests run it under Node with a capturing mailer. Workers-only
 * code (cron triggers, HTMLRewriter) belongs in index.ts.
 */
export function createApp(deps: AppDeps = {}) {
  const app = new Hono<AppEnv>()
    .basePath("/api")
    // Refuses cross-site form posts. JSON requests already need a CORS
    // preflight, which a foreign site can't pass.
    .use(csrf())
    .use(withDb)
    .use(withAuth(deps.mailer))
    // Workspaces are made and changed through /workspaces, which enforces
    // Pano's address rules; the server calls the organization plugin through
    // auth.api. Its HTTP routes would skip those rules, so they don't exist.
    .all("/auth/organization/*", (c) => c.notFound())
    // Names change through PATCH /me, which validates them.
    .all("/auth/update-user", (c) => c.notFound())
    // Better Auth answers its own routes in its own JSON. The browser calls
    // them through Better Auth's client, not through `unwrap`.
    .on(["GET", "POST"], "/auth/*", async (c) => {
      const res = await c.var.auth.handler(c.req.raw);
      // A code that never left must not read as "check your inbox".
      if (c.var.mail.failed) {
        return c.json<ErrorResponse>(
          {
            success: false,
            code: "INTERNAL_ERROR",
            error: "The sign-in code couldn't be sent",
          },
          502
        );
      }
      return res;
    })
    .route("/health", healthRoutes)
    .route("/me", meRoutes)
    .route("/workspaces", workspaceRoutes)
    .route("/workspaces", workspacePostRoutes)
    .route("/posts", postRoutes)
    .route("/posts", postCommentRoutes)
    .route("/comments", commentRoutes);

  app.onError(handleError);
  app.notFound(handleNotFound);
  return app;
}

const app = createApp();

export type AppType = typeof app;
export default app;
