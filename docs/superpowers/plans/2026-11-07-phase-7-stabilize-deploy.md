# Phase 7: Stabilize, then deploy from GitHub — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pano's production gets dependable on its free plans:
- ordinary requests under the Workers free plan's 10 ms of CPU
- a demo whose links, team and limits hold up
- Shipped emails that ride out a Brevo outage
- the Phase 6 review's follow-ups fixed
- deploys from GitHub Actions once CI passes

**Architecture:**
- **CPU:**
  - Better Auth is built only when something needs it. A request with no session cookie is signed out at once.
  - A valid five-minute cache cookie answers on its own, checked the way Better Auth checks it.
  - `better-auth/minimal` and Hono's `LinearRouter` trim cold requests.
  - Comment pages stop at 20 and at the deepest reply level.
  - Migration 0014 indexes the two columns that point at comments.
- **Demo:**
  - Seeded requests keep fixed ids from 900001, and the reset puts team guests back on the team.
  - Guests together have an hourly cap in production.
  - The client marks a demo request's page as the demo's, and locks writing controls for guests on real boards.
- **Email:**
  - `email_outbox.next_attempt_at` spaces out retries.
  - A KV note, `outbox:retry`, keeps the five-minute cron from waking Neon until the next try is due.
  - Unfollowing takes back queued email.
- **Deploys:**
  - CI deploys `main` after `verify` and `e2e` pass, from a GitHub environment holding the Cloudflare token.
  - Its first step refuses while production's `/api/health` reports an older migration than the commit has.

**Tech Stack:** the Phase 0–6 stack. No new packages.

**Spec:** `docs/superpowers/specs/2026-11-06-phase-7-stabilize-deploy-design.md`

**Verified in a throwaway spike (2026-11-07):** worktree `scratchpad/p7-spike`, branch `spike/phase-7`, commits 52f65fb..86897e6.
- **Spike results:** every task was built there with its tests.
  - The suite went from 80 files and 624 tests to 83 files and 664.
  - Typecheck, Biome, the build and `wrangler deploy --dry-run` passed.
  - The browser tests passed 6/6 against the production build.
- **Measured first (Node, CPU per request in a fresh process, with Node's own `fetch` warmed so only the app counts):**

  | Route | Before: first / later call | After: first / later call |
  |---|---|---|
  | `/api/me`, signed out | 12.8 / 1.6 ms | 2.7 / 0.5 ms |
  | `/api/me`, signed in | 20.6 / 4.0 ms | 11.3 / 2.3 ms |
  | feed | 20.2 / 4.7 ms | 10.7 / 2.8 ms |
  | roadmap | 21.6 / 6.2 ms | 11.2 / 5.1 ms |
  | a request | 20.0 / 5.1 ms | 10.0 / 3.0 ms |
  | its comments | 20.8 / 5.3 ms | 10.5 / 3.3 ms |
  | a vote | 23.9 / 4.8 ms | 13.8 / 3.5 ms |

  - **Where it went:**
    - Skipping Better Auth for signed-out requests saved about 10 ms on each first call.
    - Reading the cache cookie directly saved about 9 ms on a signed-in one.
    - `LinearRouter` saved about 2 ms.
    - `better-auth/minimal` cut the Worker's JavaScript from 2.27 MB to 1.73 MB. That trims startup, not the per-request numbers.
  - **The target** (a live median under 10 ms) is in reach without caching public answers in KV, so the KV fallback isn't needed.
- **Re-applied from this plan's own text (2026-11-07):** a second worktree, branch `reapply/phase-7` from 3f007ed. Each task's steps were applied exactly as written, and every Run was compared with its Expected.
  - Every task's new tests failed first, for the reasons stated, then passed at the counts each task states.
  - It ended at 83 files and 664 tests, with the build, the dry-run deploy and 6/6 browser tests passing.
  - The finished tree is byte-identical to the spike's, apart from drizzle's generated snapshot id and timestamp.
  - It caught one wrong count, fixed in this text: Task 1's four limit-test files hold 93 tests, not 94.
- **Better Auth 1.7.10:**
  - `getSession` serves a valid cache cookie without the database, after checking three things: its signature, its expiry, and that its token is the request's session token.
  - `getCookieCache` (from `better-auth/cookies`) checks the first two. The third is a string comparison.
  - An address's codes are rows found newest first by `createdAt`.
- **Vitest's fake clock:** `shouldAdvanceTime` moves `Date` in 20 ms steps unless `advanceTimeDelta` says otherwise. Coarser than 1 ms, three codes sent in a row can share a time.

**Decided in this plan** (flag any you disagree with at review):
1. **Signed-in requests skip Better Auth too** while their cache cookie is valid. The spec said only signed-out requests would. It mirrors Better Auth's own cache path: signature, expiry, matching token. It saved about 9 ms per signed-in cold request.
2. **Hono's `LinearRouter`**, not in the spec: about 2 ms off every cold request, and the whole suite passes on it.
3. **#3 is already done on `main`:** `demo` and `pano` are in `RESERVED_SLUGS`, and `shared/slug.test.ts` tests both. No task; it's closed with a note in Part 2.
4. **The limit tests' clock keeps ticking** (1 ms steps) from the middle of the window, rather than standing still. A stopped clock ties three codes sent in a row, and the "keeps the last code working" test failed with it. Started a second before a window's edge instead, that test fails. Mid-window, all of them pass.
5. **`actions/checkout` and `actions/setup-node` v7**, the current majors, not v5. Their breaking changes, persisted credentials and fork checkouts for `pull_request_target`, don't touch this workflow.
6. **One constant, `COMMENT_PAGE_SIZE`**, sets both the API's cap and the page the app asks for, so they can't drift apart.
7. **Join dates show the year.** Expiry dates are always within a week, so theirs don't.
8. **The guest lock also disables Reply** on comments, next to voting, New request, the comment form and Follow.
9. **Browser tests get a `/pano` board:** their setup seeds one with a throwaway owner, `owner@pano.test`, unless `PANO_OWNER_EMAIL` is set. The live site already has one.
10. **The guest browser test checks New request and the note.** A fresh `/pano` has no requests to vote on, so component tests cover the vote buttons.
11. **A failed email no longer raises `outbox:pending` again.** Its retry time goes into `outbox:retry`.
12. **Commit messages mention issues as `(#N)`, never "closes #N":** issues close after Part 2's checks, with your consent.

**Still open afterwards:** Phase 8's UI polish and chores; #40, live updates.

## Global Constraints

- **Repo and branch:** `~/repos/deploys/pano`, on branch `feat/phase-7-stabilize-deploy` from `main`.
  - The repo is public. Nothing is pushed until the finishing step's choice.
  - Part 2 (migrate, deploy, push, check) runs only with you.
- **Earlier phases still apply:** every Phase 0–6 Global Constraint holds.
- **No new packages.**
- **Free plans:**
  - Workers allows 10 ms of CPU per request.
  - Neon allows 100 CU-hours a month, so nothing new may wake the database on a timer.
  - KV allows 100,000 reads and 1,000 writes a day.
- **Values from the spec:**
  - A comment page holds at most 20, and replies stop at `MAX_COMMENT_DEPTH` (3).
  - Demo request ids start at 900001.
  - In production, guests together get at most 30 requests and 60 comments an hour in the demo.
  - A failed email's next try comes 5 minutes, then 30 minutes, 2 hours and 8 hours later. The 5th failure is final.
  - `outbox:retry` holds the earliest due time in epoch milliseconds, and expires 30 minutes after it.
- **New error codes**, translated in English and Turkish:

  | Status | Code | English |
  |---|---|---|
  | 429 | `DEMO_BUSY` | The demo has had a lot of new posts this hour. Try again later. |
  | 429 | `INVITE_LIMIT` | You can send ten invitations an hour. Try again later. |

- **Production stays out of reach:**
  - Tests use `TEST_DATABASE_URL`, and browser tests use `DATABASE_URL`, which stays local.
  - `NEON_DATABASE_URL` is read only by `bun run db:migrate:prod`, in Part 2.
  - Never print `.env`.
- **Messages:** every new string goes into `src/i18n/messages/en.json` and `tr.json` together. `src/i18n/messages.test.ts` checks that their keys match.

## Review Focus

1. **Production's `__Secure-` session cookies:** over https the fast path must read them, or every signed-in request quietly falls back to Better Auth. (Task 2, "reads production's __Secure- cookies the same way".)
2. **The app's own comment and reply paging:** it must stay inside the new cap of 20, or "Show more" breaks with a 400. (Task 3's `COMMENT_PAGE_SIZE`, shared by both.)
3. **Requests older than an hour:** they don't count toward the demo cap. (Task 6, "count only the last hour's requests".)
4. **The invitation page when `/api/me` fails:** it still shows the invitation, as to someone signed out, instead of loading forever. (Task 11, "still shows the invitation when Pano can't tell who's signed in".)
5. **The deploy guard when production answers with an error page, or not at all:** the deploy stops and says why, never deploys blind. (Task 12, Step 7's stand-in for production.)

---

### Task 1: Limit tests that can't straddle a window's edge (#48)

**Files:**
- Create: `worker/test/clock.ts`, `worker/test/clock.test.ts`
- Modify: `worker/routes/posts.test.ts`, `worker/routes/comments.test.ts`, `worker/routes/invitations.test.ts`, `worker/routes/me.test.ts`

**Interfaces:**
- Produces: `startMidWindow(windowMs: number): void` in `worker/test/clock.ts`. It moves `Date` to the middle of the fixed window holding the real time, ticks on from there, and puts the real clock back when the test ends.

- [ ] **Step 1: Create the branch**

```bash
cd ~/repos/deploys/pano
git switch -c feat/phase-7-stabilize-deploy
```

- [ ] **Step 2: Write the failing test**

Create `worker/test/clock.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { startMidWindow } from "./clock";

const HOUR = 60 * 60_000;

describe("startMidWindow", () => {
  it("moves the clock to the middle of the window that holds the real time", () => {
    const real = Date.now();
    startMidWindow(HOUR);
    const moved = Date.now();
    expect(moved % HOUR).toBeGreaterThanOrEqual(HOUR / 2);
    expect(moved % HOUR).toBeLessThan(HOUR / 2 + 1000);
    expect(Math.floor(moved / HOUR)).toBe(Math.floor(real / HOUR));
  });

  it("keeps the clock ticking from there", async () => {
    startMidWindow(HOUR);
    const before = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 50));
    // It ticks a millisecond at a time, behind the real clock under load.
    expect(Date.now()).toBeGreaterThan(before);
  });

  it("puts the real clock back once the test is over", () => {
    expect(vi.isFakeTimers()).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to watch it fail**

Run: `bunx vitest run worker/test/clock.test.ts`
Expected: FAIL: `Cannot find module './clock'`, `Test Files  1 failed (1)`, `Tests  no tests`.

- [ ] **Step 4: Write the helper**

Create `worker/test/clock.ts`:

```ts
import { onTestFinished, vi } from "vitest";

/**
 * Moves Date to the middle of the fixed window that holds the real time,
 * until the test ends. The clock keeps ticking from there, so a test that
 * fills a limit's window can't fail because the run crossed the top of the
 * hour, a ten-minute mark or UTC midnight. Timers stay real.
 */
export function startMidWindow(windowMs: number) {
  const now = Date.now();
  // A tick per millisecond, like the real clock: Better Auth takes the newest
  // of an address's codes by its time, so coarser ticks would tie them.
  vi.useFakeTimers({
    toFake: ["Date"],
    shouldAdvanceTime: true,
    advanceTimeDelta: 1,
  });
  vi.setSystemTime(Math.floor(now / windowMs) * windowMs + windowMs / 2);
  onTestFinished(() => {
    vi.useRealTimers();
  });
}
```

- [ ] **Step 5: Run it to watch it pass**

Run: `bunx vitest run worker/test/clock.test.ts`
Expected: PASS, `Tests  3 passed (3)`.

- [ ] **Step 6: Start each window-filling test mid-window**

The seven tests that fill a fixed window call the helper first, with their window's length.

In `worker/routes/posts.test.ts`, replace:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { posts } from "../db/schema";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import { setupWorkspace, submitPost } from "../test/fixtures";

```

with:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { posts } from "../db/schema";
import { testApp } from "../test/app";
import { startMidWindow } from "../test/clock";
import { testDb } from "../test/db";
import { setupWorkspace, submitPost } from "../test/fixtures";

```

In the same file, replace:

```ts
  });

  it("allows five posts an hour per person in production", async () => {
    // Sign in through a dev app: production also limits code requests per IP.
    const dev = testApp();
    const { slug, boards } = await setupWorkspace(dev);
```

with:

```ts
  });

  it("allows five posts an hour per person in production", async () => {
    startMidWindow(60 * 60_000);
    // Sign in through a dev app: production also limits code requests per IP.
    const dev = testApp();
    const { slug, boards } = await setupWorkspace(dev);
```

In `worker/routes/comments.test.ts`, replace:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { comments, posts } from "../db/schema";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import { commentOn, setupWorkspace, submitPost } from "../test/fixtures";

```

with:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { comments, posts } from "../db/schema";
import { testApp } from "../test/app";
import { startMidWindow } from "../test/clock";
import { testDb } from "../test/db";
import { commentOn, setupWorkspace, submitPost } from "../test/fixtures";

```

In the same file, replace:

```ts
  });

  it("allows 30 comments an hour per person in production", async () => {
    // Sign in through a dev app: production also limits code requests per IP.
    const dev = testApp();
    const { post } = await postByOwner(dev);
```

with:

```ts
  });

  it("allows 30 comments an hour per person in production", async () => {
    startMidWindow(60 * 60_000);
    // Sign in through a dev app: production also limits code requests per IP.
    const dev = testApp();
    const { post } = await postByOwner(dev);
```

In `worker/routes/invitations.test.ts`, replace:

```ts
import { resetDemo } from "../services/demo-reset";
import { NOTICE_EMAILS, utcDay } from "../services/email-budget";
import { ORIGIN, testApp } from "../test/app";
import { testDb } from "../test/db";
import { addToTeam, setupWorkspace } from "../test/fixtures";

```

with:

```ts
import { resetDemo } from "../services/demo-reset";
import { NOTICE_EMAILS, utcDay } from "../services/email-budget";
import { ORIGIN, testApp } from "../test/app";
import { startMidWindow } from "../test/clock";
import { testDb } from "../test/db";
import { addToTeam, setupWorkspace } from "../test/fixtures";

```

In the same file, replace:

```ts
  });

  it("draws on the day's email budget in production", async () => {
    const t = testApp({ ENVIRONMENT: "production" });
    const { owner, slug } = await setupWorkspace(t);
    const today = utcDay(new Date());
```

with:

```ts
  });

  it("draws on the day's email budget in production", async () => {
    startMidWindow(24 * 60 * 60_000);
    const t = testApp({ ENVIRONMENT: "production" });
    const { owner, slug } = await setupWorkspace(t);
    const today = utcDay(new Date());
```

In the same file, replace:

```ts
  });

  it("lets one person send ten an hour in production", async () => {
    const t = testApp({ ENVIRONMENT: "production" });
    const { owner, slug } = await setupWorkspace(t);
    for (let i = 0; i < 10; i++) {
```

with:

```ts
  });

  it("lets one person send ten an hour in production", async () => {
    startMidWindow(60 * 60_000);
    const t = testApp({ ENVIRONMENT: "production" });
    const { owner, slug } = await setupWorkspace(t);
    for (let i = 0; i < 10; i++) {
```

In `worker/routes/me.test.ts`, replace:

```ts
  uniqueEmail,
  updateCookie,
} from "../test/app";
import { testEnv } from "../test/env";

/** Just the session token: what a browser sends once the cache cookie expired. */
```

with:

```ts
  uniqueEmail,
  updateCookie,
} from "../test/app";
import { startMidWindow } from "../test/clock";
import { testEnv } from "../test/env";

/** Just the session token: what a browser sends once the cache cookie expired. */
```

In the same file, replace:

```ts
  });

  it("sends one address at most three codes in ten minutes in production", async () => {
    const t = testApp({ ENVIRONMENT: "production" });
    const email = uniqueEmail("limit");
    // A new network each time, so Better Auth's per-IP limit stays out of it.
```

with:

```ts
  });

  it("sends one address at most three codes in ten minutes in production", async () => {
    startMidWindow(10 * 60_000);
    const t = testApp({ ENVIRONMENT: "production" });
    const email = uniqueEmail("limit");
    // A new network each time, so Better Auth's per-IP limit stays out of it.
```

In the same file, replace:

```ts
  });

  it("keeps the last code working when it refuses another", async () => {
    const t = testApp({ ENVIRONMENT: "production" });
    const email = uniqueEmail("latest");
    // A new network each time, so Better Auth's per-IP limit stays out of it.
```

with:

```ts
  });

  it("keeps the last code working when it refuses another", async () => {
    startMidWindow(10 * 60_000);
    const t = testApp({ ENVIRONMENT: "production" });
    const email = uniqueEmail("latest");
    // A new network each time, so Better Auth's per-IP limit stays out of it.
```

In the same file, replace:

```ts
  });

  it("stops sending codes once the day's email is spent", async () => {
    const t = testApp({ ENVIRONMENT: "production" });
    const { db, close } = createDb(t.env.HYPERDRIVE.connectionString);
    const today = utcDay(new Date());
```

with:

```ts
  });

  it("stops sending codes once the day's email is spent", async () => {
    startMidWindow(24 * 60 * 60_000);
    const t = testApp({ ENVIRONMENT: "production" });
    const { db, close } = createDb(t.env.HYPERDRIVE.connectionString);
    const today = utcDay(new Date());
```

- [ ] **Step 7: Run those files**

Run: `bunx vitest run worker/routes/posts.test.ts worker/routes/comments.test.ts worker/routes/invitations.test.ts worker/routes/me.test.ts`
Expected: PASS, `Test Files  4 passed (4)`, `Tests  93 passed (93)`.

- [ ] **Step 8: Run the whole suite**

Run: `bun run typecheck && bun run check && bun run test`
Expected: typecheck and Biome clean; `Test Files  81 passed (81)`, `Tests  627 passed (627)`.

- [ ] **Step 9: Commit**

```bash
git add worker/test/clock.ts worker/test/clock.test.ts worker/routes/posts.test.ts worker/routes/comments.test.ts worker/routes/invitations.test.ts worker/routes/me.test.ts
git commit -m "test: limit tests start their clock mid-window, so a run crossing the window's edge can't fail them (#48)"
```

---

### Task 2: Better Auth only when it's needed (#38)

**Files:**
- Create: `worker/middleware/session.test.ts`
- Modify: `worker/env.ts`, `worker/middleware/auth.ts`, `worker/middleware/session.ts`, `worker/app.ts`, `worker/auth.ts`, `worker/routes/me.ts`, `worker/routes/invitations.ts`, `worker/routes/workspaces.ts`

**Interfaces:**
- Produces:
  - `AppEnv["Variables"]["auth"]` becomes `() => Auth`: it builds Better Auth on the first call and reuses it. Every caller writes `c.var.auth()`.
  - `readSession(c)` needs `c.env` too. It answers `null` without a session cookie, and the cache cookie's session when that's valid, before asking Better Auth.

- [ ] **Step 1: Write the failing tests**

They count how often a request builds Better Auth, through a spy on `createAuth`.

Create `worker/middleware/session.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createAuth } from "../auth";
import { cookieFrom, testApp } from "../test/app";
import { testEnv } from "../test/env";
import { setupWorkspace } from "../test/fixtures";

// Counts how often a request builds Better Auth, the costliest part of a
// cold request.
vi.mock("../auth", async (importOriginal) => {
  const auth = await importOriginal<typeof import("../auth")>();
  return { ...auth, createAuth: vi.fn(auth.createAuth) };
});
const built = vi.mocked(createAuth);

/** Just the session token: what a browser sends once the cache cookie expired. */
const tokenOnly = (cookie: string) =>
  cookie
    .split("; ")
    .filter((part) => part.startsWith("better-auth.session_token="))
    .join("; ");

/** Just the five-minute cache cookie. */
const cacheOnly = (cookie: string) =>
  cookie
    .split("; ")
    .filter((part) => part.startsWith("better-auth.session_data="))
    .join("; ");

async function me(t: ReturnType<typeof testApp>, cookie?: string) {
  const res = await t.request("/api/me", {
    headers: cookie ? { cookie } : {},
  });
  const body = (await res.json()) as {
    data: { user: { email: string } | null };
  };
  return body.data.user;
}

describe("reading the session", () => {
  it("answers a signed-out request without building Better Auth", async () => {
    const t = testApp();
    const { slug } = await setupWorkspace(t);
    built.mockClear();
    expect(await me(t)).toBeNull();
    const feed = await t.request(`/api/workspaces/${slug}/posts`);
    expect(feed.status).toBe(200);
    expect(built).not.toHaveBeenCalled();
    await t.settle();
  });

  it("reads a signed-in request from the cache cookie without building Better Auth", async () => {
    const t = testApp();
    const { email, cookie } = await t.signIn();
    built.mockClear();
    expect(await me(t, cookie)).toMatchObject({ email });
    expect(built).not.toHaveBeenCalled();
    await t.settle();
  });

  it("reads production's __Secure- cookies the same way", async () => {
    const site = "https://pano.test";
    const t = testApp({ BETTER_AUTH_URL: site });
    const { ctx, settle } = testEnv();
    // From the site itself, as a browser on it would send them.
    const call = (path: string, init: RequestInit = {}) =>
      t.app.request(`${site}${path}`, init, t.env, ctx);
    const post = (path: string, body: unknown) =>
      call(path, {
        method: "POST",
        headers: { "content-type": "application/json", origin: site },
        body: JSON.stringify(body),
      });
    const email = `secure-${crypto.randomUUID().slice(0, 8)}@example.com`;
    await post("/api/auth/email-otp/send-verification-otp", {
      email,
      type: "sign-in",
    });
    const signedIn = await post("/api/auth/sign-in/email-otp", {
      email,
      otp: t.lastCode(email),
    });
    const cookie = cookieFrom(signedIn);
    expect(cookie).toContain("__Secure-better-auth.session_data=");
    built.mockClear();
    const res = await call("/api/me", { headers: { cookie } });
    expect(await res.json()).toMatchObject({ data: { user: { email } } });
    expect(built).not.toHaveBeenCalled();
    await settle();
    await t.settle();
  });

  it("asks Better Auth once the cache cookie has run out", async () => {
    const t = testApp();
    const { email, cookie } = await t.signIn();
    built.mockClear();
    expect(await me(t, tokenOnly(cookie))).toMatchObject({ email });
    expect(built).toHaveBeenCalledTimes(1);
    await t.settle();
  });

  it("doesn't take another session's cache cookie", async () => {
    const t = testApp();
    const ayse = await t.signIn();
    const sam = await t.signIn();
    const mixed = `${tokenOnly(sam.cookie)}; ${cacheOnly(ayse.cookie)}`;
    expect(await me(t, mixed)).toMatchObject({ email: sam.email });
    await t.settle();
  });

  it("doesn't take a cache cookie signed with another secret", async () => {
    const t = testApp();
    const { cookie } = await t.signIn();
    const other = testApp({
      BETTER_AUTH_SECRET: "another-secret-another-secret-0123456",
    });
    expect(await me(other, cookie)).toBeNull();
    await t.settle();
    await other.settle();
  });
});
```

- [ ] **Step 2: Run them to watch three fail**

Run: `bunx vitest run worker/middleware/session.test.ts`
Expected: FAIL, `Tests  3 failed | 3 passed (6)`. The signed-out, signed-in and `__Secure-` tests each say `expected "vi.fn()" to not be called at all`, because today every request builds it.

- [ ] **Step 3: Build Better Auth on first use**

In `worker/env.ts`, replace:

```ts
  Bindings: Bindings;
  Variables: {
    db: Database;
    auth: Auth;
    /** Sign-in codes and invitations go out through this. */
    mailer: AppMailer;
    /**
```

with:

```ts
  Bindings: Bindings;
  Variables: {
    db: Database;
    /** Better Auth for this request, built the first time it's asked for. */
    auth: () => Auth;
    /** Sign-in codes and invitations go out through this. */
    mailer: AppMailer;
    /**
```

In `worker/middleware/auth.ts`, replace:

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
 * address in ten minutes, and the day's email budget. It claims before
```

with:

```ts
import { createMiddleware } from "hono/factory";
import { type Auth, createAuth } from "../auth";
import type { AppEnv } from "../env";
import type { CodeMailer } from "../mail/mailer";
import { claimCodeForAddress, claimDailyEmail } from "../services/email-budget";

/**
 * Supplies Better Auth for this request, built the first time something
 * asks for it: building it is most of a cold request's CPU, and signed-out
 * visitors never need it. Runs after withMailer.
 *
 * In production a code first takes its place in two limits: three per
 * address in ten minutes, and the day's email budget. It claims before
```

In the same file, replace:

```ts
    },
  };
  c.set("mail", mail);
  c.set(
    "auth",
    createAuth({ db: c.var.db, env: c.env, mailer: codes, claimCode })
  );
  await next();
});

```

with:

```ts
    },
  };
  c.set("mail", mail);
  let auth: Auth | undefined;
  c.set("auth", () => {
    auth ??= createAuth({ db: c.var.db, env: c.env, mailer: codes, claimCode });
    return auth;
  });
  await next();
});

```

- [ ] **Step 4: Read the session cookies before asking Better Auth**

In `worker/middleware/session.ts`, replace:

```ts
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { AppEnv, Bindings } from "../env";
```

with:

```ts
import { getCookieCache, getSessionCookie } from "better-auth/cookies";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { AppEnv, Bindings } from "../env";
```

In the same file, replace:

```ts
};

/**
 * The request's session, or null. Reading it can renew it: a fresh cache
 * cookie after the five-minute one runs out, a later expiry for someone who
 * keeps using the app. Called through auth.api those cookies would be
 * dropped, so they're passed on to this response.
 */
export async function readSession(
  c: Pick<Context<AppEnv>, "req" | "header"> & {
    var: Pick<AppEnv["Variables"], "auth">;
  }
) {
  const { headers, response } = await c.var.auth.api.getSession({
    headers: c.req.raw.headers,
    returnHeaders: true,
  });
```

with:

```ts
};

/**
 * The request's session, or null. Without a session cookie it's null at
 * once, and a valid five-minute cache cookie answers by itself: neither
 * builds Better Auth. Otherwise Better Auth reads it, which can renew it: a
 * fresh cache cookie, a later expiry for someone who keeps using the app.
 * Called through auth.api those cookies would be dropped, so they're passed
 * on to this response.
 */
export async function readSession(
  c: Pick<Context<AppEnv>, "req" | "header" | "env"> & {
    var: Pick<AppEnv["Variables"], "auth">;
  }
) {
  const token = getSessionCookie(c.req.raw.headers);
  // No session cookie: signed out, without building Better Auth.
  if (!token) return null;
  const cached = await cachedSession(c.req.raw.headers, token, c.env);
  if (cached) return cached;
  const { headers, response } = await c.var.auth().api.getSession({
    headers: c.req.raw.headers,
    returnHeaders: true,
  });
```

In the same file, replace:

```ts
    c.header("set-cookie", cookie, { append: true });
  }
  return response;
}

/** Answers 401 unless the request carries a valid session; sets c.var.user. */
```

with:

```ts
    c.header("set-cookie", cookie, { append: true });
  }
  return response;
}

