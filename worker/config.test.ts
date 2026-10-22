import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EVERY_FIVE_MINUTES, NIGHTLY } from "./cron";

type WranglerConfig = {
  triggers: { crons: string[] };
  kv_namespaces: { binding: string }[];
  vars?: Record<string, string>;
};

/**
 * wrangler.jsonc as JSON: its comments all sit on lines of their own. Tests
 * run from the repo root. (A URL here would be the Workers runtime's, which
 * Node's readFileSync types don't accept.)
 */
function wranglerConfig(): WranglerConfig {
  const text = readFileSync("wrangler.jsonc", "utf8");
  return JSON.parse(text.replace(/^\s*\/\/.*$/gm, ""));
}

describe("wrangler.jsonc", () => {
  it("schedules exactly the crons worker/cron.ts answers", () => {
    expect(wranglerConfig().triggers.crons).toEqual([
      EVERY_FIVE_MINUTES,
      NIGHTLY,
    ]);
  });

  it("binds the KV namespace the five-minute cron reads its flag from", () => {
    expect(wranglerConfig().kv_namespaces.map((kv) => kv.binding)).toEqual([
      "FLAGS",
    ]);
  });

  it("runs production as production, at its own address", () => {
    const { vars } = wranglerConfig();
    // Without it, rate limits are off, and a missing Brevo key would print
    // sign-in codes to the log instead of failing.
    expect(vars?.ENVIRONMENT).toBe("production");
    expect(vars?.BETTER_AUTH_URL).toBe("https://pano.olbios88.workers.dev");
  });
});
