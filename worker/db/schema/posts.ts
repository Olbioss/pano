import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  check,
  customType,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
// Relative, not @/shared: drizzle-kit reads this file without the alias.
import { POST_STATUSES } from "../../../shared/status";
import { organization, user } from "./auth";
import { boards } from "./boards";

/** Postgres text-search types Drizzle has no builder for. */
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });
export type SearchConfig = "english" | "turkish";
const regconfig = customType<{ data: SearchConfig }>({
  dataType: () => "regconfig",
});

export const posts = pgTable(
  "posts",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    // Kept when the account goes; the post then shows no author.
    authorId: text("author_id").references(() => user.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    status: text("status", { enum: POST_STATUSES }).notNull().default("open"),
    voteCount: integer("vote_count").notNull().default(0),
    // Set by a team merge (Phase 4). Votes refuse merged posts.
    mergedIntoId: bigint("merged_into_id", { mode: "number" }).references(
      (): AnyPgColumn => posts.id,
      { onDelete: "set null" }
    ),
    // The workspace's language when the post was written; search stems in it.
    searchConfig: regconfig("search_config").notNull(),
    search: tsvector("search").generatedAlwaysAs(
      sql`setweight(to_tsvector(search_config, pano_fold(title)), 'A') || setweight(to_tsvector(search_config, pano_fold(body)), 'B')`
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("posts_board_created_idx").on(table.boardId, table.createdAt),
    index("posts_organization_created_idx").on(
      table.organizationId,
      table.createdAt
    ),
    index("posts_organization_votes_idx").on(
      table.organizationId,
      table.voteCount
    ),
    index("posts_search_idx").using("gin", table.search),
    index("posts_title_trgm_idx").using(
      "gin",
      sql`pano_fold(${table.title}) gin_trgm_ops`
    ),
    check("posts_vote_count_check", sql`${table.voteCount} >= 0`),
    check(
      "posts_status_check",
      sql`${table.status} in ('open', 'under_review', 'planned', 'in_progress', 'shipped', 'closed')`
    ),
  ]
);

export const votes = pgTable(
  "votes",
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
  (table) => [
    primaryKey({ columns: [table.postId, table.userId] }),
    index("votes_created_idx").on(table.createdAt),
  ]
);
