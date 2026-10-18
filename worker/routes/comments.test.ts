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

type PageQuery = { before?: string; limit?: string };

async function readThread(
  t: TestApp,
  postId: number,
  query: PageQuery = {},
  cookie?: string
) {
  const res = await t.client.api.posts[":id"].comments.$get(
    { param: { id: String(postId) }, query },
    cookie ? { headers: { cookie } } : undefined
  );
  const body = await res.json();
  if (!body.success) throw new Error(`thread failed: ${body.error}`);
  return body.data;
}

async function readReplies(
  t: TestApp,
  commentId: number,
  query: PageQuery = {}
) {
  const res = await t.client.api.comments[":id"].replies.$get({
    param: { id: String(commentId) },
    query,
  });
  const body = await res.json();
  if (!body.success) throw new Error(`replies failed: ${body.error}`);
  return body.data;
}

const bodies = (list: { body: string }[]) => list.map((item) => item.body);

const pin = (
  t: TestApp,
  cookie: string | undefined,
  postId: number,
  commentId: number | null
) =>
  t.client.api.posts[":id"].pin.$put(
    { param: { id: String(postId) }, json: { commentId } },
    cookie ? { headers: { cookie } } : undefined
  );

async function readPost(t: TestApp, postId: number, cookie?: string) {
  const res = await t.client.api.posts[":id"].$get(
    { param: { id: String(postId) } },
    cookie ? { headers: { cookie } } : undefined
  );
  const body = await res.json();
  if (!body.success) throw new Error(`post failed: ${body.error}`);
  return body.data;
}

const remove = (t: TestApp, cookie: string | undefined, commentId: number) =>
  t.client.api.comments[":id"].$delete(
    { param: { id: String(commentId) } },
    cookie ? { headers: { cookie } } : undefined
  );

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

describe("GET /api/posts/:id/comments", () => {
  it("lists top-level comments newest first, a page at a time", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    for (let i = 1; i <= 3; i++) {
      await commentOn(t, owner.cookie, post.id, `Comment ${i}`);
    }
    const first = await readThread(t, post.id, { limit: "2" });
    expect(bodies(first.items)).toEqual(["Comment 3", "Comment 2"]);
    expect(first.hasMore).toBe(true);
    const second = await readThread(t, post.id, {
      limit: "2",
      before: String(first.items[1]!.id),
    });
    expect(bodies(second.items)).toEqual(["Comment 1"]);
    expect(second.hasMore).toBe(false);
    await t.settle();
  });

  it("neither repeats nor skips a comment that arrives between pages", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    for (let i = 1; i <= 3; i++) {
      await commentOn(t, owner.cookie, post.id, `Comment ${i}`);
    }
    const first = await readThread(t, post.id, { limit: "2" });
    await commentOn(t, owner.cookie, post.id, "Comment 4");
    const second = await readThread(t, post.id, {
      limit: "2",
      before: String(first.items.at(-1)!.id),
    });
    expect(bodies(second.items)).toEqual(["Comment 1"]);
    await t.settle();
  });

  it("brings each comment's latest two replies, oldest first", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const top = await commentOn(t, owner.cookie, post.id, "Top");
    for (let i = 1; i <= 3; i++) {
      await commentOn(t, owner.cookie, post.id, `Reply ${i}`, top.comment.id);
    }
    const { items } = await readThread(t, post.id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ body: "Top", replyCount: 3 });
    expect(bodies(items[0]!.replies)).toEqual(["Reply 2", "Reply 3"]);
    expect(items[0]!.replies[0]!.replies).toEqual([]);
    await t.settle();
  });

  it("brings the latest replies at every level, so a new reply stays in view", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const top = await commentOn(t, owner.cookie, post.id, "Top");
    const reply = await commentOn(
      t,
      owner.cookie,
      post.id,
      "Reply",
      top.comment.id
    );
    const deeper = await commentOn(
      t,
      owner.cookie,
      post.id,
      "Deeper",
      reply.comment.id
    );
    await commentOn(t, owner.cookie, post.id, "Deepest", deeper.comment.id);
    const { items } = await readThread(t, post.id);
    const shownReply = items[0]!.replies[0]!;
    expect(shownReply).toMatchObject({ body: "Reply", replyCount: 1 });
    expect(bodies(shownReply.replies)).toEqual(["Deeper"]);
    expect(bodies(shownReply.replies[0]!.replies)).toEqual(["Deepest"]);
    await t.settle();
  });

  it("shows a deleted comment as a placeholder that keeps its replies", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const reader = await t.signIn();
    const top = await commentOn(t, reader.cookie, post.id, "Oops");
    await commentOn(t, owner.cookie, post.id, "Still here", top.comment.id);
    await db
      .update(comments)
      .set({ deletedAt: new Date(), body: "" })
      .where(eq(comments.id, top.comment.id));
    const { items } = await readThread(t, post.id, {}, reader.cookie);
    expect(items[0]).toMatchObject({
      deleted: true,
      body: "",
      author: null,
      official: false,
      canDelete: false,
      replyCount: 1,
    });
    expect(bodies(items[0]!.replies)).toEqual(["Still here"]);
    await t.settle();
  });

  it("lets only the author and the team delete", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const writer = await t.signIn();
    const other = await t.signIn();
    await commentOn(t, writer.cookie, post.id, "Mine");
    const canDelete = async (cookie?: string) =>
      (await readThread(t, post.id, {}, cookie)).items[0]!.canDelete;
    expect(await canDelete(writer.cookie)).toBe(true);
    expect(await canDelete(owner.cookie)).toBe(true);
    expect(await canDelete(other.cookie)).toBe(false);
    expect(await canDelete()).toBe(false);
    await t.settle();
  });

  it("answers 404 for an unknown post, and 400 for a bad page", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const missing = await t.client.api.posts[":id"].comments.$get({
      param: { id: "999999999" },
      query: {},
    });
    expect(missing.status).toBe(404);
    for (const query of [{ before: "abc" }, { limit: "0" }]) {
      const res = await t.client.api.posts[":id"].comments.$get({
        param: { id: String(post.id) },
        query,
      });
      expect(res.status).toBe(400);
    }
    await t.settle();
  });
});

