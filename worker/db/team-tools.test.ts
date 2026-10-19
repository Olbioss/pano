import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import { setupWorkspace, submitPost } from "../test/fixtures";
import { pgErrorCode } from "./errors";
import {
  emailOutbox,
  posts,
  statusChanges,
  subscriptions,
  user as users,
} from "./schema";

const { db, close } = testDb();
afterAll(() => close());

const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";

const payload = {
  title: "Dark mode",
  ref: "1-dark-mode",
  workspaceName: "Acme",
  locale: "en" as const,
  note: null,
};

/** A post made through the API, and its author's id. */
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
  return { postId: post.id, userId: author.id };
}

describe("the team tools tables", () => {
  it("refuses a status change to an unknown status", async () => {
    const { postId } = await aPost();
    // Raw SQL: the types already refuse "done", the table must too.
    const err = await db
      .execute(
        sql`insert into status_changes (post_id, from_status, to_status) values (${postId}, 'open', 'done')`
      )
      .catch((error: unknown) => error);
    expect(pgErrorCode(err)).toBe(CHECK_VIOLATION);
  });

  it("keeps one email per person, post and kind", async () => {
    const { postId, userId } = await aPost();
    const email = { userId, postId, kind: "shipped" as const, payload };
    await db.insert(emailOutbox).values(email);
    const err = await db
      .insert(emailOutbox)
      .values(email)
      .catch((error: unknown) => error);
    expect(pgErrorCode(err)).toBe(UNIQUE_VIOLATION);
  });

  it("goes with its post: subscriptions, timeline and emails", async () => {
    const { postId, userId } = await aPost();
    // Posting may already have subscribed the author.
    await db
      .insert(subscriptions)
      .values({ postId, userId })
      .onConflictDoNothing();
    await db.insert(statusChanges).values({
      postId,
      fromStatus: "open",
      toStatus: "planned",
      changedBy: userId,
    });
    await db
      .insert(emailOutbox)
      .values({ userId, postId, kind: "shipped", payload });
    await db.delete(posts).where(eq(posts.id, postId));
    const left = await Promise.all([
      db.select().from(subscriptions).where(eq(subscriptions.postId, postId)),
      db.select().from(statusChanges).where(eq(statusChanges.postId, postId)),
      db.select().from(emailOutbox).where(eq(emailOutbox.postId, postId)),
    ]);
    expect(left).toEqual([[], [], []]);
  });

  it("drops an account's subscriptions and emails, and keeps its timeline entries nameless", async () => {
    const { postId, userId } = await aPost();
    // Posting may already have subscribed the author.
    await db
      .insert(subscriptions)
      .values({ postId, userId })
      .onConflictDoNothing();
    await db
      .insert(emailOutbox)
      .values({ userId, postId, kind: "shipped", payload });
    const [entry] = await db
      .insert(statusChanges)
      .values({
        postId,
        fromStatus: "open",
        toStatus: "planned",
        changedBy: userId,
      })
      .returning({ id: statusChanges.id });
    await db.delete(users).where(eq(users.id, userId));
    expect(
      await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.postId, postId))
    ).toEqual([]);
    expect(
      await db.select().from(emailOutbox).where(eq(emailOutbox.postId, postId))
    ).toEqual([]);
    const [kept] = await db
      .select({ changedBy: statusChanges.changedBy })
      .from(statusChanges)
      .where(eq(statusChanges.id, entry!.id));
    expect(kept).toEqual({ changedBy: null });
  });
});
