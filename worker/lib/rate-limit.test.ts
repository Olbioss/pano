import { afterAll, describe, expect, it } from "vitest";
import { user } from "../db/schema";
import { uniqueEmail } from "../test/app";
import { testDb } from "../test/db";
import { checkRateLimit } from "./rate-limit";

const { db, close } = testDb();
afterAll(() => close());

async function newUser() {
  const id = crypto.randomUUID();
  await db.insert(user).values({ id, name: "", email: uniqueEmail("limit") });
  return id;
}

const HOUR = 3600;
const attempt = (userId: string, bucket: string, limit: number, now: number) =>
  checkRateLimit(db, { userId, bucket, limit, windowSeconds: HOUR, now });

describe("checkRateLimit", () => {
  it("allows up to the limit within one window", async () => {
    const userId = await newUser();
    const results: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      results.push(await attempt(userId, "post", 2, 1_000));
    }
    expect(results).toEqual([true, true, false]);
  });

  it("starts again in the next window", async () => {
    const userId = await newUser();
    expect(await attempt(userId, "post", 1, 1_000)).toBe(true);
    expect(await attempt(userId, "post", 1, 2_000)).toBe(false);
    expect(await attempt(userId, "post", 1, HOUR * 1000 + 1_000)).toBe(true);
  });

  it("counts each bucket separately", async () => {
    const userId = await newUser();
    expect(await attempt(userId, "post", 1, 1_000)).toBe(true);
    expect(await attempt(userId, "vote", 1, 1_000)).toBe(true);
  });

  it("counts each person separately", async () => {
    const a = await newUser();
    const b = await newUser();
    expect(await attempt(a, "post", 1, 1_000)).toBe(true);
    expect(await attempt(b, "post", 1, 1_000)).toBe(true);
  });
});
