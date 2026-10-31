import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "./client";
import { ONE_OWNED_WORKSPACE, pgConstraint } from "./errors";
import { member, organization, user } from "./schema";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
const { db, close } = createDb(url);

afterAll(() => close());

describe("migrations", () => {
  it("enable pg_trgm for typo-tolerant search", async () => {
    const rows = await db.execute<{ extname: string }>(
      sql`select extname from pg_extension where extname = 'pg_trgm'`
    );
    expect(rows.map((row) => row.extname)).toEqual(["pg_trgm"]);
  });

  it("let an account own one workspace, and be on any number of teams", async () => {
    const userId = crypto.randomUUID();
    await db.insert(user).values({
      id: userId,
      name: "",
      email: `owner-${userId.slice(0, 8)}@example.com`,
    });
    const workspace = async () => {
      const id = crypto.randomUUID();
      await db.insert(organization).values({
        id,
        name: "Acme",
        slug: `ws-${id.slice(0, 8)}`,
        createdAt: new Date(),
      });
      return id;
    };
    const join = async (organizationId: string, role: string) =>
      db.insert(member).values({
        id: crypto.randomUUID(),
        organizationId,
        userId,
        role,
        createdAt: new Date(),
      });

    await join(await workspace(), "owner");
    await join(await workspace(), "admin");
    await join(await workspace(), "member");
    const second = await join(await workspace(), "owner").catch((err) => err);
    expect(pgConstraint(second)).toBe(ONE_OWNED_WORKSPACE);
  });
});
