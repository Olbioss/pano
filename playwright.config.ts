import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { assertLocalDatabaseUrl } from "./worker/test/local-db";

// Playwright doesn't read .env, and `bun run` doesn't pass it on. Variables
// already set, as CI sets them, win over the file's.
if (existsSync(".env")) process.loadEnvFile(".env");

/**
 * The end-to-end suite: the production build, driven by Chromium.
 *
 * By default it builds the app and serves it with `vite preview`, so the
 * Worker runs in workerd as it does on Cloudflare, against the database in
 * DATABASE_URL; e2e/global-setup.ts resets the demo there first. With
 * E2E_BASE_URL set it runs against that site as it is, such as the live
 * demo, and the tests clean up what they make.
 */
const live = process.env.E2E_BASE_URL;
// The origin .dev.vars names as BETTER_AUTH_URL, which Better Auth trusts.
const LOCAL = "http://localhost:5173";

/** The local database the preview and the reset share. */
function localDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
  // The setup resets the demo there, and the tests write to it.
  assertLocalDatabaseUrl(url);
  // Miniflare refuses a Hyperdrive connection string without a password.
  const withPassword = new URL(url);
  if (!withPassword.password) withPassword.password = "local";
  return withPassword.toString();
}

export default defineConfig({
  testDir: "e2e",
  // Every test shares the one demo workspace, so they run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],
  globalSetup: live ? undefined : "./e2e/global-setup.ts",
  use: {
    baseURL: live ?? LOCAL,
    locale: "en-US",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: live
    ? undefined
    : {
        command: "bun run build && bunx vite preview --port 5173 --strictPort",
        url: `${LOCAL}/api/health`,
        // A dev server already on the port fails the run instead of being
        // tested: it isn't the production build.
        reuseExistingServer: false,
        timeout: 180_000,
        env: {
          CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
            localDatabase(),
        },
      },
});
