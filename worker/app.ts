import { Hono } from "hono";
import type { AppEnv } from "./env";
import { handleError, handleNotFound } from "./lib/errors";
import type { Mailer } from "./mail/mailer";
import { withAuth } from "./middleware/auth";
import { withDb } from "./middleware/db";
import { healthRoutes } from "./routes/health";
import { meRoutes } from "./routes/me";

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
    .use(withDb)
    .use(withAuth(deps.mailer))
    // Better Auth answers its own routes in its own JSON. The browser calls
    // them through Better Auth's client, not through `unwrap`.
    .on(["GET", "POST"], "/auth/*", (c) => c.var.auth.handler(c.req.raw))
    .route("/health", healthRoutes)
    .route("/me", meRoutes);

  app.onError(handleError);
  app.notFound(handleNotFound);
  return app;
}

const app = createApp();

export type AppType = typeof app;
export default app;
