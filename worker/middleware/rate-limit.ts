import { createMiddleware } from "hono/factory";
import type { ApiErrorCode } from "@/shared/envelope";
import { AppError } from "../lib/errors";
import { checkRateLimit } from "../lib/rate-limit";
import type { UserEnv } from "./session";

/**
 * A per-person limit for one route; it runs after requireUser. Like Better
 * Auth's limits, it applies only in production, so local dev isn't throttled.
 * Tests that check it run the app with ENVIRONMENT=production. A limit
 * whose wait is longer than "a minute" answers its own `code`.
 */
export const rateLimit = (
  bucket: string,
  limit: number,
  windowSeconds: number,
  code: Extract<ApiErrorCode, "RATE_LIMITED" | "INVITE_LIMIT"> = "RATE_LIMITED"
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
        throw new AppError(429, code, "Too many requests");
      }
    }
    await next();
  });
