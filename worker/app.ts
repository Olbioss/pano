import { Hono } from "hono";
import { csrf } from "hono/csrf";
import type { AppEnv } from "./env";
import { handleError, handleNotFound } from "./lib/errors";
import type { Mailer } from "./mail/mailer";
import { withAuth } from "./middleware/auth";
import { withDb } from "./middleware/db";
import { healthRoutes } from "./routes/health";
import { meRoutes } from "./routes/me";
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
    // Better Auth answers its own routes in its own JSON. The browser calls
    // them through Better Auth's client, not through `unwrap`.
    .on(["GET", "POST"], "/auth/*", (c) => c.var.auth.handler(c.req.raw))
    .route("/health", healthRoutes)
    .route("/me", meRoutes)
    .route("/workspaces", workspaceRoutes);

  app.onError(handleError);
  app.notFound(handleNotFound);
  return app;
}

const app = createApp();

export type AppType = typeof app;
export default app;
