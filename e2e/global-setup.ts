import { execFileSync } from "node:child_process";

/**
 * A local run starts from the schema production has and a freshly reset
 * demo, the way the nightly cron leaves it. Both commands read DATABASE_URL.
 */
export default function globalSetup() {
  execFileSync("bun", ["run", "db:migrate"], { stdio: "inherit" });
  execFileSync("bun", ["run", "seed"], { stdio: "inherit" });
}
