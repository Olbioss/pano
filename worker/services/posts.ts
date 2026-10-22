import { and, eq, sql } from "drizzle-orm";
import { excerpt } from "@/shared/excerpt";
import type { Locale } from "@/shared/locale";
import type { PostDetail, PostSummary } from "@/shared/posts";
import { postRef } from "@/shared/ref";
import type { PostStatus } from "@/shared/status";
import type { Database } from "../db/client";
import {
  boards,
  organization,
  posts,
  subscriptions,
  user as users,
  votes,
  workspaceSettings,
} from "../db/schema";
import { AppError } from "../lib/errors";
import { findComment } from "./comments";
import { searchConfigFor } from "./search";
import { findTimeline } from "./status";
import { subscribe } from "./subscriptions";
import { moderates, onTeam } from "./team";

/**
 * What every post view selects. Queries using it join `boards` (inner) and
 * `users` (left, on the author).
 */
export function postColumns(viewerId: string | null) {
  return {
    id: posts.id,
    title: posts.title,
    body: posts.body,
    status: posts.status,
    voteCount: posts.voteCount,
    commentCount: posts.commentCount,
    createdAt: posts.createdAt,
    boardSlug: boards.slug,
    boardName: boards.name,
    authorId: posts.authorId,
    authorName: users.name,
    voted: viewerId
      ? sql<boolean>`exists (select 1 from ${votes} where ${votes.postId} = ${posts.id} and ${votes.userId} = ${viewerId})`
      : sql<boolean>`false`,
  };
}

export type PostRow = {
  id: number;
  title: string;
  body: string;
  status: PostStatus;
  voteCount: number;
  commentCount: number;
  createdAt: Date;
  boardSlug: string;
  boardName: string;
  authorId: string | null;
  authorName: string | null;
  voted: boolean;
};

export function toSummary(row: PostRow): PostSummary {
  return {
    id: row.id,
    ref: postRef(row.id, row.title),
    title: row.title,
    excerpt: excerpt(row.body),
    status: row.status,
    voteCount: row.voteCount,
    commentCount: row.commentCount,
    voted: row.voted,
    board: { slug: row.boardSlug, name: row.boardName },
    author: row.authorId === null ? null : { name: row.authorName ?? "" },
    createdAt: row.createdAt.toISOString(),
  };
}

export async function findPostDetail(
  db: Database,
  id: number,
  viewerId: string | null
): Promise<PostDetail | null> {
  const [row] = await db
    .select({
      ...postColumns(viewerId),
      workspaceSlug: organization.slug,
      workspaceName: organization.name,
      defaultLocale: workspaceSettings.defaultLocale,
      onTeam: viewerId ? onTeam(viewerId) : sql<boolean>`false`,
      moderates: viewerId ? moderates(viewerId) : sql<boolean>`false`,
      pinnedCommentId: posts.pinnedCommentId,
      mergedIntoId: posts.mergedIntoId,
      subscribed: viewerId
        ? sql<boolean>`exists (select 1 from ${subscriptions} as s where s.post_id = ${posts}.id and s.user_id = ${viewerId})`
        : sql<boolean>`false`,
    })
    .from(posts)
    .innerJoin(boards, eq(boards.id, posts.boardId))
    .innerJoin(organization, eq(organization.id, posts.organizationId))
    .leftJoin(
      workspaceSettings,
      eq(workspaceSettings.organizationId, posts.organizationId)
    )
    .leftJoin(users, eq(users.id, posts.authorId))
    .where(eq(posts.id, id))
    .limit(1);
  if (!row) return null;
  const viewer = { id: viewerId, moderates: row.moderates };
  return {
    ...toSummary(row),
    body: row.body,
    workspace: {
      slug: row.workspaceSlug,
      name: row.workspaceName,
      defaultLocale: row.defaultLocale ?? "en",
    },
    canEdit: viewerId !== null && (row.authorId === viewerId || row.moderates),
    isTeam: row.onTeam,
    subscribed: row.subscribed,
    timeline: await findTimeline(db, row.id),
    mergedInto:
      row.mergedIntoId === null ? null : await findRef(db, row.mergedIntoId),
    pinned:
      row.pinnedCommentId === null
        ? null
        : await findComment(db, row.pinnedCommentId, viewer),
  };
}

/** Where a post lives now, for pointing at it. */
async function findRef(db: Database, id: number) {
  const [row] = await db
    .select({ id: posts.id, title: posts.title })
    .from(posts)
    .where(eq(posts.id, id))
    .limit(1);
  return row ? { id: row.id, ref: postRef(row.id, row.title) } : null;
}

export async function boardInWorkspace(
  db: Database,
  boardId: string,
  workspaceId: string
) {
  const [row] = await db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.id, boardId), eq(boards.organizationId, workspaceId)))
    .limit(1);
  return row !== undefined;
}

/**
 * A new post, with its author's vote counted and its author subscribed.
 * Returns its id.
 */
export async function createPost(
  db: Database,
  input: {
    workspaceId: string;
    locale: Locale;
    boardId: string;
    authorId: string;
    title: string;
    body: string;
  }
): Promise<number> {
  return db.transaction(async (tx) => {
    const [post] = await tx
      .insert(posts)
      .values({
        organizationId: input.workspaceId,
        boardId: input.boardId,
        authorId: input.authorId,
        title: input.title,
        body: input.body,
        searchConfig: searchConfigFor(input.locale),
        voteCount: 1,
      })
      .returning({ id: posts.id });
    if (!post) throw new Error("the post insert returned nothing");
    await tx.insert(votes).values({ postId: post.id, userId: input.authorId });
    await subscribe(tx, post.id, input.authorId);
    return post.id;
  });
}

/**
 * Only the author or the workspace's team may change or delete a post; in
 * the demo, only its author (see moderates).
 */
export async function requireCanEdit(db: Database, id: number, userId: string) {
  const [row] = await db
    .select({
      authorId: posts.authorId,
      onTeam: onTeam(userId),
      moderates: moderates(userId),
    })
    .from(posts)
    .where(eq(posts.id, id))
    .limit(1);
  if (!row) throw new AppError(404, "NOT_FOUND", "Post not found");
  if (row.authorId === userId || row.moderates) return;
  if (row.onTeam) {
    throw new AppError(
      403,
      "DEMO_READ_ONLY",
      "In the demo, a request is its author's to change"
    );
  }
  throw new AppError(
    403,
    "FORBIDDEN",
    "Only the author or the workspace team can do that"
  );
}

export async function updatePost(
  db: Database,
  id: number,
  changes: { title?: string; body?: string }
) {
  await db.update(posts).set(changes).where(eq(posts.id, id));
}

export async function deletePost(db: Database, id: number) {
  await db.delete(posts).where(eq(posts.id, id));
}

/** The few fields a link preview needs. */
export async function findPostMeta(db: Database, id: number) {
  const [row] = await db
    .select({
      id: posts.id,
      title: posts.title,
      body: posts.body,
      workspaceName: organization.name,
      mergedIntoId: posts.mergedIntoId,
    })
    .from(posts)
    .innerJoin(organization, eq(organization.id, posts.organizationId))
    .where(eq(posts.id, id))
    .limit(1);
  return row ?? null;
}
