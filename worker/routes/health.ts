import { sql } from "drizzle-orm";
import { Hono } from "hono";
import type { SuccessResponse } from "@/shared/envelope";
import type { Database } from "../db/client";
import { pgErrorCode, UNDEFINED_TABLE } from "../db/errors";
import type { AppEnv } from "../env";

/**
 * Says the database answers, and the newest migration it has applied: when
 * drizzle-kit made it, as drizzle/meta/_journal.json records it. The deploy
 * job compares that with the commit's own (scripts/check-migrations.ts).
 */
export const healthRoutes = new Hono<AppEnv>().get("/", async (c) =>
  c.json<SuccessResponse<{ db: "up"; migration: number | null }>>({
    success: true,
    data: { db: "up", migration: await newestMigration(c.var.db) },
  })
);

/**
 * null on a database with no migrations yet: it still answers, as CI's does
 * while Playwright waits for this route before its setup migrates it.
 */
async function newestMigration(db: Database): Promise<number | null> {
  try {
    const [row] = await db.execute<{ migration: string | null }>(
      sql`select max(created_at)::text as migration from drizzle.__drizzle_migrations`
    );
    return row?.migration ? Number(row.migration) : null;
  } catch (error) {
    if (pgErrorCode(error) === UNDEFINED_TABLE) return null;
    throw error;
  }
}
