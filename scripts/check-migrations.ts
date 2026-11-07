// `bun scripts/check-migrations.ts <site>`: the deploy job's first step. It
// stops the deploy while the site's database lacks a migration this commit
// has, so new code never runs against an old schema. Migrations stay a
// manual `bun run db:migrate:prod`.
import { readFileSync } from "node:fs";
import { type Journal, missingMigrations } from "./missing-migrations";

const site = process.argv[2];
if (!site) {
  console.error("usage: bun scripts/check-migrations.ts <site>");
  process.exit(1);
}
const journal = JSON.parse(
  readFileSync("drizzle/meta/_journal.json", "utf8")
) as Journal;
let health: unknown = null;
try {
  const res = await fetch(new URL("/api/health", site), {
    signal: AbortSignal.timeout(10_000),
  });
  if (res.ok) health = await res.json();
} catch {
  // Unreachable: missingMigrations says so.
}
const problem = missingMigrations(journal, health);
if (problem) {
  console.error(problem);
  process.exit(1);
}
console.log(`Production has every migration, up to ${journal.entries.at(-1)?.tag}.`);
