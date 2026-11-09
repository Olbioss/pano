import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { user } from "../db/schema";
import { testApp, uniqueEmail } from "../test/app";
import { testDb } from "../test/db";
import { deleteStaleSignUps, UNCONFIRMED_DAYS } from "./unconfirmed";

const { db, close } = testDb();
afterAll(() => close());

const DAY_MS = 24 * 60 * 60 * 1000;

/** Makes the account look `days` old. */
async function age(email: string, days: number) {
  await db
    .update(user)
    .set({ createdAt: new Date(Date.now() - days * DAY_MS) })
    .where(eq(user.email, email));
}

const exists = async (email: string) =>
  (await db.select().from(user).where(eq(user.email, email))).length > 0;

describe("deleteStaleSignUps", () => {
  it(`deletes a sign-up left unconfirmed for ${UNCONFIRMED_DAYS} days, and not one day sooner`, async () => {
    const t = testApp();
    const stale = uniqueEmail("stale");
    const recent = uniqueEmail("recent");
    await t.signUp(stale, "correct horse battery");
    await t.signUp(recent, "correct horse battery");
    await age(stale, UNCONFIRMED_DAYS + 1);
    await age(recent, UNCONFIRMED_DAYS - 1);

    expect(await deleteStaleSignUps(db)).toBeGreaterThanOrEqual(1);
    expect(await exists(stale)).toBe(false);
    expect(await exists(recent)).toBe(true);
    await t.settle();
  });

  it("keeps confirmed accounts, however old", async () => {
    const t = testApp();
    const { email } = await t.signUpConfirmed();
    await age(email, 30);
    await deleteStaleSignUps(db);
    expect(await exists(email)).toBe(true);
    await t.settle();
  });

  it("keeps an old unconfirmed account that has no password", async () => {
    const t = testApp();
    const { email } = await t.signIn();
    await db
      .update(user)
      .set({ emailVerified: false })
      .where(eq(user.email, email));
    await age(email, 30);
    await deleteStaleSignUps(db);
    expect(await exists(email)).toBe(true);
    await t.settle();
  });
});
