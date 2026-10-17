import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { posts, votes } from "../db/schema";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import { setupWorkspace, submitPost, voteFor } from "../test/fixtures";

const { db, close } = testDb();
afterAll(() => close());

type TestApp = ReturnType<typeof testApp>;
type Query = Partial<
  Record<"board" | "sort" | "status" | "q" | "page" | "limit", string>
>;
type Item = { title: string; voted: boolean };
type Page = { data: { items: Item[]; page: number; hasMore: boolean } };

async function feed(
  t: TestApp,
  slug: string,
  query: Query = {},
  cookie?: string
) {
  const res = await t.client.api.workspaces[":slug"].posts.$get(
    // Raw strings on purpose: some tests send values the schema refuses.
    { param: { slug }, query: query as never },
    cookie ? { headers: { cookie } } : undefined
  );
  return { status: res.status, body: (await res.json()) as Page };
}

const titles = (body: Page) => body.data.items.map((item) => item.title);

/** Moves a post, and every vote on it, `days` into the past. */
async function age(postId: number, days: number) {
  const past = sql`now() - make_interval(days => ${days})`;
  await db.update(posts).set({ createdAt: past }).where(eq(posts.id, postId));
  await db
    .update(votes)
    .set({ createdAt: past })
    .where(eq(votes.postId, postId));
}

async function workspaceWith(
  t: TestApp,
  postTitles: string[],
  options?: Parameters<typeof setupWorkspace>[1]
) {
  const workspace = await setupWorkspace(t, options);
  const made: Awaited<ReturnType<typeof submitPost>>[] = [];
  for (const title of postTitles) {
    made.push(
      await submitPost(t, workspace.owner.cookie, workspace.slug, {
        boardId: workspace.boards[0]!.id,
        title,
      })
    );
  }
  return { ...workspace, posts: made };
}

