import {
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Pano's own per-person limits, one row per fixed window (AskDocs' limiter).
 * Better Auth keeps its per-IP sign-in limits in its own rate_limit table.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    bucket: text("bucket").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.bucket, table.windowStart] }),
  ]
);