describe("GET /api/comments/:id/replies", () => {
  it("pages back through replies: newest page first, each oldest first", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const top = await commentOn(t, owner.cookie, post.id, "Top");
    for (let i = 1; i <= 5; i++) {
      await commentOn(t, owner.cookie, post.id, `Reply ${i}`, top.comment.id);
    }
    const newest = await readReplies(t, top.comment.id, { limit: "2" });
    expect(bodies(newest.items)).toEqual(["Reply 4", "Reply 5"]);
    expect(newest.hasMore).toBe(true);
    const earlier = await readReplies(t, top.comment.id, {
      limit: "2",
      before: String(newest.items[0]!.id),
    });
    expect(bodies(earlier.items)).toEqual(["Reply 2", "Reply 3"]);
    const earliest = await readReplies(t, top.comment.id, {
      limit: "2",
      before: String(earlier.items[0]!.id),
    });
    expect(bodies(earliest.items)).toEqual(["Reply 1"]);
    expect(earliest.hasMore).toBe(false);
    await t.settle();
  });

  it("brings each reply's latest replies", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const top = await commentOn(t, owner.cookie, post.id, "Top");
    const reply = await commentOn(
      t,
      owner.cookie,
      post.id,
      "Reply",
      top.comment.id
    );
    await commentOn(t, owner.cookie, post.id, "Deeper", reply.comment.id);
    const { items } = await readReplies(t, top.comment.id);
    expect(items[0]).toMatchObject({ body: "Reply", replyCount: 1 });
    expect(bodies(items[0]!.replies)).toEqual(["Deeper"]);
    await t.settle();
  });

  it("brings the latest replies at every level below each reply", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const top = await commentOn(t, owner.cookie, post.id, "Top");
    const reply = await commentOn(
      t,
      owner.cookie,
      post.id,
      "Reply",
      top.comment.id
    );
    const deeper = await commentOn(
      t,
      owner.cookie,
      post.id,
      "Deeper",
      reply.comment.id
    );
    await commentOn(t, owner.cookie, post.id, "Deepest", deeper.comment.id);
    const { items } = await readReplies(t, top.comment.id);
    expect(bodies(items[0]!.replies)).toEqual(["Deeper"]);
    expect(bodies(items[0]!.replies[0]!.replies)).toEqual(["Deepest"]);
    await t.settle();
  });

  it("answers 404 for a comment that doesn't exist", async () => {
    const t = testApp();
    const res = await t.client.api.comments[":id"].replies.$get({
      param: { id: "999999999" },
      query: {},
    });
    expect(res.status).toBe(404);
    await t.settle();
  });
});