/**
 * The session from Better Auth's five-minute cache cookie, checked the way
 * Better Auth checks it: signed with the secret, not expired, and for the
 * token this request carries. null sends the request through Better Auth.
 */
async function cachedSession(
  headers: Headers,
  signedToken: string,
  env: Pick<Bindings, "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL">
) {
  const cache = await getCookieCache(headers, {
    secret: env.BETTER_AUTH_SECRET,
    isSecure: env.BETTER_AUTH_URL.startsWith("https://"),
  });
  if (!cache) return null;
  const value = decodeURIComponent(signedToken);
  const dot = value.lastIndexOf(".");
  if (dot === -1 || value.slice(0, dot) !== cache.session.token) return null;
  return cache;
}

/** Answers 401 unless the request carries a valid session; sets c.var.user. */
```

- [ ] **Step 5: Call it where Better Auth is used, with the minimal build and LinearRouter**

In `worker/app.ts`, replace:

```ts
import { Hono } from "hono";
import { csrf } from "hono/csrf";
import type { ErrorResponse } from "@/shared/envelope";
import type { AppEnv } from "./env";
import { handleError, handleNotFound } from "./lib/errors";
```

with:

```ts
import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { LinearRouter } from "hono/router/linear-router";
import type { ErrorResponse } from "@/shared/envelope";
import type { AppEnv } from "./env";
import { handleError, handleNotFound } from "./lib/errors";
```

In the same file, replace:

```ts
 * code (cron triggers, HTMLRewriter) belongs in index.ts.
 */
