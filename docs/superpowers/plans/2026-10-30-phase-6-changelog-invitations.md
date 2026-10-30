# Phase 6: A changelog and team invitations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pano works for a real team and keeps its promise to tell everyone when something ships:
- a changelog for each workspace, with an Atom feed
- email invitations, with a Team page in Settings
- one daily email budget that keeps sign-in working when invitations and Shipped emails pile up

**Architecture:**
- **Email budget:** a small `email_counters` table. One atomic upsert claims each email: the day's budget (`daily`) and three sign-in codes per address per ten minutes (`code:<sha-256>`). Production only, like every other limit.
- **Workspaces:** "one workspace per account" counts owned workspaces, enforced by a partial unique index on owner memberships.
- **Team:** `requireAdmin` guards settings and team changes. Role changes, removal and leaving are Pano's own updates on `member`.
- **Invitations:** Pano's routes call Better Auth's organization plugin on the server (create, resend, cancel, accept), and send the email themselves through a request-scoped mailer (`withMailer`).
- **Changelog:** a query over shipped posts with each one's latest shipping note. The Atom feed is cached in KV by slug, and the routes that change a shipped post drop the cached copy.
- **Client:** a changelog page, Settings → Team, and `/invite/$id`, in English and Turkish.

**Tech Stack:** the Phase 0–5 stack. No new packages.

**Spec:** `docs/superpowers/specs/2026-10-30-phase-6-changelog-invitations-design.md`

**Verified in a throwaway spike (2026-10-30):** worktree `scratchpad/p6-spike`, branch `spike/phase-6`, commits f254c10..8f3bf1c.
- **Spike results:** every task was built there with its tests. The suite went from 68 files and 521 tests to 79 files and 616. Typecheck, Biome and the build passed, and the end-to-end suite passed 5/5 against the production build.
- **Re-applied from this plan's own text (2026-10-31):** a second worktree, branch `reapply/phase-6` from 5d2a25e. Each task's steps were applied exactly as written, and every Run was compared with its Expected.
  - Every task's new tests failed first and then passed, at the file and test counts each task states. It ended at 79 files and 616 tests, with the build, the route-tree check and 5/5 browser tests passing.
  - The finished tree is byte-identical to the spike's, apart from drizzle's generated snapshot ids and timestamps.
  - It caught two problems, both fixed in this text. Task 4's failing run left rows that stopped migration 0012 (decision 11). Task 2 dropped a blank line between tests.
- **Bun:** a variable set in the shell, even to an empty string, beats `.env`, both for `bun file.ts` and for `bun run`. Task 13's checks rely on that to point `db:migrate:prod` at a throwaway local database, never at production.
- **Better Auth 1.7.10:**
  - `createInvitation` with `resend: true` gives a pending invitation a fresh expiry instead of refusing it.
  - `acceptInvitation` doesn't check whether the person is already on the team (`member` has no unique key), so Pano checks.
  - `getInvitation` needs the invitee signed in, so Pano reads the invitation itself for the public page.
  - `createOrganization` inserts the workspace, then its owner, outside a transaction.
- **The #7 race:** the three-creates-at-once test failed 3 times out of 3 without the route's cleanup.
- **`bun run`** doesn't put `.env` values into a script's shell, so `db:migrate:prod` is a small bun script, not `DATABASE_URL=$NEON_DATABASE_URL …`.

**Decided in this plan** (the spec leaves these open, or the code showed otherwise):
1. **Three migrations:**
   - 0011 makes `email_counters` (generated).
   - 0012 adds the owner index. It's hand-written, because Better Auth generates the `member` schema and would drop an index added there.
   - 0013 adds the posts index for the changelog (generated).
2. **Resend and cancel paths:** `POST /api/workspaces/:slug/invitations/:id/resend` and `DELETE /api/workspaces/:slug/invitations/:id`, not `/api/invitations/:id/…`, so the existing team checks guard them. The invitation page keeps `/api/invitations/:id`.
3. **Owners and admins only:**
   - A `requireAdmin` middleware runs after `requireTeam` and `readOnlyInDemo`, rather than a minimum-role option on `requireTeam`. Each route shows its rule in its chain, and the demo's own answer still comes first.
   - Its refusal is a new code, `ADMINS_ONLY` (403).
4. **`organizationLimit` stays, as a function:** it answers whether the account already owns a workspace. Better Auth's own check then agrees with the new rule, and the index settles races.
5. **Team changes:** role changes, removal and leaving are Pano's own updates on `member`. Invitations go through Better Auth's server API: create, resend, cancel and accept.
6. **Settings for members:** the workspace and boards sections stay visible but disabled, with a note that only owners and admins change them. The Team section shows the lists without the controls.
7. **Production only:** the email budget and the per-address code limit apply only in production, like the rate limits. Tests switch them on with `ENVIRONMENT=production`.
8. **Budget before checks:** an invitation claims its email before Better Auth checks it. A refused invite (say, already on the team) still spends one of the day's 200; the 10-an-hour limit bounds that.
9. **The feed:**
   - Its title follows the workspace's language: "Inkwell changelog", or "Inkwell yenilikleri".
   - Its KV cache is keyed by slug, not workspace id, so a hit needs no database query.
10. **`withMailer`:** the API's mailer becomes a request variable, `c.var.mailer`, and `withAuth` stops taking one.
11. **The test setup empties the tables before migrating as well as after.** A failing run can leave rows that a new constraint refuses. Task 4's first run, for one, leaves one account owning several workspaces.
12. **Moved earlier than in the spike:** `addToTeam` arrives in Task 4 and `toPendingInvitation` in Task 5, with the tests that first use them.

**Still open afterwards:**
- #25's retry backoff
- #40 (live updates)
- the other deferred minors, #16–#38 and #41

## Global Constraints

- **Repo and branch:** `~/repos/deploys/pano`, on branch `feat/phase-6-changelog-invitations` from `main`.
  - The repo is public. Nothing is pushed until the finishing step's choice.
  - Part 2 (migrate production, deploy) runs only with you.
- **Earlier phases still apply:** every Phase 0–5 Global Constraint holds.
- **No new packages.**
- **Limits**, from the spec:
  - Brevo sends 300 emails a day. Invitations and Shipped emails stop at 200.
  - 3 sign-in codes per address per 10 minutes.
  - An invitation link works for 7 days.
  - 20 pending invitations per workspace, 50 people per team, and 10 invitations or resends an hour per person.
  - The feed stays in KV for 1 hour. A changelog page shows 20 entries.
- **Error codes:**

  | Status | Codes |
  |---|---|
  | 429 | `CODE_LIMIT`, `EMAIL_BUDGET` |
  | 403 | `ADMINS_ONLY`, `OWNER_PROTECTED`, `INVITATION_WRONG_ADDRESS` |
  | 409 | `ALREADY_ON_TEAM`, `TOO_MANY_INVITATIONS`, `TEAM_FULL` |
  | 404 | `INVITATION_NOT_FOUND` |
  | 410 | `INVITATION_EXPIRED` |

  All of them are translated in English and Turkish.
- **KV keys:**
  - `outbox:pending`: as before.
  - `outbox:paused`: expires at the next UTC midnight.
  - `changelog:<slug>`: one hour.
- **Production stays out of reach:**
  - Tests use `TEST_DATABASE_URL`. Browser tests use `DATABASE_URL`, which stays local.
  - `.env`'s `NEON_DATABASE_URL` is read only by `bun run db:migrate:prod`, in Part 2.
- **Messages:** every new string goes into `src/i18n/messages/en.json` and `tr.json` together. `src/i18n/messages.test.ts` checks that their keys match.

## Review Focus

