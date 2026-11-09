import type { Auth } from "./auth";
import type { Database } from "./db/client";
import type { AppMailer } from "./mail/mailer";

/**
 * Bindings are typed structurally, not with the generated Workers types. That
 * way the app also typechecks inside the browser project, which imports
 * AppType, and runs under Node in tests. worker/index.ts checks them against
 * the generated Env.
 */
export type Bindings = {
  HYPERDRIVE: { connectionString: string };
  /** A Workers KV namespace for flags the crons read without waking the database. */
  FLAGS: Flags;
  /** Signs session cookies: `openssl rand -base64 32`. A Worker secret in production. */
  BETTER_AUTH_SECRET: string;
  /** The app's own origin, e.g. http://localhost:5173. Better Auth trusts requests from it. */
  BETTER_AUTH_URL: string;
  /** "production" on Cloudflare: turns on rate limits and requires Brevo. */
  ENVIRONMENT?: string;
  BREVO_API_KEY?: string;
  /** The sender address Brevo has verified. */
  MAIL_FROM?: string;
  /** GitHub sign-in, from a GitHub OAuth app; without both it's off. */
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
};

/** The part of a KV namespace Pano uses. */
export type Flags = {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    /** `expirationTtl` in seconds from now; `expiration` in Unix seconds. */
    options?: { expirationTtl?: number; expiration?: number }
  ): Promise<void>;
  delete(key: string): Promise<void>;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: {
    db: Database;
    /** Better Auth for this request, built the first time it's asked for. */
    auth: () => Auth;
    /** Sign-in codes and invitations go out through this. */
    mailer: AppMailer;
    /**
     * This request's sign-in code email: `failed` when sending it failed,
     * `refused` when a limit kept it from being sent.
     */
    mail: { failed: boolean; refused?: "CODE_LIMIT" | "EMAIL_BUDGET" };
  };
};