export function createApp(deps: AppDeps = {}) {
  const app = new Hono<AppEnv>()
    .basePath("/api")
    // Refuses cross-site form posts. JSON requests already need a CORS
    // preflight, which a foreign site can't pass.
```

with:

```ts
 * code (cron triggers, HTMLRewriter) belongs in index.ts.
 */
export function createApp(deps: AppDeps = {}) {
  // The default router compiles every route into one regular expression on
  // the first request, which each cold Worker pays for. LinearRouter does no
  // work up front and checks the routes in order, cheap at this size.
  const app = new Hono<AppEnv>({ router: new LinearRouter() })
    .basePath("/api")
    // Refuses cross-site form posts. JSON requests already need a CORS
    // preflight, which a foreign site can't pass.
```

In the same file, replace:

```ts
    // Better Auth answers its own routes in its own JSON. The browser calls
    // them through Better Auth's client, not through `unwrap`.
    .on(["GET", "POST"], "/auth/*", async (c) => {
      const res = await c.var.auth.handler(c.req.raw);
      // A refused code wasn't sent: say which limit stopped it.
      if (c.var.mail.refused) {
        return c.json<ErrorResponse>(
```

with:

```ts
    // Better Auth answers its own routes in its own JSON. The browser calls
    // them through Better Auth's client, not through `unwrap`.
    .on(["GET", "POST"], "/auth/*", async (c) => {
      const res = await c.var.auth().handler(c.req.raw);
      // A refused code wasn't sent: say which limit stopped it.
      if (c.var.mail.refused) {
        return c.json<ErrorResponse>(
```

In `worker/auth.ts`, replace:

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP, organization } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
```

with:

```ts
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
// The minimal build leaves out Kysely and its SQLite dialects: Pano reaches
// Postgres through Drizzle, and the Worker stays about 0.5 MB smaller.
import { betterAuth } from "better-auth/minimal";
import { emailOTP, organization } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
```

In `worker/routes/me.ts`, replace:

```ts
    const name = cleanDisplayName(c.req.valid("json").name);
    // Through Better Auth, so the session's cached copy of the user is
    // rewritten too; its cookie goes back with this response.
    const { headers } = await c.var.auth.api.updateUser({
      body: { name },
      headers: c.req.raw.headers,
      returnHeaders: true,
```

with:

```ts
    const name = cleanDisplayName(c.req.valid("json").name);
    // Through Better Auth, so the session's cached copy of the user is
    // rewritten too; its cookie goes back with this response.
    const { headers } = await c.var.auth().api.updateUser({
      body: { name },
      headers: c.req.raw.headers,
      returnHeaders: true,
```

In `worker/routes/invitations.ts`, replace:

```ts
      const workspace = c.var.workspace;
      await refuseFullTeam(c.var.db, workspace.id);
      await claimEmail(c.var.db, c.env);
      const id = await invite(c.var.auth, c.var.db, c.req.raw.headers, {
        organizationId: workspace.id,
        email: email.toLowerCase(),
        role,
```

with:

```ts
      const workspace = c.var.workspace;
      await refuseFullTeam(c.var.db, workspace.id);
      await claimEmail(c.var.db, c.env);
      const id = await invite(c.var.auth(), c.var.db, c.req.raw.headers, {
        organizationId: workspace.id,
        email: email.toLowerCase(),
        role,
```

In the same file, replace:

```ts
        c.req.param("id")
      );
      await claimEmail(c.var.db, c.env);
      const id = await invite(c.var.auth, c.var.db, c.req.raw.headers, {
        organizationId: workspace.id,
        email: pending.email,
        role: pending.role,
```

with:

```ts
        c.req.param("id")
      );
      await claimEmail(c.var.db, c.env);
      const id = await invite(c.var.auth(), c.var.db, c.req.raw.headers, {
        organizationId: workspace.id,
        email: pending.email,
        role: pending.role,
```

In the same file, replace:

```ts
        c.req.param("id")
      );
      try {
        await c.var.auth.api.cancelInvitation({
          body: { invitationId: pending.id },
          headers: c.req.raw.headers,
        });
```

with:

```ts
        c.req.param("id")
      );
      try {
        await c.var.auth().api.cancelInvitation({
          body: { invitationId: pending.id },
          headers: c.req.raw.headers,
        });
```

In the same file, replace:

```ts
      throw alreadyOnTeam();
    }
    try {
      await c.var.auth.api.acceptInvitation({
        body: { invitationId: row.id },
        headers: c.req.raw.headers,
      });
```

with:

```ts
      throw alreadyOnTeam();
    }
    try {
      await c.var.auth().api.acceptInvitation({
        body: { invitationId: row.id },
        headers: c.req.raw.headers,
      });
```

In `worker/routes/workspaces.ts`, replace:

```ts
      const { name, slug, defaultLocale } = c.req.valid("json");
      const org = await createOrganization(
        c.var.db,
        c.var.auth,
        c.req.raw.headers,
        name,
        slug
```

with:

```ts
      const { name, slug, defaultLocale } = c.req.valid("json");
      const org = await createOrganization(
        c.var.db,
        c.var.auth(),
        c.req.raw.headers,
        name,
        slug
```

- [ ] **Step 6: Run the tests to watch them pass**

Run: `bunx vitest run worker/middleware/session.test.ts`
Expected: PASS, `Tests  6 passed (6)`.

- [ ] **Step 7: Run the whole suite and the build**

Run: `bun run typecheck && bun run check && bun run test && bun run build`
Expected: typecheck and Biome clean; `Test Files  82 passed (82)`, `Tests  633 passed (633)`; the build passes.

- [ ] **Step 8: Commit**

```bash
git add worker/env.ts worker/middleware/auth.ts worker/middleware/session.ts worker/middleware/session.test.ts worker/app.ts worker/auth.ts worker/routes/me.ts worker/routes/invitations.ts worker/routes/workspaces.ts
git commit -m "perf: signed-out requests and fresh session cookies skip building Better Auth; the minimal build and Hono's LinearRouter trim cold requests (#38)"
```

---

### Task 3: Comment pages of at most 20, and a depth guard (#19)

**Files:**
- Modify: `shared/schemas.ts`, `src/lib/comments.ts`, `worker/services/comments.ts`, `worker/routes/comments.test.ts`

**Interfaces:**
- Produces: `COMMENT_PAGE_SIZE = 20` in `shared/schemas.ts`, which the API's cap and the app's page both use. `withReplies(db, postId, rows, viewer, levels)` takes how many levels it may still go down.

- [ ] **Step 1: Write the failing tests**

In `worker/routes/comments.test.ts`, replace:

```ts
    }
    await t.settle();
  });
});

describe("GET /api/comments/:id/replies", () => {
```

with:

```ts
    }
    await t.settle();
  });

  it("takes at most 20 comments a page", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const top = await commentOn(t, owner.cookie, post.id, "Top");
    const thread = (limit: string) =>
      t.client.api.posts[":id"].comments.$get({
        param: { id: String(post.id) },
        query: { limit },
      });
    const replies = (limit: string) =>
      t.client.api.comments[":id"].replies.$get({
        param: { id: String(top.comment.id) },
        query: { limit },
      });
    expect((await thread("20")).status).toBe(200);
    expect((await thread("21")).status).toBe(400);
    expect((await replies("20")).status).toBe(200);
    expect((await replies("21")).status).toBe(400);
    await t.settle();
  });

  it("stops at the deepest level, even when the rows go deeper", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const chain: number[] = [];
    for (const body of ["Top", "Reply", "Deeper", "Deepest"]) {
      const { comment } = await commentOn(
        t,
        owner.cookie,
        post.id,
        body,
        chain.at(-1)
      );
      chain.push(comment.id);
    }
    // A reply under the deepest comment, which the API never writes.
    const deepest = chain.at(-1)!;
    await db
      .insert(comments)
      .values({ postId: post.id, parentId: deepest, depth: 3, body: "Below" });
    await db
      .update(comments)
      .set({ replyCount: 1 })
      .where(eq(comments.id, deepest));
    const { items } = await readThread(t, post.id);
    expect(items[0]!.replies[0]!.replies[0]!.replies[0]).toMatchObject({
      body: "Deepest",
      replyCount: 1,
      replies: [],
    });
    const page = await readReplies(t, chain[1]!);
    expect(page.items[0]!.replies[0]).toMatchObject({
      body: "Deepest",
      replies: [],
    });
    await t.settle();
  });
});

describe("GET /api/comments/:id/replies", () => {
```

- [ ] **Step 2: Run them to watch them fail**

Run: `bunx vitest run worker/routes/comments.test.ts`
Expected: FAIL, `Tests  2 failed | 41 passed (43)`: `expected 200 to be 400` for a limit of 21, and the deepest comment still carries the reply below it.

- [ ] **Step 3: Cap the page, in one constant the app shares**

In `shared/schemas.ts`, replace:

```ts
  parentId: idSchema.optional(),
});

/** Keyset paging: the page of comments before the id `before`. */
export const commentPageQuerySchema = z.object({
  before: z.coerce
```

with:

```ts
  parentId: idSchema.optional(),
});

/**
 * Comments a page holds at most, and what the app asks for: a page brings
 * every comment's latest replies at each level, and 50 full threads cost a
 * Worker more CPU than it has.
 */
export const COMMENT_PAGE_SIZE = 20;

/** Keyset paging: the page of comments before the id `before`. */
export const commentPageQuerySchema = z.object({
  before: z.coerce
```

In the same file, replace:

```ts
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const pinSchema = z.object({ commentId: idSchema.nullable() });
```

with:

```ts
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(COMMENT_PAGE_SIZE)
    .default(COMMENT_PAGE_SIZE),
});

export const pinSchema = z.object({ commentId: idSchema.nullable() });
```

In `src/lib/comments.ts`, replace:

```ts
import { infiniteQueryOptions } from "@tanstack/react-query";
import { api, unwrap } from "./api";
import { commentKeys } from "./keys";

const PAGE_SIZE = 20;

/** The API's paging query: the page before the comment `before`, if any. */
const pageQuery = (before: number | null) => ({
  limit: String(PAGE_SIZE),
  ...(before === null ? {} : { before: String(before) }),
});

```

with:

```ts
import { infiniteQueryOptions } from "@tanstack/react-query";
import { COMMENT_PAGE_SIZE } from "@/shared/schemas";
import { api, unwrap } from "./api";
import { commentKeys } from "./keys";

/** The API's paging query: the page before the comment `before`, if any. */
const pageQuery = (before: number | null) => ({
  limit: String(COMMENT_PAGE_SIZE),
  ...(before === null ? {} : { before: String(before) }),
});

```

- [ ] **Step 4: Count the levels down**

In `worker/services/comments.ts`, replace:

```ts
  type CommentChange,
  type CommentPage,
  type CommentView,
  replyDepth,
  replyParentId,
} from "@/shared/comments";
```

with:

```ts
  type CommentChange,
  type CommentPage,
  type CommentView,
  MAX_COMMENT_DEPTH,
  replyDepth,
  replyParentId,
} from "@/shared/comments";
```

In the same file, replace:

```ts
 * The rows as views, each carrying its latest replies, and those replies
 * theirs, down to the deepest level: a reply someone just wrote under a
 * shown comment is its newest, so it stays shown when the thread is read
 * again. One query per level; depth-3 comments have no replies, so it ends.
 */
async function withReplies(
  db: Database,
  postId: number,
  rows: CommentRow[],
  viewer: Viewer
): Promise<CommentView[]> {
  const parents = rows.filter((row) => row.replyCount > 0).map((row) => row.id);
  const replies = await latestReplies(db, postId, parents);
  const shown =
    replies.length === 0 ? [] : await withReplies(db, postId, replies, viewer);
  return rows.map((row) =>
    toView(
      row,
```

with:

```ts
 * The rows as views, each carrying its latest replies, and those replies
 * theirs, down to the deepest level: a reply someone just wrote under a
 * shown comment is its newest, so it stays shown when the thread is read
 * again. One query per level, for at most `levels` levels below the rows:
 * the API never nests deeper, and rows that do can't make a page grow.
 */
async function withReplies(
  db: Database,
  postId: number,
  rows: CommentRow[],
  viewer: Viewer,
  levels: number
): Promise<CommentView[]> {
  const parents =
    levels > 0
      ? rows.filter((row) => row.replyCount > 0).map((row) => row.id)
      : [];
  const replies = await latestReplies(db, postId, parents);
  const shown =
    replies.length === 0
      ? []
      : await withReplies(db, postId, replies, viewer, levels - 1);
  return rows.map((row) =>
    toView(
      row,
```

In the same file, replace:

```ts
  if (!viewer) throw new AppError(404, "NOT_FOUND", "Post not found");
  const page = await pageOf(db, { ...input, parentId: null });
  return {
    items: await withReplies(db, input.postId, page.rows, viewer),
    hasMore: page.hasMore,
  };
}
```

with:

```ts
  if (!viewer) throw new AppError(404, "NOT_FOUND", "Post not found");
  const page = await pageOf(db, { ...input, parentId: null });
  return {
    items: await withReplies(
      db,
      input.postId,
      page.rows,
      viewer,
      MAX_COMMENT_DEPTH
    ),
    hasMore: page.hasMore,
  };
}
```

In the same file, replace:

```ts
  }
): Promise<CommentPage> {
  const [parent] = await db
    .select({ postId: comments.postId })
    .from(comments)
    .where(eq(comments.id, input.commentId))
    .limit(1);
```

with:

```ts
  }
): Promise<CommentPage> {
  const [parent] = await db
    .select({ postId: comments.postId, depth: comments.depth })
    .from(comments)
    .where(eq(comments.id, input.commentId))
    .limit(1);
```

In the same file, replace:

```ts
  });
  // The query brings the newest first; a page of replies reads oldest first.
  return {
    items: await withReplies(db, parent.postId, page.rows.reverse(), viewer),
    hasMore: page.hasMore,
  };
}
```

with:

```ts
  });
  // The query brings the newest first; a page of replies reads oldest first.
  return {
    items: await withReplies(
      db,
      parent.postId,
      page.rows.reverse(),
      viewer,
      MAX_COMMENT_DEPTH - parent.depth - 1
    ),
    hasMore: page.hasMore,
  };
}
```

- [ ] **Step 5: Run the tests to watch them pass**

Run: `bunx vitest run worker/routes/comments.test.ts`
Expected: PASS, `Tests  43 passed (43)`.

- [ ] **Step 6: Run the whole suite**

Run: `bun run typecheck && bun run check && bun run test`
Expected: typecheck and Biome clean; `Test Files  82 passed (82)`, `Tests  635 passed (635)`.

- [ ] **Step 7: Commit**

```bash
git add shared/schemas.ts src/lib/comments.ts worker/services/comments.ts worker/routes/comments.test.ts
git commit -m "perf: a comment page holds at most 20 comments, and replies stop at the deepest level whatever the rows say (#19)"
```

---

### Task 4: Migration 0014 (#20, and #25's column)

**Files:**
- Modify: `worker/db/schema/comments.ts`, `worker/db/schema/posts.ts`, `worker/db/schema/email-outbox.ts`, `worker/db/migrations.test.ts`
- Generate: `drizzle/0014_outbox_retries_and_indexes.sql`, `drizzle/meta/0014_snapshot.json`, and the new entry in `drizzle/meta/_journal.json`

**Interfaces:**
- Produces:
  - Indexes `comments_parent_idx` on `comments (parent_id)`, and `posts_pinned_comment_idx` on `posts (pinned_comment_id) where pinned_comment_id is not null`.
  - `emailOutbox.nextAttemptAt`, `next_attempt_at timestamptz not null default now()`, used by Task 9.

- [ ] **Step 1: Write the failing tests**

In `worker/db/migrations.test.ts`, replace:

```ts
    const second = await join(await workspace(), "owner").catch((err) => err);
    expect(pgConstraint(second)).toBe(ONE_OWNED_WORKSPACE);
  });
});

```

with:

```ts
    const second = await join(await workspace(), "owner").catch((err) => err);
    expect(pgConstraint(second)).toBe(ONE_OWNED_WORKSPACE);
  });

  it("index the columns that point at a comment, so deleting a post doesn't scan", async () => {
    const rows = await db.execute<{ indexname: string; indexdef: string }>(
      sql`select indexname, indexdef from pg_indexes
          where indexname in ('comments_parent_idx', 'posts_pinned_comment_idx')
          order by indexname`
    );
    expect(rows.map((row) => row.indexname)).toEqual([
      "comments_parent_idx",
      "posts_pinned_comment_idx",
    ]);
    expect(rows[1]!.indexdef).toContain(
      "WHERE (pinned_comment_id IS NOT NULL)"
    );
  });

  it("give each queued email the time it's due, now unless set", async () => {
    const rows = await db.execute<{
      column_default: string;
      is_nullable: string;
    }>(
      sql`select column_default, is_nullable from information_schema.columns
          where table_name = 'email_outbox' and column_name = 'next_attempt_at'`
    );
    expect([...rows]).toEqual([{ column_default: "now()", is_nullable: "NO" }]);
  });
});

```

- [ ] **Step 2: Run them to watch them fail**

Run: `bunx vitest run worker/db/migrations.test.ts`
Expected: FAIL, `Tests  2 failed | 2 passed (4)`: neither index exists, and there's no `next_attempt_at` column.

- [ ] **Step 3: Add them to the schema**

In `worker/db/schema/comments.ts`, replace:

```ts
      table.parentId,
      table.id
    ),
    check("comments_depth_check", sql`${table.depth} between 0 and 3`),
    check("comments_reply_count_check", sql`${table.replyCount} >= 0`),
  ]
```

with:

```ts
      table.parentId,
      table.id
    ),
    // Deleting a comment finds its replies through this, not a scan.
    index("comments_parent_idx").on(table.parentId),
    check("comments_depth_check", sql`${table.depth} between 0 and 3`),
    check("comments_reply_count_check", sql`${table.replyCount} >= 0`),
  ]
```

In `worker/db/schema/posts.ts`, replace:

```ts
      "gin",
      sql`pano_fold(${table.title}) gin_trgm_ops`
    ),
    check("posts_vote_count_check", sql`${table.voteCount} >= 0`),
    check("posts_comment_count_check", sql`${table.commentCount} >= 0`),
    check(
```

with:

```ts
      "gin",
      sql`pano_fold(${table.title}) gin_trgm_ops`
    ),
    // Deleting a comment finds the post that pins it through this.
    index("posts_pinned_comment_idx")
      .on(table.pinnedCommentId)
      .where(sql`${table.pinnedCommentId} is not null`),
    check("posts_vote_count_check", sql`${table.voteCount} >= 0`),
    check("posts_comment_count_check", sql`${table.commentCount} >= 0`),
    check(
```

In `worker/db/schema/email-outbox.ts`, replace:

```ts
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
  },
  (table) => [
```

with:

```ts
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    // A failed email waits longer after each try; a run sends only due ones.
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastError: text("last_error"),
  },
  (table) => [
```

- [ ] **Step 4: Generate the migration**

Run: `bun run db:generate -- --name outbox_retries_and_indexes`
Expected: `[✓] Your SQL migration file ➜ drizzle/0014_outbox_retries_and_indexes.sql`. The file must read exactly:

```sql
ALTER TABLE "email_outbox" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "comments_parent_idx" ON "comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "posts_pinned_comment_idx" ON "posts" USING btree ("pinned_comment_id") WHERE "posts"."pinned_comment_id" is not null;
```

All three changes only add, so the running Worker keeps working while production migrates ahead of the deploy.

- [ ] **Step 5: Run the tests to watch them pass**

The test setup applies the new migration first.

Run: `bunx vitest run worker/db/migrations.test.ts`
Expected: PASS, `Tests  4 passed (4)`.

- [ ] **Step 6: Run the whole suite**

Run: `bun run typecheck && bun run check && bun run test`
Expected: typecheck and Biome clean; `Test Files  82 passed (82)`, `Tests  637 passed (637)`.

- [ ] **Step 7: Commit**

```bash
git add worker/db drizzle
git commit -m "feat: migration 0014 indexes comments.parent_id and posts.pinned_comment_id, and gives queued emails a due time (#20, #25)"
```

---

### Task 5: Demo links that outlive the reset, and team guests who stay on the team (#36, #31)

**Files:**
- Modify: `worker/demo/content.ts`, `worker/services/demo-reset.ts`, `worker/services/demo-reset.test.ts`

**Interfaces:**
- Produces: `DemoPost.id: number`, fixed and from 900001 up. The reset inserts the requests with those ids and puts the surviving team guests back on the team.

- [ ] **Step 1: Write the failing tests**

The existing guest test now expects the recent team guest back on the team.

In `worker/services/demo-reset.test.ts`, replace:

```ts
      .from(users)
      .where(inArray(users.id, [old, recent]));
    expect(left).toEqual([{ id: recent }]);
    // Still signed in, but off the rebuilt workspace's team.
    const teams = await db
      .select({ id: member.id })
      .from(member)
      .where(eq(member.userId, recent));
    expect(teams).toEqual([]);
  });

  it("leaves other workspaces and their people alone", async () => {
```

with:

```ts
      .from(users)
      .where(inArray(users.id, [old, recent]));
    expect(left).toEqual([{ id: recent }]);
    // Still signed in, and back on the rebuilt workspace's team.
    const teams = await db
      .select({ organizationId: member.organizationId, role: member.role })
      .from(member)
      .where(eq(member.userId, recent));
    expect(teams).toEqual([
      { organizationId: DEMO_WORKSPACE_ID, role: "member" },
    ]);
  });

  it("leaves a guest who wasn't on the team off it", async () => {
    await resetDemo(db);
    const id = crypto.randomUUID();
    await db.insert(users).values({
      id,
      name: "Guest 5678",
      email: `guest-${id}@demo.pano.invalid`,
      emailVerified: true,
    });

    await resetDemo(db);

    const teams = await db
      .select({ id: member.id })
      .from(member)
      .where(eq(member.userId, id));
    expect(teams).toEqual([]);
  });

  it("numbers the demo's requests from 900001, each number once", () => {
    const ids = DEMO_POSTS.map((post) => post.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Math.min(...ids)).toBe(900_001);
    expect(Math.max(...ids)).toBe(900_000 + ids.length);
  });

  it("gives the demo's requests the same ids after every reset, so links keep working", async () => {
    const demoPosts = () =>
      db
        .select({ id: posts.id, title: posts.title })
        .from(posts)
        .where(eq(posts.organizationId, DEMO_WORKSPACE_ID))
        .orderBy(posts.id);
    await resetDemo(db);
    const before = await demoPosts();
    expect(before.map((post) => post.id)).toEqual(
      DEMO_POSTS.map((post) => post.id)
    );

    await resetDemo(db);

    expect(await demoPosts()).toEqual(before);
    const t = testApp();
    const res = await t.client.api.posts[":id"].$get({
      param: { id: String(before[0]!.id) },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: { title: before[0]!.title },
    });
    await t.settle();
  });

  it("leaves other workspaces and their people alone", async () => {
```

- [ ] **Step 2: Run them to watch them fail**

Run: `bunx vitest run worker/services/demo-reset.test.ts`
Expected: FAIL, `Tests  3 failed | 5 passed (8)`: the guest is off the team, the ids aren't numbered, and the ids change between resets.

- [ ] **Step 3: Number the seeded requests**

Each of the 29 requests gets an `id` line above its `board`, in order:

```bash
bun -e 'const path = "worker/demo/content.ts"; const text = await Bun.file(path).text(); const start = text.indexOf("export const DEMO_POSTS"); let n = 900000; await Bun.write(path, text.slice(0, start) + text.slice(start).replaceAll("\n  {\n    board: ", () => `\n  {\n    id: ${++n},\n    board: `)); console.log(`numbered ${n - 900000} requests`);'
```

Expected: `numbered 29 requests`. Then give the type its field:

In `worker/demo/content.ts`, replace:

```ts
};

export type DemoPost = {
  board: DemoBoard;
  title: string;
  body: string;
```

with:

```ts
};

export type DemoPost = {
  /**
   * Fixed, from the block kept for the demo (900001 up), so a link to a
   * demo request still opens after the nightly reset. A new request takes
   * the next unused number; reordering the list moves no links.
   */
  id: number;
  board: DemoBoard;
  title: string;
  body: string;
```

- [ ] **Step 4: Insert them with their ids, and keep the team guests**

In `worker/services/demo-reset.ts`, replace:

```ts
import { and, eq, like, lt, sql } from "drizzle-orm";
import { DEMO_EMAIL_DOMAIN, DEMO_WORKSPACE_SLUG } from "@/shared/demo";
import type { PostStatus } from "@/shared/status";
import type { Database } from "../db/client";
import { organization, user as users } from "../db/schema";
import {
  DEMO_BOARDS,
  DEMO_PEOPLE,
```

with:

```ts
import { and, eq, gte, like, lt, sql } from "drizzle-orm";
import { DEMO_EMAIL_DOMAIN, DEMO_WORKSPACE_SLUG } from "@/shared/demo";
import type { PostStatus } from "@/shared/status";
import type { Database } from "../db/client";
import { member, organization, user as users } from "../db/schema";
import {
  DEMO_BOARDS,
  DEMO_PEOPLE,
```

In the same file, replace:

```ts
 * repair the workspace, it replaces it. Every write is scoped to the demo's
 * fixed workspace id and to demo addresses; nothing else is touched.
 *
 * The nightly cron runs it, and the Workers free plan allows a cron 10 ms of
 * CPU. So it costs four statements: the rows are built here, sent as one
 * JSON parameter, and unpacked by Postgres (`jsonb_to_recordset`).
 */
export async function resetDemo(
```

with:

```ts
 * repair the workspace, it replaces it. Every write is scoped to the demo's
 * fixed workspace id and to demo addresses; nothing else is touched.
 *
 * Requests keep fixed ids, so links to them outlive the reset, and team
 * guests who stay the night are put back on the rebuilt team.
 *
 * The nightly cron runs it, and the Workers free plan allows a cron 10 ms of
 * CPU. So it costs five statements: the rows are built here, sent as one
 * JSON parameter, and unpacked by Postgres (`jsonb_to_recordset`).
 */
export async function resetDemo(
```

In the same file, replace:

```ts
  now = new Date()
): Promise<DemoResetSummary> {
  return db.transaction(async (tx) => {
    // Demo accounts more than a day old, with their sessions and votes: the
    // seeded people, and guests from before the last reset. A guest from
    // since keeps their account one more night, so a visitor mid-demo at
```

with:

```ts
  now = new Date()
): Promise<DemoResetSummary> {
  return db.transaction(async (tx) => {
    const lastNight = new Date(now.getTime() - DAY);
    // Guests on the team who stay the night (see below) rejoin it.
    const teamGuests = await tx
      .select({ userId: member.userId, role: member.role })
      .from(member)
      .innerJoin(users, eq(users.id, member.userId))
      .where(
        and(
          eq(member.organizationId, DEMO_WORKSPACE_ID),
          like(users.email, `%@${DEMO_EMAIL_DOMAIN}`),
          gte(users.createdAt, lastNight)
        )
      );
    // Demo accounts more than a day old, with their sessions and votes: the
    // seeded people, and guests from before the last reset. A guest from
    // since keeps their account one more night, so a visitor mid-demo at
```

In the same file, replace:

```ts
      .where(
        and(
          like(users.email, `%@${DEMO_EMAIL_DOMAIN}`),
          lt(users.createdAt, new Date(now.getTime() - DAY))
        )
      );
    // The workspace, with its boards, requests and everything on them.
    await tx.delete(organization).where(eq(organization.id, DEMO_WORKSPACE_ID));
    // Ids from the tables' own sequences, so votes and comments can point at
    // their posts and parents before any of them exist.
    const [ids] = await tx.execute<{ posts: number[]; comments: number[] }>(sql`
      select
        (select json_agg(nextval(pg_get_serial_sequence('posts', 'id'))) from generate_series(1, ${DEMO_POSTS.length})) as posts,
        (select json_agg(nextval(pg_get_serial_sequence('comments', 'id'))) from generate_series(1, ${countComments(DEMO_POSTS)})) as comments`);
    const rows = demoRows({
      now: now.getTime(),
      postIds: ids!.posts,
      commentIds: ids!.comments,
    });
    // One statement: foreign keys are checked when it ends, so the order of
    // its parts, and of rows within them, doesn't matter.
```

with:

```ts
      .where(
        and(
          like(users.email, `%@${DEMO_EMAIL_DOMAIN}`),
          lt(users.createdAt, lastNight)
        )
      );
    // The workspace, with its boards, requests and everything on them.
    await tx.delete(organization).where(eq(organization.id, DEMO_WORKSPACE_ID));
    // Comment ids from the table's own sequence, so replies can point at
    // their parents before any of them exist.
    const [ids] = await tx.execute<{ comments: number[] }>(sql`
      select (select json_agg(nextval(pg_get_serial_sequence('comments', 'id'))) from generate_series(1, ${countComments(DEMO_POSTS)})) as comments`);
    const rows = demoRows({
      now: now.getTime(),
      commentIds: ids!.comments,
      teamGuests,
    });
    // One statement: foreign keys are checked when it ends, so the order of
    // its parts, and of rows within them, doesn't matter.
```

In the same file, replace:

```ts
 */
function demoRows(input: {
  now: number;
  postIds: number[];
  commentIds: number[];
}) {
  const { now } = input;
  const iso = (ms: number) => new Date(ms).toISOString();
```

with:

```ts
 */
function demoRows(input: {
  now: number;
  commentIds: number[];
  teamGuests: { userId: string; role: string }[];
}) {
  const { now } = input;
  const iso = (ms: number) => new Date(ms).toISOString();
```

In the same file, replace:

```ts
      email: `${person.key}@${DEMO_EMAIL_DOMAIN}`,
      created_at: founded,
    })),
    team: DEMO_TEAM.map((person, index) => ({
      id: `mem_demo_${person.key}`,
      user_id: personId(person.key),
      role: index === 0 ? "owner" : "admin",
    })),
    boards: DEMO_BOARDS.map((board, position) => ({
      id: boardIds.get(board.slug)!,
      slug: board.slug,
```

with:

```ts
      email: `${person.key}@${DEMO_EMAIL_DOMAIN}`,
      created_at: founded,
    })),
    team: [
      ...DEMO_TEAM.map((person, index) => ({
        id: `mem_demo_${person.key}`,
        user_id: personId(person.key),
        role: index === 0 ? "owner" : "admin",
      })),
      ...input.teamGuests.map((guest) => ({
        id: crypto.randomUUID(),
        user_id: guest.userId,
        role: guest.role,
      })),
    ],
    boards: DEMO_BOARDS.map((board, position) => ({
      id: boardIds.get(board.slug)!,
      slug: board.slug,
```

In the same file, replace:

```ts
  };
  const commentIds = [...input.commentIds];

  DEMO_POSTS.forEach((post, index) => {
    const postId = input.postIds[index]!;
    const created = now - post.daysAgo * DAY;
    // People follow a post from the first time they post, vote or comment.
    const followed = new Map<string, number>();
```

with:

```ts
  };
  const commentIds = [...input.commentIds];

  DEMO_POSTS.forEach((post) => {
    const postId = post.id;
    const created = now - post.daysAgo * DAY;
    // People follow a post from the first time they post, vote or comment.
    const followed = new Map<string, number>();
```

- [ ] **Step 5: Run the tests to watch them pass**

Run: `bunx vitest run worker/services/demo-reset.test.ts`
Expected: PASS, `Tests  8 passed (8)`.

- [ ] **Step 6: Run the whole suite**

Run: `bun run typecheck && bun run check && bun run test`
Expected: typecheck and Biome clean; `Test Files  82 passed (82)`, `Tests  640 passed (640)`.

- [ ] **Step 7: Commit**

```bash
git add worker/demo/content.ts worker/services/demo-reset.ts worker/services/demo-reset.test.ts
git commit -m "fix: demo requests keep their ids across the nightly reset, and team guests who stay the night rejoin the team (#36, #31)"
```

---

### Task 6: A demo-wide hourly cap for guests (#28)

**Files:**
- Modify: `worker/middleware/demo.ts`, `worker/routes/posts.ts`, `worker/routes/comments.ts`, `shared/envelope.ts`, `src/i18n/messages/en.json`, `src/i18n/messages/tr.json`, `worker/middleware/demo.test.ts`

**Interfaces:**
- Produces:
  - `DEMO_HOURLY = { post: 30, comment: 60 }`.
  - `capDemo(kind: "post" | "comment")` middleware, which runs after `rateLimit` on the create-request and create-comment routes.
  - The error code `DEMO_BUSY` (429).

- [ ] **Step 1: Write the failing tests**

They fill the demo's last hour straight into the database, one short of the cap.

In `worker/middleware/demo.test.ts`, replace:

```ts
    expect(removed.status).toBe(200);
    await t.settle();
  });
});

```

with:

```ts
    expect(removed.status).toBe(200);
    await t.settle();
  });
});

describe("guests together", () => {
  it("add at most 30 requests to the demo in an hour, in production", async () => {
    const dev = testApp();
    const prod = testApp({ ENVIRONMENT: "production" });
    const guest = await dev.signInDemo("member");
    const person = await dev.signIn();
    const { boardId } = await demoPost();
    // What 29 other guests left in the last hour.
    await db.insert(posts).values(
      Array.from({ length: 29 }, (_, i) => ({
        organizationId: DEMO_WORKSPACE_ID,
        boardId,
        title: `Busy hour ${i}`,
        searchConfig: "english" as const,
      }))
    );
    const create = (t: TestApp, cookie: string) =>
      t.client.api.workspaces[":slug"].posts.$post(
        {
          param: { slug: "demo" },
          json: { boardId, title: "One more", body: "" },
        },
        { headers: { cookie } }
      );
    try {
      expect((await create(prod, guest.cookie)).status).toBe(201);
      const refused = await create(prod, guest.cookie);
      expect(refused.status).toBe(429);
      expect(await codeOf(refused)).toBe("DEMO_BUSY");
      // A real account isn't a guest, and outside production nothing counts.
      expect((await create(prod, person.cookie)).status).toBe(201);
      expect((await create(dev, guest.cookie)).status).toBe(201);
    } finally {
      await resetDemo(db);
      await dev.settle();
      await prod.settle();
    }
  });

  it("count only the last hour's requests", async () => {
    const dev = testApp();
    const prod = testApp({ ENVIRONMENT: "production" });
    const guest = await dev.signInDemo("member");
    const { boardId } = await demoPost();
    // A busy hour that ended a minute ago.
    await db.insert(posts).values(
      Array.from({ length: 30 }, (_, i) => ({
        organizationId: DEMO_WORKSPACE_ID,
        boardId,
        title: `Earlier ${i}`,
        searchConfig: "english" as const,
        createdAt: new Date(Date.now() - 61 * 60_000),
      }))
    );
    try {
      const res = await prod.client.api.workspaces[":slug"].posts.$post(
        {
          param: { slug: "demo" },
          json: { boardId, title: "A fresh hour", body: "" },
        },
        { headers: { cookie: guest.cookie } }
      );
      expect(res.status).toBe(201);
    } finally {
      await resetDemo(db);
      await dev.settle();
      await prod.settle();
    }
  });

  it("add at most 60 comments to the demo in an hour, in production", async () => {
    const dev = testApp();
    const prod = testApp({ ENVIRONMENT: "production" });
    const guest = await dev.signInDemo("member");
    const { id: postId } = await demoPost();
    await db
      .insert(comments)
      .values(
        Array.from({ length: 59 }, (_, i) => ({ postId, body: `Busy ${i}` }))
      );
    const send = () =>
      prod.client.api.posts[":id"].comments.$post(
        { param: { id: String(postId) }, json: { body: "Me too" } },
        { headers: { cookie: guest.cookie } }
      );
    try {
      expect((await send()).status).toBe(201);
      const refused = await send();
      expect(refused.status).toBe(429);
      expect(await codeOf(refused)).toBe("DEMO_BUSY");
    } finally {
      await resetDemo(db);
      await dev.settle();
      await prod.settle();
    }
  });
});

```

- [ ] **Step 2: Run them to watch two fail**

Run: `bunx vitest run worker/middleware/demo.test.ts`
Expected: FAIL, `Tests  2 failed | 8 passed (10)`: `expected 201 to be 429` for the request cap and the comment cap. "count only the last hour's requests" already passes, since nothing counts yet.

- [ ] **Step 3: Add the error code and its messages**

In `shared/envelope.ts`, replace:

```ts
  | "POST_MERGED"
  | "DEMO_ONLY"
  | "DEMO_READ_ONLY"
  | "CODE_LIMIT"
  | "EMAIL_BUDGET"
  | "ADMINS_ONLY"
```

with:

```ts
  | "POST_MERGED"
  | "DEMO_ONLY"
  | "DEMO_READ_ONLY"
  | "DEMO_BUSY"
  | "CODE_LIMIT"
  | "EMAIL_BUDGET"
  | "ADMINS_ONLY"
```

In `src/i18n/messages/en.json`, replace:

```json
    "POST_MERGED": "This request was merged into another one.",
    "DEMO_ONLY": "Demo accounts work only in the demo workspace.",
    "DEMO_READ_ONLY": "In the demo, settings and other people's posts stay as they are. Everything else is yours to try.",
    "NETWORK": "Couldn't reach Pano. Check your connection and try again.",
    "CODE_LIMIT": "Too many codes went to this address. Try again in a few minutes.",
    "EMAIL_BUDGET": "Pano has sent all the email it can today. Try again tomorrow.",
```

with:

```json
    "POST_MERGED": "This request was merged into another one.",
    "DEMO_ONLY": "Demo accounts work only in the demo workspace.",
    "DEMO_READ_ONLY": "In the demo, settings and other people's posts stay as they are. Everything else is yours to try.",
    "DEMO_BUSY": "The demo has had a lot of new posts this hour. Try again later.",
    "NETWORK": "Couldn't reach Pano. Check your connection and try again.",
    "CODE_LIMIT": "Too many codes went to this address. Try again in a few minutes.",
    "EMAIL_BUDGET": "Pano has sent all the email it can today. Try again tomorrow.",
```

In `src/i18n/messages/tr.json`, replace:

```json
    "POST_MERGED": "Bu istek başka bir istekle birleştirildi.",
    "DEMO_ONLY": "Demo hesapları yalnızca demo çalışma alanında kullanılabilir.",
    "DEMO_READ_ONLY": "Demoda ayarlar ve başkalarının yazdıkları değiştirilemez. Geri kalan her şeyi deneyebilirsiniz.",
    "NETWORK": "Pano'ya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.",
    "CODE_LIMIT": "Bu adrese çok fazla kod gönderildi. Birkaç dakika sonra tekrar deneyin.",
    "EMAIL_BUDGET": "Pano bugün gönderebileceği tüm e-postaları gönderdi. Yarın tekrar deneyin.",
```

with:

```json
    "POST_MERGED": "Bu istek başka bir istekle birleştirildi.",
    "DEMO_ONLY": "Demo hesapları yalnızca demo çalışma alanında kullanılabilir.",
    "DEMO_READ_ONLY": "Demoda ayarlar ve başkalarının yazdıkları değiştirilemez. Geri kalan her şeyi deneyebilirsiniz.",
    "DEMO_BUSY": "Demoya bu saat çok sayıda yeni gönderi eklendi. Daha sonra tekrar deneyin.",
    "NETWORK": "Pano'ya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.",
    "CODE_LIMIT": "Bu adrese çok fazla kod gönderildi. Birkaç dakika sonra tekrar deneyin.",
    "EMAIL_BUDGET": "Pano bugün gönderebileceği tüm e-postaları gönderdi. Yarın tekrar deneyin.",
```

- [ ] **Step 4: Count the demo's last hour**

In `worker/middleware/demo.ts`, replace:

```ts
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { isDemoEmail } from "@/shared/demo";
import type { Database } from "../db/client";
import { organization, posts, workspaceSettings } from "../db/schema";
import { AppError } from "../lib/errors";
import type { UserEnv } from "./session";
import type { TeamEnv } from "./team";

```

with:

```ts
import { and, count, eq, gt, sql } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { isDemoEmail } from "@/shared/demo";
import type { Database } from "../db/client";
import { comments, organization, posts, workspaceSettings } from "../db/schema";
import { AppError } from "../lib/errors";
import { DEMO_WORKSPACE_ID } from "../services/demo-reset";
import type { UserEnv } from "./session";
import type { TeamEnv } from "./team";

```

In the same file, replace:

```ts
    }
    await next();
  });

/**
 * The demo workspace's name, language and boards stay as the nightly reset
```

with:

```ts
    }
    await next();
  });

/** What guests, all together, may add to the demo in an hour. */
export const DEMO_HOURLY = { post: 30, comment: 60 } as const;

/**
 * Caps what guests add to the demo in an hour, all of them together; runs
 * after confineDemo, so a guest's request is in the demo. Each "Try as…"
 * click makes a new guest with limits of its own, so per-person limits
 * alone would let a script fill the demo until the nightly reset. It counts
 * the demo's own rows, and like the other limits it applies in production.
 */
export const capDemo = (kind: keyof typeof DEMO_HOURLY) =>
  createMiddleware<UserEnv>(async (c, next) => {
    if (
      c.env.ENVIRONMENT === "production" &&
      isDemoEmail(c.var.user.email) &&
      (await addedToDemoLastHour(c.var.db, kind)) >= DEMO_HOURLY[kind]
    ) {
      throw new AppError(
        429,
        "DEMO_BUSY",
        "The demo has had a lot of new posts this hour"
      );
    }
    await next();
  });

async function addedToDemoLastHour(
  db: Database,
  kind: keyof typeof DEMO_HOURLY
) {
  const since = sql`now() - interval '1 hour'`;
  const [row] =
    kind === "post"
      ? await db
          .select({ n: count() })
          .from(posts)
          .where(
            and(
              eq(posts.organizationId, DEMO_WORKSPACE_ID),
              gt(posts.createdAt, since)
            )
          )
      : await db
          .select({ n: count() })
          .from(comments)
          .innerJoin(posts, eq(posts.id, comments.postId))
          .where(
            and(
              eq(posts.organizationId, DEMO_WORKSPACE_ID),
              gt(comments.createdAt, since)
            )
          );
  return row?.n ?? 0;
}

/**
 * The demo workspace's name, language and boards stay as the nightly reset
```

In `worker/routes/posts.ts`, replace:

```ts
import type { AppEnv } from "../env";
import { AppError } from "../lib/errors";
import { idParamSchema, validate } from "../lib/validate";
import { confineDemo } from "../middleware/demo";
import { rateLimit } from "../middleware/rate-limit";
import { readViewerId, requireUser } from "../middleware/session";
import { changelogOf, dropChangelog } from "../services/changelog";
```

with:

```ts
import type { AppEnv } from "../env";
import { AppError } from "../lib/errors";
import { idParamSchema, validate } from "../lib/validate";
import { capDemo, confineDemo } from "../middleware/demo";
import { rateLimit } from "../middleware/rate-limit";
import { readViewerId, requireUser } from "../middleware/session";
import { changelogOf, dropChangelog } from "../services/changelog";
```

In the same file, replace:

```ts
    confineDemo("workspace"),
    validate("json", createPostSchema),
    rateLimit("post", 5, 3600),
    async (c) => {
      const { boardId, title, body } = c.req.valid("json");
      const workspace = await findWorkspace(c.var.db, c.req.param("slug"));
```

with:

```ts
    confineDemo("workspace"),
    validate("json", createPostSchema),
    rateLimit("post", 5, 3600),
    capDemo("post"),
    async (c) => {
      const { boardId, title, body } = c.req.valid("json");
      const workspace = await findWorkspace(c.var.db, c.req.param("slug"));
```

In `worker/routes/comments.ts`, replace:

```ts
} from "@/shared/schemas";
import type { AppEnv } from "../env";
import { idParamSchema, validate } from "../lib/validate";
import { confineDemo } from "../middleware/demo";
import { rateLimit } from "../middleware/rate-limit";
import { readViewerId, requireUser } from "../middleware/session";
import {
```

with:

```ts
} from "@/shared/schemas";
import type { AppEnv } from "../env";
import { idParamSchema, validate } from "../lib/validate";
import { capDemo, confineDemo } from "../middleware/demo";
import { rateLimit } from "../middleware/rate-limit";
import { readViewerId, requireUser } from "../middleware/session";
import {
```

In the same file, replace:

```ts
    confineDemo("post"),
    validate("json", createCommentSchema),
    rateLimit("comment", 30, 3600),
    async (c) => {
      const { body, parentId } = c.req.valid("json");
      const result = await createComment(c.var.db, {
```

with:

```ts
    confineDemo("post"),
    validate("json", createCommentSchema),
    rateLimit("comment", 30, 3600),
    capDemo("comment"),
    async (c) => {
      const { body, parentId } = c.req.valid("json");
      const result = await createComment(c.var.db, {
```

- [ ] **Step 5: Run the tests to watch them pass**

Run: `bunx vitest run worker/middleware/demo.test.ts`
Expected: PASS, `Tests  10 passed (10)`.

- [ ] **Step 6: Run the whole suite**

Run: `bun run typecheck && bun run check && bun run test`
Expected: typecheck and Biome clean; `Test Files  82 passed (82)`, `Tests  643 passed (643)`.

- [ ] **Step 7: Commit**

```bash
git add worker/middleware/demo.ts worker/middleware/demo.test.ts worker/routes/posts.ts worker/routes/comments.ts shared/envelope.ts src/i18n/messages/en.json src/i18n/messages/tr.json
git commit -m "fix: guests together can add at most 30 requests and 60 comments to the demo an hour (#28)"
```

---

### Task 7: Guests named in the demo's language (#30)

**Files:**
- Modify: `worker/demo/sign-in.ts`, `worker/demo/sign-in.test.ts`

**Interfaces:**
- Consumes: `localeFromCookie` from `@/shared/locale`, and `workspaceSettings.defaultLocale`.

- [ ] **Step 1: Write the failing test**

In `worker/demo/sign-in.test.ts`, replace:

```ts
    await t.settle();
  });

  it("refuses an unknown role", async () => {
    const t = testApp();
    const res = await t.post("/api/auth/demo/sign-in", { as: "owner" });
```

with:

```ts
    await t.settle();
  });

  it("names the guest in the demo's own language, not the browser's", async () => {
    const t = testApp();
    const guest = await t.signInDemo("member", {
      "accept-language": "tr-TR,tr;q=0.9",
    });
    expect(guest.name).toMatch(/^Guest \d{4}$/);
    await t.settle();
  });

  it("refuses an unknown role", async () => {
    const t = testApp();
    const res = await t.post("/api/auth/demo/sign-in", { as: "owner" });
```

- [ ] **Step 2: Run it to watch it fail**

Run: `bunx vitest run worker/demo/sign-in.test.ts`
Expected: FAIL, `Tests  1 failed | 7 passed (8)`: `expected 'Misafir NNNN' to match /^Guest \d{4}$/`.

- [ ] **Step 3: Name by the cookie, then the demo's language**

In `worker/demo/sign-in.ts`, replace:

```ts
  DEMO_ROLES,
  DEMO_WORKSPACE_SLUG,
} from "@/shared/demo";
import type { Database } from "../db/client";
import { member, organization, workspaceSettings } from "../db/schema";
import { localeFromHeaders } from "../lib/request-locale";

const GUEST = { en: "Guest", tr: "Misafir" } as const;

```

with:

```ts
  DEMO_ROLES,
  DEMO_WORKSPACE_SLUG,
} from "@/shared/demo";
import { localeFromCookie } from "@/shared/locale";
import type { Database } from "../db/client";
import { member, organization, workspaceSettings } from "../db/schema";

const GUEST = { en: "Guest", tr: "Misafir" } as const;

```

In the same file, replace:

```ts
 * Every visit gets its own guest account, so each visitor's votes are their
 * own and their limits aren't shared with everyone else trying the demo.
 * A team guest joins the demo workspace's team. Guests have demo addresses,
 * which receive no email, and the nightly reset deletes them all.
 *
 * Better Auth sets the session cookie, the same way its own sign-ins do, and
 * its per-address rate limit applies (see worker/auth.ts).
```

with:

```ts
 * Every visit gets its own guest account, so each visitor's votes are their
 * own and their limits aren't shared with everyone else trying the demo.
 * A team guest joins the demo workspace's team. Guests have demo addresses,
 * which receive no email, and the nightly reset deletes them all. A guest is
 * named in the language the visitor chose, else the demo's own, as the rest
 * of the demo speaks.
 *
 * Better Auth sets the session cookie, the same way its own sign-ins do, and
 * its per-address rate limit applies (see worker/auth.ts).
```

In the same file, replace:

```ts
        { method: "POST", body: z.object({ as: z.enum(DEMO_ROLES) }) },
        async (ctx) => {
          const [demo] = await db
            .select({ id: organization.id })
            .from(organization)
            .innerJoin(
              workspaceSettings,
```

with:

```ts
        { method: "POST", body: z.object({ as: z.enum(DEMO_ROLES) }) },
        async (ctx) => {
          const [demo] = await db
            .select({
              id: organization.id,
              locale: workspaceSettings.defaultLocale,
            })
            .from(organization)
            .innerJoin(
              workspaceSettings,
```

In the same file, replace:

```ts
              message: "The demo workspace isn't set up",
            });
          }
          const locale = localeFromHeaders(new Headers(ctx.headers));
          const number = 1000 + Math.floor(Math.random() * 9000);
          const user = await ctx.context.internalAdapter.createUser(
            {
```

with:

```ts
              message: "The demo workspace isn't set up",
            });
          }
          const locale =
            localeFromCookie(new Headers(ctx.headers).get("cookie")) ??
            demo.locale;
          const number = 1000 + Math.floor(Math.random() * 9000);
          const user = await ctx.context.internalAdapter.createUser(
            {
```

- [ ] **Step 4: Run it to watch it pass**

Run: `bunx vitest run worker/demo/sign-in.test.ts`
Expected: PASS, `Tests  8 passed (8)`.

- [ ] **Step 5: Run the whole suite**

Run: `bun run typecheck && bun run check && bun run test`
Expected: typecheck and Biome clean; `Test Files  82 passed (82)`, `Tests  644 passed (644)`.

- [ ] **Step 6: Commit**

```bash
git add worker/demo/sign-in.ts worker/demo/sign-in.test.ts
git commit -m "fix: a guest is named in the language the visitor chose, else the demo's own (#30)"
```

---

### Task 8: The demo in the browser: buttons, banner, guests elsewhere (#27, #32, #33)

**Files:**
- Create: `src/features/demo/guest-lock.tsx`, `e2e/guest.spec.ts`
- Modify:
  - `shared/posts.ts`, `worker/services/posts.ts`, `worker/middleware/demo.test.ts`
  - `src/routes/index.tsx`, `src/routes/$ws.tsx`, `src/routes/$ws/index.tsx`, `src/routes/p/$ref.tsx`
  - `src/features/votes/vote-button.tsx`, `src/features/subscriptions/subscribe-button.tsx`, `src/features/comments/comment-composer.tsx`, `src/features/comments/comment-item.tsx`
  - `src/features/demo/demo.test.tsx`, `src/i18n/messages/en.json`, `src/i18n/messages/tr.json`, `e2e/global-setup.ts`
  - eight test fixtures that build a `PostDetail`

**Interfaces:**
- Produces:
  - `PostDetail.workspace.isDemo: boolean`.
  - `GuestLockProvider({ isDemo, children })`, which shows the note and locks what's inside it, and `useGuestLocked(): boolean`, both in `src/features/demo/guest-lock.tsx`.

- [ ] **Step 1: Write the failing API test**

In `worker/middleware/demo.test.ts`, replace:

```ts
});

describe("the demo workspace", () => {
  it("keeps its name, language and boards, even for its team", async () => {
    const t = testApp();
    const guest = await t.signInDemo("team");
```

with:

```ts
});

describe("the demo workspace", () => {
  it("marks its requests' pages as the demo's, and no one else's", async () => {
    const t = testApp();
    const { owner, slug, boards } = await setupWorkspace(t);
    const real = await submitPost(t, owner.cookie, slug, {
      boardId: boards[0]!.id,
      title: "Not a demo request",
    });
    const workspaceOf = async (id: number) => {
      const res = await t.client.api.posts[":id"].$get({
        param: { id: String(id) },
      });
      const body = await res.json();
      if (!body.success) throw new Error(body.error);
      return body.data.workspace;
    };
    expect(await workspaceOf((await demoPost()).id)).toMatchObject({
      slug: "demo",
      isDemo: true,
    });
    expect(await workspaceOf(real.id)).toMatchObject({ slug, isDemo: false });
    await t.settle();
  });

  it("keeps its name, language and boards, even for its team", async () => {
    const t = testApp();
    const guest = await t.signInDemo("team");
```

- [ ] **Step 2: Run it to watch it fail**

Run: `bunx vitest run worker/middleware/demo.test.ts`
Expected: FAIL, `Tests  1 failed | 10 passed (11)`: the request's workspace has no `isDemo`.

- [ ] **Step 3: Say on a request's page whether it's the demo's**

In `shared/posts.ts`, replace:

```ts

export type PostDetail = PostSummary & {
  body: string;
  workspace: { slug: string; name: string; defaultLocale: Locale };
  /** The person asking wrote it or is on the workspace's team. */
  canEdit: boolean;
  /** The person asking is on the workspace's team: they pin, and delete any comment. */
```

with:

```ts

export type PostDetail = PostSummary & {
  body: string;
  /** `isDemo`: its page shows the demo's banner, and guest rules apply. */
  workspace: {
    slug: string;
    name: string;
    defaultLocale: Locale;
    isDemo: boolean;
  };
  /** The person asking wrote it or is on the workspace's team. */
  canEdit: boolean;
  /** The person asking is on the workspace's team: they pin, and delete any comment. */
```

In `worker/services/posts.ts`, replace:

```ts
      workspaceSlug: organization.slug,
      workspaceName: organization.name,
      defaultLocale: workspaceSettings.defaultLocale,
      onTeam: viewerId ? onTeam(viewerId) : sql<boolean>`false`,
      moderates: viewerId ? moderates(viewerId) : sql<boolean>`false`,
      pinnedCommentId: posts.pinnedCommentId,
```

with:

```ts
      workspaceSlug: organization.slug,
      workspaceName: organization.name,
      defaultLocale: workspaceSettings.defaultLocale,
      isDemo: workspaceSettings.isDemo,
      onTeam: viewerId ? onTeam(viewerId) : sql<boolean>`false`,
      moderates: viewerId ? moderates(viewerId) : sql<boolean>`false`,
      pinnedCommentId: posts.pinnedCommentId,
```

In the same file, replace:

```ts
      slug: row.workspaceSlug,
      name: row.workspaceName,
      defaultLocale: row.defaultLocale ?? "en",
    },
    canEdit: viewerId !== null && (row.authorId === viewerId || row.moderates),
    isTeam: row.onTeam,
```

with:

```ts
      slug: row.workspaceSlug,
      name: row.workspaceName,
      defaultLocale: row.defaultLocale ?? "en",
      isDemo: row.isDemo ?? false,
    },
    canEdit: viewerId !== null && (row.authorId === viewerId || row.moderates),
    isTeam: row.onTeam,
```

The eight client test fixtures that build a `PostDetail` need the field too:

```bash
perl -pi -e 's/workspace: \{ slug: "acme", name: "Acme", defaultLocale: "en" \}/workspace: { slug: "acme", name: "Acme", defaultLocale: "en", isDemo: false }/' src/features/comments/comment-cache.test.ts src/features/comments/comment-thread.test.tsx src/features/merge/merge-flow.test.tsx src/features/merge/merge-panel.test.tsx src/features/status/status-cache.test.ts src/features/status/status-control.test.tsx src/features/subscriptions/subscribe-button.test.tsx src/features/votes/vote-button.test.tsx
```

- [ ] **Step 4: Run it to watch it pass**

Run: `bunx vitest run worker/middleware/demo.test.ts && bun run typecheck`
Expected: PASS, `Tests  11 passed (11)`; typecheck clean.

- [ ] **Step 5: Write the failing component tests**

In `src/features/demo/demo.test.tsx`, replace:

```tsx
  boards: [{ id: "b1", slug: "features", name: "Features", position: 0 }],
};

/**
 * The API behind the landing page and the demo workspace. Signing in to the
 * demo makes later /api/me answers the guest's.
 */
function fakeServer({
  signedIn = false,
  as = guest,
  demoStatus = 200,
}: {
  signedIn?: boolean;
  as?: typeof guest;
  demoStatus?: number;
} = {}) {
  const demoSignIns: unknown[] = [];
  let user: typeof guest | null = signedIn ? as : null;
```

with:

```tsx
  boards: [{ id: "b1", slug: "features", name: "Features", position: 0 }],
};

const acmeWorkspace = {
  id: "org_acme",
  slug: "acme",
  name: "Acme",
  defaultLocale: "en",
  isDemo: false,
  boards: [{ id: "b2", slug: "ideas", name: "Ideas", position: 0 }],
};
const acmePost = {
  id: 7,
  ref: "7-dark-mode",
  title: "Dark mode",
  excerpt: "",
  status: "open",
  voteCount: 3,
  commentCount: 0,
  voted: false,
  board: { slug: "ideas", name: "Ideas" },
  author: { name: "Ayşe" },
  createdAt: "2026-11-01T10:00:00.000Z",
};
const demoRequest = {
  ...acmePost,
  id: 900001,
  ref: "900001-dark-mode",
  board: { slug: "features", name: "Features" },
};
/** A request's page, in `workspace`. */
const detail = (post: typeof acmePost, workspace: typeof acmeWorkspace) => ({
  ...post,
  body: "",
  workspace: {
    slug: workspace.slug,
    name: workspace.name,
    defaultLocale: "en",
    isDemo: workspace.isDemo,
  },
  canEdit: false,
  isTeam: false,
  pinned: null,
  subscribed: false,
  timeline: [],
  mergedInto: null,
});

/**
 * The API behind the landing page, the demo workspace and Acme, a real one.
 * Signing in to the demo makes later /api/me answers the guest's.
 */
function fakeServer({
  signedIn = false,
  as = guest,
  demoStatus = 200,
  meStatus = 200,
}: {
  signedIn?: boolean;
  as?: typeof guest;
  demoStatus?: number;
  meStatus?: number;
} = {}) {
  const demoSignIns: unknown[] = [];
  let user: typeof guest | null = signedIn ? as : null;
```

In the same file, replace:

```tsx
        return Response.json({ name: guest.name, team: true });
      }
      if (url.pathname === "/api/me") {
        const workspace =
          user === guest
            ? { id: "org_pano_demo", slug: "demo", name: "Inkwell" }
```

with:

```tsx
        return Response.json({ name: guest.name, team: true });
      }
      if (url.pathname === "/api/me") {
        if (meStatus !== 200) {
          return Response.json(
            { success: false, code: "INTERNAL_ERROR", error: "down" },
            { status: meStatus }
          );
        }
        const workspace =
          user === guest
            ? { id: "org_pano_demo", slug: "demo", name: "Inkwell" }
```

In the same file, replace:

```tsx
      }
      if (url.pathname === "/api/workspaces/demo/posts") {
        return ok({ items: [], page: 1, hasMore: false });
      }
      return Response.json(
        { success: false, code: "NOT_FOUND", error: "Not found" },
```

with:

```tsx
      }
      if (url.pathname === "/api/workspaces/demo/posts") {
        return ok({ items: [], page: 1, hasMore: false });
      }
      if (url.pathname === "/api/workspaces/acme") return ok(acmeWorkspace);
      if (url.pathname === "/api/workspaces/acme/posts") {
        return ok({ items: [acmePost], page: 1, hasMore: false });
      }
      if (url.pathname === "/api/posts/7") {
        return ok(detail(acmePost, acmeWorkspace));
      }
      if (url.pathname === "/api/posts/900001") {
        return ok(detail(demoRequest, demoWorkspace));
      }
      if (/^\/api\/posts\/\d+\/comments$/.test(url.pathname)) {
        return ok({ items: [], hasMore: false });
      }
      return Response.json(
        { success: false, code: "NOT_FOUND", error: "Not found" },
```

In the same file, replace:

```tsx
    expect(screen.queryByRole("button", { name: "Try as team" })).toBeNull();
  });

  it("keeps the demo buttons from someone signed in with a real account", async () => {
    fakeServer({
      signedIn: true,
```

with:

```tsx
    expect(screen.queryByRole("button", { name: "Try as team" })).toBeNull();
  });

  it("keeps the demo buttons hidden when Pano can't tell who's signed in", async () => {
    fakeServer({ meStatus: 500 });
    renderAt("/");
    expect(
      await screen.findByRole("link", {
        name: "Sign in to start your own board",
      })
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try as team" })).toBeNull();
  });

  it("shows the demo's banner on a demo request's own page", async () => {
    fakeServer();
    renderAt("/p/900001-dark-mode");
    const banner = await screen.findByRole("complementary", {
      name: "About this demo",
    });
    expect(banner.textContent).toContain("resets at 01:00 UTC");
  });

  it("keeps the demo buttons from someone signed in with a real account", async () => {
    fakeServer({
      signedIn: true,
```

In the same file, replace:

```tsx
  });
});

```

with:

```tsx
  });
});

describe("a demo guest outside the demo", () => {
  const note = "Guest accounts only work in the demo.";
  const disabled = (element: HTMLElement) => element.matches(":disabled");

  it("finds a real board's controls disabled, and why", async () => {
    fakeServer({ signedIn: true });
    renderAt("/acme");
    expect(await screen.findByText(note)).toBeTruthy();
    expect(
      disabled(
        await screen.findByRole("button", { name: "Vote for Dark mode" })
      )
    ).toBe(true);
    expect(disabled(screen.getByRole("button", { name: "New request" }))).toBe(
      true
    );
  });

  it("can't vote on, follow or comment on a real request", async () => {
    fakeServer({ signedIn: true });
    renderAt("/p/7-dark-mode");
    expect(await screen.findByText(note)).toBeTruthy();
    expect(
      disabled(screen.getByRole("button", { name: "Vote for Dark mode" }))
    ).toBe(true);
    expect(disabled(screen.getByRole("button", { name: "Subscribe" }))).toBe(
      true
    );
    expect(disabled(await screen.findByLabelText("Add a comment"))).toBe(true);
  });

  it("keeps everything in the demo itself", async () => {
    fakeServer({ signedIn: true });
    renderAt("/p/900001-dark-mode");
    expect(
      disabled(await screen.findByRole("button", { name: "Subscribe" }))
    ).toBe(false);
    expect(disabled(await screen.findByLabelText("Add a comment"))).toBe(false);
    expect(screen.queryByText(note)).toBeNull();
  });
});

```

- [ ] **Step 6: Run them to watch four fail**

Run: `bunx vitest run src/features/demo/demo.test.tsx`
Expected: FAIL, `Tests  4 failed | 6 passed (10)`:
- the demo buttons still show when `/api/me` fails
- a demo request's page has no banner
- the board's and the request's controls aren't disabled

"keeps everything in the demo itself" already passes.

- [ ] **Step 7: Show the demo buttons only to visitors it knows**

In `src/routes/index.tsx`, replace:

```tsx
  const t = useTranslations("home");
  const me = useQuery(meQueryOptions);
  const user = me.data?.user;
  // Trying the demo signs in as a guest, which would sign a real account out.
  const showDemo = !me.isPending && (!user || isDemoEmail(user.email));

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-20 px-6 py-14 md:py-20">
```

with:

```tsx
  const t = useTranslations("home");
  const me = useQuery(meQueryOptions);
  const user = me.data?.user;
  // Trying the demo signs in as a guest, which would sign a real account out:
  // only an answer that says signed out, or a guest, shows the buttons.
  const showDemo = me.isSuccess && (!user || isDemoEmail(user.email));

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-20 px-6 py-14 md:py-20">
```

- [ ] **Step 8: The guest lock, and its note**

Create `src/features/demo/guest-lock.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, use } from "react";
import { useTranslations } from "use-intl";
import { meQueryOptions } from "@/lib/session";
import { isDemoEmail } from "@/shared/demo";

/**
 * True while a demo guest is on a real workspace's pages. The server refuses
 * everything they would write there (DEMO_ONLY), so the controls that write
 * are disabled instead of failing on every click.
 */
const GuestLock = createContext(false);

/** Whether this page's writing controls are locked for a demo guest. */
export const useGuestLocked = () => use(GuestLock);

/**
 * Locks the writing controls inside it when the signed-in account is a demo
 * guest and the workspace isn't the demo, and says why above them.
 */
export function GuestLockProvider({
  isDemo,
  children,
}: {
  isDemo: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("demo");
  const me = useQuery(meQueryOptions);
  const user = me.data?.user;
  const locked = Boolean(user && isDemoEmail(user.email) && !isDemo);
  return (
    <GuestLock value={locked}>
      {locked && (
        <p role="note" className="paper p-4 text-sm">
          {t("guestOnly")}
        </p>
      )}
      {children}
    </GuestLock>
  );
}
```

In `src/i18n/messages/en.json`, replace:

```json
    "tooMany": "Too many demo sign-ins from here. Wait a minute and try again.",
    "bannerLabel": "About this demo",
    "banner": "Inkwell is a demo workspace. Every visitor gets their own guest account, and everything resets at 01:00 UTC each night.",
    "settingsReadOnly": "You're on the demo's team, so you can see its settings, but they stay as they are. Try statuses, merging and the roadmap instead."
  },
  "signin": {
    "title": "Sign in to Pano",
```

with:

```json
    "tooMany": "Too many demo sign-ins from here. Wait a minute and try again.",
    "bannerLabel": "About this demo",
    "banner": "Inkwell is a demo workspace. Every visitor gets their own guest account, and everything resets at 01:00 UTC each night.",
    "settingsReadOnly": "You're on the demo's team, so you can see its settings, but they stay as they are. Try statuses, merging and the roadmap instead.",
    "guestOnly": "Guest accounts only work in the demo."
  },
  "signin": {
    "title": "Sign in to Pano",
```

In `src/i18n/messages/tr.json`, replace:

```json
    "tooMany": "Buradan çok fazla demo girişi yapıldı. Bir dakika bekleyip tekrar deneyin.",
    "bannerLabel": "Bu demo hakkında",
    "banner": "Inkwell bir demo çalışma alanıdır. Her ziyaretçiye ayrı bir misafir hesabı verilir ve her şey her gece 01:00'de (UTC) sıfırlanır.",
    "settingsReadOnly": "Demonun ekibindesiniz; ayarları görebilirsiniz ama değiştiremezsiniz. Bunun yerine durumları, birleştirmeyi ve yol haritasını deneyin."
  },
  "signin": {
    "title": "Pano'ya giriş yapın",
```

with:

```json
    "tooMany": "Buradan çok fazla demo girişi yapıldı. Bir dakika bekleyip tekrar deneyin.",
    "bannerLabel": "Bu demo hakkında",
    "banner": "Inkwell bir demo çalışma alanıdır. Her ziyaretçiye ayrı bir misafir hesabı verilir ve her şey her gece 01:00'de (UTC) sıfırlanır.",
    "settingsReadOnly": "Demonun ekibindesiniz; ayarları görebilirsiniz ama değiştiremezsiniz. Bunun yerine durumları, birleştirmeyi ve yol haritasını deneyin.",
    "guestOnly": "Misafir hesaplar yalnızca demoda çalışır."
  },
  "signin": {
    "title": "Pano'ya giriş yapın",
```

- [ ] **Step 9: Lock the controls that write**

In `src/features/votes/vote-button.tsx`, replace:

```tsx
import { ChevronUp } from "lucide-react";
import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { useVote } from "./use-vote";

// A tally: the count in tabular figures, so it never shifts as it changes.
```

with:

```tsx
import { ChevronUp } from "lucide-react";
import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { useGuestLocked } from "@/features/demo/guest-lock";
import { useVote } from "./use-vote";

// A tally: the count in tabular figures, so it never shifts as it changes.
```

In the same file, replace:

```tsx
export function VoteButton({ postId, title, voted, voteCount }: Props) {
  const t = useTranslations("vote");
  const vote = useVote(postId);
  return (
    <Button
      type="button"
      variant={voted ? "default" : "outline"}
      className={SHAPE}
      aria-pressed={voted}
```

with:

```tsx
export function VoteButton({ postId, title, voted, voteCount }: Props) {
  const t = useTranslations("vote");
  const vote = useVote(postId);
  const locked = useGuestLocked();
  return (
    <Button
      type="button"
      disabled={locked}
      variant={voted ? "default" : "outline"}
      className={SHAPE}
      aria-pressed={voted}
```

In `src/features/subscriptions/subscribe-button.tsx`, replace:

```tsx
import { Bell, BellOff } from "lucide-react";
import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import type { PostDetail } from "@/shared/posts";
import { useSubscription } from "./use-subscription";

```

with:

```tsx
import { Bell, BellOff } from "lucide-react";
import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { useGuestLocked } from "@/features/demo/guest-lock";
import type { PostDetail } from "@/shared/posts";
import { useSubscription } from "./use-subscription";

```

In the same file, replace:

```tsx
export function SubscribeButton({ post }: { post: PostDetail }) {
  const t = useTranslations("subscription");
  const subscription = useSubscription(post.id);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => subscription.mutate(!post.subscribed)}
```

with:

```tsx
export function SubscribeButton({ post }: { post: PostDetail }) {
  const t = useTranslations("subscription");
  const subscription = useSubscription(post.id);
  const locked = useGuestLocked();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        disabled={locked}
        variant="outline"
        size="sm"
        onClick={() => subscription.mutate(!post.subscribed)}
```

In `src/features/comments/comment-composer.tsx`, replace:

```tsx
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorKey } from "@/lib/error-text";
import { meQueryOptions, updateMe } from "@/lib/session";
import type { CommentView } from "@/shared/comments";
```

with:

```tsx
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useGuestLocked } from "@/features/demo/guest-lock";
import { apiErrorKey } from "@/lib/error-text";
import { meQueryOptions, updateMe } from "@/lib/session";
import type { CommentView } from "@/shared/comments";
```

In the same file, replace:

```tsx
  const tErrors = useTranslations("errors");
  const qc = useQueryClient();
  const { post, viewerName } = useThread();
  const add = useAddComment(post.id);
  const id = useId();
  const [error, setError] = useState<string | null>(null);
```

with:

```tsx
  const tErrors = useTranslations("errors");
  const qc = useQueryClient();
  const { post, viewerName } = useThread();
  const locked = useGuestLocked();
  const add = useAddComment(post.id);
  const id = useId();
  const [error, setError] = useState<string | null>(null);
```

In the same file, replace:

```tsx

  return (
    <form
      className="flex flex-col gap-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      {needsName && (
        <form.Field name="name">
          {(field) => (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-name`}>{t("nameLabel")}</Label>
              <Input
                id={`${id}-name`}
                name={field.name}
                autoComplete="name"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">{t("nameHint")}</p>
              <FieldError errors={field.state.meta.errors} />
            </div>
          )}
        </form.Field>
      )}
      <form.Field name="body">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-body`}>
              {parent ? t("replyLabel") : t("addLabel")}
            </Label>
            <Textarea
              id={`${id}-body`}
              name={field.name}
              rows={parent ? 3 : 4}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
            <p className="text-muted-foreground text-xs">{t("bodyHint")}</p>
            <FieldError errors={field.state.meta.errors} />
          </div>
        )}
      </form.Field>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {parent ? t("submitReply") : t("submit")}
            </Button>
          )}
        </form.Subscribe>
        {onClose && (
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {t("cancel")}
          </Button>
        )}
      </div>
    </form>
  );
}
```

with:

```tsx

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      {/* A disabled fieldset disables every field and button inside it. */}
      <fieldset disabled={locked} className="flex flex-col gap-2">
        {needsName && (
          <form.Field name="name">
            {(field) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${id}-name`}>{t("nameLabel")}</Label>
                <Input
                  id={`${id}-name`}
                  name={field.name}
                  autoComplete="name"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                <p className="text-muted-foreground text-xs">{t("nameHint")}</p>
                <FieldError errors={field.state.meta.errors} />
              </div>
            )}
          </form.Field>
        )}
        <form.Field name="body">
          {(field) => (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-body`}>
                {parent ? t("replyLabel") : t("addLabel")}
              </Label>
              <Textarea
                id={`${id}-body`}
                name={field.name}
                rows={parent ? 3 : 4}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">{t("bodyHint")}</p>
              <FieldError errors={field.state.meta.errors} />
            </div>
          )}
        </form.Field>
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {parent ? t("submitReply") : t("submit")}
              </Button>
            )}
          </form.Subscribe>
          {onClose && (
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              {t("cancel")}
            </Button>
          )}
        </div>
      </fieldset>
    </form>
  );
}
```

In `src/features/comments/comment-item.tsx`, replace:

```tsx
import { useFormatter, useNow, useTranslations } from "use-intl";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { AuthorName } from "@/features/posts/author-name";
import { repliesQueryOptions } from "@/lib/comments";
import { cn } from "@/lib/utils";
```

with:

```tsx
import { useFormatter, useNow, useTranslations } from "use-intl";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { useGuestLocked } from "@/features/demo/guest-lock";
import { AuthorName } from "@/features/posts/author-name";
import { repliesQueryOptions } from "@/lib/comments";
import { cn } from "@/lib/utils";
```

In the same file, replace:

```tsx
  const [confirming, setConfirming] = useState(false);
  const pinned = post.pinned?.id === comment.id;
  const replying = replyingTo === comment.id;
  return (
    <div className="flex flex-wrap gap-1">
      {viewerName !== null && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          aria-expanded={replying}
```

with:

```tsx
  const [confirming, setConfirming] = useState(false);
  const pinned = post.pinned?.id === comment.id;
  const replying = replyingTo === comment.id;
  const locked = useGuestLocked();
  return (
    <div className="flex flex-wrap gap-1">
      {viewerName !== null && (
        <Button
          type="button"
          disabled={locked}
          variant="ghost"
          size="xs"
          aria-expanded={replying}
```

In `src/routes/$ws/index.tsx`, replace:

```tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useNow, useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { FeedToolbar } from "@/features/feed/feed-toolbar";
import {
  type FeedSearch,
```

with:

```tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useNow, useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { useGuestLocked } from "@/features/demo/guest-lock";
import { FeedToolbar } from "@/features/feed/feed-toolbar";
import {
  type FeedSearch,
```

In the same file, replace:

```tsx
  const t = useTranslations("feed");
  const tWorkspace = useTranslations("workspace");
  const now = useNow({ updateInterval: 60_000 });
  const params = feedParams(search);
  // The URL follows every keystroke; the request waits for a pause in typing.
  const q = useDebouncedValue(params.q, 300);
```

with:

```tsx
  const t = useTranslations("feed");
  const tWorkspace = useTranslations("workspace");
  const now = useNow({ updateInterval: 60_000 });
  const locked = useGuestLocked();
  const params = feedParams(search);
  // The URL follows every keystroke; the request waits for a pause in typing.
  const q = useDebouncedValue(params.q, 300);
```

In the same file, replace:

```tsx
          rawQuery={search.q ?? ""}
          onChange={update}
        />
        <Button asChild size="sm">
          <Link to="/$ws/new" params={{ ws }} search={{ board: params.board }}>
            {t("newRequest")}
          </Link>
        </Button>
      </div>
      {feed.isPending ? (
        <p className="text-muted-foreground text-sm">{t("loading")}</p>
```

with:

```tsx
          rawQuery={search.q ?? ""}
          onChange={update}
        />
        {locked ? (
          <Button size="sm" disabled>
            {t("newRequest")}
          </Button>
        ) : (
          <Button asChild size="sm">
            <Link
              to="/$ws/new"
              params={{ ws }}
              search={{ board: params.board }}
            >
              {t("newRequest")}
            </Link>
          </Button>
        )}
      </div>
      {feed.isPending ? (
        <p className="text-muted-foreground text-sm">{t("loading")}</p>
```

- [ ] **Step 10: Provide the lock on workspace pages and request pages, with the banner on demo requests**

In `src/routes/$ws.tsx`, replace:

```tsx
import { useEffect } from "react";
import { useTranslations } from "use-intl";
import { DemoBanner } from "@/features/demo/demo-banner";
import { useLocaleControls } from "@/i18n/provider";
import { ApiError } from "@/lib/api";
import { meQueryOptions } from "@/lib/session";
```

with:

```tsx
import { useEffect } from "react";
import { useTranslations } from "use-intl";
import { DemoBanner } from "@/features/demo/demo-banner";
import { GuestLockProvider } from "@/features/demo/guest-lock";
import { useLocaleControls } from "@/i18n/provider";
import { ApiError } from "@/lib/api";
import { meQueryOptions } from "@/lib/session";
```

In the same file, replace:

```tsx
      )}
    >
      {workspace.isDemo && <DemoBanner />}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-bold text-3xl">{workspace.name}</h1>
        <nav className="flex gap-4 text-sm">
          <Link
            to="/$ws"
            params={{ ws }}
            activeOptions={{ exact: true, includeSearch: false }}
            activeProps={{ className: "font-semibold" }}
          >
            {t("requests")}
          </Link>
          <Link
            to="/$ws/roadmap"
            params={{ ws }}
            activeProps={{ className: "font-semibold" }}
          >
            {t("roadmap")}
          </Link>
          <Link
            to="/$ws/changelog"
            params={{ ws }}
            activeProps={{ className: "font-semibold" }}
          >
            {t("changelog")}
          </Link>
          {onTeam && (
            <Link
              to="/$ws/settings"
              params={{ ws }}
              activeProps={{ className: "font-semibold" }}
            >
              {t("settings")}
            </Link>
          )}
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
```

with:

```tsx
      )}
    >
      {workspace.isDemo && <DemoBanner />}
      <GuestLockProvider isDemo={workspace.isDemo}>
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-bold text-3xl">{workspace.name}</h1>
          <nav className="flex gap-4 text-sm">
            <Link
              to="/$ws"
              params={{ ws }}
              activeOptions={{ exact: true, includeSearch: false }}
              activeProps={{ className: "font-semibold" }}
            >
              {t("requests")}
            </Link>
            <Link
              to="/$ws/roadmap"
              params={{ ws }}
              activeProps={{ className: "font-semibold" }}
            >
              {t("roadmap")}
            </Link>
            <Link
              to="/$ws/changelog"
              params={{ ws }}
              activeProps={{ className: "font-semibold" }}
            >
              {t("changelog")}
            </Link>
            {onTeam && (
              <Link
                to="/$ws/settings"
                params={{ ws }}
                activeProps={{ className: "font-semibold" }}
              >
                {t("settings")}
              </Link>
            )}
          </nav>
        </header>
        <Outlet />
      </GuestLockProvider>
    </div>
  );
}
```

In `src/routes/p/$ref.tsx`, replace:

```tsx
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { CommentThread } from "@/features/comments/comment-thread";
import { MergePanel } from "@/features/merge/merge-panel";
import { AuthorName } from "@/features/posts/author-name";
import { PostEditor } from "@/features/posts/post-editor";
```

with:

```tsx
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { CommentThread } from "@/features/comments/comment-thread";
import { DemoBanner } from "@/features/demo/demo-banner";
import { GuestLockProvider } from "@/features/demo/guest-lock";
import { MergePanel } from "@/features/merge/merge-panel";
import { AuthorName } from "@/features/posts/author-name";
import { PostEditor } from "@/features/posts/post-editor";
```

In the same file, replace:

```tsx

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <Link
        to="/$ws"
        params={{ ws: post.workspace.slug }}
        className="text-muted-foreground text-sm hover:underline"
      >
        ← {post.workspace.name}
      </Link>
      <article className="paper flex items-start gap-4 p-5 sm:p-6">
        {signedIn ? (
          <VoteButton
            postId={post.id}
            title={post.title}
            voted={post.voted}
            voteCount={post.voteCount}
          />
        ) : (
          <SignInToVote voteCount={post.voteCount} />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {editing ? (
            <PostEditor post={post} onDone={() => setEditing(false)} />
          ) : (
            <>
              <h1 className="font-bold text-3xl leading-tight">{post.title}</h1>
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
                <StatusBadge status={post.status} />
                <span>{post.board.name}</span>
                <span aria-hidden="true">·</span>
                <AuthorName author={post.author} />
                <span aria-hidden="true">·</span>
                <time dateTime={post.createdAt}>
                  {format.relativeTime(new Date(post.createdAt), now)}
                </time>
              </div>
              {post.body && <Markdown>{post.body}</Markdown>}
              {post.canEdit && (
                <PostActions post={post} onEdit={() => setEditing(true)} />
              )}
            </>
          )}
        </div>
      </article>
      {(signedIn || post.isTeam) && (
        <div className="paper flex flex-col gap-4 p-5 sm:p-6">
          {signedIn && <SubscribeButton post={post} />}
          {post.isTeam && <StatusControl post={post} />}
          {post.isTeam && (
            <MergePanel
              post={post}
              onMerged={(target) =>
                navigate({ to: "/p/$ref", params: { ref: target.ref } })
              }
            />
          )}
        </div>
      )}
      <StatusTimeline timeline={post.timeline} />
      <CommentThread post={post} />
    </main>
  );
}
```

with:

```tsx

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      {post.workspace.isDemo && <DemoBanner />}
      <GuestLockProvider isDemo={post.workspace.isDemo}>
        <Link
          to="/$ws"
          params={{ ws: post.workspace.slug }}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← {post.workspace.name}
        </Link>
        <article className="paper flex items-start gap-4 p-5 sm:p-6">
          {signedIn ? (
            <VoteButton
              postId={post.id}
              title={post.title}
              voted={post.voted}
              voteCount={post.voteCount}
            />
          ) : (
            <SignInToVote voteCount={post.voteCount} />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {editing ? (
              <PostEditor post={post} onDone={() => setEditing(false)} />
            ) : (
              <>
                <h1 className="font-bold text-3xl leading-tight">
                  {post.title}
                </h1>
                <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
                  <StatusBadge status={post.status} />
                  <span>{post.board.name}</span>
                  <span aria-hidden="true">·</span>
                  <AuthorName author={post.author} />
                  <span aria-hidden="true">·</span>
                  <time dateTime={post.createdAt}>
                    {format.relativeTime(new Date(post.createdAt), now)}
                  </time>
                </div>
                {post.body && <Markdown>{post.body}</Markdown>}
                {post.canEdit && (
                  <PostActions post={post} onEdit={() => setEditing(true)} />
                )}
              </>
            )}
          </div>
        </article>
        {(signedIn || post.isTeam) && (
          <div className="paper flex flex-col gap-4 p-5 sm:p-6">
            {signedIn && <SubscribeButton post={post} />}
            {post.isTeam && <StatusControl post={post} />}
            {post.isTeam && (
              <MergePanel
                post={post}
                onMerged={(target) =>
                  navigate({ to: "/p/$ref", params: { ref: target.ref } })
                }
              />
            )}
          </div>
        )}
        <StatusTimeline timeline={post.timeline} />
        <CommentThread post={post} />
      </GuestLockProvider>
    </main>
  );
}
```

- [ ] **Step 11: Run the component tests to watch them pass**

Run: `bunx vitest run src/features/demo/demo.test.tsx`
Expected: PASS, `Tests  10 passed (10)`.

- [ ] **Step 12: The browser test, with a `/pano` board to visit**

Replace the whole of `e2e/global-setup.ts` with:

```ts
import { execFileSync } from "node:child_process";

/**
 * A local run starts from the schema production has, a freshly reset demo
 * the way the nightly cron leaves it, and Pano's own board at /pano, as on
 * the live site. Both commands read DATABASE_URL.
 */
export default function globalSetup() {
  execFileSync("bun", ["run", "db:migrate"], { stdio: "inherit" });
  execFileSync("bun", ["run", "seed"], {
    stdio: "inherit",
    env: {
      ...process.env,
      PANO_OWNER_EMAIL: process.env.PANO_OWNER_EMAIL ?? "owner@pano.test",
    },
  });
}
```

Create `e2e/guest.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { tryDemo } from "./helpers";

test("a demo guest finds Pano's own board closed to them, and why", async ({
  page,
}) => {
  await tryDemo(page, "member");
  await page.goto("/pano");
  await expect(
    page.getByText("Guest accounts only work in the demo.")
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New request" })
  ).toBeDisabled();
});
```

Run: `bun run e2e`
Expected: the seed prints `✓ pano: owned by owner@pano.test`; `6 passed`, including "a demo guest finds Pano's own board closed to them, and why".

- [ ] **Step 13: Run the whole suite**

Run: `bun run typecheck && bun run check && bun run test`
Expected: typecheck and Biome clean; `Test Files  82 passed (82)`, `Tests  650 passed (650)`.

- [ ] **Step 14: Commit**

```bash
git add shared/posts.ts worker/services/posts.ts worker/middleware/demo.test.ts src e2e
git commit -m "fix: the landing page shows the demo buttons only to visitors it knows are signed out or guests; demo request pages show the demo banner; guests on real boards find writing controls disabled, and why (#27, #32, #33)"
```

---

### Task 9: Retries that wait longer, and unfollowing takes back queued email (#25, #26)

**Files:**
- Modify: `worker/services/outbox.ts`, `worker/cron.ts`, `worker/services/subscriptions.ts`, `worker/services/outbox.test.ts`, `worker/cron.test.ts`, `worker/routes/subscriptions.test.ts`

**Interfaces:**
- Consumes: `emailOutbox.nextAttemptAt` (Task 4).
- Produces:
  - `RETRY_MINUTES = [5, 30, 120, 480]`.
  - `sendQueuedEmails` returns `nextRetryAt?: Date`.
  - `OUTBOX_RETRY = "outbox:retry"`, and `markOutboxRetry(flags, at: Date)`.
  - `takeBackEmailsTo(tx, { postId, userId })`.

- [ ] **Step 1: Write the failing tests**

The retry test replaces "tries a failed email again on later runs". The cron's "keeps the flag up while emails failed" becomes a test of the retry note.

In `worker/services/outbox.test.ts`, replace:

```ts
      attempts: emailOutbox.attempts,
      lastError: emailOutbox.lastError,
      claimedAt: emailOutbox.claimedAt,
    })
    .from(emailOutbox)
    .where(eq(emailOutbox.postId, postId))
```

with:

```ts
      attempts: emailOutbox.attempts,
      lastError: emailOutbox.lastError,
      claimedAt: emailOutbox.claimedAt,
      nextAttemptAt: emailOutbox.nextAttemptAt,
    })
    .from(emailOutbox)
    .where(eq(emailOutbox.postId, postId))
```

In the same file, replace:

```ts
    expect(mail.shipped).toHaveLength(2);
  });

  it("tries a failed email again on later runs, five times at most", async () => {
    const { postId } = await queued(1);
    const options = { origin: ORIGIN, postIds: [postId] };
    for (let run = 1; run <= 5; run++) {
      expect(await sendQueuedEmails(db, failing, options)).toEqual({
        sent: 0,
        failed: 1,
      });
    }
    expect(await rowsOf(postId)).toMatchObject([
      {
        sentAt: null,
```

with:

```ts
    expect(mail.shipped).toHaveLength(2);
  });

  it("waits longer after each failed try, and tries five times at most", async () => {
    const { postId } = await queued(1);
    const options = { origin: ORIGIN, postIds: [postId] };
    for (const minutes of [5, 30, 120, 480]) {
      expect(await sendQueuedEmails(db, failing, options)).toMatchObject({
        sent: 0,
        failed: 1,
      });
      const [row] = await rowsOf(postId);
      const wait = row!.nextAttemptAt.getTime() - Date.now();
      expect(wait).toBeGreaterThan((minutes - 1) * 60_000);
      expect(wait).toBeLessThanOrEqual(minutes * 60_000);
      // Not due yet: a run leaves it be, and says when it will be.
      expect(await sendQueuedEmails(db, failing, options)).toEqual({
        sent: 0,
        failed: 0,
        nextRetryAt: row!.nextAttemptAt,
      });
      await db
        .update(emailOutbox)
        .set({ nextAttemptAt: sql`now()` })
        .where(eq(emailOutbox.postId, postId));
    }
    expect(await sendQueuedEmails(db, failing, options)).toEqual({
      sent: 0,
      failed: 1,
    });
    expect(await rowsOf(postId)).toMatchObject([
      {
        sentAt: null,
```

In `worker/cron.test.ts`, replace:

```ts
  OUTBOX_BATCH,
  OUTBOX_PAUSED,
  OUTBOX_PENDING,
  pauseOutboxUntilTomorrow,
  type sendQueuedEmails,
} from "./services/outbox";
```

with:

```ts
  OUTBOX_BATCH,
  OUTBOX_PAUSED,
  OUTBOX_PENDING,
  OUTBOX_RETRY,
  pauseOutboxUntilTomorrow,
  type sendQueuedEmails,
} from "./services/outbox";
```

In the same file, replace:

```ts
    });
  });

  it("keeps the flag up while emails failed, for their next try", async () => {
    const { env } = testEnv();
    await markOutboxPending(env.FLAGS);
    const put = vi.spyOn(env.FLAGS, "put");
    const send = vi.fn<typeof sendQueuedEmails>(async () => ({
      sent: 3,
      failed: 2,
    }));
    await runScheduled(EVERY_FIVE_MINUTES, env, { send });
    expect(put).toHaveBeenCalledOnce();
  });

  it("lets the flag lapse once a run leaves nothing behind", async () => {
```

with:

```ts
    });
  });

  it("notes when a failed email's next try is due, instead of keeping the flag up", async () => {
    const { env } = testEnv();
    await markOutboxPending(env.FLAGS);
    const put = vi.spyOn(env.FLAGS, "put");
    const due = new Date(Date.now() + 5 * 60_000);
    const send = vi.fn<typeof sendQueuedEmails>(async () => ({
      sent: 3,
      failed: 2,
      nextRetryAt: due,
    }));
    await runScheduled(EVERY_FIVE_MINUTES, env, { send });
    expect(put).toHaveBeenCalledExactlyOnceWith(
      OUTBOX_RETRY,
      String(due.getTime()),
      { expiration: Math.ceil((due.getTime() + 30 * 60_000) / 1000) }
    );
  });

  it("leaves the database alone until a retry is due", async () => {
    const env = offlineEnv();
    await env.FLAGS.put(OUTBOX_RETRY, String(Date.now() + 60_000));
    const send = nothingToSend();
    await runScheduled(EVERY_FIVE_MINUTES, env, { send });
    expect(send).not.toHaveBeenCalled();
  });

  it("sends once a retry is due, and clears the note when nothing waits", async () => {
    const { env } = testEnv();
    await env.FLAGS.put(OUTBOX_RETRY, String(Date.now() - 1000));
    const send = vi.fn<typeof sendQueuedEmails>(async () => ({
      sent: 1,
      failed: 0,
    }));
    await runScheduled(EVERY_FIVE_MINUTES, env, { send });
    expect(send).toHaveBeenCalledOnce();
    expect(await env.FLAGS.get(OUTBOX_RETRY)).toBeNull();
  });

  it("lets the flag lapse once a run leaves nothing behind", async () => {
```

In `worker/routes/subscriptions.test.ts`, replace:

```ts
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { posts } from "../db/schema";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import {
```

with:

```ts
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { emailOutbox, posts, user as users } from "../db/schema";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import {
```

In the same file, replace:

```ts
    await t.settle();
  });

  it("doesn't undo an unsubscribe when the same vote is sent again", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
```

with:

```ts
    await t.settle();
  });

  it("takes back the Shipped email waiting for someone who unsubscribes", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const leaving = await t.signIn();
    const staying = await t.signIn();
    const midSend = await t.signIn();
    for (const person of [leaving, staying, midSend]) {
      await voteFor(t, person.cookie, post.id);
    }
    await t.client.api.posts[":id"].status.$patch(
      { param: { id: String(post.id) }, json: { status: "shipped" } },
      { headers: { cookie: owner.cookie } }
    );
    const ids = new Map(
      (
        await db
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(
            inArray(users.email, [leaving.email, staying.email, midSend.email])
          )
      ).map((row) => [row.email, row.id])
    );
    // A run is sending this one right now: it still goes out.
    await db
      .update(emailOutbox)
      .set({ claimedAt: new Date() })
      .where(
        and(
          eq(emailOutbox.postId, post.id),
          eq(emailOutbox.userId, ids.get(midSend.email)!)
        )
      );

    await subscribe(t, leaving.cookie, post.id, false);
    await subscribe(t, midSend.cookie, post.id, false);

    const waiting = await db
      .select({ userId: emailOutbox.userId })
      .from(emailOutbox)
      .where(eq(emailOutbox.postId, post.id));
    expect(waiting.map((row) => row.userId).sort()).toEqual(
      [ids.get(staying.email), ids.get(midSend.email)].sort()
    );
    await t.settle();
  });

  it("doesn't undo an unsubscribe when the same vote is sent again", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
```

- [ ] **Step 2: Run them to watch them fail**

Run: `bunx vitest run worker/services/outbox.test.ts worker/cron.test.ts worker/routes/subscriptions.test.ts`
Expected: FAIL, `Tests  4 failed | 29 passed (33)`:
- the email is due again at once
- no retry note is written or cleared
- the unfollowing person's email is still queued

"leaves the database alone until a retry is due" already passes, since nothing reads the note yet.

- [ ] **Step 3: Space out the tries, and say when the next is due**

In `worker/services/outbox.ts`, replace:

```ts
import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { postRef } from "@/shared/ref";
import type { Database, Transaction } from "../db/client";
import {
```

with:

```ts
import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  min,
  or,
  sql,
} from "drizzle-orm";
import { postRef } from "@/shared/ref";
import type { Database, Transaction } from "../db/client";
import {
```

In the same file, replace:

```ts
export const OUTBOX_PENDING = "outbox:pending";

/**
 * Raises that flag for half an hour: long enough for every try at a batch
 * (5 tries, 5 minutes apart). It lapses by itself, so it never needs
 * clearing, and two status changes at once can't lose each other's emails.
 */
export function markOutboxPending(flags: Flags) {
  return flags.put(OUTBOX_PENDING, "1", { expirationTtl: 30 * 60 });
}

/** The flag that holds the five-minute cron back until the next UTC day. */
```

with:

```ts
export const OUTBOX_PENDING = "outbox:pending";

/**
 * Raises that flag for half an hour: long enough for a batch's first try,
 * and for a full batch to hand the rest on. It lapses by itself, so it never
 * needs clearing, and two status changes at once can't lose each other's
 * emails.
 */
export function markOutboxPending(flags: Flags) {
  return flags.put(OUTBOX_PENDING, "1", { expirationTtl: 30 * 60 });
}

/**
 * When the earliest failed email is due for its next try, in epoch
 * milliseconds. Only the cron writes it, so a status change's flag and this
 * can't overwrite each other's times; until then the cron leaves Neon asleep.
 */
export const OUTBOX_RETRY = "outbox:retry";

/** Notes when the next retry is due; the note lapses half an hour after. */
export function markOutboxRetry(flags: Flags, at: Date) {
  return flags.put(OUTBOX_RETRY, String(at.getTime()), {
    expiration: Math.ceil((at.getTime() + 30 * 60_000) / 1000),
  });
}

/** The flag that holds the five-minute cron back until the next UTC day. */
```

In the same file, replace:

```ts
    );
}

/** After this many failed tries, an email stays unsent with its last error. */
const MAX_ATTEMPTS = 5;

/** The most emails one run sends. */
export const OUTBOX_BATCH = 20;
```

with:

```ts
    );
}

/**
 * Someone stopped following a post: drop their emails about it that no run
 * has picked up. One already being sent still goes out.
 */
export async function takeBackEmailsTo(
  tx: Transaction,
  input: { postId: number; userId: string }
) {
  await tx
    .delete(emailOutbox)
    .where(
      and(
        eq(emailOutbox.postId, input.postId),
        eq(emailOutbox.userId, input.userId),
        isNull(emailOutbox.sentAt),
        isNull(emailOutbox.claimedAt)
      )
    );
}

/** After this many failed tries, an email stays unsent with its last error. */
const MAX_ATTEMPTS = 5;

/**
 * How long a failed email waits before its next try, by how many tries it
 * has had: it rides out a Brevo outage of about ten hours.
 */
export const RETRY_MINUTES = [5, 30, 120, 480] as const;

/** The most emails one run sends. */
export const OUTBOX_BATCH = 20;
```

In the same file, replace:

```ts
 *
 * Each email is claimed before it's sent, skipping rows another run has
 * locked, so overlapping runs send different ones. A claim left by a run
 * that died lapses after ten minutes. A failed email is tried again on
 * later runs. `postIds` limits a run to those posts' emails; the cron sends
 * them all, and tests pass their own posts so test files running at once
 * leave each other's emails alone.
 *
 * With `budget` (production), each email first takes one of the day's
 * emails. Once the day's share is spent, the run stops: the rest wait for
```

with:

```ts
 *
 * Each email is claimed before it's sent, skipping rows another run has
 * locked, so overlapping runs send different ones. A claim left by a run
 * that died lapses after ten minutes. A failed email waits longer after
 * each try (RETRY_MINUTES), and the result's `nextRetryAt` says when the
 * earliest waiting one is due. `postIds` limits a run to those posts'
 * emails; the cron sends them all, and tests pass their own posts so test
 * files running at once leave each other's emails alone.
 *
 * With `budget` (production), each email first takes one of the day's
 * emails. Once the day's share is spent, the run stops: the rest wait for
```

In the same file, replace:

```ts
    budget?: boolean;
    now?: Date;
  }
): Promise<{ sent: number; failed: number; budgetSpent?: true }> {
  const due = db
    .select({ id: emailOutbox.id })
    .from(emailOutbox)
```

with:

```ts
    budget?: boolean;
    now?: Date;
  }
): Promise<{
  sent: number;
  failed: number;
  budgetSpent?: true;
  nextRetryAt?: Date;
}> {
  const due = db
    .select({ id: emailOutbox.id })
    .from(emailOutbox)
```

In the same file, replace:

```ts
      and(
        isNull(emailOutbox.sentAt),
        lt(emailOutbox.attempts, MAX_ATTEMPTS),
        or(
          isNull(emailOutbox.claimedAt),
          lt(emailOutbox.claimedAt, sql`now() - interval '10 minutes'`)
```

with:

```ts
      and(
        isNull(emailOutbox.sentAt),
        lt(emailOutbox.attempts, MAX_ATTEMPTS),
        lte(emailOutbox.nextAttemptAt, sql`now()`),
        or(
          isNull(emailOutbox.claimedAt),
          lt(emailOutbox.claimedAt, sql`now() - interval '10 minutes'`)
```

In the same file, replace:

```ts
      id: emailOutbox.id,
      userId: emailOutbox.userId,
      payload: emailOutbox.payload,
    });
  if (claimed.length === 0) return { sent: 0, failed: 0 };
  const recipients = new Map(
    (
      await db
```

with:

```ts
      id: emailOutbox.id,
      userId: emailOutbox.userId,
      payload: emailOutbox.payload,
      attempts: emailOutbox.attempts,
    });
  if (claimed.length === 0) {
    return withNextRetry(db, { sent: 0, failed: 0 }, options.postIds);
  }
  const recipients = new Map(
    (
      await db
```

In the same file, replace:

```ts
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db
        .update(emailOutbox)
        .set({ claimedAt: null, lastError: message.slice(0, 500) })
        .where(eq(emailOutbox.id, email.id));
    }
  }
  return { sent, failed: claimed.length - sent };
}

```

with:

```ts
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const minutes = RETRY_MINUTES[email.attempts - 1] ?? 0;
      await db
        .update(emailOutbox)
        .set({
          claimedAt: null,
          lastError: message.slice(0, 500),
          nextAttemptAt: sql`now() + make_interval(mins => ${minutes})`,
        })
        .where(eq(emailOutbox.id, email.id));
    }
  }
  return withNextRetry(
    db,
    { sent, failed: claimed.length - sent },
    options.postIds
  );
}

/** Adds when the earliest email waiting for another try is due, if any. */
async function withNextRetry<T extends { sent: number; failed: number }>(
  db: Database,
  result: T,
  postIds?: number[]
): Promise<T & { nextRetryAt?: Date }> {
  const [row] = await db
    .select({ at: min(emailOutbox.nextAttemptAt) })
    .from(emailOutbox)
    .where(
      and(
        isNull(emailOutbox.sentAt),
        gt(emailOutbox.attempts, 0),
        lt(emailOutbox.attempts, MAX_ATTEMPTS),
        gt(emailOutbox.nextAttemptAt, sql`now()`),
        postIds ? inArray(emailOutbox.postId, postIds) : undefined
      )
    );
  return row?.at ? { ...result, nextRetryAt: row.at } : result;
}

```

- [ ] **Step 4: Let the cron sleep until then**

In `worker/cron.ts`, replace:

```ts
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

with:

```ts
import { pruneEmailCounters } from "./services/email-budget";
import {
  markOutboxPending,
  markOutboxRetry,
  OUTBOX_BATCH,
  OUTBOX_PAUSED,
  OUTBOX_PENDING,
  OUTBOX_RETRY,
  pauseOutboxUntilTomorrow,
  sendQueuedEmails,
} from "./services/outbox";
```

In the same file, replace:

```ts
 *   hours its database is awake, and the database sleeps after five quiet
 *   minutes, so a query every five minutes would keep it awake all month.
 *   The cron connects only while a status change's flag says emails wait,
 *   and puts the flag back up while some are left. Once the day's email is
 *   spent, a second flag keeps it from connecting until the next UTC day.
 * - Every night: reset the demo workspace, prune old email counters, then
 *   send whatever is queued, in case a flag was lost.
 */
```

with:

```ts
 *   hours its database is awake, and the database sleeps after five quiet
 *   minutes, so a query every five minutes would keep it awake all month.
 *   The cron connects only while a status change's flag says emails wait,
 *   or once a failed email's next try is due, and puts the flag back up
 *   while a full batch left some behind. Once the day's email is spent, a
 *   third flag keeps it from connecting until the next UTC day.
 * - Every night: reset the demo workspace, prune old email counters, then
 *   send whatever is queued, in case a flag was lost.
 */
```

In the same file, replace:

```ts
) {
  if (cron === EVERY_FIVE_MINUTES) {
    if (await env.FLAGS.get(OUTBOX_PAUSED)) return;
    if (!(await env.FLAGS.get(OUTBOX_PENDING))) return;
    await withDb(env, (db) => sendOutbox(db, env, mailer, send));
  } else if (cron === NIGHTLY) {
    await withDb(env, async (db) => {
      try {
```

with:

```ts
) {
  if (cron === EVERY_FIVE_MINUTES) {
    if (await env.FLAGS.get(OUTBOX_PAUSED)) return;
    const pending = await env.FLAGS.get(OUTBOX_PENDING);
    const retry = await env.FLAGS.get(OUTBOX_RETRY);
    if (!pending && !(retry && Number(retry) <= Date.now())) return;
    await withDb(env, (db) =>
      sendOutbox(db, env, mailer, send, retry !== null)
    );
  } else if (cron === NIGHTLY) {
    await withDb(env, async (db) => {
      try {
```

In the same file, replace:

```ts
      } catch (error) {
        console.error("[email] pruning counters failed:", error);
      }
      await sendOutbox(db, env, mailer, send);
    });
  }
}
```

with:

```ts
      } catch (error) {
        console.error("[email] pruning counters failed:", error);
      }
      const retry = await env.FLAGS.get(OUTBOX_RETRY);
      await sendOutbox(db, env, mailer, send, retry !== null);
    });
  }
}
```

In the same file, replace:

```ts
  }
}

