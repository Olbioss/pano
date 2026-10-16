import type { ExecutionContext } from "hono";
import type { Bindings } from "../env";

/**
 * Bindings and an ExecutionContext for running the app under Node. `settle`
 * awaits what the app handed to waitUntil (closing its database client), so
 * no test leaves a connection open.
 */
export function testEnv(connectionString = process.env.TEST_DATABASE_URL) {
  if (!connectionString)
    throw new Error("TEST_DATABASE_URL is not set (see .env.example)");

  const pending: Promise<unknown>[] = [];
  const ctx: ExecutionContext = {
    waitUntil: (promise) => {
      pending.push(promise);
    },
    passThroughOnException: () => {},
    props: {},
  };
  const env: Bindings = { HYPERDRIVE: { connectionString } };
  return { env, ctx, settle: () => Promise.allSettled(pending) };
}
