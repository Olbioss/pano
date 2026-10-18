import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { posts } from "../db/schema";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import { setupWorkspace, submitPost } from "../test/fixtures";

const { db, close } = testDb();
afterAll(() => close());

type TestApp = ReturnType<typeof testApp>;

const create = (
  t: TestApp,
  cookie: string | undefined,
  slug: string,
  json: { boardId: string; title: string; body: string }
) =>
  t.client.api.workspaces[":slug"].posts.$post(
    { param: { slug }, json },
    cookie ? { headers: { cookie } } : undefined
  );

const getPost = (t: TestApp, id: number, cookie?: string) =>
  t.client.api.posts[":id"].$get(
    { param: { id: String(id) } },
    cookie ? { headers: { cookie } } : undefined
  );

describe("POST /api/workspaces/:slug/posts", () => {
  it("creates a post its author has already voted for", async () => {
    const t = testApp();
    const { slug, boards } = await setupWorkspace(t);
    const member = await t.signIn();
    const res = await create(t, member.cookie, slug, {
      boardId: boards[0]!.id,
      title: "Dark mode",
      body: "Please add a **dark** theme.",
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      success: true,
      data: {
        ref: expect.stringMatching(/^\d+-dark-mode$/),
        title: "Dark mode",
        body: "Please add a **dark** theme.",
        excerpt: "Please add a dark theme.",
        status: "open",
        voteCount: 1,
        voted: true,
        canEdit: true,
        author: { name: "" },
        board: { slug: "features", name: "Features" },
        workspace: { slug, defaultLocale: "en" },
      },
    });
    await t.settle();
  });

  it("searches it in the workspace's language", async () => {
    const t = testApp();
    const { owner, slug, boards } = await setupWorkspace(t, {
      defaultLocale: "tr",
      boards: ["İstekler"],
    });
    const post = await submitPost(t, owner.cookie, slug, {
      boardId: boards[0]!.id,
      title: "Karanlık mod",
    });
    const [row] = await db
      .select({ searchConfig: posts.searchConfig })
      .from(posts)
      .where(eq(posts.id, post.id));
    expect(row?.searchConfig).toBe("turkish");
    await t.settle();
  });

  it("needs a signed-in user", async () => {
    const t = testApp();
    const { slug, boards } = await setupWorkspace(t);
    const res = await create(t, undefined, slug, {
      boardId: boards[0]!.id,
      title: "Dark mode",
      body: "",
    });
    expect(res.status).toBe(401);
    await t.settle();
  });

  it("refuses a board from another workspace", async () => {
    const t = testApp();
    const here = await setupWorkspace(t);
    const there = await setupWorkspace(t);
    const res = await create(t, here.owner.cookie, here.slug, {
      boardId: there.boards[0]!.id,
      title: "Dark mode",
      body: "",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "BAD_REQUEST",
      fields: { boardId: "BOARD_UNKNOWN" },
    });
    await t.settle();
  });

  it("refuses a title shorter than three characters", async () => {
    const t = testApp();
    const { owner, slug, boards } = await setupWorkspace(t);
    const res = await create(t, owner.cookie, slug, {
      boardId: boards[0]!.id,
      title: "ab",
      body: "",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      fields: { title: expect.any(String) },
    });
    await t.settle();
  });

  it("answers 404 for an unknown workspace", async () => {
    const t = testApp();
    const { owner, boards } = await setupWorkspace(t);
    const res = await create(t, owner.cookie, "no-such-workspace", {
      boardId: boards[0]!.id,
      title: "Dark mode",
      body: "",
    });
    expect(res.status).toBe(404);
    await t.settle();
  });

  it("allows five posts an hour per person in production", async () => {
    // Sign in through a dev app: production also limits code requests per IP.
    const dev = testApp();
    const { slug, boards } = await setupWorkspace(dev);
    const member = await dev.signIn();
    const prod = testApp({ ENVIRONMENT: "production" });
    const statuses: number[] = [];
    for (let i = 1; i <= 6; i++) {
      const res = await create(prod, member.cookie, slug, {
        boardId: boards[0]!.id,
        title: `Idea number ${i}`,
        body: "",
      });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
    await dev.settle();
    await prod.settle();
  });
});

describe("GET /api/posts/:id", () => {
  it("shows a post to anyone, without edit rights", async () => {
    const t = testApp();
    const { owner, slug, boards } = await setupWorkspace(t);
    const post = await submitPost(t, owner.cookie, slug, {
      boardId: boards[0]!.id,
      title: "Dark mode",
    });
    const res = await getPost(t, post.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: { id: post.id, voteCount: 1, voted: false, canEdit: false },
    });
    await t.settle();
  });

  it("answers 400 for an id that isn't a number", async () => {
    const t = testApp();
    const res = await t.request("/api/posts/abc");
    expect(res.status).toBe(400);
    await t.settle();
  });

  it("answers 404 for a post that doesn't exist", async () => {
    const t = testApp();
    const res = await getPost(t, 999_999_999);
    expect(res.status).toBe(404);
    await t.settle();
  });

  it("shows the author's name once they pick one", async () => {
    const t = testApp();
    const { slug, boards } = await setupWorkspace(t);
    const member = await t.signIn();
    await t.client.api.me.$patch(
      { json: { name: "Ayşe" } },
      { headers: { cookie: member.cookie } }
    );
    const post = await submitPost(t, member.cookie, slug, {
      boardId: boards[0]!.id,
      title: "Dark mode",
    });
    expect(post.author).toEqual({ name: "Ayşe" });
    await t.settle();
  });
});