async function sendOutbox(
  db: Database,
  env: Bindings,
  mailer: Mailer | undefined,
  send: typeof sendQueuedEmails
) {
  const result = await send(db, mailer ?? mailerFor(env), {
    origin: env.BETTER_AUTH_URL,
```

with:

```ts
  }
}

/** `retryNoted`: OUTBOX_RETRY was set, so a run that leaves none clears it. */
async function sendOutbox(
  db: Database,
  env: Bindings,
  mailer: Mailer | undefined,
  send: typeof sendQueuedEmails,
  retryNoted: boolean
) {
  const result = await send(db, mailer ?? mailerFor(env), {
    origin: env.BETTER_AUTH_URL,
```

In the same file, replace:

```ts
    await pauseOutboxUntilTomorrow(env.FLAGS);
    return;
  }
  // A full batch may have left more behind, and a failed email gets another
  // try: keep the five-minute cron looking. One KV write a run, only while
  // emails are waiting.
  if (result.sent + result.failed >= OUTBOX_BATCH || result.failed > 0) {
    await markOutboxPending(env.FLAGS);
  }
}

```

with:

```ts
    await pauseOutboxUntilTomorrow(env.FLAGS);
    return;
  }
  // A full batch may have left more behind: keep the five-minute cron
  // looking. One KV write a run, only while emails are waiting.
  if (result.sent + result.failed >= OUTBOX_BATCH) {
    await markOutboxPending(env.FLAGS);
  }
  // A failed email waits for its next try; until then the cron reads KV.
  if (result.nextRetryAt) await markOutboxRetry(env.FLAGS, result.nextRetryAt);
  else if (retryNoted) await env.FLAGS.delete(OUTBOX_RETRY);
}

