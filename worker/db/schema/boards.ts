import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";

export const boards = pgTable(
  "boards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // From the name at creation, then fixed, so ?board= links keep working
    // after a rename.
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("boards_organization_slug_unique").on(
      table.organizationId,
      table.slug
    ),
    index("boards_organization_position_idx").on(
      table.organizationId,
      table.position
    ),
  ]
);
