import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
// Relative, not @/shared: drizzle-kit reads this file without the alias.
import { POST_STATUSES } from "../../../shared/status";
import { user } from "./auth";
import { posts } from "./posts";

/** A post's timeline: every status change, with the team's note. */
export const statusChanges = pgTable(
  "status_changes",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    postId: bigint("post_id", { mode: "number" })
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    fromStatus: text("from_status", { enum: POST_STATUSES }).notNull(),
    toStatus: text("to_status", { enum: POST_STATUSES }).notNull(),
    note: text("note"),
    // Kept when the account goes; the entry then shows no name.
    changedBy: text("changed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("status_changes_post_idx").on(table.postId, table.id),
    check(
      "status_changes_from_check",
      sql`${table.fromStatus} in ('open', 'under_review', 'planned', 'in_progress', 'shipped', 'closed')`
    ),
    check(
      "status_changes_to_check",
      sql`${table.toStatus} in ('open', 'under_review', 'planned', 'in_progress', 'shipped', 'closed')`
    ),
  ]
);
