import { readFileSync } from "node:fs";
import { testClient } from "hono/testing";
import postgres from "postgres";
import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../app";
import { testEnv } from "../test/env";

afterEach(() => {
  vi.restoreAllMocks();
});

/** When the repo's newest migration was made, as drizzle-kit records it. */
function newestMigration(): number {
  const journal = JSON.parse(
    readFileSync("drizzle/meta/_journal.json", "utf8")
  ) as { entries: { when: number }[] };
  return journal.entries.at(-1)!.when;
}

describe("GET /api/health", () => {
  it("reports the database as up, with the newest migration it has", async () => {
    const { env, ctx, settle } = testEnv();
    const res = await testClient(app, env, ctx).api.health.$get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: { db: "up", migration: newestMigration() },
    });
    await settle();
  });

  it("still answers on a database with no migrations yet", async () => {
    // As CI's browser tests start: Playwright waits for this route before
    // its setup migrates the database.
    const testUrl = String(process.env.TEST_DATABASE_URL);
    const admin = postgres(testUrl, { max: 1, onnotice: () => {} });
    const name = `pano_health_${crypto.randomUUID().slice(0, 8)}`;
    await admin.unsafe(`create database ${name}`);
    try {
      const url = new URL(testUrl);
      url.pathname = `/${name}`;
      const { env, ctx, settle } = testEnv(url.toString());
      const res = await testClient(app, env, ctx).api.health.$get();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        success: true,
        data: { db: "up", migration: null },
      });
      await settle();
    } finally {
      await admin.unsafe(`drop database if exists ${name} with (force)`);
      await admin.end();
    }
  });

  it("answers a generic 500 when the database is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { env, ctx, settle } = testEnv(
      "postgresql://nobody:secret@127.0.0.1:1/none"
    );
    const res = await testClient(app, env, ctx).api.health.$get();
    const body = await res.text();
    expect(res.status).toBe(500);
    expect(JSON.parse(body)).toEqual({
      success: false,
      code: "INTERNAL_ERROR",
      error: "Internal Server Error",
    });
    expect(body).not.toContain("127.0.0.1:1");
    expect(body).not.toContain("secret");
    await settle();
  });
});
