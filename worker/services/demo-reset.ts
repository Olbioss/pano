import { and, eq, like, lt, sql } from "drizzle-orm";
import { DEMO_EMAIL_DOMAIN, DEMO_WORKSPACE_SLUG } from "@/shared/demo";
import type { PostStatus } from "@/shared/status";
import type { Database } from "../db/client";
import { organization, user as users } from "../db/schema";
import {
  DEMO_BOARDS,
  DEMO_PEOPLE,
  DEMO_POSTS,
  DEMO_TEAM,
  type DemoComment,
  type DemoPost,
} from "../demo/content";

/** Fixed, so every reset rebuilds the same workspace. */
export const DEMO_WORKSPACE_ID = "org_pano_demo";
const DEMO_WORKSPACE_NAME = "Inkwell";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const personId = (key: string) => `demo_${key}`;
const TEAM_KEYS = new Set(DEMO_TEAM.map((person) => person.key));

export type DemoResetSummary = {
  posts: number;
  votes: number;
  comments: number;
};

/**
 * Puts the demo workspace back exactly as worker/demo/content.ts describes
 * it, and deletes the guest accounts visitors made before the last reset.
 *
 * The demo logins are public, and visitors delete, merge and move requests.
 * The next visitor mustn't find what the last one left, so this doesn't
 * repair the workspace, it replaces it. Every write is scoped to the demo's
 * fixed workspace id and to demo addresses; nothing else is touched.
 *
 * The nightly cron runs it, and the Workers free plan allows a cron 10 ms of
 * CPU. So it costs four statements: the rows are built here, sent as one
 * JSON parameter, and unpacked by Postgres (`jsonb_to_recordset`).
 */
