import { and, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  boards,
  comments,
  emailOutbox,
  posts,
  subscriptions,
} from "../db/schema";
import { DEMO_WORKSPACE_ID, resetDemo } from "../services/demo-reset";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import { setupWorkspace, submitPost } from "../test/fixtures";

const { db, close } = testDb();
beforeAll(() => resetDemo(db));
afterAll(() => close());

type TestApp = ReturnType<typeof testApp>;

/** A request in the demo with followers: "Dark mode". */
async function demoPost() {
  const [post] = await db
    .select({ id: posts.id, boardId: posts.boardId })
    .from(posts)
    .where(
      and(
        eq(posts.organizationId, DEMO_WORKSPACE_ID),
        eq(posts.title, "Dark mode")
      )
    );
  if (!post) throw new Error("the demo has no Dark mode post");
  return post;
}

const codeOf = async (res: { json(): Promise<unknown> }) =>
  ((await res.json()) as { code?: string }).code;

/** Votes, comments on and follows `postId` as `cookie`: the three statuses. */
async function joinIn(t: TestApp, cookie: string, postId: number) {
  const param = { id: String(postId) };
  const headers = { headers: { cookie } };
  return Promise.all([
    t.client.api.posts[":id"].vote.$put(
      { param, json: { voted: true } },
      headers
    ),
    t.client.api.posts[":id"].comments.$post(
      { param, json: { body: "Hello from a guest" } },
      headers
    ),
    t.client.api.posts[":id"].subscription.$put(
      { param, json: { subscribed: true } },
      headers
    ),
  ]);
}

describe("demo accounts", () => {
  it("can't post, vote, comment or follow outside the demo", async () => {
    const t = testApp();
    const { owner, slug, boards: made } = await setupWorkspace(t);
    const post = await submitPost(t, owner.cookie, slug, {
      boardId: made[0]!.id,
      title: "A real request",
    });
    const guest = await t.signInDemo("member");

    const posted = await t.client.api.workspaces[":slug"].posts.$post(
      {
        param: { slug },
        json: { boardId: made[0]!.id, title: "Spam", body: "" },
      },
      { headers: { cookie: guest.cookie } }
    );
    expect(posted.status).toBe(403);
    expect(await codeOf(posted)).toBe("DEMO_ONLY");
    for (const res of await joinIn(t, guest.cookie, post.id)) {
      expect(res.status).toBe(403);
      expect(await codeOf(res)).toBe("DEMO_ONLY");
    }
    await t.settle();
  });

  it("post, vote, comment and follow in the demo", async () => {
    const t = testApp();
    const guest = await t.signInDemo("member");
    const { id, boardId } = await demoPost();
    const posted = await t.client.api.workspaces[":slug"].posts.$post(
      {
        param: { slug: "demo" },
        json: { boardId, title: "A guest's idea", body: "" },
      },
      { headers: { cookie: guest.cookie } }
    );
    expect(posted.status).toBe(201);
    const statuses = (await joinIn(t, guest.cookie, id)).map((r) => r.status);
    expect(statuses).toEqual([200, 201, 200]);
    await t.settle();
  });

  it("can't create a workspace", async () => {
    const t = testApp();
    const guest = await t.signInDemo("team");
    const res = await t.client.api.workspaces.$post(
      { json: { name: "Mine", slug: "guest-space", defaultLocale: "en" } },
      { headers: { cookie: guest.cookie } }
    );
    expect(res.status).toBe(403);
    expect(await codeOf(res)).toBe("DEMO_ONLY");
    await t.settle();
  });
});

