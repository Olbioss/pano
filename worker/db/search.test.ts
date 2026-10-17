import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { testDb } from "../test/db";
import { boards, organization, posts } from "./schema";

const { db, close } = testDb();
afterAll(() => close());

describe("search columns", () => {
  it("folds case and Turkish letters the same in any locale", async () => {
    const [row] = await db.execute<{ folded: string }>(
      sql`select pano_fold('İPTAL Işık ÇĞÖŞÜ') as folded`
    );
    expect(row?.folded).toBe("iptal isik cgosu");
  });

  it("stems a post in its workspace's language", async () => {
    const orgId = crypto.randomUUID();
    await db.insert(organization).values({
      id: orgId,
      name: "Arama",
      slug: `arama-${orgId.slice(0, 8)}`,
      createdAt: new Date(),
    });
    const [board] = await db
      .insert(boards)
      .values({ organizationId: orgId, slug: "istekler", name: "İstekler" })
      .returning({ id: boards.id });
    const [post] = await db
      .insert(posts)
      .values({
        organizationId: orgId,
        boardId: board!.id,
        title: "İptal edilen rezervasyonlar",
        body: "Çoklu şube",
        searchConfig: "turkish",
      })
      .returning({ search: posts.search });
    expect(post?.search).toContain("'rezervasyon'");
    expect(post?.search).toContain("'sube'");
  });
});
