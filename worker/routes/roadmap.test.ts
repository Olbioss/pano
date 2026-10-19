import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { PostStatus } from "@/shared/status";
import { posts } from "../db/schema";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import { setupWorkspace, submitPost, voteFor } from "../test/fixtures";

const { db, close } = testDb();
afterAll(() => close());

type TestApp = ReturnType<typeof testApp>;

async function readRoadmap(t: TestApp, slug: string, cookie?: string) {
  const res = await t.client.api.workspaces[":slug"].roadmap.$get(
    { param: { slug } },
    cookie ? { headers: { cookie } } : undefined
  );
  if (!res.ok) throw new Error(`roadmap failed: ${res.status}`);
  return (await res.json()).data;
}

/** Posts with these titles, moved to `status` by the workspace's owner. */
async function postsIn(
  t: TestApp,
  workspace: Awaited<ReturnType<typeof setupWorkspace>>,
  status: PostStatus,
  titles: string[]
) {
  const made = [];
  for (const title of titles) {
    const post = await submitPost(t, workspace.owner.cookie, workspace.slug, {
      boardId: workspace.boards[0]!.id,
      title,
    });
    if (status !== "open") {
      await t.client.api.posts[":id"].status.$patch(
        { param: { id: String(post.id) }, json: { status } },
        { headers: { cookie: workspace.owner.cookie } }
      );
    }
    made.push(post);
  }
  return made;
}

const titles = (list: { title: string }[]) => list.map((post) => post.title);

describe("GET /api/workspaces/:slug/roadmap", () => {
  it("shows planned and in-progress posts, most voted first", async () => {
    const t = testApp();
    const workspace = await setupWorkspace(t);
    const [, high] = await postsIn(t, workspace, "planned", [
      "Export to CSV",
      "Dark mode",
    ]);
    await postsIn(t, workspace, "in_progress", ["Faster search"]);
    const fan = await t.signIn();
    await voteFor(t, fan.cookie, high!.id);
    const roadmap = await readRoadmap(t, workspace.slug);
    expect(titles(roadmap.planned)).toEqual(["Dark mode", "Export to CSV"]);
    expect(titles(roadmap.in_progress)).toEqual(["Faster search"]);
    expect(roadmap.shipped).toEqual([]);
    await t.settle();
  });

  it("shows what shipped in the last 30 days, latest first", async () => {
    const t = testApp();
    const workspace = await setupWorkspace(t);
    const [old] = await postsIn(t, workspace, "shipped", [
      "Old news",
      "Earlier",
      "Latest",
    ]);
    await db
      .update(posts)
      .set({ statusChangedAt: sql`now() - interval '31 days'` })
      .where(eq(posts.id, old!.id));
    const roadmap = await readRoadmap(t, workspace.slug);
    expect(titles(roadmap.shipped)).toEqual(["Latest", "Earlier"]);
    await t.settle();
  });

  it("leaves out open, under-review, closed and merged posts", async () => {
    const t = testApp();
    const workspace = await setupWorkspace(t);
    await postsIn(t, workspace, "open", ["Open one"]);
    await postsIn(t, workspace, "under_review", ["Reviewing"]);
    await postsIn(t, workspace, "closed", ["Closed one"]);
    const [duplicate, original] = await postsIn(t, workspace, "planned", [
      "Dark theme",
      "Dark mode",
    ]);
    await t.client.api.posts[":id"].merge.$post(
      { param: { id: String(duplicate!.id) }, json: { intoId: original!.id } },
      { headers: { cookie: workspace.owner.cookie } }
    );
    const roadmap = await readRoadmap(t, workspace.slug);
    expect(titles(roadmap.planned)).toEqual(["Dark mode"]);
    expect([...roadmap.in_progress, ...roadmap.shipped]).toEqual([]);
    await t.settle();
  });

  it("shows each reader their own votes", async () => {
    const t = testApp();
    const workspace = await setupWorkspace(t);
    const [post] = await postsIn(t, workspace, "planned", ["Dark mode"]);
    const fan = await t.signIn();
    await voteFor(t, fan.cookie, post!.id);
    const asFan = await readRoadmap(t, workspace.slug, fan.cookie);
    expect(asFan.planned[0]).toMatchObject({ voted: true, voteCount: 2 });
    const signedOut = await readRoadmap(t, workspace.slug);
    expect(signedOut.planned[0]).toMatchObject({ voted: false });
    await t.settle();
  });

  it("answers 404 for an unknown workspace", async () => {
    const t = testApp();
    const res = await t.client.api.workspaces[":slug"].roadmap.$get({
      param: { slug: "no-such-place" },
    });
    expect(res.status).toBe(404);
    await t.settle();
  });
});
