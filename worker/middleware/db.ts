import { createMiddleware } from "hono/factory";
import { createDb } from "../db/client";
import type { AppEnv } from "../env";

export const withDb = createMiddleware<AppEnv>(async (c, next) => {
  const { db, close } = createDb(c.env.HYPERDRIVE.connectionString);
  c.set("db", db);
  try {
    await next();
  } finally {
    // Close after the response is on its way rather than delaying it.
    c.executionCtx.waitUntil(close());
  }
});
