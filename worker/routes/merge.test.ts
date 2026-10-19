import { and, count, eq, isNull } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { comments, posts, subscriptions, votes } from "../db/schema";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import {
  commentOn,
  setupWorkspace,
  submitPost,
  voteFor,
} from "../test/fixtures";

const { db, close } = testDb();
afterAll(() => close());

type TestApp = ReturnType<typeof testApp>;

/** A workspace with two posts by a member: a duplicate and the original. */
async function twoPosts(t: TestApp) {
  const workspace = await setupWorkspace(t);
  const author = await t.signIn();
  const boardId = workspace.boards[0]!.id;
  const duplicate = await submitPost(t, author.cookie, workspace.slug, {
    boardId,
    title: "Dark theme",
  });
  const original = await submitPost(t, author.cookie, workspace.slug, {
    boardId,
    title: "Dark mode",
  });
  return { ...workspace, author, duplicate, original };
}

const merge = (
  t: TestApp,
  cookie: string | undefined,
  postId: number,
  intoId: number
) =>
  t.client.api.posts[":id"].merge.$post(
    { param: { id: String(postId) }, json: { intoId } },
    cookie ? { headers: { cookie } } : undefined
  );

/** A post's stored counts, next to the rows they count. */
async function tally(postId: number) {
  const [post] = await db
    .select({
      voteCount: posts.voteCount,
      commentCount: posts.commentCount,
      mergedIntoId: posts.mergedIntoId,
    })
    .from(posts)
    .where(eq(posts.id, postId));
  const [voteRows] = await db
    .select({ n: count() })
    .from(votes)
    .where(eq(votes.postId, postId));
  const [commentRows] = await db
    .select({ n: count() })
    .from(comments)
    .where(and(eq(comments.postId, postId), isNull(comments.deletedAt)));
  const [followers] = await db
    .select({ n: count() })
    .from(subscriptions)
    .where(eq(subscriptions.postId, postId));
  return {
    ...post,
    votes: voteRows?.n,
    comments: commentRows?.n,
    subscribers: followers?.n,
  };
}

