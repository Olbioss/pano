import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PostStatus } from "@/shared/status";
import { resetDemo } from "../services/demo-reset";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import { setupWorkspace, submitPost } from "../test/fixtures";

const { db, close } = testDb();
beforeAll(() => resetDemo(db));
afterAll(() => close());

type TestApp = ReturnType<typeof testApp>;

async function moveTo(
  t: TestApp,
  cookie: string,
  postId: number,
  status: PostStatus,
  note?: string
) {
  const res = await t.client.api.posts[":id"].status.$patch(
    {
      param: { id: String(postId) },
      json: note ? { status, note } : { status },
    },
    { headers: { cookie } }
  );
  if (!res.ok) throw new Error(`status change failed: ${res.status}`);
}

async function readChangelog(t: TestApp, slug: string, page = 1) {
  const res = await t.client.api.workspaces[":slug"].changelog.$get({
    param: { slug },
    query: { page: String(page) },
  });
  const body = await res.json();
  if (!body.success) throw new Error(body.error);
  return body.data;
}

describe("GET /api/workspaces/:slug/changelog", () => {
  it("lists shipped requests newest first, with the latest shipping note", async () => {
    const t = testApp();
    const { owner, slug, boards } = await setupWorkspace(t);
    const post = (title: string) =>
      submitPost(t, owner.cookie, slug, { boardId: boards[0]!.id, title });
    const alpha = await post("Alpha");
    const bravo = await post("Bravo");
    const charlie = await post("Charlie");
    const delta = await post("Delta");
    const echo = await post("Echo");

    await moveTo(t, owner.cookie, alpha.id, "shipped", "Early");
    await moveTo(t, owner.cookie, bravo.id, "shipped");
    await moveTo(t, owner.cookie, charlie.id, "shipped", "Merged away");
    await t.client.api.posts[":id"].merge.$post(
      { param: { id: String(charlie.id) }, json: { intoId: alpha.id } },
      { headers: { cookie: owner.cookie } }
    );
    await moveTo(t, owner.cookie, delta.id, "planned");
    await moveTo(t, owner.cookie, echo.id, "shipped", "Fixed");
    // Back out and shipped again: the latest move counts.
    await moveTo(t, owner.cookie, alpha.id, "in_progress");
    await moveTo(t, owner.cookie, alpha.id, "shipped", "In 2.5");

    // Another workspace's shipped request stays on its own changelog.
    const other = await setupWorkspace(t);
    const elsewhere = await submitPost(t, other.owner.cookie, other.slug, {
      boardId: other.boards[0]!.id,
      title: "Elsewhere",
    });
    await moveTo(t, other.owner.cookie, elsewhere.id, "shipped");

    const changelog = await readChangelog(t, slug);
    expect(changelog.entries.map((e) => [e.title, e.note])).toEqual([
      ["Alpha", "In 2.5"],
      ["Echo", "Fixed"],
      ["Bravo", null],
    ]);
    expect(changelog.entries[0]).toMatchObject({
      id: alpha.id,
      ref: `${alpha.id}-alpha`,
      voteCount: 1,
    });
    expect(changelog).toMatchObject({ page: 1, hasMore: false });
    await t.settle();
  });

  it("pages twenty at a time", async () => {
    const t = testApp();
    const { owner, slug, boards } = await setupWorkspace(t);
    for (let i = 1; i <= 21; i++) {
      const shipped = await submitPost(t, owner.cookie, slug, {
        boardId: boards[0]!.id,
        title: `Shipped number ${i}`,
      });
      await moveTo(t, owner.cookie, shipped.id, "shipped");
    }
    const first = await readChangelog(t, slug);
    expect(first.entries).toHaveLength(20);
    expect(first.entries[0]!.title).toBe("Shipped number 21");
    expect(first.hasMore).toBe(true);
    const second = await readChangelog(t, slug, 2);
    expect(second.entries.map((e) => e.title)).toEqual(["Shipped number 1"]);
    expect(second.hasMore).toBe(false);
    await t.settle();
  });

  it("answers 404 for a workspace that doesn't exist", async () => {
    const t = testApp();
    const res = await t.client.api.workspaces[":slug"].changelog.$get({
      param: { slug: "no-such-workspace" },
      query: {},
    });
    expect(res.status).toBe(404);
    await t.settle();
  });

  it("shows the demo's shipped requests with the team's notes", async () => {
    const t = testApp();
    const changelog = await readChangelog(t, "demo");
    expect(changelog.entries).toHaveLength(5);
    expect(changelog.entries.map((e) => e.note)).toContain(
      "Shipped in 2.5! Press `?` anywhere to open it."
    );
    await t.settle();
  });
});
