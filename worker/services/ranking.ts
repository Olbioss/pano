import { and, desc, eq, isNull, type SQL, sql } from "drizzle-orm";
import type { FeedPage } from "@/shared/posts";
import type { FeedSort } from "@/shared/schemas";
import type { PostStatus } from "@/shared/status";
import type { Database } from "../db/client";
import { boards, posts, user as users, votes } from "../db/schema";
import { postColumns, toSummary } from "./posts";
import { matchesSearch } from "./search";

// Trending: votes from the last 30 days, each worth half as much every 3 days.
const TRENDING_DAYS = 30;
const HALF_LIFE_SECONDS = 3 * 24 * 60 * 60;

const trendingScore = sql`coalesce((
  select sum(power(0.5, extract(epoch from (now() - ${votes.createdAt})) / ${sql.raw(String(HALF_LIFE_SECONDS))}))
  from ${votes}
  where ${votes.postId} = ${posts.id}
    and ${votes.createdAt} > now() - interval '${sql.raw(String(TRENDING_DAYS))} days'
), 0)`;

const ORDER: Record<FeedSort, SQL[]> = {
  trending: [desc(trendingScore), desc(posts.createdAt), desc(posts.id)],
  top: [desc(posts.voteCount), desc(posts.createdAt), desc(posts.id)],
  new: [desc(posts.createdAt), desc(posts.id)],
};

export type FeedQuery = {
  workspaceId: string;
  board?: string;
  sort: FeedSort;
  status?: PostStatus;
  q?: string;
  page: number;
  limit: number;
  viewerId: string | null;
};

export async function listFeed(
  db: Database,
  query: FeedQuery
): Promise<FeedPage> {
  const filters: SQL[] = [
    eq(posts.organizationId, query.workspaceId),
    isNull(posts.mergedIntoId),
  ];
  if (query.board) {
    const [board] = await db
      .select({ id: boards.id })
      .from(boards)
      .where(
        and(
          eq(boards.organizationId, query.workspaceId),
          eq(boards.slug, query.board)
        )
      )
      .limit(1);
    // A stale ?board= link shows an empty feed rather than an error.
    if (!board) return { items: [], page: query.page, hasMore: false };
    filters.push(eq(posts.boardId, board.id));
  }
  if (query.status) filters.push(eq(posts.status, query.status));
  if (query.q) filters.push(matchesSearch(query.q));
  const rows = await db
    .select(postColumns(query.viewerId))
    .from(posts)
    .innerJoin(boards, eq(boards.id, posts.boardId))
    .leftJoin(users, eq(users.id, posts.authorId))
    .where(and(...filters))
    .orderBy(...ORDER[query.sort])
    .limit(query.limit + 1)
    .offset((query.page - 1) * query.limit);
  return {
    items: rows.slice(0, query.limit).map(toSummary),
    page: query.page,
    hasMore: rows.length > query.limit,
  };
}
