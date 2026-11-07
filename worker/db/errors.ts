/** Postgres error codes the app reacts to by name rather than by message. */
export const UNIQUE_VIOLATION = "23505";
/** A query named a table that doesn't exist, such as before the migrations. */
export const UNDEFINED_TABLE = "42P01";

/** The unique index that lets an account own one workspace (migration 0012). */
export const ONE_OWNED_WORKSPACE = "member_one_owned_workspace_idx";

const SQLSTATE = /^[0-9A-Z]{5}$/;

/**
 * The first value `read` finds on an error or down its `cause` chain:
 * postgres.js puts Postgres's fields on its own error, Drizzle wraps that in
 * a DrizzleQueryError, and Better Auth may wrap it again.
 */
function findInChain(
  err: unknown,
  read: (error: object) => string | undefined
): string | undefined {
  let current = err;
  for (let depth = 0; depth < 5; depth++) {
    if (typeof current !== "object" || current === null) return undefined;
    const found = read(current);
    if (found !== undefined) return found;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** The Postgres error code on an error or anywhere down its `cause` chain. */
export function pgErrorCode(err: unknown): string | undefined {
  return findInChain(err, (error) => {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" && SQLSTATE.test(code) ? code : undefined;
  });
}

/** The name of the constraint or index a Postgres error is about. */
export function pgConstraint(err: unknown): string | undefined {
  return findInChain(err, (error) => {
    const name = (error as { constraint_name?: unknown }).constraint_name;
    return typeof name === "string" ? name : undefined;
  });
}
