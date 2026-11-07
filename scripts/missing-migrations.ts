/** drizzle/meta/_journal.json: each migration, and when drizzle-kit made it. */
export type Journal = { entries: { tag: string; when: number }[] };

/**
 * Why a deploy must wait, or null when production has every migration in
 * `journal`. `health` is production's /api/health answer, or null when it
 * didn't answer.
 */
export function missingMigrations(
  journal: Journal,
  health: unknown
): string | null {
  if (health === null) {
    return "Production's /api/health didn't answer, so its migrations are unknown. Re-run this job once the site is up.";
  }
  const applied = (health as { data?: { migration?: unknown } }).data
    ?.migration;
  if (typeof applied !== "number") {
    return "Production's /api/health doesn't say which migrations it has. Deploy this commit once with `bun run deploy`, then re-run this job.";
  }
  const missing = journal.entries
    .filter((entry) => entry.when > applied)
    .map((entry) => entry.tag);
  if (missing.length === 0) return null;
  return `Production is missing ${missing.join(", ")}. Run \`bun run db:migrate:prod\`, then re-run this job.`;
}
