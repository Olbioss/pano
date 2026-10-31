import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { emailCounters, invitation, member, user } from "../db/schema";
import { resetDemo } from "../services/demo-reset";
import { NOTICE_EMAILS, utcDay } from "../services/email-budget";
import { ORIGIN, testApp } from "../test/app";
import { testDb } from "../test/db";
import { addToTeam, setupWorkspace } from "../test/fixtures";

const { db, close } = testDb();
beforeAll(() => resetDemo(db));
afterAll(() => close());

type TestApp = ReturnType<typeof testApp>;

const invite = (
  t: TestApp,
  slug: string,
  email: string,
  cookie: string,
  role: "admin" | "member" = "member"
) =>
  t.client.api.workspaces[":slug"].invitations.$post(
    { param: { slug }, json: { email, role } },
    { headers: { cookie } }
  );

const resend = (t: TestApp, slug: string, id: string, cookie: string) =>
  t.client.api.workspaces[":slug"].invitations[":id"].resend.$post(
    { param: { slug, id } },
    { headers: { cookie } }
  );

const cancel = (t: TestApp, slug: string, id: string, cookie: string) =>
  t.client.api.workspaces[":slug"].invitations[":id"].$delete(
    { param: { slug, id } },
    { headers: { cookie } }
  );

async function pendingOf(t: TestApp, slug: string, cookie: string) {
  const res = await t.client.api.workspaces[":slug"].team.$get(
    { param: { slug } },
    { headers: { cookie } }
  );
  return (await res.json()).data.invitations;
}

/** The invitation's id from a successful invite. */
async function invitationId(res: Awaited<ReturnType<typeof invite>>) {
  const body = await res.json();
  if (!body.success) throw new Error(body.error);
  return body.data.invitation.id;
}

const address = () => `invitee-${crypto.randomUUID().slice(0, 8)}@example.com`;

describe("POST /api/workspaces/:slug/invitations", () => {
  it("invites an address by email, in the workspace's language", async () => {
    const t = testApp();
    const { owner, slug } = await setupWorkspace(t, { defaultLocale: "tr" });
    const res = await invite(t, slug, "Sam@Studio.dev", owner.cookie);
    expect(res.status).toBe(201);
    const body = await res.json();
    if (!body.success) throw new Error(body.error);
    expect(body.data).toMatchObject({
      emailSent: true,
      invitation: { email: "sam@studio.dev", role: "member" },
    });
    const days =
      (Date.parse(body.data.invitation.expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
    // The owner has no name yet, so the email speaks for the workspace.
    expect(t.mail.invited).toEqual([
      {
        to: "sam@studio.dev",
        locale: "tr",
        inviter: "Acme",
        workspaceName: "Acme",
        role: "member",
        url: `${ORIGIN}/invite/${body.data.invitation.id}`,
        expiresAt: expect.any(Date),
      },
    ]);
    expect(
      (await pendingOf(t, slug, owner.cookie)).map((i) => i.email)
    ).toEqual(["sam@studio.dev"]);
    await t.settle();
  });

  it("sends a waiting invitation again instead of making a second one", async () => {
    const t = testApp();
    const { owner, slug } = await setupWorkspace(t);
    const email = address();
    const first = await invitationId(
      await invite(t, slug, email, owner.cookie)
    );
    const again = await invitationId(
      await invite(t, slug, email, owner.cookie)
    );
    expect(again).toBe(first);
    expect(t.mail.invited).toHaveLength(2);
    expect(await pendingOf(t, slug, owner.cookie)).toHaveLength(1);
    await t.settle();
  });

  it("gives a waiting invitation the role it's sent with now", async () => {
    const t = testApp();
    const { owner, slug } = await setupWorkspace(t);
    const email = address();
    const first = await invitationId(
      await invite(t, slug, email, owner.cookie, "admin")
    );
    const res = await invite(t, slug, email, owner.cookie, "member");
    const body = await res.json();
    if (!body.success) throw new Error(body.error);
    expect(body.data.invitation).toMatchObject({ id: first, role: "member" });
    expect(t.mail.invited.map((mail) => mail.role)).toEqual([
      "admin",
      "member",
    ]);
    await t.settle();
  });

  it("refuses someone already on the team", async () => {
    const t = testApp();
    const { owner, slug } = await setupWorkspace(t);
    const teammate = await t.signIn();
    await addToTeam(slug, teammate.email, "member");
    const res = await invite(t, slug, teammate.email, owner.cookie);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "ALREADY_ON_TEAM" });
    await t.settle();
  });

  it("leaves inviting to owners and admins", async () => {
    const t = testApp();
    const { slug } = await setupWorkspace(t);
    const admin = await t.signIn();
    await addToTeam(slug, admin.email, "admin");
    const member = await t.signIn();
    await addToTeam(slug, member.email, "member");
    const byMember = await invite(t, slug, address(), member.cookie);
    expect(byMember.status).toBe(403);
    expect(await byMember.json()).toMatchObject({ code: "ADMINS_ONLY" });
    const byAdmin = await invite(t, slug, address(), admin.cookie, "admin");
    expect(byAdmin.status).toBe(201);
    await t.settle();
  });

  it("keeps the demo's team as it is", async () => {
    const t = testApp();
    const guest = await t.signInDemo("team");
    const res = await invite(t, "demo", address(), guest.cookie);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "DEMO_READ_ONLY" });
    await t.settle();
  });

  it("stops at 20 waiting invitations", async () => {
    const t = testApp();
    const { owner, slug } = await setupWorkspace(t);
    for (let i = 0; i < 20; i++) {
      expect((await invite(t, slug, address(), owner.cookie)).status).toBe(201);
    }
    const res = await invite(t, slug, address(), owner.cookie);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "TOO_MANY_INVITATIONS" });
    await t.settle();
  });

  it("stops once the team has 50 people", async () => {
    const t = testApp();
    const { owner, slug } = await setupWorkspace(t);
    const [workspace] = await db
      .select({ organizationId: member.organizationId })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(user.email, owner.email));
    const people = Array.from({ length: 49 }, () => {
      const id = crypto.randomUUID();
      return { id, name: "", email: `full-${id.slice(0, 8)}@example.com` };
    });
    await db.insert(user).values(people);
    await db.insert(member).values(
      people.map((person) => ({
        id: crypto.randomUUID(),
        organizationId: workspace!.organizationId,
        userId: person.id,
        role: "member",
        createdAt: new Date(),
      }))
    );
    const res = await invite(t, slug, address(), owner.cookie);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "TEAM_FULL" });
    await t.settle();
  });

  it("keeps the invitation when its email couldn't be sent", async () => {
    const t = testApp();
    const { owner, slug } = await setupWorkspace(t);
    t.mail.mailer.sendInvitation = async () => {
      throw new Error("Brevo is down");
    };
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await invite(t, slug, address(), owner.cookie);
    logged.mockRestore();
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ data: { emailSent: false } });
    expect(await pendingOf(t, slug, owner.cookie)).toHaveLength(1);
    await t.settle();
  });

  it("draws on the day's email budget in production", async () => {
    const t = testApp({ ENVIRONMENT: "production" });
    const { owner, slug } = await setupWorkspace(t);
    const today = utcDay(new Date());
    await db
      .insert(emailCounters)
      .values({ key: "daily", windowStart: today, count: NOTICE_EMAILS })
      .onConflictDoUpdate({
        target: [emailCounters.key, emailCounters.windowStart],
        set: { count: NOTICE_EMAILS },
      });
    try {
      const res = await invite(t, slug, address(), owner.cookie);
      expect(res.status).toBe(429);
      expect(await res.json()).toMatchObject({ code: "EMAIL_BUDGET" });
      expect(await pendingOf(t, slug, owner.cookie)).toEqual([]);
    } finally {
      // Later tests send email today too.
      await db
        .delete(emailCounters)
        .where(
          and(
            eq(emailCounters.key, "daily"),
            eq(emailCounters.windowStart, today)
          )
        );
      await t.settle();
    }
  });

  it("lets one person send ten an hour in production", async () => {
    const t = testApp({ ENVIRONMENT: "production" });
    const { owner, slug } = await setupWorkspace(t);
    for (let i = 0; i < 10; i++) {
      expect((await invite(t, slug, address(), owner.cookie)).status).toBe(201);
    }
    const res = await invite(t, slug, address(), owner.cookie);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "RATE_LIMITED" });
    await t.settle();
  });
});