describe("PUT /api/posts/:id/pin", () => {
  it("lets the team pin a comment, shown with the post", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const reader = await t.signIn();
    const { comment } = await commentOn(
      t,
      reader.cookie,
      post.id,
      "Use the system setting."
    );
    const res = await pin(t, owner.cookie, post.id, comment.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      data: { pinned: { id: comment.id, body: "Use the system setting." } },
    });
    expect(await readPost(t, post.id, reader.cookie)).toMatchObject({
      isTeam: false,
      pinned: { id: comment.id, canDelete: true },
    });
    expect(await readPost(t, post.id, owner.cookie)).toMatchObject({
      isTeam: true,
      pinned: { id: comment.id },
    });
    expect(await readPost(t, post.id)).toMatchObject({
      isTeam: false,
      pinned: { id: comment.id, canDelete: false },
    });
    await t.settle();
  });

  it("unpins with null", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const { comment } = await commentOn(t, owner.cookie, post.id, "Pinned");
    await pin(t, owner.cookie, post.id, comment.id);
    const res = await pin(t, owner.cookie, post.id, null);
    expect(await res.json()).toEqual({ success: true, data: { pinned: null } });
    expect((await readPost(t, post.id)).pinned).toBeNull();
    await t.settle();
  });

  it("is only for the team", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const { comment } = await commentOn(t, owner.cookie, post.id, "Hello");
    const reader = await t.signIn();
    const asReader = await pin(t, reader.cookie, post.id, comment.id);
    expect(asReader.status).toBe(403);
    const signedOut = await pin(t, undefined, post.id, comment.id);
    expect(signedOut.status).toBe(401);
    expect((await readPost(t, post.id)).pinned).toBeNull();
    await t.settle();
  });

  it("refuses a comment from another post, or a deleted one", async () => {
    const t = testApp();
    const { owner, slug, boards, post } = await postByOwner(t);
    const other = await submitPost(t, owner.cookie, slug, {
      boardId: boards[0]!.id,
      title: "Export to CSV",
    });
    const elsewhere = await commentOn(t, owner.cookie, other.id, "Over there");
    const gone = await commentOn(t, owner.cookie, post.id, "Gone");
    await db
      .update(comments)
      .set({ deletedAt: new Date(), body: "" })
      .where(eq(comments.id, gone.comment.id));
    for (const commentId of [elsewhere.comment.id, gone.comment.id]) {
      const res = await pin(t, owner.cookie, post.id, commentId);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({
        fields: { commentId: "COMMENT_UNKNOWN" },
      });
    }
    await t.settle();
  });

  it("answers 404 for a post that doesn't exist", async () => {
    const t = testApp();
    const owner = await t.signIn();
    const res = await pin(t, owner.cookie, 999_999_999, null);
    expect(res.status).toBe(404);
    await t.settle();
  });
});

