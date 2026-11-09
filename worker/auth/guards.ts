import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { isDemoEmail } from "@/shared/demo";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/shared/password";
import type { Database } from "../db/client";
import { account, user } from "../db/schema";
import {
  noteWrongPassword,
  passwordPaused,
} from "../services/password-attempts";
import { hashPassword, verifyPassword } from "./password";

export type GuardDeps = {
  db: Database;
  /**
   * Takes a code email's place in Pano's limits before Better Auth makes
   * the code; false refuses it.
   */
  claimCode?: (email: string) => Promise<boolean>;
  /** Whether a new password is on a leaked-password list. */
  checkBreach?: (password: string) => Promise<boolean>;
};

/**
 * Pano's rules around Better Auth's own routes, as one before hook and one
 * after hook. Better Auth is built per request, so the state the two share
 * belongs to one request.
 *
 * - Every code email takes its place in the limits before it's made.
 * - Sign-up refuses demo addresses and leaked passwords, and replaces an
 *   earlier sign-up of the same address that was never confirmed.
 * - Confirming keeps a sign-up's password only when the password comes with
 *   the code (see beforeConfirm).
 * - Every new password (sign-up, reset, change) is checked for leaks, and
 *   changing a password signs out the account's other devices.
 * - Ten wrong passwords for an address in an hour pause password sign-in
 *   for it until the hour ends.
 */
export function authGuards({ db, claimCode, checkBreach }: GuardDeps) {
  /** The unconfirmed sign-up this request confirms, if it is a confirmation. */
  let confirming: { userId: string; hash: string; keep: boolean } | null = null;

  async function claim(email: string) {
    if (claimCode && !(await claimCode(email))) {
      throw new APIError("TOO_MANY_REQUESTS");
    }
  }

  async function refuseBreached(password: string) {
    if (checkBreach && (await checkBreach(password))) {
      throw new APIError("BAD_REQUEST", {
        code: "PASSWORD_COMPROMISED",
        message: "This password appears in a data breach",
      });
    }
  }

  /** Sign in with a code. Codes of other kinds come from their own flows. */
  async function beforeSignInCode(body: unknown) {
    const { email, type } = (body ?? {}) as { email?: unknown; type?: unknown };
    if (type !== "sign-in") {
      throw new APIError("BAD_REQUEST", { message: "Only sign-in codes" });
    }
    // Better Auth refuses a bad address; demo addresses get no email.
    if (typeof email !== "string" || isDemoEmail(email)) return;
    if (!z.email().safeParse(email).success) return;
    await claim(email);
  }

  /** Forgot password: the reset code is a code email like any other. */
  async function beforeResetCode(body: unknown) {
    const { email } = (body ?? {}) as { email?: unknown };
    if (typeof email !== "string" || isDemoEmail(email)) return;
    if (!z.email().safeParse(email).success) return;
    await claim(email);
  }

  /** A reset's or a change's new password, checked like a sign-up's. */
  async function beforeNewPassword(
    body: unknown,
    field: "password" | "newPassword"
  ) {
    const parsed = newPassword.safeParse(
      (body as Record<string, unknown> | undefined)?.[field]
    );
    if (parsed.success) await refuseBreached(parsed.data);
  }

  async function beforePasswordSignIn(body: unknown) {
    const { email } = (body ?? {}) as { email?: unknown };
    if (typeof email !== "string") return;
    if (await passwordPaused(db, email)) {
      throw new APIError("TOO_MANY_REQUESTS", {
        code: "PASSWORD_PAUSED",
        message:
          "Too many wrong passwords for this address. Sign in with an email code.",
      });
    }
  }

  async function beforeSignUp(body: unknown) {
    const parsed = signUpBody.safeParse(body);
    // Better Auth answers anything malformed in its own words.
    if (!parsed.success) return;
    const email = parsed.data.email.toLowerCase();
    if (isDemoEmail(email)) {
      throw new APIError("FORBIDDEN", {
        code: "DEMO_ONLY",
        message: "Demo addresses can't sign up",
      });
    }
    await refuseBreached(parsed.data.password);
    await claim(email);
    await deleteUnconfirmed(db, email);
  }

  /**
   * The code alone proves the address; the password typed at sign-up has to
   * come with it. Someone who signs up with another person's address knows
   * the password but never sees the code, and the address's owner sees the
   * code but not their password. Every confirmation runs one password check,
   * so how long it takes doesn't say whether a sign-up is waiting.
   */
  async function beforeConfirm(body: unknown) {
    const { email, password } = (body ?? {}) as {
      email?: unknown;
      password?: unknown;
    };
    if (typeof email !== "string") return;
    const pending = await findUnconfirmed(db, email.toLowerCase());
    const matches = await verifyPassword({
      hash: pending?.hash ?? (await dummyHash()),
      password: typeof password === "string" ? password : "",
    });
    confirming = pending ? { ...pending, keep: matches } : null;
  }

  /**
   * After a confirmation, an account keeps its password only if it's the one
   * checked before and it matched. A sign-up that replaced it in between, or
   * a code that came without the password, leaves the account confirmed and
   * signed in but with no password.
   */
  async function afterConfirm(email: string) {
    if (!confirming) return;
    const now = await findCredential(db, email);
    const kept =
      confirming.keep &&
      now?.userId === confirming.userId &&
      now.hash === confirming.hash;
    if (now && !kept) await dropPassword(db, now.userId);
  }

  return {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/email-otp/send-verification-otp") {
        await beforeSignInCode(ctx.body);
      } else if (ctx.path === "/sign-up/email") {
        await beforeSignUp(ctx.body);
      } else if (ctx.path === "/email-otp/verify-email") {
        await beforeConfirm(ctx.body);
      } else if (ctx.path === "/email-otp/request-password-reset") {
        await beforeResetCode(ctx.body);
      } else if (ctx.path === "/email-otp/reset-password") {
        await beforeNewPassword(ctx.body, "password");
      } else if (ctx.path === "/change-password") {
        await refuseDemo(await getSessionFromCtx(ctx));
        await beforeNewPassword(ctx.body, "newPassword");
        // A changed password signs out every other device, whatever the
        // request asked for.
        return {
          context: { body: { ...(ctx.body ?? {}), revokeOtherSessions: true } },
        };
      } else if (ctx.path === "/sign-in/email") {
        await beforePasswordSignIn(ctx.body);
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      const returned = ctx.context.returned;
      if (
        ctx.path === "/sign-in/email" &&
        returned instanceof APIError &&
        returned.body?.code === "INVALID_EMAIL_OR_PASSWORD"
      ) {
        const { email } = ctx.body as { email: string };
        await noteWrongPassword(db, email);
      }
      if (
        ctx.path === "/email-otp/verify-email" &&
        !(ctx.context.returned instanceof Error)
      ) {
        const { email } = ctx.body as { email: string };
        await afterConfirm(email.toLowerCase());
      }
    }),
  };
}

