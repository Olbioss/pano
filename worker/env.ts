import type { Database } from "./db/client";

/**
 * Bindings are typed structurally, not with the generated Workers types. That
 * way the app also typechecks inside the browser project, which imports
 * AppType, and runs under Node in tests.
 */
export type Bindings = {
  HYPERDRIVE: { connectionString: string };
  /** "production" on Cloudflare: turns on rate limits and requires Brevo. */
  ENVIRONMENT?: string;
  BREVO_API_KEY?: string;
  /** The sender address Brevo has verified. */
  MAIL_FROM?: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: { db: Database };
};