describe("PATCH and DELETE /api/posts/:id", () => {
  async function postByMember(t: TestApp) {
    const workspace = await setupWorkspace(t);
    const author = await t.signIn();
    const post = await submitPost(t, author.cookie, workspace.slug, {
      boardId: workspace.boards[0]!.id,
      title: "Dark mode",
    });
    return { ...workspace, author, post };
  }

  const edit = (
    t: TestApp,
    cookie: string,
    id: number,
    json: { title?: string; body?: string }
  ) =>
    t.client.api.posts[":id"].$patch(
      { param: { id: String(id) }, json },
      { headers: { cookie } }
    );

  const remove = (t: TestApp, cookie: string, id: number) =>
    t.client.api.posts[":id"].$delete(
      { param: { id: String(id) } },
      { headers: { cookie } }
    );

  it("lets the author edit their post, and its address follows the title", async () => {
    const t = testApp();
    const { author, post } = await postByMember(t);
    const res = await edit(t, author.cookie, post.id, {
      title: "Dark mode everywhere",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: {
        title: "Dark mode everywhere",
        ref: `${post.id}-dark-mode-everywhere`,
      },
    });
    await t.settle();
  });

  it("lets the workspace team edit anyone's post", async () => {
    const t = testApp();
    const { owner, post } = await postByMember(t);
    const res = await edit(t, owner.cookie, post.id, { body: "Details." });
    expect(res.status).toBe(200);
    await t.settle();
  });

  it("refuses an edit from anyone else", async () => {
    const t = testApp();
    const { post } = await postByMember(t);
    const stranger = await t.signIn();
    const res = await edit(t, stranger.cookie, post.id, { title: "Hijacked" });
    expect(res.status).toBe(403);
    await t.settle();
  });

  it("refuses an edit or a delete from another workspace's team", async () => {
    const t = testApp();
    const { post } = await postByMember(t);
    const { owner: outsider } = await setupWorkspace(t);
    const edited = await edit(t, outsider.cookie, post.id, {
      title: "Hijacked",
    });
    expect(edited.status).toBe(403);
    expect((await remove(t, outsider.cookie, post.id)).status).toBe(403);
    expect((await getPost(t, post.id)).status).toBe(200);
    await t.settle();
  });

  it("lets the author delete their post", async () => {
    const t = testApp();
    const { author, post } = await postByMember(t);
    const res = await remove(t, author.cookie, post.id);
    expect(res.status).toBe(200);
    expect((await getPost(t, post.id)).status).toBe(404);
    await t.settle();
  });

  it("refuses a delete from anyone else", async () => {
    const t = testApp();
    const { post } = await postByMember(t);
    const stranger = await t.signIn();
    const res = await remove(t, stranger.cookie, post.id);
    expect(res.status).toBe(403);
    await t.settle();
  });
});
