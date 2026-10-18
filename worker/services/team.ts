import { sql } from "drizzle-orm";
import { member, posts } from "../db/schema";

/**
 * Whether `userId` is on the team of the post's workspace, for queries on
 * `posts`. Any membership counts: owner, admin or member.
 *
 * The columns are qualified by hand. In a select without joins, Drizzle
 * prints the columns inside a `sql` field without their table, which turned
 * the comparison into `organization_id = organization_id` inside the
 * subquery: true for anyone on any workspace's team.
 */
export const onTeam = (userId: string) =>
  sql<boolean>`exists (select 1 from ${member} as team where team.organization_id = ${posts}.organization_id and team.user_id = ${userId})`;
