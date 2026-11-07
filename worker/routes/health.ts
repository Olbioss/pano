import { sql } from "drizzle-orm";
import { Hono } from "hono";
import type { SuccessResponse } from "@/shared/envelope";
import type { AppEnv } from "../env";

/**
 * Says the database answers, and the newest migration it has applied: when
 * drizzle-kit made it, as drizzle/meta/_journal.json records it. The deploy
 * job compares that with the commit's own (scripts/check-migrations.ts).
 */
export const healthRoutes = new Hono<AppEnv>().get("/", async (c) => {
  const [row] = await c.var.db.execute<{ migration: string | null }>(
    sql`select max(created_at)::text as migration from drizzle.__drizzle_migrations`
  );
  return c.json<SuccessResponse<{ db: "up"; migration: number | null }>>({
    success: true,
    data: {
      db: "up",
      migration: row?.migration ? Number(row.migration) : null,
    },
  });
});
