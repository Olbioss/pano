import { sql } from "drizzle-orm";
import { member, posts, workspaceSettings } from "../db/schema";

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

/**
 * Whether `userId` may change or delete other people's words on the post:
 * its team, except in the demo workspace. Visitors share the demo, so there
 * every request and comment is left to whoever wrote it, while the team's
 * own tools (statuses, merges, pins) stay open to try. Qualified by hand,
 * like onTeam.
 */
export const moderates = (userId: string) =>
  sql<boolean>`(${onTeam(userId)} and not exists (select 1 from ${workspaceSettings} as ws where ws.organization_id = ${posts}.organization_id and ws.is_demo))`;