```

- [ ] **Step 5: Take back queued email when someone unfollows**

In `worker/services/subscriptions.ts`, replace:

```ts
import type { Database, Transaction } from "../db/client";
import { posts, subscriptions } from "../db/schema";
import { AppError } from "../lib/errors";

/**
 * Subscribes someone to a post unless they already are. Posting, voting and
```

with:

```ts
import type { Database, Transaction } from "../db/client";
import { posts, subscriptions } from "../db/schema";
import { AppError } from "../lib/errors";
import { takeBackEmailsTo } from "./outbox";

/**
 * Subscribes someone to a post unless they already are. Posting, voting and
```

In the same file, replace:

```ts

/**
 * Sets whether someone follows a post. Like a vote, it sends the state
 * wanted, so repeating it changes nothing.
 */
export async function setSubscription(
  db: Database,
```

with:

```ts

/**
 * Sets whether someone follows a post. Like a vote, it sends the state
 * wanted, so repeating it changes nothing. Unfollowing also takes back the
 * person's queued emails about it.
 */
export async function setSubscription(
  db: Database,
```

In the same file, replace:

```ts
            eq(subscriptions.userId, input.userId)
          )
        );
    }
    return { subscribed: input.subscribed };
  });
```

with:

```ts
            eq(subscriptions.userId, input.userId)
          )
        );
      await takeBackEmailsTo(tx, input);
    }
    return { subscribed: input.subscribed };
  });
