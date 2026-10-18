import { and, count, eq, isNull } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { comments, posts } from "../db/schema";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import { commentOn, setupWorkspace, submitPost } from "../test/fixtures";

const { db, close } = testDb();
afterAll(() => close());

type TestApp = ReturnType<typeof testApp>;

/** A workspace and one post by its owner, who is on the team. */
async function postByOwner(t: TestApp) {
  const { owner, slug, boards } = await setupWorkspace(t);
  const post = await submitPost(t, owner.cookie, slug, {
    boardId: boards[0]!.id,
    title: "Dark mode",
  });
  return { owner, slug, boards, post };
}

const send = (
  t: TestApp,
  cookie: string | undefined,
  postId: number,
  json: { body: string; parentId?: number }
) =>
  t.client.api.posts[":id"].comments.$post(
    { param: { id: String(postId) }, json },
    cookie ? { headers: { cookie } } : undefined
  );

/** The stored count, next to the comments it must equal. */
async function tally(postId: number) {
  const [post] = await db
    .select({ commentCount: posts.commentCount })
    .from(posts)
    .where(eq(posts.id, postId));
  const [rows] = await db
    .select({ n: count() })
    .from(comments)
    .where(and(eq(comments.postId, postId), isNull(comments.deletedAt)));
  return { commentCount: post?.commentCount, rows: rows?.n };
}

async function replyCountOf(commentId: number) {
  const [row] = await db
    .select({ replyCount: comments.replyCount })
    .from(comments)
    .where(eq(comments.id, commentId));
  return row?.replyCount;
}

