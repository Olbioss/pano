import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { posts } from "../db/schema";
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

/** A workspace and one post by its owner. */
async function postByOwner(t: TestApp) {
  const { owner, slug, boards } = await setupWorkspace(t);
  const post = await submitPost(t, owner.cookie, slug, {
    boardId: boards[0]!.id,
    title: "Dark mode",
  });
  return { owner, slug, boards, post };
}

const subscribe = (
  t: TestApp,
  cookie: string | undefined,
  postId: number,
  subscribed: boolean
) =>
  t.client.api.posts[":id"].subscription.$put(
    { param: { id: String(postId) }, json: { subscribed } },
    cookie ? { headers: { cookie } } : undefined
  );

async function isSubscribed(t: TestApp, postId: number, cookie?: string) {
  const res = await t.client.api.posts[":id"].$get(
    { param: { id: String(postId) } },
    cookie ? { headers: { cookie } } : undefined
  );
  const body = await res.json();
  if (!body.success) throw new Error(`post failed: ${body.error}`);
  return body.data.subscribed;
}

describe("subscriptions", () => {
  it("subscribes the author of a new post", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    expect(await isSubscribed(t, post.id, owner.cookie)).toBe(true);
    await t.settle();
  });

  it("subscribes a voter, who stays subscribed after taking the vote back", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const voter = await t.signIn();
    expect(await isSubscribed(t, post.id, voter.cookie)).toBe(false);
    await voteFor(t, voter.cookie, post.id);
    expect(await isSubscribed(t, post.id, voter.cookie)).toBe(true);
    await voteFor(t, voter.cookie, post.id, false);
    expect(await isSubscribed(t, post.id, voter.cookie)).toBe(true);
    await t.settle();
  });

  it("subscribes a commenter", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const reader = await t.signIn();
    await commentOn(t, reader.cookie, post.id, "Yes please.");
    expect(await isSubscribed(t, post.id, reader.cookie)).toBe(true);
    await t.settle();
  });

  it("unsubscribes and subscribes as asked, repeats included", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    for (const subscribed of [false, false, true, true, false]) {
      const res = await subscribe(t, owner.cookie, post.id, subscribed);
      expect(await res.json()).toEqual({ success: true, data: { subscribed } });
      expect(await isSubscribed(t, post.id, owner.cookie)).toBe(subscribed);
    }
    await t.settle();
  });

  it("doesn't undo an unsubscribe when the same vote is sent again", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    await subscribe(t, owner.cookie, post.id, false);
    // The author's vote was counted at posting, so this changes nothing.
    await voteFor(t, owner.cookie, post.id);
    expect(await isSubscribed(t, post.id, owner.cookie)).toBe(false);
    await t.settle();
  });

  it("shows false to everyone else, and when signed out", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const other = await t.signIn();
    expect(await isSubscribed(t, post.id, other.cookie)).toBe(false);
    expect(await isSubscribed(t, post.id)).toBe(false);
    await t.settle();
  });

  it("refuses a merged post", async () => {
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
    const res = await subscribe(t, owner.cookie, post.id, true);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "POST_MERGED" });
    await t.settle();
  });

  it("needs a signed-in user, and a post that exists", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    expect((await subscribe(t, undefined, post.id, true)).status).toBe(401);
    expect((await subscribe(t, owner.cookie, 999_999_999, true)).status).toBe(
      404
    );
    await t.settle();
  });
});
