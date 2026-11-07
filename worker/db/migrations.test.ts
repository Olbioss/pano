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

  it("index the columns that point at a comment, so deleting a post doesn't scan", async () => {
    const rows = await db.execute<{ indexname: string; indexdef: string }>(
      sql`select indexname, indexdef from pg_indexes
          where indexname in ('comments_parent_idx', 'posts_pinned_comment_idx')
          order by indexname`
    );
    expect(rows.map((row) => row.indexname)).toEqual([
      "comments_parent_idx",
      "posts_pinned_comment_idx",
    ]);
    expect(rows[1]!.indexdef).toContain(
      "WHERE (pinned_comment_id IS NOT NULL)"
    );
  });

  it("give each queued email the time it's due, now unless set", async () => {
    const rows = await db.execute<{
      column_default: string;
      is_nullable: string;
    }>(
      sql`select column_default, is_nullable from information_schema.columns
          where table_name = 'email_outbox' and column_name = 'next_attempt_at'`
    );
    expect([...rows]).toEqual([{ column_default: "now()", is_nullable: "NO" }]);
  });
});
