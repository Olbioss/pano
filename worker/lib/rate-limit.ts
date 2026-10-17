import { sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { rateLimits } from "../db/schema";

/**
 * Fixed-window counter in Postgres: one upsert bumps this window's count,
 * then compares it with the limit. If the counter fails, the request goes
 * through rather than the API going down.
 */
export async function checkRateLimit(
  db: Database,
  input: {
    userId: string;
    bucket: string;
    limit: number;
    windowSeconds: number;
    now?: number;
  }
): Promise<boolean> {
  const windowMs = input.windowSeconds * 1000;
  const now = input.now ?? Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  try {
    const [row] = await db
      .insert(rateLimits)
      .values({
        userId: input.userId,
        bucket: input.bucket,
        windowStart,
        count: 1,
      })
      .onConflictDoUpdate({
        target: [rateLimits.userId, rateLimits.bucket, rateLimits.windowStart],
        set: { count: sql`${rateLimits.count} + 1` },
      })
      .returning({ count: rateLimits.count });
    return (row?.count ?? 1) <= input.limit;
  } catch (err) {
    console.error("rate limit check failed, allowing the request:", err);
    return true;
  }
}
