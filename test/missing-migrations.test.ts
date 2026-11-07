import { describe, expect, it } from "vitest";
import { missingMigrations } from "../scripts/missing-migrations";

const journal = {
  entries: [
    { tag: "0012_one_owned_workspace", when: 1_000 },
    { tag: "0013_changelog_index", when: 2_000 },
    { tag: "0014_outbox_retries_and_indexes", when: 3_000 },
  ],
};
const health = (migration: unknown) => ({
  success: true,
  data: { db: "up", migration },
});

describe("missingMigrations", () => {
  it("lets the deploy go on when production has every migration", () => {
    expect(missingMigrations(journal, health(3_000))).toBeNull();
  });

  it("names the migrations production is missing, and what to run", () => {
    expect(missingMigrations(journal, health(1_000))).toBe(
      "Production is missing 0013_changelog_index, 0014_outbox_retries_and_indexes. Run `bun run db:migrate:prod`, then re-run this job."
    );
  });

  it("stops when production doesn't say which migrations it has", () => {
    expect(missingMigrations(journal, health(undefined))).toBe(
      "Production's /api/health doesn't say which migrations it has. Deploy this commit once with `bun run deploy`, then re-run this job."
    );
  });

  it("stops when production doesn't answer", () => {
    expect(missingMigrations(journal, null)).toBe(
      "Production's /api/health didn't answer, so its migrations are unknown. Re-run this job once the site is up."
    );
  });
});