describe("the demo workspace", () => {
  it("keeps its name, language and boards, even for its team", async () => {
    const t = testApp();
    const guest = await t.signInDemo("team");
    const headers = { headers: { cookie: guest.cookie } };
    const param = { slug: "demo" };
    const [board] = await db
      .select({ id: boards.id })
      .from(boards)
      .where(eq(boards.organizationId, DEMO_WORKSPACE_ID))
      .limit(1);
    const attempts = await Promise.all([
      t.client.api.workspaces[":slug"].$patch(
        { param, json: { name: "Renamed" } },
        headers
      ),
      t.client.api.workspaces[":slug"].boards.$post(
        { param, json: { name: "Extra" } },
        headers
      ),
      t.client.api.workspaces[":slug"].boards[":boardId"].$delete(
        { param: { ...param, boardId: board!.id } },
        headers
      ),
      t.client.api.workspaces[":slug"].boards.order.$put(
        { param, json: { ids: [board!.id] } },
        headers
      ),
    ]);
    for (const res of attempts) {
      expect(res.status).toBe(403);
      expect(await codeOf(res)).toBe("DEMO_READ_ONLY");
    }
    await t.settle();
  });

  it("sends no Shipped email when its team ships a request", async () => {
    const t = testApp();
    const guest = await t.signInDemo("team");
    const { id } = await demoPost();
    const [followers] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(subscriptions)
      .where(eq(subscriptions.postId, id));
    expect(followers?.n).toBeGreaterThan(0);

    const res = await t.client.api.posts[":id"].status.$patch(
      { param: { id: String(id) }, json: { status: "shipped" } },
      { headers: { cookie: guest.cookie } }
    );
    await t.settle();

    expect(res.status).toBe(200);
    const queued = await db
      .select({ id: emailOutbox.id })
      .from(emailOutbox)
      .where(eq(emailOutbox.postId, id));
    expect(queued).toEqual([]);
  });

  it("leaves other people's requests and comments to their authors, even for its team", async () => {
    await resetDemo(db);
    const t = testApp();
    const team = await t.signInDemo("team");
    const headers = { headers: { cookie: team.cookie } };
    const { id } = await demoPost();
    const param = { id: String(id) };
    const [comment] = await db
      .select({ id: comments.id })
      .from(comments)
      .where(and(eq(comments.postId, id), isNull(comments.deletedAt)))
      .limit(1);

    const attempts = [
      await t.client.api.posts[":id"].$patch(
        { param, json: { title: "Rewritten by a visitor" } },
        headers
      ),
      await t.client.api.comments[":id"].$delete(
        { param: { id: String(comment!.id) } },
        headers
      ),
      await t.client.api.posts[":id"].$delete({ param }, headers),
    ];
    for (const res of attempts) {
      expect(res.status).toBe(403);
      expect(await codeOf(res)).toBe("DEMO_READ_ONLY");
    }
    // And the pages don't offer what the API refuses.
    const post = await (
      await t.client.api.posts[":id"].$get({ param }, headers)
    ).json();
    if (!post.success) throw new Error(post.error);
    expect(post.data.canEdit).toBe(false);
    expect(post.data.pinned?.canDelete).toBe(false);
    const thread = await (
      await t.client.api.posts[":id"].comments.$get(
        { param, query: {} },
        headers
      )
    ).json();
    if (!thread.success) throw new Error(thread.error);
    expect(thread.data.items.some((item) => item.canDelete)).toBe(false);
    await t.settle();
  });

  it("still lets its team move and merge requests, and anyone change what they wrote", async () => {
    await resetDemo(db);
    const t = testApp();
    const team = await t.signInDemo("team");
    const headers = { headers: { cookie: team.cookie } };
    const { boardId } = await demoPost();
    const own = await (
      await t.client.api.workspaces[":slug"].posts.$post(
        {
          param: { slug: "demo" },
          json: { boardId, title: "A team guest's idea", body: "" },
        },
        headers
      )
    ).json();
    if (!own.success) throw new Error(own.error);
    const param = { id: String(own.data.id) };
    expect(own.data.canEdit).toBe(true);

    const renamed = await t.client.api.posts[":id"].$patch(
      { param, json: { title: "A team guest's better idea" } },
      headers
    );
    expect(renamed.status).toBe(200);
    const comment = await (
      await t.client.api.posts[":id"].comments.$post(
        { param, json: { body: "Second thoughts" } },
        headers
      )
    ).json();
    if (!comment.success) throw new Error(comment.error);
    const uncommented = await t.client.api.comments[":id"].$delete(
      { param: { id: String(comment.data.comment.id) } },
      headers
    );
    expect(uncommented.status).toBe(200);

    const [duplicate] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(
          eq(posts.organizationId, DEMO_WORKSPACE_ID),
          eq(posts.title, "Night theme for late writing sessions")
        )
      );
    const { id: original } = await demoPost();
    const merged = await t.client.api.posts[":id"].merge.$post(
      { param: { id: String(duplicate!.id) }, json: { intoId: original } },
      headers
    );
    expect(merged.status).toBe(200);

    const removed = await t.client.api.posts[":id"].$delete({ param }, headers);
    expect(removed.status).toBe(200);
    await t.settle();
  });
});
