import { and, eq, exists, isNotNull, lt } from "drizzle-orm";
import type { Database } from "../db/client";
import { account, user } from "../db/schema";

/** How long a password sign-up may wait for its code before it's removed. */
export const UNCONFIRMED_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes password sign-ups whose address was never confirmed, once they're
 * UNCONFIRMED_DAYS old; the nightly cron calls it. They can't sign in, so
 * they own nothing. Only accounts with a password qualify: email-code,
 * GitHub and demo accounts are confirmed when they're made, and an older
 * account somehow left unconfirmed is never touched. Returns how many went.
 */
export async function deleteStaleSignUps(db: Database, now = new Date()) {
  const deleted = await db
    .delete(user)
    .where(
      and(
        eq(user.emailVerified, false),
        lt(user.createdAt, new Date(now.getTime() - UNCONFIRMED_DAYS * DAY_MS)),
        exists(
          db
            .select({ id: account.id })
            .from(account)
            .where(
              and(
                eq(account.userId, user.id),
                eq(account.providerId, "credential"),
                isNotNull(account.password)
              )
            )
        )
      )
    )
    .returning({ id: user.id });
  return deleted.length;
}
