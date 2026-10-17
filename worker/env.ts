import type { Auth } from "./auth";
import type { Database } from "./db/client";

/**
 * Bindings are typed structurally, not with the generated Workers types. That
 * way the app also typechecks inside the browser project, which imports
 * AppType, and runs under Node in tests. worker/index.ts checks them against
 * the generated Env.
 */
export type Bindings = {
  HYPERDRIVE: { connectionString: string };
  /** Signs session cookies: `openssl rand -base64 32`. A Worker secret in production. */
  BETTER_AUTH_SECRET: string;
  /** The app's own origin, e.g. http://localhost:5173. Better Auth trusts requests from it. */
  BETTER_AUTH_URL: string;
  /** "production" on Cloudflare: turns on rate limits and requires Brevo. */
  ENVIRONMENT?: string;
  BREVO_API_KEY?: string;
  /** The sender address Brevo has verified. */
  MAIL_FROM?: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: {
    db: Database;
    auth: Auth;
    /** Set when this request's sign-in code email failed to send. */
    mail: { failed: boolean };
  };
};
