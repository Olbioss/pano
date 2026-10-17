import { createMiddleware } from "hono/factory";
import { AppError } from "../lib/errors";
import { checkRateLimit } from "../lib/rate-limit";
import type { UserEnv } from "./session";

/**
 * A per-person limit for one route; it runs after requireUser. Like Better
 * Auth's limits, it applies only in production, so local dev isn't throttled.
 * Tests that check it run the app with ENVIRONMENT=production.
 */
export const rateLimit = (
  bucket: string,
  limit: number,
  windowSeconds: number
) =>
  createMiddleware<UserEnv>(async (c, next) => {
    if (c.env.ENVIRONMENT === "production") {
      const allowed = await checkRateLimit(c.var.db, {
        userId: c.var.user.id,
        bucket,
        limit,
        windowSeconds,
      });
      if (!allowed) {
        throw new AppError(429, "RATE_LIMITED", "Too many requests");
      }
    }
    await next();
  });
