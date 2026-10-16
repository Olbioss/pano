const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The test run truncates tables. Refuse any database that isn't on this
 * machine, so a TEST_DATABASE_URL pasted from the wrong place can't wipe a
 * real one.
 */
export function assertLocalDatabaseUrl(url: string) {
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `TEST_DATABASE_URL points at ${host}, which is not a local database`
    );
  }
}