```

- [ ] **Step 6: Run the tests to watch them pass**

Run: `bunx vitest run worker/services/outbox.test.ts worker/cron.test.ts worker/routes/subscriptions.test.ts`
Expected: PASS, `Tests  33 passed (33)`.

- [ ] **Step 7: Run the whole suite**

Run: `bun run typecheck && bun run check && bun run test`
Expected: typecheck and Biome clean; `Test Files  82 passed (82)`, `Tests  653 passed (653)`.

- [ ] **Step 8: Commit**

```bash
git add worker/services/outbox.ts worker/services/outbox.test.ts worker/cron.ts worker/cron.test.ts worker/services/subscriptions.ts worker/routes/subscriptions.test.ts
git commit -m "fix: a failed Shipped email waits 5 min, 30 min, 2 h, then 8 h before its next try, and the cron sleeps until it's due; unsubscribing takes back the person's queued email (#25, #26)"
```

---

### Task 10: The feed's characters and cache, and the invitation limit's message (#44, #45, #47)

**Files:**
- Modify: `worker/services/changelog.ts`, `worker/routes/workspaces.ts`, `worker/middleware/rate-limit.ts`, `worker/routes/invitations.ts`, `shared/envelope.ts`, `src/i18n/messages/en.json`, `src/i18n/messages/tr.json`, `worker/routes/changelog-feed.test.ts`, `worker/routes/invitations.test.ts`

**Interfaces:**
- Produces: `rateLimit(bucket, limit, windowSeconds, code = "RATE_LIMITED")`, and the error code `INVITE_LIMIT` (429).

- [ ] **Step 1: Write the failing tests**

In `worker/routes/changelog-feed.test.ts`, replace:

```ts
    await t.settle();
  });

  it("is titled in the workspace's language", async () => {
    const t = testApp();
    const { slug } = await setupWorkspace(t, { defaultLocale: "tr" });
```

with:

```ts
    await t.settle();
  });

  it("leaves out characters XML forbids, so one odd title can't break it", async () => {
    const t = testApp();
    const { owner, slug, boards } = await setupWorkspace(t);
    const post = await submitPost(t, owner.cookie, slug, {
      boardId: boards[0]!.id,
      title: "Bell\u0007 and tab\u000b mode",
    });
    await moveTo(t, owner.cookie, post.id, "shipped", "Rings\u0001 now");
    const feed = await (await readFeed(t, slug)).text();
    expect(feed).not.toMatch(
      // biome-ignore lint/suspicious/noControlCharactersInRegex: what XML forbids
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/
    );
    expect(feed).toContain("<title>Bell and tab mode</title>");
    expect(feed).toContain("<summary>Rings now</summary>");
    await t.settle();
  });

  it("is titled in the workspace's language", async () => {
    const t = testApp();
    const { slug } = await setupWorkspace(t, { defaultLocale: "tr" });
```

In the same file, replace:

```ts
    await t.settle();
    return (await t.env.FLAGS.get(changelogKey(slug))) === null;
  }

  it("is dropped when the changelog changes, and only then", async () => {
    const t = testApp();
```

with:

```ts
    await t.settle();
    return (await t.env.FLAGS.get(changelogKey(slug))) === null;
  }

  it("is dropped when the workspace's name or language changes, or a board goes", async () => {
    const t = testApp();
    const { owner, slug, boards } = await setupWorkspace(t);
    const headers = { headers: { cookie: owner.cookie } };
    for (const json of [
      { name: "Acme Inc" },
      { defaultLocale: "tr" as const },
    ]) {
      expect(
        await drops(t, slug, () =>
          t.client.api.workspaces[":slug"].$patch(
            { param: { slug }, json },
            headers
          )
        )
      ).toBe(true);
    }
    expect(
      await drops(t, slug, () =>
        t.client.api.workspaces[":slug"].boards[":boardId"].$delete(
          { param: { slug, boardId: boards[0]!.id } },
          headers
        )
      )
    ).toBe(true);
  });

  it("is dropped when the changelog changes, and only then", async () => {
    const t = testApp();
```

In `worker/routes/invitations.test.ts`, replace:

```ts
    }
    const res = await invite(t, slug, address(), owner.cookie);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "RATE_LIMITED" });
    await t.settle();
  });
});
```

with:

```ts
    }
    const res = await invite(t, slug, address(), owner.cookie);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "INVITE_LIMIT" });
    await t.settle();
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `bunx vitest run worker/routes/changelog-feed.test.ts worker/routes/invitations.test.ts`
Expected: FAIL, `Tests  3 failed | 20 passed (23)`:
- the feed still carries the control characters
- the cached feed survives a rename and a board's deletion
- the limit answers `RATE_LIMITED`