describe("POST /api/posts/:id/merge", () => {
  it("moves votes, comments and subscribers to the original", async () => {
    const t = testApp();
    const { owner, duplicate, original } = await twoPosts(t);
    const fan = await t.signIn();
    await voteFor(t, fan.cookie, duplicate.id);
    const top = await commentOn(t, fan.cookie, duplicate.id, "Same idea.");
    await commentOn(t, owner.cookie, duplicate.id, "Agreed.", top.comment.id);
    const res = await merge(t, owner.cookie, duplicate.id, original.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      data: { id: original.id, voteCount: 2, commentCount: 2 },
    });
    // The author voted on both, and counts once.
    expect(await tally(original.id)).toEqual({
      voteCount: 2,
      commentCount: 2,
      mergedIntoId: null,
      votes: 2,
      comments: 2,
      subscribers: 3,
    });
    expect(await tally(duplicate.id)).toEqual({
      voteCount: 0,
      commentCount: 0,
      mergedIntoId: original.id,
      votes: 0,
      comments: 0,
      subscribers: 0,
    });
    await t.settle();
  });

  it("counts someone who voted on both posts once", async () => {
    const t = testApp();
    const { owner, duplicate, original } = await twoPosts(t);
    const both = await t.signIn();
    await voteFor(t, both.cookie, duplicate.id);
    await voteFor(t, both.cookie, original.id);
    const res = await merge(t, owner.cookie, duplicate.id, original.id);
    expect(res.status).toBe(200);
    // The author and `both` voted on each post: two people, two votes.
    expect(await tally(original.id)).toMatchObject({ voteCount: 2, votes: 2 });
    expect(await tally(duplicate.id)).toMatchObject({ voteCount: 0, votes: 0 });
    await t.settle();
  });

  it("never lets a vote racing the merge land on the merged post", async () => {
    const t = testApp();
    const { owner, duplicate, original } = await twoPosts(t);
    const voters = await Promise.all(
      Array.from({ length: 12 }, () => t.signIn())
    );
    const [merged, ...cast] = await Promise.all([
      merge(t, owner.cookie, duplicate.id, original.id),
      ...voters.map((voter) => voteFor(t, voter.cookie, duplicate.id)),
    ]);
    expect(merged.status).toBe(200);
    // Each vote either landed first and moved, or came after and was refused.
    for (const res of cast) expect([200, 409]).toContain(res.status);
    const landed = cast.filter((res) => res.status === 200).length;
    expect(await tally(duplicate.id)).toMatchObject({ votes: 0, voteCount: 0 });
    const after = await tally(original.id);
    expect(after.votes).toBe(after.voteCount);
    expect(after.votes).toBe(1 + landed);
    await t.settle();
  }, 30_000);

  it("keeps threads whole and the original's pin", async () => {
    const t = testApp();
    const { owner, duplicate, original } = await twoPosts(t);
    const top = await commentOn(t, owner.cookie, duplicate.id, "Question?");
    const reply = await commentOn(
      t,
      owner.cookie,
      duplicate.id,
      "Answer.",
      top.comment.id
    );
    const kept = await commentOn(t, owner.cookie, original.id, "Pinned here.");
    for (const [postId, commentId] of [
      [duplicate.id, top.comment.id],
      [original.id, kept.comment.id],
    ] as const) {
      await t.client.api.posts[":id"].pin.$put(
        { param: { id: String(postId) }, json: { commentId } },
        { headers: { cookie: owner.cookie } }
      );
    }
    await merge(t, owner.cookie, duplicate.id, original.id);
    const [moved] = await db
      .select({ postId: comments.postId, parentId: comments.parentId })
      .from(comments)
      .where(eq(comments.id, reply.comment.id));
    expect(moved).toEqual({ postId: original.id, parentId: top.comment.id });
    const pins = await db
      .select({ id: posts.id, pinned: posts.pinnedCommentId })
      .from(posts)
      .where(eq(posts.organizationId, (await orgOf(original.id))!));
    expect(pins).toEqual(
      expect.arrayContaining([
        { id: original.id, pinned: kept.comment.id },
        { id: duplicate.id, pinned: null },
      ])
    );
    await t.settle();
  });

  it("points posts merged into the duplicate at the original", async () => {
    const t = testApp();
    const { owner, slug, boards, duplicate, original } = await twoPosts(t);
    const older = await submitPost(t, owner.cookie, slug, {
      boardId: boards[0]!.id,
      title: "Night mode",
    });
    await merge(t, owner.cookie, older.id, duplicate.id);
    await merge(t, owner.cookie, duplicate.id, original.id);
    expect((await tally(older.id)).mergedIntoId).toBe(original.id);
    await t.settle();
  });

  it("refuses to merge into itself, another workspace's post, or a merged one", async () => {
    const t = testApp();
    const { owner, slug, boards, duplicate, original } = await twoPosts(t);
    const elsewhere = await twoPosts(t);
    const gone = await submitPost(t, owner.cookie, slug, {
      boardId: boards[0]!.id,
      title: "Night mode",
    });
    await merge(t, owner.cookie, gone.id, original.id);
    for (const [intoId, field] of [
      [duplicate.id, "MERGE_SELF"],
      [elsewhere.original.id, "MERGE_TARGET"],
      [gone.id, "MERGE_TARGET"],
      [999_999_999, "MERGE_TARGET"],
    ] as const) {
      const res = await merge(t, owner.cookie, duplicate.id, intoId);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ fields: { intoId: field } });
    }
    expect((await tally(duplicate.id)).mergedIntoId).toBeNull();
    await t.settle();
  });

  it("refuses a post that's already merged, and one that's gone", async () => {
    const t = testApp();
    const { owner, duplicate, original } = await twoPosts(t);
    await merge(t, owner.cookie, duplicate.id, original.id);
    const again = await merge(t, owner.cookie, duplicate.id, original.id);
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ code: "POST_MERGED" });
    expect(
      (await merge(t, owner.cookie, 999_999_999, original.id)).status
    ).toBe(404);
    await t.settle();
  });

  it("is only for the post's own team", async () => {
    const t = testApp();
    const { author, duplicate, original } = await twoPosts(t);
    const { owner: outsider } = await setupWorkspace(t);
    expect(
      (await merge(t, author.cookie, duplicate.id, original.id)).status
    ).toBe(403);
    expect(
      (await merge(t, outsider.cookie, duplicate.id, original.id)).status
    ).toBe(403);
    expect((await merge(t, undefined, duplicate.id, original.id)).status).toBe(
      401
    );
    expect((await tally(duplicate.id)).mergedIntoId).toBeNull();
    await t.settle();
  });

  it("points a merged post's page at the original", async () => {
    const t = testApp();
    const { owner, duplicate, original } = await twoPosts(t);
    await merge(t, owner.cookie, duplicate.id, original.id);
    const res = await t.client.api.posts[":id"].$get({
      param: { id: String(duplicate.id) },
    });
    expect(await res.json()).toMatchObject({
      data: {
        mergedInto: { id: original.id, ref: `${original.id}-dark-mode` },
      },
    });
    await t.settle();
  });
});

async function orgOf(postId: number) {
  const [row] = await db
    .select({ organizationId: posts.organizationId })
    .from(posts)
    .where(eq(posts.id, postId));
  return row?.organizationId;
}
