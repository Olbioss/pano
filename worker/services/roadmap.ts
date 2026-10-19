import { and, desc, eq, gt, isNull, type SQL, sql } from "drizzle-orm";
import type { Roadmap } from "@/shared/posts";
import type { RoadmapStatus } from "@/shared/status";
import type { Database } from "../db/client";
import { boards, posts, user as users } from "../db/schema";
import { postColumns, toSummary } from "./posts";

/** How many posts a column shows. */
const COLUMN_LENGTH = 50;

/**
 * The public roadmap: unmerged posts that are planned or in progress, most
 * voted first, and what shipped in the last 30 days, latest first.
 */
export async function listRoadmap(
  db: Database,
  input: { workspaceId: string; viewerId: string | null }
): Promise<Roadmap> {
  const column = (status: RoadmapStatus, extra: SQL[], order: SQL[]) =>
    db
      .select(postColumns(input.viewerId))
      .from(posts)
      .innerJoin(boards, eq(boards.id, posts.boardId))
      .leftJoin(users, eq(users.id, posts.authorId))
      .where(
        and(
          eq(posts.organizationId, input.workspaceId),
          isNull(posts.mergedIntoId),
          eq(posts.status, status),
          ...extra
        )
      )
      .orderBy(...order)
      .limit(COLUMN_LENGTH);
  const byVotes = [
    desc(posts.voteCount),
    desc(posts.createdAt),
    desc(posts.id),
  ];
  const [planned, inProgress, shipped] = await Promise.all([
    column("planned", [], byVotes),
    column("in_progress", [], byVotes),
    column(
      "shipped",
      [gt(posts.statusChangedAt, sql`now() - interval '30 days'`)],
      [desc(posts.statusChangedAt), desc(posts.id)]
    ),
  ]);
  return {
    planned: planned.map(toSummary),
    in_progress: inProgress.map(toSummary),
    shipped: shipped.map(toSummary),
  };
}
