import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
// Relative, not @/shared: drizzle-kit reads this file without the alias.
import type { Locale } from "../../../shared/locale";
import { user } from "./auth";
import { posts } from "./posts";

/** What a Shipped email says, fixed when the post ships. */
export type ShippedPayload = {
  title: string;
  ref: string;
  workspaceName: string;
  locale: Locale;
  note: string | null;
};

/**
 * Emails waiting to go out. A status change writes them in its own
 * transaction, and the cron sends them every five minutes, so a slow or
 * failing mail provider never holds up the team's click.
 */
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // With kind, it keeps one email per person per post and event.
    postId: bigint("post_id", { mode: "number" })
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["shipped"] }).notNull(),
    payload: jsonb("payload").$type<ShippedPayload>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    // Set while a cron run sends it, so an overlapping run skips it.
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
  },
  (table) => [
    uniqueIndex("email_outbox_once_idx").on(
      table.postId,
      table.userId,
      table.kind
    ),
    // The sender reads the unsent ones, oldest first.
    index("email_outbox_unsent_idx")
      .on(table.id)
      .where(sql`${table.sentAt} is null`),
    check("email_outbox_kind_check", sql`${table.kind} in ('shipped')`),
  ]
);
