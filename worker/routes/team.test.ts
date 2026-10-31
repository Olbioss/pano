import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetDemo } from "../services/demo-reset";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import { addToTeam, setupWorkspace } from "../test/fixtures";

const { db, close } = testDb();
beforeAll(() => resetDemo(db));
afterAll(() => close());

type TestApp = ReturnType<typeof testApp>;

/** An owner's workspace with an admin and a member on its team. */
async function teamOfThree(t: TestApp) {
  const { owner, slug } = await setupWorkspace(t);
  const admin = await t.signIn();
  const adminId = await addToTeam(slug, admin.email, "admin");
  const member = await t.signIn();
  const memberId = await addToTeam(slug, member.email, "member");
  return { slug, owner, admin, adminId, member, memberId };
}

const readTeam = (t: TestApp, slug: string, cookie?: string) =>
  t.client.api.workspaces[":slug"].team.$get(
    { param: { slug } },
    cookie ? { headers: { cookie } } : undefined
  );

const setRole = (
  t: TestApp,
  slug: string,
  userId: string,
  role: "admin" | "member",
  cookie: string
) =>
  t.client.api.workspaces[":slug"].members[":userId"].$patch(
    { param: { slug, userId }, json: { role } },
    { headers: { cookie } }
  );

const remove = (t: TestApp, slug: string, userId: string, cookie: string) =>
  t.client.api.workspaces[":slug"].members[":userId"].$delete(
    { param: { slug, userId } },
    { headers: { cookie } }
  );

async function ownerIdOf(t: TestApp, slug: string, cookie: string) {
  const body = await (await readTeam(t, slug, cookie)).json();
  return body.data.members[0]!.userId;
}

describe("GET /api/workspaces/:slug/team", () => {
  it("lists the team, owner first, with roles and addresses", async () => {
    const t = testApp();
    const { slug, owner, admin, member } = await teamOfThree(t);
    const res = await readTeam(t, slug, member.cookie);
    const body = await res.json();
    expect(body.data.members.map((m) => [m.email, m.role])).toEqual([
      [owner.email, "owner"],
      [admin.email, "admin"],
      [member.email, "member"],
    ]);
    expect(body.data.invitations).toEqual([]);
    await t.settle();
  });

  it("is only for the team", async () => {
    const t = testApp();
    const { slug } = await setupWorkspace(t);
    const outsider = await t.signIn();
    expect((await readTeam(t, slug, outsider.cookie)).status).toBe(403);
    expect((await readTeam(t, slug)).status).toBe(401);
    await t.settle();
  });

  it("leaves out the demo's made-up addresses", async () => {
    const t = testApp();
    const guest = await t.signInDemo("team");
    const body = await (await readTeam(t, "demo", guest.cookie)).json();
    expect(body.data.members.length).toBeGreaterThan(1);
    expect(body.data.members.every((m) => m.email === null)).toBe(true);
    await t.settle();
  });
});