1. **One account creating two workspaces at once:** one workspace, and no workspace left without an owner. (Task 4's three-creates-at-once test.)
2. **A sign-in code once the day's email is spent:** a 429 that says to try tomorrow, and nothing sent. (Task 2.)
3. **The outbox running into the budget mid-run:** the rest wait without losing a try, and the cron stops waking Neon until midnight. (Task 3.)
4. **An invitation link opened by someone signed in at another address, or by a demo account:** it never joins. (Task 7.)
5. **A feed reader polling the Atom feed:** answered from KV without touching the database. (Task 9's unreachable-database test.)

---

### Task 1: The daily email budget

**Files:**
- Create: `worker/db/schema/email-counters.ts`, `worker/services/email-budget.ts`, `worker/services/email-budget.test.ts`
- Modify: `worker/db/schema/index.ts`, `test/global-setup.ts`
- Generate: `drizzle/0011_email_counters.sql`, `drizzle/meta/0011_snapshot.json`, and the new entry in `drizzle/meta/_journal.json`

**Interfaces:**
- Produces:
  - `emailCounters` table: `key` text, `window_start` timestamptz, `count` integer, with primary key `(key, window_start)`.
  - `worker/services/email-budget.ts`:
    - constants `DAILY_EMAILS = 300`, `NOTICE_EMAILS = 200`, `CODES_PER_ADDRESS = 3`
    - `type EmailKind = "code" | "notice"`
    - `utcDay(now: Date): Date`, `nextUtcMidnight(now: Date): Date`
    - `claimDailyEmail(db, kind, now?): Promise<boolean>`
    - `claimCodeForAddress(db, email, now?): Promise<boolean>`
    - `addressKey(email): Promise<string>`
    - `pruneEmailCounters(db, now?)`

- [ ] **Step 1: Create the branch**

```bash
cd ~/repos/deploys/pano
git switch -c feat/phase-6-changelog-invitations
```

- [ ] **Step 2: Write the failing tests**

Create `worker/services/email-budget.test.ts`:

```ts
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
```

- [ ] **Step 3: Run them to see them fail**

Run: `bunx vitest run worker/services/email-budget.test.ts`
Expected: FAIL. The file can't import `./email-budget`, which doesn't exist yet.

- [ ] **Step 4: Add the table, the migration and the service**

Create `worker/db/schema/email-counters.ts`:

```ts
import {
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * How many emails went out in a window, for the daily email budget and the
 * sign-in code limit per address. The key `daily` has one window per UTC
 * day; `code:<sha-256 of the address>` has ten-minute windows, so no address
 * is stored in the clear. The nightly cron prunes old windows.
 */
export const emailCounters = pgTable(
  "email_counters",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.key, table.windowStart] })]
);
```

In `worker/db/schema/index.ts`, replace:

```ts
export * from "./email-outbox";
```

with:

```ts
export * from "./email-counters";
export * from "./email-outbox";
```

Run: `bun run db:generate --name=email_counters`
Expected: `drizzle/0011_email_counters.sql`, holding:

```sql
CREATE TABLE "email_counters" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "email_counters_key_window_start_pk" PRIMARY KEY("key","window_start")
);
```

In `test/global-setup.ts`, replace:

```ts
      'TRUNCATE TABLE "user", "organization", "verification", "rate_limit" RESTART IDENTITY CASCADE'
```

with:

```ts
      'TRUNCATE TABLE "user", "organization", "verification", "rate_limit", "email_counters" RESTART IDENTITY CASCADE'
```

Create `worker/services/email-budget.ts`:

```ts
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
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `bunx vitest run worker/services/email-budget.test.ts`
Expected: PASS, 6 tests. "Never takes more than the limit, even all at once" fires 230 claims at once and counts exactly 200 that succeed.

- [ ] **Step 6: Run everything and commit**

Run: `bun run typecheck && bun run check && bun run test`
Expected: all pass, 69 files and 527 tests.

```bash
git add worker/db/schema drizzle worker/services/email-budget.ts worker/services/email-budget.test.ts test/global-setup.ts
git commit -m "feat: a daily email budget, counted in Postgres" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Sign-in code limits (#2), and a timeout on Brevo

**Files:**
- Create: `src/lib/sign-in-error.ts`, `src/lib/sign-in-error.test.ts`
- Modify: `shared/envelope.ts`, `worker/env.ts`, `worker/middleware/auth.ts`, `worker/app.ts`, `worker/mail/mailer.ts`, `worker/mail/mailer.test.ts`, `worker/routes/me.test.ts`, `src/routes/signin.tsx`, `src/i18n/messages/en.json`, `src/i18n/messages/tr.json`

**Interfaces:**
- Consumes: Task 1's `claimCodeForAddress`, `claimDailyEmail`, `addressKey`, `utcDay`, `DAILY_EMAILS`.
- Produces:
  - error codes `CODE_LIMIT` and `EMAIL_BUDGET` (429)
  - `AppEnv["Variables"]["mail"]` becomes `{ failed: boolean; refused?: "CODE_LIMIT" | "EMAIL_BUDGET" }`
  - `BREVO_TIMEOUT_MS = 10_000`
  - `brevoMailer(apiKey, from, send?, timeoutMs?)`
  - `codeErrorKey(failure: { status: number; code?: unknown }): "codeLimit" | "emailBudget" | "tooManyCodes" | "sendFailed"`

- [ ] **Step 1: Write the failing tests**

In `worker/routes/me.test.ts`, replace:

```ts
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createDb } from "../db/client";
import { session, user } from "../db/schema";
```

with:

```ts
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createDb } from "../db/client";
import { emailCounters, session, user } from "../db/schema";
import { addressKey, DAILY_EMAILS, utcDay } from "../services/email-budget";
```

In the same file, replace:

```ts
  });
  it("tells the person when the code email couldn't be sent", async () => {
```

with these lines, which add three tests and a blank line between each:

```ts
  });

  it("sends one address at most three codes in ten minutes in production", async () => {
    const t = testApp({ ENVIRONMENT: "production" });
    const email = uniqueEmail("limit");
    // A new network each time, so Better Auth's per-IP limit stays out of it.
    const base = Math.floor(Math.random() * 60) * 4;
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const ip = { "cf-connecting-ip": `198.51.100.${base + i + 1}` };
      statuses.push((await t.sendCode(email, ip)).status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
    const last = await t.sendCode(email, { "cf-connecting-ip": "192.0.2.77" });
    expect(await last.json()).toMatchObject({ code: "CODE_LIMIT" });
    expect(t.mail.sent.filter((message) => message.to === email)).toHaveLength(
      3
    );
    await t.settle();
  });

  it("stops sending codes once the day's email is spent", async () => {
    const t = testApp({ ENVIRONMENT: "production" });
    const { db, close } = createDb(t.env.HYPERDRIVE.connectionString);
    const today = utcDay(new Date());
    const spent = { key: "daily", windowStart: today, count: DAILY_EMAILS };
    await db
      .insert(emailCounters)
      .values(spent)
      .onConflictDoUpdate({
        target: [emailCounters.key, emailCounters.windowStart],
        set: { count: DAILY_EMAILS },
      });
    try {
      const email = uniqueEmail("budget");
      const res = await t.sendCode(email, {
        "cf-connecting-ip": `198.51.100.${Math.floor(Math.random() * 250) + 1}`,
      });
      expect(res.status).toBe(429);
      expect(await res.json()).toMatchObject({
        success: false,
        code: "EMAIL_BUDGET",
      });
      expect(t.mail.sent.some((message) => message.to === email)).toBe(false);
    } finally {
      // Later tests send codes today too.
      await db
        .delete(emailCounters)
        .where(
          and(
            eq(emailCounters.key, "daily"),
            eq(emailCounters.windowStart, today)
          )
        );
      await close();
      await t.settle();
    }
  });

  it("counts no codes outside production", async () => {
    const t = testApp();
    const email = uniqueEmail("dev");
    for (let i = 0; i < 4; i++) {
      expect((await t.sendCode(email)).status).toBe(200);
    }
    const { db, close } = createDb(t.env.HYPERDRIVE.connectionString);
    const rows = await db
      .select()
      .from(emailCounters)
      .where(eq(emailCounters.key, await addressKey(email)));
    await close();
    expect(rows).toEqual([]);
    await t.settle();
  });

  it("tells the person when the code email couldn't be sent", async () => {
```

In `worker/mail/mailer.test.ts`, replace the end of the `brevoMailer` tests:

```ts
    ).rejects.toThrow(/401/);
  });
});
```

with:

```ts
    ).rejects.toThrow(/401/);
  });

  it("gives up when Brevo doesn't answer in time", async () => {
    // Never answers; only the timeout's abort ends the call.
    const send: SendFn = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason)
        );
      });
    const mailer = brevoMailer("k", "hello@pano.example", send, 20);
    await expect(
      mailer.sendSignInCode({
        to: "a@example.com",
        code: "123456",
        locale: "en",
      })
    ).rejects.toThrow(/timeout/i);
  });
});
```

Create `src/lib/sign-in-error.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { codeErrorKey } from "./sign-in-error";

describe("codeErrorKey", () => {
  it("names Pano's own limits", () => {
    expect(codeErrorKey({ status: 429, code: "CODE_LIMIT" })).toBe("codeLimit");
    expect(codeErrorKey({ status: 429, code: "EMAIL_BUDGET" })).toBe(
      "emailBudget"
    );
  });

  it("falls back to the per-IP limit and to a failed send", () => {
    expect(codeErrorKey({ status: 429 })).toBe("tooManyCodes");
    expect(codeErrorKey({ status: 502, code: "INTERNAL_ERROR" })).toBe(
      "sendFailed"
    );
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bunx vitest run worker/routes/me.test.ts worker/mail/mailer.test.ts src/lib/sign-in-error.test.ts`
Expected: FAIL.
- **"Sends one address at most three codes":** the fourth answers 200.
- **"Stops sending codes once the day's email is spent":** it answers 200.
- **"Gives up when Brevo doesn't answer in time":** it hits Vitest's 5-second timeout, because no signal reaches the fetch.
- **`sign-in-error.test.ts`:** can't import `./sign-in-error`.
- **"Counts no codes outside production":** already passes. Nothing counts codes yet; the test keeps the limit to production.

- [ ] **Step 3: Implement**

In `shared/envelope.ts`, replace:

```ts
  | "DEMO_ONLY"
  | "DEMO_READ_ONLY";
```

with:

```ts
  | "DEMO_ONLY"
  | "DEMO_READ_ONLY"
  | "CODE_LIMIT"
  | "EMAIL_BUDGET";
```

In `worker/env.ts`, replace:

```ts
    /** Set when this request's sign-in code email failed to send. */
    mail: { failed: boolean };
```

with:

```ts
    /**
     * This request's sign-in code email: `failed` when sending it failed,
     * `refused` when a limit kept it from being sent.
     */
    mail: { failed: boolean; refused?: "CODE_LIMIT" | "EMAIL_BUDGET" };
```

Replace the whole of `worker/middleware/auth.ts` with:

```ts
import { createMiddleware } from "hono/factory";
import { createAuth } from "../auth";
import type { AppEnv } from "../env";
import { type CodeMailer, mailerFor } from "../mail/mailer";
import { claimCodeForAddress, claimDailyEmail } from "../services/email-budget";

/**
 * Builds Better Auth for this request. The mailer is picked only when a code
 * is actually sent, so a missing Brevo key can't break unrelated routes.
 *
 * In production a code first takes its place in two limits: three per
 * address in ten minutes, and the day's email budget. A code either limit
 * refuses isn't sent, and the /auth route says which one.
 */
export const withAuth = (mailer?: CodeMailer) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const mail: AppEnv["Variables"]["mail"] = { failed: false };
    const lazyMailer: CodeMailer = {
      async sendSignInCode(message) {
        if (c.env.ENVIRONMENT === "production") {
          if (!(await claimCodeForAddress(c.var.db, message.to))) {
            mail.refused = "CODE_LIMIT";
            return;
          }
          if (!(await claimDailyEmail(c.var.db, "code"))) {
            mail.refused = "EMAIL_BUDGET";
            return;
          }
        }
        try {
          await (mailer ?? mailerFor(c.env)).sendSignInCode(message);
        } catch (err) {
          // Better Auth logs the error but still answers 200, so remember it
          // for the /auth route to report.
          mail.failed = true;
          throw err;
        }
      },
    };
    c.set("mail", mail);
    c.set("auth", createAuth({ db: c.var.db, env: c.env, mailer: lazyMailer }));
    await next();
  });
```

In `worker/app.ts`, replace:

```ts
      const res = await c.var.auth.handler(c.req.raw);
      // A code that never left must not read as "check your inbox".
```

with:

```ts
      const res = await c.var.auth.handler(c.req.raw);
      // A refused code wasn't sent: say which limit stopped it.
      if (c.var.mail.refused) {
        return c.json<ErrorResponse>(
          {
            success: false,
            code: c.var.mail.refused,
            error:
              c.var.mail.refused === "CODE_LIMIT"
                ? "Too many codes for this address"
                : "Today's email is spent",
          },
          429
        );
      }
      // A code that never left must not read as "check your inbox".
```

In `worker/mail/mailer.ts`, replace:

```ts
/** Brevo's transactional email API (its free tier allows 300 emails a day). */
export function brevoMailer(
  apiKey: string,
  from: string,
  send: SendFn = (url, init) => fetch(url, init)
): Mailer {
```

with:

```ts
/** How long a Brevo call may take before it's given up. */
export const BREVO_TIMEOUT_MS = 10_000;

/** Brevo's transactional email API (its free tier allows 300 emails a day). */
export function brevoMailer(
  apiKey: string,
  from: string,
  send: SendFn = (url, init) => fetch(url, init),
  timeoutMs = BREVO_TIMEOUT_MS
): Mailer {
```

In the same file, replace:

```ts
    const res = await send("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
```

with:

```ts
    const res = await send("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      // A stuck call would hold up the request or the cron run, and past
      // the outbox's ten-minute claim another run could send it again.
      signal: AbortSignal.timeout(timeoutMs),
```

Create `src/lib/sign-in-error.ts`:

```ts
/**
 * The `signin.*` message for a code that wasn't sent. Better Auth's client
 * puts the response's JSON on its error, so Pano's own limits arrive with
 * their code; its per-IP limit answers 429 without one.
 */
export function codeErrorKey(failure: { status: number; code?: unknown }) {
  if (failure.code === "CODE_LIMIT") return "codeLimit";
  if (failure.code === "EMAIL_BUDGET") return "emailBudget";
  return failure.status === 429 ? "tooManyCodes" : "sendFailed";
}
```

In `src/routes/signin.tsx`, replace:

```ts
import { meQueryOptions } from "@/lib/session";
import { codeFormSchema, emailFormSchema } from "@/shared/schemas";
```

with:

```ts
import { meQueryOptions } from "@/lib/session";
import { codeErrorKey } from "@/lib/sign-in-error";
import { codeFormSchema, emailFormSchema } from "@/shared/schemas";
```

In the same file, replace:

```ts
        setError(failure.status === 429 ? t("tooManyCodes") : t("sendFailed"));
```

with:

```ts
        setError(t(codeErrorKey(failure)));
```

Merge into `src/i18n/messages/en.json`, adding each key at the end of its section:

```json
{
  "signin": {
    "codeLimit": "Too many codes went to this address. Try again in a few minutes.",
    "emailBudget": "Pano has sent all the email it can today. Try again tomorrow."
  },
  "errors": {
    "CODE_LIMIT": "Too many codes went to this address. Try again in a few minutes.",
    "EMAIL_BUDGET": "Pano has sent all the email it can today. Try again tomorrow."
  }
}
```

Merge into `src/i18n/messages/tr.json`, adding each key at the end of its section:

```json
{
  "signin": {
    "codeLimit": "Bu adrese çok fazla kod gönderildi. Birkaç dakika sonra tekrar deneyin.",
    "emailBudget": "Pano bugün gönderebileceği tüm e-postaları gönderdi. Yarın tekrar deneyin."
  },
  "errors": {
    "CODE_LIMIT": "Bu adrese çok fazla kod gönderildi. Birkaç dakika sonra tekrar deneyin.",
    "EMAIL_BUDGET": "Pano bugün gönderebileceği tüm e-postaları gönderdi. Yarın tekrar deneyin."
  }
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `bunx vitest run worker/routes/me.test.ts worker/mail/mailer.test.ts src/lib/sign-in-error.test.ts src/i18n/messages.test.ts`
Expected: PASS.

- [ ] **Step 5: Run everything and commit**

Run: `bun run typecheck && bun run check && bun run test`
Expected: all pass, 70 files and 533 tests.

```bash
git add -A shared worker src
git commit -m "feat: sign-in codes stop at three per address and at the day's budget, and Brevo calls time out" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The outbox stops at the budget and pauses until tomorrow (#25)

**Files:**
- Modify: `worker/env.ts`, `worker/services/outbox.ts`, `worker/services/outbox.test.ts`, `worker/cron.ts`, `worker/cron.test.ts`

**Interfaces:**
- Consumes: Task 1's `claimDailyEmail`, `nextUtcMidnight`, `pruneEmailCounters`, `NOTICE_EMAILS`, `utcDay`, and the `emailCounters` table.
- Produces:
  - `Flags.put` options gain `expiration` (Unix seconds)
  - `OUTBOX_PAUSED = "outbox:paused"`
  - `pauseOutboxUntilTomorrow(flags, now?)`
  - `sendQueuedEmails(db, mailer, { origin, batch?, postIds?, budget?, now? }): Promise<{ sent; failed; budgetSpent?: true }>`

- [ ] **Step 1: Write the failing tests**

In `worker/services/outbox.test.ts`, replace:

```ts
import { asc, eq, inArray, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { emailOutbox, user as users } from "../db/schema";
import type { Mailer, ShippedNotice } from "../mail/mailer";
import { capturingMailer, testApp } from "../test/app";
import { testDb } from "../test/db";
import { setupWorkspace, submitPost } from "../test/fixtures";
import { sendQueuedEmails } from "./outbox";
```

with:

```ts
import { asc, eq, inArray, sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { emailCounters, emailOutbox, user as users } from "../db/schema";
import type { Mailer, ShippedNotice } from "../mail/mailer";
import { capturingMailer, testApp } from "../test/app";
import { testDb } from "../test/db";
import { memoryFlags } from "../test/env";
import { setupWorkspace, submitPost } from "../test/fixtures";
import { NOTICE_EMAILS, utcDay } from "./email-budget";
import {
  OUTBOX_PAUSED,
  pauseOutboxUntilTomorrow,
  sendQueuedEmails,
} from "./outbox";
```

In the same file, replace the end of the file:

```ts
    expect(await sendQueuedEmails(db, mail.mailer, options)).toEqual({
      sent: 1,
      failed: 0,
    });
  });
});
```

with:

```ts
    expect(await sendQueuedEmails(db, mail.mailer, options)).toEqual({
      sent: 1,
      failed: 0,
    });
  });

  it("stops once the day's email is spent, and the rest wait without losing a try", async () => {
    const { postId } = await queued(3);
    // A day of its own, with room for one more invitation or Shipped email.
    const now = new Date(Date.UTC(2101, 5, 1, 12));
    await db.insert(emailCounters).values({
      key: "daily",
      windowStart: utcDay(now),
      count: NOTICE_EMAILS - 1,
    });
    const mail = capturingMailer();
    const options = { origin: ORIGIN, postIds: [postId], budget: true, now };
    expect(await sendQueuedEmails(db, mail.mailer, options)).toEqual({
      sent: 1,
      failed: 0,
      budgetSpent: true,
    });
    expect(mail.shipped).toHaveLength(1);
    expect((await rowsOf(postId)).slice(1)).toMatchObject([
      { sentAt: null, attempts: 0, claimedAt: null },
      { sentAt: null, attempts: 0, claimedAt: null },
    ]);
  });
});

describe("pauseOutboxUntilTomorrow", () => {
  it("holds the cron back until the next UTC midnight", async () => {
    const flags = memoryFlags();
    const put = vi.spyOn(flags, "put");
    await pauseOutboxUntilTomorrow(flags, new Date(Date.UTC(2026, 9, 30, 15)));
    expect(put).toHaveBeenCalledWith(OUTBOX_PAUSED, "1", {
      expiration: Date.UTC(2026, 9, 31) / 1000,
    });
  });

  it("keeps the expiry at least a minute away, as KV requires", async () => {
    const flags = memoryFlags();
    const put = vi.spyOn(flags, "put");
    const now = new Date(Date.UTC(2026, 9, 30, 23, 59, 30));
    await pauseOutboxUntilTomorrow(flags, now);
    expect(put).toHaveBeenCalledWith(OUTBOX_PAUSED, "1", {
      expiration: (now.getTime() + 60_000) / 1000,
    });
  });
});
```

In `worker/cron.test.ts`, replace:

```ts
import { describe, expect, it, vi } from "vitest";
import { EVERY_FIVE_MINUTES, NIGHTLY, runScheduled } from "./cron";
import type { resetDemo } from "./services/demo-reset";
import {
  markOutboxPending,
  OUTBOX_BATCH,
  OUTBOX_PENDING,
  type sendQueuedEmails,
} from "./services/outbox";
```

with:

```ts
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { EVERY_FIVE_MINUTES, NIGHTLY, runScheduled } from "./cron";
import { createDb } from "./db/client";
import { emailCounters } from "./db/schema";
import type { resetDemo } from "./services/demo-reset";
import {
  markOutboxPending,
  OUTBOX_BATCH,
  OUTBOX_PAUSED,
  OUTBOX_PENDING,
  pauseOutboxUntilTomorrow,
  type sendQueuedEmails,
} from "./services/outbox";
```

In the same file, replace:

```ts
    expect(options).toEqual({ origin: "http://localhost" });
```

with:

```ts
    expect(options).toEqual({ origin: "http://localhost", budget: false });
```

In the same file, replace:

```ts
  it("resets the demo every night, then sends what's queued", async () => {
```

with these four tests and that line:

```ts
  it("draws on the day's email budget in production", async () => {
    const { env } = testEnv();
    await markOutboxPending(env.FLAGS);
    const send = nothingToSend();
    const production = { ...env, ENVIRONMENT: "production" };
    await runScheduled(EVERY_FIVE_MINUTES, production, {
      mailer: capturingMailer().mailer,
      send,
    });
    expect(send.mock.calls[0]![2]).toMatchObject({ budget: true });
  });

  it("pauses until the next UTC day once the day's email is spent", async () => {
    const { env } = testEnv();
    await markOutboxPending(env.FLAGS);
    const put = vi.spyOn(env.FLAGS, "put");
    const send = vi.fn<typeof sendQueuedEmails>(async () => ({
      sent: 2,
      failed: 0,
      budgetSpent: true,
    }));
    const logged = vi.spyOn(console, "log").mockImplementation(() => {});
    await runScheduled(EVERY_FIVE_MINUTES, env, { send });
    logged.mockRestore();
    expect(put).toHaveBeenCalledOnce();
    expect(put.mock.calls[0]![0]).toBe(OUTBOX_PAUSED);
    const expiration = put.mock.calls[0]![2]?.expiration ?? 0;
    expect(expiration * 1000).toBeGreaterThan(Date.now());
    expect(expiration * 1000).toBeLessThanOrEqual(Date.now() + 86_400_000);
  });

  it("leaves the database alone while the day's email is spent", async () => {
    const env = offlineEnv();
    await markOutboxPending(env.FLAGS);
    await pauseOutboxUntilTomorrow(env.FLAGS);
    const send = nothingToSend();
    await runScheduled(EVERY_FIVE_MINUTES, env, { send });
    expect(send).not.toHaveBeenCalled();
  });

  it("prunes old email counters every night", async () => {
    const { env } = testEnv();
    const { db, close } = createDb(env.HYPERDRIVE.connectionString);
    await db.insert(emailCounters).values({
      key: "cron-test",
      windowStart: new Date(Date.now() - 3 * 86_400_000),
      count: 1,
    });
    await runScheduled(NIGHTLY, env, {
      send: nothingToSend(),
      reset: fakeReset(),
    });
    const left = await db
      .select()
      .from(emailCounters)
      .where(eq(emailCounters.key, "cron-test"));
    await close();
    expect(left).toEqual([]);
  });

  it("resets the demo every night, then sends what's queued", async () => {
```

- [ ] **Step 2: Run them to see them fail**

Run: `bunx vitest run worker/services/outbox.test.ts worker/cron.test.ts`
Expected: FAIL.
- **Outbox:** "stops once the day's email is spent" sends all three. Both `pauseOutboxUntilTomorrow` tests fail because it isn't a function yet.
- **Cron:**
  - The first test fails because the options lack `budget: false`.
  - The four new ones fail.

- [ ] **Step 3: Implement**

In `worker/env.ts`, replace:

```ts
    options?: { expirationTtl?: number }
```

with:

```ts
    /** `expirationTtl` in seconds from now; `expiration` in Unix seconds. */
    options?: { expirationTtl?: number; expiration?: number }
```

In `worker/services/outbox.ts`, replace:

```ts
import type { Mailer } from "../mail/mailer";
```

with:

```ts
import type { Mailer } from "../mail/mailer";
import { claimDailyEmail, nextUtcMidnight } from "./email-budget";
```

In the same file, replace:

```ts
/** A post moved back out of Shipped: drop its emails that haven't gone out. */
```

with:

```ts
/** The flag that holds the five-minute cron back until the next UTC day. */
export const OUTBOX_PAUSED = "outbox:paused";

/**
 * The day's email is spent: the five-minute cron stops connecting until the
 * next UTC midnight, so Neon can sleep meanwhile. The 01:00 run sends the
 * next batch, and raises the pending flag again if it was a full one.
 */
export function pauseOutboxUntilTomorrow(flags: Flags, now = new Date()) {
  // KV wants an expiry at least a minute away.
  const until = Math.max(
    nextUtcMidnight(now).getTime(),
    now.getTime() + 60_000
  );
  return flags.put(OUTBOX_PAUSED, "1", {
    expiration: Math.ceil(until / 1000),
  });
}

/** A post moved back out of Shipped: drop its emails that haven't gone out. */
```

In the same file, replace:

```ts
 * leave each other's emails alone.
 */
export async function sendQueuedEmails(
  db: Database,
  mailer: Mailer,
  options: { origin: string; batch?: number; postIds?: number[] }
) {
```

with:

```ts
 * leave each other's emails alone.
 *
 * With `budget` (production), each email first takes one of the day's
 * emails. Once the day's share is spent, the run stops: the rest wait for
 * tomorrow without this run counting as one of their tries, and the result
 * says `budgetSpent`.
 */
export async function sendQueuedEmails(
  db: Database,
  mailer: Mailer,
  options: {
    origin: string;
    batch?: number;
    postIds?: number[];
    budget?: boolean;
    now?: Date;
  }
): Promise<{ sent: number; failed: number; budgetSpent?: true }> {
```

In the same file, replace:

```ts
  // One at a time: a run stays well inside the Workers subrequest limit.
  for (const email of claimed.sort((a, b) => a.id - b.id)) {
```

with:

```ts
  const inOrder = claimed.sort((a, b) => a.id - b.id);
  // One at a time: a run stays well inside the Workers subrequest limit.
  for (const [index, email] of inOrder.entries()) {
    if (options.budget && !(await claimDailyEmail(db, "notice", options.now))) {
      await db
        .update(emailOutbox)
        .set({
          claimedAt: null,
          attempts: sql`${emailOutbox.attempts} - 1`,
        })
        .where(
          inArray(
            emailOutbox.id,
            inOrder.slice(index).map((row) => row.id)
          )
        );
      return { sent, failed: index - sent, budgetSpent: true };
    }
```

In `worker/cron.ts`, replace:

```ts
import { resetDemo } from "./services/demo-reset";
import {
  markOutboxPending,
  OUTBOX_BATCH,
  OUTBOX_PENDING,
  sendQueuedEmails,
} from "./services/outbox";
```

with:

```ts
import { resetDemo } from "./services/demo-reset";
import { pruneEmailCounters } from "./services/email-budget";
import {
  markOutboxPending,
  OUTBOX_BATCH,
  OUTBOX_PAUSED,
  OUTBOX_PENDING,
  pauseOutboxUntilTomorrow,
  sendQueuedEmails,
} from "./services/outbox";
```

In the same file, replace:

```ts
 *   and puts the flag back up while some are left.
 * - Every night: reset the demo workspace, then send whatever is queued, in
 *   case a flag was lost.
```

with:

```ts
 *   and puts the flag back up while some are left. Once the day's email is
 *   spent, a second flag keeps it from connecting until the next UTC day.
 * - Every night: reset the demo workspace, prune old email counters, then
 *   send whatever is queued, in case a flag was lost.
```

In the same file, replace:

```ts
    if (!(await env.FLAGS.get(OUTBOX_PENDING))) return;
```

with:

```ts
    if (await env.FLAGS.get(OUTBOX_PAUSED)) return;
    if (!(await env.FLAGS.get(OUTBOX_PENDING))) return;
```

In the same file, replace:

```ts
        console.error("[demo] reset failed:", error);
      }
```

with:

```ts
        console.error("[demo] reset failed:", error);
      }
      try {
        await pruneEmailCounters(db);
      } catch (error) {
        console.error("[email] pruning counters failed:", error);
      }
```

In the same file, replace:

```ts
    origin: env.BETTER_AUTH_URL,
  });
  if (result.sent + result.failed > 0) {
    console.log(`[outbox] sent ${result.sent}, failed ${result.failed}`);
  }
```

with:

```ts
    origin: env.BETTER_AUTH_URL,
    budget: env.ENVIRONMENT === "production",
  });
  if (result.sent + result.failed > 0) {
    console.log(`[outbox] sent ${result.sent}, failed ${result.failed}`);
  }
  if (result.budgetSpent) {
    console.log("[outbox] the day's email is spent; waiting for tomorrow");
    await pauseOutboxUntilTomorrow(env.FLAGS);
    return;
  }
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `bunx vitest run worker/services/outbox.test.ts worker/cron.test.ts`
Expected: PASS.

- [ ] **Step 5: Run everything and commit**

Run: `bun run typecheck && bun run check && bun run test`
Expected: all pass, 70 files and 540 tests.

```bash
git add worker
git commit -m "feat: the outbox stops at the day's email budget and the cron pauses until tomorrow" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: One owned workspace per account (#7, #8)

**Files:**
- Create: `drizzle/0012_one_owned_workspace.sql` (with `drizzle/meta/0012_snapshot.json` and its `_journal.json` entry, from `db:generate --custom`)
- Modify: `worker/db/errors.ts`, `worker/db/errors.test.ts`, `worker/db/migrations.test.ts`, `worker/auth.ts`, `worker/routes/workspaces.ts`, `worker/routes/workspaces.test.ts`, `worker/test/fixtures.ts`, `test/global-setup.ts`

**Interfaces:**
- Produces:
  - unique index `member_one_owned_workspace_idx` on `member (user_id) where role = 'owner'`
  - `worker/db/errors.ts`: `ONE_OWNED_WORKSPACE`, `pgConstraint(err): string | undefined`
  - `worker/test/fixtures.ts`: `addToTeam(slug, email, role: "admin" | "member"): Promise<string>`, which puts an account straight on a team and answers its user id. Tasks 5–7 use it.

- [ ] **Step 1: Write the failing tests**

In `worker/test/fixtures.ts`, replace:

```ts
import type { Locale } from "@/shared/locale";
import type { testApp } from "./app";
```

with:

```ts
import { eq } from "drizzle-orm";
import type { Locale } from "@/shared/locale";
import { member, organization, user } from "../db/schema";
import type { testApp } from "./app";
import { testDb } from "./db";
```

In the same file, replace:

```ts
/** A new owner with a workspace and boards, made through the real API. */
```

with:

```ts
/**
 * Puts the account with `email` straight on the workspace's team, the way an
 * accepted invitation does, and answers its user id.
 */
export async function addToTeam(
  slug: string,
  email: string,
  role: "admin" | "member"
) {
  const { db, close } = testDb();
  try {
    const [workspace] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, slug));
    const [person] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email));
    if (!workspace || !person) throw new Error("addToTeam: nobody to add");
    await db.insert(member).values({
      id: crypto.randomUUID(),
      organizationId: workspace.id,
      userId: person.id,
      role,
      createdAt: new Date(),
    });
    return person.id;
  } finally {
    await close();
  }
}

/** A new owner with a workspace and boards, made through the real API. */
```

In `worker/db/errors.test.ts`, replace:

```ts
import { pgErrorCode } from "./errors";
```

with:

```ts
import { pgConstraint, pgErrorCode } from "./errors";
```

Append to `worker/db/errors.test.ts`:

```ts
describe("pgConstraint", () => {
  it("finds the constraint's name down the cause chain", () => {
    const wrapped = new Error("insert failed", {
      cause: {
        code: "23505",
        constraint_name: "member_one_owned_workspace_idx",
      },
    });
    expect(pgConstraint(wrapped)).toBe("member_one_owned_workspace_idx");
  });

  it("returns undefined when there's none", () => {
    expect(pgConstraint(new Error("boom"))).toBeUndefined();
    expect(pgConstraint(undefined)).toBeUndefined();
  });
});
```

In `worker/db/migrations.test.ts`, replace:

```ts
import { createDb } from "./client";
```

with:

```ts
import { createDb } from "./client";
import { ONE_OWNED_WORKSPACE, pgConstraint } from "./errors";
import { member, organization, user } from "./schema";
```

In the same file, replace the end of the file:

```ts
    expect(rows.map((row) => row.extname)).toEqual(["pg_trgm"]);
  });
});
```

with:

```ts
    expect(rows.map((row) => row.extname)).toEqual(["pg_trgm"]);
  });

  it("let an account own one workspace, and be on any number of teams", async () => {
    const userId = crypto.randomUUID();
    await db.insert(user).values({
      id: userId,
      name: "",
      email: `owner-${userId.slice(0, 8)}@example.com`,
    });
    const workspace = async () => {
      const id = crypto.randomUUID();
      await db.insert(organization).values({
        id,
        name: "Acme",
        slug: `ws-${id.slice(0, 8)}`,
        createdAt: new Date(),
      });
      return id;
    };
    const join = async (organizationId: string, role: string) =>
      db.insert(member).values({
        id: crypto.randomUUID(),
        organizationId,
        userId,
        role,
        createdAt: new Date(),
      });

    await join(await workspace(), "owner");
    await join(await workspace(), "admin");
    await join(await workspace(), "member");
    const second = await join(await workspace(), "owner").catch((err) => err);
    expect(pgConstraint(second)).toBe(ONE_OWNED_WORKSPACE);
  });
});
```

In `worker/routes/workspaces.test.ts`, replace:

```ts
import { describe, expect, it } from "vitest";
import { testApp } from "../test/app";
```

with:

```ts
import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { member, organization, user } from "../db/schema";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import { addToTeam } from "../test/fixtures";
```

In the same file, replace:

```ts
  it("turns away a cross-site form post", async () => {
```

with:

```ts
  it("lets someone on another workspace's team create their own (#8)", async () => {
    const t = testApp();
    const owner = await t.signIn();
    const theirs = uniqueSlug();
    await createWorkspace(t, owner.cookie, theirs);
    const teammate = await t.signIn();
    await addToTeam(theirs, teammate.email, "admin");
    const res = await createWorkspace(t, teammate.cookie);
    expect(res.status).toBe(201);
    await t.settle();
  });

  it("gives an account one workspace even when it sends three creates at once (#7)", async () => {
    const t = testApp();
    const { cookie, email } = await t.signIn();
    const slugs = [uniqueSlug(), uniqueSlug(), uniqueSlug()];
    const responses = await Promise.all(
      slugs.map((slug) => createWorkspace(t, cookie, slug))
    );
    expect(responses.map((res) => res.status).sort()).toEqual([201, 409, 409]);
    for (const res of responses.filter((res) => res.status === 409)) {
      expect(await res.json()).toMatchObject({ code: "WORKSPACE_LIMIT" });
    }
    // Nothing is left of the two that lost: no workspace without an owner.
    const { db, close } = testDb();
    const made = await db
      .select({ slug: organization.slug })
      .from(organization)
      .where(inArray(organization.slug, slugs));
    const owned = await db
      .select({ id: member.id })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(user.email, email), eq(member.role, "owner")));
    await close();
    expect(made).toHaveLength(1);
    expect(owned).toHaveLength(1);
    await t.settle();
  });

  it("turns away a cross-site form post", async () => {
```

- [ ] **Step 2: Run them to see them fail**

Run: `bunx vitest run worker/db/errors.test.ts worker/db/migrations.test.ts worker/routes/workspaces.test.ts`
Expected: FAIL.
- **`pgConstraint`:** both of its tests fail, because it isn't a function yet.
- **The migration test:** fails for the same reason.
- **#8:** answers 409 `WORKSPACE_LIMIT`, because `organizationLimit: 1` counts the admin membership.
- **#7:** more than one of the three creates succeeds.

- [ ] **Step 3: Implement**

Step 2's run left one account owning several workspaces in the test database, which the new index would refuse. Each test run now empties the tables before migrating as well as after.

Replace the whole of `test/global-setup.ts` with:

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { loadEnv } from "vite";
import { assertLocalDatabaseUrl } from "../worker/test/local-db";

/** The tables each run empties; CASCADE empties the ones that point at them. */
const TABLES = [
  "user",
  "organization",
  "verification",
  "rate_limit",
  "email_counters",
];

/**
 * Brings the test database up to the latest migration once per run, so every
 * test sees the same schema production will.
 */
export default async function setup() {
  const url =
    process.env.TEST_DATABASE_URL ??
    loadEnv("test", process.cwd(), "").TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  assertLocalDatabaseUrl(url);
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    // A failed run can leave rows that a new migration's constraint refuses,
    // such as one account owning two workspaces before migration 0012, so
    // the tables that exist are emptied before migrating too.
    await emptyTables(client);
    await migrate(drizzle({ client }), { migrationsFolder: "./drizzle" });
    // Every run starts from empty tables. Tests use unique emails and slugs,
    // so files within a run don't collide either.
    await emptyTables(client);
  } finally {
    await client.end();
  }
}

async function emptyTables(client: postgres.Sql) {
  const present = await client<{ name: string }[]>`
    select tablename as name from pg_tables
    where schemaname = 'public' and tablename in ${client(TABLES)}
  `;
  if (present.length === 0) return;
  const names = present.map((table) => `"${table.name}"`).join(", ");
  await client.unsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
}
```

Run: `bun run db:generate --custom --name=one_owned_workspace`
Expected: an empty migration, `drizzle/0012_one_owned_workspace.sql`.

Replace the whole of `drizzle/0012_one_owned_workspace.sql` with:

```sql
-- One workspace per account counts the workspaces an account owns, so
-- joining another team never stops anyone from making their own (#8). This
-- index makes the rule hold for two creates at the same moment too (#7).
-- It's hand-written because Better Auth generates the member table's schema
-- (worker/db/schema/auth.ts), which would drop an index added there.
CREATE UNIQUE INDEX "member_one_owned_workspace_idx" ON "member" ("user_id") WHERE "role" = 'owner';
```

Replace the whole of `worker/db/errors.ts` with:

```ts
/** Postgres error codes the app reacts to by name rather than by message. */
export const UNIQUE_VIOLATION = "23505";

/** The unique index that lets an account own one workspace (migration 0012). */
export const ONE_OWNED_WORKSPACE = "member_one_owned_workspace_idx";

const SQLSTATE = /^[0-9A-Z]{5}$/;

/**
 * The first value `read` finds on an error or down its `cause` chain:
 * postgres.js puts Postgres's fields on its own error, Drizzle wraps that in
 * a DrizzleQueryError, and Better Auth may wrap it again.
 */
function findInChain(
  err: unknown,
  read: (error: object) => string | undefined
): string | undefined {
  let current = err;
  for (let depth = 0; depth < 5; depth++) {
    if (typeof current !== "object" || current === null) return undefined;
    const found = read(current);
    if (found !== undefined) return found;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** The Postgres error code on an error or anywhere down its `cause` chain. */
export function pgErrorCode(err: unknown): string | undefined {
  return findInChain(err, (error) => {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" && SQLSTATE.test(code) ? code : undefined;
  });
}

/** The name of the constraint or index a Postgres error is about. */
export function pgConstraint(err: unknown): string | undefined {
  return findInChain(err, (error) => {
    const name = (error as { constraint_name?: unknown }).constraint_name;
    return typeof name === "string" ? name : undefined;
  });
}
```

In `worker/auth.ts`, replace:

```ts
import { emailOTP, organization } from "better-auth/plugins";
```

with:

```ts
import { emailOTP, organization } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
```

In the same file, replace:

```ts
      organization({ organizationLimit: 1 }),
```

with:

```ts
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
      }),
```

In `worker/routes/workspaces.ts`, replace:

```ts
import { pgErrorCode, UNIQUE_VIOLATION } from "../db/errors";
import { boards, organization, workspaceSettings } from "../db/schema";
```

with:

```ts
import {
  ONE_OWNED_WORKSPACE,
  pgConstraint,
  pgErrorCode,
  UNIQUE_VIOLATION,
} from "../db/errors";
import { boards, member, organization, workspaceSettings } from "../db/schema";
```

In the same file, replace:

```ts
/** Better Auth's createOrganization, with its refusals turned into ours. */
async function createOrganization(
  auth: Auth,
```

with:

```ts
const workspaceLimit = () =>
  new AppError(409, "WORKSPACE_LIMIT", "One workspace per account");

/** Better Auth's createOrganization, with its refusals turned into ours. */
async function createOrganization(
  db: Database,
  auth: Auth,
```

In the same file, replace:

```ts
        throw new AppError(409, "WORKSPACE_LIMIT", "One workspace per account");
      }
    }
    // Two people claiming one address at once can both pass Better Auth's
    // own check; the unique index on organization.slug settles it.
    if (pgErrorCode(err) === UNIQUE_VIOLATION) throw slugTaken();
    throw err;
```

with:

```ts
        throw workspaceLimit();
      }
    }
    if (pgErrorCode(err) === UNIQUE_VIOLATION) {
      // Two creates from one account at once can both pass Better Auth's
      // check; the owner index refuses the second owner. Better Auth wrote
      // the workspace before its owner, outside a transaction, so remove
      // the ownerless one.
      if (pgConstraint(err) === ONE_OWNED_WORKSPACE) {
        await db
          .delete(organization)
          .where(
            and(
              eq(organization.slug, slug),
              sql`not exists (select 1 from ${member} where ${member.organizationId} = ${organization.id})`
            )
          );
        throw workspaceLimit();
      }
      // Two people claiming one address at once can both pass Better
      // Auth's own check; the unique index on organization.slug settles it.
      throw slugTaken();
    }
    throw err;
```

In the same file, replace:

```ts
      const org = await createOrganization(
        c.var.auth,
```

with:

```ts
      const org = await createOrganization(
        c.var.db,
        c.var.auth,
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `bunx vitest run worker/db/errors.test.ts worker/db/migrations.test.ts worker/routes/workspaces.test.ts`
Expected: PASS. Run it three times: #7's race should pass every time.

- [ ] **Step 5: Run everything and commit**

Run: `bun run typecheck && bun run check && bun run test`
Expected: all pass, 70 files and 545 tests.

```bash
git add drizzle worker
git commit -m "fix: an account owns one workspace and can still join other teams, even when creates race (#7, #8)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Team roles, and the team API

**Files:**
- Create: `shared/team.ts`, `worker/services/team-members.ts`, `worker/routes/team.ts`, `worker/routes/team.test.ts`
- Modify: `shared/envelope.ts`, `shared/schemas.ts`, `worker/middleware/team.ts`, `worker/routes/workspaces.ts`, `worker/app.ts`, `src/i18n/messages/en.json`, `src/i18n/messages/tr.json`

**Interfaces:**
- Consumes: Task 4's `addToTeam` (in the tests).
- Produces:
  - `shared/team.ts`:
    - `TEAM_ROLES`, `TeamRole`, `ASSIGNABLE_ROLES` (`"admin" | "member"`), `AssignableRole`
    - `managesTeam(role: string | undefined): boolean`
    - types `TeamMember { userId; name; email: string | null; role; joinedAt }`, `PendingInvitation { id; email; role; expiresAt; invitedBy }`, `TeamView { members; invitations }`
  - `changeRoleSchema`
  - error codes `ADMINS_ONLY` and `OWNER_PROTECTED` (403)
  - `worker/middleware/team.ts`: `adminsOnly(): AppError` and `requireAdmin` (after `requireTeam`)
  - `worker/services/team-members.ts`:
    - `pendingInvitationColumns`, `toPendingInvitation(row): PendingInvitation`
    - `listTeam(db, { id, isDemo }): Promise<TeamView>`
    - `changeRole(db, { workspaceId, userId, role })`, `removeMember(db, { workspaceId, userId })`
  - Routes:
    - `GET /api/workspaces/:slug/team`
    - `PATCH /api/workspaces/:slug/members/:userId` `{ role }`
    - `DELETE /api/workspaces/:slug/members/:userId`, which also means "leave" when it's your own id

- [ ] **Step 1: Write the failing tests**

Create `worker/routes/team.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetDemo } from "../services/demo-reset";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import { addToTeam, setupWorkspace } from "../test/fixtures";

const { db, close } = testDb();
beforeAll(() => resetDemo(db));
afterAll(() => close());

type TestApp = ReturnType<typeof testApp>;

/** An owner's workspace with an admin and a member on its team. */
async function teamOfThree(t: TestApp) {
  const { owner, slug } = await setupWorkspace(t);
  const admin = await t.signIn();
  const adminId = await addToTeam(slug, admin.email, "admin");
  const member = await t.signIn();
  const memberId = await addToTeam(slug, member.email, "member");
  return { slug, owner, admin, adminId, member, memberId };
}

const readTeam = (t: TestApp, slug: string, cookie?: string) =>
  t.client.api.workspaces[":slug"].team.$get(
    { param: { slug } },
    cookie ? { headers: { cookie } } : undefined
  );

const setRole = (
  t: TestApp,
  slug: string,
  userId: string,
  role: "admin" | "member",
  cookie: string
) =>
  t.client.api.workspaces[":slug"].members[":userId"].$patch(
    { param: { slug, userId }, json: { role } },
    { headers: { cookie } }
  );

const remove = (t: TestApp, slug: string, userId: string, cookie: string) =>
  t.client.api.workspaces[":slug"].members[":userId"].$delete(
    { param: { slug, userId } },
    { headers: { cookie } }
  );

async function ownerIdOf(t: TestApp, slug: string, cookie: string) {
  const body = await (await readTeam(t, slug, cookie)).json();
  return body.data.members[0]!.userId;
}

describe("GET /api/workspaces/:slug/team", () => {
  it("lists the team, owner first, with roles and addresses", async () => {
    const t = testApp();
    const { slug, owner, admin, member } = await teamOfThree(t);
    const res = await readTeam(t, slug, member.cookie);
    const body = await res.json();
    expect(body.data.members.map((m) => [m.email, m.role])).toEqual([
      [owner.email, "owner"],
      [admin.email, "admin"],
      [member.email, "member"],
    ]);
    expect(body.data.invitations).toEqual([]);
    await t.settle();
  });

  it("is only for the team", async () => {
    const t = testApp();
    const { slug } = await setupWorkspace(t);
    const outsider = await t.signIn();
    expect((await readTeam(t, slug, outsider.cookie)).status).toBe(403);
    expect((await readTeam(t, slug)).status).toBe(401);
    await t.settle();
  });

  it("leaves out the demo's made-up addresses", async () => {
    const t = testApp();
    const guest = await t.signInDemo("team");
    const body = await (await readTeam(t, "demo", guest.cookie)).json();
    expect(body.data.members.length).toBeGreaterThan(1);
    expect(body.data.members.every((m) => m.email === null)).toBe(true);
    await t.settle();
  });
});

describe("PATCH /api/workspaces/:slug/members/:userId", () => {
  it("lets the owner make a member an admin, and back", async () => {
    const t = testApp();
    const { slug, owner, memberId } = await teamOfThree(t);
    const up = await setRole(t, slug, memberId, "admin", owner.cookie);
    expect(up.status).toBe(200);
    const body = await up.json();
    if (!body.success) throw new Error(body.error);
    expect(body.data.members.find((m) => m.userId === memberId)?.role).toBe(
      "admin"
    );
    expect(
      (await setRole(t, slug, memberId, "member", owner.cookie)).status
    ).toBe(200);
    await t.settle();
  });

  it("lets an admin change another admin", async () => {
    const t = testApp();
    const { slug, admin, adminId, memberId } = await teamOfThree(t);
    await setRole(t, slug, memberId, "admin", admin.cookie);
    const res = await setRole(t, slug, memberId, "member", admin.cookie);
    expect(res.status).toBe(200);
    // An admin can step down too.
    expect(
      (await setRole(t, slug, adminId, "member", admin.cookie)).status
    ).toBe(200);
    await t.settle();
  });

  it("leaves roles to owners and admins", async () => {
    const t = testApp();
    const { slug, member, adminId } = await teamOfThree(t);
    const res = await setRole(t, slug, adminId, "member", member.cookie);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "ADMINS_ONLY" });
    await t.settle();
  });

  it("never changes the owner, and never makes another one", async () => {
    const t = testApp();
    const { slug, owner, admin, memberId } = await teamOfThree(t);
    const ownerId = await ownerIdOf(t, slug, owner.cookie);
    const res = await setRole(t, slug, ownerId, "member", admin.cookie);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "OWNER_PROTECTED" });
    const promote = await t.request(
      `/api/workspaces/${slug}/members/${memberId}`,
      {
        method: "PATCH",
        headers: {
          cookie: owner.cookie,
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({ role: "owner" }),
      }
    );
    expect(promote.status).toBe(400);
    await t.settle();
  });

  it("answers 404 for someone not on the team", async () => {
    const t = testApp();
    const { slug, owner } = await teamOfThree(t);
    const res = await setRole(t, slug, "nobody", "admin", owner.cookie);
    expect(res.status).toBe(404);
    await t.settle();
  });

  it("keeps the demo's team as it is", async () => {
    const t = testApp();
    const guest = await t.signInDemo("team");
    const body = await (await readTeam(t, "demo", guest.cookie)).json();
    const someone = body.data.members.at(-1)!.userId;
    const res = await setRole(t, "demo", someone, "admin", guest.cookie);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "DEMO_READ_ONLY" });
    await t.settle();
  });
});

