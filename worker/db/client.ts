import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * One small client per request. Hyperdrive pools the real connections to
 * Postgres, and a Worker can't reuse a socket across requests anyway.
 * fetch_types skips a startup round trip for custom array types we don't use.
 */
export function createDb(connectionString: string) {
  const client = postgres(connectionString, { max: 5, fetch_types: false });
  return {
    db: drizzle({ client, schema }),
    close: () => client.end({ timeout: 5 }),
  };
}

export type Database = ReturnType<typeof createDb>["db"];
