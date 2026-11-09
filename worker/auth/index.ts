import { drizzleAdapter } from "better-auth/adapters/drizzle";
// The minimal build leaves out Kysely and its SQLite dialects: Pano reaches
// Postgres through Drizzle, and the Worker stays about 0.5 MB smaller.
import { betterAuth } from "better-auth/minimal";
import { emailOTP, organization } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { isDemoEmail } from "@/shared/demo";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/shared/password";
import { INVITATION_DAYS, PENDING_INVITATIONS, TEAM_SIZE } from "@/shared/team";
import type { Database } from "../db/client";
import * as schema from "../db/schema";
import { demoSignIn } from "../demo/sign-in";
import type { Bindings } from "../env";
import { cleanDisplayName } from "../lib/display-name";
import { localeFromHeaders } from "../lib/request-locale";
import type { CodeKind, CodeMailer } from "../mail/mailer";
import { authGuards } from "./guards";
import { hashPassword, verifyPassword } from "./password";

export type AuthDeps = {
  db: Database;
  env: Pick<Bindings, "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL" | "ENVIRONMENT">;
  mailer: CodeMailer;
  /**
   * Takes a code email's place in Pano's limits before Better Auth makes
   * the code; false refuses it.
   */
  claimCode?: (email: string) => Promise<boolean>;
  /** Whether a new password is on a leaked-password list (production). */
  checkBreach?: (password: string) => Promise<boolean>;
};

/**
 * Better Auth for one request. It's built per request because it needs the
 * request's own database client (a Worker can't share sockets across
 * requests); building it costs about 0.3 ms.
 *
 * People sign in with an email code or a password. A password account
 * confirms its address with a code before the password works. Passwords are
 * hashed with PBKDF2 (./password.ts): Better Auth's scrypt costs more CPU
 * than the Workers free plan gives a request.
 */
export function createAuth({
  db,
  env,
  mailer,
  claimCode,
  checkBreach,
}: AuthDeps) {
  const guards = authGuards({ db, claimCode, checkBreach });
  return betterAuth({
    appName: "Pano",
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL],
    database: drizzleAdapter(db, { provider: "pg", schema }),
    hooks: guards,
    emailAndPassword: {
      enabled: true,
      // Until its code is entered, a new account's password can't sign in.
      requireEmailVerification: true,
      minPasswordLength: PASSWORD_MIN,
      maxPasswordLength: PASSWORD_MAX,
      revokeSessionsOnPasswordReset: true,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    // Entering the confirmation code signs the person in.
    emailVerification: { autoSignInAfterVerification: true },
    // Routes Pano doesn't use. Confirmation codes are checked only through
    // /email-otp/verify-email, where Pano's guard sees the password.
    disabledPaths: [
      "/email-otp/check-verification-otp",
      "/forget-password/email-otp",
      "/email-otp/request-email-change",
      "/email-otp/change-email",
      "/send-verification-email",
      "/verify-email",
    ],
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
        "/sign-up/email": { window: 60, max: 3 },
        "/sign-in/email": { window: 60, max: 5 },
        "/email-otp/verify-email": { window: 60, max: 10 },
        "/email-otp/request-password-reset": { window: 60, max: 3 },
        "/email-otp/reset-password": { window: 60, max: 10 },
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
        // A password sign-up gets its confirmation code from here. So does
        // a sign-up with an address that already has an account: Better
        // Auth answers it like any other, and the code signs its owner in.
        sendVerificationOnSignUp: true,
        async sendVerificationOTP({ email, otp, type }, ctx) {
          // Demo addresses can't receive mail: nobody signs in to them.
          if (isDemoEmail(email)) return;
          const kind = await codeKind(db, type, email);
          if (!kind) return;
          await mailer.sendCode({
            to: email,
            code: otp,
            kind,
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

/**
 * Which email a code goes in. A confirmation code for an address that is
 * already confirmed came from a sign-up with an existing account's address.
 */
async function codeKind(
  db: Database,
  type: "sign-in" | "email-verification" | "forget-password" | "change-email",
  email: string
): Promise<CodeKind | null> {
  if (type === "sign-in") return "sign-in";
  if (type === "forget-password") return "reset";
  if (type !== "email-verification") return null;
  const [found] = await db
    .select({ confirmed: schema.user.emailVerified })
    .from(schema.user)
    .where(eq(schema.user.email, email.toLowerCase()))
    .limit(1);
  return found?.confirmed ? "existing-account" : "confirm";
}
