import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import { setupWorkspace, submitPost } from "../test/fixtures";
import { pgErrorCode } from "./errors";
import { comments, posts, user as users } from "./schema";

const { db, close } = testDb();
afterAll(() => close());

const CHECK_VIOLATION = "23514";

/** A post made through the API, and its author's id, for comments to go on. */
async function aPost() {
  const t = testApp();
  const { owner, slug, boards } = await setupWorkspace(t);
  const post = await submitPost(t, owner.cookie, slug, {
    boardId: boards[0]!.id,
    title: "Dark mode",
  });
  await t.settle();
  const [author] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, owner.email));
  if (!author) throw new Error("the post's author is missing");
  return { postId: post.id, authorId: author.id };
}

describe("the comments table", () => {
  it("refuses a comment nested deeper than three replies", async () => {
    const { postId, authorId } = await aPost();
    await db
      .insert(comments)
      .values({ postId, authorId, depth: 3, body: "Deepest" });
    const err = await db
      .insert(comments)
      .values({ postId, authorId, depth: 4, body: "Too deep" })
      .catch((error: unknown) => error);
    expect(pgErrorCode(err)).toBe(CHECK_VIOLATION);
  });

  it("never lets a post's comment count go below zero", async () => {
    const { postId } = await aPost();
    const err = await db
      .update(posts)
      .set({ commentCount: -1 })
      .where(eq(posts.id, postId))
      .catch((error: unknown) => error);
    expect(pgErrorCode(err)).toBe(CHECK_VIOLATION);
  });

  it("goes with its post, the pinned comment included", async () => {
    const { postId, authorId } = await aPost();
    const [top] = await db
      .insert(comments)
      .values({ postId, authorId, body: "Top" })
      .returning({ id: comments.id });
    await db
      .insert(comments)
      .values({ postId, authorId, parentId: top!.id, depth: 1, body: "Reply" });
    await db
      .update(posts)
      .set({ pinnedCommentId: top!.id })
      .where(eq(posts.id, postId));
    await db.delete(posts).where(eq(posts.id, postId));
    const left = await db
      .select({ id: comments.id })
      .from(comments)
      .where(eq(comments.postId, postId));
    expect(left).toEqual([]);
  });

  it("stays when its author's account goes, without an author", async () => {
    const { postId, authorId } = await aPost();
    const [row] = await db
      .insert(comments)
      .values({ postId, authorId, body: "Hello" })
      .returning({ id: comments.id });
    await db.delete(users).where(eq(users.id, authorId));
    const [kept] = await db
      .select({ authorId: comments.authorId, body: comments.body })
      .from(comments)
      .where(eq(comments.id, row!.id));
    expect(kept).toEqual({ authorId: null, body: "Hello" });
  });
});
