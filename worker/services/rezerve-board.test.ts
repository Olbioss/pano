import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isReservedSlug } from "@/shared/slug";
import { member, organization, posts, user as users } from "../db/schema";
import { testApp, uniqueEmail } from "../test/app";
import { testDb } from "../test/db";
import { ensurePanoBoard } from "./pano-board";
import {
  ensureRezerveBoard,
  REZERVE_OWNER_EMAIL,
  REZERVE_WORKSPACE_ID,
} from "./rezerve-board";

const { db, close } = testDb();
// The workspace's id is fixed, so an earlier run's copy would still be here.
beforeAll(async () => {
  await db
    .delete(organization)
    .where(eq(organization.id, REZERVE_WORKSPACE_ID));
});
afterAll(() => close());

function seeded() {
  return db
    .select({ title: posts.title, status: posts.status })
    .from(posts)
    .where(eq(posts.organizationId, REZERVE_WORKSPACE_ID))
    .orderBy(asc(posts.id));
}

describe("ensureRezerveBoard", () => {
  it("makes /rezerve in Turkish, run by an account that already owns /pano", async () => {
    const email = uniqueEmail("owner");
    await ensurePanoBoard(db, { ownerEmail: email });
    await ensureRezerveBoard(db, { adminEmail: email.toUpperCase() });

    const t = testApp();
    const { cookie } = await t.signIn(email);
    const { data: me } = await (
      await t.client.api.me.$get(undefined, { headers: { cookie } })
    ).json();
    expect(me.workspaces).toContainEqual(
      expect.objectContaining({ slug: "pano", role: "owner" })
    );
    expect(me.workspaces).toContainEqual(
      expect.objectContaining({ slug: "rezerve", role: "admin" })
    );
    const { data: workspace } = await (
      await t.client.api.workspaces[":slug"].$get({
        param: { slug: "rezerve" },
      })
    ).json();
    expect(workspace.name).toBe("Rezerve");
    expect(workspace.defaultLocale).toBe("tr");
    expect(workspace.boards.map((board) => board.name)).toEqual([
      "Özellik istekleri",
      "Hatalar",
    ]);
    await t.settle();
  });

  it("is owned by a placeholder account on an address that takes no mail", async () => {
    const owners = await db
      .select({ email: users.email })
      .from(member)
      .innerJoin(users, eq(users.id, member.userId))
      .where(eq(member.organizationId, REZERVE_WORKSPACE_ID))
      .then((rows) => rows.filter((row) => row.email === REZERVE_OWNER_EMAIL));
    expect(owners).toHaveLength(1);
    expect(REZERVE_OWNER_EMAIL.endsWith(".invalid")).toBe(true);
  });

  it("starts the board with four requests, one of them planned, and a second run adds none", async () => {
    const first = await seeded();
    expect(first.map((post) => post.status)).toEqual([
      "planned",
      "open",
      "open",
      "open",
    ]);
    expect(first[0]?.title).toBe("Randevu öncesi hatırlatma e-postası");

    const [admin] = await db
      .select({ email: users.email })
      .from(member)
      .innerJoin(users, eq(users.id, member.userId))
      .where(eq(member.organizationId, REZERVE_WORKSPACE_ID))
      .then((rows) => rows.filter((row) => row.email !== REZERVE_OWNER_EMAIL));
    await ensureRezerveBoard(db, { adminEmail: admin!.email });

    expect(await seeded()).toEqual(first);
  });

  it("keeps the address for itself", () => {
    expect(isReservedSlug("rezerve")).toBe(true);
  });
});
