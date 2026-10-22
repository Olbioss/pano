import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { posts } from "../db/schema";
import { DEMO_WORKSPACE_ID, resetDemo } from "../services/demo-reset";
import { OUTBOX_PENDING } from "../services/outbox";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import { setupWorkspace, submitPost, voteFor } from "../test/fixtures";

const { db, close } = testDb();
beforeAll(() => resetDemo(db));
afterAll(() => close());

describe("the outbox flag", () => {
  it("goes up when shipping a request queues emails", async () => {
    const t = testApp();
    const { owner, slug, boards: made } = await setupWorkspace(t);
    const post = await submitPost(t, owner.cookie, slug, {
      boardId: made[0]!.id,
      title: "Ship me",
    });
    const fan = await t.signIn();
    await voteFor(t, fan.cookie, post.id);
    await t.client.api.posts[":id"].status.$patch(
      { param: { id: String(post.id) }, json: { status: "shipped" } },
      { headers: { cookie: owner.cookie } }
    );
    await t.settle();
    expect(await t.env.FLAGS.get(OUTBOX_PENDING)).toBe("1");
  });

  it("stays down when the demo ships a request: it queues no email", async () => {
    const t = testApp();
    const guest = await t.signInDemo("team");
    const [post] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(
          eq(posts.organizationId, DEMO_WORKSPACE_ID),
          eq(posts.title, "Dark mode")
        )
      );
    const res = await t.client.api.posts[":id"].status.$patch(
      { param: { id: String(post!.id) }, json: { status: "shipped" } },
      { headers: { cookie: guest.cookie } }
    );
    await t.settle();
    expect(res.status).toBe(200);
    expect(await t.env.FLAGS.get(OUTBOX_PENDING)).toBeNull();
  });
});
