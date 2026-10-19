import {
  bigint,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { posts } from "./posts";

/**
 * Who follows a post: they hear when it ships. Posting, voting and
 * commenting subscribe; the post's page unsubscribes.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    postId: bigint("post_id", { mode: "number" })
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.postId, table.userId] })]
);