describe("DELETE /api/workspaces/:slug/members/:userId", () => {
  it("lets an admin take a member off the team, who then loses its tools", async () => {
    const t = testApp();
    const { slug, admin, member, memberId } = await teamOfThree(t);
    const res = await remove(t, slug, memberId, admin.cookie);
    expect(res.status).toBe(200);
    expect((await readTeam(t, slug, member.cookie)).status).toBe(403);
    const me = await (
      await t.client.api.me.$get(undefined, {
        headers: { cookie: member.cookie },
      })
    ).json();
    expect(me.data?.workspaces.map((w) => w.slug)).not.toContain(slug);
    await t.settle();
  });

  it("lets anyone but the owner leave", async () => {
    const t = testApp();
    const { slug, owner, member, memberId } = await teamOfThree(t);
    expect((await remove(t, slug, memberId, member.cookie)).status).toBe(200);
    const ownerId = await ownerIdOf(t, slug, owner.cookie);
    const leave = await remove(t, slug, ownerId, owner.cookie);
    expect(leave.status).toBe(403);
    expect(await leave.json()).toMatchObject({ code: "OWNER_PROTECTED" });
    await t.settle();
  });

  it("leaves removing others to owners and admins, and never removes the owner", async () => {
    const t = testApp();
    const { slug, owner, admin, member, adminId } = await teamOfThree(t);
    const byMember = await remove(t, slug, adminId, member.cookie);
    expect(byMember.status).toBe(403);
    expect(await byMember.json()).toMatchObject({ code: "ADMINS_ONLY" });
    const ownerId = await ownerIdOf(t, slug, owner.cookie);
    const byAdmin = await remove(t, slug, ownerId, admin.cookie);
    expect(byAdmin.status).toBe(403);
    expect(await byAdmin.json()).toMatchObject({ code: "OWNER_PROTECTED" });
    await t.settle();
  });
});

describe("workspace settings", () => {
  it("are for owners and admins only", async () => {
    const t = testApp();
    const { slug, admin, member } = await teamOfThree(t);
    const rename = (cookie: string) =>
      t.client.api.workspaces[":slug"].$patch(
        { param: { slug }, json: { name: "Renamed" } },
        { headers: { cookie } }
      );
    const byMember = await rename(member.cookie);
    expect(byMember.status).toBe(403);
    expect(await byMember.json()).toMatchObject({ code: "ADMINS_ONLY" });
    const board = await t.client.api.workspaces[":slug"].boards.$post(
      { param: { slug }, json: { name: "Ideas" } },
      { headers: { cookie: member.cookie } }
    );
    expect(board.status).toBe(403);
    expect((await rename(admin.cookie)).status).toBe(200);
    await t.settle();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bunx vitest run worker/routes/team.test.ts`
Expected: FAIL, 12 of 13. The team routes don't exist yet, so they answer 404, and members can still change settings. "Answers 404 for someone not on the team" already passes, because a missing route answers 404 too.

- [ ] **Step 3: Implement**

Create `shared/team.ts`:

```ts
/** Roles on a workspace's team: Better Auth's organization roles. */
export const TEAM_ROLES = ["owner", "admin", "member"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

/** What an invitation or a role change can give: a workspace has one owner. */
export const ASSIGNABLE_ROLES = ["admin", "member"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

/** Owners and admins manage the team and the workspace's settings. */
export function managesTeam(role: string | undefined): boolean {
  return role === "owner" || role === "admin";
}

export type TeamMember = {
  userId: string;
  name: string;
  /** Null in the demo, where the addresses are made up. */
  email: string | null;
  role: TeamRole;
  joinedAt: string;
};

export type PendingInvitation = {
  id: string;
  email: string;
  role: AssignableRole;
  expiresAt: string;
  /** The inviter's display name; empty when they haven't set one. */
  invitedBy: string;
};

/** Settings → Team: the people on it, and who's been invited. */
export type TeamView = {
  members: TeamMember[];
  invitations: PendingInvitation[];
};
```

In `shared/envelope.ts`, replace:

```ts
  | "CODE_LIMIT"
  | "EMAIL_BUDGET";
```

with:

```ts
  | "CODE_LIMIT"
  | "EMAIL_BUDGET"
  | "ADMINS_ONLY"
  | "OWNER_PROTECTED";
```

In `shared/schemas.ts`, replace:

```ts
import { POST_STATUSES } from "./status";
```

with:

```ts
import { POST_STATUSES } from "./status";
import { ASSIGNABLE_ROLES } from "./team";
```

Append to `shared/schemas.ts`:

```ts
/** A role change on Settings → Team: admin or member, never owner. */
export const changeRoleSchema = z.object({ role: z.enum(ASSIGNABLE_ROLES) });
```

In `worker/middleware/team.ts`, replace:

```ts
import { createMiddleware } from "hono/factory";
```

with:

```ts
import { createMiddleware } from "hono/factory";
import { managesTeam } from "@/shared/team";
```

Append to `worker/middleware/team.ts`:

```ts
export const adminsOnly = () =>
  new AppError(
    403,
    "ADMINS_ONLY",
    "Only the workspace's owner and admins can do that"
  );

/**
 * Owners and admins only: the workspace's settings and its team. Runs after
 * requireTeam, and after readOnlyInDemo, so the demo's own answer comes first.
 */
export const requireAdmin = createMiddleware<TeamEnv>(async (c, next) => {
  if (!managesTeam(c.var.workspace.role)) throw adminsOnly();
  await next();
});
```

In `worker/routes/workspaces.ts`, replace:

```ts
import { requireTeam } from "../middleware/team";
```

with:

```ts
import { requireAdmin, requireTeam } from "../middleware/team";
```

The file's five settings routes each get `requireAdmin` after `readOnlyInDemo`.

In the same file, replace:

```ts
    readOnlyInDemo,
    validate("json", updateWorkspaceSchema),
```

with:

```ts
    readOnlyInDemo,
    requireAdmin,
    validate("json", updateWorkspaceSchema),
```

In the same file, replace:

```ts
    readOnlyInDemo,
    validate("json", createBoardSchema),
```

with:

```ts
    readOnlyInDemo,
    requireAdmin,
    validate("json", createBoardSchema),
```

In the same file, replace:

```ts
    readOnlyInDemo,
    validate("param", boardParamSchema),
    validate("json", renameBoardSchema),
```

with:

```ts
    readOnlyInDemo,
    requireAdmin,
    validate("param", boardParamSchema),
    validate("json", renameBoardSchema),
```

In the same file, replace:

```ts
    readOnlyInDemo,
    validate("param", boardParamSchema),
    async (c) => {
```

with:

```ts
    readOnlyInDemo,
    requireAdmin,
    validate("param", boardParamSchema),
    async (c) => {
```

In the same file, replace:

```ts
    readOnlyInDemo,
    validate("json", reorderBoardsSchema),
```

with:

```ts
    readOnlyInDemo,
    requireAdmin,
    validate("json", reorderBoardsSchema),
```

Create `worker/services/team-members.ts`:

```ts
import { and, asc, eq, sql } from "drizzle-orm";
import type {
  AssignableRole,
  PendingInvitation,
  TeamMember,
  TeamRole,
  TeamView,
} from "@/shared/team";
import type { Database } from "../db/client";
import { invitation, member, user as users } from "../db/schema";
import { AppError } from "../lib/errors";

/** What Settings → Team shows of a pending invitation; join the inviter as `users`. */
export const pendingInvitationColumns = {
  id: invitation.id,
  email: invitation.email,
  role: invitation.role,
  expiresAt: invitation.expiresAt,
  invitedBy: users.name,
};

export function toPendingInvitation(row: {
  id: string;
  email: string;
  role: string | null;
  expiresAt: Date;
  invitedBy: string | null;
}): PendingInvitation {
  return {
    id: row.id,
    email: row.email,
    role: row.role === "admin" ? "admin" : "member",
    expiresAt: row.expiresAt.toISOString(),
    invitedBy: row.invitedBy ?? "",
  };
}

/**
 * A workspace's team, owner first, then admins, then members, each group by
 * when they joined, and its pending invitations, oldest first. In the demo
 * the addresses are made up, so they're left out.
 */
export async function listTeam(
  db: Database,
  workspace: { id: string; isDemo: boolean }
): Promise<TeamView> {
  const people = await db
    .select({
      userId: member.userId,
      name: users.name,
      email: users.email,
      role: member.role,
      joinedAt: member.createdAt,
    })
    .from(member)
    .innerJoin(users, eq(users.id, member.userId))
    .where(eq(member.organizationId, workspace.id))
    .orderBy(
      sql`case ${member.role} when 'owner' then 0 when 'admin' then 1 else 2 end`,
      asc(member.createdAt)
    );
  const pending = workspace.isDemo
    ? []
    : await db
        .select(pendingInvitationColumns)
        .from(invitation)
        .leftJoin(users, eq(users.id, invitation.inviterId))
        .where(
          and(
            eq(invitation.organizationId, workspace.id),
            eq(invitation.status, "pending")
          )
        )
        .orderBy(asc(invitation.createdAt));
  return {
    members: people.map(
      (row): TeamMember => ({
        userId: row.userId,
        name: row.name,
        email: workspace.isDemo ? null : row.email,
        role: row.role as TeamRole,
        joinedAt: row.joinedAt.toISOString(),
      })
    ),
    invitations: pending.map(toPendingInvitation),
  };
}

/** The membership `userId` has on the workspace's team; the owner's can't change. */
async function changeableMember(
  db: Database,
  workspaceId: string,
  userId: string
) {
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(eq(member.organizationId, workspaceId), eq(member.userId, userId))
    )
    .limit(1);
  if (!row)
    throw new AppError(404, "NOT_FOUND", "That person isn't on the team");
  if (row.role === "owner") {
    throw new AppError(
      403,
      "OWNER_PROTECTED",
      "The workspace's owner can't be changed or removed"
    );
  }
}

/** Makes someone on the team an admin or a member. */
export async function changeRole(
  db: Database,
  input: { workspaceId: string; userId: string; role: AssignableRole }
) {
  await changeableMember(db, input.workspaceId, input.userId);
  await db
    .update(member)
    .set({ role: input.role })
    .where(
      and(
        eq(member.organizationId, input.workspaceId),
        eq(member.userId, input.userId)
      )
    );
}

/** Takes someone off the team: removed by an admin, or leaving. */
export async function removeMember(
  db: Database,
  input: { workspaceId: string; userId: string }
) {
  await changeableMember(db, input.workspaceId, input.userId);
  await db
    .delete(member)
    .where(
      and(
        eq(member.organizationId, input.workspaceId),
        eq(member.userId, input.userId)
      )
    );
}
```

Create `worker/routes/team.ts`:

```ts
import { Hono } from "hono";
import type { SuccessResponse } from "@/shared/envelope";
import { changeRoleSchema } from "@/shared/schemas";
import { managesTeam, type TeamView } from "@/shared/team";
import type { AppEnv } from "../env";
import { validate } from "../lib/validate";
import { readOnlyInDemo } from "../middleware/demo";
import { requireUser } from "../middleware/session";
import { adminsOnly, requireAdmin, requireTeam } from "../middleware/team";
import { changeRole, listTeam, removeMember } from "../services/team-members";

/**
 * Under /workspaces: Settings → Team. Everyone on the team sees it; owners
 * and admins change roles and remove people, and anyone but the owner can
 * leave. The demo's team stays as the nightly reset makes it.
 */
export const workspaceTeamRoutes = new Hono<AppEnv>()
  .get("/:slug/team", requireUser, requireTeam, async (c) => {
    return c.json<SuccessResponse<TeamView>>({
      success: true,
      data: await listTeam(c.var.db, c.var.workspace),
    });
  })
  .patch(
    "/:slug/members/:userId",
    requireUser,
    requireTeam,
    readOnlyInDemo,
    requireAdmin,
    validate("json", changeRoleSchema),
    async (c) => {
      await changeRole(c.var.db, {
        workspaceId: c.var.workspace.id,
        userId: c.req.param("userId"),
        role: c.req.valid("json").role,
      });
      return c.json<SuccessResponse<TeamView>>({
        success: true,
        data: await listTeam(c.var.db, c.var.workspace),
      });
    }
  )
  .delete(
    "/:slug/members/:userId",
    requireUser,
    requireTeam,
    readOnlyInDemo,
    async (c) => {
      const userId = c.req.param("userId");
      const leaving = userId === c.var.user.id;
      if (!leaving && !managesTeam(c.var.workspace.role)) throw adminsOnly();
      await removeMember(c.var.db, {
        workspaceId: c.var.workspace.id,
        userId,
      });
      return c.json<SuccessResponse<{ userId: string }>>({
        success: true,
        data: { userId },
      });
    }
  );
```

In `worker/app.ts`, replace:

```ts
import { workspaceRoadmapRoutes } from "./routes/roadmap";
```

with:

```ts
import { workspaceRoadmapRoutes } from "./routes/roadmap";
import { workspaceTeamRoutes } from "./routes/team";
```

In the same file, replace:

```ts
    .route("/workspaces", workspaceRoadmapRoutes)
```

with:

```ts
    .route("/workspaces", workspaceRoadmapRoutes)
    .route("/workspaces", workspaceTeamRoutes)
```

Merge into `src/i18n/messages/en.json`, adding each key at the end of its section:

```json
{
  "errors": {
    "ADMINS_ONLY": "Only the workspace's owner and admins can do that.",
    "OWNER_PROTECTED": "The workspace's owner stays its owner: they can't be changed, removed or leave."
  }
}
```

Merge into `src/i18n/messages/tr.json`, adding each key at the end of its section:

```json
{
  "errors": {
    "ADMINS_ONLY": "Bunu yalnızca çalışma alanının sahibi ve yöneticileri yapabilir.",
    "OWNER_PROTECTED": "Çalışma alanının sahibi değiştirilemez, ekipten çıkarılamaz ve ayrılamaz."
  }
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `bunx vitest run worker/routes/team.test.ts worker/routes/workspaces.test.ts src/i18n/messages.test.ts`
Expected: PASS.

- [ ] **Step 5: Run everything and commit**

Run: `bun run typecheck && bun run check && bun run test`
Expected: all pass, 71 files and 558 tests.

```bash
git add shared worker src
git commit -m "feat: owners and admins manage the team and the settings; members can leave" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Sending invitations

**Files:**
- Create: `worker/middleware/mailer.ts`, `worker/services/invitations.ts`, `worker/routes/invitations.ts`, `worker/routes/invitations.test.ts`
- Modify:
  - shared: `shared/slug.ts`, `shared/slug.test.ts`, `shared/team.ts`, `shared/envelope.ts`, `shared/schemas.ts`
  - mail: `worker/mail/templates.ts`, `worker/mail/templates.test.ts`, `worker/mail/mailer.ts`, `worker/mail/mailer.test.ts`
  - worker: `worker/middleware/auth.ts`, `worker/env.ts`, `worker/app.ts`, `worker/auth.ts`
  - tests: `worker/test/app.ts`, `worker/routes/me.test.ts`
  - messages: `src/i18n/messages/en.json`, `src/i18n/messages/tr.json`

**Interfaces:**
- Consumes:
  - Task 1's `claimDailyEmail`
  - Task 5's `requireAdmin`, `pendingInvitationColumns`, `toPendingInvitation`, `PendingInvitation`, `ASSIGNABLE_ROLES`
  - Task 4's `addToTeam` (in the tests)
- Produces:
  - `shared/team.ts`:
    - limits `TEAM_SIZE = 50`, `PENDING_INVITATIONS = 20`, `INVITATION_DAYS = 7`
    - `SentInvitation { invitation: PendingInvitation; emailSent: boolean }`
  - `inviteSchema` `{ email, role }`
  - error codes `ALREADY_ON_TEAM`, `TOO_MANY_INVITATIONS`, `TEAM_FULL` (409)
  - "invite" becomes a reserved workspace address
  - Mail:
    - `InvitationNotice { to; locale; inviter; workspaceName; role; url; expiresAt: Date }` and `invitationEmail(notice)`
    - `Mailer.sendInvitation(message)`
    - `AppMailer = Pick<Mailer, "sendSignInCode" | "sendInvitation">`
    - `capturingMailer().invited`
  - Request mailer:
    - `withMailer(mailer?)` sets `c.var.mailer: AppMailer`
    - `withAuth` is now a plain middleware, not a function of the mailer
    - `AppDeps = { mailer?: AppMailer }`
  - `worker/services/invitations.ts`: `fromBetterAuth(err): never`, `findPending(db, workspaceId, id)`, `refuseFullTeam(db, workspaceId)`, `workspaceLocale(db, workspaceId)`
  - Routes (owners and admins), answering `SentInvitation`:
    - `POST /api/workspaces/:slug/invitations` `{ email, role }`
    - `POST /api/workspaces/:slug/invitations/:id/resend`
    - `DELETE /api/workspaces/:slug/invitations/:id`

- [ ] **Step 1: Write the failing tests**

In `worker/test/app.ts`, replace:

```ts
import type { Mailer, ShippedNotice, SignInCode } from "../mail/mailer";
```

with:

```ts
import type {
  InvitationNotice,
  Mailer,
  ShippedNotice,
  SignInCode,
} from "../mail/mailer";
```

In the same file, replace:

```ts
  const shipped: ShippedNotice[] = [];
```

with:

```ts
  const shipped: ShippedNotice[] = [];
  const invited: InvitationNotice[] = [];
```

In the same file, replace:

```ts
    async sendShipped(message) {
      shipped.push(message);
    },
  };
  return { mailer, sent, shipped };
```

with:

```ts
    async sendShipped(message) {
      shipped.push(message);
    },
    async sendInvitation(message) {
      invited.push(message);
    },
  };
  return { mailer, sent, shipped, invited };
```

Create `worker/routes/invitations.test.ts`:

```ts
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { emailCounters, invitation, member, user } from "../db/schema";
import { resetDemo } from "../services/demo-reset";
import { NOTICE_EMAILS, utcDay } from "../services/email-budget";
import { ORIGIN, testApp } from "../test/app";
import { testDb } from "../test/db";
import { addToTeam, setupWorkspace } from "../test/fixtures";

const { db, close } = testDb();
beforeAll(() => resetDemo(db));
afterAll(() => close());

type TestApp = ReturnType<typeof testApp>;

const invite = (
  t: TestApp,
  slug: string,
  email: string,
  cookie: string,
  role: "admin" | "member" = "member"
) =>
  t.client.api.workspaces[":slug"].invitations.$post(
    { param: { slug }, json: { email, role } },
    { headers: { cookie } }
  );

const resend = (t: TestApp, slug: string, id: string, cookie: string) =>
  t.client.api.workspaces[":slug"].invitations[":id"].resend.$post(
    { param: { slug, id } },
    { headers: { cookie } }
  );

const cancel = (t: TestApp, slug: string, id: string, cookie: string) =>
  t.client.api.workspaces[":slug"].invitations[":id"].$delete(
    { param: { slug, id } },
    { headers: { cookie } }
  );

async function pendingOf(t: TestApp, slug: string, cookie: string) {
  const res = await t.client.api.workspaces[":slug"].team.$get(
    { param: { slug } },
    { headers: { cookie } }
  );
  return (await res.json()).data.invitations;
}

/** The invitation's id from a successful invite. */
async function invitationId(res: Awaited<ReturnType<typeof invite>>) {
  const body = await res.json();
  if (!body.success) throw new Error(body.error);
  return body.data.invitation.id;
}

const address = () => `invitee-${crypto.randomUUID().slice(0, 8)}@example.com`;

describe("POST /api/workspaces/:slug/invitations", () => {
  it("invites an address by email, in the workspace's language", async () => {
    const t = testApp();
    const { owner, slug } = await setupWorkspace(t, { defaultLocale: "tr" });
    const res = await invite(t, slug, "Sam@Studio.dev", owner.cookie);
    expect(res.status).toBe(201);
    const body = await res.json();
    if (!body.success) throw new Error(body.error);
    expect(body.data).toMatchObject({
      emailSent: true,
      invitation: { email: "sam@studio.dev", role: "member" },
    });
    const days =
      (Date.parse(body.data.invitation.expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
    // The owner has no name yet, so the email speaks for the workspace.
    expect(t.mail.invited).toEqual([
      {
        to: "sam@studio.dev",
        locale: "tr",
        inviter: "Acme",
        workspaceName: "Acme",
        role: "member",
        url: `${ORIGIN}/invite/${body.data.invitation.id}`,
        expiresAt: expect.any(Date),
      },
    ]);
    expect(
      (await pendingOf(t, slug, owner.cookie)).map((i) => i.email)
    ).toEqual(["sam@studio.dev"]);
    await t.settle();
  });

  it("sends a waiting invitation again instead of making a second one", async () => {
    const t = testApp();
    const { owner, slug } = await setupWorkspace(t);
    const email = address();
    const first = await invitationId(
      await invite(t, slug, email, owner.cookie)
    );
    const again = await invitationId(
      await invite(t, slug, email, owner.cookie)
    );
    expect(again).toBe(first);
    expect(t.mail.invited).toHaveLength(2);
    expect(await pendingOf(t, slug, owner.cookie)).toHaveLength(1);
    await t.settle();
  });

  it("refuses someone already on the team", async () => {
    const t = testApp();
    const { owner, slug } = await setupWorkspace(t);
    const teammate = await t.signIn();
    await addToTeam(slug, teammate.email, "member");
    const res = await invite(t, slug, teammate.email, owner.cookie);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "ALREADY_ON_TEAM" });
    await t.settle();
  });

  it("leaves inviting to owners and admins", async () => {
    const t = testApp();
    const { slug } = await setupWorkspace(t);
    const admin = await t.signIn();
    await addToTeam(slug, admin.email, "admin");
    const member = await t.signIn();
    await addToTeam(slug, member.email, "member");
    const byMember = await invite(t, slug, address(), member.cookie);
    expect(byMember.status).toBe(403);
    expect(await byMember.json()).toMatchObject({ code: "ADMINS_ONLY" });
    const byAdmin = await invite(t, slug, address(), admin.cookie, "admin");
    expect(byAdmin.status).toBe(201);
    await t.settle();
  });

  it("keeps the demo's team as it is", async () => {
    const t = testApp();
    const guest = await t.signInDemo("team");
    const res = await invite(t, "demo", address(), guest.cookie);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "DEMO_READ_ONLY" });
    await t.settle();
  });

  it("stops at 20 waiting invitations", async () => {
    const t = testApp();
    const { owner, slug } = await setupWorkspace(t);
    for (let i = 0; i < 20; i++) {
      expect((await invite(t, slug, address(), owner.cookie)).status).toBe(201);
    }
    const res = await invite(t, slug, address(), owner.cookie);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "TOO_MANY_INVITATIONS" });
    await t.settle();
  });

  it("stops once the team has 50 people", async () => {
    const t = testApp();
    const { owner, slug } = await setupWorkspace(t);
    const [workspace] = await db
      .select({ organizationId: member.organizationId })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(user.email, owner.email));
    const people = Array.from({ length: 49 }, () => {
      const id = crypto.randomUUID();
      return { id, name: "", email: `full-${id.slice(0, 8)}@example.com` };
    });
    await db.insert(user).values(people);
    await db.insert(member).values(
      people.map((person) => ({
        id: crypto.randomUUID(),
        organizationId: workspace!.organizationId,
        userId: person.id,
        role: "member",
        createdAt: new Date(),
      }))
    );
    const res = await invite(t, slug, address(), owner.cookie);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "TEAM_FULL" });
    await t.settle();
  });

  it("keeps the invitation when its email couldn't be sent", async () => {
    const t = testApp();
    const { owner, slug } = await setupWorkspace(t);
    t.mail.mailer.sendInvitation = async () => {
      throw new Error("Brevo is down");
    };
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await invite(t, slug, address(), owner.cookie);
    logged.mockRestore();
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ data: { emailSent: false } });
    expect(await pendingOf(t, slug, owner.cookie)).toHaveLength(1);
    await t.settle();
  });

  it("draws on the day's email budget in production", async () => {
    const t = testApp({ ENVIRONMENT: "production" });
    const { owner, slug } = await setupWorkspace(t);
    const today = utcDay(new Date());
    await db
      .insert(emailCounters)
      .values({ key: "daily", windowStart: today, count: NOTICE_EMAILS })
      .onConflictDoUpdate({
        target: [emailCounters.key, emailCounters.windowStart],
        set: { count: NOTICE_EMAILS },
      });
    try {
      const res = await invite(t, slug, address(), owner.cookie);
      expect(res.status).toBe(429);
      expect(await res.json()).toMatchObject({ code: "EMAIL_BUDGET" });
      expect(await pendingOf(t, slug, owner.cookie)).toEqual([]);
    } finally {
      // Later tests send email today too.
      await db
        .delete(emailCounters)
        .where(
          and(
            eq(emailCounters.key, "daily"),
            eq(emailCounters.windowStart, today)
          )
        );
      await t.settle();
    }
  });

  it("lets one person send ten an hour in production", async () => {
    const t = testApp({ ENVIRONMENT: "production" });
    const { owner, slug } = await setupWorkspace(t);
    for (let i = 0; i < 10; i++) {
      expect((await invite(t, slug, address(), owner.cookie)).status).toBe(201);
    }
    const res = await invite(t, slug, address(), owner.cookie);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "RATE_LIMITED" });
    await t.settle();
  });
});

