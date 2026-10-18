import { sql } from "drizzle-orm";
import { member, posts } from "../db/schema";

/**
 * Whether `userId` is on the team of the post's workspace, for queries on
 * `posts`. Any membership counts: owner, admin or member.
 */
export const onTeam = (userId: string) =>
  sql<boolean>`exists (select 1 from ${member} where ${member.organizationId} = ${posts.organizationId} and ${member.userId} = ${userId})`;