describe("PATCH /api/workspaces/:slug/members/:userId", () => {
  it("lets the owner make a member an admin, and back", async () => {
    const t = testApp();
    const { slug, owner, memberId } = await teamOfThree(t);
    const up = await setRole(t, slug, memberId, "admin", owner.cookie);
    expect(up.status).toBe(200);
    const body = await up.json();
    if (!body.success) throw new Error(body.error);
    expect(body.data.members.find((m) => m.userId === memberId)?.role).toBe(
      "admin"
    );
    expect(
      (await setRole(t, slug, memberId, "member", owner.cookie)).status
    ).toBe(200);
    await t.settle();
  });

  it("lets an admin change another admin", async () => {
    const t = testApp();
    const { slug, admin, adminId, memberId } = await teamOfThree(t);
    await setRole(t, slug, memberId, "admin", admin.cookie);
    const res = await setRole(t, slug, memberId, "member", admin.cookie);
    expect(res.status).toBe(200);
    // An admin can step down too.
    expect(
      (await setRole(t, slug, adminId, "member", admin.cookie)).status
    ).toBe(200);
    await t.settle();
  });

  it("leaves roles to owners and admins", async () => {
    const t = testApp();
    const { slug, member, adminId } = await teamOfThree(t);
    const res = await setRole(t, slug, adminId, "member", member.cookie);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "ADMINS_ONLY" });
    await t.settle();
  });

  it("never changes the owner, and never makes another one", async () => {
    const t = testApp();
    const { slug, owner, admin, memberId } = await teamOfThree(t);
    const ownerId = await ownerIdOf(t, slug, owner.cookie);
    const res = await setRole(t, slug, ownerId, "member", admin.cookie);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "OWNER_PROTECTED" });
    const promote = await t.request(
      `/api/workspaces/${slug}/members/${memberId}`,
      {
        method: "PATCH",
        headers: {
          cookie: owner.cookie,
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({ role: "owner" }),
      }
    );
    expect(promote.status).toBe(400);
    await t.settle();
  });

  it("answers 404 for someone not on the team", async () => {
    const t = testApp();
    const { slug, owner } = await teamOfThree(t);
    const res = await setRole(t, slug, "nobody", "admin", owner.cookie);
    expect(res.status).toBe(404);
    await t.settle();
  });

  it("keeps the demo's team as it is", async () => {
    const t = testApp();
    const guest = await t.signInDemo("team");
    const body = await (await readTeam(t, "demo", guest.cookie)).json();
    const someone = body.data.members.at(-1)!.userId;
    const res = await setRole(t, "demo", someone, "admin", guest.cookie);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "DEMO_READ_ONLY" });
    await t.settle();
  });
});

describe("DELETE /api/workspaces/:slug/members/:userId", () => {
  it("lets an admin take a member off the team, who then loses its tools", async () => {
    const t = testApp();
    const { slug, admin, member, memberId } = await teamOfThree(t);
    const res = await remove(t, slug, memberId, admin.cookie);
    expect(res.status).toBe(200);
    expect((await readTeam(t, slug, member.cookie)).status).toBe(403);
    const me = await (
      await t.client.api.me.$get(undefined, {
        headers: { cookie: member.cookie },
      })
    ).json();
    expect(me.data?.workspaces.map((w) => w.slug)).not.toContain(slug);
    await t.settle();
  });

  it("lets anyone but the owner leave", async () => {
    const t = testApp();
    const { slug, owner, member, memberId } = await teamOfThree(t);
    expect((await remove(t, slug, memberId, member.cookie)).status).toBe(200);
    const ownerId = await ownerIdOf(t, slug, owner.cookie);
    const leave = await remove(t, slug, ownerId, owner.cookie);
    expect(leave.status).toBe(403);
    expect(await leave.json()).toMatchObject({ code: "OWNER_PROTECTED" });
    await t.settle();
  });

  it("leaves removing others to owners and admins, and never removes the owner", async () => {
    const t = testApp();
    const { slug, owner, admin, member, adminId } = await teamOfThree(t);
    const byMember = await remove(t, slug, adminId, member.cookie);
    expect(byMember.status).toBe(403);
    expect(await byMember.json()).toMatchObject({ code: "ADMINS_ONLY" });
    const ownerId = await ownerIdOf(t, slug, owner.cookie);
    const byAdmin = await remove(t, slug, ownerId, admin.cookie);
    expect(byAdmin.status).toBe(403);
    expect(await byAdmin.json()).toMatchObject({ code: "OWNER_PROTECTED" });
    await t.settle();
  });
});

describe("workspace settings", () => {
  it("are for owners and admins only", async () => {
    const t = testApp();
    const { slug, admin, member } = await teamOfThree(t);
    const rename = (cookie: string) =>
      t.client.api.workspaces[":slug"].$patch(
        { param: { slug }, json: { name: "Renamed" } },
        { headers: { cookie } }
      );
    const byMember = await rename(member.cookie);
    expect(byMember.status).toBe(403);
    expect(await byMember.json()).toMatchObject({ code: "ADMINS_ONLY" });
    const board = await t.client.api.workspaces[":slug"].boards.$post(
      { param: { slug }, json: { name: "Ideas" } },
      { headers: { cookie: member.cookie } }
    );
    expect(board.status).toBe(403);
    expect((await rename(admin.cookie)).status).toBe(200);
    await t.settle();
  });
});
