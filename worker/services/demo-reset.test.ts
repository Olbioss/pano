import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { DEMO_WORKSPACE_SLUG } from "@/shared/demo";
import {
  member,
  organization,
  posts,
  user as users,
  workspaceSettings,
} from "../db/schema";
import { DEMO_POSTS } from "../demo/content";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import { setupWorkspace, submitPost } from "../test/fixtures";
import { DEMO_WORKSPACE_ID, resetDemo } from "./demo-reset";

const { db, close } = testDb();
afterAll(() => close());

const demoPostCount = () =>
  db
    .select({ n: sql<number>`count(*)::int` })
    .from(posts)
    .where(eq(posts.organizationId, DEMO_WORKSPACE_ID))
    .then(([row]) => row?.n);

describe("resetDemo", () => {
  it("builds the demo workspace: its boards, requests and a roadmap in motion", async () => {
    const summary = await resetDemo(db);
    expect(summary.posts).toBe(DEMO_POSTS.length);
    const t = testApp();
    const { data: workspace } = await (
      await t.client.api.workspaces[":slug"].$get({
        param: { slug: DEMO_WORKSPACE_SLUG },
      })
    ).json();
    expect(workspace.name).toBe("Inkwell");
    expect(workspace.isDemo).toBe(true);
    expect(workspace.boards.map((board) => board.slug)).toEqual([
      "features",
      "bugs",
      "integrations",
    ]);
    const { data: roadmap } = await (
      await t.client.api.workspaces[":slug"].roadmap.$get({
        param: { slug: DEMO_WORKSPACE_SLUG },
      })
    ).json();
    expect(roadmap.planned).toHaveLength(4);
    expect(roadmap.in_progress).toHaveLength(4);
    // Shipped shows the last 30 days, so it needs status_changed_at.
    expect(roadmap.shipped.map((post) => post.title)).toEqual([
      "Keyboard shortcut cheat sheet",
      "Search misses words with Turkish characters",
      "Daily notes template",
      "Import from Notion",
      "Focus mode that hides everything but the text",
    ]);
    await t.settle();
  });

  it("keeps every counter equal to its rows", async () => {
    await resetDemo(db);
    const drift = await db.execute<{ id: number }>(sql`
      select p.id from posts p
      where p.organization_id = ${DEMO_WORKSPACE_ID}
        and (p.vote_count <> (select count(*) from votes v where v.post_id = p.id)
          or p.comment_count <> (select count(*) from comments c where c.post_id = p.id and c.deleted_at is null))
      union all
      select c.id from comments c join posts p on p.id = c.post_id
      where p.organization_id = ${DEMO_WORKSPACE_ID}
        and c.reply_count <> (select count(*) from comments r where r.parent_id = c.id)`);
    expect(drift).toEqual([]);
    const [top] = await db
      .select({ title: posts.title, votes: posts.voteCount })
      .from(posts)
      .where(eq(posts.organizationId, DEMO_WORKSPACE_ID))
      .orderBy(sql`${posts.voteCount} desc`)
      .limit(1);
    expect(top).toEqual({ title: "Dark mode", votes: 31 });
  });

  it("puts back what visitors changed", async () => {
    await resetDemo(db);
    await db.delete(posts).where(eq(posts.organizationId, DEMO_WORKSPACE_ID));
    await db
      .update(organization)
      .set({ name: "Vandalized" })
      .where(eq(organization.id, DEMO_WORKSPACE_ID));

    await resetDemo(db);

    expect(await demoPostCount()).toBe(DEMO_POSTS.length);
    const [workspace] = await db
      .select({ name: organization.name, isDemo: workspaceSettings.isDemo })
      .from(organization)
      .innerJoin(
        workspaceSettings,
        eq(workspaceSettings.organizationId, organization.id)
      )
      .where(eq(organization.id, DEMO_WORKSPACE_ID));
    expect(workspace).toEqual({ name: "Inkwell", isDemo: true });
  });

  it("deletes guests from before the last reset, and keeps newer ones one more night", async () => {
    await resetDemo(db);
    const guest = async (createdAt: Date) => {
      const id = crypto.randomUUID();
      await db.insert(users).values({
        id,
        name: "Guest 1234",
        email: `guest-${id}@demo.pano.invalid`,
        emailVerified: true,
        createdAt,
      });
      await db.insert(member).values({
        id: crypto.randomUUID(),
        organizationId: DEMO_WORKSPACE_ID,
        userId: id,
        role: "member",
        createdAt,
      });
      return id;
    };
    const old = await guest(new Date(Date.now() - 2 * 86_400_000));
    const recent = await guest(new Date());

    await resetDemo(db);

    const left = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, [old, recent]));
    expect(left).toEqual([{ id: recent }]);
    // Still signed in, but off the rebuilt workspace's team.
    const teams = await db
      .select({ id: member.id })
      .from(member)
      .where(eq(member.userId, recent));
    expect(teams).toEqual([]);
  });

  it("leaves other workspaces and their people alone", async () => {
    const t = testApp();
    const { owner, slug, boards } = await setupWorkspace(t);
    const post = await submitPost(t, owner.cookie, slug, {
      boardId: boards[0]!.id,
      title: "Not part of the demo",
    });
    await t.settle();

    await resetDemo(db);

    const kept = await db
      .select({ title: posts.title })
      .from(posts)
      .where(eq(posts.id, post.id));
    expect(kept).toEqual([{ title: "Not part of the demo" }]);
    const people = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, owner.email));
    expect(people).toHaveLength(1);
  });
});
