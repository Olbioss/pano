import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
// The minimal build leaves out Kysely and its SQLite dialects: Pano reaches
// Postgres through Drizzle, and the Worker stays about 0.5 MB smaller.
import { betterAuth } from "better-auth/minimal";
import { emailOTP, organization } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { isDemoEmail } from "@/shared/demo";
import { INVITATION_DAYS, PENDING_INVITATIONS, TEAM_SIZE } from "@/shared/team";
import type { Database } from "../db/client";
import * as schema from "../db/schema";
import { demoSignIn } from "../demo/sign-in";
import type { Bindings } from "../env";
import { cleanDisplayName } from "../lib/display-name";
import { localeFromHeaders } from "../lib/request-locale";
import type { CodeMailer } from "../mail/mailer";

export type AuthDeps = {
  db: Database;
  env: Pick<Bindings, "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL" | "ENVIRONMENT">;
  mailer: CodeMailer;
  /**
   * Takes a sign-in code's place in Pano's limits before Better Auth makes
   * the code; false refuses it.
   */
  claimCode?: (email: string) => Promise<boolean>;
};

/**
 * Better Auth for one request. It's built per request because it needs the
 * request's own database client (a Worker can't share sockets across
 * requests); building it costs about 0.3 ms.
 *
 * Sign-in is email codes only. Password hashing doesn't fit the Workers free
 * plan's 10 ms of CPU per request; a code is cheap to create and check.
 */
export function createAuth({ db, env, mailer, claimCode }: AuthDeps) {
  return betterAuth({
    appName: "Pano",
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL],
    database: drizzleAdapter(db, { provider: "pg", schema }),
    hooks: {
      // A code takes its place in Pano's limits before Better Auth stores
      // it, so a refused request leaves the last code sent working. Better
      // Auth's per-IP limit has already run by then.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/email-otp/send-verification-otp" || !claimCode) {
          return;
        }
        const { email, type } = (ctx.body ?? {}) as {
          email?: unknown;
          type?: unknown;
        };
        // Better Auth refuses a bad address, and mails no code for the rest.
        if (
          typeof email !== "string" ||
          type !== "sign-in" ||
          isDemoEmail(email) ||
          !z.email().safeParse(email).success
        ) {
          return;
        }
        if (!(await claimCode(email))) throw new APIError("TOO_MANY_REQUESTS");
      }),
    },
    databaseHooks: {
      user: {
        create: {
          // Sign-in may carry a name for a new account. Keep it only if it's
          // a usable name; otherwise start empty, and the submit form asks.
          // (Phase 1 used the email's local part, which leaked it publicly.)
          async before(user) {
            return { data: { ...user, name: cleanDisplayName(user.name) } };
          },
        },
        update: {
          async before(user) {
            if (user.name === undefined) return;
            return { data: { ...user, name: cleanDisplayName(user.name) } };
          },
        },
      },
    },
    session: {
      // A signed copy of the session in a cookie keeps most requests off the
      // database, and off the Hyperdrive query budget, for five minutes.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    rateLimit: {
      enabled: env.ENVIRONMENT === "production",
      // Per-isolate memory would multiply the limits across Workers; the
      // database is the one place a shared counter can live.
      storage: "database",
      customRules: {
        "/email-otp/send-verification-otp": { window: 60, max: 3 },
        "/sign-in/email-otp": { window: 60, max: 10 },
        // Each demo sign-in makes an account, until the nightly reset.
        "/demo/sign-in": { window: 60, max: 5 },
      },
    },
    advanced: {
      // Cloudflare puts the client's address in this header.
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    plugins: [
      emailOTP({
        storeOTP: "hashed",
        async sendVerificationOTP({ email, otp, type }, ctx) {
          // Demo addresses can't receive mail: nobody signs in to them.
          if (type !== "sign-in" || isDemoEmail(email)) return;
          await mailer.sendSignInCode({
            to: email,
            code: otp,
            locale: localeFromHeaders(new Headers(ctx?.headers)),
          });
        },
      }),
      organization({
        // One workspace per account counts only the ones it owns, so being
        // on another team never stops anyone from making their own (#8).
        // The unique index on owner memberships settles two creates at the
        // same moment (#7).
        organizationLimit: async (user) => {
          const [owned] = await db
            .select({ id: schema.member.id })
            .from(schema.member)
            .where(
              and(
                eq(schema.member.userId, user.id),
                eq(schema.member.role, "owner")
              )
            )
            .limit(1);
          return owned !== undefined;
        },
        // Pano's routes check these first and say why; Better Auth's own
        // checks back them up. Pano sends the invitation emails itself.
        invitationExpiresIn: INVITATION_DAYS * 24 * 60 * 60,
        invitationLimit: PENDING_INVITATIONS,
        membershipLimit: TEAM_SIZE,
      }),
      demoSignIn({ db }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