export async function resetDemo(
  db: Database,
  now = new Date()
): Promise<DemoResetSummary> {
  return db.transaction(async (tx) => {
    // Demo accounts more than a day old, with their sessions and votes: the
    // seeded people, and guests from before the last reset. A guest from
    // since keeps their account one more night, so a visitor mid-demo at
    // 01:00 isn't left writing as an account that's gone.
    await tx
      .delete(users)
      .where(
        and(
          like(users.email, `%@${DEMO_EMAIL_DOMAIN}`),
          lt(users.createdAt, new Date(now.getTime() - DAY))
        )
      );
    // The workspace, with its boards, requests and everything on them.
    await tx.delete(organization).where(eq(organization.id, DEMO_WORKSPACE_ID));
    // Ids from the tables' own sequences, so votes and comments can point at
    // their posts and parents before any of them exist.
    const [ids] = await tx.execute<{ posts: number[]; comments: number[] }>(sql`
      select
        (select json_agg(nextval(pg_get_serial_sequence('posts', 'id'))) from generate_series(1, ${DEMO_POSTS.length})) as posts,
        (select json_agg(nextval(pg_get_serial_sequence('comments', 'id'))) from generate_series(1, ${countComments(DEMO_POSTS)})) as comments`);
    const rows = demoRows({
      now: now.getTime(),
      postIds: ids!.posts,
      commentIds: ids!.comments,
    });
    // One statement: foreign keys are checked when it ends, so the order of
    // its parts, and of rows within them, doesn't matter.
    await tx.execute(sql`
      with data as (select ${JSON.stringify(rows)}::jsonb as d),
      new_people as (
        insert into "user" (id, name, email, email_verified, created_at, updated_at)
        select id, name, email, true, created_at, created_at
        from data, jsonb_to_recordset(d->'people') as x(id text, name text, email text, created_at timestamp)),
      new_workspace as (
        insert into organization (id, name, slug, created_at)
        select ${DEMO_WORKSPACE_ID}, ${DEMO_WORKSPACE_NAME}, ${DEMO_WORKSPACE_SLUG}, (d->>'founded')::timestamp from data),
      new_settings as (
        insert into workspace_settings (organization_id, default_locale, is_demo)
        values (${DEMO_WORKSPACE_ID}, 'en', true)),
      new_team as (
        insert into member (id, organization_id, user_id, role, created_at)
        select id, ${DEMO_WORKSPACE_ID}, user_id, role, (d->>'founded')::timestamp
        from data, jsonb_to_recordset(d->'team') as x(id text, user_id text, role text)),
      new_boards as (
        insert into boards (id, organization_id, slug, name, position)
        select id, ${DEMO_WORKSPACE_ID}, slug, name, position
        from data, jsonb_to_recordset(d->'boards') as x(id uuid, slug text, name text, position integer)),
      new_posts as (
        insert into posts (id, organization_id, board_id, author_id, title, body, status, vote_count, comment_count, pinned_comment_id, search_config, created_at, status_changed_at)
        overriding system value
        select id, ${DEMO_WORKSPACE_ID}, board_id, author_id, title, body, status, vote_count, comment_count, pinned_comment_id, 'english', created_at, status_changed_at
        from data, jsonb_to_recordset(d->'posts')
          as x(id bigint, board_id uuid, author_id text, title text, body text, status text, vote_count integer, comment_count integer, pinned_comment_id bigint, created_at timestamptz, status_changed_at timestamptz)),
      new_votes as (
        insert into votes (post_id, user_id, created_at)
        select post_id, user_id, created_at
        from data, jsonb_to_recordset(d->'votes') as x(post_id bigint, user_id text, created_at timestamptz)),
      new_subscriptions as (
        insert into subscriptions (post_id, user_id, created_at)
        select post_id, user_id, created_at
        from data, jsonb_to_recordset(d->'subscriptions') as x(post_id bigint, user_id text, created_at timestamptz)),
      new_timeline as (
        insert into status_changes (post_id, from_status, to_status, note, changed_by, created_at)
        select post_id, from_status, to_status, note, changed_by, created_at
        from data, jsonb_to_recordset(d->'statusChanges')
          as x(post_id bigint, from_status text, to_status text, note text, changed_by text, created_at timestamptz)),
      new_comments as (
        insert into comments (id, post_id, author_id, parent_id, depth, body, is_official, reply_count, created_at)
        overriding system value
        select id, post_id, author_id, parent_id, depth, body, is_official, reply_count, created_at
        from data, jsonb_to_recordset(d->'comments')
          as x(id bigint, post_id bigint, author_id text, parent_id bigint, depth integer, body text, is_official boolean, reply_count integer, created_at timestamptz))
      select 1`);
    return {
      posts: rows.posts.length,
      votes: rows.votes.length,
      comments: rows.comments.length,
    };
  });
}

function countComments(posts: DemoPost[]): number {
  const count = (list: DemoComment[] = []): number =>
    list.reduce((sum, comment) => sum + 1 + count(comment.replies), 0);
  return posts.reduce((sum, post) => sum + count(post.comments), 0);
}

/** `count` moments spaced evenly strictly between `from` and `to`. */
function spread(count: number, from: number, to: number): number[] {
  return Array.from({ length: count }, (_, i) =>
    Math.round(from + ((i + 1) * (to - from)) / (count + 1))
  );
}

/**
 * Who voted on a post: its author first, then the people after the author in
 * DEMO_PEOPLE, wrapping around. All different, so (post, person) is unique.
 */
function votersFor(post: DemoPost): string[] {
  const start = DEMO_PEOPLE.findIndex((person) => person.key === post.by);
  const others = [
    ...DEMO_PEOPLE.slice(start + 1),
    ...DEMO_PEOPLE.slice(0, start),
  ].map((person) => person.key);
  return [post.by, ...others.slice(0, post.votes - 1)];
}

type Row = Record<string, string | number | boolean | null>;

/**
 * Every row the demo holds, with times counted back from `now` and the
 * counters counted from the rows, as every write keeps them.
 */