describe("resending and cancelling", () => {
  it("sends an invitation again with a fresh expiry", async () => {
    const t = testApp();
    const { owner, slug } = await setupWorkspace(t);
    const id = await invitationId(
      await invite(t, slug, address(), owner.cookie)
    );
    await db
      .update(invitation)
      .set({ expiresAt: new Date(Date.now() - 86_400_000) })
      .where(eq(invitation.id, id));
    const res = await resend(t, slug, id, owner.cookie);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Date.parse(body.data.invitation.expiresAt)).toBeGreaterThan(
      Date.now() + 6 * 86_400_000
    );
    expect(t.mail.invited).toHaveLength(2);
    await t.settle();
  });

  it("cancels an invitation", async () => {
    const t = testApp();
    const { owner, slug } = await setupWorkspace(t);
    const id = await invitationId(
      await invite(t, slug, address(), owner.cookie)
    );
    expect((await cancel(t, slug, id, owner.cookie)).status).toBe(200);
    expect(await pendingOf(t, slug, owner.cookie)).toEqual([]);
    expect((await resend(t, slug, id, owner.cookie)).status).toBe(404);
    await t.settle();
  });

  it("answers 404 for another workspace's invitation", async () => {
    const t = testApp();
    const ours = await setupWorkspace(t);
    const theirs = await setupWorkspace(t);
    const id = await invitationId(
      await invite(t, theirs.slug, address(), theirs.owner.cookie)
    );
    expect((await resend(t, ours.slug, id, ours.owner.cookie)).status).toBe(
      404
    );
    expect((await cancel(t, ours.slug, id, ours.owner.cookie)).status).toBe(
      404
    );
    await t.settle();
  });
});
```

In `worker/mail/templates.test.ts`, replace:

```ts
import { shippedEmail } from "./templates";
```

with:

```ts
import { invitationEmail, shippedEmail } from "./templates";
```

Append to `worker/mail/templates.test.ts`:

```ts
describe("invitationEmail", () => {
  const invitation = {
    locale: "en" as const,
    inviter: "Defne",
    workspaceName: "Inkwell",
    role: "admin" as const,
    url: "https://pano.example/invite/abc123",
    expiresAt: new Date(Date.UTC(2026, 10, 6, 12)),
  };

  it("says who invites, to what, as what, and until when", () => {
    const email = invitationEmail(invitation);
    expect(email.subject).toBe("Defne invited you to Inkwell on Pano");
    expect(email.text).toContain(
      "Defne invited you to join Inkwell's team on Pano as an admin."
    );
    expect(email.text).toContain(
      "Join the team: https://pano.example/invite/abc123"
    );
    expect(email.text).toContain("The link works until November 6, 2026.");
    expect(email.html).toContain(
      '<a href="https://pano.example/invite/abc123">'
    );
  });

  it("writes Turkish for a Turkish workspace", () => {
    const email = invitationEmail({
      ...invitation,
      locale: "tr",
      role: "member",
    });
    expect(email.subject).toBe("Defne sizi Pano'da Inkwell ekibine davet etti");
    expect(email.text).toContain(
      "Defne sizi Pano'da Inkwell ekibine üye olarak katılmaya davet etti."
    );
    expect(email.text).toContain("6 Kasım 2026 tarihine kadar geçerli");
  });

  it("escapes names in the HTML and keeps the subject on one line", () => {
    const email = invitationEmail({
      ...invitation,
      inviter: "<b>Eve</b>\nTwo",
    });
    expect(email.subject).toBe("<b>Eve</b> Two invited you to Inkwell on Pano");
    expect(email.html).toContain("&lt;b&gt;Eve&lt;/b&gt; Two invited you");
    expect(email.html).not.toContain("<b>Eve</b>");
  });
});
```

In `worker/mail/mailer.test.ts`, replace:

```ts
  it("fails when Brevo refuses the email", async () => {
```

with:

```ts
  it("sends an invitation through Brevo", async () => {
    const send = vi.fn<SendFn>(accepted);
    await brevoMailer("k", "hello@pano.example", send).sendInvitation({
      to: "sam@studio.dev",
      locale: "en",
      inviter: "Defne",
      workspaceName: "Inkwell",
      role: "member",
      url: "https://pano.example/invite/abc123",
      expiresAt: new Date(Date.UTC(2026, 10, 6)),
    });
    const body = JSON.parse(String(send.mock.calls[0]![1].body));
    expect(body).toMatchObject({
      to: [{ email: "sam@studio.dev" }],
      subject: "Defne invited you to Inkwell on Pano",
    });
    expect(body.textContent).toContain("https://pano.example/invite/abc123");
  });

  it("fails when Brevo refuses the email", async () => {
```

In `shared/slug.test.ts`, replace:

```ts
  it.each(["api", "signin", "new-workspace", "p", "demo", "pano"])(
```

with:

```ts
  it.each(["api", "signin", "new-workspace", "p", "demo", "pano", "invite"])(
```

- [ ] **Step 2: Run them to see them fail**

Run: `bunx vitest run worker/routes/invitations.test.ts worker/mail/templates.test.ts worker/mail/mailer.test.ts shared/slug.test.ts`
Expected: FAIL.
- **Invitation routes:** they don't exist yet, so they answer 404.
- **Mail:** `invitationEmail` and `sendInvitation` aren't functions yet.
- **Slugs:** "invite" isn't reserved.

- [ ] **Step 3: Implement**

In `shared/slug.ts`, replace:

```ts
  "help",
  "login",
```

with:

```ts
  "help",
  "invite",
  "login",
```

Append to `shared/team.ts`:

```ts
/** The most people a workspace's team can have. */
export const TEAM_SIZE = 50;

/** The most invitations a workspace can have waiting at once. */
export const PENDING_INVITATIONS = 20;

/** How long an invitation's link works. */
export const INVITATION_DAYS = 7;

/** An invitation sent, or sent again, and whether its email went out. */
export type SentInvitation = {
  invitation: PendingInvitation;
  emailSent: boolean;
};
```

In `shared/envelope.ts`, replace:

```ts
  | "ADMINS_ONLY"
  | "OWNER_PROTECTED";
```

with:

```ts
  | "ADMINS_ONLY"
  | "OWNER_PROTECTED"
  | "ALREADY_ON_TEAM"
  | "TOO_MANY_INVITATIONS"
  | "TEAM_FULL";
```

Append to `shared/schemas.ts`:

```ts
/** An invitation from Settings → Team. */
export const inviteSchema = z.object({
  email: z.email(),
  role: z.enum(ASSIGNABLE_ROLES),
});
```

Append to `worker/mail/templates.ts`:

```ts
/** An invitation to a workspace's team, for the invited address. */
export type InvitationNotice = {
  to: string;
  locale: Locale;
  /** Who's inviting: their display name, or the workspace's when they have none. */
  inviter: string;
  workspaceName: string;
  role: "admin" | "member";
  /** The invitation's page on Pano. */
  url: string;
  expiresAt: Date;
};

const invitationCopy = {
  en: {
    subject: (inviter: string, workspace: string) =>
      `${inviter} invited you to ${workspace} on Pano`,
    intro: (inviter: string, workspace: string, role: "admin" | "member") =>
      `${inviter} invited you to join ${workspace}'s team on Pano as ${role === "admin" ? "an admin" : "a member"}.`,
    link: "Join the team",
    expiry: (date: string) =>
      `The link works until ${date}. If you weren't expecting this, you can ignore it.`,
  },
  tr: {
    subject: (inviter: string, workspace: string) =>
      `${inviter} sizi Pano'da ${workspace} ekibine davet etti`,
    intro: (inviter: string, workspace: string, role: "admin" | "member") =>
      `${inviter} sizi Pano'da ${workspace} ekibine ${role === "admin" ? "yönetici" : "üye"} olarak katılmaya davet etti.`,
    link: "Ekibe katılın",
    expiry: (date: string) =>
      `Bağlantı ${date} tarihine kadar geçerli. Bu daveti beklemiyorsanız görmezden gelebilirsiniz.`,
  },
} satisfies Record<Locale, unknown>;

/** The email an invited address gets, in the workspace's language. */
export function invitationEmail(notice: Omit<InvitationNotice, "to">) {
  const c = invitationCopy[notice.locale];
  // Names are people's text; a subject is one line.
  const inviter = notice.inviter.replace(/\s+/g, " ");
  const workspace = notice.workspaceName.replace(/\s+/g, " ");
  const date = new Intl.DateTimeFormat(notice.locale, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(notice.expiresAt);
  const intro = c.intro(inviter, workspace, notice.role);
  const text = [intro, `${c.link}: ${notice.url}`, c.expiry(date)].join("\n\n");
  const html = [
    `<p>${escapeHtml(intro)}</p>`,
    `<p><a href="${escapeHtml(notice.url)}">${escapeHtml(c.link)}</a></p>`,
    `<p style="color:#666;font-size:12px">${escapeHtml(c.expiry(date))}</p>`,
  ].join("");
  return { subject: c.subject(inviter, workspace), text, html };
}
```

In `worker/mail/mailer.ts`, replace:

```ts
import { type ShippedNotice, shippedEmail, signInCodeEmail } from "./templates";

export type { ShippedNotice } from "./templates";
```

with:

```ts
import {
  type InvitationNotice,
  invitationEmail,
  type ShippedNotice,
  shippedEmail,
  signInCodeEmail,
} from "./templates";

export type { InvitationNotice, ShippedNotice } from "./templates";
```

In the same file, replace:

```ts
  sendShipped(message: ShippedNotice): Promise<void>;
}

/** What sign-in needs from a mailer. */
export type CodeMailer = Pick<Mailer, "sendSignInCode">;
```

with:

```ts
  sendShipped(message: ShippedNotice): Promise<void>;
  sendInvitation(message: InvitationNotice): Promise<void>;
}

/** What sign-in needs from a mailer. */
export type CodeMailer = Pick<Mailer, "sendSignInCode">;

/** What the API's routes send: sign-in codes and invitations. */
export type AppMailer = Pick<Mailer, "sendSignInCode" | "sendInvitation">;
```

In the same file, replace:

```ts
    console.log(`[mail] shipped notice for ${to}: ${title} ${url}`);
  },
```

with:

```ts
    console.log(`[mail] shipped notice for ${to}: ${title} ${url}`);
  },
  async sendInvitation({ to, url }) {
    console.log(`[mail] invitation for ${to}: ${url}`);
  },
```

In the same file, replace:

```ts
    sendShipped: (message) => deliver(message.to, shippedEmail(message)),
```

with:

```ts
    sendShipped: (message) => deliver(message.to, shippedEmail(message)),
    sendInvitation: (message) => deliver(message.to, invitationEmail(message)),
```

Create `worker/middleware/mailer.ts`:

```ts
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";
import { type AppMailer, mailerFor } from "../mail/mailer";

/**
 * The request's mailer. Tests pass their own; otherwise it picks Brevo or
 * the console on first use, so a missing Brevo key can't break routes that
 * send nothing.
 */
export const withMailer = (mailer?: AppMailer) =>
  createMiddleware<AppEnv>(async (c, next) => {
    c.set(
      "mailer",
      mailer ?? {
        sendSignInCode: (message) => mailerFor(c.env).sendSignInCode(message),
        sendInvitation: (message) => mailerFor(c.env).sendInvitation(message),
      }
    );
    await next();
  });
```

Replace the whole of `worker/middleware/auth.ts` with:

```ts
import { createMiddleware } from "hono/factory";
import { createAuth } from "../auth";
import type { AppEnv } from "../env";
import type { CodeMailer } from "../mail/mailer";
import { claimCodeForAddress, claimDailyEmail } from "../services/email-budget";

/**
 * Builds Better Auth for this request; runs after withMailer.
 *
 * In production a code first takes its place in two limits: three per
 * address in ten minutes, and the day's email budget. A code either limit
 * refuses isn't sent, and the /auth route says which one.
 */
export const withAuth = createMiddleware<AppEnv>(async (c, next) => {
  const mail: AppEnv["Variables"]["mail"] = { failed: false };
  const codes: CodeMailer = {
    async sendSignInCode(message) {
      if (c.env.ENVIRONMENT === "production") {
        if (!(await claimCodeForAddress(c.var.db, message.to))) {
          mail.refused = "CODE_LIMIT";
          return;
        }
        if (!(await claimDailyEmail(c.var.db, "code"))) {
          mail.refused = "EMAIL_BUDGET";
          return;
        }
      }
      try {
        await c.var.mailer.sendSignInCode(message);
      } catch (err) {
        // Better Auth logs the error but still answers 200, so remember it
        // for the /auth route to report.
        mail.failed = true;
        throw err;
      }
    },
  };
  c.set("mail", mail);
  c.set("auth", createAuth({ db: c.var.db, env: c.env, mailer: codes }));
  await next();
});
```

In `worker/env.ts`, replace:

```ts
import type { Database } from "./db/client";
```

with:

```ts
import type { Database } from "./db/client";
import type { AppMailer } from "./mail/mailer";
```

In the same file, replace:

```ts
    auth: Auth;
```

with:

```ts
    auth: Auth;
    /** Sign-in codes and invitations go out through this. */
    mailer: AppMailer;
```

In `worker/auth.ts`, replace:

```ts
import { isDemoEmail } from "@/shared/demo";
```

with:

```ts
import { isDemoEmail } from "@/shared/demo";
import { INVITATION_DAYS, PENDING_INVITATIONS, TEAM_SIZE } from "@/shared/team";
```

In the same file, replace:

```ts
          return owned !== undefined;
        },
```

with:

```ts
          return owned !== undefined;
        },
        // Pano's routes check these first and say why; Better Auth's own
        // checks back them up. Pano sends the invitation emails itself.
        invitationExpiresIn: INVITATION_DAYS * 24 * 60 * 60,
        invitationLimit: PENDING_INVITATIONS,
        membershipLimit: TEAM_SIZE,
```

Create `worker/services/invitations.ts`:

```ts
import { APIError } from "better-auth/api";
import { and, count, eq } from "drizzle-orm";
import type { Locale } from "@/shared/locale";
import { type PendingInvitation, TEAM_SIZE } from "@/shared/team";
import type { Database } from "../db/client";
import {
  invitation,
  member,
  user as users,
  workspaceSettings,
} from "../db/schema";
import { AppError } from "../lib/errors";
import { pendingInvitationColumns, toPendingInvitation } from "./team-members";

const teamFull = () =>
  new AppError(409, "TEAM_FULL", `A team can have ${TEAM_SIZE} people`);

/** Better Auth's refusals as Pano's codes; anything else is rethrown. */
export function fromBetterAuth(err: unknown): never {
  if (err instanceof APIError) {
    const code = (err.body as { code?: string } | undefined)?.code;
    if (code === "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION") {
      throw new AppError(
        409,
        "ALREADY_ON_TEAM",
        "That person is already on the team"
      );
    }
    if (code === "INVITATION_LIMIT_REACHED") {
      throw new AppError(
        409,
        "TOO_MANY_INVITATIONS",
        "This workspace has too many invitations waiting"
      );
    }
    if (code === "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED") throw teamFull();
  }
  throw err;
}

/** One of the workspace's pending invitations, as Settings → Team lists it. */
export async function findPending(
  db: Database,
  workspaceId: string,
  id: string
): Promise<PendingInvitation> {
  const [row] = await db
    .select(pendingInvitationColumns)
    .from(invitation)
    .leftJoin(users, eq(users.id, invitation.inviterId))
    .where(
      and(
        eq(invitation.id, id),
        eq(invitation.organizationId, workspaceId),
        eq(invitation.status, "pending")
      )
    )
    .limit(1);
  if (!row) throw new AppError(404, "NOT_FOUND", "No such invitation");
  return toPendingInvitation(row);
}

/** Refuses another invitation once the team is as big as it can be. */
export async function refuseFullTeam(db: Database, workspaceId: string) {
  const [row] = await db
    .select({ people: count() })
    .from(member)
    .where(eq(member.organizationId, workspaceId));
  if ((row?.people ?? 0) >= TEAM_SIZE) throw teamFull();
}

/** Invitations are written in the workspace's language. */
export async function workspaceLocale(
  db: Database,
  workspaceId: string
): Promise<Locale> {
  const [row] = await db
    .select({ locale: workspaceSettings.defaultLocale })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);
  return row?.locale ?? "en";
}
```

Create `worker/routes/invitations.ts`:

```ts
import { Hono } from "hono";
import type { SuccessResponse } from "@/shared/envelope";
import { inviteSchema } from "@/shared/schemas";
import type { AssignableRole, SentInvitation } from "@/shared/team";
import type { Auth } from "../auth";
import type { Database } from "../db/client";
import type { AppEnv, Bindings } from "../env";
import { AppError } from "../lib/errors";
import { validate } from "../lib/validate";
import type { AppMailer } from "../mail/mailer";
import { readOnlyInDemo } from "../middleware/demo";
import { rateLimit } from "../middleware/rate-limit";
import { requireUser } from "../middleware/session";
import {
  requireAdmin,
  requireTeam,
  type TeamWorkspace,
} from "../middleware/team";
import { claimDailyEmail } from "../services/email-budget";
import {
  findPending,
  fromBetterAuth,
  refuseFullTeam,
  workspaceLocale,
} from "../services/invitations";

/** Invitations and resends one person can send an hour, in production. */
const INVITES_PER_HOUR = 10;

/** In production every invitation takes one of the day's emails first. */
async function claimEmail(db: Database, env: Bindings) {
  if (
    env.ENVIRONMENT === "production" &&
    !(await claimDailyEmail(db, "notice"))
  ) {
    throw new AppError(429, "EMAIL_BUDGET", "Today's email is spent");
  }
}

/**
 * Invites `email` through Better Auth, which checks the inviter's role and
 * whether the address is on the team already. A pending invitation for the
 * same address gets a fresh expiry instead of a twin. Answers its id.
 */
async function invite(
  auth: Auth,
  headers: Headers,
  input: { organizationId: string; email: string; role: AssignableRole }
) {
  try {
    const sent = await auth.api.createInvitation({
      body: { ...input, resend: true },
      headers,
    });
    return sent.id;
  } catch (err) {
    fromBetterAuth(err);
  }
}

/**
 * Emails the invitation in the workspace's language, from the person
 * sending it (or the workspace, when they have no name). A failed email
 * leaves the invitation waiting, and the answer says so.
 */
async function emailInvitation(
  deps: {
    db: Database;
    mailer: AppMailer;
    origin: string;
    workspace: TeamWorkspace;
    senderName: string;
  },
  id: string
): Promise<SentInvitation> {
  const invitation = await findPending(deps.db, deps.workspace.id, id);
  try {
    await deps.mailer.sendInvitation({
      to: invitation.email,
      locale: await workspaceLocale(deps.db, deps.workspace.id),
      inviter: deps.senderName || deps.workspace.name,
      workspaceName: deps.workspace.name,
      role: invitation.role,
      url: new URL(`/invite/${invitation.id}`, deps.origin).toString(),
      expiresAt: new Date(invitation.expiresAt),
    });
    return { invitation, emailSent: true };
  } catch (err) {
    console.error("[invite] the email couldn't be sent:", err);
    return { invitation, emailSent: false };
  }
}

/**
 * Under /workspaces: inviting people to the team, and resending and
 * cancelling invitations. Owners and admins only; never in the demo.
 */
export const workspaceInvitationRoutes = new Hono<AppEnv>()
  .post(
    "/:slug/invitations",
    requireUser,
    requireTeam,
    readOnlyInDemo,
    requireAdmin,
    validate("json", inviteSchema),
    rateLimit("invite", INVITES_PER_HOUR, 3600),
    async (c) => {
      const { email, role } = c.req.valid("json");
      const workspace = c.var.workspace;
      await refuseFullTeam(c.var.db, workspace.id);
      await claimEmail(c.var.db, c.env);
      const id = await invite(c.var.auth, c.req.raw.headers, {
        organizationId: workspace.id,
        email: email.toLowerCase(),
        role,
      });
      const sent = await emailInvitation(
        {
          db: c.var.db,
          mailer: c.var.mailer,
          origin: c.env.BETTER_AUTH_URL,
          workspace,
          senderName: c.var.user.name,
        },
        id
      );
      return c.json<SuccessResponse<SentInvitation>>(
        { success: true, data: sent },
        201
      );
    }
  )
  .post(
    "/:slug/invitations/:id/resend",
    requireUser,
    requireTeam,
    readOnlyInDemo,
    requireAdmin,
    rateLimit("invite", INVITES_PER_HOUR, 3600),
    async (c) => {
      const workspace = c.var.workspace;
      const pending = await findPending(
        c.var.db,
        workspace.id,
        c.req.param("id")
      );
      await claimEmail(c.var.db, c.env);
      const id = await invite(c.var.auth, c.req.raw.headers, {
        organizationId: workspace.id,
        email: pending.email,
        role: pending.role,
      });
      const sent = await emailInvitation(
        {
          db: c.var.db,
          mailer: c.var.mailer,
          origin: c.env.BETTER_AUTH_URL,
          workspace,
          senderName: c.var.user.name,
        },
        id
      );
      return c.json<SuccessResponse<SentInvitation>>({
        success: true,
        data: sent,
      });
    }
  )
  .delete(
    "/:slug/invitations/:id",
    requireUser,
    requireTeam,
    readOnlyInDemo,
    requireAdmin,
    async (c) => {
      const pending = await findPending(
        c.var.db,
        c.var.workspace.id,
        c.req.param("id")
      );
      try {
        await c.var.auth.api.cancelInvitation({
          body: { invitationId: pending.id },
          headers: c.req.raw.headers,
        });
      } catch (err) {
        fromBetterAuth(err);
      }
      return c.json<SuccessResponse<{ id: string }>>({
        success: true,
        data: { id: pending.id },
      });
    }
  );
```

In `worker/app.ts`, replace:

```ts
import type { CodeMailer } from "./mail/mailer";
```

with:

```ts
import type { AppMailer } from "./mail/mailer";
```

In the same file, replace:

```ts
import { withDb } from "./middleware/db";
```

with:

```ts
import { withDb } from "./middleware/db";
import { withMailer } from "./middleware/mailer";
```

In the same file, replace:

```ts
import { healthRoutes } from "./routes/health";
```

with:

```ts
import { healthRoutes } from "./routes/health";
import { workspaceInvitationRoutes } from "./routes/invitations";
```

In the same file, replace:

```ts
export type AppDeps = { mailer?: CodeMailer };
```

with:

```ts
export type AppDeps = { mailer?: AppMailer };
```

In the same file, replace:

```ts
    .use(withAuth(deps.mailer))
```

with:

```ts
    .use(withMailer(deps.mailer))
    .use(withAuth)
```

In the same file, replace:

```ts
    .route("/workspaces", workspaceTeamRoutes)
```

with:

```ts
    .route("/workspaces", workspaceTeamRoutes)
    .route("/workspaces", workspaceInvitationRoutes)
```

In `worker/routes/me.test.ts`, whose own mailer now needs `sendInvitation` too, replace:

```ts
          throw new Error("Brevo refused the email: 401 unauthorized");
        },
```

with:

```ts
          throw new Error("Brevo refused the email: 401 unauthorized");
        },
        async sendInvitation() {},
