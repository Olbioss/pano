import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization } from "./auth";

/**
 * What Pano adds to a Better Auth organization. One row per workspace; a
 * missing row reads as the defaults.
 */
export const workspaceSettings = pgTable(
  "workspace_settings",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organization.id, { onDelete: "cascade" }),
    defaultLocale: text("default_locale", { enum: ["en", "tr"] })
      .notNull()
      .default("en"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "workspace_settings_default_locale_check",
      sql`${table.defaultLocale} in ('en', 'tr')`
    ),
  ]
);
