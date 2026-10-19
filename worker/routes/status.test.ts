import { count, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { PostStatus } from "@/shared/status";
import { emailOutbox, posts, statusChanges, user as users } from "../db/schema";
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

/** A workspace, and a post by a member who isn't on its team. */
async function postByMember(t: TestApp, defaultLocale: "en" | "tr" = "en") {
  const workspace = await setupWorkspace(t, { defaultLocale });
  const author = await t.signIn();
  const post = await submitPost(t, author.cookie, workspace.slug, {
    boardId: workspace.boards[0]!.id,
    title: "Dark mode",
  });
  return { ...workspace, author, post };
}

const setStatus = (
  t: TestApp,
  cookie: string | undefined,
  postId: number,
  json: { status: PostStatus; note?: string }
) =>
  t.client.api.posts[":id"].status.$patch(
    { param: { id: String(postId) }, json },
    cookie ? { headers: { cookie } } : undefined
  );

async function idOf(email: string) {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  if (!row) throw new Error(`no user ${email}`);
  return row.id;
}

/** Who has a Shipped email queued for the post. */
async function emailedIds(postId: number) {
  const rows = await db
    .select({ userId: emailOutbox.userId })
    .from(emailOutbox)
    .where(eq(emailOutbox.postId, postId));
  return rows.map((row) => row.userId).sort();
}

describe("PATCH /api/posts/:id/status", () => {
  it("lets the team move a post, with its note on the timeline", async () => {
    const t = testApp();
    const { owner, post } = await postByMember(t);
    const res = await setStatus(t, owner.cookie, post.id, {
      status: "planned",
      note: "  Next month.  ",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      data: {
        status: "planned",
        timeline: [
          {
            from: "open",
            to: "planned",
            note: "Next month.",
            by: { name: "" },
            createdAt: expect.any(String),
          },
        ],
      },
    });
    await t.settle();
  });

  it("keeps every change on the timeline, oldest first", async () => {
    const t = testApp();
    const { owner, post } = await postByMember(t);
    for (const status of ["planned", "in_progress", "shipped"] as const) {
      await setStatus(t, owner.cookie, post.id, { status });
    }
    const res = await setStatus(t, owner.cookie, post.id, { status: "closed" });
    const body = await res.json();
    if (!body.success) throw new Error(body.error);
    expect(body.data.timeline.map((entry) => [entry.from, entry.to])).toEqual([
      ["open", "planned"],
      ["planned", "in_progress"],
      ["in_progress", "shipped"],
      ["shipped", "closed"],
    ]);
    expect(body.data.timeline.every((entry) => entry.note === null)).toBe(true);
    await t.settle();
  });

  it("changes nothing when the status is the same", async () => {
    const t = testApp();
    const { owner, post } = await postByMember(t);
    const res = await setStatus(t, owner.cookie, post.id, {
      status: "open",
      note: "Still open.",
    });
    expect(await res.json()).toMatchObject({
      data: { status: "open", timeline: [] },
    });
    const [row] = await db
      .select({ changedAt: posts.statusChangedAt })
      .from(posts)
      .where(eq(posts.id, post.id));
    expect(row?.changedAt).toBeNull();
    await t.settle();
  });

  it("is only for the post's own team", async () => {
    const t = testApp();
    const { author, post } = await postByMember(t);
    const { owner: outsider } = await setupWorkspace(t);
    const shipped = { status: "shipped" } as const;
    expect((await setStatus(t, author.cookie, post.id, shipped)).status).toBe(
      403
    );
    expect((await setStatus(t, outsider.cookie, post.id, shipped)).status).toBe(
      403
    );
    expect((await setStatus(t, undefined, post.id, shipped)).status).toBe(401);
    expect(await emailedIds(post.id)).toEqual([]);
    await t.settle();
  });

  it("refuses a merged post, and answers 404 for one that's gone", async () => {
    const t = testApp();
    const { owner, slug, boards, post } = await postByMember(t);
    const target = await submitPost(t, owner.cookie, slug, {
      boardId: boards[0]!.id,
      title: "Dark theme",
    });
    await db
      .update(posts)
      .set({ mergedIntoId: target.id })
      .where(eq(posts.id, post.id));
    const merged = await setStatus(t, owner.cookie, post.id, {
      status: "planned",
    });
    expect(merged.status).toBe(409);
    expect(await merged.json()).toMatchObject({ code: "POST_MERGED" });
    const gone = await setStatus(t, owner.cookie, 999_999_999, {
      status: "planned",
    });
    expect(gone.status).toBe(404);
    await t.settle();
  });

  it("refuses an unknown status or a note with a NUL character", async () => {
    const t = testApp();
    const { owner, post } = await postByMember(t);
    const unknown = await t.request(`/api/posts/${post.id}/status`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: owner.cookie,
        origin: "http://localhost",
      },
      body: JSON.stringify({ status: "done" }),
    });
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toMatchObject({
      fields: { status: expect.any(String) },
    });
    const nul = await setStatus(t, owner.cookie, post.id, {
      status: "planned",
      note: "a\u0000b",
    });
    expect(nul.status).toBe(400);
    expect(await nul.json()).toMatchObject({
      fields: { note: expect.any(String) },
    });
    await t.settle();
  });
});