```

Merge into `src/i18n/messages/en.json`, adding each key at the end of its section:

```json
{
  "errors": {
    "ALREADY_ON_TEAM": "That person is already on the team.",
    "TOO_MANY_INVITATIONS": "This workspace has 20 invitations waiting. Cancel some, or wait for them to be accepted.",
    "TEAM_FULL": "The team is full: a workspace can have 50 people."
  }
}
```

Merge into `src/i18n/messages/tr.json`, adding each key at the end of its section:

```json
{
  "errors": {
    "ALREADY_ON_TEAM": "Bu kişi zaten ekipte.",
    "TOO_MANY_INVITATIONS": "Bu çalışma alanında bekleyen 20 davet var. Bazılarını iptal edin ya da kabul edilmelerini bekleyin.",
    "TEAM_FULL": "Ekip dolu: bir çalışma alanında en fazla 50 kişi olabilir."
  }
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `bunx vitest run worker/routes/invitations.test.ts worker/mail worker/routes/me.test.ts shared/slug.test.ts src/i18n/messages.test.ts`
Expected: PASS.

- [ ] **Step 5: Run everything and commit**

Run: `bun run typecheck && bun run check && bun run test`
Expected: all pass, 72 files and 576 tests.

```bash
git add shared worker src
git commit -m "feat: owners and admins invite teammates by email, and resend or cancel invitations" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The invitation page's API

**Files:**
- Create: `shared/invitations.ts`, `shared/invitations.test.ts`, `worker/routes/accept-invitation.test.ts`
- Modify: `shared/envelope.ts`, `worker/services/invitations.ts`, `worker/routes/invitations.ts`, `worker/app.ts`, `src/i18n/messages/en.json`, `src/i18n/messages/tr.json`

**Interfaces:**
- Consumes: Task 6's `fromBetterAuth` and the invitation routes file; Task 5's `AssignableRole`; Task 4's `addToTeam` (in the tests).
- Produces:
  - `shared/invitations.ts`:
    - `maskEmail(email): string`, which turns "sam@studio.dev" into "s•••@studio.dev"
    - `InvitationState = "pending" | "expired" | "accepted" | "canceled"`
    - `InvitationView { id; workspace: { name; slug }; inviter; role; email; state; forYou; onTeam }`
  - error codes `INVITATION_NOT_FOUND` (404), `INVITATION_EXPIRED` (410), `INVITATION_WRONG_ADDRESS` (403)
  - `worker/services/invitations.ts`:
    - `alreadyOnTeam()`, `invitationNotFound()`, `wrongAddress()`
    - `findInvitation(db, id)`, `invitationState(row, now?)`, `isOnTeam(db, organizationId, userId)`
  - `invitationRoutes`, mounted at `/api/invitations`:
    - `GET /:id`: an `InvitationView`, for anyone with the link
    - `POST /:id/accept`: `{ slug }`, for the invited address only

- [ ] **Step 1: Write the failing tests**

Create `shared/invitations.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { maskEmail } from "./invitations";

describe("maskEmail", () => {
  it("keeps the first letter and the domain", () => {
    expect(maskEmail("sam@studio.dev")).toBe("s•••@studio.dev");
    expect(maskEmail("a@b.co")).toBe("a•••@b.co");
  });

  it("hides anything that isn't an address", () => {
    expect(maskEmail("not-an-address")).toBe("•••");
    expect(maskEmail("@studio.dev")).toBe("•••");
  });
});
```

Create `worker/routes/accept-invitation.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { invitation } from "../db/schema";
import { resetDemo } from "../services/demo-reset";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import { addToTeam, setupWorkspace } from "../test/fixtures";

const { db, close } = testDb();
beforeAll(() => resetDemo(db));
afterAll(() => close());

type TestApp = ReturnType<typeof testApp>;

const address = () => `joiner-${crypto.randomUUID().slice(0, 8)}@example.com`;

/** An owner's workspace with an invitation out to a new address. */
async function invited(t: TestApp, role: "admin" | "member" = "member") {
  const { owner, slug } = await setupWorkspace(t);
  const email = address();
  const res = await t.client.api.workspaces[":slug"].invitations.$post(
    { param: { slug }, json: { email, role } },
    { headers: { cookie: owner.cookie } }
  );
  const body = await res.json();
  if (!body.success) throw new Error(body.error);
  return { owner, slug, email, id: body.data.invitation.id };
}

const view = (t: TestApp, id: string, cookie?: string) =>
  t.client.api.invitations[":id"].$get(
    { param: { id } },
    cookie ? { headers: { cookie } } : undefined
  );

const accept = (t: TestApp, id: string, cookie: string) =>
  t.client.api.invitations[":id"].accept.$post(
    { param: { id } },
    { headers: { cookie } }
  );

describe("GET /api/invitations/:id", () => {
  it("shows anyone with the link the workspace, the role and a masked address", async () => {
    const t = testApp();
    const { id, email } = await invited(t);
    const res = await view(t, id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({
      id,
      workspace: { name: "Acme", slug: expect.any(String) },
      inviter: "Acme",
      role: "member",
      email: `j•••@example.com`,
      state: "pending",
      forYou: false,
      onTeam: false,
    });
    expect(JSON.stringify(body.data)).not.toContain(email);
    await t.settle();
  });

  it("knows the invited address when it's signed in", async () => {
    const t = testApp();
    const { id, email } = await invited(t);
    const joiner = await t.signIn(email);
    const body = await (await view(t, id, joiner.cookie)).json();
    expect(body).toMatchObject({ data: { forYou: true, onTeam: false } });
    const someoneElse = await t.signIn();
    const other = await (await view(t, id, someoneElse.cookie)).json();
    expect(other).toMatchObject({ data: { forYou: false } });
    await t.settle();
  });

  it("answers 404 for an invitation that doesn't exist", async () => {
    const t = testApp();
    const res = await view(t, "no-such-invitation");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "INVITATION_NOT_FOUND" });
    await t.settle();
  });
});

describe("POST /api/invitations/:id/accept", () => {
  it("puts the invited address on the team, with the invited role", async () => {
    const t = testApp();
    const { owner, slug, email, id } = await invited(t, "admin");
    const joiner = await t.signIn(email);
    const res = await accept(t, id, joiner.cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { slug } });
    const team = await t.client.api.workspaces[":slug"].team.$get(
      { param: { slug } },
      { headers: { cookie: owner.cookie } }
    );
    const members = (await team.json()).data.members;
    expect(members.find((m) => m.email === email)?.role).toBe("admin");
    const after = await (await view(t, id, joiner.cookie)).json();
    expect(after).toMatchObject({ data: { state: "accepted", onTeam: true } });
    await t.settle();
  });

  it("refuses another address", async () => {
    const t = testApp();
    const { id } = await invited(t);
    const someoneElse = await t.signIn();
    const res = await accept(t, id, someoneElse.cookie);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      code: "INVITATION_WRONG_ADDRESS",
    });
    await t.settle();
  });

  it("says when an invitation has expired", async () => {
    const t = testApp();
    const { id, email } = await invited(t);
    await db
      .update(invitation)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(invitation.id, id));
    const joiner = await t.signIn(email);
    expect(await (await view(t, id, joiner.cookie)).json()).toMatchObject({
      data: { state: "expired" },
    });
    const res = await accept(t, id, joiner.cookie);
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ code: "INVITATION_EXPIRED" });
    await t.settle();
  });

  it("refuses a cancelled invitation", async () => {
    const t = testApp();
    const { owner, slug, id, email } = await invited(t);
    await t.client.api.workspaces[":slug"].invitations[":id"].$delete(
      { param: { slug, id } },
      { headers: { cookie: owner.cookie } }
    );
    const joiner = await t.signIn(email);
    expect(await (await view(t, id, joiner.cookie)).json()).toMatchObject({
      data: { state: "canceled" },
    });
    const res = await accept(t, id, joiner.cookie);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "INVITATION_NOT_FOUND" });
    await t.settle();
  });

  it("doesn't add someone who's on the team already", async () => {
    const t = testApp();
    const { slug, id, email } = await invited(t);
    const joiner = await t.signIn(email);
    await addToTeam(slug, email, "member");
    expect(await (await view(t, id, joiner.cookie)).json()).toMatchObject({
      data: { onTeam: true },
    });
    const res = await accept(t, id, joiner.cookie);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "ALREADY_ON_TEAM" });
    await t.settle();
  });

  it("keeps demo accounts in the demo", async () => {
    const t = testApp();
    const { id } = await invited(t);
    const guest = await t.signInDemo("member");
    const res = await accept(t, id, guest.cookie);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "DEMO_ONLY" });
    await t.settle();
  });

  it("needs someone signed in", async () => {
    const t = testApp();
    const { id } = await invited(t);
    const res = await t.request(`/api/invitations/${id}/accept`, {
      method: "POST",
      headers: { origin: "http://localhost" },
    });
    expect(res.status).toBe(401);
    await t.settle();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bunx vitest run shared/invitations.test.ts worker/routes/accept-invitation.test.ts`
Expected: FAIL.
- **`shared/invitations.test.ts`:** can't import `./invitations`.
- **The invitation routes:** all 10 tests fail, because the routes don't exist yet and answer 404.

- [ ] **Step 3: Implement**

Create `shared/invitations.ts`:

```ts
import type { AssignableRole } from "./team";

/**
 * "sam@studio.dev" → "s•••@studio.dev": enough for its owner to recognize,
 * not enough for someone else holding the link to read.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "•••";
  return `${email[0]}•••${email.slice(at)}`;
}

/** Where an invitation stands; a declined one reads as cancelled. */
export type InvitationState = "pending" | "expired" | "accepted" | "canceled";

/** What /invite/<id> shows to whoever has the link. */
export type InvitationView = {
  id: string;
  workspace: { name: string; slug: string };
  /** Who invited: their display name, or the workspace's when they have none. */
  inviter: string;
  role: AssignableRole;
  /** The invited address, masked. */
  email: string;
  state: InvitationState;
  /** Whether the person signed in is the invited address. */
  forYou: boolean;
  /** Whether the person signed in is on that team already. */
  onTeam: boolean;
};
```

In `shared/envelope.ts`, replace:

```ts
  | "TEAM_FULL";
```

with:

```ts
  | "TEAM_FULL"
  | "INVITATION_NOT_FOUND"
  | "INVITATION_EXPIRED"
  | "INVITATION_WRONG_ADDRESS";
```

Replace the whole of `worker/services/invitations.ts` with:

```ts
import { APIError } from "better-auth/api";
import { and, count, eq } from "drizzle-orm";
import type { InvitationState } from "@/shared/invitations";
import type { Locale } from "@/shared/locale";
import { type PendingInvitation, TEAM_SIZE } from "@/shared/team";
import type { Database } from "../db/client";
import {
  invitation,
  member,
  organization,
  user as users,
  workspaceSettings,
} from "../db/schema";
import { AppError } from "../lib/errors";
import { pendingInvitationColumns, toPendingInvitation } from "./team-members";

const teamFull = () =>
  new AppError(409, "TEAM_FULL", `A team can have ${TEAM_SIZE} people`);

export const alreadyOnTeam = () =>
  new AppError(409, "ALREADY_ON_TEAM", "That person is already on the team");

export const invitationNotFound = () =>
  new AppError(404, "INVITATION_NOT_FOUND", "No such invitation");

export const wrongAddress = () =>
  new AppError(
    403,
    "INVITATION_WRONG_ADDRESS",
    "This invitation is for another address"
  );

/** Better Auth's refusals as Pano's codes; anything else is rethrown. */
export function fromBetterAuth(err: unknown): never {
  if (err instanceof APIError) {
    const code = (err.body as { code?: string } | undefined)?.code;
    if (code === "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION") {
      throw alreadyOnTeam();
    }
    if (code === "INVITATION_LIMIT_REACHED") {
      throw new AppError(
        409,
        "TOO_MANY_INVITATIONS",
        "This workspace has too many invitations waiting"
      );
    }
    if (code === "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED") throw teamFull();
    // Pano checks these first; Better Auth's checks cover a race.
    if (code === "INVITATION_NOT_FOUND") throw invitationNotFound();
    if (code === "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION") {
      throw wrongAddress();
    }
  }
  throw err;
}

/** An invitation with its workspace and inviter, for /invite/<id>. */
export async function findInvitation(db: Database, id: string) {
  const [row] = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      organizationId: invitation.organizationId,
      workspaceName: organization.name,
      workspaceSlug: organization.slug,
      inviterName: users.name,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .leftJoin(users, eq(users.id, invitation.inviterId))
    .where(eq(invitation.id, id))
    .limit(1);
  if (!row) throw invitationNotFound();
  return row;
}

/** Better Auth keeps an expired invitation pending; Pano says expired. */
export function invitationState(
  row: { status: string; expiresAt: Date },
  now = new Date()
): InvitationState {
  if (row.status === "accepted") return "accepted";
  if (row.status !== "pending") return "canceled";
  return row.expiresAt < now ? "expired" : "pending";
}

export async function isOnTeam(
  db: Database,
  organizationId: string,
  userId: string
) {
  const [row] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(eq(member.organizationId, organizationId), eq(member.userId, userId))
    )
    .limit(1);
  return row !== undefined;
}

/** One of the workspace's pending invitations, as Settings → Team lists it. */
export async function findPending(
  db: Database,
  workspaceId: string,
  id: string
): Promise<PendingInvitation> {
  const [row] = await db
    .select(pendingInvitationColumns)
    .from(invitation)
    .leftJoin(users, eq(users.id, invitation.inviterId))
    .where(
      and(
        eq(invitation.id, id),
        eq(invitation.organizationId, workspaceId),
        eq(invitation.status, "pending")
      )
    )
    .limit(1);
  if (!row) throw new AppError(404, "NOT_FOUND", "No such invitation");
  return toPendingInvitation(row);
}

/** Refuses another invitation once the team is as big as it can be. */
export async function refuseFullTeam(db: Database, workspaceId: string) {
  const [row] = await db
    .select({ people: count() })
    .from(member)
    .where(eq(member.organizationId, workspaceId));
  if ((row?.people ?? 0) >= TEAM_SIZE) throw teamFull();
}

/** Invitations are written in the workspace's language. */
export async function workspaceLocale(
  db: Database,
  workspaceId: string
): Promise<Locale> {
  const [row] = await db
    .select({ locale: workspaceSettings.defaultLocale })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.organizationId, workspaceId))
    .limit(1);
  return row?.locale ?? "en";
}
```

In `worker/routes/invitations.ts`, replace:

```ts
import type { SuccessResponse } from "@/shared/envelope";
import { inviteSchema } from "@/shared/schemas";
```

with:

```ts
import { isDemoEmail } from "@/shared/demo";
import type { SuccessResponse } from "@/shared/envelope";
import { type InvitationView, maskEmail } from "@/shared/invitations";
import { inviteSchema } from "@/shared/schemas";
```

In the same file, replace:

```ts
import { requireUser } from "../middleware/session";
```

with:

```ts
import { readSession, requireUser } from "../middleware/session";
```

In the same file, replace:

```ts
import {
  findPending,
  fromBetterAuth,
  refuseFullTeam,
  workspaceLocale,
} from "../services/invitations";
```

with:

```ts
import {
  alreadyOnTeam,
  findInvitation,
  findPending,
  fromBetterAuth,
  invitationNotFound,
  invitationState,
  isOnTeam,
  refuseFullTeam,
  workspaceLocale,
  wrongAddress,
} from "../services/invitations";
```

Append to `worker/routes/invitations.ts`:

```ts
/**
 * Under /invitations: the page an invitation's link opens. Anyone with the
 * link sees the workspace, the inviter, the role and the masked address;
 * only the invited address can accept.
 */
export const invitationRoutes = new Hono<AppEnv>()
  .get("/:id", async (c) => {
    const row = await findInvitation(c.var.db, c.req.param("id"));
    const viewer = (await readSession(c))?.user ?? null;
    const view: InvitationView = {
      id: row.id,
      workspace: { name: row.workspaceName, slug: row.workspaceSlug },
      inviter: row.inviterName || row.workspaceName,
      role: row.role === "admin" ? "admin" : "member",
      email: maskEmail(row.email),
      state: invitationState(row),
      forYou:
        viewer !== null &&
        viewer.email.toLowerCase() === row.email.toLowerCase(),
      onTeam:
        viewer !== null &&
        (await isOnTeam(c.var.db, row.organizationId, viewer.id)),
    };
    return c.json<SuccessResponse<InvitationView>>({
      success: true,
      data: view,
    });
  })
  .post("/:id/accept", requireUser, async (c) => {
    const user = c.var.user;
    if (isDemoEmail(user.email)) {
      throw new AppError(
        403,
        "DEMO_ONLY",
        "Demo accounts can only act in the demo workspace"
      );
    }
    const row = await findInvitation(c.var.db, c.req.param("id"));
    const state = invitationState(row);
    if (state === "expired") {
      throw new AppError(410, "INVITATION_EXPIRED", "This invitation expired");
    }
    if (state !== "pending") throw invitationNotFound();
    if (user.email.toLowerCase() !== row.email.toLowerCase()) {
      throw wrongAddress();
    }
    // Better Auth would add a second membership.
    if (await isOnTeam(c.var.db, row.organizationId, user.id)) {
      throw alreadyOnTeam();
    }
    try {
      await c.var.auth.api.acceptInvitation({
        body: { invitationId: row.id },
        headers: c.req.raw.headers,
      });
    } catch (err) {
      fromBetterAuth(err);
    }
    return c.json<SuccessResponse<{ slug: string }>>({
      success: true,
      data: { slug: row.workspaceSlug },
    });
  });
```

In `worker/app.ts`, replace:

```ts
import { workspaceInvitationRoutes } from "./routes/invitations";
```

with:

```ts
import {
  invitationRoutes,
  workspaceInvitationRoutes,
} from "./routes/invitations";
```

In the same file, replace:

```ts
    .route("/comments", commentRoutes);
```

with:

```ts
    .route("/comments", commentRoutes)
    .route("/invitations", invitationRoutes);
```

Merge into `src/i18n/messages/en.json`, adding each key at the end of its section:

```json
{
  "errors": {
    "INVITATION_NOT_FOUND": "This invitation isn't open any more: it was cancelled or already used.",
    "INVITATION_EXPIRED": "This invitation has expired. Ask whoever invited you to send it again.",
    "INVITATION_WRONG_ADDRESS": "This invitation is for another address. Sign in with the address it was sent to."
  }
}
```

Merge into `src/i18n/messages/tr.json`, adding each key at the end of its section:

```json
{
  "errors": {
    "INVITATION_NOT_FOUND": "Bu davet artık geçerli değil: iptal edilmiş ya da kullanılmış.",
    "INVITATION_EXPIRED": "Bu davetin süresi doldu. Sizi davet eden kişiden yeniden göndermesini isteyin.",
    "INVITATION_WRONG_ADDRESS": "Bu davet başka bir adres için. Davetin gönderildiği adresle giriş yapın."
  }
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `bunx vitest run shared/invitations.test.ts worker/routes/accept-invitation.test.ts worker/routes/invitations.test.ts src/i18n/messages.test.ts`
Expected: PASS.

- [ ] **Step 5: Run everything and commit**

Run: `bun run typecheck && bun run check && bun run test`
Expected: all pass, 74 files and 588 tests.

```bash
git add shared worker src
git commit -m "feat: an invitation's link shows what it's for, and the invited address joins with it" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The changelog API

**Files:**
- Create: `shared/changelog.ts`, `worker/services/changelog.ts`, `worker/routes/changelog.ts`, `worker/routes/changelog.test.ts`
- Generate: `drizzle/0013_changelog_index.sql`, with its snapshot and journal entry
- Modify: `shared/schemas.ts`, `worker/db/schema/posts.ts`, `worker/app.ts`

**Interfaces:**
- Produces:
  - `shared/changelog.ts`:
    - `CHANGELOG_PAGE = 20`
    - `ChangelogEntry { id; ref; title; voteCount; shippedAt: string; note: string | null }`
    - `ChangelogPage { entries; page; hasMore }`
  - `changelogQuerySchema` `{ page }`
  - `listChangelog(db, { workspaceId, page }): Promise<ChangelogPage>`
  - `workspaceChangelogRoutes`: `GET /api/workspaces/:slug/changelog?page=`
  - index `posts_organization_status_changed_idx` on `posts (organization_id, status, status_changed_at)`

- [ ] **Step 1: Write the failing tests**

Create `worker/routes/changelog.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PostStatus } from "@/shared/status";
import { resetDemo } from "../services/demo-reset";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import { setupWorkspace, submitPost } from "../test/fixtures";

const { db, close } = testDb();
beforeAll(() => resetDemo(db));
afterAll(() => close());

type TestApp = ReturnType<typeof testApp>;

async function moveTo(
  t: TestApp,
  cookie: string,
  postId: number,
  status: PostStatus,
  note?: string
) {
  const res = await t.client.api.posts[":id"].status.$patch(
    {
      param: { id: String(postId) },
      json: note ? { status, note } : { status },
    },
    { headers: { cookie } }
  );
  if (!res.ok) throw new Error(`status change failed: ${res.status}`);
}

async function readChangelog(t: TestApp, slug: string, page = 1) {
  const res = await t.client.api.workspaces[":slug"].changelog.$get({
    param: { slug },
    query: { page: String(page) },
  });
  const body = await res.json();
  if (!body.success) throw new Error(body.error);
  return body.data;
}

describe("GET /api/workspaces/:slug/changelog", () => {
  it("lists shipped requests newest first, with the latest shipping note", async () => {
    const t = testApp();
    const { owner, slug, boards } = await setupWorkspace(t);
    const post = (title: string) =>
      submitPost(t, owner.cookie, slug, { boardId: boards[0]!.id, title });
    const alpha = await post("Alpha");
    const bravo = await post("Bravo");
    const charlie = await post("Charlie");
    const delta = await post("Delta");
    const echo = await post("Echo");

    await moveTo(t, owner.cookie, alpha.id, "shipped", "Early");
    await moveTo(t, owner.cookie, bravo.id, "shipped");
    await moveTo(t, owner.cookie, charlie.id, "shipped", "Merged away");
    await t.client.api.posts[":id"].merge.$post(
      { param: { id: String(charlie.id) }, json: { intoId: alpha.id } },
      { headers: { cookie: owner.cookie } }
    );
    await moveTo(t, owner.cookie, delta.id, "planned");
    await moveTo(t, owner.cookie, echo.id, "shipped", "Fixed");
    // Back out and shipped again: the latest move counts.
    await moveTo(t, owner.cookie, alpha.id, "in_progress");
    await moveTo(t, owner.cookie, alpha.id, "shipped", "In 2.5");

    // Another workspace's shipped request stays on its own changelog.
    const other = await setupWorkspace(t);
    const elsewhere = await submitPost(t, other.owner.cookie, other.slug, {
      boardId: other.boards[0]!.id,
      title: "Elsewhere",
    });
    await moveTo(t, other.owner.cookie, elsewhere.id, "shipped");

    const changelog = await readChangelog(t, slug);
    expect(changelog.entries.map((e) => [e.title, e.note])).toEqual([
      ["Alpha", "In 2.5"],
      ["Echo", "Fixed"],
      ["Bravo", null],
    ]);
    expect(changelog.entries[0]).toMatchObject({
      id: alpha.id,
      ref: `${alpha.id}-alpha`,
      voteCount: 1,
    });
    expect(changelog).toMatchObject({ page: 1, hasMore: false });
    await t.settle();
  });

  it("pages twenty at a time", async () => {
    const t = testApp();
    const { owner, slug, boards } = await setupWorkspace(t);
    for (let i = 1; i <= 21; i++) {
      const shipped = await submitPost(t, owner.cookie, slug, {
        boardId: boards[0]!.id,
        title: `Shipped number ${i}`,
      });
      await moveTo(t, owner.cookie, shipped.id, "shipped");
    }
    const first = await readChangelog(t, slug);
    expect(first.entries).toHaveLength(20);
    expect(first.entries[0]!.title).toBe("Shipped number 21");
    expect(first.hasMore).toBe(true);
    const second = await readChangelog(t, slug, 2);
    expect(second.entries.map((e) => e.title)).toEqual(["Shipped number 1"]);
    expect(second.hasMore).toBe(false);
    await t.settle();
  });

  it("answers 404 for a workspace that doesn't exist", async () => {
    const t = testApp();
    const res = await t.client.api.workspaces[":slug"].changelog.$get({
      param: { slug: "no-such-workspace" },
      query: {},
    });
    expect(res.status).toBe(404);
    await t.settle();
  });

  it("shows the demo's shipped requests with the team's notes", async () => {
    const t = testApp();
    const changelog = await readChangelog(t, "demo");
    expect(changelog.entries).toHaveLength(5);
    expect(changelog.entries.map((e) => e.note)).toContain(
      "Shipped in 2.5! Press `?` anywhere to open it."
    );
    await t.settle();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bunx vitest run worker/routes/changelog.test.ts`
Expected: FAIL. The route doesn't exist yet. "Answers 404 for a workspace that doesn't exist" already passes, because a missing route answers 404 too.

- [ ] **Step 3: Implement**

Create `shared/changelog.ts`:

```ts
/** How many entries a changelog page, and the feed, show. */
export const CHANGELOG_PAGE = 20;

/** One shipped request on a workspace's changelog. */
export type ChangelogEntry = {
  id: number;
  /** "123-dark-mode": the request's address segment under /p/. */
  ref: string;
  title: string;
  voteCount: number;
  /** When it moved to Shipped. */
  shippedAt: string;
  /** The team's note on that move, if they left one. */
  note: string | null;
};

export type ChangelogPage = {
  entries: ChangelogEntry[];
  page: number;
  hasMore: boolean;
};
```

Append to `shared/schemas.ts`:

```ts
/** A page of a workspace's changelog. */
export const changelogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
});
```

In `worker/db/schema/posts.ts`, replace:

```ts
    index("posts_search_idx").using("gin", table.search),
```

with:

```ts
    // The changelog and the roadmap's Shipped column: a workspace's posts in
    // one status, by when they moved there.
    index("posts_organization_status_changed_idx").on(
      table.organizationId,
      table.status,
      table.statusChangedAt
    ),
    index("posts_search_idx").using("gin", table.search),
```

Run: `bun run db:generate --name=changelog_index`
Expected: `drizzle/0013_changelog_index.sql`, holding:

```sql
CREATE INDEX "posts_organization_status_changed_idx" ON "posts" USING btree ("organization_id","status","status_changed_at");
```

Create `worker/services/changelog.ts`:

```ts
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  CHANGELOG_PAGE,
  type ChangelogEntry,
  type ChangelogPage,
} from "@/shared/changelog";
import { postRef } from "@/shared/ref";
import type { Database } from "../db/client";
import { posts, statusChanges } from "../db/schema";

/**
 * A workspace's shipped requests, newest first, each with the team's note on
 * its latest move to Shipped. Merged requests live on in their originals, so
 * they're left out.
 */
export async function listChangelog(
  db: Database,
  input: { workspaceId: string; page: number }
): Promise<ChangelogPage> {
  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      voteCount: posts.voteCount,
      statusChangedAt: posts.statusChangedAt,
      createdAt: posts.createdAt,
      // Qualified by hand: inside a select without joins, Drizzle would
      // print posts.id as a bare "id", which the subquery reads as sc.id.
      note: sql<
        string | null
      >`(select sc.note from ${statusChanges} as sc where sc.post_id = ${posts}.id and sc.to_status = 'shipped' order by sc.id desc limit 1)`,
    })
    .from(posts)
    .where(
      and(
        eq(posts.organizationId, input.workspaceId),
        eq(posts.status, "shipped"),
        isNull(posts.mergedIntoId)
      )
    )
    .orderBy(sql`${posts.statusChangedAt} desc nulls last`, desc(posts.id))
    .limit(CHANGELOG_PAGE + 1)
    .offset((input.page - 1) * CHANGELOG_PAGE);
  return {
    entries: rows.slice(0, CHANGELOG_PAGE).map(
      (row): ChangelogEntry => ({
        id: row.id,
        ref: postRef(row.id, row.title),
        title: row.title,
        voteCount: row.voteCount,
        // Every move to Shipped sets it; older rows fall back.
        shippedAt: (row.statusChangedAt ?? row.createdAt).toISOString(),
        note: row.note,
      })
    ),
    page: input.page,
    hasMore: rows.length > CHANGELOG_PAGE,
  };
}
```

Create `worker/routes/changelog.ts`:

```ts
import { Hono } from "hono";
import type { ChangelogPage } from "@/shared/changelog";
import type { SuccessResponse } from "@/shared/envelope";
import { changelogQuerySchema } from "@/shared/schemas";
import type { AppEnv } from "../env";
import { validate } from "../lib/validate";
import { listChangelog } from "../services/changelog";
import { findWorkspace } from "./workspaces";

