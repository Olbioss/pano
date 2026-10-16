import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP, organization } from "better-auth/plugins";
import type { Database } from "./db/client";
import * as schema from "./db/schema";
import type { Bindings } from "./env";
import { localeFromHeaders } from "./lib/request-locale";
import type { Mailer } from "./mail/mailer";

export type AuthDeps = { db: Database; env: Bindings; mailer: Mailer };

/**
 * Better Auth for one request. It's built per request because it needs the
 * request's own database client (a Worker can't share sockets across
 * requests); building it costs about 0.3 ms.
 *
 * Sign-in is email codes only. Password hashing doesn't fit the Workers free
 * plan's 10 ms of CPU per request; a code is cheap to create and check.
 */
export function createAuth({ db, env, mailer }: AuthDeps) {
  return betterAuth({
    appName: "Pano",
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL],
    database: drizzleAdapter(db, { provider: "pg", schema }),
    databaseHooks: {
      user: {
        create: {
          // Code sign-in creates accounts with an empty name. Posts and
          // comments need something to show, so start from the email.
          async before(user) {
            const local = user.email.split("@")[0] ?? user.email;
            return { data: { ...user, name: user.name || local } };
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
          if (type !== "sign-in") return;
          await mailer.sendSignInCode({
            to: email,
            code: otp,
            locale: localeFromHeaders(new Headers(ctx?.headers)),
          });
        },
      }),
      organization({ organizationLimit: 1 }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
