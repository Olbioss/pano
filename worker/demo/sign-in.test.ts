import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { organization } from "../db/schema";
import { DEMO_WORKSPACE_ID, resetDemo } from "../services/demo-reset";
import { testApp } from "../test/app";
import { testDb } from "../test/db";

const { db, close } = testDb();
beforeAll(() => resetDemo(db));
afterAll(() => close());

/** /api/me as the holder of `cookie`. */
async function meWith(t: ReturnType<typeof testApp>, cookie: string) {
  const res = await t.client.api.me.$get(undefined, { headers: { cookie } });
  return (await res.json()).data;
}

describe("demo sign-in", () => {
  it("signs a visitor in to a new guest account on the demo team", async () => {
    const t = testApp();
    const guest = await t.signInDemo("team");
    const me = await meWith(t, guest.cookie);
    expect(me.user?.name).toMatch(/^Guest \d{4}$/);
    expect(me.user?.email).toMatch(/@demo\.pano\.invalid$/);
    expect(me.workspaces).toEqual([
      expect.objectContaining({ slug: "demo", role: "member" }),
    ]);
    await t.settle();
  });

  it("keeps a member guest off the team, and gives every visit its own account", async () => {
    const t = testApp();
    const first = await t.signInDemo("member");
    const second = await t.signInDemo("member");
    const [a, b] = [
      await meWith(t, first.cookie),
      await meWith(t, second.cookie),
    ];
    expect(a.workspaces).toEqual([]);
    expect(a.user?.id).not.toBe(b.user?.id);
    await t.settle();
  });

  it("names the guest in Turkish for a visitor who chose Turkish", async () => {
    const t = testApp();
    const guest = await t.signInDemo("member", { cookie: "pano-locale=tr" });
    expect(guest.name).toMatch(/^Misafir \d{4}$/);
    await t.settle();
  });

  it("refuses an unknown role", async () => {
    const t = testApp();
    const res = await t.post("/api/auth/demo/sign-in", { as: "owner" });
    expect(res.status).toBe(400);
    await t.settle();
  });

  it("answers 404 while the demo workspace isn't set up", async () => {
    await db.delete(organization).where(eq(organization.id, DEMO_WORKSPACE_ID));
    const t = testApp();
    const res = await t.post("/api/auth/demo/sign-in", { as: "member" });
    expect(res.status).toBe(404);
    // Its own answer, not the one for a path Better Auth doesn't know.
    expect(await res.json()).toMatchObject({
      message: "The demo workspace isn't set up",
    });
    await t.settle();
    await resetDemo(db);
  });

  it("limits each address to five demo sign-ins a minute in production", async () => {
    const t = testApp({ ENVIRONMENT: "production" });
    const ip = { "cf-connecting-ip": `203.0.113.${Date.now() % 250}` };
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push(
        (await t.post("/api/auth/demo/sign-in", { as: "member" }, ip)).status
      );
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    await t.settle();
  });

  it("sends no sign-in code to a demo address", async () => {
    const t = testApp();
    const res = await t.sendCode("defne@demo.pano.invalid");
    expect(res.ok).toBe(true);
    expect(t.mail.sent).toEqual([]);
    await t.settle();
  });
});