/** Under /workspaces: what a workspace has shipped, for anyone to read. */
export const workspaceChangelogRoutes = new Hono<AppEnv>().get(
  "/:slug/changelog",
  validate("query", changelogQuerySchema),
  async (c) => {
    const workspace = await findWorkspace(c.var.db, c.req.param("slug"));
    const page = await listChangelog(c.var.db, {
      workspaceId: workspace.id,
      page: c.req.valid("query").page,
    });
    return c.json<SuccessResponse<ChangelogPage>>({
      success: true,
      data: page,
    });
  }
);
```

In `worker/app.ts`, replace:

```ts
import { withMailer } from "./middleware/mailer";
```

with:

```ts
import { withMailer } from "./middleware/mailer";
import { workspaceChangelogRoutes } from "./routes/changelog";
```

In the same file, replace:

```ts
    .route("/workspaces", workspaceRoadmapRoutes)
```

with:

```ts
    .route("/workspaces", workspaceRoadmapRoutes)
    .route("/workspaces", workspaceChangelogRoutes)
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `bunx vitest run worker/routes/changelog.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Run everything and commit**

Run: `bun run typecheck && bun run check && bun run test`
Expected: all pass, 75 files and 592 tests.

```bash
git add shared worker drizzle
git commit -m "feat: each workspace's changelog lists what shipped, with the team's notes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The changelog's Atom feed, cached in KV

**Files:**
- Create: `worker/routes/changelog-feed.test.ts`
- Modify: `worker/env.ts`, `worker/test/env.ts`, `worker/services/changelog.ts`, `worker/routes/changelog.ts`, `worker/services/status.ts`, `worker/routes/posts.ts`, `worker/cron.ts`, `worker/cron.test.ts`

**Interfaces:**
- Consumes: Task 8's `listChangelog`, `ChangelogEntry`, and the changelog routes file.
- Produces:
  - `Flags.delete(key)`
  - `CHANGELOG_CACHE_SECONDS = 3600`
  - `changelogKey(slug)`, which gives `changelog:<slug>`
  - `dropChangelog(flags, slug)`
  - `changelogOf(db, postId): Promise<string | null>`, the slug of the changelog a post is on
  - `changelogFeed({ origin, workspace: { name, slug, defaultLocale }, entries, now? }): string`
  - `GET /api/workspaces/:slug/changelog.atom`
  - `changeStatus` answers `{ queued, shippedChanged }`

- [ ] **Step 1: Write the failing tests**

Create `worker/routes/changelog-feed.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { PostStatus } from "@/shared/status";
import { changelogKey } from "../services/changelog";
import { testApp } from "../test/app";
import { setupWorkspace, submitPost } from "../test/fixtures";

type TestApp = ReturnType<typeof testApp>;

async function moveTo(
  t: TestApp,
  cookie: string,
  postId: number,
  status: PostStatus,
  note?: string
) {
  const res = await t.client.api.posts[":id"].status.$patch(
    {
      param: { id: String(postId) },
      json: note ? { status, note } : { status },
    },
    { headers: { cookie } }
  );
  if (!res.ok) throw new Error(`status change failed: ${res.status}`);
}

const readFeed = (t: TestApp, slug: string) =>
  t.request(`/api/workspaces/${slug}/changelog.atom`);

describe("GET /api/workspaces/:slug/changelog.atom", () => {
  it("is an Atom feed of what shipped, newest first, with every name escaped", async () => {
    const t = testApp();
    const { owner, slug, boards } = await setupWorkspace(t);
    const post = (title: string) =>
      submitPost(t, owner.cookie, slug, { boardId: boards[0]!.id, title });
    const first = await post("Export to PDF");
    const second = await post("Fish & <chips>");
    await moveTo(t, owner.cookie, first.id, "shipped");
    await moveTo(t, owner.cookie, second.id, "shipped", "Fried & served <hot>");

    const res = await readFeed(t, slug);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "application/atom+xml; charset=utf-8"
    );
    const feed = await res.text();
    expect(feed.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(
      true
    );
    expect(feed).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect(feed).toContain("<title>Acme changelog</title>");
    expect(feed).toContain(
      `<link rel="self" type="application/atom+xml" href="http://localhost/api/workspaces/${slug}/changelog.atom"/>`
    );
    expect(feed.match(/<entry>/g)).toHaveLength(2);
    expect(feed.indexOf("Fish &amp; &lt;chips&gt;")).toBeLessThan(
      feed.indexOf("Export to PDF")
    );
    expect(feed).toContain("<summary>Fried &amp; served &lt;hot&gt;</summary>");
    expect(feed).toContain(`href="http://localhost/p/${second.id}-fish-chips"`);
    expect(feed).not.toContain("<chips>");
    await t.settle();
  });

  it("is titled in the workspace's language", async () => {
    const t = testApp();
    const { slug } = await setupWorkspace(t, { defaultLocale: "tr" });
    expect(await (await readFeed(t, slug)).text()).toContain(
      "<title>Acme yenilikleri</title>"
    );
    await t.settle();
  });

  it("keeps the feed in KV for an hour", async () => {
    const t = testApp();
    const { slug } = await setupWorkspace(t);
    const put = vi.spyOn(t.env.FLAGS, "put");
    const feed = await (await readFeed(t, slug)).text();
    await t.settle();
    expect(put).toHaveBeenCalledWith(changelogKey(slug), feed, {
      expirationTtl: 3600,
    });
  });

  it("answers from KV without opening a connection", async () => {
    // A database nobody can reach: any query would fail the request.
    const t = testApp({
      HYPERDRIVE: { connectionString: "postgresql://nobody@127.0.0.1:1/none" },
    });
    await t.env.FLAGS.put(changelogKey("acme-cached"), "<feed>cached</feed>");
    const res = await readFeed(t, "acme-cached");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<feed>cached</feed>");
    await t.settle();
  });

  it("answers 404 for a workspace that doesn't exist", async () => {
    const t = testApp();
    expect((await readFeed(t, "no-such-workspace")).status).toBe(404);
    await t.settle();
  });
});

describe("the cached feed", () => {
  /** Sets a stale copy, does `change`, and answers whether it was dropped. */
  async function drops(
    t: TestApp,
    slug: string,
    change: () => Promise<unknown>
  ) {
    await t.env.FLAGS.put(changelogKey(slug), "stale");
    await change();
    await t.settle();
    return (await t.env.FLAGS.get(changelogKey(slug))) === null;
  }

  it("is dropped when the changelog changes, and only then", async () => {
    const t = testApp();
    const { owner, slug, boards } = await setupWorkspace(t);
    const post = (title: string) =>
      submitPost(t, owner.cookie, slug, { boardId: boards[0]!.id, title });
    const shipped = await post("Dark mode");
    const original = await post("Light mode");
    const duplicate = await post("Night mode");
    const planned = await post("Offline mode");

    expect(
      await drops(t, slug, () => moveTo(t, owner.cookie, shipped.id, "shipped"))
    ).toBe(true);
    expect(
      await drops(t, slug, () =>
        t.client.api.posts[":id"].$patch(
          { param: { id: String(shipped.id) }, json: { title: "Dark theme" } },
          { headers: { cookie: owner.cookie } }
        )
      )
    ).toBe(true);
    expect(
      await drops(t, slug, () =>
        moveTo(t, owner.cookie, shipped.id, "in_progress")
      )
    ).toBe(true);
    // Moves that don't touch Shipped, and edits of other requests, keep it.
    expect(
      await drops(t, slug, () => moveTo(t, owner.cookie, planned.id, "planned"))
    ).toBe(false);
    expect(
      await drops(t, slug, () =>
        t.client.api.posts[":id"].$patch(
          { param: { id: String(planned.id) }, json: { title: "Offline" } },
          { headers: { cookie: owner.cookie } }
        )
      )
    ).toBe(false);
    // A shipped duplicate merged away, and a shipped request deleted.
    await moveTo(t, owner.cookie, duplicate.id, "shipped");
    expect(
      await drops(t, slug, () =>
        t.client.api.posts[":id"].merge.$post(
          {
            param: { id: String(duplicate.id) },
            json: { intoId: original.id },
          },
          { headers: { cookie: owner.cookie } }
        )
      )
    ).toBe(true);
    await moveTo(t, owner.cookie, original.id, "shipped");
    expect(
      await drops(t, slug, () =>
        t.client.api.posts[":id"].$delete(
          { param: { id: String(original.id) } },
          { headers: { cookie: owner.cookie } }
        )
      )
    ).toBe(true);
    await t.settle();
  });
});
```

In `worker/cron.test.ts`, replace:

```ts
import type { resetDemo } from "./services/demo-reset";
```

with:

```ts
import { changelogKey } from "./services/changelog";
import type { resetDemo } from "./services/demo-reset";
```

In the same file, replace:

```ts
  it("prunes old email counters every night", async () => {
```

with:

```ts
  it("drops the demo's cached feed once the reset rebuilt it", async () => {
    const { env } = testEnv();
    await env.FLAGS.put(changelogKey("demo"), "stale");
    const logged = vi.spyOn(console, "log").mockImplementation(() => {});
    await runScheduled(NIGHTLY, env, {
      send: nothingToSend(),
      reset: fakeReset(),
    });
    logged.mockRestore();
    expect(await env.FLAGS.get(changelogKey("demo"))).toBeNull();
  });

  it("prunes old email counters every night", async () => {
```

In `worker/test/env.ts`, replace:

```ts
    async put(key, value) {
      values.set(key, value);
    },
```

with:

```ts
    async put(key, value) {
      values.set(key, value);
    },
    async delete(key) {
      values.delete(key);
    },
```

- [ ] **Step 2: Run them to see them fail**

Run: `bunx vitest run worker/routes/changelog-feed.test.ts worker/cron.test.ts`
Expected: FAIL, 6 tests: five of the feed's, and the cron's new one. The feed route doesn't exist yet, and neither does `changelogKey`. "Answers 404 for a workspace that doesn't exist" already passes, because a missing route answers 404 too.

- [ ] **Step 3: Implement**

In `worker/env.ts`, replace:

```ts
    options?: { expirationTtl?: number; expiration?: number }
  ): Promise<void>;
};
```

with:

```ts
    options?: { expirationTtl?: number; expiration?: number }
  ): Promise<void>;
  delete(key: string): Promise<void>;
};
```

In `worker/services/changelog.ts`, replace:

```ts
import { postRef } from "@/shared/ref";
import type { Database } from "../db/client";
import { posts, statusChanges } from "../db/schema";
```

with:

```ts
import type { Locale } from "@/shared/locale";
import { postRef } from "@/shared/ref";
import type { Database } from "../db/client";
import { organization, posts, statusChanges } from "../db/schema";
import type { Flags } from "../env";
```

Append to `worker/services/changelog.ts`:

```ts
/** How long KV keeps a workspace's rendered feed. */
export const CHANGELOG_CACHE_SECONDS = 60 * 60;

/** The KV key of a workspace's rendered feed: by slug, so a hit needs no query. */
export const changelogKey = (slug: string) => `changelog:${slug}`;

/** Feed readers fetch it again; the next one rebuilds it. */
export function dropChangelog(flags: Flags, slug: string) {
  return flags.delete(changelogKey(slug));
}

/**
 * The slug of the workspace whose changelog shows this post, or null when
 * the post isn't on one: an edit, merge or delete of it changes the feed.
 */
export async function changelogOf(
  db: Database,
  postId: number
): Promise<string | null> {
  const [row] = await db
    .select({ slug: organization.slug })
    .from(posts)
    .innerJoin(organization, eq(organization.id, posts.organizationId))
    .where(
      and(
        eq(posts.id, postId),
        eq(posts.status, "shipped"),
        isNull(posts.mergedIntoId)
      )
    )
    .limit(1);
  return row?.slug ?? null;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * The changelog as an Atom 1.0 feed: the latest entries, each linking to its
 * request, with the team's note as the summary.
 */
export function changelogFeed(input: {
  origin: string;
  workspace: { name: string; slug: string; defaultLocale: Locale };
  entries: ChangelogEntry[];
  now?: Date;
}) {
  const title =
    input.workspace.defaultLocale === "tr"
      ? `${input.workspace.name} yenilikleri`
      : `${input.workspace.name} changelog`;
  const page = new URL(`/${input.workspace.slug}/changelog`, input.origin);
  const self = new URL(
    `/api/workspaces/${input.workspace.slug}/changelog.atom`,
    input.origin
  );
  const updated =
    input.entries[0]?.shippedAt ?? (input.now ?? new Date()).toISOString();
  const entries = input.entries.map((entry) => {
    const link = new URL(`/p/${entry.ref}`, input.origin);
    return [
      "  <entry>",
      `    <title>${escapeXml(entry.title)}</title>`,
      `    <id>${escapeXml(new URL(`/p/${entry.id}`, input.origin).toString())}</id>`,
      `    <link rel="alternate" type="text/html" href="${escapeXml(link.toString())}"/>`,
      `    <updated>${entry.shippedAt}</updated>`,
      ...(entry.note
        ? [`    <summary>${escapeXml(entry.note)}</summary>`]
        : []),
      "  </entry>",
    ].join("\n");
  });
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <title>${escapeXml(title)}</title>`,
    `  <id>${escapeXml(page.toString())}</id>`,
    `  <link rel="alternate" type="text/html" href="${escapeXml(page.toString())}"/>`,
    `  <link rel="self" type="application/atom+xml" href="${escapeXml(self.toString())}"/>`,
    `  <updated>${updated}</updated>`,
    `  <author><name>${escapeXml(input.workspace.name)}</name></author>`,
    ...entries,
    "</feed>",
    "",
  ].join("\n");
}
```

Replace the whole of `worker/routes/changelog.ts` with:

```ts
import { Hono } from "hono";
import type { ChangelogPage } from "@/shared/changelog";
import type { SuccessResponse } from "@/shared/envelope";
import { changelogQuerySchema } from "@/shared/schemas";
import type { AppEnv } from "../env";
import { validate } from "../lib/validate";
import {
  CHANGELOG_CACHE_SECONDS,
  changelogFeed,
  changelogKey,
  listChangelog,
} from "../services/changelog";
import { findWorkspace } from "./workspaces";

/** Under /workspaces: what a workspace has shipped, for anyone to read. */
export const workspaceChangelogRoutes = new Hono<AppEnv>()
  .get(
    "/:slug/changelog",
    validate("query", changelogQuerySchema),
    async (c) => {
      const workspace = await findWorkspace(c.var.db, c.req.param("slug"));
      const page = await listChangelog(c.var.db, {
        workspaceId: workspace.id,
        page: c.req.valid("query").page,
      });
      return c.json<SuccessResponse<ChangelogPage>>({
        success: true,
        data: page,
      });
    }
  )
  // Feed readers come back every hour or so. Each visit that reached
  // Postgres would wake Neon, so the rendered feed waits in KV for an hour,
  // and a hit never opens a connection. Changes drop it (dropChangelog).
  .get("/:slug/changelog.atom", async (c) => {
    const slug = c.req.param("slug");
    const key = changelogKey(slug);
    let feed = await c.env.FLAGS.get(key);
    if (feed === null) {
      const workspace = await findWorkspace(c.var.db, slug);
      const { entries } = await listChangelog(c.var.db, {
        workspaceId: workspace.id,
        page: 1,
      });
      feed = changelogFeed({
        origin: c.env.BETTER_AUTH_URL,
        workspace,
        entries,
      });
      c.executionCtx.waitUntil(
        c.env.FLAGS.put(key, feed, { expirationTtl: CHANGELOG_CACHE_SECONDS })
      );
    }
    return c.body(feed, 200, {
      "content-type": "application/atom+xml; charset=utf-8",
    });
  });
```

In `worker/services/status.ts`, replace:

```ts
 * optional note for the timeline. Answers how many emails it queued.
```

with:

```ts
 * optional note for the timeline. Answers how many emails it queued, and
 * whether the move went into or out of Shipped, which changes the
 * workspace's changelog.
```

In the same file, replace:

```ts
): Promise<{ queued: number }> {
```

with:

```ts
): Promise<{ queued: number; shippedChanged: boolean }> {
```

In the same file, replace:

```ts
    if (post.status === input.status) return { queued: 0 };
```

with:

```ts
    if (post.status === input.status) {
      return { queued: 0, shippedChanged: false };
    }
```

In the same file, replace:

```ts
      return { queued };
    }
    if (post.status === "shipped") {
      await takeBackShippedEmails(tx, input.postId);
    }
    return { queued: 0 };
```

with:

```ts
      return { queued, shippedChanged: true };
    }
    if (post.status === "shipped") {
      await takeBackShippedEmails(tx, input.postId);
      return { queued: 0, shippedChanged: true };
    }
    return { queued: 0, shippedChanged: false };
```

In `worker/routes/posts.ts`, replace:

```ts
import { mergePost } from "../services/merge";
```

with:

```ts
import { changelogOf, dropChangelog } from "../services/changelog";
import { mergePost } from "../services/merge";
```

In the same file, replace:

```ts
      await updatePost(c.var.db, id, c.req.valid("json"));
```

with:

```ts
      await updatePost(c.var.db, id, c.req.valid("json"));
      const changelog = await changelogOf(c.var.db, id);
      if (changelog) {
        c.executionCtx.waitUntil(dropChangelog(c.env.FLAGS, changelog));
      }
```

In the same file, replace:

```ts
    await deletePost(c.var.db, id);
```

with:

```ts
    const changelog = await changelogOf(c.var.db, id);
    await deletePost(c.var.db, id);
    if (changelog) {
      c.executionCtx.waitUntil(dropChangelog(c.env.FLAGS, changelog));
    }
