// Read only by the Better Auth CLI (`bun run auth:generate`) to learn which
// plugins are on, so it can write worker/db/schema/auth.ts. The app never
// imports this file.
import { drizzle } from "drizzle-orm/postgres-js";
import { createAuth } from "./worker/auth";
import type { Database } from "./worker/db/client";
import { consoleMailer } from "./worker/mail/mailer";

export const auth = createAuth({
  db: drizzle.mock() as unknown as Database,
  env: {
    BETTER_AUTH_SECRET: "schema-generation-only-not-a-real-secret",
    BETTER_AUTH_URL: "http://localhost:5173",
  },
  mailer: consoleMailer,
});