describe("Shipped emails", () => {
  it("queues one per subscriber, and none for whoever shipped it", async () => {
    const t = testApp();
    const { owner, author, post } = await postByMember(t);
    const voter = await t.signIn();
    const commenter = await t.signIn();
    await voteFor(t, voter.cookie, post.id);
    await commentOn(t, commenter.cookie, post.id, "Yes please.");
    // The owner follows it too, by voting, but ships it themselves.
    await voteFor(t, owner.cookie, post.id);
    await setStatus(t, owner.cookie, post.id, {
      status: "shipped",
      note: "In today's release.",
    });
    const expected = await Promise.all(
      [author, voter, commenter].map((person) => idOf(person.email))
    );
    expect(await emailedIds(post.id)).toEqual(expected.sort());
    const [email] = await db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.postId, post.id))
      .limit(1);
    expect(email).toMatchObject({
      kind: "shipped",
      sentAt: null,
      attempts: 0,
      payload: {
        title: "Dark mode",
        ref: `${post.id}-dark-mode`,
        workspaceName: "Acme",
        locale: "en",
        note: "In today's release.",
      },
    });
    await t.settle();
  });

  it("writes a Turkish workspace's emails in Turkish", async () => {
    const t = testApp();
    const { owner, post } = await postByMember(t, "tr");
    await setStatus(t, owner.cookie, post.id, { status: "shipped" });
    const [email] = await db
      .select({ payload: emailOutbox.payload })
      .from(emailOutbox)
      .where(eq(emailOutbox.postId, post.id));
    expect(email?.payload.locale).toBe("tr");
    await t.settle();
  });

  it("takes back the unsent ones when the post leaves Shipped", async () => {
    const t = testApp();
    const { owner, post } = await postByMember(t);
    await setStatus(t, owner.cookie, post.id, { status: "shipped" });
    expect(await emailedIds(post.id)).toHaveLength(1);
    await setStatus(t, owner.cookie, post.id, { status: "in_progress" });
    expect(await emailedIds(post.id)).toEqual([]);
    await t.settle();
  });

  it("never emails the same person twice about one post shipping", async () => {
    const t = testApp();
    const { owner, author, post } = await postByMember(t);
    await setStatus(t, owner.cookie, post.id, { status: "shipped" });
    // The cron sent them.
    await db
      .update(emailOutbox)
      .set({ sentAt: new Date() })
      .where(eq(emailOutbox.postId, post.id));
    await setStatus(t, owner.cookie, post.id, { status: "in_progress" });
    await setStatus(t, owner.cookie, post.id, { status: "shipped" });
    expect(await emailedIds(post.id)).toEqual([await idOf(author.email)]);
    await t.settle();
  });

  it("ships once when five moves to Shipped arrive at once", async () => {
    const t = testApp();
    const { owner, post } = await postByMember(t);
    const voters = await Promise.all([t.signIn(), t.signIn()]);
    for (const voter of voters) await voteFor(t, voter.cookie, post.id);
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        setStatus(t, owner.cookie, post.id, { status: "shipped" })
      )
    );
    expect(responses.map((res) => res.status)).toEqual(Array(5).fill(200));
    const [changes] = await db
      .select({ n: count() })
      .from(statusChanges)
      .where(eq(statusChanges.postId, post.id));
    expect(changes?.n).toBe(1);
    expect(await emailedIds(post.id)).toHaveLength(3);
    await t.settle();
  }, 30_000);
});