- [ ] **Step 3: Drop what XML forbids**

In `worker/services/changelog.ts`, replace:

```ts
  return row?.slug ?? null;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
```

with:

```ts
  return row?.slug ?? null;
}

// Characters XML 1.0 allows nowhere, not even escaped: one in a title would
// make readers reject the whole feed.
// biome-ignore lint/suspicious/noControlCharactersInRegex: these are the ones to drop
const XML_FORBIDDEN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g;

function escapeXml(value: string) {
  return value
    .replace(XML_FORBIDDEN, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
```

- [ ] **Step 4: Drop the cached feed on a rename or a board's deletion**

In `worker/routes/workspaces.ts`, replace:

```ts
import { confineDemo, readOnlyInDemo } from "../middleware/demo";
import { requireUser } from "../middleware/session";
import { requireAdmin, requireTeam } from "../middleware/team";

export type WorkspaceSummary = {
  id: string;
```

with:

```ts
import { confineDemo, readOnlyInDemo } from "../middleware/demo";
import { requireUser } from "../middleware/session";
import { requireAdmin, requireTeam } from "../middleware/team";
import { dropChangelog } from "../services/changelog";

export type WorkspaceSummary = {
  id: string;
```

In the same file, replace:

```ts
            set: { defaultLocale },
          });
      }
      return c.json<SuccessResponse<WorkspaceSummary>>({
        success: true,
        data: await findWorkspace(c.var.db, slug),
```

with:

```ts
            set: { defaultLocale },
          });
      }
      // The feed's title and language come from these.
      c.executionCtx.waitUntil(dropChangelog(c.env.FLAGS, slug));
      return c.json<SuccessResponse<WorkspaceSummary>>({
        success: true,
        data: await findWorkspace(c.var.db, slug),
```

In the same file, replace:

```ts
        )
        .returning({ id: boards.id });
      if (!deleted) throw boardNotFound();
      return c.json<SuccessResponse<{ id: string }>>({
        success: true,
        data: deleted,
```

with:

```ts
        )
        .returning({ id: boards.id });
      if (!deleted) throw boardNotFound();
      // Its requests went with it, shipped ones included.
      c.executionCtx.waitUntil(
        dropChangelog(c.env.FLAGS, c.var.workspace.slug)
      );
      return c.json<SuccessResponse<{ id: string }>>({
        success: true,
        data: deleted,
```

- [ ] **Step 5: Give the invitation limit its own code and message**

In `worker/middleware/rate-limit.ts`, replace:

```ts
import { createMiddleware } from "hono/factory";
import { AppError } from "../lib/errors";
import { checkRateLimit } from "../lib/rate-limit";
import type { UserEnv } from "./session";
```

with:

```ts
import { createMiddleware } from "hono/factory";
import type { ApiErrorCode } from "@/shared/envelope";
import { AppError } from "../lib/errors";
import { checkRateLimit } from "../lib/rate-limit";
import type { UserEnv } from "./session";
```

In the same file, replace:

```ts
/**
 * A per-person limit for one route; it runs after requireUser. Like Better
 * Auth's limits, it applies only in production, so local dev isn't throttled.
 * Tests that check it run the app with ENVIRONMENT=production.
 */
export const rateLimit = (
  bucket: string,
  limit: number,
  windowSeconds: number
) =>
  createMiddleware<UserEnv>(async (c, next) => {
    if (c.env.ENVIRONMENT === "production") {
```

with:

```ts
/**
 * A per-person limit for one route; it runs after requireUser. Like Better
 * Auth's limits, it applies only in production, so local dev isn't throttled.
 * Tests that check it run the app with ENVIRONMENT=production. A limit
 * whose wait is longer than "a minute" answers its own `code`.
 */
export const rateLimit = (
  bucket: string,
  limit: number,
  windowSeconds: number,
  code: Extract<ApiErrorCode, "RATE_LIMITED" | "INVITE_LIMIT"> = "RATE_LIMITED"
) =>
  createMiddleware<UserEnv>(async (c, next) => {
    if (c.env.ENVIRONMENT === "production") {
```

In the same file, replace:

```ts
        windowSeconds,
      });
      if (!allowed) {
        throw new AppError(429, "RATE_LIMITED", "Too many requests");
      }
    }
    await next();
```

with:

```ts
        windowSeconds,
      });
      if (!allowed) {
        throw new AppError(429, code, "Too many requests");
      }
    }
    await next();
```

In `worker/routes/invitations.ts`, replace:

```ts
    readOnlyInDemo,
    requireAdmin,
    validate("json", inviteSchema),
    rateLimit("invite", INVITES_PER_HOUR, 3600),
    async (c) => {
      const { email, role } = c.req.valid("json");
      const workspace = c.var.workspace;
```

with:

```ts
    readOnlyInDemo,
    requireAdmin,
    validate("json", inviteSchema),
    rateLimit("invite", INVITES_PER_HOUR, 3600, "INVITE_LIMIT"),
    async (c) => {
      const { email, role } = c.req.valid("json");
      const workspace = c.var.workspace;
```

In the same file, replace:

```ts
    requireTeam,
    readOnlyInDemo,
    requireAdmin,
    rateLimit("invite", INVITES_PER_HOUR, 3600),
    async (c) => {
      const workspace = c.var.workspace;
      const pending = await findPending(
```

with:

```ts
    requireTeam,
    readOnlyInDemo,
    requireAdmin,
    rateLimit("invite", INVITES_PER_HOUR, 3600, "INVITE_LIMIT"),
    async (c) => {
      const workspace = c.var.workspace;
      const pending = await findPending(
```

In `shared/envelope.ts`, replace:

```ts
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "WORKSPACE_LIMIT"
  | "POST_MERGED"
```

with:

```ts
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INVITE_LIMIT"
  | "INTERNAL_ERROR"
  | "WORKSPACE_LIMIT"
  | "POST_MERGED"
```

In `src/i18n/messages/en.json`, replace:

```json
    "NOT_FOUND": "We couldn't find that.",
    "CONFLICT": "That's already taken.",
    "RATE_LIMITED": "Too many requests. Wait a minute and try again.",
    "INTERNAL_ERROR": "Something went wrong on our side. Try again.",
    "WORKSPACE_LIMIT": "Each account can have one workspace for now.",
    "POST_MERGED": "This request was merged into another one.",
```

with:

```json
    "NOT_FOUND": "We couldn't find that.",
    "CONFLICT": "That's already taken.",
    "RATE_LIMITED": "Too many requests. Wait a minute and try again.",
    "INVITE_LIMIT": "You can send ten invitations an hour. Try again later.",
    "INTERNAL_ERROR": "Something went wrong on our side. Try again.",
    "WORKSPACE_LIMIT": "Each account can have one workspace for now.",
    "POST_MERGED": "This request was merged into another one.",
```

In `src/i18n/messages/tr.json`, replace:

```json
    "NOT_FOUND": "Aradığınız şey bulunamadı.",
    "CONFLICT": "Bu zaten kullanılıyor.",
    "RATE_LIMITED": "Çok fazla istek gönderildi. Bir dakika bekleyip tekrar deneyin.",
    "INTERNAL_ERROR": "Bizim tarafımızda bir sorun oluştu. Tekrar deneyin.",
    "WORKSPACE_LIMIT": "Şimdilik her hesap bir çalışma alanı açabilir.",
    "POST_MERGED": "Bu istek başka bir istekle birleştirildi.",
```

with:

```json
    "NOT_FOUND": "Aradığınız şey bulunamadı.",
    "CONFLICT": "Bu zaten kullanılıyor.",
    "RATE_LIMITED": "Çok fazla istek gönderildi. Bir dakika bekleyip tekrar deneyin.",
    "INVITE_LIMIT": "Saatte en fazla on davet gönderebilirsiniz. Daha sonra tekrar deneyin.",
    "INTERNAL_ERROR": "Bizim tarafımızda bir sorun oluştu. Tekrar deneyin.",
    "WORKSPACE_LIMIT": "Şimdilik her hesap bir çalışma alanı açabilir.",
    "POST_MERGED": "Bu istek başka bir istekle birleştirildi.",
```

- [ ] **Step 6: Run the tests to watch them pass**

Run: `bunx vitest run worker/routes/changelog-feed.test.ts worker/routes/invitations.test.ts`
Expected: PASS, `Tests  23 passed (23)`.

- [ ] **Step 7: Run the whole suite**

Run: `bun run typecheck && bun run check && bun run test`
Expected: typecheck and Biome clean; `Test Files  82 passed (82)`, `Tests  655 passed (655)`.

- [ ] **Step 8: Commit**

```bash
git add worker/services/changelog.ts worker/routes/workspaces.ts worker/middleware/rate-limit.ts worker/routes/invitations.ts shared/envelope.ts src/i18n/messages/en.json src/i18n/messages/tr.json worker/routes/changelog-feed.test.ts worker/routes/invitations.test.ts
git commit -m "fix: the feed drops characters XML forbids, renaming a workspace or deleting a board clears the cached feed, and the invitation limit says to try later (#44, #45, #47)"
```

---

### Task 11: The invitation page's key, demoting yourself, and join dates (#42, #43, #46)

**Files:**
- Modify: `src/lib/invitations.ts`, `src/features/invitations/invitation-panel.tsx`, `src/components/settings/team-section.tsx`, `src/i18n/messages/en.json`, `src/i18n/messages/tr.json`, `src/features/invitations/invitation-panel.test.tsx`, `src/components/settings/team-section.test.tsx`

**Interfaces:**
- Produces: `invitationQueryOptions(id: string, viewerId: string | null)`, keyed `["invitation", id, viewerId]`.

- [ ] **Step 1: Write the failing tests**

In `src/features/invitations/invitation-panel.test.tsx`, replace:

```tsx
import { IntlProvider } from "use-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";
import type { InvitationView } from "@/shared/invitations";
import { InvitationPanel } from "./invitation-panel";

```

with:

```tsx
import { IntlProvider } from "use-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";
import { meQueryOptions } from "@/lib/session";
import type { InvitationView } from "@/shared/invitations";
import { InvitationPanel } from "./invitation-panel";

```

In the same file, replace:

```tsx
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
```

with:

```tsx
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  render(
    <IntlProvider locale="en" messages={en} timeZone="UTC">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </IntlProvider>
  );
  return queryClient;
}

describe("InvitationPanel", () => {
```

In the same file, replace:

```tsx
    ).toBeTruthy();
  });

  it("says when an invitation has expired, or was used or cancelled", async () => {
    fakeServer(view({ state: "expired" }));
    renderPanel();
```

with:

```tsx
    ).toBeTruthy();
  });

  it("never shows someone who just signed in the answer they got signed out", async () => {
    session.signedIn = false;
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "http://localhost");
        const ok = (data: unknown) => Response.json({ success: true, data });
        if (url.pathname === "/api/me") {
          return ok({
            user: session.signedIn
              ? { id: "u-sam", name: "", email: "sam@studio.dev" }
              : null,
            workspaces: [],
          });
        }
        // Signed out it can't be for you; signed in as Sam it is, slowly.
        if (session.signedIn) await held;
        return ok(view({ forYou: session.signedIn }));
      })
    );
    const queryClient = renderPanel();
    expect(
      await screen.findByRole("link", { name: "Sign in to join" })
    ).toBeTruthy();

    session.signedIn = true;
    await queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey });
    expect(await screen.findByText("Loading the invitation…")).toBeTruthy();
    expect(screen.queryByText(/This invitation went to/)).toBeNull();
    release();
    expect(
      await screen.findByRole("button", { name: "Join Acme" })
    ).toBeTruthy();
  });

  it("still shows the invitation when Pano can't tell who's signed in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "http://localhost");
        if (url.pathname === "/api/me") {
          return Response.json(
            { success: false, code: "INTERNAL_ERROR", error: "down" },
            { status: 500 }
          );
        }
        return Response.json({ success: true, data: view({ forYou: false }) });
      })
    );
    renderPanel();
    expect(
      await screen.findByRole("link", { name: "Sign in to join" })
    ).toBeTruthy();
  });

  it("says when an invitation has expired, or was used or cancelled", async () => {
    fakeServer(view({ state: "expired" }));
    renderPanel();
```

In `src/components/settings/team-section.test.tsx`, replace:

```tsx
import { IntlProvider } from "use-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";
import type { PendingInvitation, TeamView } from "@/shared/team";
import { TeamSection } from "./team-section";

```

with:

```tsx
import { IntlProvider } from "use-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";
import { meQueryOptions } from "@/lib/session";
import type { PendingInvitation, TeamView } from "@/shared/team";
import { TeamSection } from "./team-section";

```

In the same file, replace:

```tsx
    </IntlProvider>
  );
  await screen.findByRole("heading", { name: "Members" });
}

const memberRow = (name: string) =>
```

with:

```tsx
    </IntlProvider>
  );
  await screen.findByRole("heading", { name: "Members" });
  return qc;
}

const memberRow = (name: string) =>
```

In the same file, replace:

```tsx
  );

describe("TeamSection", () => {
  it("gives owners the invite form and every control but the owner's", async () => {
    fakeServer();
    await renderTeam({ id: "u-owner", role: "owner" });
```

with:

```tsx
  );

describe("TeamSection", () => {
  it("shows when each person joined", async () => {
    fakeServer();
    await renderTeam({ id: "u-owner", role: "owner" });
    expect(memberRow("Defne").getByText("joined October 2, 2026")).toBeTruthy();
  });

  it("refreshes who you are when you change your own role, and only then", async () => {
    fakeServer();
    const qc = await renderTeam({ id: "u-defne", role: "admin" });
    const me = { user: { id: "u-defne" }, workspaces: [] };
    qc.setQueryData(meQueryOptions.queryKey, me as never);
    const meInvalidated = () =>
      qc.getQueryState(meQueryOptions.queryKey)?.isInvalidated;

    fireEvent.change(screen.getByLabelText("Role for Jonas"), {
      target: { value: "admin" },
    });
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Role for Jonas") as HTMLSelectElement).value
      ).toBe("admin")
    );
    expect(meInvalidated()).toBe(false);

    fireEvent.change(screen.getByLabelText("Role for Defne"), {
      target: { value: "member" },
    });
    await waitFor(() => expect(meInvalidated()).toBe(true));
  });

  it("gives owners the invite form and every control but the owner's", async () => {
    fakeServer();
    await renderTeam({ id: "u-owner", role: "owner" });
```

- [ ] **Step 2: Run them to watch three fail**

Run: `bunx vitest run src/features/invitations/invitation-panel.test.tsx src/components/settings/team-section.test.tsx`
Expected: FAIL, `Tests  3 failed | 15 passed (18)`:
- the signed-out answer shows after signing in
- `/api/me` stays valid after demoting yourself
- there's no join date

"still shows the invitation when Pano can't tell who's signed in" already passes.

- [ ] **Step 3: Key the invitation by who's signed in**

In `src/lib/invitations.ts`, replace:

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
```

with:

```ts
import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "./api";

/**
 * What /invite/<id> shows. It depends on who's signed in, so their id is in
 * the key: signing in or out never shows one person another's answer.
 */
export const invitationQueryOptions = (id: string, viewerId: string | null) =>
  queryOptions({
    queryKey: ["invitation", id, viewerId],
    queryFn: async () =>
      unwrap(await api.invitations[":id"].$get({ param: { id } })),
  });
