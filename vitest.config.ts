import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      "@/shared": fileURLToPath(new URL("./shared", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Every variable from .env and the process, so TEST_DATABASE_URL reaches
    // the tests however they're started (bun run, bunx, the editor, CI).
    env: loadEnv(mode, process.cwd(), ""),
    environment: "node",
    include: [
      "worker/**/*.test.ts",
      "shared/**/*.test.ts",
      "src/**/*.test.{ts,tsx}",
    ],
    globalSetup: ["./test/global-setup.ts"],
    // The integration tests share one Postgres. Running files in parallel
    // makes them contend for it and fail intermittently.
    fileParallelism: false,
  },
}));