describe("DELETE /api/comments/:id", () => {
  it("lets the author delete a comment, keeping its place", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const writer = await t.signIn();
    const { comment } = await commentOn(t, writer.cookie, post.id, "Oops");
    const res = await remove(t, writer.cookie, comment.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      data: {
        comment: { id: comment.id, deleted: true, body: "", author: null },
        commentCount: 0,
      },
    });
    const [row] = await db
      .select({ body: comments.body, deletedAt: comments.deletedAt })
      .from(comments)
      .where(eq(comments.id, comment.id));
    expect(row?.body).toBe("");
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect(await tally(post.id)).toEqual({ commentCount: 0, rows: 0 });
    await t.settle();
  });

  it("lets the team delete anyone's comment", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const writer = await t.signIn();
    const { comment } = await commentOn(t, writer.cookie, post.id, "Spam");
    const res = await remove(t, owner.cookie, comment.id);
    expect(res.status).toBe(200);
    expect(await tally(post.id)).toEqual({ commentCount: 0, rows: 0 });
    await t.settle();
  });

  it("refuses everyone else", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const writer = await t.signIn();
    const other = await t.signIn();
    const { comment } = await commentOn(t, writer.cookie, post.id, "Mine");
    expect((await remove(t, other.cookie, comment.id)).status).toBe(403);
    expect((await remove(t, undefined, comment.id)).status).toBe(401);
    expect(await tally(post.id)).toEqual({ commentCount: 1, rows: 1 });
    await t.settle();
  });

  it("changes nothing the second time", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    await commentOn(t, owner.cookie, post.id, "Keep");
    const { comment } = await commentOn(t, owner.cookie, post.id, "Drop");
    await remove(t, owner.cookie, comment.id);
    const again = await remove(t, owner.cookie, comment.id);
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ data: { commentCount: 1 } });
    expect(await tally(post.id)).toEqual({ commentCount: 1, rows: 1 });
    await t.settle();
  });

  it("moves the count once when the same delete arrives five times at once", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    await commentOn(t, owner.cookie, post.id, "Keep");
    const { comment } = await commentOn(t, owner.cookie, post.id, "Drop");
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => remove(t, owner.cookie, comment.id))
    );
    expect(responses.map((res) => res.status)).toEqual(Array(5).fill(200));
    expect(await tally(post.id)).toEqual({ commentCount: 1, rows: 1 });
    await t.settle();
  });

  it("unpins a deleted comment", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const { comment } = await commentOn(t, owner.cookie, post.id, "Pinned");
    await pin(t, owner.cookie, post.id, comment.id);
    await remove(t, owner.cookie, comment.id);
    expect((await readPost(t, post.id)).pinned).toBeNull();
    await t.settle();
  });

  it("answers 404 for a comment that doesn't exist", async () => {
    const t = testApp();
    const owner = await t.signIn();
    expect((await remove(t, owner.cookie, 999_999_999)).status).toBe(404);
    await t.settle();
  });
});

describe("someone on another workspace's team", () => {
  /** A post here with a member's comment, and the owner of another workspace. */
  async function withOutsider(t: TestApp) {
    const { post } = await postByOwner(t);
    const writer = await t.signIn();
    const { comment } = await commentOn(t, writer.cookie, post.id, "Mine");
    const { owner: outsider } = await setupWorkspace(t);
    return { post, comment, outsider };
  }

  it("gets no Team badge here", async () => {
    const t = testApp();
    const { post, outsider } = await withOutsider(t);
    const { comment } = await commentOn(
      t,
      outsider.cookie,
      post.id,
      "Hello from elsewhere"
    );
    expect(comment.official).toBe(false);
    await t.settle();
  });

  it("can't delete someone else's comment here, and isn't offered to", async () => {
    const t = testApp();
    const { post, comment, outsider } = await withOutsider(t);
    const { items } = await readThread(t, post.id, {}, outsider.cookie);
    expect(items.find((c) => c.id === comment.id)?.canDelete).toBe(false);
    expect((await remove(t, outsider.cookie, comment.id)).status).toBe(403);
    expect(await tally(post.id)).toEqual({ commentCount: 1, rows: 1 });
    await t.settle();
  });

  it("can't pin here", async () => {
    const t = testApp();
    const { post, comment, outsider } = await withOutsider(t);
    const res = await pin(t, outsider.cookie, post.id, comment.id);
    expect(res.status).toBe(403);
    expect(await readPost(t, post.id, outsider.cookie)).toMatchObject({
      isTeam: false,
      pinned: null,
    });
    await t.settle();
  });
});