function demoRows(input: {
  now: number;
  postIds: number[];
  commentIds: number[];
}) {
  const { now } = input;
  const iso = (ms: number) => new Date(ms).toISOString();
  const founded = iso(now - 120 * DAY);
  const boardIds = new Map(
    DEMO_BOARDS.map((board) => [board.slug, crypto.randomUUID()])
  );
  const rows = {
    founded,
    people: [...DEMO_TEAM, ...DEMO_PEOPLE].map((person) => ({
      id: personId(person.key),
      name: person.name,
      email: `${person.key}@${DEMO_EMAIL_DOMAIN}`,
      created_at: founded,
    })),
    team: DEMO_TEAM.map((person, index) => ({
      id: `mem_demo_${person.key}`,
      user_id: personId(person.key),
      role: index === 0 ? "owner" : "admin",
    })),
    boards: DEMO_BOARDS.map((board, position) => ({
      id: boardIds.get(board.slug)!,
      slug: board.slug,
      name: board.name,
      position,
    })),
    posts: [] as Row[],
    votes: [] as Row[],
    subscriptions: [] as Row[],
    statusChanges: [] as Row[],
    comments: [] as Row[],
  };
  const commentIds = [...input.commentIds];

  DEMO_POSTS.forEach((post, index) => {
    const postId = input.postIds[index]!;
    const created = now - post.daysAgo * DAY;
    // People follow a post from the first time they post, vote or comment.
    const followed = new Map<string, number>();
    const follow = (key: string, at: number) => {
      const before = followed.get(key);
      if (before === undefined || at < before) followed.set(key, at);
    };

    let status: PostStatus = "open";
    let statusChangedAt: number | null = null;
    for (const change of post.timeline ?? []) {
      const at = now - change.daysAgo * DAY;
      rows.statusChanges.push({
        post_id: postId,
        from_status: status,
        to_status: change.to,
        note: change.note ?? null,
        changed_by: personId(change.by),
        created_at: iso(at),
      });
      status = change.to;
      statusChangedAt = at;
    }

    // The author's vote comes with the post. The rest spread out after it,
    // `recentVotes` of them within the last week, which Trending ranks by.
    const voters = votersFor(post);
    const others = voters.length - 1;
    const recent = Math.min(post.recentVotes ?? 0, others);
    const weekAgo = Math.max(created + HOUR, now - 7 * DAY);
    const times = [
      created,
      ...spread(others - recent, created + HOUR, weekAgo),
      ...spread(recent, weekAgo, now - HOUR),
    ];
    voters.forEach((key, i) => {
      rows.votes.push({
        post_id: postId,
        user_id: personId(key),
        created_at: iso(times[i]!),
      });
      follow(key, times[i]!);
    });

    let pinnedCommentId: number | null = null;
    let commentCount = 0;
    const addComments = (
      list: DemoComment[] = [],
      parentId: number | null,
      depth: number
    ) => {
      for (const comment of list) {
        const id = commentIds.shift()!;
        const at = now - comment.hoursAgo * HOUR;
        rows.comments.push({
          id,
          post_id: postId,
          author_id: personId(comment.by),
          parent_id: parentId,
          depth,
          body: comment.body,
          is_official: TEAM_KEYS.has(comment.by),
          reply_count: comment.replies?.length ?? 0,
          created_at: iso(at),
        });
        commentCount += 1;
        if (comment.pinned) pinnedCommentId = id;
        follow(comment.by, at);
        addComments(comment.replies, id, depth + 1);
      }
    };
    addComments(post.comments, null, 0);

    rows.posts.push({
      id: postId,
      board_id: boardIds.get(post.board)!,
      author_id: personId(post.by),
      title: post.title,
      body: post.body,
      status,
      vote_count: voters.length,
      comment_count: commentCount,
      pinned_comment_id: pinnedCommentId,
      created_at: iso(created),
      status_changed_at: statusChangedAt === null ? null : iso(statusChangedAt),
    });
    for (const [key, at] of followed) {
      rows.subscriptions.push({
        post_id: postId,
        user_id: personId(key),
        created_at: iso(at),
      });
    }
  });
  return rows;
}