/** Demo accounts can't add or change a way to sign in. */
async function refuseDemo(session: { user: { email: string } } | null) {
  if (session && isDemoEmail(session.user.email)) {
    throw new APIError("FORBIDDEN", {
      code: "DEMO_ONLY",
      message: "Demo accounts can't add a way to sign in",
    });
  }
}

const newPassword = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);
const signUpBody = z.object({ email: z.email(), password: newPassword });

let dummy: Promise<string> | undefined;
/** A hash no password matches, to check against when nothing is waiting. */
function dummyHash() {
  dummy ??= hashPassword(crypto.randomUUID());
  return dummy;
}

/** A password account whose address was never confirmed. */
async function findUnconfirmed(db: Database, email: string) {
  const [row] = await db
    .select({ userId: user.id, hash: account.password })
    .from(user)
    .innerJoin(
      account,
      and(eq(account.userId, user.id), eq(account.providerId, "credential"))
    )
    .where(and(eq(user.email, email), eq(user.emailVerified, false)))
    .limit(1);
  return row?.hash ? { userId: row.userId, hash: row.hash } : null;
}

async function findCredential(db: Database, email: string) {
  const [row] = await db
    .select({ userId: user.id, hash: account.password })
    .from(user)
    .innerJoin(
      account,
      and(eq(account.userId, user.id), eq(account.providerId, "credential"))
    )
    .where(eq(user.email, email))
    .limit(1);
  return row ? { userId: row.userId, hash: row.hash } : null;
}

/**
 * An unconfirmed sign-up can't sign in, so it owns nothing; deleting it lets
 * the new sign-up start fresh. Only accounts with a password qualify, so an
 * older account somehow left unconfirmed is never touched.
 */
async function deleteUnconfirmed(db: Database, email: string) {
  const pending = await findUnconfirmed(db, email);
  if (pending) await db.delete(user).where(eq(user.id, pending.userId));
}

async function dropPassword(db: Database, userId: string) {
  await db
    .delete(account)
    .where(
      and(eq(account.userId, userId), eq(account.providerId, "credential"))
    );
}
