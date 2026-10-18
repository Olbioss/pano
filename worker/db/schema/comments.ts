import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
// posts.ts imports this file too, for the pinned comment. Both references
// are lazy (`() => …`), so the cycle is harmless.
import { posts } from "./posts";

/**
 * Threads under a post. Deleting one is soft (deleted_at set, body wiped),
 * so its replies keep their place; rows go only with their post.
 */
export const comments = pgTable(
  "comments",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    postId: bigint("post_id", { mode: "number" })
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    // Kept when the account goes; the comment then shows no author.
    authorId: text("author_id").references(() => user.id, {
      onDelete: "set null",
    }),
    parentId: bigint("parent_id", { mode: "number" }).references(
      (): AnyPgColumn => comments.id,
      { onDelete: "cascade" }
    ),
    // 0 for a top-level comment. A reply to a depth-3 comment goes beside it.
    depth: integer("depth").notNull().default(0),
    body: text("body").notNull(),
    // The author was on the workspace's team when writing it: the Team badge.
    isOfficial: boolean("is_official").notNull().default(false),
    // Direct replies, deleted ones included: they stay as placeholders.
    replyCount: integer("reply_count").notNull().default(0),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Threads page by id within a post and a parent.
    index("comments_post_parent_idx").on(
      table.postId,
      table.parentId,
      table.id
    ),
    check("comments_depth_check", sql`${table.depth} between 0 and 3`),
    check("comments_reply_count_check", sql`${table.replyCount} >= 0`),
  ]
);
