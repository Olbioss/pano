import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "./client";

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
});
