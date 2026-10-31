import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  CHANGELOG_PAGE,
  type ChangelogEntry,
  type ChangelogPage,
} from "@/shared/changelog";
import { postRef } from "@/shared/ref";
import type { Database } from "../db/client";
import { posts, statusChanges } from "../db/schema";

/**
 * A workspace's shipped requests, newest first, each with the team's note on
 * its latest move to Shipped. Merged requests live on in their originals, so
 * they're left out.
 */
export async function listChangelog(
  db: Database,
  input: { workspaceId: string; page: number }
): Promise<ChangelogPage> {
  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      voteCount: posts.voteCount,
      statusChangedAt: posts.statusChangedAt,
      createdAt: posts.createdAt,
      // Qualified by hand: inside a select without joins, Drizzle would
      // print posts.id as a bare "id", which the subquery reads as sc.id.
      note: sql<
        string | null
      >`(select sc.note from ${statusChanges} as sc where sc.post_id = ${posts}.id and sc.to_status = 'shipped' order by sc.id desc limit 1)`,
    })
    .from(posts)
    .where(
      and(
        eq(posts.organizationId, input.workspaceId),
        eq(posts.status, "shipped"),
        isNull(posts.mergedIntoId)
      )
    )
    .orderBy(sql`${posts.statusChangedAt} desc nulls last`, desc(posts.id))
    .limit(CHANGELOG_PAGE + 1)
    .offset((input.page - 1) * CHANGELOG_PAGE);
  return {
    entries: rows.slice(0, CHANGELOG_PAGE).map(
      (row): ChangelogEntry => ({
        id: row.id,
        ref: postRef(row.id, row.title),
        title: row.title,
        voteCount: row.voteCount,
        // Every move to Shipped sets it; older rows fall back.
        shippedAt: (row.statusChangedAt ?? row.createdAt).toISOString(),
        note: row.note,
      })
    ),
    page: input.page,
    hasMore: rows.length > CHANGELOG_PAGE,
  };
}