describe("POST /api/posts/:id/comments", () => {
  it("adds a comment and counts it", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const reader = await t.signIn();
    const res = await send(t, reader.cookie, post.id, {
      body: "  Yes please, **for** reading at night.  ",
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      success: true,
      data: {
        comment: {
          id: expect.any(Number),
          postId: post.id,
          parentId: null,
          depth: 0,
          body: "Yes please, **for** reading at night.",
          author: { name: "" },
          official: false,
          deleted: false,
          replyCount: 0,
          replies: [],
          canDelete: true,
          createdAt: expect.any(String),
        },
        commentCount: 1,
      },
    });
    expect(await tally(post.id)).toEqual({ commentCount: 1, rows: 1 });
    await t.settle();
  });

  it("shows the count with the post and in the feed", async () => {
    const t = testApp();
    const { owner, slug, post } = await postByOwner(t);
    await commentOn(t, owner.cookie, post.id, "First");
    await commentOn(t, owner.cookie, post.id, "Second");
    const detail = await t.client.api.posts[":id"].$get({
      param: { id: String(post.id) },
    });
    expect(await detail.json()).toMatchObject({ data: { commentCount: 2 } });
    const feed = await t.client.api.workspaces[":slug"].posts.$get({
      param: { slug },
      query: {},
    });
    expect(await feed.json()).toMatchObject({
      data: { items: [{ id: post.id, commentCount: 2 }] },
    });
    await t.settle();
  });

  it("marks a comment by the workspace's team", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const { comment } = await commentOn(
      t,
      owner.cookie,
      post.id,
      "Planned for next month."
    );
    expect(comment.official).toBe(true);
    await t.settle();
  });

  it("adds a reply under its parent and counts it there", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const parent = await commentOn(t, owner.cookie, post.id, "What else?");
    const reader = await t.signIn();
    const res = await send(t, reader.cookie, post.id, {
      body: "The editor too.",
      parentId: parent.comment.id,
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      data: {
        comment: { parentId: parent.comment.id, depth: 1 },
        commentCount: 2,
      },
    });
    expect(await replyCountOf(parent.comment.id)).toBe(1);
    await t.settle();
  });

  it("puts a reply to the deepest comment beside it", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const chain: number[] = [];
    for (let depth = 0; depth <= 3; depth++) {
      const { comment } = await commentOn(
        t,
        owner.cookie,
        post.id,
        `Level ${depth}`,
        chain.at(-1)
      );
      expect(comment.depth).toBe(depth);
      chain.push(comment.id);
    }
    const { comment } = await commentOn(
      t,
      owner.cookie,
      post.id,
      "Me too",
      chain[3]
    );
    expect(comment).toMatchObject({ parentId: chain[2], depth: 3 });
    expect(await replyCountOf(chain[2]!)).toBe(2);
    await t.settle();
  });

  it("accepts a reply to a deleted comment, under its placeholder", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const parent = await commentOn(t, owner.cookie, post.id, "Gone soon");
    await db
      .update(comments)
      .set({ deletedAt: new Date(), body: "" })
      .where(eq(comments.id, parent.comment.id));
    const reply = await commentOn(
      t,
      owner.cookie,
      post.id,
      "Answering anyway",
      parent.comment.id
    );
    expect(reply.comment.parentId).toBe(parent.comment.id);
    expect(await replyCountOf(parent.comment.id)).toBe(1);
    await t.settle();
  });

  it("refuses a reply to a comment on another post", async () => {
    const t = testApp();
    const { owner, slug, boards, post } = await postByOwner(t);
    const other = await submitPost(t, owner.cookie, slug, {
      boardId: boards[0]!.id,
      title: "Export to CSV",
    });
    const elsewhere = await commentOn(t, owner.cookie, other.id, "Over here");
    const res = await send(t, owner.cookie, post.id, {
      body: "Hi",
      parentId: elsewhere.comment.id,
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "BAD_REQUEST",
      fields: { parentId: "COMMENT_UNKNOWN" },
    });
    expect(await tally(post.id)).toEqual({ commentCount: 0, rows: 0 });
    await t.settle();
  });

  it.each([
    ["blank", "   "],
    ["over 3000 characters", "x".repeat(3001)],
    ["holding a NUL character", "a\u0000b"],
  ])("refuses a comment that's %s", async (_label, body) => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const res = await send(t, owner.cookie, post.id, { body });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      fields: { body: expect.any(String) },
    });
    await t.settle();
  });

  it("needs a signed-in user", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const res = await send(t, undefined, post.id, { body: "Hi" });
    expect(res.status).toBe(401);
    await t.settle();
  });

  it("answers 404 for a post that's gone", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    await t.client.api.posts[":id"].$delete(
      { param: { id: String(post.id) } },
      { headers: { cookie: owner.cookie } }
    );
    const res = await send(t, owner.cookie, post.id, { body: "Hi" });
    expect(res.status).toBe(404);
    await t.settle();
  });

  it("refuses a comment on a merged post", async () => {
    const t = testApp();
    const { owner, slug, boards, post } = await postByOwner(t);
    const target = await submitPost(t, owner.cookie, slug, {
      boardId: boards[0]!.id,
      title: "Dark theme",
    });
    await db
      .update(posts)
      .set({ mergedIntoId: target.id })
      .where(eq(posts.id, post.id));
    const res = await send(t, owner.cookie, post.id, { body: "Hi" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      success: false,
      code: "POST_MERGED",
    });
    expect(await tally(post.id)).toEqual({ commentCount: 0, rows: 0 });
    await t.settle();
  });

  it("allows 30 comments an hour per person in production", async () => {
    // Sign in through a dev app: production also limits code requests per IP.
    const dev = testApp();
    const { post } = await postByOwner(dev);
    const member = await dev.signIn();
    const prod = testApp({ ENVIRONMENT: "production" });
    const statuses: number[] = [];
    for (let i = 1; i <= 31; i++) {
      const res = await send(prod, member.cookie, post.id, {
        body: `Thought ${i}`,
      });
      statuses.push(res.status);
    }
    expect(statuses.filter((status) => status === 201)).toHaveLength(30);
    expect(statuses.at(-1)).toBe(429);
    await dev.settle();
    await prod.settle();
  }, 30_000);

  it("keeps the counts equal to the comments when 20 arrive at once", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const parent = await commentOn(t, owner.cookie, post.id, "Top");
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        send(
          t,
          owner.cookie,
          post.id,
          i % 2 === 0
            ? { body: `Reply ${i}`, parentId: parent.comment.id }
            : { body: `Comment ${i}` }
        )
      )
    );
    expect(responses.map((res) => res.status)).toEqual(Array(20).fill(201));
    expect(await tally(post.id)).toEqual({ commentCount: 21, rows: 21 });
    expect(await replyCountOf(parent.comment.id)).toBe(10);
    await t.settle();
  }, 30_000);
});