describe("GET /api/workspaces/:slug/posts", () => {
  it("lists newest first with sort=new, and only this workspace's posts", async () => {
    const t = testApp();
    const { slug } = await workspaceWith(t, [
      "First idea",
      "Second idea",
      "Third idea",
    ]);
    await workspaceWith(t, ["Somewhere else"]);
    const { status, body } = await feed(t, slug, { sort: "new" });
    expect(status).toBe(200);
    expect(titles(body)).toEqual(["Third idea", "Second idea", "First idea"]);
    await t.settle();
  });

  it("orders by votes with sort=top", async () => {
    const t = testApp();
    const { slug, posts: made } = await workspaceWith(t, [
      "Few votes",
      "Many votes",
    ]);
    for (let i = 0; i < 2; i++) {
      await voteFor(t, (await t.signIn()).cookie, made[1]!.id);
    }
    expect(titles((await feed(t, slug, { sort: "top" })).body)).toEqual([
      "Many votes",
      "Few votes",
    ]);
    await t.settle();
  });

  it("ranks recent votes above old ones with sort=trending", async () => {
    const t = testApp();
    const { slug, posts: made } = await workspaceWith(t, [
      "Old but busy",
      "New but quiet",
    ]);
    const old = made[0]!;
    const recent = made[1]!;
    // The old post's own vote is 60 days old; three people vote for it today.
    await age(old.id, 60);
    for (let i = 0; i < 3; i++) {
      await voteFor(t, (await t.signIn()).cookie, old.id);
    }
    // The newer post has more votes, all of them 20 days old.
    for (let i = 0; i < 5; i++) {
      await voteFor(t, (await t.signIn()).cookie, recent.id);
    }
    await age(recent.id, 20);
    expect(titles((await feed(t, slug, { sort: "trending" })).body)).toEqual([
      "Old but busy",
      "New but quiet",
    ]);
    expect(titles((await feed(t, slug, { sort: "top" })).body)).toEqual([
      "New but quiet",
      "Old but busy",
    ]);
    await t.settle();
  });

  it("filters by board and by status", async () => {
    const t = testApp();
    const { owner, slug, boards } = await setupWorkspace(t, {
      boards: ["Features", "Bugs"],
    });
    await submitPost(t, owner.cookie, slug, {
      boardId: boards[0]!.id,
      title: "A feature",
    });
    const bug = await submitPost(t, owner.cookie, slug, {
      boardId: boards[1]!.id,
      title: "A bug",
    });
    await db
      .update(posts)
      .set({ status: "planned" })
      .where(eq(posts.id, bug.id));
    expect(titles((await feed(t, slug, { board: "bugs" })).body)).toEqual([
      "A bug",
    ]);
    expect(titles((await feed(t, slug, { status: "planned" })).body)).toEqual([
      "A bug",
    ]);
    expect(titles((await feed(t, slug, { status: "open" })).body)).toEqual([
      "A feature",
    ]);
    await t.settle();
  });

  it.each([
    ["en", "dark", "Dark mode"],
    ["tr", "coklu sube", "ÖZELLİK: Çoklu şube desteği"],
    ["tr", "İPTAL", "İptal edilen rezervasyonlar için bildirim"],
  ] as const)(
    "searches %s posts for %j",
    async (defaultLocale, q, expected) => {
      const t = testApp();
      const postTitles =
        defaultLocale === "en"
          ? ["Dark mode", "Export to CSV"]
          : [
              "ÖZELLİK: Çoklu şube desteği",
              "İptal edilen rezervasyonlar için bildirim",
              "Karanlık mod",
            ];
      const { slug } = await workspaceWith(t, postTitles, { defaultLocale });
      expect(titles((await feed(t, slug, { q })).body)).toEqual([expected]);
      await t.settle();
    }
  );

  it.each(["dark & | ! (", '"unclosed', "-", "the"])(
    "survives the search %j",
    async (q) => {
      const t = testApp();
      const { slug } = await workspaceWith(t, ["Dark mode"]);
      expect((await feed(t, slug, { q })).status).toBe(200);
      await t.settle();
    }
  );

  it("pages through results", async () => {
    const t = testApp();
    const { slug } = await workspaceWith(t, ["One", "Two", "Three"]);
    const first = await feed(t, slug, { sort: "new", limit: "2" });
    expect(first.body.data).toMatchObject({ page: 1, hasMore: true });
    expect(titles(first.body)).toEqual(["Three", "Two"]);
    const second = await feed(t, slug, { sort: "new", limit: "2", page: "2" });
    expect(second.body.data).toMatchObject({ page: 2, hasMore: false });
    expect(titles(second.body)).toEqual(["One"]);
    await t.settle();
  });

  it("marks the posts the viewer voted on", async () => {
    const t = testApp();
    const { slug, posts: made } = await workspaceWith(t, [
      "Not voted",
      "Voted",
    ]);
    const viewer = await t.signIn();
    await voteFor(t, viewer.cookie, made[1]!.id);
    const mine = await feed(t, slug, { sort: "new" }, viewer.cookie);
    expect(
      mine.body.data.items.map((item) => [item.title, item.voted])
    ).toEqual([
      ["Voted", true],
      ["Not voted", false],
    ]);
    const anonymous = await feed(t, slug, { sort: "new" });
    expect(anonymous.body.data.items.every((item) => !item.voted)).toBe(true);
    await t.settle();
  });

  it("leaves out merged posts", async () => {
    const t = testApp();
    const { slug, posts: made } = await workspaceWith(t, [
      "Duplicate",
      "Original",
    ]);
    await db
      .update(posts)
      .set({ mergedIntoId: made[1]!.id })
      .where(eq(posts.id, made[0]!.id));
    expect(titles((await feed(t, slug)).body)).toEqual(["Original"]);
    await t.settle();
  });

  it.each([{ page: "0" }, { limit: "51" }, { sort: "hot" }])(
    "refuses %j",
    async (query) => {
      const t = testApp();
      const { slug } = await workspaceWith(t, []);
      expect((await feed(t, slug, query)).status).toBe(400);
      await t.settle();
    }
  );

  it("returns an empty page for an unknown board", async () => {
    const t = testApp();
    const { slug } = await workspaceWith(t, ["Dark mode"]);
    const { status, body } = await feed(t, slug, { board: "no-such-board" });
    expect(status).toBe(200);
    expect(body.data).toEqual({ items: [], page: 1, hasMore: false });
    await t.settle();
  });

  it("answers 404 for an unknown workspace", async () => {
    const t = testApp();
    expect((await feed(t, "no-such-workspace")).status).toBe(404);
    await t.settle();
  });
});
