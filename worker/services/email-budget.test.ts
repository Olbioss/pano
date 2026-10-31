import { eq, like } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { emailCounters } from "../db/schema";
import { testDb } from "../test/db";
import {
  addressKey,
  CODES_PER_ADDRESS,
  claimCodeForAddress,
  claimDailyEmail,
  DAILY_EMAILS,
  NOTICE_EMAILS,
  nextUtcMidnight,
  pruneEmailCounters,
} from "./email-budget";

const { db, close } = testDb();
afterAll(() => close());

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Noon on a UTC day of its own for each test, ten days from the last one,
 * so no test's windows (or the day before them) touch another's.
 */
let nextDay = 0;
const freshDay = () =>
  new Date(Date.UTC(2100, 0, 1) + (nextDay++ * 10 * DAY_MS + DAY_MS / 2));

async function claims(kind: "code" | "notice", times: number, now: Date) {
  const results = await Promise.all(
    Array.from({ length: times }, () => claimDailyEmail(db, kind, now))
  );
  return results.filter(Boolean).length;
}

describe("claimDailyEmail", () => {
  it("never takes more than the limit, even all at once", async () => {
    const now = freshDay();
    expect(await claims("notice", NOTICE_EMAILS + 30, now)).toBe(NOTICE_EMAILS);
  });

  it("keeps the last 100 of the day for sign-in codes", async () => {
    const now = freshDay();
    expect(await claims("notice", NOTICE_EMAILS, now)).toBe(NOTICE_EMAILS);
    expect(await claimDailyEmail(db, "notice", now)).toBe(false);
    expect(await claims("code", DAILY_EMAILS, now)).toBe(
      DAILY_EMAILS - NOTICE_EMAILS
    );
    expect(await claimDailyEmail(db, "code", now)).toBe(false);
  });

  it("starts again at the next UTC midnight", async () => {
    const now = freshDay();
    expect(await claims("code", DAILY_EMAILS, now)).toBe(DAILY_EMAILS);
    expect(await claimDailyEmail(db, "code", now)).toBe(false);
    expect(await claimDailyEmail(db, "code", nextUtcMidnight(now))).toBe(true);
  });
});

describe("claimCodeForAddress", () => {
  it("allows three codes per address in ten minutes", async () => {
    const now = freshDay();
    const results: boolean[] = [];
    for (let i = 0; i <= CODES_PER_ADDRESS; i++) {
      results.push(await claimCodeForAddress(db, "ada@example.com", now));
    }
    expect(results).toEqual([true, true, true, false]);
    // The same address however it's typed; another address counts apart.
    expect(await claimCodeForAddress(db, " Ada@Example.com ", now)).toBe(false);
    expect(await claimCodeForAddress(db, "bob@example.com", now)).toBe(true);
    // Ten minutes later it starts again.
    const later = new Date(now.getTime() + 10 * 60_000);
    expect(await claimCodeForAddress(db, "ada@example.com", later)).toBe(true);
  });

  it("stores a hash, never the address", async () => {
    const now = freshDay();
    await claimCodeForAddress(db, "carol@example.com", now);
    const key = await addressKey("carol@example.com");
    expect(key).toMatch(/^code:[0-9a-f]{64}$/);
    const stored = await db
      .select({ key: emailCounters.key })
      .from(emailCounters)
      .where(like(emailCounters.key, "%carol%"));
    expect(stored).toEqual([]);
  });
});

describe("pruneEmailCounters", () => {
  it("drops windows more than a day before today's", async () => {
    const now = freshDay();
    const old = new Date(now.getTime() - 3 * DAY_MS);
    const yesterday = new Date(now.getTime() - DAY_MS);
    await claimDailyEmail(db, "code", old);
    await claimDailyEmail(db, "code", yesterday);
    await pruneEmailCounters(db, now);
    const left = await db
      .select({ start: emailCounters.windowStart })
      .from(emailCounters)
      .where(eq(emailCounters.key, "daily"));
    const starts = left.map((row) => row.start.getTime());
    expect(starts).not.toContain(
      Date.UTC(old.getUTCFullYear(), old.getUTCMonth(), old.getUTCDate())
    );
    expect(starts).toContain(
      Date.UTC(
        yesterday.getUTCFullYear(),
        yesterday.getUTCMonth(),
        yesterday.getUTCDate()
      )
    );
  });
});
