import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { member, user as users } from "../db/schema";
import { testApp, uniqueEmail } from "../test/app";
import { testDb } from "../test/db";
import { ensurePanoBoard, PANO_WORKSPACE_ID } from "./pano-board";

const { db, close } = testDb();
afterAll(() => close());

describe("ensurePanoBoard", () => {
  it("makes /pano with its boards, owned by whoever signs in with that address", async () => {
    const email = uniqueEmail("owner");
    await ensurePanoBoard(db, { ownerEmail: email.toUpperCase() });

    const t = testApp();
    const { cookie } = await t.signIn(email);
    const { data: me } = await (
      await t.client.api.me.$get(undefined, { headers: { cookie } })
    ).json();
    expect(me.workspaces).toContainEqual(
      expect.objectContaining({ slug: "pano", role: "owner" })
    );
    const { data: workspace } = await (
      await t.client.api.workspaces[":slug"].$get({ param: { slug: "pano" } })
    ).json();
    expect(workspace.boards.map((board) => board.slug)).toEqual([
      "features",
      "bugs",
    ]);
    await t.settle();
  });

  it("keeps an account that already exists, and a second run changes nothing", async () => {
    const t = testApp();
    const { email } = await t.signIn(uniqueEmail("owner"));
    await t.settle();
    const [account] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));

    const first = await ensurePanoBoard(db, { ownerEmail: email });
    const second = await ensurePanoBoard(db, { ownerEmail: email });

    expect(first.ownerId).toBe(account?.id);
    expect(second.ownerId).toBe(account?.id);
    const memberships = await db
      .select({ role: member.role })
      .from(member)
      .where(
        and(
          eq(member.organizationId, PANO_WORKSPACE_ID),
          eq(member.userId, account!.id)
        )
      );
    expect(memberships).toEqual([{ role: "owner" }]);
  });
});