```

In the same file, replace:

```ts
      const { queued } = await changeStatus(c.var.db, {
```

with:

```ts
      const { queued, shippedChanged } = await changeStatus(c.var.db, {
```

In the same file, replace:

```ts
      if (queued > 0) c.executionCtx.waitUntil(markOutboxPending(c.env.FLAGS));
      return c.json<SuccessResponse<PostDetail>>({
        success: true,
        data: await postDetail(c.var.db, id, c.var.user.id),
      });
```

with:

```ts
      if (queued > 0) c.executionCtx.waitUntil(markOutboxPending(c.env.FLAGS));
      const detail = await postDetail(c.var.db, id, c.var.user.id);
      if (shippedChanged) {
        c.executionCtx.waitUntil(
          dropChangelog(c.env.FLAGS, detail.workspace.slug)
        );
      }
      return c.json<SuccessResponse<PostDetail>>({
        success: true,
        data: detail,
      });
```

In the same file, replace:

```ts
      await mergePost(c.var.db, {
        postId: c.req.valid("param").id,
        intoId,
        userId: c.var.user.id,
      });
```

with:

```ts
      const postId = c.req.valid("param").id;
      // A shipped duplicate leaves its workspace's changelog.
      const changelog = await changelogOf(c.var.db, postId);
      await mergePost(c.var.db, { postId, intoId, userId: c.var.user.id });
      if (changelog) {
        c.executionCtx.waitUntil(dropChangelog(c.env.FLAGS, changelog));
      }
```

In `worker/cron.ts`, replace:

```ts
import { createDb, type Database } from "./db/client";
```

with:

```ts
import { DEMO_WORKSPACE_SLUG } from "@/shared/demo";
import { createDb, type Database } from "./db/client";
```

In the same file, replace:

```ts
import { resetDemo } from "./services/demo-reset";
```

with:

```ts
import { dropChangelog } from "./services/changelog";
import { resetDemo } from "./services/demo-reset";
```

In the same file, replace:

```ts
          `[demo] reset: ${demo.posts} requests, ${demo.votes} votes, ${demo.comments} comments`
        );
```

with:

```ts
          `[demo] reset: ${demo.posts} requests, ${demo.votes} votes, ${demo.comments} comments`
        );
        // Its shipped requests were rebuilt: the next feed reader gets them.
        await dropChangelog(env.FLAGS, DEMO_WORKSPACE_SLUG);
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `bunx vitest run worker/routes/changelog-feed.test.ts worker/cron.test.ts worker/routes/changelog.test.ts`
Expected: PASS.

- [ ] **Step 5: Run everything and commit**

Run: `bun run typecheck && bun run check && bun run test`
Expected: all pass, 76 files and 599 tests.

```bash
git add worker
git commit -m "feat: an Atom feed of each workspace's changelog, kept in KV until it changes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The changelog page

**Files:**
- Create: `src/lib/changelog.ts`, `src/features/changelog/changelog-list.tsx`, `src/features/changelog/changelog-list.test.tsx`, `src/routes/$ws/changelog.tsx`
- Modify: `src/lib/keys.ts`, `src/routes/$ws.tsx`, `src/features/roadmap/roadmap-board.tsx`, `src/features/roadmap/roadmap-board.test.tsx`, `src/i18n/messages/en.json`, `src/i18n/messages/tr.json`
- Regenerate: `src/routeTree.gen.ts`, through `bun run build`

**Interfaces:**
- Consumes: Task 8's `GET /api/workspaces/:slug/changelog` and `ChangelogEntry`/`ChangelogPage`; Task 9's feed URL.
- Produces:
  - `postKeys.changelog(workspace, page)`, under `["posts", …]` so a status change refetches it with the rest
  - `changelogQueryOptions(workspace, page)`, `changelogFeedUrl(workspace)`
  - `<ChangelogList entries />`, grouped by month
  - the route `/$ws/changelog?page=`
  - a Changelog link in the workspace's nav, and "Full changelog" under the roadmap's Shipped column

- [ ] **Step 1: Write the failing tests**

Create `src/features/changelog/changelog-list.test.tsx`:

```tsx
// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen, within } from "@testing-library/react";
import { IntlProvider } from "use-intl";
import { afterEach, describe, expect, it } from "vitest";
import en from "@/i18n/messages/en.json";
import type { ChangelogEntry } from "@/shared/changelog";
import { ChangelogList } from "./changelog-list";

afterEach(cleanup);

const entry = (
  id: number,
  title: string,
  shippedAt: string,
  note: string | null = null,
  voteCount = 1
): ChangelogEntry => ({
  id,
  ref: `${id}-${title.toLowerCase().replace(/ /g, "-")}`,
  title,
  voteCount,
  shippedAt,
  note,
});

/** In the router, for its links; it renders on the next tick. */
function renderList(entries: ChangelogEntry[]) {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => <ChangelogList entries={entries} />,
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <IntlProvider locale="en" messages={en} timeZone="UTC">
      <RouterProvider router={router} />
    </IntlProvider>
  );
}

describe("ChangelogList", () => {
  it("groups shipped requests by month, newest first", async () => {
    renderList([
      entry(3, "Dark mode", "2026-10-21T09:00:00Z", "Shipped in 2.6.", 31),
      entry(2, "Daily notes", "2026-10-02T09:00:00Z"),
      entry(1, "Import from Notion", "2026-09-14T09:00:00Z", null, 18),
    ]);
    await screen.findByRole("heading", { name: "October 2026" });
    const months = screen.getAllByRole("heading", { level: 2 });
    expect(months.map((month) => month.textContent)).toEqual([
      "October 2026",
      "September 2026",
    ]);
    const october = within(
      screen.getByRole("region", { name: "October 2026" })
    );
    expect(
      october.getAllByRole("link").map((link) => link.getAttribute("href"))
    ).toEqual(["/p/3-dark-mode", "/p/2-daily-notes"]);
    expect(october.getByText("31 votes")).toBeTruthy();
    expect(october.getByText("1 vote")).toBeTruthy();
    expect(october.getByText("Shipped October 21")).toBeTruthy();
    expect(october.getByText("Shipped in 2.6.")).toBeTruthy();
  });

  it("says when nothing has shipped", async () => {
    renderList([]);
    expect(await screen.findByText("Nothing has shipped yet.")).toBeTruthy();
  });
});
```

In `src/features/roadmap/roadmap-board.test.tsx`, replace:

```tsx
  it("lets the team move a card a column over with the keyboard", async () => {
```

with:

```tsx
  it("links the Shipped column to the full changelog", async () => {
    fakeServer();
    renderBoard({ isTeam: false });
    await screen.findByRole("region", { name: /^Shipped/ });
    expect(
      column("Shipped")
        .getByRole("link", { name: "Full changelog" })
        .getAttribute("href")
    ).toBe("/acme/changelog");
  });

  it("lets the team move a card a column over with the keyboard", async () => {
```

- [ ] **Step 2: Run them to see them fail**

Run: `bunx vitest run src/features/changelog src/features/roadmap`
Expected: FAIL. `changelog-list.test.tsx` can't import `./changelog-list`, and the roadmap has no "Full changelog" link.

- [ ] **Step 3: Implement**

In `src/lib/keys.ts`, replace:

```ts
  roadmap: (workspace: string) => ["posts", "roadmap", workspace] as const,
```

with:

```ts
  roadmap: (workspace: string) => ["posts", "roadmap", workspace] as const,
  // Under "posts" too: a status change refetches the changelog with the rest.
  changelog: (workspace: string, page: number) =>
    ["posts", "changelog", workspace, page] as const,
```

Create `src/lib/changelog.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "./api";
import { postKeys } from "./keys";

export const changelogQueryOptions = (workspace: string, page: number) =>
  queryOptions({
    queryKey: postKeys.changelog(workspace, page),
    queryFn: async () =>
      unwrap(
        await api.workspaces[":slug"].changelog.$get({
          param: { slug: workspace },
          query: { page: String(page) },
        })
      ),
  });

/** The changelog's Atom feed, for feed readers. */
export const changelogFeedUrl = (workspace: string) =>
  `/api/workspaces/${encodeURIComponent(workspace)}/changelog.atom`;
```

Create `src/features/changelog/changelog-list.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { useFormatter, useTranslations } from "use-intl";
import type { ChangelogEntry } from "@/shared/changelog";

type Month = { label: string; entries: ChangelogEntry[] };

/**
 * Shipped requests by month, in the reader's language and time zone. The
 * entries arrive newest first, so each month is one run of them.
 */
export function ChangelogList({ entries }: { entries: ChangelogEntry[] }) {
  const t = useTranslations("changelog");
  const format = useFormatter();
  if (entries.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("empty")}</p>;
  }
  const months: Month[] = [];
  for (const entry of entries) {
    const label = format.dateTime(new Date(entry.shippedAt), {
      year: "numeric",
      month: "long",
    });
    const last = months.at(-1);
    if (last?.label === label) last.entries.push(entry);
    else months.push({ label, entries: [entry] });
  }
  return (
    <div className="flex flex-col gap-8">
      {months.map((month) => (
        <section
          key={month.label}
          aria-label={month.label}
          className="flex flex-col gap-3"
        >
          <h2 className="font-bold text-lg">{month.label}</h2>
          <ol className="flex flex-col gap-3">
            {month.entries.map((entry) => (
              <li key={entry.id} className="paper flex flex-col gap-1 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <Link
                    to="/p/$ref"
                    params={{ ref: entry.ref }}
                    className="font-semibold hover:underline"
                  >
                    {entry.title}
                  </Link>
                  <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                    {t("votes", { count: entry.voteCount })}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs">
                  {t("shipped", {
                    date: format.dateTime(new Date(entry.shippedAt), {
                      day: "numeric",
                      month: "long",
                    }),
                  })}
                </p>
                {entry.note && (
                  <p className="whitespace-pre-line text-sm">{entry.note}</p>
                )}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
```

Create `src/routes/$ws/changelog.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslations } from "use-intl";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { ChangelogList } from "@/features/changelog/changelog-list";
import { changelogFeedUrl, changelogQueryOptions } from "@/lib/changelog";

export const Route = createFileRoute("/$ws/changelog")({
  validateSearch: z.object({
    page: z.coerce.number().int().min(1).optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  loader: ({ context, params, deps }) => {
    // Starts loading with the route instead of after it renders.
    void context.queryClient.prefetchQuery(
      changelogQueryOptions(params.ws, deps.page)
    );
  },
  component: ChangelogPage,
});

function ChangelogPage() {
  const { ws } = Route.useParams();
  const page = Route.useSearch().page ?? 1;
  const navigate = useNavigate({ from: Route.fullPath });
  const t = useTranslations("changelog");
  const changelog = useQuery(changelogQueryOptions(ws, page));
  const goToPage = (next: number) =>
    void navigate({ search: { page: next > 1 ? next : undefined } });

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-muted-foreground text-sm">{t("intro")}</p>
        <a
          href={changelogFeedUrl(ws)}
          className="text-sm underline underline-offset-4"
        >
          {t("follow")}
        </a>
      </div>
      {changelog.isPending ? (
        <p className="text-muted-foreground text-sm">{t("loading")}</p>
      ) : changelog.isError ? (
        <p className="text-destructive text-sm" role="alert">
          {t("loadFailed")}
        </p>
      ) : (
        <ChangelogList entries={changelog.data.entries} />
      )}
      {(page > 1 || changelog.data?.hasMore) && (
        <nav
          className="flex items-center justify-between"
          aria-label={t("pages")}
        >
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
          >
            {t("newer")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!changelog.data?.hasMore}
            onClick={() => goToPage(page + 1)}
          >
            {t("older")}
          </Button>
        </nav>
      )}
    </section>
  );
}
```

In `src/routes/$ws.tsx`, replace:

```tsx
            {t("roadmap")}
          </Link>
```

with:

```tsx
            {t("roadmap")}
          </Link>
          <Link
            to="/$ws/changelog"
            params={{ ws }}
            activeProps={{ className: "font-semibold" }}
          >
            {t("changelog")}
          </Link>
```

In `src/features/roadmap/roadmap-board.tsx`, replace:

```tsx
            key={status}
            status={status}
```

with:

```tsx
            key={status}
            workspace={workspace}
            status={status}
```

In the same file, replace:

```tsx
function RoadmapColumn({
  status,
```

with:

```tsx
function RoadmapColumn({
  workspace,
  status,
```

In the same file, replace:

```tsx
}: {
  status: RoadmapStatus;
```

with:

```tsx
}: {
  workspace: string;
  status: RoadmapStatus;
```

In the same file, replace:

```tsx
        <p className="-mt-2 text-muted-foreground text-xs">
          {t("shippedHint")}
```

with:

```tsx
        <p className="-mt-2 flex justify-between gap-2 text-muted-foreground text-xs">
          <span>{t("shippedHint")}</span>
          <Link
            to="/$ws/changelog"
            params={{ ws: workspace }}
            className="underline underline-offset-4"
          >
            {t("fullChangelog")}
          </Link>
```

Merge into `src/i18n/messages/en.json`, adding each key at the end of its section and the new section at the end of the file:

```json
{
  "workspace": {
    "changelog": "Changelog"
  },
  "roadmap": {
    "fullChangelog": "Full changelog"
  },
  "changelog": {
    "intro": "What the team shipped, newest first.",
    "follow": "Follow with RSS",
    "empty": "Nothing has shipped yet.",
    "shipped": "Shipped {date}",
    "votes": "{count, plural, one {# vote} other {# votes}}",
    "loading": "Loading the changelog…",
    "loadFailed": "Couldn't load the changelog. Reload the page to try again.",
    "pages": "Pages",
    "newer": "Newer",
    "older": "Older"
  }
}
```

Merge into `src/i18n/messages/tr.json`, adding each key at the end of its section and the new section at the end of the file:

```json
{
  "workspace": {
    "changelog": "Yenilikler"
  },
  "roadmap": {
    "fullChangelog": "Tüm yenilikler"
  },
  "changelog": {
    "intro": "Ekibin yayına aldıkları, en yenisi önce.",
    "follow": "RSS ile takip edin",
    "empty": "Henüz yayına çıkan bir şey yok.",
    "shipped": "{date} tarihinde yayında",
    "votes": "{count} oy",
    "loading": "Yenilikler yükleniyor…",
    "loadFailed": "Yenilikler yüklenemedi. Tekrar denemek için sayfayı yenileyin.",
    "pages": "Sayfalar",
    "newer": "Daha yeni",
    "older": "Daha eski"
  }
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `bunx vitest run src/features/changelog src/features/roadmap src/i18n/messages.test.ts`
Expected: PASS.

- [ ] **Step 5: Build, which regenerates the route tree**

Run: `bun run build`
Expected: the build passes, and `src/routeTree.gen.ts` gains `/$ws/changelog`. The typecheck needs it.

- [ ] **Step 6: Run everything and commit**

Run: `bun run typecheck && bun run check && bun run test`
Expected: all pass, 77 files and 602 tests.

```bash
git add src
git commit -m "feat: a changelog page for each workspace, linked from its nav and the roadmap" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Settings → Team

**Files:**
- Create: `src/lib/team.ts`, `src/components/settings/team-section.tsx`, `src/components/settings/team-section.test.tsx`
- Modify: `src/routes/$ws/settings.tsx`, `src/i18n/messages/en.json`, `src/i18n/messages/tr.json`

**Interfaces:**
- Consumes:
  - Task 5's team routes and `managesTeam`, `TeamView`
  - Task 6's invitation routes and `SentInvitation`
  - `me.workspaces[].role` from `/api/me`
- Produces:
  - `src/lib/team.ts`:
    - `teamQueryOptions(slug)`, keyed `["team", slug]`
    - `invite(slug, { email, role })`, `resendInvitation(slug, id)`, `cancelInvitation(slug, id)`
    - `changeRole(slug, userId, role)`, `removeFromTeam(slug, userId)`
  - `<TeamSection slug viewerId viewerRole />`
  - Settings locks the workspace and boards sections for members, with a note, and shows the Team section to everyone on the team.

- [ ] **Step 1: Write the failing tests**

Create `src/components/settings/team-section.test.tsx`:

```tsx
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { IntlProvider } from "use-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";
import type { PendingInvitation, TeamView } from "@/shared/team";
import { TeamSection } from "./team-section";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const NOW = new Date("2026-10-30T12:00:00Z");

const waiting = (email: string): PendingInvitation => ({
  id: `inv-${email}`,
  email,
  role: "member",
  expiresAt: "2026-11-06T12:00:00Z",
  invitedBy: "Olbios",
});

const startingTeam = (): TeamView => ({
  members: [
    {
      userId: "u-owner",
      name: "Olbios",
      email: "owner@example.com",
      role: "owner",
      joinedAt: "2026-10-01T00:00:00Z",
    },
    {
      userId: "u-defne",
      name: "Defne",
      email: "defne@example.com",
      role: "admin",
      joinedAt: "2026-10-02T00:00:00Z",
    },
    {
      userId: "u-jonas",
      name: "Jonas",
      email: "jonas@example.com",
      role: "member",
      joinedAt: "2026-10-03T00:00:00Z",
    },
  ],
  invitations: [waiting("sam@studio.dev")],
});

/** The team's API, keeping changes; `received` records each write. */
function fakeServer({
  emailSent = true,
  refuse,
}: {
  emailSent?: boolean;
  refuse?: string;
} = {}) {
  const state = {
    team: startingTeam(),
    received: [] as { method: string; path: string; body?: unknown }[],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      if (method !== "GET")
        state.received.push({ method, path: url.pathname, body });
      const ok = (data: unknown, status = 200) =>
        Response.json({ success: true, data }, { status });
      const path = url.pathname;
      if (path === "/api/workspaces/acme/team") return ok(state.team);
      if (path === "/api/me") return ok({ user: null, workspaces: [] });
      if (refuse) {
        return Response.json(
          { success: false, code: refuse, error: "refused" },
          { status: 409 }
        );
      }
      if (path === "/api/workspaces/acme/invitations" && method === "POST") {
        const invitation = waiting(body.email);
        state.team.invitations.push(invitation);
        return ok({ invitation, emailSent }, 201);
      }
      const resend =
        /^\/api\/workspaces\/acme\/invitations\/(.+)\/resend$/.exec(path);
      if (resend) {
        const invitation = state.team.invitations.find(
          (i) => i.id === resend[1]
        );
        return ok({ invitation, emailSent: true });
      }
      const invitation = /^\/api\/workspaces\/acme\/invitations\/(.+)$/.exec(
        path
      );
      if (invitation && method === "DELETE") {
        state.team.invitations = state.team.invitations.filter(
          (i) => i.id !== invitation[1]
        );
        return ok({ id: invitation[1] });
      }
      const member = /^\/api\/workspaces\/acme\/members\/(.+)$/.exec(path);
      if (member && method === "PATCH") {
        state.team.members = state.team.members.map((m) =>
          m.userId === member[1] ? { ...m, role: body.role } : m
        );
        return ok(state.team);
      }
      if (member && method === "DELETE") {
        state.team.members = state.team.members.filter(
          (m) => m.userId !== member[1]
        );
        return ok({ userId: member[1] });
      }
      return Response.json(
        { success: false, code: "NOT_FOUND", error: "Not found" },
        { status: 404 }
      );
    })
  );
  return state;
}

async function renderTeam(viewer: { id: string; role: string }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <TeamSection
          slug="acme"
          viewerId={viewer.id}
          viewerRole={viewer.role}
        />
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <IntlProvider locale="en" messages={en} timeZone="UTC" now={NOW}>
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </IntlProvider>
  );
  await screen.findByRole("heading", { name: "Members" });
}

const memberRow = (name: string) =>
  within(
    screen
      .getAllByRole("listitem")
      .find((row) => row.textContent?.includes(name)) as HTMLElement
  );

describe("TeamSection", () => {
  it("gives owners the invite form and every control but the owner's", async () => {
    fakeServer();
    await renderTeam({ id: "u-owner", role: "owner" });
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Send invitation" })
    ).toBeTruthy();
    expect(memberRow("Olbios (you)").getByText("Owner")).toBeTruthy();
    expect(memberRow("Olbios (you)").queryByRole("button")).toBeNull();
    expect(
      (screen.getByLabelText("Role for Defne") as HTMLSelectElement).value
    ).toBe("admin");
    expect(
      screen.getByRole("button", { name: "Remove Jonas from the team" })
    ).toBeTruthy();
    expect(screen.getByText("Member · expires November 6")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Send the invitation to sam@studio.dev again",
      })
    ).toBeTruthy();
  });

  it("shows members the team without controls, and lets them leave", async () => {
    fakeServer();
    await renderTeam({ id: "u-jonas", role: "member" });
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(memberRow("Defne").getByText("Admin")).toBeTruthy();
    expect(memberRow("Defne").queryByRole("button")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /invitation to sam/ })
    ).toBeNull();
    expect(
      memberRow("Jonas (you)").getByRole("button", { name: "Leave team" })
    ).toBeTruthy();
  });

  it("invites an address and says so", async () => {
    const server = fakeServer();
    await renderTeam({ id: "u-owner", role: "owner" });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: " ada@example.com " },
    });
    fireEvent.change(screen.getByLabelText("Role"), {
      target: { value: "admin" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(
      await screen.findByText("Invitation sent to ada@example.com.")
    ).toBeTruthy();
    expect(server.received).toEqual([
      {
        method: "POST",
        path: "/api/workspaces/acme/invitations",
        body: { email: "ada@example.com", role: "admin" },
      },
    ]);
    expect(await screen.findByText("ada@example.com")).toBeTruthy();
  });

  it("says when an invitation's email didn't go out", async () => {
    fakeServer({ emailSent: false });
    await renderTeam({ id: "u-owner", role: "owner" });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "The invitation to ada@example.com is saved, but its email didn't go out. Try Resend."
    );
  });

  it("says why an invitation was refused", async () => {
    fakeServer({ refuse: "ALREADY_ON_TEAM" });
    await renderTeam({ id: "u-owner", role: "owner" });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "jonas@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "That person is already on the team."
    );
  });

  it("changes a role, and removes someone after a second click", async () => {
    const server = fakeServer();
    await renderTeam({ id: "u-owner", role: "owner" });
    fireEvent.change(screen.getByLabelText("Role for Defne"), {
      target: { value: "member" },
    });
    await waitFor(() =>
      expect(server.received).toContainEqual({
        method: "PATCH",
        path: "/api/workspaces/acme/members/u-defne",
        body: { role: "member" },
      })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Jonas from the team" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove" }));
    await waitFor(() => expect(screen.queryByText("Jonas")).toBeNull());
    expect(server.received).toContainEqual({
      method: "DELETE",
      path: "/api/workspaces/acme/members/u-jonas",
    });
  });

  it("sends an invitation again, and cancels it", async () => {
    const server = fakeServer();
    await renderTeam({ id: "u-owner", role: "owner" });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Send the invitation to sam@studio.dev again",
      })
    );
    expect(
      await screen.findByText("Invitation sent to sam@studio.dev again.")
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Cancel the invitation to sam@studio.dev",
      })
    );
    await waitFor(() =>
      expect(screen.queryByText("sam@studio.dev")).toBeNull()
    );
    expect(server.received.map((r) => `${r.method} ${r.path}`)).toEqual([
      "POST /api/workspaces/acme/invitations/inv-sam@studio.dev/resend",
      "DELETE /api/workspaces/acme/invitations/inv-sam@studio.dev",
    ]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bunx vitest run src/components/settings/team-section.test.tsx`
Expected: FAIL. It can't import `./team-section`.

- [ ] **Step 3: Implement**

Create `src/lib/team.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";
import type { AssignableRole } from "@/shared/team";
import { api, unwrap } from "./api";

/** Settings → Team: the people on it and the invitations waiting. */
export const teamQueryOptions = (slug: string) =>
  queryOptions({
    queryKey: ["team", slug],
    queryFn: async () =>
      unwrap(await api.workspaces[":slug"].team.$get({ param: { slug } })),
  });

export async function invite(
  slug: string,
  json: { email: string; role: AssignableRole }
) {
  return unwrap(
    await api.workspaces[":slug"].invitations.$post({ param: { slug }, json })
  );
}

export async function resendInvitation(slug: string, id: string) {
  return unwrap(
    await api.workspaces[":slug"].invitations[":id"].resend.$post({
      param: { slug, id },
    })
  );
}

export async function cancelInvitation(slug: string, id: string) {
  return unwrap(
    await api.workspaces[":slug"].invitations[":id"].$delete({
      param: { slug, id },
    })
  );
}

export async function changeRole(
  slug: string,
  userId: string,
  role: AssignableRole
) {
  return unwrap(
    await api.workspaces[":slug"].members[":userId"].$patch({
      param: { slug, userId },
      json: { role },
    })
  );
}

/** Removes someone from the team, or, with your own id, leaves it. */
export async function removeFromTeam(slug: string, userId: string) {
  return unwrap(
    await api.workspaces[":slug"].members[":userId"].$delete({
      param: { slug, userId },
    })
  );
}
```

Create `src/components/settings/team-section.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useFormatter, useNow, useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { apiErrorKey } from "@/lib/error-text";
import { meQueryOptions } from "@/lib/session";
import {
  cancelInvitation,
  changeRole,
  invite,
  removeFromTeam,
  resendInvitation,
  teamQueryOptions,
} from "@/lib/team";
import {
  ASSIGNABLE_ROLES,
  type AssignableRole,
  managesTeam,
  type PendingInvitation,
  type SentInvitation,
  type TeamMember,
} from "@/shared/team";

type Message = { tone: "ok" | "error"; text: string };
type Report = (message: Message) => void;

/**
 * Settings → Team. Everyone on the team sees who's on it and who's been
 * invited; owners and admins invite, change roles and remove people; anyone
 * but the owner can leave.
 */
export function TeamSection({
  slug,
  viewerId,
  viewerRole,
}: {
  slug: string;
  viewerId: string;
  viewerRole: string;
}) {
  const t = useTranslations("team");
  const team = useQuery(teamQueryOptions(slug));
  const [message, setMessage] = useState<Message | null>(null);
  const manages = managesTeam(viewerRole);

  if (team.isPending) {
    return <p className="text-muted-foreground text-sm">{t("loading")}</p>;
  }
  if (team.isError) {
    return (
      <p className="text-destructive text-sm" role="alert">
        {t("loadFailed")}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {manages && <InviteForm slug={slug} report={setMessage} />}
      {message && (
        <p
          className={
            message.tone === "error"
              ? "text-destructive text-sm"
              : "text-muted-foreground text-sm"
          }
          role={message.tone === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      )}
      <section aria-labelledby="team-members" className="flex flex-col gap-2">
        <h3 id="team-members" className="font-semibold">
          {t("members")}
        </h3>
        <ul className="flex flex-col divide-y rounded-md border">
          {team.data.members.map((member) => (
            <MemberRow
              key={member.userId}
              slug={slug}
              member={member}
              isYou={member.userId === viewerId}
              manages={manages}
              report={setMessage}
            />
          ))}
        </ul>
      </section>
      {team.data.invitations.length > 0 && (
        <section aria-labelledby="team-pending" className="flex flex-col gap-2">
          <h3 id="team-pending" className="font-semibold">
            {t("pending")}
          </h3>
          <ul className="flex flex-col divide-y rounded-md border">
            {team.data.invitations.map((invitation) => (
              <PendingRow
                key={invitation.id}
                slug={slug}
                invitation={invitation}
                manages={manages}
                report={setMessage}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** What to say about an invitation that went out, or didn't. */
function useSentText() {
  const t = useTranslations("team");
  return (sent: SentInvitation, again = false): Message =>
    sent.emailSent
      ? {
          tone: "ok",
          text: t(again ? "resent" : "invited", {
            email: sent.invitation.email,
          }),
        }
      : { tone: "error", text: t("notSent", { email: sent.invitation.email }) };
}

function useErrorText() {
  const t = useTranslations("team");
  const tErrors = useTranslations("errors");
  return (error: unknown): Message => ({
    tone: "error",
    text:
      error instanceof ApiError && error.fields?.email
        ? t("invalidEmail")
        : tErrors(apiErrorKey(error)),
  });
}

function useRefreshTeam(slug: string) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      queryKey: teamQueryOptions(slug).queryKey,
    });
}

function RoleSelect({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  /** For a select without a visible label. */
  label?: string;
  value: AssignableRole;
  onChange: (role: AssignableRole) => void;
  disabled?: boolean;
}) {
  const tRoles = useTranslations("team.roles");
  return (
    <select
      id={id}
      aria-label={label}
      className="h-9 rounded-md border bg-transparent px-2 text-sm"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as AssignableRole)}
    >
      {ASSIGNABLE_ROLES.map((role) => (
        <option key={role} value={role}>
          {tRoles(role)}
        </option>
      ))}
    </select>
  );
}

function InviteForm({ slug, report }: { slug: string; report: Report }) {
  const t = useTranslations("team");
  const sentText = useSentText();
  const errorText = useErrorText();
  const refresh = useRefreshTeam(slug);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>("member");
  const send = useMutation({
    mutationFn: () => invite(slug, { email: email.trim(), role }),
    onSuccess: async (sent) => {
      report(sentText(sent));
      setEmail("");
      await refresh();
    },
    onError: (error) => report(errorText(error)),
  });
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        send.mutate();
      }}
    >
      <div className="flex min-w-56 flex-1 flex-col gap-1">
        <Label htmlFor="invite-email">{t("emailLabel")}</Label>
        <Input
          id="invite-email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="invite-role">{t("roleLabel")}</Label>
        <RoleSelect id="invite-role" value={role} onChange={setRole} />
      </div>
      <Button type="submit" disabled={send.isPending || email.trim() === ""}>
        {t("invite")}
      </Button>
    </form>
  );
}

function MemberRow({
  slug,
  member,
  isYou,
  manages,
  report,
}: {
  slug: string;
  member: TeamMember;
  isYou: boolean;
  manages: boolean;
  report: Report;
}) {
  const t = useTranslations("team");
  const tRoles = useTranslations("team.roles");
  const errorText = useErrorText();
  const refresh = useRefreshTeam(slug);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const name = member.name || member.email || t("anonymous");
  const label = isYou ? t("you", { name }) : name;
  const setRole = useMutation({
    mutationFn: (role: AssignableRole) => changeRole(slug, member.userId, role),
    onSuccess: refresh,
    onError: (error) => report(errorText(error)),
  });
  const remove = useMutation({
    mutationFn: () => removeFromTeam(slug, member.userId),
    onSuccess: async () => {
      if (isYou) {
        // Off the team: settings aren't yours any more.
        await queryClient.invalidateQueries({
          queryKey: meQueryOptions.queryKey,
        });
        await navigate({ to: "/$ws", params: { ws: slug } });
        return;
      }
      await refresh();
    },
    onError: (error) => {
      setConfirming(false);
      report(errorText(error));
    },
  });
  const canChange = member.role !== "owner" && (manages || isYou);

  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-sm">{label}</span>
        {member.email && member.name && (
          <span className="truncate text-muted-foreground text-xs">
            {member.email}
          </span>
        )}
      </div>
      {manages && member.role !== "owner" ? (
        <RoleSelect
          id={`role-${member.userId}`}
          label={t("roleFor", { name })}
          value={member.role === "admin" ? "admin" : "member"}
          disabled={setRole.isPending}
          onChange={(role) => setRole.mutate(role)}
        />
      ) : (
        <span className="text-muted-foreground text-sm">
          {tRoles(member.role)}
        </span>
      )}
      {canChange &&
        (confirming ? (
          <Button
            size="sm"
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            {isYou ? t("confirmLeave") : t("confirmRemove")}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            aria-label={isYou ? undefined : t("removeLabel", { name })}
            onClick={() => setConfirming(true)}
          >
            {isYou ? t("leave") : t("remove")}
          </Button>
        ))}
    </li>
  );
}

function PendingRow({
  slug,
  invitation,
  manages,
  report,
}: {
  slug: string;
  invitation: PendingInvitation;
  manages: boolean;
  report: Report;
}) {
  const t = useTranslations("team");
  const tRoles = useTranslations("team.roles");
  const format = useFormatter();
  const now = useNow();
  const sentText = useSentText();
  const errorText = useErrorText();
  const refresh = useRefreshTeam(slug);
  const expiresAt = new Date(invitation.expiresAt);
  const resend = useMutation({
    mutationFn: () => resendInvitation(slug, invitation.id),
    onSuccess: async (sent) => {
      report(sentText(sent, true));
      await refresh();
    },
    onError: (error) => report(errorText(error)),
  });
  const cancel = useMutation({
    mutationFn: () => cancelInvitation(slug, invitation.id),
    onSuccess: refresh,
    onError: (error) => report(errorText(error)),
  });
  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{invitation.email}</span>
        <span className="text-muted-foreground text-xs">
          {tRoles(invitation.role)} ·{" "}
          {expiresAt < now
            ? t("expired")
            : t("expires", {
                date: format.dateTime(expiresAt, {
                  day: "numeric",
                  month: "long",
                }),
              })}
        </span>
      </div>
      {manages && (
        <>
          <Button
            size="sm"
            variant="ghost"
            aria-label={t("resendLabel", { email: invitation.email })}
            disabled={resend.isPending}
            onClick={() => resend.mutate()}
          >
            {t("resend")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={t("cancelLabel", { email: invitation.email })}
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            {t("cancel")}
          </Button>
        </>
      )}
    </li>
  );
}
```

Replace the whole of `src/routes/$ws/settings.tsx` with:

```tsx
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslations } from "use-intl";
import { BoardsEditor } from "@/components/settings/boards-editor";
import { TeamSection } from "@/components/settings/team-section";
import { WorkspaceForm } from "@/components/settings/workspace-form";
import { meQueryOptions } from "@/lib/session";
import { workspaceQueryOptions } from "@/lib/workspaces";
import { managesTeam } from "@/shared/team";

export const Route = createFileRoute("/$ws/settings")({
  beforeLoad: async ({ context, params, location }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    if (!me.user) {
      throw redirect({ to: "/signin", search: { redirect: location.href } });
    }
    // Only the team sees settings; the API refuses everyone else anyway.
    if (!me.workspaces.some((w) => w.slug === params.ws)) {
      throw redirect({ to: "/$ws", params: { ws: params.ws } });
    }
  },
  component: Settings,
});

function Settings() {
  const { ws } = Route.useParams();
  const { data: workspace } = useSuspenseQuery(workspaceQueryOptions(ws));
  const { data: me } = useSuspenseQuery(meQueryOptions);
  const t = useTranslations("settings");
  const tDemo = useTranslations("demo");
  const role = me.workspaces.find((w) => w.slug === ws)?.role ?? "member";
  const manages = managesTeam(role);
  return (
    // The demo's settings stay as the nightly reset makes them; the API
    // refuses changes, and a disabled fieldset says so up front.
    <fieldset disabled={workspace.isDemo} className="flex flex-col gap-10">
      {workspace.isDemo && (
        <p className="paper p-4 text-sm">{tDemo("settingsReadOnly")}</p>
      )}
      <fieldset disabled={!manages} className="flex flex-col gap-10">
        {!manages && !workspace.isDemo && (
          <p className="paper p-4 text-sm">{t("adminsOnly")}</p>
        )}
        <section className="paper flex flex-col gap-4 p-5 sm:p-6">
          <h2 className="font-semibold text-lg">{t("workspaceSection")}</h2>
          <WorkspaceForm workspace={workspace} />
        </section>
        <section className="paper flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-col gap-1">
            <h2 className="font-semibold text-lg">{t("boardsSection")}</h2>
            <p className="text-muted-foreground text-sm">{t("boardsHint")}</p>
          </div>
          <BoardsEditor slug={workspace.slug} boards={workspace.boards} />
        </section>
      </fieldset>
      <section className="paper flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-lg">{t("teamSection")}</h2>
          <p className="text-muted-foreground text-sm">{t("teamHint")}</p>
        </div>
        <TeamSection
          slug={workspace.slug}
          viewerId={me.user?.id ?? ""}
          viewerRole={role}
        />
      </section>
    </fieldset>
  );
}
```

Merge into `src/i18n/messages/en.json`, adding each key at the end of its section and the new section at the end of the file:

```json
{
  "settings": {
    "teamSection": "Team",
    "teamHint": "Everyone on the team can change statuses, merge duplicates and pin replies. Owners and admins also change the settings and the team.",
    "adminsOnly": "Only the workspace's owner and admins can change these settings."
  },
  "team": {
    "loading": "Loading the team…",
    "loadFailed": "Couldn't load the team. Reload the page to try again.",
    "emailLabel": "Email",
    "roleLabel": "Role",
    "invite": "Send invitation",
    "invited": "Invitation sent to {email}.",
    "resent": "Invitation sent to {email} again.",
    "notSent": "The invitation to {email} is saved, but its email didn't go out. Try Resend.",
    "invalidEmail": "Enter an email address.",
    "members": "Members",
    "pending": "Waiting invitations",
    "anonymous": "Anonymous",
    "you": "{name} (you)",
    "roleFor": "Role for {name}",
    "remove": "Remove",
    "removeLabel": "Remove {name} from the team",
    "confirmRemove": "Confirm remove",
    "leave": "Leave team",
    "confirmLeave": "Confirm leave",
    "expires": "expires {date}",
    "expired": "expired",
    "resend": "Resend",
    "resendLabel": "Send the invitation to {email} again",
    "cancel": "Cancel",
    "cancelLabel": "Cancel the invitation to {email}",
    "roles": {
      "owner": "Owner",
      "admin": "Admin",
      "member": "Member"
    }
  }
}
```

Merge into `src/i18n/messages/tr.json`, adding each key at the end of its section and the new section at the end of the file:

```json
{
  "settings": {
    "teamSection": "Ekip",
    "teamHint": "Ekipteki herkes durumları değiştirebilir, mükerrerleri birleştirebilir ve yanıtları sabitleyebilir. Sahip ve yöneticiler ayrıca ayarları ve ekibi yönetir.",
    "adminsOnly": "Bu ayarları yalnızca çalışma alanının sahibi ve yöneticileri değiştirebilir."
  },
  "team": {
    "loading": "Ekip yükleniyor…",
    "loadFailed": "Ekip yüklenemedi. Tekrar denemek için sayfayı yenileyin.",
    "emailLabel": "E-posta",
    "roleLabel": "Rol",
    "invite": "Davet gönder",
    "invited": "Davet {email} adresine gönderildi.",
    "resent": "Davet {email} adresine yeniden gönderildi.",
    "notSent": "{email} davetini kaydettik ama e-postası gönderilemedi. Yeniden göndermeyi deneyin.",
    "invalidEmail": "Bir e-posta adresi girin.",
    "members": "Üyeler",
    "pending": "Bekleyen davetler",
    "anonymous": "Anonim",
    "you": "{name} (siz)",
    "roleFor": "{name} için rol",
    "remove": "Çıkar",
    "removeLabel": "{name} kişisini ekipten çıkar",
    "confirmRemove": "Çıkarmayı onayla",
    "leave": "Ekipten ayrıl",
    "confirmLeave": "Ayrılmayı onayla",
    "expires": "{date} tarihine kadar",
    "expired": "süresi doldu",
    "resend": "Yeniden gönder",
    "resendLabel": "{email} davetini yeniden gönder",
    "cancel": "İptal et",
    "cancelLabel": "{email} davetini iptal et",
    "roles": {
      "owner": "Sahip",
      "admin": "Yönetici",
      "member": "Üye"
    }
  }
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `bunx vitest run src/components/settings src/i18n/messages.test.ts`
Expected: PASS.

- [ ] **Step 5: Run everything and commit**

Run: `bun run typecheck && bun run check && bun run test`
Expected: all pass, 78 files and 609 tests.

```bash
git add src
git commit -m "feat: Settings → Team lists the team and invitations; owners and admins invite and manage" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The invitation page

**Files:**
- Create: `src/lib/invitations.ts`, `src/features/invitations/invitation-panel.tsx`, `src/features/invitations/invitation-panel.test.tsx`, `src/routes/invite/$id.tsx`
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/tr.json`
- Regenerate: `src/routeTree.gen.ts`, through `bun run build`

**Interfaces:**
- Consumes: Task 7's `GET /api/invitations/:id`, `POST /api/invitations/:id/accept` and `InvitationView`.
- Produces:
  - `invitationQueryOptions(id)`, keyed `["invitation", id]`; `acceptInvitation(id)`, answering `{ slug }`
  - `<InvitationPanel id />`. It covers:
    - someone signed out: sign in, then come back
    - someone signed in at another address: sign out first
    - the invited address: join
    - an invitation that's expired, used or cancelled
    - someone already on the team
  - the route `/invite/$id`

- [ ] **Step 1: Write the failing tests**

Create `src/features/invitations/invitation-panel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "use-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";
import type { InvitationView } from "@/shared/invitations";
import { InvitationPanel } from "./invitation-panel";

const session = vi.hoisted(() => ({ signedIn: true }));
// Better Auth's client keeps its own fetch; sign out here instead.
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signOut: vi.fn(async () => {
      session.signedIn = false;
      return { data: { success: true }, error: null };
    }),
  },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  session.signedIn = true;
});

const view = (overrides: Partial<InvitationView> = {}): InvitationView => ({
  id: "inv-1",
  workspace: { name: "Acme", slug: "acme" },
  inviter: "Defne",
  role: "member",
  email: "s•••@studio.dev",
  state: "pending",
  forYou: true,
  onTeam: false,
  ...overrides,
});

/** The invitation's API, and who's signed in. */
function fakeServer(
  invitation: InvitationView | null,
  { refuse }: { refuse?: string } = {}
) {
  const accepted: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const ok = (data: unknown) => Response.json({ success: true, data });
      if (url.pathname === "/api/me") {
        return ok(
          session.signedIn
            ? {
                user: { id: "u-sam", name: "", email: "sam@studio.dev" },
                workspaces: [],
              }
            : { user: null, workspaces: [] }
        );
      }
      if (url.pathname === "/api/invitations/inv-1" && invitation) {
        return ok(invitation);
      }
      if (url.pathname === "/api/invitations/inv-1/accept") {
        accepted.push(init?.method ?? "GET");
        if (refuse) {
          return Response.json(
            { success: false, code: refuse, error: "refused" },
            { status: 409 }
          );
        }
        return ok({ slug: "acme" });
      }
      return Response.json(
        { success: false, code: "INVITATION_NOT_FOUND", error: "Not found" },
        { status: 404 }
      );
    })
  );
  return { accepted };
}

function renderPanel() {
  const root = createRootRoute({ component: Outlet });
  const routeTree = root.addChildren([
    createRoute({
      getParentRoute: () => root,
      path: "/",
      component: () => <InvitationPanel id="inv-1" />,
    }),
    createRoute({
      getParentRoute: () => root,
      path: "/$ws",
      component: () => <p>Workspace page</p>,
    }),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <IntlProvider locale="en" messages={en} timeZone="UTC">
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: {
              queries: { retry: false },
              mutations: { retry: false },
            },
          })
        }
      >
        <RouterProvider router={router} />
      </QueryClientProvider>
    </IntlProvider>
  );
}

describe("InvitationPanel", () => {
  it("asks someone signed out to sign in with the invited address", async () => {
    session.signedIn = false;
    fakeServer(view({ forYou: false }));
    renderPanel();
    expect(
      await screen.findByRole("heading", {
        name: "Defne invited you to Acme's team",
      })
    ).toBeTruthy();
    expect(
      screen.getByText(
        "You'd join as a member. The invitation went to s•••@studio.dev."
      )
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Sign in to join" }).getAttribute("href")
    ).toBe("/signin?redirect=%2Finvite%2Finv-1");
  });

  it("joins the team and opens the workspace", async () => {
    const server = fakeServer(view());
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Join Acme" }));
    expect(await screen.findByText("Workspace page")).toBeTruthy();
    expect(server.accepted).toEqual(["POST"]);
  });

  it("says why joining was refused", async () => {
    fakeServer(view(), { refuse: "TEAM_FULL" });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Join Acme" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "The team is full: a workspace can have 50 people."
    );
  });

  it("offers to sign out when another address is signed in", async () => {
    fakeServer(view({ forYou: false }));
    renderPanel();
    expect(
      await screen.findByText(
        "This invitation went to s•••@studio.dev. Sign out, then sign in with that address."
      )
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Join Acme" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(
      await screen.findByRole("link", { name: "Sign in to join" })
    ).toBeTruthy();
  });

  it("says when an invitation has expired, or was used or cancelled", async () => {
    fakeServer(view({ state: "expired" }));
    renderPanel();
    expect(
      await screen.findByText(
        "This invitation has expired. Ask whoever invited you to send it again."
      )
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Join Acme" })).toBeNull();
    cleanup();
    fakeServer(view({ state: "canceled" }));
    renderPanel();
    expect(
      await screen.findByText(
        "This invitation isn't open any more: it was cancelled or already used."
      )
    ).toBeTruthy();
  });

  it("points someone already on the team at the workspace", async () => {
    fakeServer(view({ onTeam: true }));
    renderPanel();
    expect(await screen.findByText("You're on Acme's team.")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Open Acme" }).getAttribute("href")
    ).toBe("/acme");
  });

  it("says when there's no such invitation", async () => {
    fakeServer(null);
    renderPanel();
    expect((await screen.findByRole("alert")).textContent).toBe(
      "This invitation isn't open any more: it was cancelled or already used."
    );
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bunx vitest run src/features/invitations`
Expected: FAIL. It can't import `./invitation-panel`.

- [ ] **Step 3: Implement**

Create `src/lib/invitations.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "./api";

/** What /invite/<id> shows; it depends on who's signed in. */
export const invitationQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["invitation", id],
    queryFn: async () =>
      unwrap(await api.invitations[":id"].$get({ param: { id } })),
  });

/** Joins the team; answers the workspace's slug. */
export async function acceptInvitation(id: string) {
  return unwrap(await api.invitations[":id"].accept.$post({ param: { id } }));
}
```

Create `src/features/invitations/invitation-panel.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { apiErrorKey } from "@/lib/error-text";
import { acceptInvitation, invitationQueryOptions } from "@/lib/invitations";
import { meQueryOptions } from "@/lib/session";
import type { InvitationView } from "@/shared/invitations";

/**
 * /invite/<id>: who's inviting, to what, as what, and the one thing to do
 * next, which depends on who's signed in.
 */
export function InvitationPanel({ id }: { id: string }) {
  const t = useTranslations("invitation");
  const tErrors = useTranslations("errors");
  const invitation = useQuery(invitationQueryOptions(id));
  const me = useQuery(meQueryOptions);
  if (invitation.isPending || me.isPending) {
    return (
      <>
        <h1 className="font-semibold text-2xl">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("loading")}</p>
      </>
    );
  }
  if (invitation.isError) {
    const gone =
      invitation.error instanceof ApiError && invitation.error.status === 404;
    return (
      <>
        <h1 className="font-semibold text-2xl">{t("title")}</h1>
        <p className="text-sm" role="alert">
          {gone
            ? tErrors("INVITATION_NOT_FOUND")
            : tErrors(apiErrorKey(invitation.error))}
        </p>
      </>
    );
  }
  return (
    <InvitationDetails
      invitation={invitation.data}
      signedIn={Boolean(me.data?.user)}
    />
  );
}

function InvitationDetails({
  invitation,
  signedIn,
}: {
  invitation: InvitationView;
  signedIn: boolean;
}) {
  const t = useTranslations("invitation");
  const tRoles = useTranslations("invitation.roles");
  const { name, slug } = invitation.workspace;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-semibold text-2xl">
        {t("heading", { inviter: invitation.inviter, workspace: name })}
      </h1>
      <p className="text-muted-foreground text-sm">
        {t("details", {
          role: tRoles(invitation.role),
          email: invitation.email,
        })}
      </p>
      <NextStep invitation={invitation} signedIn={signedIn} />
      {invitation.onTeam && (
        <Link
          to="/$ws"
          params={{ ws: slug }}
          className="text-sm underline underline-offset-4"
        >
          {t("open", { workspace: name })}
        </Link>
      )}
    </div>
  );
}

function NextStep({
  invitation,
  signedIn,
}: {
  invitation: InvitationView;
  signedIn: boolean;
}) {
  const t = useTranslations("invitation");
  const tErrors = useTranslations("errors");
  const { name } = invitation.workspace;
  if (invitation.onTeam) {
    return <p className="text-sm">{t("onTeam", { workspace: name })}</p>;
  }
  if (invitation.state === "expired") {
    return <p className="text-sm">{tErrors("INVITATION_EXPIRED")}</p>;
  }
  if (invitation.state !== "pending") {
    return <p className="text-sm">{tErrors("INVITATION_NOT_FOUND")}</p>;
  }
  if (!signedIn) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm">{t("signInHint")}</p>
        <Button asChild className="self-start">
          <Link to="/signin" search={{ redirect: `/invite/${invitation.id}` }}>
            {t("signIn")}
          </Link>
        </Button>
      </div>
    );
  }
  if (!invitation.forYou) return <WrongAddress invitation={invitation} />;
  return <JoinButton invitation={invitation} />;
}

function WrongAddress({ invitation }: { invitation: InvitationView }) {
  const t = useTranslations("invitation");
  const queryClient = useQueryClient();
  const signOut = useMutation({
    mutationFn: () => authClient.signOut(),
    // Back to signed out: the page offers sign-in, for the right address.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey }),
  });
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        {t("wrongAddress", { email: invitation.email })}
      </p>
      <Button
        variant="outline"
        className="self-start"
        disabled={signOut.isPending}
        onClick={() => signOut.mutate()}
      >
        {t("signOut")}
      </Button>
    </div>
  );
}

function JoinButton({ invitation }: { invitation: InvitationView }) {
  const t = useTranslations("invitation");
  const tErrors = useTranslations("errors");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const join = useMutation({
    mutationFn: () => acceptInvitation(invitation.id),
    onSuccess: async ({ slug }) => {
      // On the team now: the header and settings learn it from /api/me.
      await queryClient.invalidateQueries({
        queryKey: meQueryOptions.queryKey,
      });
      await navigate({ to: "/$ws", params: { ws: slug } });
    },
    onError: (err) => setError(tErrors(apiErrorKey(err))),
  });
  return (
    <div className="flex flex-col gap-2">
      <Button
        className="self-start"
        disabled={join.isPending}
        onClick={() => join.mutate()}
      >
        {t("join", { workspace: invitation.workspace.name })}
      </Button>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
```

Create `src/routes/invite/$id.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { InvitationPanel } from "@/features/invitations/invitation-panel";

// "invite" is a reserved workspace address, so this never shadows a board.
export const Route = createFileRoute("/invite/$id")({
  component: InvitePage,
});

function InvitePage() {
  const { id } = Route.useParams();
  return (
    <main className="paper mx-6 my-16 flex flex-col gap-4 p-6 sm:mx-auto sm:max-w-md sm:p-8">
      <InvitationPanel id={id} />
    </main>
  );
}
```

Merge into `src/i18n/messages/en.json`, adding the new section at the end of the file:

```json
{
  "invitation": {
    "title": "Team invitation",
    "loading": "Loading the invitation…",
    "heading": "{inviter} invited you to {workspace}'s team",
    "details": "You'd join as {role}. The invitation went to {email}.",
    "roles": {
      "admin": "an admin",
      "member": "a member"
    },
    "signInHint": "Sign in with the address the invitation went to.",
    "signIn": "Sign in to join",
    "wrongAddress": "This invitation went to {email}. Sign out, then sign in with that address.",
    "signOut": "Sign out",
    "join": "Join {workspace}",
    "onTeam": "You're on {workspace}'s team.",
    "open": "Open {workspace}"
  }
}
```

Merge into `src/i18n/messages/tr.json`, adding the new section at the end of the file:

```json
{
  "invitation": {
    "title": "Ekip daveti",
    "loading": "Davet yükleniyor…",
    "heading": "{inviter} sizi {workspace} ekibine davet etti",
    "details": "{role} olarak katılırsınız. Davet {email} adresine gönderildi.",
    "roles": {
      "admin": "Yönetici",
      "member": "Üye"
    },
    "signInHint": "Davetin gönderildiği adresle giriş yapın.",
    "signIn": "Katılmak için giriş yapın",
    "wrongAddress": "Bu davet {email} adresine gönderildi. Çıkış yapıp o adresle giriş yapın.",
    "signOut": "Çıkış yap",
    "join": "{workspace} ekibine katıl",
    "onTeam": "{workspace} ekibindesiniz.",
    "open": "{workspace} panosunu açın"
  }
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `bunx vitest run src/features/invitations src/i18n/messages.test.ts`
Expected: PASS.

- [ ] **Step 5: Build, which regenerates the route tree**

Run: `bun run build`
Expected: the build passes, and `src/routeTree.gen.ts` gains `/invite/$id`.

- [ ] **Step 6: Run everything and commit**

Run: `bun run typecheck && bun run check && bun run test`
Expected: all pass, 79 files and 616 tests.

```bash
git add src
git commit -m "feat: an invitation's page lets the invited address join the team" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Browser tests, `db:migrate:prod` (#39) and the README

**Files:**
- Create: `e2e/changelog.spec.ts`, `e2e/team.spec.ts`, `scripts/migrate-prod.ts`
- Modify: `package.json`, `.env.example`, `README.md`

**Interfaces:**
- Consumes: everything above, through the production build.
- Produces: `bun run db:migrate:prod`. It runs `drizzle-kit migrate` with `DATABASE_URL` set to `.env`'s `NEON_DATABASE_URL`, and exits 1 when that isn't set.

- [ ] **Step 1: Write the browser tests**

These check Tasks 8–12 end to end, through the production build, so they pass on their first run.

Create `e2e/changelog.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import {
  deleteRequest,
  postRequest,
  tryDemo,
  unique,
  untilSaved,
} from "./helpers";

test("the team ships a request with a note, and it heads the changelog", async ({
  browser,
}) => {
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await tryDemo(member, "member");
  const title = unique("Shipped by the end-to-end suite");
  const path = await postRequest(member, title);

  const teamContext = await browser.newContext();
  const team = await teamContext.newPage();
  await tryDemo(team, "team");
  await team.goto(path);
  await team.getByLabel("Status", { exact: true }).selectOption("shipped");
  await team
    .getByLabel("Note for the timeline (optional)")
    .fill("Out today, from the suite.");
  await untilSaved(team, "PATCH", "/status", () =>
    team.getByRole("button", { name: "Update status" }).click()
  );

  await team.goto("/demo/changelog");
  const newest = team.getByRole("listitem").first();
  await expect(newest.getByRole("link", { name: title })).toBeVisible();
  await expect(newest.getByText("Out today, from the suite.")).toBeVisible();

  // In the demo, a request is its author's to delete.
  await member.goto(path);
  await deleteRequest(member);
  await memberContext.close();
  await teamContext.close();
});
```

Create `e2e/team.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { tryDemo } from "./helpers";

test("the demo's Team page lists Inkwell's team, read-only", async ({
  page,
}) => {
  await tryDemo(page, "team");
  await page.goto("/demo/settings");
  const members = page.getByRole("region", { name: "Members" });
  await expect(members.getByText("Defne Aksoy")).toBeVisible();
  await expect(members.getByText("Owner", { exact: true })).toBeVisible();
  await expect(members.getByText(/^Guest \d{4} \(you\)$/)).toBeVisible();
  // A team guest is a member: no invitations, and the demo stays as it is.
  await expect(page.getByLabel("Email")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Leave team" })).toBeDisabled();
});
```

- [ ] **Step 2: Run the browser tests**

Run: `bun run e2e`
Expected: 5 passed: the three from Phase 5, and the two new ones.

- [ ] **Step 3: See `db:migrate:prod` fail, on a throwaway local database**

The script must never be tried against production here. Each run sets `NEON_DATABASE_URL` in the shell, which beats `.env`, to a local database made for the check.

Run: `createdb pano_migrate_check && NEON_DATABASE_URL=postgresql://olbios@127.0.0.1:5432/pano_migrate_check bun run db:migrate:prod`
Expected: FAIL, with `Script not found "db:migrate:prod"`.

- [ ] **Step 4: Add the script, and say how to use it**

Create `scripts/migrate-prod.ts`:

```ts
// `bun run db:migrate:prod`: applies the migrations to production, whose
// connection string .env keeps as NEON_DATABASE_URL. DATABASE_URL stays on
// the local database, so a plain `bun run db:migrate` can't reach production.
import { spawnSync } from "node:child_process";

const url = process.env.NEON_DATABASE_URL;
if (!url) {
  console.error(
    "NEON_DATABASE_URL is not set: add the Neon connection string to .env"
  );
  process.exit(1);
}
// Bun loaded .env into this process; drizzle-kit gets production's address
// as DATABASE_URL, which drizzle.config.ts reads.
const run = spawnSync("bunx", ["drizzle-kit", "migrate"], {
  env: { ...process.env, DATABASE_URL: url },
  stdio: "inherit",
});
process.exit(run.status ?? 1);
```

In `package.json`, replace:

```json
    "db:migrate": "drizzle-kit migrate",
```

with:

```json
    "db:migrate": "drizzle-kit migrate",
    "db:migrate:prod": "bun scripts/migrate-prod.ts",
```

In `.env.example`, replace:

```ini
TEST_DATABASE_URL=postgresql://olbios@127.0.0.1:5432/pano_test
```

with:

```ini
TEST_DATABASE_URL=postgresql://olbios@127.0.0.1:5432/pano_test
# Production's direct Neon connection string, for `bun run db:migrate:prod`
# only. DATABASE_URL stays local, so everyday commands can't reach it.
# NEON_DATABASE_URL=postgresql://…
```

In `README.md`, replace:

```markdown
5. `DATABASE_URL="$NEON_URL" bun run db:migrate`
```

with:

```markdown
5. Keep the direct connection string in `.env` as `NEON_DATABASE_URL`, then
   `bun run db:migrate:prod`. `DATABASE_URL` stays on your local database,
   so the everyday `bun run db:migrate` can't reach production.
```

Append to `README.md`:

```markdown
A release that adds migrations: `bun run db:migrate:prod` first, then
`bun run deploy`. Pano's migrations only add, so the running Worker keeps
working against the new schema until the deploy lands.
```

- [ ] **Step 5: See it migrate the throwaway database, then drop it**

Run: `NEON_DATABASE_URL=postgresql://olbios@127.0.0.1:5432/pano_migrate_check bun run db:migrate:prod && dropdb pano_migrate_check`
Expected: `[✓] migrations applied successfully!` on `pano_migrate_check`, which is then dropped.

- [ ] **Step 6: Run everything and commit**

Run: `bun run typecheck && bun run check && bun run test && bun run build && git diff --exit-code src/routeTree.gen.ts && bun run e2e`
Expected:
- Typecheck, Biome and the build pass.
- The suite passes: 79 files and 616 tests.
- The route tree is unchanged.
- The browser tests pass: 5 passed.

```bash
git add e2e scripts package.json .env.example README.md
git commit -m "feat: bun run db:migrate:prod reads production's address from NEON_DATABASE_URL; browser tests for the changelog and the team (#39)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Part 2: Release (after the merge, with you)

**Executors stop after Task 13.** The final review, its fixes and the finishing step come first. These steps start only once `main` holds Phase 6 and you say go.

They touch production, so each says who runs it:
- **You:** anything that reaches production's database, or needs your login.
- **Me:** checks, once you've said go for that step.

### R1. Check production before migrating (you)

Migration 0012's unique index refuses an account that owns two workspaces. One account could own two only through the #7 race, so it's unlikely, but check first. In the Neon console's SQL editor, on production:

```sql
select user_id, count(*) from member where role = 'owner' group by user_id having count(*) > 1;
```

Expected: no rows. If any come back, stop: we decide together which workspace keeps its owner.

### R2. Migrate (you)

`.env`'s `NEON_DATABASE_URL` holds production's direct connection string.

```bash
bun run db:migrate:prod
```

Expected: drizzle-kit applies 0011, 0012 and 0013. The running Worker keeps working: the migrations only add.

### R3. Deploy (you say go, then you or I run it)

```bash
bun run deploy
```

### R4. Check it (me, then you)

Me:
1. `curl -s https://pano.olbios88.workers.dev/api/health` answers ok.
2. `curl -s https://pano.olbios88.workers.dev/api/workspaces/demo/changelog.atom` is an Atom feed that starts with the demo's shipped requests.
3. The live browser tests, in two halves a minute apart. A run now signs in to the demo six times, and production allows five a minute from one address.

   ```bash
   E2E_BASE_URL=https://pano.olbios88.workers.dev bun run e2e e2e/member.spec.ts e2e/roadmap.spec.ts e2e/link-preview.spec.ts
   ```

   A minute later:

   ```bash
   E2E_BASE_URL=https://pano.olbios88.workers.dev bun run e2e e2e/changelog.spec.ts e2e/team.spec.ts
   ```

   Expected: 3 passed, then 2 passed.

You:
1. On `/pano` → Settings → Team, invite a second address you own, as a member. The email arrives in the workspace's language.
2. Open its link signed out, then sign in with that address. You land back on the invitation, join, and see `/pano`.
3. As the owner, make them an admin, then a member again. Then, as them, leave the team from Settings → Team.
4. Add `https://pano.olbios88.workers.dev/api/workspaces/pano/changelog.atom` to a feed reader. Ship a request on `/pano` with a note; the feed shows it within the hour.

### R5. Push (you decide)

`git push origin main` publishes Phase 6 and closes #2, #7, #8 and #39. CI then runs the verify and end-to-end jobs.