describe("resending and cancelling", () => {
  it("sends an invitation again with a fresh expiry", async () => {
    const t = testApp();
    const { owner, slug } = await setupWorkspace(t);
    const id = await invitationId(
      await invite(t, slug, address(), owner.cookie)
    );
    await db
      .update(invitation)
      .set({ expiresAt: new Date(Date.now() - 86_400_000) })
      .where(eq(invitation.id, id));
    const res = await resend(t, slug, id, owner.cookie);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Date.parse(body.data.invitation.expiresAt)).toBeGreaterThan(
      Date.now() + 6 * 86_400_000
    );
    expect(t.mail.invited).toHaveLength(2);
    await t.settle();
  });

  it("brings an expired invitation back instead of making a second one", async () => {
    const t = testApp();
    const { owner, slug } = await setupWorkspace(t);
    const email = address();
    const id = await invitationId(await invite(t, slug, email, owner.cookie));
    const expire = () =>
      db
        .update(invitation)
        .set({ expiresAt: new Date(Date.now() - 86_400_000) })
        .where(eq(invitation.id, id));
    await expire();
    const resent = await resend(t, slug, id, owner.cookie);
    expect((await resent.json()).data.invitation.id).toBe(id);
    await expire();
    const again = await invitationId(
      await invite(t, slug, email, owner.cookie)
    );
    expect(again).toBe(id);
    expect(await pendingOf(t, slug, owner.cookie)).toEqual([
      expect.objectContaining({ id, email }),
    ]);
    await t.settle();
  });

  it("cancels an invitation", async () => {
    const t = testApp();
    const { owner, slug } = await setupWorkspace(t);
    const id = await invitationId(
      await invite(t, slug, address(), owner.cookie)
    );
    expect((await cancel(t, slug, id, owner.cookie)).status).toBe(200);
    expect(await pendingOf(t, slug, owner.cookie)).toEqual([]);
    expect((await resend(t, slug, id, owner.cookie)).status).toBe(404);
    await t.settle();
  });

  it("answers 404 for another workspace's invitation", async () => {
    const t = testApp();
    const ours = await setupWorkspace(t);
    const theirs = await setupWorkspace(t);
    const id = await invitationId(
      await invite(t, theirs.slug, address(), theirs.owner.cookie)
    );
    expect((await resend(t, ours.slug, id, ours.owner.cookie)).status).toBe(
      404
    );
    expect((await cancel(t, ours.slug, id, ours.owner.cookie)).status).toBe(
      404
    );
    await t.settle();
  });
});
