import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { loadEnv } from "vite";
import { assertLocalDatabaseUrl } from "../worker/test/local-db";

/** The tables each run empties; CASCADE empties the ones that point at them. */
const TABLES = [
  "user",
  "organization",
  "verification",
  "rate_limit",
  "email_counters",
];

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
    // A failed run can leave rows that a new migration's constraint refuses,
    // such as one account owning two workspaces before migration 0012, so
    // the tables that exist are emptied before migrating too.
    await emptyTables(client);
    await migrate(drizzle({ client }), { migrationsFolder: "./drizzle" });
    // Every run starts from empty tables. Tests use unique emails and slugs,
    // so files within a run don't collide either.
    await emptyTables(client);
  } finally {
    await client.end();
  }
}

async function emptyTables(client: postgres.Sql) {
  const present = await client<{ name: string }[]>`
    select tablename as name from pg_tables
    where schemaname = 'public' and tablename in ${client(TABLES)}
  `;
  if (present.length === 0) return;
  const names = present.map((table) => `"${table.name}"`).join(", ");
  await client.unsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
}
