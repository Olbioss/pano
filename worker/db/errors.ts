/** Postgres error codes the app reacts to by name rather than by message. */
export const UNIQUE_VIOLATION = "23505";

const SQLSTATE = /^[0-9A-Z]{5}$/;

/**
 * The Postgres error code on an error or anywhere down its `cause` chain:
 * postgres.js puts it on its own error, Drizzle wraps that in a
 * DrizzleQueryError, and Better Auth may wrap it again.
 */
export function pgErrorCode(err: unknown): string | undefined {
  let current = err;
  for (let depth = 0; depth < 5; depth++) {
    if (typeof current !== "object" || current === null) return undefined;
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && SQLSTATE.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}
