import { and, desc, eq, inArray, isNull, type SQL, sql } from "drizzle-orm";
import type { PostSummary } from "@/shared/posts";
import { ACTIVE_STATUSES } from "@/shared/status";
import type { Database } from "../db/client";
import { boards, posts, user as users } from "../db/schema";
import { postColumns, toSummary } from "./posts";

/**
 * Requests like the title being typed, for the submit form. They're still
 * open (not shipped or closed) and not merged, and they match any of the
 * words in the post's language or have a title close enough to forgive a
 * typo. Ranked by both, then by votes.
 */
export async function findSimilar(
  db: Database,
  input: {
    workspaceId: string;
    q: string;
    boardSlug?: string;
    viewerId: string | null;
    limit?: number;
  }
): Promise<PostSummary[]> {
  const folded = sql`pano_fold(${input.q})`;
  // "dark mode" becomes "dark or mode", so one misspelled word can't hide a
  // match: "exprot csv" still finds "Export to CSV". Only letters and digits
  // go in: websearch syntax would read "-5" as NOT 5 and match almost
  // everything.
  const words = input.q
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .join(" or ");
  const anyWord = sql`websearch_to_tsquery(${posts.searchConfig}, pano_fold(${words}))`;
  const filters: SQL[] = [
    eq(posts.organizationId, input.workspaceId),
    isNull(posts.mergedIntoId),
    inArray(posts.status, [...ACTIVE_STATUSES]),
    sql`(${posts.search} @@ ${anyWord} or pano_fold(${posts.title}) %> ${folded})`,
  ];
  if (input.boardSlug) filters.push(eq(boards.slug, input.boardSlug));
  const rows = await db
    .select(postColumns(input.viewerId))
    .from(posts)
    .innerJoin(boards, eq(boards.id, posts.boardId))
    .leftJoin(users, eq(users.id, posts.authorId))
    .where(and(...filters))
    .orderBy(
      desc(
        sql`ts_rank(${posts.search}, ${anyWord}) + word_similarity(${folded}, pano_fold(${posts.title}))`
      ),
      desc(posts.voteCount)
    )
    .limit(input.limit ?? 5);
  return rows.map(toSummary);
}
