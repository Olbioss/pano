// `bun run db:migrate:prod`: applies the migrations to production, whose
// connection string .env keeps as NEON_DATABASE_URL. DATABASE_URL stays on
// the local database, so a plain `bun run db:migrate` can't reach production.
import { spawnSync } from "node:child_process";

const url = process.env.NEON_DATABASE_URL;
if (!url) {
  console.error(
    "NEON_DATABASE_URL is not set: add the Neon connection string to .env"
  );
  process.exit(1);
}
// Bun loaded .env into this process; drizzle-kit gets production's address
// as DATABASE_URL, which drizzle.config.ts reads.
const run = spawnSync("bunx", ["drizzle-kit", "migrate"], {
  env: { ...process.env, DATABASE_URL: url },
  stdio: "inherit",
});
process.exit(run.status ?? 1);
