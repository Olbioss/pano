import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { invitation } from "../db/schema";
import { resetDemo } from "../services/demo-reset";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import { addToTeam, setupWorkspace } from "../test/fixtures";

const { db, close } = testDb();
beforeAll(() => resetDemo(db));
afterAll(() => close());

type TestApp = ReturnType<typeof testApp>;

const address = () => `joiner-${crypto.randomUUID().slice(0, 8)}@example.com`;

/** An owner's workspace with an invitation out to a new address. */
async function invited(t: TestApp, role: "admin" | "member" = "member") {
  const { owner, slug } = await setupWorkspace(t);
  const email = address();
  const res = await t.client.api.workspaces[":slug"].invitations.$post(
    { param: { slug }, json: { email, role } },
    { headers: { cookie: owner.cookie } }
  );
  const body = await res.json();
  if (!body.success) throw new Error(body.error);
  return { owner, slug, email, id: body.data.invitation.id };
}

const view = (t: TestApp, id: string, cookie?: string) =>
  t.client.api.invitations[":id"].$get(
    { param: { id } },
    cookie ? { headers: { cookie } } : undefined
  );

const accept = (t: TestApp, id: string, cookie: string) =>
  t.client.api.invitations[":id"].accept.$post(
    { param: { id } },
    { headers: { cookie } }
  );

describe("GET /api/invitations/:id", () => {
  it("shows anyone with the link the workspace, the role and a masked address", async () => {
    const t = testApp();
    const { id, email } = await invited(t);
    const res = await view(t, id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({
      id,
      workspace: { name: "Acme", slug: expect.any(String) },
      inviter: "Acme",
      role: "member",
      email: `j•••@example.com`,
      state: "pending",
      forYou: false,
      onTeam: false,
    });
    expect(JSON.stringify(body.data)).not.toContain(email);
    await t.settle();
  });

  it("knows the invited address when it's signed in", async () => {
    const t = testApp();
    const { id, email } = await invited(t);
    const joiner = await t.signIn(email);
    const body = await (await view(t, id, joiner.cookie)).json();
    expect(body).toMatchObject({ data: { forYou: true, onTeam: false } });
    const someoneElse = await t.signIn();
    const other = await (await view(t, id, someoneElse.cookie)).json();
    expect(other).toMatchObject({ data: { forYou: false } });
    await t.settle();
  });

  it("answers 404 for an invitation that doesn't exist", async () => {
    const t = testApp();
    const res = await view(t, "no-such-invitation");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "INVITATION_NOT_FOUND" });
    await t.settle();
  });
});

describe("POST /api/invitations/:id/accept", () => {
  it("puts the invited address on the team, with the invited role", async () => {
    const t = testApp();
    const { owner, slug, email, id } = await invited(t, "admin");
    const joiner = await t.signIn(email);
    const res = await accept(t, id, joiner.cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { slug } });
    const team = await t.client.api.workspaces[":slug"].team.$get(
      { param: { slug } },
      { headers: { cookie: owner.cookie } }
    );
    const members = (await team.json()).data.members;
    expect(members.find((m) => m.email === email)?.role).toBe("admin");
    const after = await (await view(t, id, joiner.cookie)).json();
    expect(after).toMatchObject({ data: { state: "accepted", onTeam: true } });
    await t.settle();
  });

  it("refuses another address", async () => {
    const t = testApp();
    const { id } = await invited(t);
    const someoneElse = await t.signIn();
    const res = await accept(t, id, someoneElse.cookie);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      code: "INVITATION_WRONG_ADDRESS",
    });
    await t.settle();
  });

  it("says when an invitation has expired", async () => {
    const t = testApp();
    const { id, email } = await invited(t);
    await db
      .update(invitation)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(invitation.id, id));
    const joiner = await t.signIn(email);
    expect(await (await view(t, id, joiner.cookie)).json()).toMatchObject({
      data: { state: "expired" },
    });
    const res = await accept(t, id, joiner.cookie);
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ code: "INVITATION_EXPIRED" });
    await t.settle();
  });

  it("refuses a cancelled invitation", async () => {
    const t = testApp();
    const { owner, slug, id, email } = await invited(t);
    await t.client.api.workspaces[":slug"].invitations[":id"].$delete(
      { param: { slug, id } },
      { headers: { cookie: owner.cookie } }
    );
    const joiner = await t.signIn(email);
    expect(await (await view(t, id, joiner.cookie)).json()).toMatchObject({
      data: { state: "canceled" },
    });
    const res = await accept(t, id, joiner.cookie);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "INVITATION_NOT_FOUND" });
    await t.settle();
  });

  it("doesn't add someone who's on the team already", async () => {
    const t = testApp();
    const { slug, id, email } = await invited(t);
    const joiner = await t.signIn(email);
    await addToTeam(slug, email, "member");
    expect(await (await view(t, id, joiner.cookie)).json()).toMatchObject({
      data: { onTeam: true },
    });
    const res = await accept(t, id, joiner.cookie);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "ALREADY_ON_TEAM" });
    await t.settle();
  });

  it("keeps demo accounts in the demo", async () => {
    const t = testApp();
    const { id } = await invited(t);
    const guest = await t.signInDemo("member");
    const res = await accept(t, id, guest.cookie);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "DEMO_ONLY" });
    await t.settle();
  });

  it("needs someone signed in", async () => {
    const t = testApp();
    const { id } = await invited(t);
    const res = await t.request(`/api/invitations/${id}/accept`, {
      method: "POST",
      headers: { origin: "http://localhost" },
    });
    expect(res.status).toBe(401);
    await t.settle();
  });
});
