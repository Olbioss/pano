import type { Database } from "./db/client";

/**
 * Bindings are typed structurally, not with the generated Workers types. That
 * way the app also typechecks inside the browser project, which imports
 * AppType, and runs under Node in tests.
 */
export type Bindings = {
  HYPERDRIVE: { connectionString: string };
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: { db: Database };
};
