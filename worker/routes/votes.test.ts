import { count, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { posts, votes } from "../db/schema";
import { ORIGIN, testApp } from "../test/app";
import { testDb } from "../test/db";
import { setupWorkspace, submitPost, voteFor } from "../test/fixtures";

const { db, close } = testDb();
afterAll(() => close());

type TestApp = ReturnType<typeof testApp>;

/** The stored count, next to the rows it must equal. */
async function tally(postId: number) {
  const [post] = await db
    .select({ voteCount: posts.voteCount })
    .from(posts)
    .where(eq(posts.id, postId));
  const [rows] = await db
    .select({ n: count() })
    .from(votes)
    .where(eq(votes.postId, postId));
  return { voteCount: post?.voteCount, rows: rows?.n };
}

async function postByOwner(t: TestApp) {
  const { owner, slug, boards } = await setupWorkspace(t);
  const post = await submitPost(t, owner.cookie, slug, {
    boardId: boards[0]!.id,
    title: "Dark mode",
  });
  return { owner, slug, boards, post };
}

describe("PUT /api/posts/:id/vote", () => {
  it("counts a vote and returns the new count", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const voter = await t.signIn();
    const res = await voteFor(t, voter.cookie, post.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: { voted: true, voteCount: 2 },
    });
    await t.settle();
  });

  it("sets the state you ask for, so repeating it changes nothing", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const voter = await t.signIn();
    await voteFor(t, voter.cookie, post.id);
    const again = await voteFor(t, voter.cookie, post.id);
    expect(await again.json()).toMatchObject({
      data: { voted: true, voteCount: 2 },
    });
    expect(await tally(post.id)).toEqual({ voteCount: 2, rows: 2 });
    await t.settle();
  });

  it("removes a vote, and removing it again changes nothing", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const voter = await t.signIn();
    await voteFor(t, voter.cookie, post.id);
    const removed = await voteFor(t, voter.cookie, post.id, false);
    expect(await removed.json()).toMatchObject({
      data: { voted: false, voteCount: 1 },
    });
    const again = await voteFor(t, voter.cookie, post.id, false);
    expect(await again.json()).toMatchObject({
      data: { voted: false, voteCount: 1 },
    });
    await t.settle();
  });

  it("keeps the count equal to the rows when 50 people vote at once", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const voters: { email: string; cookie: string }[] = [];
    for (let i = 0; i < 50; i++) voters.push(await t.signIn());
    const responses = await Promise.all(
      voters.map((voter) => voteFor(t, voter.cookie, post.id))
    );
    expect(responses.map((res) => res.status)).toEqual(Array(50).fill(200));
    expect(await tally(post.id)).toEqual({ voteCount: 51, rows: 51 });
    await t.settle();
  }, 60_000);

  it("keeps the count equal to the rows when one person sends 20 alternating votes at once", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const voter = await t.signIn();
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        voteFor(t, voter.cookie, post.id, i % 2 === 0)
      )
    );
    expect(responses.map((res) => res.status)).toEqual(Array(20).fill(200));
    const { voteCount, rows } = await tally(post.id);
    expect(voteCount).toBe(rows);
    expect([1, 2]).toContain(rows);
    await t.settle();
  }, 30_000);

  it("refuses a vote on a merged post", async () => {
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
    const voter = await t.signIn();
    const res = await voteFor(t, voter.cookie, post.id);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      success: false,
      code: "POST_MERGED",
    });
    expect(await tally(post.id)).toEqual({ voteCount: 1, rows: 1 });
    await t.settle();
  });

  it("answers 404 for a post that's gone", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    await t.client.api.posts[":id"].$delete(
      { param: { id: String(post.id) } },
      { headers: { cookie: owner.cookie } }
    );
    const voter = await t.signIn();
    const res = await voteFor(t, voter.cookie, post.id);
    expect(res.status).toBe(404);
    await t.settle();
  });

  it("needs a signed-in user", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const res = await t.client.api.posts[":id"].vote.$put({
      param: { id: String(post.id) },
      json: { voted: true },
    });
    expect(res.status).toBe(401);
    await t.settle();
  });

  it("refuses a vote that isn't true or false", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const voter = await t.signIn();
    const res = await t.request(`/api/posts/${post.id}/vote`, {
      method: "PUT",
      headers: {
        cookie: voter.cookie,
        origin: ORIGIN,
        "content-type": "application/json",
      },
      body: JSON.stringify({ voted: "yes" }),
    });
    expect(res.status).toBe(400);
    await t.settle();
  });
});
