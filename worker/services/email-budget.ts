import { lt, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { emailCounters } from "../db/schema";

/** Brevo's free plan sends 300 emails a day. */
export const DAILY_EMAILS = 300;

/**
 * Invitations and Shipped emails stop at this many a day, so at least 100
 * are always left for sign-in codes.
 */
export const NOTICE_EMAILS = 200;

/** Sign-in codes one address can get in ten minutes. */
export const CODES_PER_ADDRESS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;
const CODE_WINDOW_MS = 10 * 60 * 1000;

/** `code` is a sign-in code; `notice` an invitation or a Shipped email. */
export type EmailKind = "code" | "notice";

/** The start of `now`'s UTC day. */
export function utcDay(now: Date): Date {
  return new Date(Math.floor(now.getTime() / DAY_MS) * DAY_MS);
}

/** The next UTC midnight after `now`. */
export function nextUtcMidnight(now: Date): Date {
  return new Date(utcDay(now).getTime() + DAY_MS);
}

/**
 * Takes one of today's emails for `kind`, or answers false when that kind's
 * share of the day is spent. One statement: emails sent at the same moment
 * can't take more than the limit between them.
 */
export function claimDailyEmail(
  db: Database,
  kind: EmailKind,
  now = new Date()
): Promise<boolean> {
  const limit = kind === "code" ? DAILY_EMAILS : NOTICE_EMAILS;
  return claim(db, "daily", utcDay(now), limit);
}

/** Takes one of the address's sign-in codes for these ten minutes. */
export async function claimCodeForAddress(
  db: Database,
  email: string,
  now = new Date()
): Promise<boolean> {
  const windowStart = new Date(
    Math.floor(now.getTime() / CODE_WINDOW_MS) * CODE_WINDOW_MS
  );
  return claim(db, await addressKey(email), windowStart, CODES_PER_ADDRESS);
}

/** The counter key for an address: a hash, never the address itself. */
export async function addressKey(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return `code:${Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Drops windows older than two days; the nightly cron calls it. */
export async function pruneEmailCounters(db: Database, now = new Date()) {
  await db
    .delete(emailCounters)
    .where(
      lt(emailCounters.windowStart, new Date(utcDay(now).getTime() - DAY_MS))
    );
}

/**
 * Counts one more email in the window unless it already holds `limit`. If
 * the counter itself fails, the email goes out rather than sign-in going
 * down, the way the rate limiter fails.
 */
async function claim(
  db: Database,
  key: string,
  windowStart: Date,
  limit: number
): Promise<boolean> {
  try {
    const rows = await db
      .insert(emailCounters)
      .values({ key, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [emailCounters.key, emailCounters.windowStart],
        set: { count: sql`${emailCounters.count} + 1` },
        setWhere: lt(emailCounters.count, limit),
      })
      .returning({ count: emailCounters.count });
    return rows.length > 0;
  } catch (err) {
    console.error("email counter failed, sending anyway:", err);
    return true;
  }
}
