import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { loadEnv } from "vite";
import { assertLocalDatabaseUrl } from "../worker/test/local-db";

/**
 * Brings the test database up to the latest migration once per run, so every
 * test sees the same schema production will.
 */
export default async function setup() {
  const url =
    process.env.TEST_DATABASE_URL ??
    loadEnv("test", process.cwd(), "").TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  assertLocalDatabaseUrl(url);
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle({ client }), { migrationsFolder: "./drizzle" });
  } finally {
    await client.end();
  }
}
