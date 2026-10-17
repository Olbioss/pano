import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DbOptions = {
  /**
   * How long to wait for the server to accept the connection and log in.
   * postgres.js waits 30 s by default, which left the page spinning for a
   * minute when the database host stopped answering.
   */
  connectTimeoutSeconds?: number;
};

/**
 * One small client per request. Hyperdrive pools the real connections to
 * Postgres, and a Worker can't reuse a socket across requests anyway.
 * fetch_types skips a startup round trip for custom array types we don't use.
 */
export function createDb(
  connectionString: string,
  { connectTimeoutSeconds = 10 }: DbOptions = {}
) {
  const client = postgres(connectionString, {
    max: 5,
    fetch_types: false,
    connect_timeout: connectTimeoutSeconds,
    // Notices aren't errors (a search for "the" sends one), and postgres.js
    // would print every one of them with console.log.
    onnotice: () => {},
  });
  return {
    db: drizzle({ client, schema }),
    close: () => client.end({ timeout: 5 }),
  };
}

export type Database = ReturnType<typeof createDb>["db"];
