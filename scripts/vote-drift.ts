// The "before" picture for the spec's first proof point: one person clicks
// the vote button 20 times faster than the server answers. BetterNews's
// read-then-write toggle can end with several votes from that one person;
// Pano's setVote ends with at most one, and the count always equals the rows.
//
//   bun run vote-drift      (uses TEST_DATABASE_URL; local databases only)
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../worker/db/schema";
import { setVote } from "../worker/services/votes";
import { assertLocalDatabaseUrl } from "../worker/test/local-db";

const CLICKS = 20;
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
assertLocalDatabaseUrl(url);

const sql = postgres(url, { max: CLICKS, onnotice: () => {} });
const db = drizzle({ client: sql, schema });

type Result = { count: number; rows: number; people: number };

/** BetterNews's POST /posts/:id/upvote, transcribed: read, then write. */
async function betterNewsToggle(userId: string) {
  await sql.begin(async (tx) => {
    const [existing] =
      await tx`select id from vote_drift.upvotes where post_id = 1 and user_id = ${userId} limit 1`;
    const change = existing ? -1 : 1;
    await tx`update vote_drift.posts set points = points + ${change} where id = 1`;
    if (existing) {
      await tx`delete from vote_drift.upvotes where id = ${existing.id}`;
    } else {
      await tx`insert into vote_drift.upvotes (post_id, user_id) values (1, ${userId})`;
    }
  });
}

async function betterNews(): Promise<Result> {
  await sql`drop schema if exists vote_drift cascade`;
  await sql`create schema vote_drift`;
  try {
    // As in BetterNews: an upvote row has its own id, and nothing stops a
    // second row for the same person.
    await sql`create table vote_drift.posts (id int primary key, points int not null default 0)`;
    await sql`create table vote_drift.upvotes (id serial primary key, post_id int not null, user_id text not null)`;
    await sql`insert into vote_drift.posts (id) values (1)`;
    await Promise.all(
      Array.from({ length: CLICKS }, () => betterNewsToggle("someone"))
    );
    const [row] = await sql<Result[]>`
      select (select points from vote_drift.posts where id = 1) as count,
             (select count(*)::int from vote_drift.upvotes) as rows,
             (select count(distinct user_id)::int from vote_drift.upvotes) as people`;
    if (!row) throw new Error("no result");
    return row;
  } finally {
    await sql`drop schema vote_drift cascade`;
  }
}

async function pano(): Promise<Result> {
  const id = `vote-drift-${crypto.randomUUID().slice(0, 8)}`;
  await db
    .insert(schema.user)
    .values({ id, name: "", email: `${id}@example.com` });
  await db
    .insert(schema.organization)
    .values({ id, name: "Vote drift", slug: id, createdAt: new Date() });
  try {
    const [board] = await db
      .insert(schema.boards)
      .values({ organizationId: id, slug: "ideas", name: "Ideas" })
      .returning({ id: schema.boards.id });
    const [post] = await db
      .insert(schema.posts)
      .values({
        organizationId: id,
        boardId: board!.id,
        title: "Dark mode",
        searchConfig: "english",
      })
      .returning({ id: schema.posts.id });
    const postId = post!.id;
    // The same 20 clicks, each sending the state it asks for: on, off, on…
    await Promise.all(
      Array.from({ length: CLICKS }, (_, i) =>
        setVote(db, { postId, userId: id, voted: i % 2 === 0 })
      )
    );
    const [stored] = await db
      .select({ count: schema.posts.voteCount })
      .from(schema.posts)
      .where(eq(schema.posts.id, postId));
    const [rows] = await db
      .select({ n: count() })
      .from(schema.votes)
      .where(eq(schema.votes.postId, postId));
    // (post_id, user_id) is the primary key, so every row is a different person.
    return { count: stored!.count, rows: rows!.n, people: rows!.n };
  } finally {
    await db.delete(schema.organization).where(eq(schema.organization.id, id));
    await db.delete(schema.user).where(eq(schema.user.id, id));
  }
}

try {
  const before = await betterNews();
  const after = await pano();
  console.log(`One person, ${CLICKS} clicks at once:`);
  console.log(
    `  BetterNews toggle  count ${before.count}, vote rows ${before.rows}, people ${before.people}`
  );
  console.log(
    `  Pano setVote       count ${after.count}, vote rows ${after.rows}, people ${after.people}`
  );
} finally {
  await sql.end();
}
