import {
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * How many emails went out in a window, for the daily email budget and the
 * sign-in code limit per address. The key `daily` has one window per UTC
 * day; `code:<sha-256 of the address>` has ten-minute windows, so no address
 * is stored in the clear. The nightly cron prunes old windows.
 */
export const emailCounters = pgTable(
  "email_counters",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.key, table.windowStart] })]
);
