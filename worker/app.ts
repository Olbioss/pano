import { Hono } from "hono";
import type { AppEnv } from "./env";
import { handleError, handleNotFound } from "./lib/errors";
import { withDb } from "./middleware/db";
import { healthRoutes } from "./routes/health";

/**
 * The whole API as one chained Hono app, so AppType carries every route.
 * Keep it runtime-agnostic: the browser project typechecks this file through
 * AppType, and tests run it under Node. Workers-only code (cron triggers,
 * HTMLRewriter) belongs in index.ts.
 */
const app = new Hono<AppEnv>()
  .basePath("/api")
  .use(withDb)
  .route("/health", healthRoutes);

app.onError(handleError);
app.notFound(handleNotFound);

export type AppType = typeof app;
export default app;
