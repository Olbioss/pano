import { createDb } from "../db/client";
import { assertLocalDatabaseUrl } from "./local-db";

/** A direct client on the test database, for setting up and checking rows. */
export function testDb() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  assertLocalDatabaseUrl(url);
  return createDb(url);
}
