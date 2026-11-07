import { execFileSync } from "node:child_process";

/**
 * A local run starts from the schema production has, a freshly reset demo
 * the way the nightly cron leaves it, and Pano's own board at /pano, as on
 * the live site. Both commands read DATABASE_URL.
 */
export default function globalSetup() {
  execFileSync("bun", ["run", "db:migrate"], { stdio: "inherit" });
  execFileSync("bun", ["run", "seed"], {
    stdio: "inherit",
    env: {
      ...process.env,
      PANO_OWNER_EMAIL: process.env.PANO_OWNER_EMAIL ?? "owner@pano.test",
    },
  });
}