```

In `src/features/invitations/invitation-panel.tsx`, replace:

```tsx
export function InvitationPanel({ id }: { id: string }) {
  const t = useTranslations("invitation");
  const tErrors = useTranslations("errors");
  const invitation = useQuery(invitationQueryOptions(id));
  const me = useQuery(meQueryOptions);
  if (invitation.isPending || me.isPending) {
    return (
      <>
```

with:

```tsx
export function InvitationPanel({ id }: { id: string }) {
  const t = useTranslations("invitation");
  const tErrors = useTranslations("errors");
  const me = useQuery(meQueryOptions);
  // Asked once Pano knows who's signed in: the answer depends on it.
  const invitation = useQuery({
    ...invitationQueryOptions(id, me.data?.user?.id ?? null),
    enabled: !me.isPending,
  });
  if (invitation.isPending || me.isPending) {
    return (
      <>
```

- [ ] **Step 4: Refresh `/api/me` after your own role changes, and show join dates**

In `src/components/settings/team-section.tsx`, replace:

```tsx
}) {
  const t = useTranslations("team");
  const tRoles = useTranslations("team.roles");
  const errorText = useErrorText();
  const refresh = useRefreshTeam(slug);
  const queryClient = useQueryClient();
```

with:

```tsx
}) {
  const t = useTranslations("team");
  const tRoles = useTranslations("team.roles");
  const format = useFormatter();
  const errorText = useErrorText();
  const refresh = useRefreshTeam(slug);
  const queryClient = useQueryClient();
```

In the same file, replace:

```tsx
  const label = isYou ? t("you", { name }) : name;
  const setRole = useMutation({
    mutationFn: (role: AssignableRole) => changeRole(slug, member.userId, role),
    onSuccess: refresh,
    onError: (error) => report(errorText(error)),
  });
  const remove = useMutation({
```

with:

```tsx
  const label = isYou ? t("you", { name }) : name;
  const setRole = useMutation({
    mutationFn: (role: AssignableRole) => changeRole(slug, member.userId, role),
    onSuccess: async () => {
      // Your own role sets which controls Settings shows you.
      if (isYou) {
        await queryClient.invalidateQueries({
          queryKey: meQueryOptions.queryKey,
        });
      }
      await refresh();
    },
    onError: (error) => report(errorText(error)),
  });
  const remove = useMutation({
```

In the same file, replace:

```tsx
            {member.email}
          </span>
        )}
      </div>
      {manages && member.role !== "owner" ? (
        <RoleSelect
```

with:

```tsx
            {member.email}
          </span>
        )}
        <span className="text-muted-foreground text-xs">
          {t("joined", {
            date: format.dateTime(new Date(member.joinedAt), {
              day: "numeric",
              month: "long",
              year: "numeric",
            }),
          })}
        </span>
      </div>
      {manages && member.role !== "owner" ? (
        <RoleSelect
```

In `src/i18n/messages/en.json`, replace:

```json
    "confirmLeave": "Confirm leave",
    "expires": "expires {date}",
    "expired": "expired",
    "resend": "Resend",
    "resendLabel": "Send the invitation to {email} again",
    "cancel": "Cancel",
```

with:

```json
    "confirmLeave": "Confirm leave",
    "expires": "expires {date}",
    "expired": "expired",
    "joined": "joined {date}",
    "resend": "Resend",
    "resendLabel": "Send the invitation to {email} again",
    "cancel": "Cancel",
```

In `src/i18n/messages/tr.json`, replace:

```json
    "confirmLeave": "Ayrılmayı onayla",
    "expires": "{date} tarihine kadar",
    "expired": "süresi doldu",
    "resend": "Yeniden gönder",
    "resendLabel": "{email} davetini yeniden gönder",
    "cancel": "İptal et",
```

with:

```json
    "confirmLeave": "Ayrılmayı onayla",
    "expires": "{date} tarihine kadar",
    "expired": "süresi doldu",
    "joined": "{date} tarihinde katıldı",
    "resend": "Yeniden gönder",
    "resendLabel": "{email} davetini yeniden gönder",
    "cancel": "İptal et",
```

- [ ] **Step 5: Run the tests to watch them pass**

Run: `bunx vitest run src/features/invitations/invitation-panel.test.tsx src/components/settings/team-section.test.tsx`
Expected: PASS, `Tests  18 passed (18)`.

- [ ] **Step 6: Run the whole suite**

Run: `bun run typecheck && bun run check && bun run test`
Expected: typecheck and Biome clean; `Test Files  82 passed (82)`, `Tests  659 passed (659)`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/invitations.ts src/features/invitations/invitation-panel.tsx src/features/invitations/invitation-panel.test.tsx src/components/settings/team-section.tsx src/components/settings/team-section.test.tsx src/i18n/messages/en.json src/i18n/messages/tr.json
git commit -m "fix: the invitation page keys its answer by who's signed in, demoting yourself refreshes your controls, and Settings → Team shows when people joined (#42, #43, #46)"
```

---

### Task 12: Deploys from GitHub, with a migration guard (#12, #37, #41)

**Files:**
- Create: `scripts/missing-migrations.ts`, `scripts/check-migrations.ts`, `test/missing-migrations.test.ts`
- Modify: `worker/routes/health.ts`, `worker/routes/health.test.ts`, `worker/config.test.ts`, `wrangler.jsonc`, `.github/workflows/ci.yml`, `README.md`

**Interfaces:**
- Produces:
  - `GET /api/health` answers `{ db: "up", migration: number | null }`, where `migration` is the newest applied migration's `created_at`, its journal `when`.
  - `missingMigrations(journal, health): string | null`.
  - `bun scripts/check-migrations.ts <site>` exits 1 with the reason, or prints that production has every migration.

- [ ] **Step 1: Write the failing tests**

In `worker/config.test.ts`, replace:

```ts
  triggers: { crons: string[] };
  kv_namespaces: { binding: string }[];
  vars?: Record<string, string>;
};

/**
```

with:

```ts
  triggers: { crons: string[] };
  kv_namespaces: { binding: string }[];
  vars?: Record<string, string>;
  preview_urls?: boolean;
  workers_dev?: boolean;
};

/**
```

In the same file, replace:

```ts
    expect(vars?.ENVIRONMENT).toBe("production");
    expect(vars?.BETTER_AUTH_URL).toBe("https://pano.olbios88.workers.dev");
  });
});

```

with:

```ts
    expect(vars?.ENVIRONMENT).toBe("production");
    expect(vars?.BETTER_AUTH_URL).toBe("https://pano.olbios88.workers.dev");
  });

  it("serves only the deployed version, at workers.dev", () => {
    // Every uploaded version would otherwise get its own URL, running its
    // code against production's KV and database long after a fix shipped.
    const config = wranglerConfig();
    expect(config.preview_urls).toBe(false);
    expect(config.workers_dev).toBe(true);
  });
});

```

In `worker/routes/health.test.ts`, replace:

```ts
import { testClient } from "hono/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../app";
```

with:

```ts
import { readFileSync } from "node:fs";
import { testClient } from "hono/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../app";
```

In the same file, replace:

```ts
  vi.restoreAllMocks();
});

describe("GET /api/health", () => {
  it("reports the database as up", async () => {
    const { env, ctx, settle } = testEnv();
    const res = await testClient(app, env, ctx).api.health.$get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { db: "up" } });
    await settle();
  });

```

with:

```ts
  vi.restoreAllMocks();
});

/** When the repo's newest migration was made, as drizzle-kit records it. */
function newestMigration(): number {
  const journal = JSON.parse(
    readFileSync("drizzle/meta/_journal.json", "utf8")
  ) as { entries: { when: number }[] };
  return journal.entries.at(-1)!.when;
}

describe("GET /api/health", () => {
  it("reports the database as up, with the newest migration it has", async () => {
    const { env, ctx, settle } = testEnv();
    const res = await testClient(app, env, ctx).api.health.$get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: { db: "up", migration: newestMigration() },
    });
    await settle();
  });

```

Create `test/missing-migrations.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { missingMigrations } from "../scripts/missing-migrations";

const journal = {
  entries: [
    { tag: "0012_one_owned_workspace", when: 1_000 },
    { tag: "0013_changelog_index", when: 2_000 },
    { tag: "0014_outbox_retries_and_indexes", when: 3_000 },
  ],
};
const health = (migration: unknown) => ({
  success: true,
  data: { db: "up", migration },
});

describe("missingMigrations", () => {
  it("lets the deploy go on when production has every migration", () => {
    expect(missingMigrations(journal, health(3_000))).toBeNull();
  });

  it("names the migrations production is missing, and what to run", () => {
    expect(missingMigrations(journal, health(1_000))).toBe(
      "Production is missing 0013_changelog_index, 0014_outbox_retries_and_indexes. Run `bun run db:migrate:prod`, then re-run this job."
    );
  });

  it("stops when production doesn't say which migrations it has", () => {
    expect(missingMigrations(journal, health(undefined))).toBe(
      "Production's /api/health doesn't say which migrations it has. Deploy this commit once with `bun run deploy`, then re-run this job."
    );
  });

  it("stops when production doesn't answer", () => {
    expect(missingMigrations(journal, null)).toBe(
      "Production's /api/health didn't answer, so its migrations are unknown. Re-run this job once the site is up."
    );
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `bunx vitest run worker/config.test.ts worker/routes/health.test.ts test/missing-migrations.test.ts`
Expected: FAIL, `Test Files  3 failed (3)`, `Tests  2 failed | 4 passed (6)`:
- `Cannot find module '../scripts/missing-migrations'`
- `preview_urls` is undefined
- the health answer has no `migration`

- [ ] **Step 3: Report the newest migration**

Replace the whole of `worker/routes/health.ts` with:

```ts
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import type { SuccessResponse } from "@/shared/envelope";
import type { AppEnv } from "../env";

/**
 * Says the database answers, and the newest migration it has applied: when
 * drizzle-kit made it, as drizzle/meta/_journal.json records it. The deploy
 * job compares that with the commit's own (scripts/check-migrations.ts).
 */
export const healthRoutes = new Hono<AppEnv>().get("/", async (c) => {
  const [row] = await c.var.db.execute<{ migration: string | null }>(
    sql`select max(created_at)::text as migration from drizzle.__drizzle_migrations`
  );
  return c.json<SuccessResponse<{ db: "up"; migration: number | null }>>({
    success: true,
    data: {
      db: "up",
      migration: row?.migration ? Number(row.migration) : null,
    },
  });
});
```

- [ ] **Step 4: The guard**

Create `scripts/missing-migrations.ts`:

```ts
/** drizzle/meta/_journal.json: each migration, and when drizzle-kit made it. */
export type Journal = { entries: { tag: string; when: number }[] };

/**
 * Why a deploy must wait, or null when production has every migration in
 * `journal`. `health` is production's /api/health answer, or null when it
 * didn't answer.
 */
export function missingMigrations(
  journal: Journal,
  health: unknown
): string | null {
  if (health === null) {
    return "Production's /api/health didn't answer, so its migrations are unknown. Re-run this job once the site is up.";
  }
  const applied = (health as { data?: { migration?: unknown } }).data
    ?.migration;
  if (typeof applied !== "number") {
    return "Production's /api/health doesn't say which migrations it has. Deploy this commit once with `bun run deploy`, then re-run this job.";
  }
  const missing = journal.entries
    .filter((entry) => entry.when > applied)
    .map((entry) => entry.tag);
  if (missing.length === 0) return null;
  return `Production is missing ${missing.join(", ")}. Run \`bun run db:migrate:prod\`, then re-run this job.`;
}
```

Create `scripts/check-migrations.ts`:

```ts
// `bun scripts/check-migrations.ts <site>`: the deploy job's first step. It
// stops the deploy while the site's database lacks a migration this commit
// has, so new code never runs against an old schema. Migrations stay a
// manual `bun run db:migrate:prod`.
import { readFileSync } from "node:fs";
import { type Journal, missingMigrations } from "./missing-migrations";

const site = process.argv[2];
if (!site) {
  console.error("usage: bun scripts/check-migrations.ts <site>");
  process.exit(1);
}
const journal = JSON.parse(
  readFileSync("drizzle/meta/_journal.json", "utf8")
) as Journal;
let health: unknown = null;
try {
  const res = await fetch(new URL("/api/health", site), {
    signal: AbortSignal.timeout(10_000),
  });
  if (res.ok) health = await res.json();
} catch {
  // Unreachable: missingMigrations says so.
}
const problem = missingMigrations(journal, health);
if (problem) {
  console.error(problem);
  process.exit(1);
}
console.log(`Production has every migration, up to ${journal.entries.at(-1)?.tag}.`);
```

- [ ] **Step 5: Turn off preview URLs**

In `wrangler.jsonc`, replace:

```jsonc
  "observability": {
    "enabled": true
  },
  // Production's settings. Local dev and the tests take theirs from
  // .dev.vars, which wins over these.
  "vars": {
```

with:

```jsonc
  "observability": {
    "enabled": true
  },
  // Only the deployed version answers, at workers.dev: a preview URL per
  // upload would keep old code running against production's KV and Neon.
  "preview_urls": false,
  "workers_dev": true,
  // Production's settings. Local dev and the tests take theirs from
  // .dev.vars, which wins over these.
  "vars": {
```

- [ ] **Step 6: Run the tests to watch them pass**

Run: `bunx vitest run worker/config.test.ts worker/routes/health.test.ts test/missing-migrations.test.ts`
Expected: PASS, `Test Files  3 passed (3)`, `Tests  10 passed (10)`.

- [ ] **Step 7: Run the guard against a stand-in for production**

The stand-in plays four answers: current, a migration behind, the pre-Phase 7 health answer, and an error page. Then it tries a site that doesn't answer. It lives in `node_modules/.tmp`, which git ignores.

```bash
mkdir -p node_modules/.tmp
cat > node_modules/.tmp/fake-health.ts <<'EOF'
const { entries } = JSON.parse(await Bun.file("drizzle/meta/_journal.json").text());
let respond = () => new Response("");
const server = Bun.serve({ port: 0, fetch: () => respond() });
const health = (migration?: number) => () =>
  Response.json({ success: true, data: { db: "up", ...(migration === undefined ? {} : { migration }) } });
const cases: [string, () => Response][] = [
  ["current", health(entries.at(-1).when)],
  ["behind", health(entries.at(-2).when)],
  ["old health", health()],
  ["error page", () => new Response("<h1>Bad gateway</h1>", { status: 502, headers: { "content-type": "text/html" } })],
];
for (const [name, answer] of cases) {
  respond = answer;
  const run = Bun.spawn(["bun", "scripts/check-migrations.ts", `http://localhost:${server.port}`], { stdout: "pipe", stderr: "pipe" });
  const out = (await new Response(run.stdout).text()) + (await new Response(run.stderr).text());
  console.log(`${name}: exit ${await run.exited} | ${out.trim()}`);
}
server.stop();
const down = Bun.spawnSync(["bun", "scripts/check-migrations.ts", "http://127.0.0.1:1"]);
console.log(`down: exit ${down.exitCode} | ${down.stderr.toString().trim()}`);
EOF
bun node_modules/.tmp/fake-health.ts
```

Expected, line by line:
- `current: exit 0 | Production has every migration, up to 0014_outbox_retries_and_indexes.`
- `behind: exit 1 | Production is missing 0014_outbox_retries_and_indexes. Run `bun run db:migrate:prod`, then re-run this job.`
- `old health: exit 1 | Production's /api/health doesn't say which migrations it has. Deploy this commit once with `bun run deploy`, then re-run this job.`
- `error page: exit 1 | Production's /api/health didn't answer, so its migrations are unknown. Re-run this job once the site is up.`
- `down: exit 1 |` followed by the same "didn't answer" message.

- [ ] **Step 8: The workflow**

In `.github/workflows/ci.yml`, replace:

```yaml
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
```

with:

```yaml
  pull_request:
    branches: [main]

# The workflow's token can read the code and nothing else.
permissions:
  contents: read

# A newer push cancels an older run on a branch, but never on main, where
# the run may be deploying.
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}

jobs:
  verify:
```

In the same file, replace:

```yaml
      TEST_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/pano_test

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
```

with:

```yaml
      TEST_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/pano_test

    steps:
      - uses: actions/checkout@v7

      # Vite and Wrangler run on Node; Bun runs the scripts and tests.
      - uses: actions/setup-node@v7
        with:
          node-version: 24

      - uses: oven-sh/setup-bun@v2
        with:
```

In the same file, replace:

```yaml
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/pano_e2e

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
```

with:

```yaml
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/pano_e2e

    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version: 24

      - uses: oven-sh/setup-bun@v2
        with:
```

In the same file, replace:

```yaml
          path: playwright-report/
          retention-days: 7

```

with:

```yaml
          path: playwright-report/
          retention-days: 7

  deploy:
    name: deploy
    # Only a push to main whose checks all passed deploys.
    needs: [verify, e2e]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    # The Cloudflare token lives in this environment, which only main can use.
    environment: production
    # One deploy at a time, in push order; none is cut short.
    concurrency:
      group: production
      cancel-in-progress: false

    env:
      SITE: https://pano.olbios88.workers.dev

    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version: 24

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.1

      - name: Install
        run: bun install --frozen-lockfile

      # New code never runs against an old schema: production must already
      # have every migration this commit has (bun run db:migrate:prod).
      - name: Production has every migration
        run: bun scripts/check-migrations.ts "$SITE"

      - name: Deploy
        run: bun run deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

```

Check its shape:

```bash
bun -e 'const ci = Bun.YAML.parse(await Bun.file(".github/workflows/ci.yml").text()); console.log("permissions", JSON.stringify(ci.permissions), "| cancel", ci.concurrency["cancel-in-progress"]); for (const [name, job] of Object.entries(ci.jobs)) console.log(name, "needs", JSON.stringify(job.needs ?? []), "| if", job.if ?? "-", "| env", job.environment ?? "-", "| uses", job.steps.filter((s) => s.uses).map((s) => s.uses).join(" "));'
```

Expected:
- `permissions {"contents":"read"} | cancel ${{ github.ref != 'refs/heads/main' }}`
- `verify needs [] | if - | env - | uses actions/checkout@v7 actions/setup-node@v7 oven-sh/setup-bun@v2`
- `e2e needs [] | if - | env - | uses actions/checkout@v7 actions/setup-node@v7 oven-sh/setup-bun@v2 actions/cache@v4 actions/upload-artifact@v4`
- `deploy needs ["verify","e2e"] | if github.event_name == 'push' && github.ref == 'refs/heads/main' | env production | uses actions/checkout@v7 actions/setup-node@v7 oven-sh/setup-bun@v2`

- [ ] **Step 9: The README's deploy notes**

In `README.md`, replace:

```md
6. `DATABASE_URL="$NEON_URL" PANO_OWNER_EMAIL=you@example.com bun run seed`
   builds the demo and makes `/pano`, owned by whoever signs in with that
   address.

Then `bun run deploy`, and check the live site with
`E2E_BASE_URL=… bun run e2e`. `vars` in `wrangler.jsonc` hold production's
`ENVIRONMENT` and `BETTER_AUTH_URL`; `.dev.vars` overrides both locally.

A release that adds migrations: `bun run db:migrate:prod` first, then
`bun run deploy`. Pano's migrations only add, so the running Worker keeps
working against the new schema until the deploy lands.

```

with:

```md
6. `DATABASE_URL="$NEON_URL" PANO_OWNER_EMAIL=you@example.com bun run seed`
   builds the demo and makes `/pano`, owned by whoever signs in with that
   address.
7. For deploys from GitHub: a Cloudflare API token from the "Edit Cloudflare
   Workers" template, limited to your account, and a GitHub environment
   named `production`, limited to `main`, holding `CLOUDFLARE_API_TOKEN`
   and `CLOUDFLARE_ACCOUNT_ID`.

Then `bun run deploy` once, and check the live site with
`E2E_BASE_URL=… bun run e2e`. `vars` in `wrangler.jsonc` hold production's
`ENVIRONMENT` and `BETTER_AUTH_URL`; `.dev.vars` overrides both locally.

After that, a push to `main` deploys itself: CI's `deploy` job runs once
`verify` and `e2e` pass. `bun run deploy` stays for deploying by hand.

A release that adds migrations: `bun run db:migrate:prod` first, then push.
Pano's migrations only add, so the running Worker keeps working against the
new schema until the deploy lands. The deploy job checks first
(`scripts/check-migrations.ts`): if production lacks a migration the commit
has, it stops and names it. Migrate, then re-run the job.

```

- [ ] **Step 10: Build, and dry-run a deploy**

`--dry-run` builds the upload without contacting Cloudflare.

Run: `bun run build && bunx wrangler deploy --dry-run`
Expected: no warning about preview URLs; `Total Upload: 1706.26 KiB / gzip: 384.78 KiB` (within a few KiB); `--dry-run: exiting now.`

- [ ] **Step 11: Run the whole suite and the browser tests**

Run: `bun run typecheck && bun run check && bun run test && bun run e2e`
Expected: typecheck and Biome clean; `Test Files  83 passed (83)`, `Tests  664 passed (664)`; `6 passed`.

- [ ] **Step 12: Commit**

```bash
git add .github/workflows/ci.yml wrangler.jsonc README.md worker/config.test.ts worker/routes/health.ts worker/routes/health.test.ts scripts/missing-migrations.ts scripts/check-migrations.ts test/missing-migrations.test.ts
git commit -m "ci: deploy from GitHub Actions once verify and e2e pass on main, refusing while production lacks a migration; Node 24, read-only token, checkout and setup-node v7; no preview URLs (#12, #37, #41)"
```

---

## Part 2: Release (after the merge, with you)

Nothing here runs without you. Pushes are yours: `! git -C ~/repos/deploys/pano push origin main`. You set up the Cloudflare token and the `production` environment on 2026-11-07.

### R1. Migrate production (you)

Run `bun run db:migrate:prod`. It reads `NEON_DATABASE_URL` from `.env`.

Expected: drizzle-kit applies one migration, `0014_outbox_retries_and_indexes`, and reports success. All three changes only add, so the live Worker keeps working.

### R2. Deploy once by hand (you say go, then you or I run it)

`bun run deploy`. The live version's `/api/health` doesn't report migrations yet, so the guard needs one deploy that does.

Afterwards, `curl -s https://pano.olbios88.workers.dev/api/health` shows `"migration":` followed by 0014's `when`, the last entry of `drizzle/meta/_journal.json`.

### R3. Push, and watch CI deploy (you push, I watch)

Push `main`. CI runs `verify` and `e2e`, then `deploy`. Its log shows:
- `Production has every migration, up to 0014_outbox_retries_and_indexes.`
- wrangler's deploy

If the deploy fails with `Authentication error [code: 10000]` naming Hyperdrive, add **Account → Hyperdrive → Read** to the token (the value stays the same), then re-run the job.

### R4. Check it (me, then you)

1. **Browser tests against the live site:** `E2E_BASE_URL=https://pano.olbios88.workers.dev bun run e2e`. Expected: `6 passed`. A run now signs in to the demo 4 times; the limit is 5 a minute.
2. **CPU:** `bunx wrangler tail pano --format json` while about 20 ordinary pages and actions load: the feed, the roadmap, a request page, `/api/me`, a vote.
   - Expected: a median `cpuTime` under 10 ms, and no `exceededCpu` outcome.
   - If it misses, the spec's fallback (caching public answers in KV) becomes the next phase's first item.
3. **By hand:**
   - Before 01:00 UTC, save a demo request's link. It still opens the next day.
   - As a guest, open `/pano`: the note shows, and New request is disabled.
   - Open a shared demo `/p/…` link signed out: the demo banner shows.

### R5. Close the issues (with your consent)

Close with a note each:
- the CPU issues: #38, #19, #20
- the demo issues: #36, #31, #28, #27, #33, #32, #30
- #3: already done on `main` before this phase
- the email issues: #25, #26
- the Phase 6 follow-ups: #42–#47
- #48
- #12, #37
- #41: done with GitHub Actions instead of Workers Builds
