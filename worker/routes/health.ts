import { sql } from "drizzle-orm";
import { Hono } from "hono";
import type { SuccessResponse } from "@/shared/envelope";
import type { AppEnv } from "../env";

export const healthRoutes = new Hono<AppEnv>().get("/", async (c) => {
  await c.var.db.execute(sql`select 1`);
  return c.json<SuccessResponse<{ db: "up" }>>({
    success: true,
    data: { db: "up" },
  });
});
