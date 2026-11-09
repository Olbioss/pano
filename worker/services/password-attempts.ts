import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { emailCounters } from "../db/schema";
import { addressKey } from "./email-budget";

/**
 * Wrong passwords one address can have in a UTC hour before password
 * sign-in pauses for it. Email codes still work, so a stranger guessing
 * can't lock the owner out.
 */
export const WRONG_PASSWORDS_PER_HOUR = 10;

const HOUR_MS = 60 * 60 * 1000;

function hourOf(now: Date) {
  return new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);
}

/**
 * Whether password sign-in is paused for the address this hour. Counted by
 * the address's hash, whether or not it has an account, so a pause says
 * nothing about who signed up.
 */
export async function passwordPaused(
  db: Database,
  email: string,
  now = new Date()
): Promise<boolean> {
  const [row] = await db
    .select({ count: emailCounters.count })
    .from(emailCounters)
    .where(
      and(
        eq(emailCounters.key, await addressKey(email, "password")),
        eq(emailCounters.windowStart, hourOf(now))
      )
    )
    .limit(1);
  return (row?.count ?? 0) >= WRONG_PASSWORDS_PER_HOUR;
}

/** Counts a wrong password for the address. */
export async function noteWrongPassword(
  db: Database,
  email: string,
  now = new Date()
) {
  await db
    .insert(emailCounters)
    .values({
      key: await addressKey(email, "password"),
      windowStart: hourOf(now),
      count: 1,
    })
    .onConflictDoUpdate({
      target: [emailCounters.key, emailCounters.windowStart],
      set: { count: sql`${emailCounters.count} + 1` },
    });
}
