# Phase 2: Posts and votes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People submit feedback requests (seeing similar ones while they type), browse a workspace's feed sorted by trending, top or new, open a post's page, and vote on posts. Votes can't drift, and the interface updates optimistically with real rollback. Shared post links unfurl with the post's title.

**Architecture:**
- **Data:** `posts` and `votes` tables. Each post stores its workspace's search language (`english` or `turkish`) and a generated `tsvector`. A SQL function, `pano_fold`, lowercases text and folds Turkish letters to ASCII, so search behaves the same under any database locale.
- **Votes:** `PUT /api/posts/:id/vote {voted}` sets the desired state. One transaction locks the post row, inserts (`on conflict do nothing`) or deletes the vote, and moves `vote_count` by the rows that actually changed.
- **Feed, similar requests and link previews:**
  - The feed is one SQL query with joins: trending is a correlated sum of decayed votes.
  - Similar requests combine full-text search ("any word") with `pg_trgm` similarity on folded titles.
  - For `/p/*`, the Worker serves the SPA shell with the post's meta tags (HTMLRewriter), before the assets layer.
- **Client:**
  - A query-key factory and an `applyOptimistic` helper (immer) that snapshots and patches every cached copy of a post.
  - `useVote` runs with a per-post mutation `scope`, so requests go one at a time and rapid clicks end in the state last clicked.
- **Display names (GitHub issue #1):** new accounts start without a name. Names are validated and change only through `PATCH /api/me`, and the submit form asks for one before a person's first post.

**Tech Stack:**
- The Phase 0 and Phase 1 stack.
- immer 11.1, sonner 2.0 and react-markdown 10.1.
- For component tests: @testing-library/react 16.3 with @testing-library/dom 10.4 and jsdom 30.

**Spec:** `docs/superpowers/specs/2026-10-16-pano-design.md`. This plan covers its "Build order → 2. Posts and votes", plus GitHub issue #1, because this phase starts showing author names publicly. Auto-subscribing authors and voters needs the subscriptions table, which arrives with Phase 4. The "vote racing a merge" test arrives with the merge service in Phase 4; this phase already makes votes refuse merged posts.

**Verified in a throwaway spike (2026-10-17):**
- **Scoped mutations (TanStack Query 5.104):**
  - A second mutation in the same `scope` runs its `onMutate` immediately and waits only for its `mutationFn`.
  - `isMutating({ mutationKey })` counts both while one is queued. The spec asked for this check before relying on it, and Task 8 pins it with a test.
- **Database locales:**
  - The local databases use the C locale, so `lower()` and `to_tsvector` leave "İ", "Ç" and "Ö" uppercase. "İptal" didn't match "iptal", and pg_trgm dropped "İ" entirely. CI's `postgres:17` image uses a UTF-8 locale.
  - `pano_fold(t)` is `translate(lower(t), 'ÇĞİÖŞÜçğıöşüÂÎÛâîû' || U&'\0307', 'cgiosucgiosuaiuaiu')`. It gives the same result under both locales.
  - ICU collations would also work, but they warn about a version mismatch on this machine, so the plan avoids them.
- **Folded full-text search:**
  - With `turkish`, "İptal edilen rezervasyonlar için bildirim" indexes as `'iptal' 'rezervasyon' 'bildir' …`.
  - "çoklu şube" and "coklu sube" both match the same post.
  - The stemmer turns a folded final "c" into "ç" ("icin" → `'iç'`). That's harmless, because queries are folded the same way.
- **Trigram typos:** `word_similarity` on folded text scores typical typos 0.64–0.70 ("darkk mod" → "Dark mode", "karanlik tema" → "Karanlık mod"), above pg_trgm's default threshold of 0.6. "exprot csv" scores only 0.39, so the similar query also ORs the words, and "csv" matches.
- **Drizzle 0.45 / drizzle-kit 0.31:**
  - `customType` for `tsvector` and `regconfig`, `.generatedAlwaysAs(sql…)`, and `index().using("gin", sql\`pano_fold(${t.title}) gin_trgm_ops\`)` generate the expected SQL.
  - The function has to exist first, in a custom migration (`db:generate --custom`).
- **Cloudflare Vite plugin:**
  - With `"binding": "ASSETS"` and `"/p/*"` in `run_worker_first`, `env.ASSETS.fetch(new URL("/", url))` returns the app shell in both `vite dev` and `vite preview`.
  - HTMLRewriter rewrites the shell, and `setInnerContent` escapes text.
  - `export default { fetch } satisfies ExportedHandler<Env>` typechecks, and the bindings drift guard still holds.
- **Component tests:**
  - Testing Library 16.3 with jsdom 30 under Vitest 5 renders React 19 and drives mutations.
  - Vitest's `include` must add `.tsx`, and each file needs `afterEach(cleanup)`, because Vitest globals are off.
  - react-markdown 10 with `skipHtml` drops `<img>` and `<script>`, and its default URL transform empties `javascript:` links.
- **Better Auth 1.7.10:**
  - `updateUser` re-sets the session cookie with the new user (`setSessionCookie`).
  - Email-code sign-in accepts an optional `name` for a new account.
  - `databaseHooks.user.update.before` receives the partial update.
- **Libraries:**
  - Hono's typed client sees the routes of two routers mounted on the same base path.
  - Hono's client calls the global `fetch` per request, so tests can stub it.
  - postgres.js prints every Postgres NOTICE with `console.log` unless `onnotice` is set. A search for only stopwords sends one.
  - use-intl's `relativeTime` reports an `ENVIRONMENT_FALLBACK` error unless it gets `now`, so components pass `useNow()`.

**Still deferred** (open GitHub issues #2–#15): the Phase 1 review minors (per-email code caps before launch, reserving `demo` and `pano`, board-name reuse, the rename flicker, the boards cap, the one-workspace race, membership counting, `safeRedirect` control characters, board positions), and Phase 0 minors 5–9.

## Global Constraints

- **Repo and branch:** `~/repos/deploys/pano`, on branch `feat/phase-2-posts-votes` from `main`.
  - The repo is public at github.com/Olbioss/pano, and CI runs on pushes to `main` and `feat/**`.
  - Nothing is pushed until the finishing step's choice.
- **Earlier phases still apply:** every Phase 0 and Phase 1 Global Constraint holds. That covers versions, local Postgres, env files, architecture rules, aliases, the envelope, style and commits, the two response formats, translatable error keys, language order, and the test database.
- **New package floors:**
  - immer `^11.1.21`, sonner `^2.0.8`, react-markdown `^10.1.0`.
  - Dev: @testing-library/react `^16.3.3`, @testing-library/dom `^10.4.2`, jsdom `^30.1.3`.
- **Size caps (spec):** titles are 3–120 characters, and bodies are at most 5000.
- **Display names:**
  - 2–50 characters, with at least two letters or digits.
  - New accounts start with `""`, never a name derived from the email. The UI shows "Anonymous" for an empty name.
  - Names change only through `PATCH /api/me`. Better Auth's `/api/auth/update-user` route is closed.
- **Votes:**
  - `PUT /api/posts/:id/vote {voted}` sends the desired state and returns `{ voted, voteCount }`.
  - One transaction locks the post (`select … for update`), inserts with `on conflict do nothing` or deletes, and moves `vote_count` by the number of rows changed.
  - A merged post answers 409 `POST_MERGED`.
  - The author's vote is counted at creation, so `vote_count` starts at 1.
  - Client: `mutationKey: ["vote", postId]` and `scope: { id: "vote:" + postId }`.
- **Rate limits:**
  - Pano's own limits are per person, with fixed windows, in `rate_limits`: creating posts 5 an hour, votes 120 an hour.
  - Like Better Auth's, they're enforced only when `ENVIRONMENT` is `production`.
- **Statuses:**
  - `open`, `under_review`, `planned`, `in_progress`, `shipped`, `closed`. Every post is `open` until Phase 4 adds status changes.
  - "Open" for similar requests means not shipped and not closed (`ACTIVE_STATUSES`).
- **Search:**
  - `search` is generated from `pano_fold(title)` (weight A) and `pano_fold(body)` (weight B) in the post's `search_config`: `english` for an `en` workspace, `turkish` for `tr`. Queries are folded the same way.
  - **Feed search:** all the words (websearch syntax), or a title close enough for pg_trgm's `%>` operator (threshold 0.6).
  - **Similar requests:** any of the words, or a close title. It returns the top 5 active, unmerged posts, ranked by `ts_rank` plus `word_similarity`.
- **Sorting:**
  - Trending counts votes from the last 30 days, each worth `0.5^(age in days / 3)`.
  - Top sorts by `vote_count`, and New by `created_at`. Ties fall back to newest first.
- **Feed paging:** `page` ≥ 1, and `limit` 1–50 (default 20).
- **Post addresses:**
  - A ref is `<id>-<slugified title>`.
  - A stale slug in `/p/<ref>` redirects: 301 from the Worker, and a `replace` navigation in the SPA.
- **Markdown:** react-markdown with `skipHtml`. Links get `target="_blank"` and `rel="nofollow ugc noopener noreferrer"`: the spec's three, plus `noreferrer`, which keeps Pano's addresses out of other sites' logs.
- **Component tests:** put `// @vitest-environment jsdom` at the top of each file and call `afterEach(cleanup)`. Everything else stays in Node.

## Review Focus

1. **Turkish, and Turkish typed without Turkish letters** ("İPTAL", "ÖZELLİK", "coklu sube"): search finds the post the same way in the local C-locale database and CI's UTF-8 one. (Task 3's `pano_fold` test; Task 6 and Task 7 search tests.)
2. **Search text that looks like query syntax** (`dark & | ! (`, a lone `"` or `-`, only stopwords like "the"): the answer is 200 with whatever matches, never a 500, and no Postgres notice in the logs. (Task 6 and Task 7 tests.)
3. **A post address that's malformed, stale or gone** (`/p/abc`, `/p/12-old-title`, `/p/999999`, `GET /api/posts/abc`):
   - The API answers 400 or 404.
   - The Worker redirects stale slugs, and answers an unknown post with the app shell and a 404.
   - The SPA shows "not found" or the current address.
   - (Task 3's `parseRef` tests, Task 4's API tests, Task 12's checks.)
4. **Hostile Markdown in a body** (raw `<script>`, `<img onerror>`, `javascript:` links): it renders without any HTML, unsafe links are emptied, and links carry `nofollow ugc noopener noreferrer`. (Task 9's Markdown test.)
5. **A vote on a post that was merged or deleted in the meantime:** 409 `POST_MERGED` or 404, never a 500, and the count still equals the rows. (Task 5 tests.)

---

### Task 1: Display names (GitHub issue #1)

**Files:**
- Modify: `shared/schemas.ts` (`displayNameSchema`, `updateMeSchema`); Test: `shared/schemas.test.ts`
- Create: `worker/lib/display-name.ts`; Test: `worker/lib/display-name.test.ts`
- Modify: `worker/auth.ts` (user hooks), `worker/app.ts` (close `/auth/update-user`), `worker/routes/me.ts` (`PATCH /api/me`)
- Modify: `worker/test/app.ts` (`updateCookie`); Test: `worker/routes/me.test.ts`

**Interfaces:**
- Consumes: Phase 1's `readSession`, `requireUser`, `validate`, `testApp`, `cookieFrom`, `key()` in `shared/schemas.ts`.
- Produces:
  - `displayNameSchema: ZodString` (2–50, at least two letters or digits) and `updateMeSchema = z.object({ name: displayNameSchema })`
  - `cleanDisplayName(raw: unknown): string`
  - `PATCH /api/me {name}` → the `Me` shape (`{ user: { id, name, email } | null, workspaces }`)
  - `updateCookie(cookie: string, res: { headers: Headers }): string` in `worker/test/app.ts`.

- [ ] **Step 1: Create the branch**

```bash
cd ~/repos/deploys/pano
git switch -c feat/phase-2-posts-votes
```

- [ ] **Step 2: Write the failing tests**

`worker/lib/display-name.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cleanDisplayName } from "./display-name";

describe("cleanDisplayName", () => {
  it.each([
    ["  Ayşe   Yılmaz  ", "Ayşe Yılmaz"],
    ["Zeynep", "Zeynep"],
    ["İsmail\tÇelik", "İsmail Çelik"],
  ])("keeps %j as %j", (raw, name) => {
    expect(cleanDisplayName(raw)).toBe(name);
  });

  it.each(["   ", "!!", "a", 42, undefined])("drops %j", (raw) => {
    expect(cleanDisplayName(raw)).toBe("");
  });

  it("caps a long name at 50 characters", () => {
    expect(cleanDisplayName("a".repeat(80))).toBe("a".repeat(50));
  });

  it("doesn't cut an emoji in half", () => {
    expect(cleanDisplayName(`${"a".repeat(49)}😀`)).toBe("a".repeat(49));
  });
});
```

In `shared/schemas.test.ts`, add `displayNameSchema` to the import list, then append:

```ts
describe("displayNameSchema", () => {
  it.each(["Al", "Ayşe Yılmaz"])("accepts %s", (name) => {
    expect(displayNameSchema.safeParse(name).success).toBe(true);
  });

  it("refuses a name with fewer than two letters or digits", () => {
    expect(messages(displayNameSchema.safeParse("!!"))).toEqual([
      "NAME_NEEDS_LETTERS",
    ]);
  });

  it("refuses a name over 50 characters", () => {
    expect(displayNameSchema.safeParse("a".repeat(51)).success).toBe(false);
  });
});
```

In `worker/routes/me.test.ts`, change the `../test/app` import to:

```ts
import {
  cookieFrom,
  ORIGIN,
  testApp,
  uniqueEmail,
  updateCookie,
} from "../test/app";
```

In the existing test "signs a new user in with the emailed code", change
`name: email.split("@")[0]` to `name: ""`: new accounts no longer take
the email's local part.

Then append this block at the end of the file:

```ts
describe("display names", () => {
  async function signInNamed(t: ReturnType<typeof testApp>, name: string) {
    const email = uniqueEmail();
    await t.sendCode(email);
    const res = await t.post("/api/auth/sign-in/email-otp", {
      email,
      otp: t.lastCode(email),
      name,
    });
    return cookieFrom(res);
  }

  const nameOf = async (t: ReturnType<typeof testApp>, cookie: string) => {
    const res = await t.client.api.me.$get(undefined, { headers: { cookie } });
    const body = (await res.json()) as { data: { user: { name: string } } };
    return body.data.user.name;
  };

  it("starts a new account without a name", async () => {
    const t = testApp();
    const { cookie } = await t.signIn();
    expect(await nameOf(t, cookie)).toBe("");
    await t.settle();
  });

  it("keeps a real name sent at sign-in, tidied up", async () => {
    const t = testApp();
    const cookie = await signInNamed(t, "  Ayşe   Yılmaz ");
    expect(await nameOf(t, cookie)).toBe("Ayşe Yılmaz");
    await t.settle();
  });

  it("drops a blank name sent at sign-in", async () => {
    const t = testApp();
    const cookie = await signInNamed(t, "   ");
    expect(await nameOf(t, cookie)).toBe("");
    await t.settle();
  });

  it("renames the person, and the session shows it at once", async () => {
    const t = testApp();
    const { cookie } = await t.signIn();
    const res = await t.client.api.me.$patch(
      { json: { name: "Ayşe" } },
      { headers: { cookie } }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      data: { user: { name: "Ayşe" } },
    });
    expect(await nameOf(t, updateCookie(cookie, res))).toBe("Ayşe");
    await t.settle();
  });

  it("refuses a name without two letters or digits", async () => {
    const t = testApp();
    const { cookie } = await t.signIn();
    const res = await t.client.api.me.$patch(
      { json: { name: "!!" } },
      { headers: { cookie } }
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "BAD_REQUEST",
      fields: { name: "NAME_NEEDS_LETTERS" },
    });
    await t.settle();
  });

  it("needs a signed-in user to rename", async () => {
    const t = testApp();
    const res = await t.client.api.me.$patch({ json: { name: "Ayşe" } });
    expect(res.status).toBe(401);
    await t.settle();
  });

  it("closes Better Auth's own update-user route", async () => {
    const t = testApp();
    const { cookie } = await t.signIn();
    const res = await t.request("/api/auth/update-user", {
      method: "POST",
      headers: { cookie, origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ name: "x".repeat(500) }),
    });
    expect(res.status).toBe(404);
    await t.settle();
  });
});
```

In `worker/test/app.ts`, add this export below `cookieFrom` (the tests above need it to import):

```ts
/** `cookie` with whatever `res` set replaced, the way a browser keeps them. */
export function updateCookie(cookie: string, res: { headers: Headers }) {
  const jar = new Map<string, string>();
  const add = (pair: string) => {
    const at = pair.indexOf("=");
    if (at > 0) jar.set(pair.slice(0, at), pair.slice(at + 1));
  };
  for (const pair of cookie.split("; ")) add(pair);
  for (const set of res.headers.getSetCookie()) add(set.split(";")[0] ?? "");
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}
```

- [ ] **Step 3: Run them to verify they fail**

Run: `bun run test worker/lib/display-name.test.ts shared/schemas.test.ts worker/routes/me.test.ts`

Expected: FAIL.
- `display-name.test.ts` can't import `./display-name`.
- The `displayNameSchema` tests throw `TypeError` (`displayNameSchema` is undefined).
- In `me.test.ts`:
  - "starts a new account without a name" and the edited "signs a new user in with the emailed code" both receive the email's local part.
  - The two sign-in-name tests receive the raw names.
  - The `PATCH` tests get 404 instead of 200, 400 and 401.
  - The update-user test gets 200 instead of 404.
  - The other earlier `me.test.ts` tests still pass.

- [ ] **Step 4: Add the schema and the cleaner**

In `shared/schemas.ts`, add after `localeSchema`:

```ts
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/gu;

/** How a person appears next to their posts and comments. */
export const displayNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(50)
  .refine(
    (name) => (name.match(LETTER_OR_DIGIT)?.length ?? 0) >= 2,
    key("NAME_NEEDS_LETTERS")
  );

export const updateMeSchema = z.object({ name: displayNameSchema });
```

`worker/lib/display-name.ts`:

```ts
import { displayNameSchema } from "@/shared/schemas";

/**
 * A display name as Pano stores it: trimmed, runs of whitespace collapsed,
 * at most 50 characters, or "" when what's left isn't a usable name. Better
 * Auth passes whatever a client sends at sign-in through this.
 */
export function cleanDisplayName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let name = raw.trim().replace(/\s+/g, " ").slice(0, 50);
  // Don't leave half of an emoji (a lone high surrogate) at the cut.
  const last = name.charCodeAt(name.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) name = name.slice(0, -1);
  name = name.trim();
  return displayNameSchema.safeParse(name).success ? name : "";
}
```

- [ ] **Step 5: Clean names in Better Auth, close its update route, add `PATCH /api/me`**

In `worker/auth.ts`, import the cleaner:

```ts
import { cleanDisplayName } from "./lib/display-name";
```

Then replace the whole `databaseHooks` block with:

```ts
    databaseHooks: {
      user: {
        create: {
          // Sign-in may carry a name for a new account. Keep it only if it's
          // a usable name; otherwise start empty, and the submit form asks.
          // (Phase 1 used the email's local part, which leaked it publicly.)
          async before(user) {
            return { data: { ...user, name: cleanDisplayName(user.name) } };
          },
        },
        update: {
          async before(user) {
            if (user.name === undefined) return;
            return { data: { ...user, name: cleanDisplayName(user.name) } };
          },
        },
      },
    },
```

In `worker/app.ts`, add this line right after `.all("/auth/organization/*", (c) => c.notFound())`:

```ts
    // Names change through PATCH /me, which validates them.
    .all("/auth/update-user", (c) => c.notFound())
```

`worker/routes/me.ts` (full replacement):

```ts
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { SuccessResponse } from "@/shared/envelope";
import { updateMeSchema } from "@/shared/schemas";
import type { Database } from "../db/client";
import { member, organization } from "../db/schema";
import type { AppEnv } from "../env";
import { cleanDisplayName } from "../lib/display-name";
import { validate } from "../lib/validate";
import { readSession, requireUser } from "../middleware/session";

type Me = {
  user: { id: string; name: string; email: string } | null;
  workspaces: { id: string; slug: string; name: string; role: string }[];
};

function workspacesOf(db: Database, userId: string) {
  return db
    .select({
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId))
    .orderBy(asc(organization.createdAt));
}

/** Who's signed in, the workspaces where they're on the team, and renaming. */
export const meRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const session = await readSession(c);
    if (!session) {
      return c.json<SuccessResponse<Me>>({
        success: true,
        data: { user: null, workspaces: [] },
      });
    }
    const { id, name, email } = session.user;
    return c.json<SuccessResponse<Me>>({
      success: true,
      data: {
        user: { id, name, email },
        workspaces: await workspacesOf(c.var.db, id),
      },
    });
  })
  .patch("/", requireUser, validate("json", updateMeSchema), async (c) => {
    const name = cleanDisplayName(c.req.valid("json").name);
    // Through Better Auth, so the session's cached copy of the user is
    // rewritten too; its cookie goes back with this response.
    const { headers } = await c.var.auth.api.updateUser({
      body: { name },
      headers: c.req.raw.headers,
      returnHeaders: true,
    });
    for (const cookie of headers.getSetCookie()) {
      c.header("set-cookie", cookie, { append: true });
    }
    const { id, email } = c.var.user;
    return c.json<SuccessResponse<Me>>({
      success: true,
      data: {
        user: { id, name, email },
        workspaces: await workspacesOf(c.var.db, id),
      },
    });
  });
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun run test`
Expected: PASS. 23 test files, 159 tests.

- [ ] **Step 7: Lint and commit**

```bash
bun run typecheck
bun run check:fix
bun run check
bun run test
git add shared/schemas.ts shared/schemas.test.ts worker/lib/display-name.ts worker/lib/display-name.test.ts worker/auth.ts worker/app.ts worker/routes/me.ts worker/routes/me.test.ts worker/test/app.ts
git commit -m "feat: validated display names, changed only through PATCH /api/me" -m "New accounts no longer take the email's local part as their name. Closes #1." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: everything passes. 23 test files, 159 tests.

---

### Task 2: Per-person rate limits

**Files:**
- Create: `worker/db/schema/rate-limits.ts`; Modify: `worker/db/schema/index.ts`
- Generated: `drizzle/0004_rate_limits.sql`, `drizzle/meta/*`
- Create: `worker/lib/rate-limit.ts`; Test: `worker/lib/rate-limit.test.ts`
- Create: `worker/middleware/rate-limit.ts`
- Create: `worker/test/db.ts`

**Interfaces:**
- Consumes: `createDb`, `assertLocalDatabaseUrl`, `AppError`, `UserEnv`, the generated `user` table.
- Produces:
  - `rateLimits` table: `(user_id, bucket, window_start)` primary key, plus `count`.
  - `checkRateLimit(db: Database, input: { userId: string; bucket: string; limit: number; windowSeconds: number; now?: number }): Promise<boolean>`
  - `rateLimit(bucket: string, limit: number, windowSeconds: number)`: Hono middleware for `UserEnv` that runs after `requireUser`. It's enforced only in production and throws `AppError(429, "RATE_LIMITED")`. Task 4 tests it through a route.
  - `testDb(): { db, close }`: a direct client on the local test database.

- [ ] **Step 1: Write the failing test**

`worker/test/db.ts` (a helper the test needs):

```ts
import { createDb } from "../db/client";
import { assertLocalDatabaseUrl } from "./local-db";

/** A direct client on the test database, for setting up and checking rows. */
export function testDb() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  assertLocalDatabaseUrl(url);
  return createDb(url);
}
```

`worker/lib/rate-limit.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test worker/lib/rate-limit.test.ts`
Expected: FAIL. The file can't import `./rate-limit`.

- [ ] **Step 3: Add the table and generate its migration**

`worker/db/schema/rate-limits.ts`:

```ts
import {
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Pano's own per-person limits, one row per fixed window (AskDocs' limiter).
 * Better Auth keeps its per-IP sign-in limits in its own rate_limit table.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    bucket: text("bucket").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.bucket, table.windowStart] }),
  ]
);
```

In `worker/db/schema/index.ts`, add the export after the `./boards` line:

```ts
export * from "./rate-limits";
```

Run: `bun run db:generate --name rate_limits`

Expected: it writes `drizzle/0004_rate_limits.sql` with `CREATE TABLE "rate_limits"`, the primary key `"rate_limits_user_id_bucket_window_start_pk"`, and a foreign key to `"user"("id")` with `ON DELETE cascade`.

- [ ] **Step 4: Add the limiter and its middleware**

`worker/lib/rate-limit.ts`:

```ts
import { sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { rateLimits } from "../db/schema";

/**
 * Fixed-window counter in Postgres: one upsert bumps this window's count,
 * then compares it with the limit. If the counter fails, the request goes
 * through rather than the API going down.
 */
export async function checkRateLimit(
  db: Database,
  input: {
    userId: string;
    bucket: string;
    limit: number;
    windowSeconds: number;
    now?: number;
  }
): Promise<boolean> {
  const windowMs = input.windowSeconds * 1000;
  const now = input.now ?? Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  try {
    const [row] = await db
      .insert(rateLimits)
      .values({
        userId: input.userId,
        bucket: input.bucket,
        windowStart,
        count: 1,
      })
      .onConflictDoUpdate({
        target: [rateLimits.userId, rateLimits.bucket, rateLimits.windowStart],
        set: { count: sql`${rateLimits.count} + 1` },
      })
      .returning({ count: rateLimits.count });
    return (row?.count ?? 1) <= input.limit;
  } catch (err) {
    console.error("rate limit check failed, allowing the request:", err);
    return true;
  }
}
```

`worker/middleware/rate-limit.ts`:

```ts
import { createMiddleware } from "hono/factory";
import { AppError } from "../lib/errors";
import { checkRateLimit } from "../lib/rate-limit";
import type { UserEnv } from "./session";

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
      const allowed = await checkRateLimit(c.var.db, {
        userId: c.var.user.id,
        bucket,
        limit,
        windowSeconds,
      });
      if (!allowed) {
        throw new AppError(429, "RATE_LIMITED", "Too many requests");
      }
    }
    await next();
  });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test`
Expected: PASS. 24 test files, 163 tests. The test run applies `0004_rate_limits.sql` to `pano_test` itself.

- [ ] **Step 6: Migrate the dev database, lint, and commit**

```bash
bun run db:migrate
bun run typecheck
bun run check:fix
bun run check
bun run test
git add worker/db/schema/rate-limits.ts worker/db/schema/index.ts drizzle worker/lib/rate-limit.ts worker/lib/rate-limit.test.ts worker/middleware/rate-limit.ts worker/test/db.ts
git commit -m "feat: per-person fixed-window rate limits in Postgres" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `db:migrate` ends with "migrations applied successfully!", and everything passes. 24 test files, 163 tests.

---

### Task 3: Posts and votes schema, search folding, shared post types

**Files:**
- Create: `shared/status.ts`, `shared/posts.ts`
- Create: `shared/ref.ts`; Test: `shared/ref.test.ts`
- Create: `shared/excerpt.ts`; Test: `shared/excerpt.test.ts`
- Modify: `shared/schemas.ts`; Test: `shared/schemas.test.ts`
- Modify: `shared/envelope.ts` (`POST_MERGED`), `shared/field-errors.ts` (`BOARD_UNKNOWN`), `src/i18n/messages/en.json`, `src/i18n/messages/tr.json`
- Create: `worker/db/schema/posts.ts`; Modify: `worker/db/schema/index.ts`
- Create (hand-written custom migration): `drizzle/0005_search_fold.sql`
- Generated: `drizzle/0006_posts.sql`, `drizzle/meta/*`
- Test: `worker/db/search.test.ts`

**Interfaces:**
- Consumes: `slugify` (`shared/slug.ts`), `key()` in `shared/schemas.ts`, the `organization`, `user` and `boards` tables, `testDb()`.
- Produces:
  - `POST_STATUSES`, `type PostStatus`, `ACTIVE_STATUSES` (`shared/status.ts`)
  - `postRef(id: number, title: string): string` and `parseRef(ref: string): number | null` (`shared/ref.ts`)
  - `excerpt(text: string, max = 160): string` (`shared/excerpt.ts`)
  - `type PostSummary`, `type PostDetail`, `type FeedPage`, `type VoteResult` (`shared/posts.ts`)
  - Schemas: `postTitleSchema`, `postBodySchema`, `createPostSchema`, `postFormSchema`, `updatePostSchema`, `voteSchema`, `FEED_SORTS`, `type FeedSort`, `feedQuerySchema`, `similarQuerySchema`
  - Tables: `posts` and `votes`, plus `type SearchConfig = "english" | "turkish"`
  - The SQL function `pano_fold(text) → text`
  - `ApiErrorCode` gains `"POST_MERGED"`, and `FieldErrorKey` gains `"BOARD_UNKNOWN"`.

- [ ] **Step 1: Write the failing tests**

`shared/ref.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseRef, postRef } from "./ref";

describe("postRef", () => {
  it.each([
    [123, "Dark mode!", "123-dark-mode"],
    [5, "Özellik İstekleri", "5-ozellik-istekleri"],
    [7, "!!!", "7"],
  ])("makes %i and %j into %j", (id, title, ref) => {
    expect(postRef(id, title)).toBe(ref);
  });
});

describe("parseRef", () => {
  it.each([
    ["123-dark-mode", 123],
    ["123", 123],
    ["7-", 7],
  ])("reads %j as %i", (ref, id) => {
    expect(parseRef(ref)).toBe(id);
  });

  it.each(["abc", "0-dark", "12abc", "-5", "", "1234567890123456"])(
    "refuses %j",
    (ref) => {
      expect(parseRef(ref)).toBeNull();
    }
  );
});
```

`shared/excerpt.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { excerpt } from "./excerpt";

describe("excerpt", () => {
  it("drops Markdown markers and keeps link text", () => {
    expect(
      excerpt("Use **bold**, `code` and [a link](https://example.com).")
    ).toBe("Use bold, code and a link.");
  });

  it("collapses whitespace", () => {
    expect(excerpt("one\n\n two\tthree")).toBe("one two three");
  });

  it("leaves short text whole", () => {
    expect(excerpt("Short.", 10)).toBe("Short.");
  });

  it("cuts long text at a word and marks the cut", () => {
    expect(excerpt("alpha beta gamma delta", 15)).toBe("alpha beta…");
  });
});
```

In `shared/schemas.test.ts`, add `createPostSchema`, `feedQuerySchema`, `similarQuerySchema`, `updatePostSchema` and `voteSchema` to the import list, then append:

```ts
const BOARD = "0b3f5c1e-8f5a-4c3e-9a51-2b7d0c9e4f11";

describe("createPostSchema", () => {
  it("accepts a post with an empty body", () => {
    const input = { boardId: BOARD, title: "Dark mode", body: "" };
    expect(createPostSchema.safeParse(input).success).toBe(true);
  });

  it("refuses a title under 3 characters", () => {
    const input = { boardId: BOARD, title: " ab ", body: "" };
    expect(createPostSchema.safeParse(input).success).toBe(false);
  });

  it("refuses a body over 5000 characters", () => {
    const input = { boardId: BOARD, title: "Dark mode", body: "x".repeat(5001) };
    expect(createPostSchema.safeParse(input).success).toBe(false);
  });
});

describe("updatePostSchema", () => {
  it("needs at least one change", () => {
    expect(messages(updatePostSchema.safeParse({}))).toEqual([
      "NOTHING_TO_UPDATE",
    ]);
  });
});

describe("feedQuerySchema", () => {
  it("fills in the defaults", () => {
    expect(feedQuerySchema.parse({})).toEqual({
      sort: "trending",
      page: 1,
      limit: 20,
    });
  });

  it.each([{ page: "0" }, { limit: "51" }, { sort: "hot" }])(
    "refuses %j",
    (query) => {
      expect(feedQuerySchema.safeParse(query).success).toBe(false);
    }
  );
});

describe("similarQuerySchema", () => {
  it("refuses a one-letter query", () => {
    expect(similarQuerySchema.safeParse({ q: "a" }).success).toBe(false);
  });
});

describe("voteSchema", () => {
  it("takes only true or false", () => {
    expect(voteSchema.safeParse({ voted: "yes" }).success).toBe(false);
  });
});
```

`worker/db/search.test.ts`:

```ts
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { testDb } from "../test/db";
import { boards, organization, posts } from "./schema";

const { db, close } = testDb();
afterAll(() => close());

describe("search columns", () => {
  it("folds case and Turkish letters the same in any locale", async () => {
    const [row] = await db.execute<{ folded: string }>(
      sql`select pano_fold('İPTAL Işık ÇĞÖŞÜ') as folded`
    );
    expect(row?.folded).toBe("iptal isik cgosu");
  });

  it("stems a post in its workspace's language", async () => {
    const orgId = crypto.randomUUID();
    await db.insert(organization).values({
      id: orgId,
      name: "Arama",
      slug: `arama-${orgId.slice(0, 8)}`,
      createdAt: new Date(),
    });
    const [board] = await db
      .insert(boards)
      .values({ organizationId: orgId, slug: "istekler", name: "İstekler" })
      .returning({ id: boards.id });
    const [post] = await db
      .insert(posts)
      .values({
        organizationId: orgId,
        boardId: board!.id,
        title: "İptal edilen rezervasyonlar",
        body: "Çoklu şube",
        searchConfig: "turkish",
      })
      .returning({ search: posts.search });
    expect(post?.search).toContain("'rezervasyon'");
    expect(post?.search).toContain("'sube'");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test shared worker/db/search.test.ts`

Expected: FAIL.
- `ref.test.ts` and `excerpt.test.ts` can't import their modules.
- The new schema tests throw `TypeError` (the schemas are undefined).
- `search.test.ts` fails because `posts` isn't exported. The `pano_fold` test fails with `function pano_fold(unknown) does not exist`.
- The existing shared tests still pass.

- [ ] **Step 3: Add the shared modules**

`shared/status.ts`:

```ts
export const POST_STATUSES = [
  "open",
  "under_review",
  "planned",
  "in_progress",
  "shipped",
  "closed",
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

/** Still collecting votes: what "open" means for similar requests. */
export const ACTIVE_STATUSES = [
  "open",
  "under_review",
  "planned",
  "in_progress",
] as const satisfies readonly PostStatus[];
```

`shared/ref.ts`:

```ts
import { slugify } from "./slug";

/** A post's address segment: its id, then its title as a slug. */
export function postRef(id: number, title: string): string {
  const slug = slugify(title);
  return slug ? `${id}-${slug}` : String(id);
}

/** The post id at the start of a ref, or null when there isn't a valid one. */
export function parseRef(ref: string): number | null {
  const match = /^(\d{1,15})(?:-|$)/.exec(ref);
  if (!match) return null;
  const id = Number(match[1]);
  return id > 0 ? id : null;
}
```

`shared/excerpt.ts`:

```ts
// A Markdown link or image (keep its text), or a formatting marker (drop it).
const MARKDOWN = /!?\[([^\]]*)\]\([^)]*\)|[*_`#>~]/g;

/** Plain text for previews: Markdown removed, whitespace collapsed, cut at a word. */
export function excerpt(text: string, max = 160): string {
  const plain = text
    .replace(MARKDOWN, (_match, label?: string) => label ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
```

`shared/posts.ts`:

```ts
import type { Locale } from "./locale";
import type { PostStatus } from "./status";

/** A post as feeds and lists show it. */
export type PostSummary = {
  id: number;
  /** "123-dark-mode": the post's address segment under /p/. */
  ref: string;
  title: string;
  excerpt: string;
  status: PostStatus;
  voteCount: number;
  /** Whether the person asking has voted; always false when signed out. */
  voted: boolean;
  board: { slug: string; name: string };
  /** null once the author's account is gone; name is "" until they pick one. */
  author: { name: string } | null;
  createdAt: string;
};

export type PostDetail = PostSummary & {
  body: string;
  workspace: { slug: string; name: string; defaultLocale: Locale };
  /** The person asking wrote it or is on the workspace's team. */
  canEdit: boolean;
};

export type FeedPage = { items: PostSummary[]; page: number; hasMore: boolean };

export type VoteResult = { voted: boolean; voteCount: number };
```

In `shared/schemas.ts`, add this import below the existing ones:

```ts
import { POST_STATUSES } from "./status";
```

Then append:

```ts
export const postTitleSchema = z.string().trim().min(3).max(120);
export const postBodySchema = z.string().trim().max(5000);

export const createPostSchema = z.object({
  boardId: z.uuid(),
  title: postTitleSchema,
  body: postBodySchema,
});

/** The edit form always sends both fields; the PATCH route accepts either. */
export const postFormSchema = z.object({
  title: postTitleSchema,
  body: postBodySchema,
});

export const updatePostSchema = z
  .object({
    title: postTitleSchema.optional(),
    body: postBodySchema.optional(),
  })
  .refine(
    (update) => update.title !== undefined || update.body !== undefined,
    key("NOTHING_TO_UPDATE")
  );

export const voteSchema = z.object({ voted: z.boolean() });

export const FEED_SORTS = ["trending", "top", "new"] as const;
export type FeedSort = (typeof FEED_SORTS)[number];

export const feedQuerySchema = z.object({
  board: z.string().max(40).optional(),
  sort: z.enum(FEED_SORTS).default("trending"),
  status: z.enum(POST_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const similarQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
  board: z.string().max(40).optional(),
});
```

In `shared/envelope.ts`, add `| "POST_MERGED"` after `| "WORKSPACE_LIMIT"` in `ApiErrorCode`.

In `shared/field-errors.ts`, add `"BOARD_UNKNOWN",` after `"BOARD_EXISTS",` in `FIELD_ERROR_KEYS`.

Both catalogs need the new keys. Typecheck catches a code without an `errors` message, and the parity test catches one language without the other.
- In `src/i18n/messages/en.json`:
  - add `"POST_MERGED": "This request was merged into another one."` to `errors`
  - add `"BOARD_UNKNOWN": "Pick one of this workspace's boards."` to `fieldErrors`.
- In `src/i18n/messages/tr.json`:
  - add `"POST_MERGED": "Bu istek başka bir istekle birleştirildi."` to `errors`
  - add `"BOARD_UNKNOWN": "Bu çalışma alanının panolarından birini seçin."` to `fieldErrors`.

- [ ] **Step 4: Add the tables and the two migrations**

`worker/db/schema/posts.ts`:

```ts
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  check,
  customType,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
// Relative, not @/shared: drizzle-kit reads this file without the alias.
import { POST_STATUSES } from "../../../shared/status";
import { organization, user } from "./auth";
import { boards } from "./boards";

/** Postgres text-search types Drizzle has no builder for. */
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });
export type SearchConfig = "english" | "turkish";
const regconfig = customType<{ data: SearchConfig }>({
  dataType: () => "regconfig",
});

export const posts = pgTable(
  "posts",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    // Kept when the account goes; the post then shows no author.
    authorId: text("author_id").references(() => user.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    status: text("status", { enum: POST_STATUSES }).notNull().default("open"),
    voteCount: integer("vote_count").notNull().default(0),
    // Set by a team merge (Phase 4). Votes refuse merged posts.
    mergedIntoId: bigint("merged_into_id", { mode: "number" }).references(
      (): AnyPgColumn => posts.id,
      { onDelete: "set null" }
    ),
    // The workspace's language when the post was written; search stems in it.
    searchConfig: regconfig("search_config").notNull(),
    search: tsvector("search").generatedAlwaysAs(
      sql`setweight(to_tsvector(search_config, pano_fold(title)), 'A') || setweight(to_tsvector(search_config, pano_fold(body)), 'B')`
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("posts_board_created_idx").on(table.boardId, table.createdAt),
    index("posts_organization_created_idx").on(
      table.organizationId,
      table.createdAt
    ),
    index("posts_organization_votes_idx").on(
      table.organizationId,
      table.voteCount
    ),
    index("posts_search_idx").using("gin", table.search),
    index("posts_title_trgm_idx").using(
      "gin",
      sql`pano_fold(${table.title}) gin_trgm_ops`
    ),
    check("posts_vote_count_check", sql`${table.voteCount} >= 0`),
    check(
      "posts_status_check",
      sql`${table.status} in ('open', 'under_review', 'planned', 'in_progress', 'shipped', 'closed')`
    ),
  ]
);

export const votes = pgTable(
  "votes",
  {
    postId: bigint("post_id", { mode: "number" })
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.userId] }),
    index("votes_created_idx").on(table.createdAt),
  ]
);
```

In `worker/db/schema/index.ts`, add after the `./boards` line:

```ts
export * from "./posts";
```

The generated `search` column calls `pano_fold`, so the function needs its own, earlier migration. Run:

```bash
bun run db:generate --custom --name search_fold
```

Expected: it creates `drizzle/0005_search_fold.sql`, containing only a placeholder comment. Replace its whole content with:

```sql
-- Lowercases and folds Turkish letters to ASCII, the same way in every
-- database locale: local Postgres runs with C, CI and Neon with UTF-8. So
-- "İptal", "iptal" and "IPTAL" match, and so do "şube" and "sube".
CREATE OR REPLACE FUNCTION pano_fold(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
RETURN translate(lower(t), 'ÇĞİÖŞÜçğıöşüÂÎÛâîû' || U&'\0307', 'cgiosucgiosuaiuaiu');
```

Then generate the tables:

```bash
bun run db:generate --name posts
```

Expected: it writes `drizzle/0006_posts.sql`. The file contains:
- `CREATE TABLE "posts"` with `"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY`, `"search_config" "regconfig" NOT NULL`, and `"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector(search_config, pano_fold(title)), 'A') || …) STORED`
- `CREATE TABLE "votes"` with `PRIMARY KEY("post_id","user_id")`
- the five indexes, including `USING gin (pano_fold("title") gin_trgm_ops)`
- both checks.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test`
Expected: PASS. 27 test files, 191 tests. The test run applies 0005 and 0006 to `pano_test`.

- [ ] **Step 6: Migrate the dev database, lint, and commit**

```bash
bun run db:migrate
bun run typecheck
bun run check:fix
bun run check
bun run test
git add shared src/i18n/messages worker/db/schema/posts.ts worker/db/schema/index.ts worker/db/search.test.ts drizzle
git commit -m "feat: posts and votes tables with locale-proof Turkish search" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: "migrations applied successfully!", and everything passes. 27 test files, 191 tests.

---

### Task 4: Posts API (create, read, edit, delete)

**Files:**
- Create: `worker/services/search.ts`, `worker/services/posts.ts`, `worker/routes/posts.ts`
- Modify: `worker/routes/workspaces.ts` (export `findWorkspace`), `worker/middleware/session.ts` (`readViewerId`), `worker/app.ts` (mount the routers)
- Create: `worker/test/fixtures.ts`; Test: `worker/routes/posts.test.ts`

**Interfaces:**
- Consumes:
  - From Task 3: `posts`, `votes`, `SearchConfig`, `PostSummary`, `PostDetail`, `postRef`, `excerpt`, `createPostSchema`, `updatePostSchema`.
  - From Task 2: `rateLimit`, `testDb()`.
  - From Phase 1: `findWorkspace`, `requireUser`, `readSession`.
- Produces:
  - `searchConfigFor(locale: Locale): SearchConfig`
  - `postColumns(viewerId: string | null)` and `toSummary(row: PostRow): PostSummary`. The feed and similar queries reuse these; the board and author joins they need are `innerJoin(boards, …)` and `leftJoin(users, …)`.
  - `findPostDetail(db, id: number, viewerId: string | null): Promise<PostDetail | null>`
  - `boardInWorkspace(db, boardId: string, workspaceId: string): Promise<boolean>`
  - `createPost(db, { workspaceId, locale, boardId, authorId, title, body }): Promise<number>`
  - `requireCanEdit(db, id: number, userId: string): Promise<void>`, which throws 404 or 403
  - `updatePost(db, id, { title?, body? })` and `deletePost(db, id)`
  - `readViewerId(c): Promise<string | null>`
  - Routes:
    - `POST /api/workspaces/:slug/posts` returns 201 with `PostDetail`
    - `GET /api/posts/:id` returns `PostDetail`
    - `PATCH /api/posts/:id` returns `PostDetail`
    - `DELETE /api/posts/:id` returns `{ id }`
  - Routers: `workspacePostRoutes`, mounted at `/workspaces`, and `postRoutes`, mounted at `/posts`.
  - Test fixtures: `setupWorkspace(t, { defaultLocale?, boards? }) → { owner, slug, boards }` and `submitPost(t, cookie, slug, { boardId, title, body? }) → PostDetail`.

- [ ] **Step 1: Write the fixtures and the failing tests**

`worker/test/fixtures.ts`:

```ts
import type { Locale } from "@/shared/locale";
import type { testApp } from "./app";

type TestApp = ReturnType<typeof testApp>;
type Board = { id: string; slug: string; name: string; position: number };

export const uniqueSlug = (prefix = "ws") =>
  `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

/** A new owner with a workspace and boards, made through the real API. */
export async function setupWorkspace(
  t: TestApp,
  {
    defaultLocale = "en",
    boards = ["Features"],
  }: { defaultLocale?: Locale; boards?: string[] } = {}
) {
  const owner = await t.signIn();
  const slug = uniqueSlug();
  const created = await t.client.api.workspaces.$post(
    { json: { name: "Acme", slug, defaultLocale } },
    { headers: { cookie: owner.cookie } }
  );
  if (created.status !== 201) {
    throw new Error(`workspace setup failed: ${created.status}`);
  }
  const made: Board[] = [];
  for (const name of boards) {
    const res = await t.client.api.workspaces[":slug"].boards.$post(
      { param: { slug }, json: { name } },
      { headers: { cookie: owner.cookie } }
    );
    const body = await res.json();
    if (!body.success) throw new Error(`board setup failed: ${body.error}`);
    made.push(body.data);
  }
  return { owner, slug, boards: made };
}

/** Posts through the API as `cookie` and returns the new post. */
export async function submitPost(
  t: TestApp,
  cookie: string,
  slug: string,
  input: { boardId: string; title: string; body?: string }
) {
  const res = await t.client.api.workspaces[":slug"].posts.$post(
    { param: { slug }, json: { body: "", ...input } },
    { headers: { cookie } }
  );
  const body = await res.json();
  if (!body.success) throw new Error(`post failed: ${body.error}`);
  return body.data;
}
```

`worker/routes/posts.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { posts } from "../db/schema";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import { setupWorkspace, submitPost } from "../test/fixtures";

const { db, close } = testDb();
afterAll(() => close());

type TestApp = ReturnType<typeof testApp>;

const create = (
  t: TestApp,
  cookie: string | undefined,
  slug: string,
  json: { boardId: string; title: string; body: string }
) =>
  t.client.api.workspaces[":slug"].posts.$post(
    { param: { slug }, json },
    cookie ? { headers: { cookie } } : undefined
  );

const getPost = (t: TestApp, id: number, cookie?: string) =>
  t.client.api.posts[":id"].$get(
    { param: { id: String(id) } },
    cookie ? { headers: { cookie } } : undefined
  );

describe("POST /api/workspaces/:slug/posts", () => {
  it("creates a post its author has already voted for", async () => {
    const t = testApp();
    const { slug, boards } = await setupWorkspace(t);
    const member = await t.signIn();
    const res = await create(t, member.cookie, slug, {
      boardId: boards[0]!.id,
      title: "Dark mode",
      body: "Please add a **dark** theme.",
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      success: true,
      data: {
        ref: expect.stringMatching(/^\d+-dark-mode$/),
        title: "Dark mode",
        body: "Please add a **dark** theme.",
        excerpt: "Please add a dark theme.",
        status: "open",
        voteCount: 1,
        voted: true,
        canEdit: true,
        author: { name: "" },
        board: { slug: "features", name: "Features" },
        workspace: { slug, defaultLocale: "en" },
      },
    });
    await t.settle();
  });

  it("searches it in the workspace's language", async () => {
    const t = testApp();
    const { owner, slug, boards } = await setupWorkspace(t, {
      defaultLocale: "tr",
      boards: ["İstekler"],
    });
    const post = await submitPost(t, owner.cookie, slug, {
      boardId: boards[0]!.id,
      title: "Karanlık mod",
    });
    const [row] = await db
      .select({ searchConfig: posts.searchConfig })
      .from(posts)
      .where(eq(posts.id, post.id));
    expect(row?.searchConfig).toBe("turkish");
    await t.settle();
  });

  it("needs a signed-in user", async () => {
    const t = testApp();
    const { slug, boards } = await setupWorkspace(t);
    const res = await create(t, undefined, slug, {
      boardId: boards[0]!.id,
      title: "Dark mode",
      body: "",
    });
    expect(res.status).toBe(401);
    await t.settle();
  });

  it("refuses a board from another workspace", async () => {
    const t = testApp();
    const here = await setupWorkspace(t);
    const there = await setupWorkspace(t);
    const res = await create(t, here.owner.cookie, here.slug, {
      boardId: there.boards[0]!.id,
      title: "Dark mode",
      body: "",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "BAD_REQUEST",
      fields: { boardId: "BOARD_UNKNOWN" },
    });
    await t.settle();
  });

  it("refuses a title shorter than three characters", async () => {
    const t = testApp();
    const { owner, slug, boards } = await setupWorkspace(t);
    const res = await create(t, owner.cookie, slug, {
      boardId: boards[0]!.id,
      title: "ab",
      body: "",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      fields: { title: expect.any(String) },
    });
    await t.settle();
  });

  it("answers 404 for an unknown workspace", async () => {
    const t = testApp();
    const { owner, boards } = await setupWorkspace(t);
    const res = await create(t, owner.cookie, "no-such-workspace", {
      boardId: boards[0]!.id,
      title: "Dark mode",
      body: "",
    });
    expect(res.status).toBe(404);
    await t.settle();
  });

  it("allows five posts an hour per person in production", async () => {
    // Sign in through a dev app: production also limits code requests per IP.
    const dev = testApp();
    const { slug, boards } = await setupWorkspace(dev);
    const member = await dev.signIn();
    const prod = testApp({ ENVIRONMENT: "production" });
    const statuses: number[] = [];
    for (let i = 1; i <= 6; i++) {
      const res = await create(prod, member.cookie, slug, {
        boardId: boards[0]!.id,
        title: `Idea number ${i}`,
        body: "",
      });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
    await dev.settle();
    await prod.settle();
  });
});

describe("GET /api/posts/:id", () => {
  it("shows a post to anyone, without edit rights", async () => {
    const t = testApp();
    const { owner, slug, boards } = await setupWorkspace(t);
    const post = await submitPost(t, owner.cookie, slug, {
      boardId: boards[0]!.id,
      title: "Dark mode",
    });
    const res = await getPost(t, post.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: { id: post.id, voteCount: 1, voted: false, canEdit: false },
    });
    await t.settle();
  });

  it("answers 400 for an id that isn't a number", async () => {
    const t = testApp();
    const res = await t.request("/api/posts/abc");
    expect(res.status).toBe(400);
    await t.settle();
  });

  it("answers 404 for a post that doesn't exist", async () => {
    const t = testApp();
    const res = await getPost(t, 999_999_999);
    expect(res.status).toBe(404);
    await t.settle();
  });

  it("shows the author's name once they pick one", async () => {
    const t = testApp();
    const { slug, boards } = await setupWorkspace(t);
    const member = await t.signIn();
    await t.client.api.me.$patch(
      { json: { name: "Ayşe" } },
      { headers: { cookie: member.cookie } }
    );
    const post = await submitPost(t, member.cookie, slug, {
      boardId: boards[0]!.id,
      title: "Dark mode",
    });
    expect(post.author).toEqual({ name: "Ayşe" });
    await t.settle();
  });
});

describe("PATCH and DELETE /api/posts/:id", () => {
  async function postByMember(t: TestApp) {
    const workspace = await setupWorkspace(t);
    const author = await t.signIn();
    const post = await submitPost(t, author.cookie, workspace.slug, {
      boardId: workspace.boards[0]!.id,
      title: "Dark mode",
    });
    return { ...workspace, author, post };
  }

  const edit = (
    t: TestApp,
    cookie: string,
    id: number,
    json: { title?: string; body?: string }
  ) =>
    t.client.api.posts[":id"].$patch(
      { param: { id: String(id) }, json },
      { headers: { cookie } }
    );

  const remove = (t: TestApp, cookie: string, id: number) =>
    t.client.api.posts[":id"].$delete(
      { param: { id: String(id) } },
      { headers: { cookie } }
    );

  it("lets the author edit their post, and its address follows the title", async () => {
    const t = testApp();
    const { author, post } = await postByMember(t);
    const res = await edit(t, author.cookie, post.id, {
      title: "Dark mode everywhere",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: {
        title: "Dark mode everywhere",
        ref: `${post.id}-dark-mode-everywhere`,
      },
    });
    await t.settle();
  });

  it("lets the workspace team edit anyone's post", async () => {
    const t = testApp();
    const { owner, post } = await postByMember(t);
    const res = await edit(t, owner.cookie, post.id, { body: "Details." });
    expect(res.status).toBe(200);
    await t.settle();
  });

  it("refuses an edit from anyone else", async () => {
    const t = testApp();
    const { post } = await postByMember(t);
    const stranger = await t.signIn();
    const res = await edit(t, stranger.cookie, post.id, { title: "Hijacked" });
    expect(res.status).toBe(403);
    await t.settle();
  });

  it("lets the author delete their post", async () => {
    const t = testApp();
    const { author, post } = await postByMember(t);
    const res = await remove(t, author.cookie, post.id);
    expect(res.status).toBe(200);
    expect((await getPost(t, post.id)).status).toBe(404);
    await t.settle();
  });

  it("refuses a delete from anyone else", async () => {
    const t = testApp();
    const { post } = await postByMember(t);
    const stranger = await t.signIn();
    const res = await remove(t, stranger.cookie, post.id);
    expect(res.status).toBe(403);
    await t.settle();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test worker/routes/posts.test.ts`

Expected: FAIL. No post route exists yet, so:
- creates answer 404 instead of 201, 400 and 401, and 404 instead of 429
- every test that calls `submitPost` throws `post failed: Not found`
- `GET /api/posts/abc` answers 404 instead of 400.

Two tests already pass, because the app's catch-all answers 404: "answers 404 for an unknown workspace" and "answers 404 for a post that doesn't exist". They pin behavior the routes must keep.

- [ ] **Step 3: Add the services**

`worker/services/search.ts`:

```ts
import type { Locale } from "@/shared/locale";
import type { SearchConfig } from "../db/schema";

/** The Postgres text-search config for a workspace's language. */
export const searchConfigFor = (locale: Locale): SearchConfig =>
  locale === "tr" ? "turkish" : "english";
```

`worker/services/posts.ts`:

```ts
import { and, eq, sql } from "drizzle-orm";
import { excerpt } from "@/shared/excerpt";
import type { Locale } from "@/shared/locale";
import type { PostDetail, PostSummary } from "@/shared/posts";
import { postRef } from "@/shared/ref";
import type { PostStatus } from "@/shared/status";
import type { Database } from "../db/client";
import {
  boards,
  member,
  organization,
  posts,
  user as users,
  votes,
  workspaceSettings,
} from "../db/schema";
import { AppError } from "../lib/errors";
import { searchConfigFor } from "./search";

/**
 * What every post view selects. Queries using it join `boards` (inner) and
 * `users` (left, on the author).
 */
export function postColumns(viewerId: string | null) {
  return {
    id: posts.id,
    title: posts.title,
    body: posts.body,
    status: posts.status,
    voteCount: posts.voteCount,
    createdAt: posts.createdAt,
    boardSlug: boards.slug,
    boardName: boards.name,
    authorId: posts.authorId,
    authorName: users.name,
    voted: viewerId
      ? sql<boolean>`exists (select 1 from ${votes} where ${votes.postId} = ${posts.id} and ${votes.userId} = ${viewerId})`
      : sql<boolean>`false`,
  };
}

export type PostRow = {
  id: number;
  title: string;
  body: string;
  status: PostStatus;
  voteCount: number;
  createdAt: Date;
  boardSlug: string;
  boardName: string;
  authorId: string | null;
  authorName: string | null;
  voted: boolean;
};

export function toSummary(row: PostRow): PostSummary {
  return {
    id: row.id,
    ref: postRef(row.id, row.title),
    title: row.title,
    excerpt: excerpt(row.body),
    status: row.status,
    voteCount: row.voteCount,
    voted: row.voted,
    board: { slug: row.boardSlug, name: row.boardName },
    author: row.authorId === null ? null : { name: row.authorName ?? "" },
    createdAt: row.createdAt.toISOString(),
  };
}

const onTeam = (userId: string) =>
  sql<boolean>`exists (select 1 from ${member} where ${member.organizationId} = ${posts.organizationId} and ${member.userId} = ${userId})`;

export async function findPostDetail(
  db: Database,
  id: number,
  viewerId: string | null
): Promise<PostDetail | null> {
  const [row] = await db
    .select({
      ...postColumns(viewerId),
      workspaceSlug: organization.slug,
      workspaceName: organization.name,
      defaultLocale: workspaceSettings.defaultLocale,
      onTeam: viewerId ? onTeam(viewerId) : sql<boolean>`false`,
    })
    .from(posts)
    .innerJoin(boards, eq(boards.id, posts.boardId))
    .innerJoin(organization, eq(organization.id, posts.organizationId))
    .leftJoin(
      workspaceSettings,
      eq(workspaceSettings.organizationId, posts.organizationId)
    )
    .leftJoin(users, eq(users.id, posts.authorId))
    .where(eq(posts.id, id))
    .limit(1);
  if (!row) return null;
  return {
    ...toSummary(row),
    body: row.body,
    workspace: {
      slug: row.workspaceSlug,
      name: row.workspaceName,
      defaultLocale: row.defaultLocale ?? "en",
    },
    canEdit: viewerId !== null && (row.authorId === viewerId || row.onTeam),
  };
}

export async function boardInWorkspace(
  db: Database,
  boardId: string,
  workspaceId: string
) {
  const [row] = await db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.id, boardId), eq(boards.organizationId, workspaceId)))
    .limit(1);
  return row !== undefined;
}

/** A new post, with its author's vote already counted. Returns its id. */
export async function createPost(
  db: Database,
  input: {
    workspaceId: string;
    locale: Locale;
    boardId: string;
    authorId: string;
    title: string;
    body: string;
  }
): Promise<number> {
  return db.transaction(async (tx) => {
    const [post] = await tx
      .insert(posts)
      .values({
        organizationId: input.workspaceId,
        boardId: input.boardId,
        authorId: input.authorId,
        title: input.title,
        body: input.body,
        searchConfig: searchConfigFor(input.locale),
        voteCount: 1,
      })
      .returning({ id: posts.id });
    if (!post) throw new Error("the post insert returned nothing");
    await tx.insert(votes).values({ postId: post.id, userId: input.authorId });
    return post.id;
  });
}

/** Only the author or the workspace's team may change or delete a post. */
export async function requireCanEdit(db: Database, id: number, userId: string) {
  const [row] = await db
    .select({ authorId: posts.authorId, onTeam: onTeam(userId) })
    .from(posts)
    .where(eq(posts.id, id))
    .limit(1);
  if (!row) throw new AppError(404, "NOT_FOUND", "Post not found");
  if (row.authorId !== userId && !row.onTeam) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Only the author or the workspace team can do that"
    );
  }
}

export async function updatePost(
  db: Database,
  id: number,
  changes: { title?: string; body?: string }
) {
  await db.update(posts).set(changes).where(eq(posts.id, id));
}

export async function deletePost(db: Database, id: number) {
  await db.delete(posts).where(eq(posts.id, id));
}
```

- [ ] **Step 4: Add the routes and mount them**

In `worker/routes/workspaces.ts`, add `export` in front of `async function findWorkspace(`.

In `worker/middleware/session.ts`, append:

```ts
/** The signed-in person's id, or null: for routes anyone may call. */
export async function readViewerId(c: Parameters<typeof readSession>[0]) {
  return (await readSession(c))?.user.id ?? null;
}
```

`worker/routes/posts.ts`:

```ts
import { Hono } from "hono";
import { z } from "zod";
import type { SuccessResponse } from "@/shared/envelope";
import type { PostDetail } from "@/shared/posts";
import { createPostSchema, updatePostSchema } from "@/shared/schemas";
import type { Database } from "../db/client";
import type { AppEnv } from "../env";
import { AppError } from "../lib/errors";
import { validate } from "../lib/validate";
import { rateLimit } from "../middleware/rate-limit";
import { readViewerId, requireUser } from "../middleware/session";
import {
  boardInWorkspace,
  createPost,
  deletePost,
  findPostDetail,
  requireCanEdit,
  updatePost,
} from "../services/posts";
import { findWorkspace } from "./workspaces";

const postParamSchema = z.object({
  id: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

async function postDetail(db: Database, id: number, viewerId: string | null) {
  const post = await findPostDetail(db, id, viewerId);
  if (!post) throw new AppError(404, "NOT_FOUND", "Post not found");
  return post;
}

/** Under /workspaces: posting into a workspace. */
export const workspacePostRoutes = new Hono<AppEnv>().post(
  "/:slug/posts",
  requireUser,
  validate("json", createPostSchema),
  rateLimit("post", 5, 3600),
  async (c) => {
    const { boardId, title, body } = c.req.valid("json");
    const workspace = await findWorkspace(c.var.db, c.req.param("slug"));
    if (!(await boardInWorkspace(c.var.db, boardId, workspace.id))) {
      throw new AppError(
        400,
        "BAD_REQUEST",
        "That board isn't in this workspace",
        { boardId: "BOARD_UNKNOWN" }
      );
    }
    const id = await createPost(c.var.db, {
      workspaceId: workspace.id,
      locale: workspace.defaultLocale,
      boardId,
      authorId: c.var.user.id,
      title,
      body,
    });
    return c.json<SuccessResponse<PostDetail>>(
      { success: true, data: await postDetail(c.var.db, id, c.var.user.id) },
      201
    );
  }
);

/** Under /posts: one post, and changing or deleting it. */
export const postRoutes = new Hono<AppEnv>()
  .get("/:id", validate("param", postParamSchema), async (c) => {
    const { id } = c.req.valid("param");
    return c.json<SuccessResponse<PostDetail>>({
      success: true,
      data: await postDetail(c.var.db, id, await readViewerId(c)),
    });
  })
  .patch(
    "/:id",
    requireUser,
    validate("param", postParamSchema),
    validate("json", updatePostSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      await requireCanEdit(c.var.db, id, c.var.user.id);
      await updatePost(c.var.db, id, c.req.valid("json"));
      return c.json<SuccessResponse<PostDetail>>({
        success: true,
        data: await postDetail(c.var.db, id, c.var.user.id),
      });
    }
  )
  .delete(
    "/:id",
    requireUser,
    validate("param", postParamSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      await requireCanEdit(c.var.db, id, c.var.user.id);
      await deletePost(c.var.db, id);
      return c.json<SuccessResponse<{ id: number }>>({
        success: true,
        data: { id },
      });
    }
  );
```

In `worker/app.ts`, import the routers:

```ts
import { postRoutes, workspacePostRoutes } from "./routes/posts";
```

Then extend the end of the chain, after `.route("/workspaces", workspaceRoutes)`:

```ts
    .route("/workspaces", workspacePostRoutes)
    .route("/posts", postRoutes);
```

The semicolon moves from the `workspaceRoutes` line to the new last line.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test`
Expected: PASS. 28 test files, 207 tests.

- [ ] **Step 6: Lint and commit**

```bash
bun run typecheck
bun run check:fix
bun run check
bun run test
git add worker/services worker/routes/posts.ts worker/routes/posts.test.ts worker/routes/workspaces.ts worker/middleware/session.ts worker/app.ts worker/test/fixtures.ts
git commit -m "feat: posts API with author votes, edit rights and a posting limit" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: everything passes. 28 test files, 207 tests.

---

### Task 5: Votes that can't drift

**Files:**
- Create: `worker/services/votes.ts`
- Modify: `worker/routes/posts.ts` (vote route), `worker/test/fixtures.ts` (`voteFor`)
- Test: `worker/routes/votes.test.ts`
- Create: `scripts/vote-drift.ts`; Modify: `package.json` (script `vote-drift`), `tsconfig.node.json` (include `scripts`)

**Interfaces:**
- Consumes: from Task 4, `postRoutes`, `postParamSchema`, `setupWorkspace` and `submitPost`; from Task 3, `posts`, `votes`, `voteSchema` and `VoteResult`; from Task 2, `rateLimit`.
- Produces:
  - `setVote(db: Database, input: { postId: number; userId: string; voted: boolean }): Promise<VoteResult>`. It throws `AppError` 404 or 409 `POST_MERGED`.
  - `PUT /api/posts/:id/vote {voted}` returns `{ voted, voteCount }`. It's limited to 120 an hour in production.
  - Fixture: `voteFor(t, cookie, postId, voted = true)`.
  - `bun run vote-drift`, which prints the before and after numbers.

- [ ] **Step 1: Write the failing tests**

In `worker/test/fixtures.ts`, append:

```ts
/** Votes through the API as `cookie`. */
export const voteFor = (
  t: TestApp,
  cookie: string,
  postId: number,
  voted = true
) =>
  t.client.api.posts[":id"].vote.$put(
    { param: { id: String(postId) }, json: { voted } },
    { headers: { cookie } }
  );
```

`worker/routes/votes.test.ts`:

```ts
import { count, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { posts, votes } from "../db/schema";
import { ORIGIN, testApp } from "../test/app";
import { testDb } from "../test/db";
import { setupWorkspace, submitPost, voteFor } from "../test/fixtures";

const { db, close } = testDb();
afterAll(() => close());

type TestApp = ReturnType<typeof testApp>;

/** The stored count, next to the rows it must equal. */
async function tally(postId: number) {
  const [post] = await db
    .select({ voteCount: posts.voteCount })
    .from(posts)
    .where(eq(posts.id, postId));
  const [rows] = await db
    .select({ n: count() })
    .from(votes)
    .where(eq(votes.postId, postId));
  return { voteCount: post?.voteCount, rows: rows?.n };
}

async function postByOwner(t: TestApp) {
  const { owner, slug, boards } = await setupWorkspace(t);
  const post = await submitPost(t, owner.cookie, slug, {
    boardId: boards[0]!.id,
    title: "Dark mode",
  });
  return { owner, slug, boards, post };
}

describe("PUT /api/posts/:id/vote", () => {
  it("counts a vote and returns the new count", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const voter = await t.signIn();
    const res = await voteFor(t, voter.cookie, post.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: { voted: true, voteCount: 2 },
    });
    await t.settle();
  });

  it("sets the state you ask for, so repeating it changes nothing", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const voter = await t.signIn();
    await voteFor(t, voter.cookie, post.id);
    const again = await voteFor(t, voter.cookie, post.id);
    expect(await again.json()).toMatchObject({
      data: { voted: true, voteCount: 2 },
    });
    expect(await tally(post.id)).toEqual({ voteCount: 2, rows: 2 });
    await t.settle();
  });

  it("removes a vote, and removing it again changes nothing", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const voter = await t.signIn();
    await voteFor(t, voter.cookie, post.id);
    const removed = await voteFor(t, voter.cookie, post.id, false);
    expect(await removed.json()).toMatchObject({
      data: { voted: false, voteCount: 1 },
    });
    const again = await voteFor(t, voter.cookie, post.id, false);
    expect(await again.json()).toMatchObject({
      data: { voted: false, voteCount: 1 },
    });
    await t.settle();
  });

  it("keeps the count equal to the rows when 50 people vote at once", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const voters: { email: string; cookie: string }[] = [];
    for (let i = 0; i < 50; i++) voters.push(await t.signIn());
    const responses = await Promise.all(
      voters.map((voter) => voteFor(t, voter.cookie, post.id))
    );
    expect(responses.map((res) => res.status)).toEqual(Array(50).fill(200));
    expect(await tally(post.id)).toEqual({ voteCount: 51, rows: 51 });
    await t.settle();
  }, 60_000);

  it("keeps the count equal to the rows when one person sends 20 alternating votes at once", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const voter = await t.signIn();
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        voteFor(t, voter.cookie, post.id, i % 2 === 0)
      )
    );
    expect(responses.map((res) => res.status)).toEqual(Array(20).fill(200));
    const { voteCount, rows } = await tally(post.id);
    expect(voteCount).toBe(rows);
    expect([1, 2]).toContain(rows);
    await t.settle();
  }, 30_000);

  it("refuses a vote on a merged post", async () => {
    const t = testApp();
    const { owner, slug, boards, post } = await postByOwner(t);
    const target = await submitPost(t, owner.cookie, slug, {
      boardId: boards[0]!.id,
      title: "Dark theme",
    });
    await db
      .update(posts)
      .set({ mergedIntoId: target.id })
      .where(eq(posts.id, post.id));
    const voter = await t.signIn();
    const res = await voteFor(t, voter.cookie, post.id);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      success: false,
      code: "POST_MERGED",
    });
    expect(await tally(post.id)).toEqual({ voteCount: 1, rows: 1 });
    await t.settle();
  });

  it("answers 404 for a post that's gone", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    await t.client.api.posts[":id"].$delete(
      { param: { id: String(post.id) } },
      { headers: { cookie: owner.cookie } }
    );
    const voter = await t.signIn();
    const res = await voteFor(t, voter.cookie, post.id);
    expect(res.status).toBe(404);
    await t.settle();
  });

  it("needs a signed-in user", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const res = await t.client.api.posts[":id"].vote.$put({
      param: { id: String(post.id) },
      json: { voted: true },
    });
    expect(res.status).toBe(401);
    await t.settle();
  });

  it("refuses a vote that isn't true or false", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const voter = await t.signIn();
    const res = await t.request(`/api/posts/${post.id}/vote`, {
      method: "PUT",
      headers: {
        cookie: voter.cookie,
        origin: ORIGIN,
        "content-type": "application/json",
      },
      body: JSON.stringify({ voted: "yes" }),
    });
    expect(res.status).toBe(400);
    await t.settle();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test worker/routes/votes.test.ts`

Expected: FAIL. No vote route exists, so every vote answers 404: the status assertions fail, and the bodies don't match. The "post that's gone" test already passes, because the missing route also answers 404.

- [ ] **Step 3: Add the service and the route**

`worker/services/votes.ts`:

```ts
import { and, eq, sql } from "drizzle-orm";
import type { VoteResult } from "@/shared/posts";
import type { Database } from "../db/client";
import { posts, votes } from "../db/schema";
import { AppError } from "../lib/errors";

/**
 * Sets one person's vote on a post to `voted` and returns the new count.
 *
 * The post row is locked first, so every vote on it (and, from Phase 4, a
 * merge) waits for the one in progress. The vote row is written as the
 * desired state, not toggled, and the count moves only by the rows that
 * actually changed. Repeating a request, or racing it against itself,
 * can't drift.
 */
export async function setVote(
  db: Database,
  input: { postId: number; userId: string; voted: boolean }
): Promise<VoteResult> {
  return db.transaction(async (tx) => {
    const [post] = await tx
      .select({ voteCount: posts.voteCount, mergedIntoId: posts.mergedIntoId })
      .from(posts)
      .where(eq(posts.id, input.postId))
      .for("update");
    if (!post) throw new AppError(404, "NOT_FOUND", "Post not found");
    if (post.mergedIntoId !== null) {
      throw new AppError(
        409,
        "POST_MERGED",
        "This request was merged into another one"
      );
    }
    const changed = input.voted
      ? await tx
          .insert(votes)
          .values({ postId: input.postId, userId: input.userId })
          .onConflictDoNothing()
          .returning({ postId: votes.postId })
      : await tx
          .delete(votes)
          .where(
            and(eq(votes.postId, input.postId), eq(votes.userId, input.userId))
          )
          .returning({ postId: votes.postId });
    if (changed.length === 0) {
      return { voted: input.voted, voteCount: post.voteCount };
    }
    const [updated] = await tx
      .update(posts)
      .set({ voteCount: sql`${posts.voteCount} + ${input.voted ? 1 : -1}` })
      .where(eq(posts.id, input.postId))
      .returning({ voteCount: posts.voteCount });
    return {
      voted: input.voted,
      voteCount: updated?.voteCount ?? post.voteCount,
    };
  });
}
```

In `worker/routes/posts.ts`, make these changes:
- Change the type import to `import type { PostDetail, VoteResult } from "@/shared/posts";`.
- Add `voteSchema` to the `@/shared/schemas` import.
- Add `import { setVote } from "../services/votes";`.
- Chain this route onto the end of `postRoutes`, after the `.delete(…)` block; the closing semicolon moves after it:

```ts
  .put(
    "/:id/vote",
    requireUser,
    validate("param", postParamSchema),
    validate("json", voteSchema),
    rateLimit("vote", 120, 3600),
    async (c) => {
      const { id } = c.req.valid("param");
      const result = await setVote(c.var.db, {
        postId: id,
        userId: c.var.user.id,
        voted: c.req.valid("json").voted,
      });
      return c.json<SuccessResponse<VoteResult>>({
        success: true,
        data: result,
      });
    }
  );
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test`
Expected: PASS. 29 test files, 216 tests.

- [ ] **Step 5: Record the "before" picture**

`scripts/vote-drift.ts`:

```ts
// The "before" picture for the spec's first proof point: one person clicks
// the vote button 20 times faster than the server answers. BetterNews's
// read-then-write toggle can end with several votes from that one person;
// Pano's setVote ends with at most one, and the count always equals the rows.
//
//   bun run vote-drift      (uses TEST_DATABASE_URL; local databases only)
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../worker/db/schema";
import { setVote } from "../worker/services/votes";
import { assertLocalDatabaseUrl } from "../worker/test/local-db";

const CLICKS = 20;
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
assertLocalDatabaseUrl(url);

const sql = postgres(url, { max: CLICKS, onnotice: () => {} });
const db = drizzle({ client: sql, schema });

type Result = { count: number; rows: number; people: number };

/** BetterNews's POST /posts/:id/upvote, transcribed: read, then write. */
async function betterNewsToggle(userId: string) {
  await sql.begin(async (tx) => {
    const [existing] =
      await tx`select id from vote_drift.upvotes where post_id = 1 and user_id = ${userId} limit 1`;
    const change = existing ? -1 : 1;
    await tx`update vote_drift.posts set points = points + ${change} where id = 1`;
    if (existing) {
      await tx`delete from vote_drift.upvotes where id = ${existing.id}`;
    } else {
      await tx`insert into vote_drift.upvotes (post_id, user_id) values (1, ${userId})`;
    }
  });
}

async function betterNews(): Promise<Result> {
  await sql`drop schema if exists vote_drift cascade`;
  await sql`create schema vote_drift`;
  try {
    // As in BetterNews: an upvote row has its own id, and nothing stops a
    // second row for the same person.
    await sql`create table vote_drift.posts (id int primary key, points int not null default 0)`;
    await sql`create table vote_drift.upvotes (id serial primary key, post_id int not null, user_id text not null)`;
    await sql`insert into vote_drift.posts (id) values (1)`;
    await Promise.all(
      Array.from({ length: CLICKS }, () => betterNewsToggle("someone"))
    );
    const [row] = await sql<Result[]>`
      select (select points from vote_drift.posts where id = 1) as count,
             (select count(*)::int from vote_drift.upvotes) as rows,
             (select count(distinct user_id)::int from vote_drift.upvotes) as people`;
    if (!row) throw new Error("no result");
    return row;
  } finally {
    await sql`drop schema vote_drift cascade`;
  }
}

async function pano(): Promise<Result> {
  const id = `vote-drift-${crypto.randomUUID().slice(0, 8)}`;
  await db
    .insert(schema.user)
    .values({ id, name: "", email: `${id}@example.com` });
  await db
    .insert(schema.organization)
    .values({ id, name: "Vote drift", slug: id, createdAt: new Date() });
  try {
    const [board] = await db
      .insert(schema.boards)
      .values({ organizationId: id, slug: "ideas", name: "Ideas" })
      .returning({ id: schema.boards.id });
    const [post] = await db
      .insert(schema.posts)
      .values({
        organizationId: id,
        boardId: board!.id,
        title: "Dark mode",
        searchConfig: "english",
      })
      .returning({ id: schema.posts.id });
    const postId = post!.id;
    // The same 20 clicks, each sending the state it asks for: on, off, on…
    await Promise.all(
      Array.from({ length: CLICKS }, (_, i) =>
        setVote(db, { postId, userId: id, voted: i % 2 === 0 })
      )
    );
    const [stored] = await db
      .select({ count: schema.posts.voteCount })
      .from(schema.posts)
      .where(eq(schema.posts.id, postId));
    const [rows] = await db
      .select({ n: count() })
      .from(schema.votes)
      .where(eq(schema.votes.postId, postId));
    // (post_id, user_id) is the primary key, so every row is a different person.
    return { count: stored!.count, rows: rows!.n, people: rows!.n };
  } finally {
    await db.delete(schema.organization).where(eq(schema.organization.id, id));
    await db.delete(schema.user).where(eq(schema.user.id, id));
  }
}

try {
  const before = await betterNews();
  const after = await pano();
  console.log(`One person, ${CLICKS} clicks at once:`);
  console.log(
    `  BetterNews toggle  count ${before.count}, vote rows ${before.rows}, people ${before.people}`
  );
  console.log(
    `  Pano setVote       count ${after.count}, vote rows ${after.rows}, people ${after.people}`
  );
} finally {
  await sql.end();
}
```

In `package.json`, add the script after `"db:migrate"`:

```json
    "vote-drift": "bun scripts/vote-drift.ts",
```

In `tsconfig.node.json`, add `"scripts"` to the `include` array, after `"test"`.

Run: `bun run vote-drift`

Expected: something like this:

```
One person, 20 clicks at once:
  BetterNews toggle  count 9, vote rows 9, people 1
  Pano setVote       count 1, vote rows 1, people 1
```

- The BetterNews line shows more than one vote from one person. Its numbers change from run to run, and the count can even disagree with the rows; rerun if it happens to show 0 or 1.
- The Pano line always has count = vote rows = people, either 0 or 1.
- Copy the output into the ledger. The Phase 5 portfolio entry quotes it.

- [ ] **Step 6: Lint and commit**

```bash
bun run typecheck
bun run check:fix
bun run check
bun run test
git add worker/services/votes.ts worker/routes/posts.ts worker/routes/votes.test.ts worker/test/fixtures.ts scripts/vote-drift.ts package.json tsconfig.node.json
git commit -m "feat: idempotent votes that keep the count equal to the rows" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: everything passes. 29 test files, 216 tests.

---

### Task 6: The feed (sort, filter, search, paging)

**Files:**
- Create: `worker/services/ranking.ts`
- Modify: `worker/services/search.ts` (`matchesSearch`), `worker/routes/posts.ts` (feed route), `worker/db/client.ts` (silence notices)
- Test: `worker/routes/feed.test.ts`, `worker/db/client.test.ts` (one new case)

**Interfaces:**
- Consumes:
  - From Task 4: `postColumns`, `toSummary`, `findWorkspace`, `readViewerId`, `setupWorkspace` and `submitPost`.
  - From Task 5: `voteFor`.
  - From Task 3: `feedQuerySchema`, `FeedSort`, `FeedPage` and `PostStatus`.
- Produces:
  - `matchesSearch(q: string): SQL`
  - `listFeed(db, { workspaceId, board?, sort, status?, q?, page, limit, viewerId }): Promise<FeedPage>`
  - `GET /api/workspaces/:slug/posts?board=&sort=&status=&q=&page=&limit=` returns `FeedPage`. Anyone can call it.
  - `createDb` drops Postgres notices.

- [ ] **Step 1: Write the failing tests**

In `worker/db/client.test.ts`, change the vitest import to:

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
```

Add `import { testDb } from "../test/db";`, then add this test inside `describe("createDb", …)`:

```ts
  it("keeps Postgres notices out of the logs", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { db, close } = testDb();
    try {
      // A search for nothing but stopwords makes Postgres send a NOTICE.
      await db.execute(sql`select websearch_to_tsquery('english', 'the')`);
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      await close();
    }
  });
```

`worker/routes/feed.test.ts`:

```ts
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { posts, votes } from "../db/schema";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import { setupWorkspace, submitPost, voteFor } from "../test/fixtures";

const { db, close } = testDb();
afterAll(() => close());

type TestApp = ReturnType<typeof testApp>;
type Query = Partial<
  Record<"board" | "sort" | "status" | "q" | "page" | "limit", string>
>;
type Item = { title: string; voted: boolean };
type Page = { data: { items: Item[]; page: number; hasMore: boolean } };

async function feed(
  t: TestApp,
  slug: string,
  query: Query = {},
  cookie?: string
) {
  const res = await t.client.api.workspaces[":slug"].posts.$get(
    // Raw strings on purpose: some tests send values the schema refuses.
    { param: { slug }, query: query as never },
    cookie ? { headers: { cookie } } : undefined
  );
  return { status: res.status, body: (await res.json()) as Page };
}

const titles = (body: Page) => body.data.items.map((item) => item.title);

/** Moves a post, and every vote on it, `days` into the past. */
async function age(postId: number, days: number) {
  const past = sql`now() - make_interval(days => ${days})`;
  await db.update(posts).set({ createdAt: past }).where(eq(posts.id, postId));
  await db
    .update(votes)
    .set({ createdAt: past })
    .where(eq(votes.postId, postId));
}

async function workspaceWith(
  t: TestApp,
  postTitles: string[],
  options?: Parameters<typeof setupWorkspace>[1]
) {
  const workspace = await setupWorkspace(t, options);
  const made: Awaited<ReturnType<typeof submitPost>>[] = [];
  for (const title of postTitles) {
    made.push(
      await submitPost(t, workspace.owner.cookie, workspace.slug, {
        boardId: workspace.boards[0]!.id,
        title,
      })
    );
  }
  return { ...workspace, posts: made };
}

describe("GET /api/workspaces/:slug/posts", () => {
  it("lists newest first with sort=new, and only this workspace's posts", async () => {
    const t = testApp();
    const { slug } = await workspaceWith(t, [
      "First idea",
      "Second idea",
      "Third idea",
    ]);
    await workspaceWith(t, ["Somewhere else"]);
    const { status, body } = await feed(t, slug, { sort: "new" });
    expect(status).toBe(200);
    expect(titles(body)).toEqual(["Third idea", "Second idea", "First idea"]);
    await t.settle();
  });

  it("orders by votes with sort=top", async () => {
    const t = testApp();
    const { slug, posts: made } = await workspaceWith(t, [
      "Few votes",
      "Many votes",
    ]);
    for (let i = 0; i < 2; i++) {
      await voteFor(t, (await t.signIn()).cookie, made[1]!.id);
    }
    expect(titles((await feed(t, slug, { sort: "top" })).body)).toEqual([
      "Many votes",
      "Few votes",
    ]);
    await t.settle();
  });

  it("ranks recent votes above old ones with sort=trending", async () => {
    const t = testApp();
    const { slug, posts: made } = await workspaceWith(t, [
      "Old but busy",
      "New but quiet",
    ]);
    const old = made[0]!;
    const recent = made[1]!;
    // The old post's own vote is 60 days old; three people vote for it today.
    await age(old.id, 60);
    for (let i = 0; i < 3; i++) {
      await voteFor(t, (await t.signIn()).cookie, old.id);
    }
    // The newer post has more votes, all of them 20 days old.
    for (let i = 0; i < 5; i++) {
      await voteFor(t, (await t.signIn()).cookie, recent.id);
    }
    await age(recent.id, 20);
    expect(titles((await feed(t, slug, { sort: "trending" })).body)).toEqual([
      "Old but busy",
      "New but quiet",
    ]);
    expect(titles((await feed(t, slug, { sort: "top" })).body)).toEqual([
      "New but quiet",
      "Old but busy",
    ]);
    await t.settle();
  });

  it("filters by board and by status", async () => {
    const t = testApp();
    const { owner, slug, boards } = await setupWorkspace(t, {
      boards: ["Features", "Bugs"],
    });
    await submitPost(t, owner.cookie, slug, {
      boardId: boards[0]!.id,
      title: "A feature",
    });
    const bug = await submitPost(t, owner.cookie, slug, {
      boardId: boards[1]!.id,
      title: "A bug",
    });
    await db
      .update(posts)
      .set({ status: "planned" })
      .where(eq(posts.id, bug.id));
    expect(titles((await feed(t, slug, { board: "bugs" })).body)).toEqual([
      "A bug",
    ]);
    expect(titles((await feed(t, slug, { status: "planned" })).body)).toEqual([
      "A bug",
    ]);
    expect(titles((await feed(t, slug, { status: "open" })).body)).toEqual([
      "A feature",
    ]);
    await t.settle();
  });

  it.each([
    ["en", "dark", "Dark mode"],
    ["tr", "coklu sube", "ÖZELLİK: Çoklu şube desteği"],
    ["tr", "İPTAL", "İptal edilen rezervasyonlar için bildirim"],
  ] as const)("searches %s posts for %j", async (defaultLocale, q, expected) => {
    const t = testApp();
    const postTitles =
      defaultLocale === "en"
        ? ["Dark mode", "Export to CSV"]
        : [
            "ÖZELLİK: Çoklu şube desteği",
            "İptal edilen rezervasyonlar için bildirim",
            "Karanlık mod",
          ];
    const { slug } = await workspaceWith(t, postTitles, { defaultLocale });
    expect(titles((await feed(t, slug, { q })).body)).toEqual([expected]);
    await t.settle();
  });

  it.each(["dark & | ! (", '"unclosed', "-", "the"])(
    "survives the search %j",
    async (q) => {
      const t = testApp();
      const { slug } = await workspaceWith(t, ["Dark mode"]);
      expect((await feed(t, slug, { q })).status).toBe(200);
      await t.settle();
    }
  );

  it("pages through results", async () => {
    const t = testApp();
    const { slug } = await workspaceWith(t, ["One", "Two", "Three"]);
    const first = await feed(t, slug, { sort: "new", limit: "2" });
    expect(first.body.data).toMatchObject({ page: 1, hasMore: true });
    expect(titles(first.body)).toEqual(["Three", "Two"]);
    const second = await feed(t, slug, { sort: "new", limit: "2", page: "2" });
    expect(second.body.data).toMatchObject({ page: 2, hasMore: false });
    expect(titles(second.body)).toEqual(["One"]);
    await t.settle();
  });

  it("marks the posts the viewer voted on", async () => {
    const t = testApp();
    const { slug, posts: made } = await workspaceWith(t, [
      "Not voted",
      "Voted",
    ]);
    const viewer = await t.signIn();
    await voteFor(t, viewer.cookie, made[1]!.id);
    const mine = await feed(t, slug, { sort: "new" }, viewer.cookie);
    expect(
      mine.body.data.items.map((item) => [item.title, item.voted])
    ).toEqual([
      ["Voted", true],
      ["Not voted", false],
    ]);
    const anonymous = await feed(t, slug, { sort: "new" });
    expect(anonymous.body.data.items.every((item) => !item.voted)).toBe(true);
    await t.settle();
  });

  it("leaves out merged posts", async () => {
    const t = testApp();
    const { slug, posts: made } = await workspaceWith(t, [
      "Duplicate",
      "Original",
    ]);
    await db
      .update(posts)
      .set({ mergedIntoId: made[1]!.id })
      .where(eq(posts.id, made[0]!.id));
    expect(titles((await feed(t, slug)).body)).toEqual(["Original"]);
    await t.settle();
  });

  it.each([{ page: "0" }, { limit: "51" }, { sort: "hot" }])(
    "refuses %j",
    async (query) => {
      const t = testApp();
      const { slug } = await workspaceWith(t, []);
      expect((await feed(t, slug, query)).status).toBe(400);
      await t.settle();
    }
  );

  it("returns an empty page for an unknown board", async () => {
    const t = testApp();
    const { slug } = await workspaceWith(t, ["Dark mode"]);
    const { status, body } = await feed(t, slug, { board: "no-such-board" });
    expect(status).toBe(200);
    expect(body.data).toEqual({ items: [], page: 1, hasMore: false });
    await t.settle();
  });

  it("answers 404 for an unknown workspace", async () => {
    const t = testApp();
    expect((await feed(t, "no-such-workspace")).status).toBe(404);
    await t.settle();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test worker/routes/feed.test.ts worker/db/client.test.ts`

Expected: FAIL.
- Without a feed route, every feed request answers 404, so the 200 and 400 assertions fail, and `titles()` throws `TypeError` on the error body. "answers 404 for an unknown workspace" already passes.
- "keeps Postgres notices out of the logs" fails: `console.log` was called with the NOTICE (`text-search query contains only stop words…`).

- [ ] **Step 3: Silence notices, add search and ranking**

In `worker/db/client.ts`, add `onnotice` to the `postgres(...)` options, after `connect_timeout`:

```ts
    // Notices aren't errors (a search for "the" sends one), and postgres.js
    // would print every one of them with console.log.
    onnotice: () => {},
```

In `worker/services/search.ts`, change the imports to:

```ts
import { type SQL, sql } from "drizzle-orm";
import type { Locale } from "@/shared/locale";
import { posts, type SearchConfig } from "../db/schema";
```

Then append:

```ts
/**
 * Feed search: every word, stemmed in each post's own language, or a title
 * close enough to forgive a typo (pg_trgm's %>, threshold 0.6). Both sides
 * go through pano_fold, so case and Turkish letters never decide a match.
 */
export function matchesSearch(q: string): SQL {
  return sql`(${posts.search} @@ websearch_to_tsquery(${posts.searchConfig}, pano_fold(${q})) or pano_fold(${posts.title}) %> pano_fold(${q}))`;
}
```

`worker/services/ranking.ts`:

```ts
import { and, desc, eq, isNull, type SQL, sql } from "drizzle-orm";
import type { FeedPage } from "@/shared/posts";
import type { FeedSort } from "@/shared/schemas";
import type { PostStatus } from "@/shared/status";
import type { Database } from "../db/client";
import { boards, posts, user as users, votes } from "../db/schema";
import { postColumns, toSummary } from "./posts";
import { matchesSearch } from "./search";

// Trending: votes from the last 30 days, each worth half as much every 3 days.
const TRENDING_DAYS = 30;
const HALF_LIFE_SECONDS = 3 * 24 * 60 * 60;

const trendingScore = sql`coalesce((
  select sum(power(0.5, extract(epoch from (now() - ${votes.createdAt})) / ${sql.raw(String(HALF_LIFE_SECONDS))}))
  from ${votes}
  where ${votes.postId} = ${posts.id}
    and ${votes.createdAt} > now() - interval '${sql.raw(String(TRENDING_DAYS))} days'
), 0)`;

const ORDER: Record<FeedSort, SQL[]> = {
  trending: [desc(trendingScore), desc(posts.createdAt), desc(posts.id)],
  top: [desc(posts.voteCount), desc(posts.createdAt), desc(posts.id)],
  new: [desc(posts.createdAt), desc(posts.id)],
};

export type FeedQuery = {
  workspaceId: string;
  board?: string;
  sort: FeedSort;
  status?: PostStatus;
  q?: string;
  page: number;
  limit: number;
  viewerId: string | null;
};

export async function listFeed(
  db: Database,
  query: FeedQuery
): Promise<FeedPage> {
  const filters: SQL[] = [
    eq(posts.organizationId, query.workspaceId),
    isNull(posts.mergedIntoId),
  ];
  if (query.board) {
    const [board] = await db
      .select({ id: boards.id })
      .from(boards)
      .where(
        and(
          eq(boards.organizationId, query.workspaceId),
          eq(boards.slug, query.board)
        )
      )
      .limit(1);
    // A stale ?board= link shows an empty feed rather than an error.
    if (!board) return { items: [], page: query.page, hasMore: false };
    filters.push(eq(posts.boardId, board.id));
  }
  if (query.status) filters.push(eq(posts.status, query.status));
  if (query.q) filters.push(matchesSearch(query.q));
  const rows = await db
    .select(postColumns(query.viewerId))
    .from(posts)
    .innerJoin(boards, eq(boards.id, posts.boardId))
    .leftJoin(users, eq(users.id, posts.authorId))
    .where(and(...filters))
    .orderBy(...ORDER[query.sort])
    .limit(query.limit + 1)
    .offset((query.page - 1) * query.limit);
  return {
    items: rows.slice(0, query.limit).map(toSummary),
    page: query.page,
    hasMore: rows.length > query.limit,
  };
}
```

- [ ] **Step 4: Add the feed route**

In `worker/routes/posts.ts`, make these changes:
- Change the type import to `import type { FeedPage, PostDetail, VoteResult } from "@/shared/posts";`.
- Add `feedQuerySchema` to the `@/shared/schemas` import.
- Add `import { listFeed } from "../services/ranking";`.
- Make the feed the first route of `workspacePostRoutes`: replace the line `export const workspacePostRoutes = new Hono<AppEnv>().post(` with:

```ts
export const workspacePostRoutes = new Hono<AppEnv>()
  .get("/:slug/posts", validate("query", feedQuerySchema), async (c) => {
    const workspace = await findWorkspace(c.var.db, c.req.param("slug"));
    const page = await listFeed(c.var.db, {
      ...c.req.valid("query"),
      workspaceId: workspace.id,
      viewerId: await readViewerId(c),
    });
    return c.json<SuccessResponse<FeedPage>>({ success: true, data: page });
  })
  .post(
```

Update its doc comment to: `/** Under /workspaces: a workspace's feed, and posting into it. */`

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test`
Expected: PASS. 30 test files, 236 tests.

- [ ] **Step 6: Lint and commit**

```bash
bun run typecheck
bun run check:fix
bun run check
bun run test
git add worker/services worker/routes/posts.ts worker/routes/feed.test.ts worker/db/client.ts worker/db/client.test.ts
git commit -m "feat: feed with trending, top and new, board and status filters, and search" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: everything passes. 30 test files, 236 tests.

---

### Task 7: Similar requests

**Files:**
- Create: `worker/services/similar.ts`
- Modify: `worker/routes/posts.ts` (similar route)
- Test: `worker/routes/similar.test.ts`

**Interfaces:**
- Consumes: from Task 4, `postColumns`, `toSummary`, `findWorkspace`, `readViewerId`, `setupWorkspace` and `submitPost`; from Task 3, `ACTIVE_STATUSES`, `similarQuerySchema` and `PostSummary`.
- Produces:
  - `findSimilar(db, { workspaceId, q, boardSlug?, viewerId, limit? }): Promise<PostSummary[]>`, which returns at most 5.
  - `GET /api/workspaces/:slug/similar?q=&board=` returns `PostSummary[]`. Anyone can call it.

- [ ] **Step 1: Write the failing tests**

`worker/routes/similar.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { posts } from "../db/schema";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import { setupWorkspace, submitPost } from "../test/fixtures";

const { db, close } = testDb();
afterAll(() => close());

type TestApp = ReturnType<typeof testApp>;
type Workspace = Awaited<ReturnType<typeof setupWorkspace>>;
type Body = { data: { title: string }[] };

async function similar(t: TestApp, slug: string, q: string) {
  const res = await t.client.api.workspaces[":slug"].similar.$get({
    param: { slug },
    query: { q },
  });
  return { status: res.status, body: (await res.json()) as Body };
}

const titles = (body: Body) => body.data.map((post) => post.title);

const add = (t: TestApp, ws: Workspace, title: string, body = "") =>
  submitPost(t, ws.owner.cookie, ws.slug, {
    boardId: ws.boards[0]!.id,
    title,
    body,
  });

/** An English and a Turkish workspace with a few requests each. */
async function fixtures(t: TestApp) {
  const en = await setupWorkspace(t);
  const dark = await add(t, en, "Dark mode", "Please add a dark theme for night use");
  await add(t, en, "Export to CSV", "Download my data as a spreadsheet");
  await add(t, en, "Keyboard shortcuts for the editor");
  const shipped = await add(t, en, "Dark sidebar");
  await db
    .update(posts)
    .set({ status: "shipped" })
    .where(eq(posts.id, shipped.id));
  const merged = await add(t, en, "Darker charts");
  await db
    .update(posts)
    .set({ mergedIntoId: dark.id })
    .where(eq(posts.id, merged.id));
  const tr = await setupWorkspace(t, { defaultLocale: "tr" });
  await add(t, tr, "Karanlık mod", "Gece kullanımı için koyu tema");
  await add(t, tr, "İptal edilen rezervasyonlar için bildirim");
  await add(t, tr, "ÖZELLİK: Çoklu şube desteği");
  return { en: en.slug, tr: tr.slug };
}

describe("GET /api/workspaces/:slug/similar", () => {
  it("finds a request by its words, leaving out shipped and merged ones", async () => {
    const t = testApp();
    const { en } = await fixtures(t);
    const { status, body } = await similar(t, en, "dark theme");
    expect(status).toBe(200);
    expect(titles(body)).toEqual(["Dark mode"]);
    await t.settle();
  });

  it("forgives a typo", async () => {
    const t = testApp();
    const { en } = await fixtures(t);
    expect(titles((await similar(t, en, "darkk mod")).body)).toContain(
      "Dark mode"
    );
    await t.settle();
  });

  it("matches on any of the words", async () => {
    const t = testApp();
    const { en } = await fixtures(t);
    expect(titles((await similar(t, en, "exprot csv")).body)).toContain(
      "Export to CSV"
    );
    await t.settle();
  });

  it("stems Turkish, capital İ included", async () => {
    const t = testApp();
    const { tr } = await fixtures(t);
    expect(
      titles((await similar(t, tr, "rezervasyonumu iptal")).body)
    ).toContain("İptal edilen rezervasyonlar için bildirim");
    await t.settle();
  });

  it("matches Turkish typed without Turkish letters", async () => {
    const t = testApp();
    const { tr } = await fixtures(t);
    expect(titles((await similar(t, tr, "coklu sube")).body)).toContain(
      "ÖZELLİK: Çoklu şube desteği"
    );
    await t.settle();
  });

  it("stays inside the workspace", async () => {
    const t = testApp();
    const { tr } = await fixtures(t);
    expect(titles((await similar(t, tr, "dark mode")).body)).not.toContain(
      "Dark mode"
    );
    await t.settle();
  });

  it("returns at most five", async () => {
    const t = testApp();
    const ws = await setupWorkspace(t);
    for (let i = 1; i <= 7; i++) await add(t, ws, `Dark mode idea ${i}`);
    expect((await similar(t, ws.slug, "dark mode")).body.data).toHaveLength(5);
    await t.settle();
  });

  it("refuses a one-letter query", async () => {
    const t = testApp();
    const ws = await setupWorkspace(t);
    expect((await similar(t, ws.slug, "a")).status).toBe(400);
    await t.settle();
  });

  it("survives search syntax", async () => {
    const t = testApp();
    const ws = await setupWorkspace(t);
    await add(t, ws, "Dark mode");
    expect((await similar(t, ws.slug, "dark & | ! (")).status).toBe(200);
    await t.settle();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test worker/routes/similar.test.ts`
Expected: FAIL. The route doesn't exist, so requests answer 404 instead of 200 or 400, and `titles()` throws `TypeError` on the error body.

- [ ] **Step 3: Add the service and the route**

`worker/services/similar.ts`:

```ts
import { and, desc, eq, inArray, isNull, type SQL, sql } from "drizzle-orm";
import type { PostSummary } from "@/shared/posts";
import { ACTIVE_STATUSES } from "@/shared/status";
import type { Database } from "../db/client";
import { boards, posts, user as users } from "../db/schema";
import { postColumns, toSummary } from "./posts";

/**
 * Requests like the title being typed, for the submit form. They're still
 * open (not shipped or closed) and not merged, and they match any of the
 * words in the post's language or have a title close enough to forgive a
 * typo. Ranked by both, then by votes.
 */
export async function findSimilar(
  db: Database,
  input: {
    workspaceId: string;
    q: string;
    boardSlug?: string;
    viewerId: string | null;
    limit?: number;
  }
): Promise<PostSummary[]> {
  const folded = sql`pano_fold(${input.q})`;
  // "dark mode" becomes "dark or mode", so one misspelled word can't hide a
  // match: "exprot csv" still finds "Export to CSV".
  const anyWord = sql`websearch_to_tsquery(${posts.searchConfig}, regexp_replace(${folded}, '\\s+', ' or ', 'g'))`;
  const filters: SQL[] = [
    eq(posts.organizationId, input.workspaceId),
    isNull(posts.mergedIntoId),
    inArray(posts.status, [...ACTIVE_STATUSES]),
    sql`(${posts.search} @@ ${anyWord} or pano_fold(${posts.title}) %> ${folded})`,
  ];
  if (input.boardSlug) filters.push(eq(boards.slug, input.boardSlug));
  const rows = await db
    .select(postColumns(input.viewerId))
    .from(posts)
    .innerJoin(boards, eq(boards.id, posts.boardId))
    .leftJoin(users, eq(users.id, posts.authorId))
    .where(and(...filters))
    .orderBy(
      desc(
        sql`ts_rank(${posts.search}, ${anyWord}) + word_similarity(${folded}, pano_fold(${posts.title}))`
      ),
      desc(posts.voteCount)
    )
    .limit(input.limit ?? 5);
  return rows.map(toSummary);
}
```

In `worker/routes/posts.ts`, make these changes:
- Change the type import to `import type { FeedPage, PostDetail, PostSummary, VoteResult } from "@/shared/posts";`.
- Add `similarQuerySchema` to the `@/shared/schemas` import.
- Add `import { findSimilar } from "../services/similar";`.
- Chain this route onto the end of `workspacePostRoutes`, after the `.post(…)` block; the closing semicolon moves after it:

```ts
  .get("/:slug/similar", validate("query", similarQuerySchema), async (c) => {
    const workspace = await findWorkspace(c.var.db, c.req.param("slug"));
    const { q, board } = c.req.valid("query");
    const items = await findSimilar(c.var.db, {
      workspaceId: workspace.id,
      q,
      boardSlug: board,
      viewerId: await readViewerId(c),
    });
    return c.json<SuccessResponse<PostSummary[]>>({
      success: true,
      data: items,
    });
  });
```

Update the router's doc comment to: `/** Under /workspaces: a workspace's feed, posting into it, and similar requests. */`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test`
Expected: PASS. 31 test files, 245 tests.

- [ ] **Step 5: Lint and commit**

```bash
bun run typecheck
bun run check:fix
bun run check
bun run test
git add worker/services/similar.ts worker/routes/posts.ts worker/routes/similar.test.ts
git commit -m "feat: similar requests across English and Turkish, typos forgiven" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: everything passes. 31 test files, 245 tests.

---

### Task 8: Optimistic votes on the client

**Files:**
- Modify: `package.json`, `bun.lock` (immer, sonner; Testing Library and jsdom for development), `vitest.config.ts` (`.tsx` tests)
- Create: `src/lib/keys.ts`, `src/lib/posts.ts`
- Create: `src/lib/optimistic.ts`; Test: `src/lib/optimistic.test.ts`
- Test: `src/lib/mutation-scope.test.ts`
- Create: `src/features/votes/vote-cache.ts`, `src/features/votes/use-vote.ts`, `src/features/votes/vote-button.tsx`; Test: `src/features/votes/vote-button.test.tsx`
- Modify: `src/routes/__root.tsx` (toasts), `src/i18n/messages/en.json`, `src/i18n/messages/tr.json` (`vote`)

**Interfaces:**
- Consumes:
  - From Tasks 4–7, through `AppType`: the post, feed, similar and vote routes.
  - From Task 3: `PostSummary`, `PostDetail`, `FeedPage`, `VoteResult`, `FeedSort` and `PostStatus`.
  - From Phase 1: `api`, `unwrap` and `apiErrorKey`.
- Produces:
  - `type FeedParams = { board?: string; sort: FeedSort; status?: PostStatus; q?: string; page: number }`
  - `postKeys`: `all`, `feedsAll`, `feeds(ws)`, `feed(ws, params)`, `detail(id)`, `similarAll`, `similar(ws, q)`. Also `voteKey(postId)`.
  - `patch<T>(filters, update): CachePatch`, `patchQueries(qc, patches)` and `applyOptimistic(qc, patches): Promise<() => void>`
  - `feedQueryOptions(ws, params)`, `postQueryOptions(id)` and `similarQueryOptions(ws, q)`
  - `createPost`, `updatePost`, `deletePost` and `castVote`
  - `useVote(postId)`, `<VoteButton postId title voted voteCount />` and `<SignInToVote voteCount />`
  - A `<Toaster />` in the root layout.

- [ ] **Step 1: Install the packages and let Vitest find `.tsx` tests**

```bash
bun add immer@^11.1.21 sonner@^2.0.8
bun add -d @testing-library/react@^16.3.3 @testing-library/dom@^10.4.2 jsdom@^30.1.3
```

In `vitest.config.ts`, change the `include` line to:

```ts
    include: [
      "worker/**/*.test.ts",
      "shared/**/*.test.ts",
      "src/**/*.test.{ts,tsx}",
    ],
```

- [ ] **Step 2: Write the failing tests**

`src/lib/optimistic.test.ts`:

```ts
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { applyOptimistic, patch } from "./optimistic";

type Counter = { id: number; count: number };

const bump = (id: number) =>
  patch<Counter[]>({ queryKey: ["counters"] }, (list) => {
    for (const counter of list) {
      if (counter.id === id) counter.count += 1;
    }
  });

describe("applyOptimistic", () => {
  it("patches every query that matches", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["counters", "a"], [{ id: 1, count: 0 }]);
    qc.setQueryData(["counters", "b"], [
      { id: 1, count: 5 },
      { id: 2, count: 0 },
    ]);
    await applyOptimistic(qc, [bump(1)]);
    expect(qc.getQueryData(["counters", "a"])).toEqual([{ id: 1, count: 1 }]);
    expect(qc.getQueryData(["counters", "b"])).toEqual([
      { id: 1, count: 6 },
      { id: 2, count: 0 },
    ]);
  });

  it("skips a matching query that has no data yet", async () => {
    const qc = new QueryClient();
    qc.getQueryCache().build(qc, { queryKey: ["counters", "empty"] });
    await expect(applyOptimistic(qc, [bump(1)])).resolves.toBeTypeOf(
      "function"
    );
    expect(qc.getQueryData(["counters", "empty"])).toBeUndefined();
  });

  it("restores every patched query on rollback", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["counters", "a"], [{ id: 1, count: 0 }]);
    qc.setQueryData(["counters", "b"], [{ id: 1, count: 5 }]);
    const rollback = await applyOptimistic(qc, [bump(1)]);
    rollback();
    expect(qc.getQueryData(["counters", "a"])).toEqual([{ id: 1, count: 0 }]);
    expect(qc.getQueryData(["counters", "b"])).toEqual([{ id: 1, count: 5 }]);
  });

  it("restores a query two patches touched to what it held first", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["counters", "a"], [{ id: 1, count: 0 }]);
    const rollback = await applyOptimistic(qc, [bump(1), bump(1)]);
    expect(qc.getQueryData(["counters", "a"])).toEqual([{ id: 1, count: 2 }]);
    rollback();
    expect(qc.getQueryData(["counters", "a"])).toEqual([{ id: 1, count: 0 }]);
  });

  it("stops an in-flight fetch so its stale answer can't land on top", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["counters", "a"], [{ id: 1, count: 0 }]);
    let answer: (value: Counter[]) => void = () => {};
    const fetching = qc
      .fetchQuery({
        queryKey: ["counters", "a"],
        queryFn: () =>
          new Promise<Counter[]>((resolve) => {
            answer = resolve;
          }),
        staleTime: 0,
      })
      // Cancelled: it rejects, or resolves with the data it reverted to.
      .catch(() => undefined);
    await applyOptimistic(qc, [bump(1)]);
    answer([{ id: 1, count: 99 }]);
    await fetching;
    expect(qc.getQueryData(["counters", "a"])).toEqual([{ id: 1, count: 1 }]);
  });
});
```

`src/lib/mutation-scope.test.ts`:

```ts
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { expect, it } from "vitest";

// useVote relies on this TanStack Query behavior, so it's pinned here. A
// second mutation in the same scope runs onMutate at once (the button flips
// on the click), but sends its request only after the first one finishes.
it("runs a queued mutation's onMutate at once and its request after the first", async () => {
  const qc = new QueryClient();
  const events: string[] = [];
  let finishFirst: () => void = () => {};
  const firstRequest = new Promise<void>((resolve) => {
    finishFirst = resolve;
  });
  const observer = (label: string, wait?: Promise<void>) =>
    new MutationObserver(qc, {
      mutationKey: ["vote", 1],
      scope: { id: "vote:1" },
      mutationFn: async () => {
        events.push(`${label}:request`);
        await wait;
      },
      onMutate: () => {
        events.push(`${label}:onMutate`);
      },
    });
  const first = observer("first", firstRequest).mutate();
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = observer("second").mutate();
  await new Promise((resolve) => setTimeout(resolve, 5));
  expect(events).toEqual([
    "first:onMutate",
    "first:request",
    "second:onMutate",
  ]);
  expect(qc.isMutating({ mutationKey: ["vote", 1] })).toBe(2);
  finishFirst();
  await Promise.all([first, second]);
  expect(events).toEqual([
    "first:onMutate",
    "first:request",
    "second:onMutate",
    "second:request",
  ]);
});
```

`src/features/votes/vote-button.test.tsx`:

```tsx
// @vitest-environment jsdom
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { IntlProvider } from "use-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";
import { type FeedParams, postKeys } from "@/lib/keys";
import { postQueryOptions } from "@/lib/posts";
import type { FeedPage, PostDetail, PostSummary } from "@/shared/posts";
import { VoteButton } from "./vote-button";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  toastError.mockReset();
});

const summary: PostSummary = {
  id: 7,
  ref: "7-dark-mode",
  title: "Dark mode",
  excerpt: "",
  status: "open",
  voteCount: 3,
  voted: false,
  board: { slug: "features", name: "Features" },
  author: { name: "Ayşe" },
  createdAt: "2026-10-01T00:00:00.000Z",
};
const detail: PostDetail = {
  ...summary,
  body: "",
  workspace: { slug: "acme", name: "Acme", defaultLocale: "en" },
  canEdit: false,
};
const feedParams: FeedParams = { sort: "trending", page: 1 };

/**
 * A stand-in for the API. It answers votes after 20 ms, remembers the state,
 * records what it was sent and how many requests overlapped, and serves the
 * post for the refetch after the last vote.
 */
function fakeServer({ fail = false, othersVoted = 0 } = {}) {
  const state = {
    voted: false,
    voteCount: 3 + othersVoted,
    inFlight: 0,
    maxInFlight: 0,
    received: [] as boolean[],
  };
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === "/api/posts/7/vote" && init?.method === "PUT") {
      const { voted } = JSON.parse(String(init.body)) as { voted: boolean };
      state.received.push(voted);
      state.inFlight += 1;
      state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      state.inFlight -= 1;
      if (fail) {
        return Response.json(
          { success: false, code: "INTERNAL_ERROR", error: "boom" },
          { status: 500 }
        );
      }
      if (voted !== state.voted) {
        state.voted = voted;
        state.voteCount += voted ? 1 : -1;
      }
      return Response.json({
        success: true,
        data: { voted: state.voted, voteCount: state.voteCount },
      });
    }
    if (url.pathname === "/api/posts/7") {
      return Response.json({
        success: true,
        data: { ...detail, voted: state.voted, voteCount: state.voteCount },
      });
    }
    return Response.json(
      { success: false, code: "NOT_FOUND", error: "Not found" },
      { status: 404 }
    );
  });
  vi.stubGlobal("fetch", fetch);
  return state;
}

function Harness() {
  const { data } = useQuery(postQueryOptions(7));
  if (!data) return null;
  return (
    <VoteButton
      postId={data.id}
      title={data.title}
      voted={data.voted}
      voteCount={data.voteCount}
    />
  );
}

function renderButton() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  qc.setQueryData(postKeys.detail(7), detail);
  qc.setQueryData(postKeys.feed("acme", feedParams), {
    items: [summary],
    page: 1,
    hasMore: false,
  });
  render(
    <IntlProvider locale="en" messages={en} timeZone="UTC">
      <QueryClientProvider client={qc}>
        <Harness />
      </QueryClientProvider>
    </IntlProvider>
  );
  return {
    qc,
    button: screen.getByRole("button", { name: "Vote for Dark mode" }),
  };
}

describe("VoteButton", () => {
  it("ends in the state of the last of several rapid clicks", async () => {
    const server = fakeServer();
    const { qc, button } = renderButton();
    for (const expected of ["true", "false", "true", "false", "true"]) {
      fireEvent.click(button);
      // Each click flips the button at once, long before the server answers.
      await waitFor(() =>
        expect(button.getAttribute("aria-pressed")).toBe(expected)
      );
    }
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    expect(server.received).toEqual([true, false, true, false, true]);
    expect(server.maxInFlight).toBe(1);
    await waitFor(() => expect(button.textContent).toBe("4"));
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("restores the post in every list it's in when the vote fails", async () => {
    fakeServer({ fail: true });
    const { qc, button } = renderButton();
    const feedKey = postKeys.feed("acme", feedParams);
    fireEvent.click(button);
    await waitFor(() =>
      expect(qc.getQueryData<PostDetail>(postKeys.detail(7))?.voteCount).toBe(
        4
      )
    );
    expect(qc.getQueryData<FeedPage>(feedKey)?.items[0]?.voteCount).toBe(4);
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Something went wrong on our side. Try again."
      )
    );
    expect(qc.getQueryData<PostDetail>(postKeys.detail(7))).toMatchObject({
      voted: false,
      voteCount: 3,
    });
    expect(qc.getQueryData<FeedPage>(feedKey)?.items[0]).toMatchObject({
      voted: false,
      voteCount: 3,
    });
  });

  it("shows the server's count once the last vote settles", async () => {
    fakeServer({ othersVoted: 6 });
    const { button } = renderButton();
    fireEvent.click(button);
    await waitFor(() => expect(button.textContent).toBe("4"));
    // Six other people voted meanwhile; the server's count wins.
    await waitFor(() => expect(button.textContent).toBe("10"));
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `bun run test src/lib/optimistic.test.ts src/lib/mutation-scope.test.ts src/features/votes/vote-button.test.tsx`

Expected: FAIL.
- `optimistic.test.ts` can't import `./optimistic`.
- `vote-button.test.tsx` can't import `@/lib/keys`.
- `mutation-scope.test.ts` passes already. It pins TanStack Query's own behavior, which the spike confirmed and `useVote` relies on.

- [ ] **Step 4: Add the keys, the helper and the API calls**

`src/lib/keys.ts`:

```ts
import type { FeedSort } from "@/shared/schemas";
import type { PostStatus } from "@/shared/status";

export type FeedParams = {
  board?: string;
  sort: FeedSort;
  status?: PostStatus;
  q?: string;
  page: number;
};

/**
 * Query keys for posts. Prefixes let one call reach every copy of a post: all
 * feed pages, its own page, and the similar-requests lists.
 */
export const postKeys = {
  all: ["posts"] as const,
  feedsAll: ["posts", "feed"] as const,
  feeds: (workspace: string) => ["posts", "feed", workspace] as const,
  feed: (workspace: string, params: FeedParams) =>
    ["posts", "feed", workspace, params] as const,
  detail: (id: number) => ["posts", "detail", id] as const,
  similarAll: ["posts", "similar"] as const,
  similar: (workspace: string, q: string) =>
    ["posts", "similar", workspace, q] as const,
};

/** Every vote on one post shares this key, so they can be counted. */
export const voteKey = (postId: number) => ["vote", postId] as const;
```

`src/lib/optimistic.ts`:

```ts
import {
  hashKey,
  type QueryClient,
  type QueryFilters,
  type QueryKey,
} from "@tanstack/react-query";
import { type Draft, produce } from "immer";

/** One change, applied to every cached query that matches `filters`. */
export type CachePatch = {
  filters: QueryFilters;
  update: (draft: Draft<unknown>) => void;
};

/** A patch for queries holding `T`; the type is checked here, then erased. */
export function patch<T>(
  filters: QueryFilters,
  update: (draft: Draft<T>) => void
): CachePatch {
  return { filters, update: update as (draft: Draft<unknown>) => void };
}

/**
 * Applies each patch to every matching query that has data, and returns what
 * each query held before the first patch touched it.
 */
export function patchQueries(qc: QueryClient, patches: CachePatch[]) {
  const before = new Map<string, [QueryKey, unknown]>();
  for (const { filters, update } of patches) {
    for (const [key, data] of qc.getQueriesData(filters)) {
      // A query that never loaded has nothing to patch. (BetterNews ran
      // immer's current() on one and threw.)
      if (data === undefined) continue;
      const hash = hashKey(key);
      if (!before.has(hash)) before.set(hash, [key, data]);
      qc.setQueryData(key, produce(data, update));
    }
  }
  return before;
}

/**
 * The optimistic half of a mutation. It stops in-flight fetches of the
 * matching queries, so a stale answer can't land on top, patches every one
 * that has data, and returns a rollback that restores them all. (BetterNews
 * kept a single snapshot.)
 */
export async function applyOptimistic(
  qc: QueryClient,
  patches: CachePatch[]
): Promise<() => void> {
  await Promise.all(patches.map(({ filters }) => qc.cancelQueries(filters)));
  const before = patchQueries(qc, patches);
  return () => {
    for (const [key, data] of before.values()) qc.setQueryData(key, data);
  };
}
```

`src/lib/posts.ts`:

```ts
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "./api";
import { type FeedParams, postKeys } from "./keys";

/** The feed's filters as the API reads them: strings, empty ones left out. */
function feedQuery(params: FeedParams) {
  return {
    sort: params.sort,
    page: String(params.page),
    ...(params.board ? { board: params.board } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.q ? { q: params.q } : {}),
  };
}

export const feedQueryOptions = (workspace: string, params: FeedParams) =>
  queryOptions({
    queryKey: postKeys.feed(workspace, params),
    queryFn: async () =>
      unwrap(
        await api.workspaces[":slug"].posts.$get({
          param: { slug: workspace },
          query: feedQuery(params),
        })
      ),
    // Keep the current page on screen while the next one loads.
    placeholderData: keepPreviousData,
  });

export const postQueryOptions = (id: number) =>
  queryOptions({
    queryKey: postKeys.detail(id),
    queryFn: async () =>
      unwrap(await api.posts[":id"].$get({ param: { id: String(id) } })),
  });

export const similarQueryOptions = (workspace: string, q: string) =>
  queryOptions({
    queryKey: postKeys.similar(workspace, q),
    queryFn: async () =>
      unwrap(
        await api.workspaces[":slug"].similar.$get({
          param: { slug: workspace },
          query: { q },
        })
      ),
    enabled: q.length >= 3,
    staleTime: 30_000,
  });

export async function createPost(
  workspace: string,
  json: { boardId: string; title: string; body: string }
) {
  return unwrap(
    await api.workspaces[":slug"].posts.$post({
      param: { slug: workspace },
      json,
    })
  );
}

export async function updatePost(
  id: number,
  json: { title?: string; body?: string }
) {
  return unwrap(
    await api.posts[":id"].$patch({ param: { id: String(id) }, json })
  );
}

export async function deletePost(id: number) {
  return unwrap(await api.posts[":id"].$delete({ param: { id: String(id) } }));
}

export async function castVote(id: number, voted: boolean) {
  return unwrap(
    await api.posts[":id"].vote.$put({
      param: { id: String(id) },
      json: { voted },
    })
  );
}
```

- [ ] **Step 5: Add the vote hook, the button and the toasts**

`src/features/votes/vote-cache.ts`:

```ts
import type { QueryClient } from "@tanstack/react-query";
import type { Draft } from "immer";
import { postKeys } from "@/lib/keys";
import {
  applyOptimistic,
  type CachePatch,
  patch,
  patchQueries,
} from "@/lib/optimistic";
import type {
  FeedPage,
  PostDetail,
  PostSummary,
  VoteResult,
} from "@/shared/posts";

type Edit = (post: Draft<PostSummary>) => void;

/** The same edit to one post wherever it's cached. */
function everyCopy(postId: number, edit: Edit): CachePatch[] {
  return [
    patch<FeedPage>({ queryKey: postKeys.feedsAll }, (page) => {
      for (const item of page.items) {
        if (item.id === postId) edit(item);
      }
    }),
    patch<PostDetail>({ queryKey: postKeys.detail(postId) }, edit),
    patch<PostSummary[]>({ queryKey: postKeys.similarAll }, (list) => {
      for (const item of list) {
        if (item.id === postId) edit(item);
      }
    }),
  ];
}

/** Flips this person's vote everywhere at once; resolves to a rollback. */
export function optimisticVote(
  qc: QueryClient,
  postId: number,
  voted: boolean
) {
  return applyOptimistic(
    qc,
    everyCopy(postId, (post) => {
      if (post.voted === voted) return;
      post.voted = voted;
      post.voteCount += voted ? 1 : -1;
    })
  );
}

/** Writes the server's answer everywhere: its count includes other people. */
export function writeVoteResult(
  qc: QueryClient,
  postId: number,
  result: VoteResult
) {
  patchQueries(
    qc,
    everyCopy(postId, (post) => {
      post.voted = result.voted;
      post.voteCount = result.voteCount;
    })
  );
}
```

`src/features/votes/use-vote.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "use-intl";
import { apiErrorKey } from "@/lib/error-text";
import { postKeys, voteKey } from "@/lib/keys";
import { castVote } from "@/lib/posts";
import { optimisticVote, writeVoteResult } from "./vote-cache";

/**
 * Votes on one post. Requests for the same post go one at a time (`scope`),
 * each sending the state the person clicked, so rapid clicks end where the
 * last one did. The cache flips at once and rolls back on failure. The
 * server's answer is written, and the post refetched, only once no other
 * vote on it is waiting.
 */
export function useVote(postId: number) {
  const qc = useQueryClient();
  const tErrors = useTranslations("errors");
  const mutationKey = voteKey(postId);
  // In its own callbacks a mutation still counts itself.
  const isLast = () => qc.isMutating({ mutationKey }) === 1;
  return useMutation({
    mutationKey,
    scope: { id: `vote:${postId}` },
    mutationFn: (voted: boolean) => castVote(postId, voted),
    onMutate: async (voted) => ({
      rollback: await optimisticVote(qc, postId, voted),
    }),
    onError: (error, _voted, context) => {
      context?.rollback();
      toast.error(tErrors(apiErrorKey(error)));
    },
    onSuccess: (result) => {
      if (isLast()) writeVoteResult(qc, postId, result);
    },
    onSettled: async () => {
      if (isLast()) await qc.invalidateQueries({ queryKey: postKeys.all });
    },
  });
}
```

`src/features/votes/vote-button.tsx`:

```tsx
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronUp } from "lucide-react";
import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { useVote } from "./use-vote";

const SHAPE = "h-auto w-12 shrink-0 flex-col gap-0 py-1.5 tabular-nums";

type Props = { postId: number; title: string; voted: boolean; voteCount: number };

/** The vote toggle. It stays enabled while requests run: they queue per post. */
export function VoteButton({ postId, title, voted, voteCount }: Props) {
  const t = useTranslations("vote");
  const vote = useVote(postId);
  return (
    <Button
      type="button"
      variant={voted ? "default" : "outline"}
      className={SHAPE}
      aria-pressed={voted}
      aria-label={t("voteFor", { title })}
      onClick={() => vote.mutate(!voted)}
    >
      <ChevronUp aria-hidden="true" />
      <span>{voteCount}</span>
    </Button>
  );
}

/** What signed-out visitors see instead: the count, linking to sign-in. */
export function SignInToVote({ voteCount }: { voteCount: number }) {
  const t = useTranslations("vote");
  const href = useRouterState({ select: (state) => state.location.href });
  return (
    <Button asChild variant="outline" className={SHAPE}>
      <Link
        to="/signin"
        search={{ redirect: href }}
        aria-label={t("signInToVote")}
        title={t("signInToVote")}
      >
        <ChevronUp aria-hidden="true" />
        <span>{voteCount}</span>
      </Link>
    </Button>
  );
}
```

In `src/routes/__root.tsx`, add `import { Toaster } from "sonner";`, then render `<Toaster position="bottom-center" richColors />` as the last child of the outer `<div>`, after the `<div className="flex-1">…</div>`.

Add the `vote` namespace to both catalogs:
- `en.json`: `"vote": { "voteFor": "Vote for {title}", "signInToVote": "Sign in to vote" }`
- `tr.json`: `"vote": { "voteFor": "{title} için oy ver", "signInToVote": "Oy vermek için giriş yapın" }`

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun run test`
Expected: PASS. 34 test files, 254 tests.

- [ ] **Step 7: Build, lint and commit**

```bash
bun run typecheck
bun run build
bun run check:fix
bun run check
bun run test
git add package.json bun.lock vitest.config.ts src
git commit -m "feat: optimistic votes with per-post queueing and full rollback" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: everything passes, and the build succeeds. 34 test files, 254 tests.

---

### Task 9: The post page

**Files:**
- Modify: `package.json`, `bun.lock` (react-markdown)
- Create: `src/components/markdown.tsx`; Test: `src/components/markdown.test.tsx`
- Create: `src/components/ui/textarea.tsx`, `src/components/status-badge.tsx`, `src/features/posts/author-name.tsx`, `src/features/posts/post-editor.tsx`
- Create: `src/routes/p/$ref.tsx`; Regenerated: `src/routeTree.gen.ts`
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/tr.json` (`statuses`, `post`)

**Interfaces:**
- Consumes: from Task 8, `postQueryOptions`, `updatePost`, `deletePost`, `postKeys`, `VoteButton` and `SignInToVote`; from Task 3, `parseRef` and `PostDetail`; from Phase 1, `useLocaleControls`, `ApiError`, `apiErrorKey`, `meQueryOptions`, `FieldError`, `Input` and `Label`.
- Produces:
  - `<Markdown>{body}</Markdown>`, `<Textarea />`, `<StatusBadge status />` and `<AuthorName author />`
  - `<PostEditor post onDone />`
  - The route `/p/$ref`. A ref without an id, or an unknown id, shows "not found". A stale slug redirects with `replace` to the current ref.

- [ ] **Step 1: Install react-markdown and write the failing test**

```bash
bun add react-markdown@^10.1.0
```

`src/components/markdown.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Markdown } from "./markdown";

afterEach(cleanup);

describe("Markdown", () => {
  it("renders formatting and lists", () => {
    render(
      <Markdown>{"Please add **dark mode**:\n\n- at night\n- on mobile"}</Markdown>
    );
    expect(screen.getByText("dark mode").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("drops raw HTML", () => {
    const { container } = render(
      <Markdown>
        {'Hi <img src="x" onerror="alert(1)"> <script>alert(2)</script>'}
      </Markdown>
    );
    expect(container.querySelector("img, script")).toBeNull();
  });

  it("empties javascript: links", () => {
    render(<Markdown>{"[click me](javascript:alert(1))"}</Markdown>);
    expect(screen.getByText("click me").getAttribute("href")).toBe("");
  });

  it("opens links in a new tab without passing authority or the address", () => {
    render(<Markdown>{"[docs](https://example.com)"}</Markdown>);
    const link = screen.getByRole("link", { name: "docs" });
    expect(link.getAttribute("rel")).toBe("nofollow ugc noopener noreferrer");
    expect(link.getAttribute("target")).toBe("_blank");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test src/components/markdown.test.tsx`
Expected: FAIL. The file can't import `./markdown`.

- [ ] **Step 3: Add the Markdown component**

`src/components/markdown.tsx`:

```tsx
import ReactMarkdown from "react-markdown";

/**
 * A post's body. Raw HTML is dropped, unsafe URLs (javascript: and the like)
 * are emptied by react-markdown's default URL transform, and links open in a
 * new tab without passing on the page's authority or its address.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="flex flex-col gap-3 break-words [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown
        skipHtml
        components={{
          a: ({ node: _node, children: text, ...props }) => (
            <a
              {...props}
              rel="nofollow ugc noopener noreferrer"
              target="_blank"
            >
              {text}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bun run test src/components/markdown.test.tsx`
Expected: PASS. 4 tests.

- [ ] **Step 5: Add the small components, the editor and the page**

`src/components/ui/textarea.tsx`:

```tsx
import { cn } from "cn";
import type * as React from "react";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-24 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
```

`src/components/status-badge.tsx`:

```tsx
import { useTranslations } from "use-intl";
import type { PostStatus } from "@/shared/status";

// Plain tones for now; Phase 5's visual pass revisits them.
const TONE: Record<PostStatus, string> = {
  open: "bg-muted text-foreground",
  under_review:
    "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  planned: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100",
  in_progress:
    "bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100",
  shipped:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  closed: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export function StatusBadge({ status }: { status: PostStatus }) {
  const t = useTranslations("statuses");
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-medium text-xs ${TONE[status]}`}
    >
      {t(status)}
    </span>
  );
}
```

`src/features/posts/author-name.tsx`:

```tsx
import { useTranslations } from "use-intl";
import type { PostSummary } from "@/shared/posts";

/** The author's name, or "Anonymous" before they pick one or once they're gone. */
export function AuthorName({ author }: { author: PostSummary["author"] }) {
  const t = useTranslations("post");
  return <span>{author?.name || t("anonymous")}</span>;
}
```

`src/features/posts/post-editor.tsx`:

```tsx
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorKey } from "@/lib/error-text";
import { postKeys } from "@/lib/keys";
import { updatePost } from "@/lib/posts";
import type { PostDetail } from "@/shared/posts";
import { postFormSchema } from "@/shared/schemas";

export function PostEditor({
  post,
  onDone,
}: {
  post: PostDetail;
  onDone: () => void;
}) {
  const t = useTranslations("post");
  const tErrors = useTranslations("errors");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { title: post.title, body: post.body },
    validators: { onSubmit: postFormSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      try {
        const updated = await updatePost(post.id, value);
        qc.setQueryData(postKeys.detail(post.id), updated);
        await qc.invalidateQueries({
          queryKey: postKeys.feeds(post.workspace.slug),
        });
        onDone();
        // A new title means a new address; the old one keeps redirecting.
        if (updated.ref !== post.ref) {
          await navigate({
            to: "/p/$ref",
            params: { ref: updated.ref },
            replace: true,
          });
        }
      } catch (err) {
        setError(tErrors(apiErrorKey(err)));
      }
    },
  });

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="title">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor="post-title">{t("titleLabel")}</Label>
            <Input
              id="post-title"
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
            <FieldError errors={field.state.meta.errors} />
          </div>
        )}
      </form.Field>
      <form.Field name="body">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor="post-body">{t("bodyLabel")}</Label>
            <Textarea
              id="post-body"
              name={field.name}
              rows={6}
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
            <Button type="submit" disabled={isSubmitting}>
              {t("save")}
            </Button>
          )}
        </form.Subscribe>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
```

`src/routes/p/$ref.tsx`:

```tsx
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  notFound,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useFormatter, useNow, useTranslations } from "use-intl";
import { Markdown } from "@/components/markdown";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { AuthorName } from "@/features/posts/author-name";
import { PostEditor } from "@/features/posts/post-editor";
import { SignInToVote, VoteButton } from "@/features/votes/vote-button";
import { useLocaleControls } from "@/i18n/provider";
import { ApiError } from "@/lib/api";
import { apiErrorKey } from "@/lib/error-text";
import { postKeys } from "@/lib/keys";
import { deletePost, postQueryOptions } from "@/lib/posts";
import { meQueryOptions } from "@/lib/session";
import type { PostDetail } from "@/shared/posts";
import { parseRef } from "@/shared/ref";

export const Route = createFileRoute("/p/$ref")({
  loader: async ({ context, params }) => {
    const id = parseRef(params.ref);
    if (id === null) throw notFound();
    let post: PostDetail;
    try {
      post = await context.queryClient.ensureQueryData(postQueryOptions(id));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) throw notFound();
      throw error;
    }
    // An old or mistyped slug: show the post at its current address.
    if (post.ref !== params.ref) {
      throw redirect({
        to: "/p/$ref",
        params: { ref: post.ref },
        replace: true,
      });
    }
  },
  component: PostPage,
  notFoundComponent: PostNotFound,
});

function PostPage() {
  const { ref } = Route.useParams();
  // The loader turned away any ref without an id.
  const id = parseRef(ref) ?? 0;
  const { data: post } = useSuspenseQuery(postQueryOptions(id));
  const me = useQuery(meQueryOptions);
  const { setWorkspaceDefault } = useLocaleControls();
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const [editing, setEditing] = useState(false);

  // As on the workspace's own pages: visitors who haven't picked a language
  // see the workspace's default.
  useEffect(() => {
    setWorkspaceDefault(post.workspace.defaultLocale);
    return () => setWorkspaceDefault(null);
  }, [post.workspace.defaultLocale, setWorkspaceDefault]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <Link
        to="/$ws"
        params={{ ws: post.workspace.slug }}
        className="text-muted-foreground text-sm hover:underline"
      >
        ← {post.workspace.name}
      </Link>
      <article className="flex gap-4">
        {me.data?.user ? (
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
              <h1 className="font-semibold text-2xl">{post.title}</h1>
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
    </main>
  );
}

function PostActions({
  post,
  onEdit,
}: {
  post: PostDetail;
  onEdit: () => void;
}) {
  const t = useTranslations("post");
  const tErrors = useTranslations("errors");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => deletePost(post.id),
    onSuccess: async () => {
      // Leave first: dropping the cached post under this page would refetch it.
      await navigate({ to: "/$ws", params: { ws: post.workspace.slug } });
      qc.removeQueries({ queryKey: postKeys.detail(post.id) });
      await qc.invalidateQueries({
        queryKey: postKeys.feeds(post.workspace.slug),
      });
    },
    onError: (error) => {
      toast.error(tErrors(apiErrorKey(error)));
    },
  });

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={onEdit}>
        {t("edit")}
      </Button>
      {confirming ? (
        <Button
          size="sm"
          variant="destructive"
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
        >
          {t("confirmDelete")}
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
          {t("delete")}
        </Button>
      )}
    </div>
  );
}

function PostNotFound() {
  const t = useTranslations("post");
  return (
    <p className="mx-auto max-w-3xl px-6 py-16 text-muted-foreground">
      {t("notFound")}
    </p>
  );
}
```

Add two namespaces to `src/i18n/messages/en.json`:

```json
  "statuses": {
    "open": "Open",
    "under_review": "Under review",
    "planned": "Planned",
    "in_progress": "In progress",
    "shipped": "Shipped",
    "closed": "Closed"
  },
  "post": {
    "anonymous": "Anonymous",
    "titleLabel": "Title",
    "bodyLabel": "Details (optional)",
    "bodyHint": "Markdown works: **bold**, lists, links.",
    "edit": "Edit",
    "delete": "Delete",
    "confirmDelete": "Confirm delete",
    "save": "Save",
    "cancel": "Cancel",
    "notFound": "This request doesn't exist or was deleted."
  },
```

And the same two to `src/i18n/messages/tr.json`:

```json
  "statuses": {
    "open": "Açık",
    "under_review": "İnceleniyor",
    "planned": "Planlandı",
    "in_progress": "Yapılıyor",
    "shipped": "Yayında",
    "closed": "Kapatıldı"
  },
  "post": {
    "anonymous": "Anonim",
    "titleLabel": "Başlık",
    "bodyLabel": "Ayrıntılar (isteğe bağlı)",
    "bodyHint": "Markdown kullanabilirsiniz: **kalın**, listeler, bağlantılar.",
    "edit": "Düzenle",
    "delete": "Sil",
    "confirmDelete": "Silmeyi onayla",
    "save": "Kaydet",
    "cancel": "Vazgeç",
    "notFound": "Bu istek yok ya da silinmiş."
  },
```

- [ ] **Step 6: Regenerate the route tree, run everything, and commit**

The router plugin writes `src/routeTree.gen.ts` during a build, and typecheck needs the new route in it, so build first.

```bash
bun run build
bun run typecheck
bun run check:fix
bun run check
bun run test
git add package.json bun.lock src
git commit -m "feat: post page with safe Markdown, editing and two-step delete" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: everything passes. 35 test files, 258 tests. The click-through for this page happens in Task 13.

---

### Task 10: The submit form with similar requests

**Files:**
- Create: `src/features/submit/form-schema.ts`; Test: `src/features/submit/form-schema.test.ts`
- Create: `src/lib/use-debounced-value.ts`, `src/features/submit/similar-panel.tsx`
- Create: `src/routes/$ws/new.tsx`; Regenerated: `src/routeTree.gen.ts`
- Modify: `src/lib/session.ts` (`updateMe`), `src/i18n/messages/en.json`, `src/i18n/messages/tr.json` (`submit`)

**Interfaces:**
- Consumes: from Task 8, `similarQueryOptions`, `createPost`, `postKeys` and `VoteButton`; from Task 9, `StatusBadge`, `Textarea` and `post.*` labels; from Task 3, `displayNameSchema`, `postTitleSchema` and `postBodySchema`; from Task 1, `PATCH /api/me`.
- Produces:
  - `submitFormSchema(needsName: boolean)`
  - `useDebouncedValue<T>(value: T, delayMs: number): T`
  - `updateMe(name: string)`
  - `<SimilarPanel workspace title />`
  - The route `/$ws/new?board=<slug>`. It's for signed-in people only; anyone else is sent to sign-in and back.

- [ ] **Step 1: Write the failing test**

`src/features/submit/form-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { submitFormSchema } from "./form-schema";

const BOARD = "0b3f5c1e-8f5a-4c3e-9a51-2b7d0c9e4f11";
const values = (overrides: Partial<Record<string, string>> = {}) => ({
  name: "",
  boardId: BOARD,
  title: "Dark mode",
  body: "",
  ...overrides,
});

describe("submitFormSchema", () => {
  it("asks for a name while the person has none", () => {
    expect(submitFormSchema(true).safeParse(values()).success).toBe(false);
  });

  it("ignores the name field otherwise", () => {
    expect(submitFormSchema(false).safeParse(values()).success).toBe(true);
  });

  it("refuses a title under 3 characters", () => {
    const parsed = submitFormSchema(false).safeParse(values({ title: "ab" }));
    expect(parsed.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test src/features/submit/form-schema.test.ts`
Expected: FAIL. The file can't import `./form-schema`.

- [ ] **Step 3: Add the schema**

`src/features/submit/form-schema.ts`:

```ts
import { z } from "zod";
import {
  displayNameSchema,
  postBodySchema,
  postTitleSchema,
} from "@/shared/schemas";

/** The new-request form. The name is required only while the person has none. */
export function submitFormSchema(needsName: boolean) {
  return z.object({
    name: needsName ? displayNameSchema : z.string(),
    boardId: z.uuid(),
    title: postTitleSchema,
    body: postBodySchema,
  });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bun run test src/features/submit/form-schema.test.ts`
Expected: PASS. 3 tests.

- [ ] **Step 5: Add the panel and the page**

`src/lib/session.ts` already imports `api` and `unwrap`. Append:

```ts
/** Sets the signed-in person's display name. */
export async function updateMe(name: string) {
  return unwrap(await api.me.$patch({ json: { name } }));
}
```

`src/lib/use-debounced-value.ts`:

```ts
import { useEffect, useState } from "react";

/** `value`, once it has stopped changing for `delayMs`. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}
```

`src/features/submit/similar-panel.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { StatusBadge } from "@/components/status-badge";
import { VoteButton } from "@/features/votes/vote-button";
import { similarQueryOptions } from "@/lib/posts";
import { useDebouncedValue } from "@/lib/use-debounced-value";

/**
 * Requests like the title being typed, each with a one-click vote. Links open
 * in a new tab so the draft stays put.
 */
export function SimilarPanel({
  workspace,
  title,
}: {
  workspace: string;
  title: string;
}) {
  const t = useTranslations("submit");
  const q = useDebouncedValue(title.trim(), 300);
  const similar = useQuery(similarQueryOptions(workspace, q));
  const items = similar.data ?? [];
  if (q.length < 3 || items.length === 0) return null;

  return (
    <aside
      className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3"
      aria-live="polite"
    >
      <div>
        <h3 className="font-medium text-sm">{t("similarHeading")}</h3>
        <p className="text-muted-foreground text-xs">{t("similarHint")}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((post) => (
          <li key={post.id} className="flex items-center gap-3">
            <VoteButton
              postId={post.id}
              title={post.title}
              voted={post.voted}
              voteCount={post.voteCount}
            />
            <a
              href={`/p/${post.ref}`}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 truncate text-sm hover:underline"
            >
              {post.title}
            </a>
            <StatusBadge status={post.status} />
          </li>
        ))}
      </ul>
    </aside>
  );
}
```

`src/routes/$ws/new.tsx`:

```tsx
import { useForm } from "@tanstack/react-form";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  redirect,
  useBlocker,
  useNavigate,
} from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useTranslations } from "use-intl";
import { z } from "zod";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitFormSchema } from "@/features/submit/form-schema";
import { SimilarPanel } from "@/features/submit/similar-panel";
import { apiErrorKey } from "@/lib/error-text";
import { postKeys } from "@/lib/keys";
import { createPost } from "@/lib/posts";
import { meQueryOptions, updateMe } from "@/lib/session";
import { workspaceQueryOptions } from "@/lib/workspaces";

export const Route = createFileRoute("/$ws/new")({
  validateSearch: z.object({ board: z.string().optional().catch(undefined) }),
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    if (!me.user) {
      throw redirect({ to: "/signin", search: { redirect: location.href } });
    }
  },
  component: NewRequest,
});

function NewRequest() {
  const { ws } = Route.useParams();
  const search = Route.useSearch();
  const { data: workspace } = useSuspenseQuery(workspaceQueryOptions(ws));
  const { data: me } = useSuspenseQuery(meQueryOptions);
  const t = useTranslations("submit");
  const tPost = useTranslations("post");
  const tWorkspace = useTranslations("workspace");
  const tErrors = useTranslations("errors");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const currentName = me.user?.name ?? "";
  // Ask for a name while the person has none; afterwards only on request.
  const [askName, setAskName] = useState(currentName === "");
  const [formError, setFormError] = useState<string | null>(null);
  const submitted = useRef(false);
  const schema = useMemo(() => submitFormSchema(askName), [askName]);
  const startBoard =
    workspace.boards.find((board) => board.slug === search.board) ??
    workspace.boards[0];

  const form = useForm({
    defaultValues: {
      name: currentName,
      boardId: startBoard?.id ?? "",
      title: "",
      body: "",
    },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        if (askName && value.name.trim() !== currentName) {
          await updateMe(value.name);
          await qc.invalidateQueries({ queryKey: meQueryOptions.queryKey });
        }
        const post = await createPost(ws, {
          boardId: value.boardId,
          title: value.title,
          body: value.body,
        });
        submitted.current = true;
        qc.setQueryData(postKeys.detail(post.id), post);
        await qc.invalidateQueries({ queryKey: postKeys.feeds(ws) });
        await navigate({ to: "/p/$ref", params: { ref: post.ref } });
      } catch (error) {
        setFormError(tErrors(apiErrorKey(error)));
      }
    },
  });

  // A typed draft is easy to lose by following a link; ask first.
  useBlocker({
    shouldBlockFn: () => {
      if (submitted.current || !form.state.isDirty) return false;
      return !window.confirm(t("leaveConfirm"));
    },
    enableBeforeUnload: () => !submitted.current && form.state.isDirty,
  });

  if (workspace.boards.length === 0) {
    return <p className="text-muted-foreground">{tWorkspace("noBoards")}</p>;
  }

  return (
    <section className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-xl">{t("title")}</h2>
        <p className="text-muted-foreground text-sm">{t("intro")}</p>
      </div>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        {askName ? (
          <form.Field name="name">
            {(field) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor="submit-name">{t("nameLabel")}</Label>
                <Input
                  id="submit-name"
                  name={field.name}
                  autoComplete="name"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  {t("nameHint")}
                </p>
                <FieldError errors={field.state.meta.errors} />
              </div>
            )}
          </form.Field>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("postingAs", { name: currentName })}{" "}
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => setAskName(true)}
            >
              {t("changeName")}
            </Button>
          </p>
        )}
        <form.Field name="boardId">
          {(field) => (
            <div className="flex flex-col gap-2">
              <Label htmlFor="submit-board">{t("boardLabel")}</Label>
              <select
                id="submit-board"
                name={field.name}
                className="h-9 rounded-md border bg-transparent px-3 text-sm"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
              >
                {workspace.boards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </form.Field>
        <form.Field name="title">
          {(field) => (
            <div className="flex flex-col gap-2">
              <Label htmlFor="submit-title">{tPost("titleLabel")}</Label>
              <Input
                id="submit-title"
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <FieldError errors={field.state.meta.errors} />
              <SimilarPanel workspace={ws} title={field.state.value} />
            </div>
          )}
        </form.Field>
        <form.Field name="body">
          {(field) => (
            <div className="flex flex-col gap-2">
              <Label htmlFor="submit-body">{tPost("bodyLabel")}</Label>
              <Textarea
                id="submit-body"
                name={field.name}
                rows={6}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                {tPost("bodyHint")}
              </p>
              <FieldError errors={field.state.meta.errors} />
            </div>
          )}
        </form.Field>
        {formError && (
          <p className="text-destructive text-sm" role="alert">
            {formError}
          </p>
        )}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" className="self-start" disabled={isSubmitting}>
              {t("submit")}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </section>
  );
}
```

Add the `submit` namespace to `src/i18n/messages/en.json`:

```json
  "submit": {
    "title": "New request",
    "intro": "Describe one idea or problem. Look through similar requests first: a vote there counts too.",
    "nameLabel": "Your name",
    "nameHint": "Shown with your request.",
    "postingAs": "Posting as {name}.",
    "changeName": "Change",
    "boardLabel": "Board",
    "similarHeading": "Similar requests",
    "similarHint": "Already requested? Vote instead of posting it again.",
    "submit": "Post request",
    "leaveConfirm": "Leave this page? Your draft will be lost."
  },
```

And to `src/i18n/messages/tr.json`:

```json
  "submit": {
    "title": "Yeni istek",
    "intro": "Tek bir fikri ya da sorunu anlatın. Önce benzer isteklere göz atın: oradaki bir oy da sayılır.",
    "nameLabel": "Adınız",
    "nameHint": "İsteğinizle birlikte gösterilir.",
    "postingAs": "{name} olarak gönderiyorsunuz.",
    "changeName": "Değiştir",
    "boardLabel": "Pano",
    "similarHeading": "Benzer istekler",
    "similarHint": "Daha önce istenmiş mi? Yeniden göndermek yerine oy verin.",
    "submit": "İsteği gönder",
    "leaveConfirm": "Bu sayfadan ayrılsın mı? Taslağınız kaybolacak."
  },
```

- [ ] **Step 6: Regenerate the route tree, run everything, and commit**

```bash
bun run build
bun run typecheck
bun run check:fix
bun run check
bun run test
git add src
git commit -m "feat: submit form that shows similar requests while you type" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: everything passes. 36 test files, 261 tests.

---

### Task 11: The feed page

**Files:**
- Create: `src/features/feed/search.ts`; Test: `src/features/feed/search.test.ts`
- Create: `src/features/feed/feed-toolbar.tsx`, `src/features/posts/post-card.tsx`
- Modify (rewrite): `src/routes/$ws/index.tsx`; Regenerated: `src/routeTree.gen.ts`
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/tr.json` (`feed`; drop the unused `workspace.noRequestsYet` and `workspace.boards`)

**Interfaces:**
- Consumes: from Task 8, `feedQueryOptions`, `FeedParams`, `VoteButton` and `SignInToVote`; from Task 9, `StatusBadge` and `AuthorName`; from Task 10, `useDebouncedValue` and the `/$ws/new` route; from Task 3, `FEED_SORTS` and `POST_STATUSES`.
- Produces:
  - `feedSearchSchema`, `type FeedSearch` and `feedParams(search: FeedSearch): FeedParams`
  - `<FeedToolbar boards params rawQuery onChange />`
  - `<PostCard post signedIn now />`
  - The feed at `/$ws?board=&sort=&status=&q=&page=`.

- [ ] **Step 1: Write the failing test**

`src/features/feed/search.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { feedParams, feedSearchSchema } from "./search";

const read = (raw: Record<string, unknown>) =>
  feedParams(feedSearchSchema.parse(raw));

describe("feed URL state", () => {
  it.each([{ sort: "hot" }, { page: 0 }, { status: "done" }])(
    "falls back to the defaults for %j",
    (raw) => {
      expect(read(raw)).toEqual({
        board: undefined,
        sort: "trending",
        status: undefined,
        q: undefined,
        page: 1,
      });
    }
  );

  it("keeps valid values", () => {
    expect(
      read({ board: "bugs", sort: "top", status: "planned", q: "dark", page: 2 })
    ).toEqual({
      board: "bugs",
      sort: "top",
      status: "planned",
      q: "dark",
      page: 2,
    });
  });

  it("drops a blank search", () => {
    expect(read({ q: "   " }).q).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test src/features/feed/search.test.ts`
Expected: FAIL. The file can't import `./search`.

- [ ] **Step 3: Add the URL state**

`src/features/feed/search.ts`:

```ts
import { z } from "zod";
import type { FeedParams } from "@/lib/keys";
import { FEED_SORTS } from "@/shared/schemas";
import { POST_STATUSES } from "@/shared/status";

/** The feed's URL state. A bad value falls back to its default, not an error page. */
export const feedSearchSchema = z.object({
  board: z.string().max(40).optional().catch(undefined),
  sort: z.enum(FEED_SORTS).optional().catch(undefined),
  status: z.enum(POST_STATUSES).optional().catch(undefined),
  q: z.string().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
});

export type FeedSearch = z.infer<typeof feedSearchSchema>;

export function feedParams(search: FeedSearch): FeedParams {
  return {
    board: search.board,
    sort: search.sort ?? "trending",
    status: search.status,
    q: search.q?.trim() || undefined,
    page: search.page ?? 1,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bun run test src/features/feed/search.test.ts`
Expected: PASS. 5 tests.

- [ ] **Step 5: Add the toolbar, the card and the page**

`src/features/feed/feed-toolbar.tsx`:

```tsx
import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FeedParams } from "@/lib/keys";
import { FEED_SORTS } from "@/shared/schemas";
import { POST_STATUSES } from "@/shared/status";
import type { FeedSearch } from "./search";

type Props = {
  boards: { slug: string; name: string }[];
  params: FeedParams;
  /** The search box's text as typed: `params.q` is trimmed. */
  rawQuery: string;
  onChange: (next: Partial<FeedSearch>, options?: { replace?: boolean }) => void;
};

export function FeedToolbar({ boards, params, rawQuery, onChange }: Props) {
  const t = useTranslations("feed");
  const tStatus = useTranslations("statuses");
  return (
    <div className="flex flex-col gap-3">
      <nav className="flex flex-wrap gap-1" aria-label={t("boards")}>
        <Button
          size="sm"
          variant={params.board ? "ghost" : "secondary"}
          aria-pressed={!params.board}
          onClick={() => onChange({ board: undefined })}
        >
          {t("allBoards")}
        </Button>
        {boards.map((board) => (
          <Button
            key={board.slug}
            size="sm"
            variant={params.board === board.slug ? "secondary" : "ghost"}
            aria-pressed={params.board === board.slug}
            onClick={() => onChange({ board: board.slug })}
          >
            {board.name}
          </Button>
        ))}
      </nav>
      <div className="flex flex-wrap items-center gap-2">
        <fieldset className="flex gap-1">
          <legend className="sr-only">{t("sortLabel")}</legend>
          {FEED_SORTS.map((sort) => (
            <Button
              key={sort}
              size="sm"
              variant={params.sort === sort ? "secondary" : "ghost"}
              aria-pressed={params.sort === sort}
              onClick={() =>
                onChange({ sort: sort === "trending" ? undefined : sort })
              }
            >
              {t(`sort.${sort}`)}
            </Button>
          ))}
        </fieldset>
        <label className="sr-only" htmlFor="feed-status">
          {t("statusLabel")}
        </label>
        <select
          id="feed-status"
          className="h-8 rounded-md border bg-transparent px-2 text-sm"
          value={params.status ?? ""}
          onChange={(event) =>
            onChange({
              status: (event.target.value || undefined) as FeedSearch["status"],
            })
          }
        >
          <option value="">{t("allStatuses")}</option>
          {POST_STATUSES.map((status) => (
            <option key={status} value={status}>
              {tStatus(status)}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="feed-search">
          {t("searchLabel")}
        </label>
        <Input
          id="feed-search"
          type="search"
          className="w-48"
          placeholder={t("searchPlaceholder")}
          value={rawQuery}
          onChange={(event) =>
            onChange({ q: event.target.value || undefined }, { replace: true })
          }
        />
      </div>
    </div>
  );
}
```

`src/features/posts/post-card.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { useFormatter } from "use-intl";
import { StatusBadge } from "@/components/status-badge";
import { SignInToVote, VoteButton } from "@/features/votes/vote-button";
import type { PostSummary } from "@/shared/posts";
import { AuthorName } from "./author-name";

type Props = { post: PostSummary; signedIn: boolean; now: Date };

export function PostCard({ post, signedIn, now }: Props) {
  const format = useFormatter();
  return (
    <li className="flex gap-4 rounded-lg border p-4">
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
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          to="/p/$ref"
          params={{ ref: post.ref }}
          className="font-medium hover:underline"
        >
          {post.title}
        </Link>
        {post.excerpt && (
          <p className="line-clamp-2 text-muted-foreground text-sm">
            {post.excerpt}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
          <StatusBadge status={post.status} />
          <span>{post.board.name}</span>
          <span aria-hidden="true">·</span>
          <AuthorName author={post.author} />
          <span aria-hidden="true">·</span>
          <time dateTime={post.createdAt}>
            {format.relativeTime(new Date(post.createdAt), now)}
          </time>
        </div>
      </div>
    </li>
  );
}
```

`src/routes/$ws/index.tsx` (full replacement):

```tsx
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useNow, useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { FeedToolbar } from "@/features/feed/feed-toolbar";
import {
  type FeedSearch,
  feedParams,
  feedSearchSchema,
} from "@/features/feed/search";
import { PostCard } from "@/features/posts/post-card";
import { feedQueryOptions } from "@/lib/posts";
import { meQueryOptions } from "@/lib/session";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { workspaceQueryOptions } from "@/lib/workspaces";

export const Route = createFileRoute("/$ws/")({
  validateSearch: feedSearchSchema,
  component: Feed,
});

function Feed() {
  const { ws } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: workspace } = useSuspenseQuery(workspaceQueryOptions(ws));
  const me = useQuery(meQueryOptions);
  const t = useTranslations("feed");
  const tWorkspace = useTranslations("workspace");
  const now = useNow({ updateInterval: 60_000 });
  const params = feedParams(search);
  // The URL follows every keystroke; the request waits for a pause in typing.
  const q = useDebouncedValue(params.q, 300);
  const feed = useQuery(feedQueryOptions(ws, { ...params, q }));
  const signedIn = Boolean(me.data?.user);

  // A filter change goes back to the first page. Typing replaces the history
  // entry instead of adding one per letter.
  const update = (
    next: Partial<FeedSearch>,
    options: { replace?: boolean } = {}
  ) =>
    navigate({
      search: (prev) => ({ ...prev, ...next, page: undefined }),
      replace: options.replace,
    });
  const goToPage = (page: number) =>
    navigate({
      search: (prev) => ({ ...prev, page: page > 1 ? page : undefined }),
    });

  if (workspace.boards.length === 0) {
    return <p className="text-muted-foreground">{tWorkspace("noBoards")}</p>;
  }

  const items = feed.data?.items ?? [];
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <FeedToolbar
          boards={workspace.boards}
          params={params}
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
      ) : feed.isError ? (
        <p className="text-destructive text-sm" role="alert">
          {t("loadFailed")}
        </p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground">
          {params.q ? t("emptySearch") : t("empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((post) => (
            <PostCard key={post.id} post={post} signedIn={signedIn} now={now} />
          ))}
        </ul>
      )}
      {(params.page > 1 || feed.data?.hasMore) && (
        <nav
          className="flex items-center justify-between"
          aria-label={t("pages")}
        >
          <Button
            variant="outline"
            size="sm"
            disabled={params.page <= 1}
            onClick={() => goToPage(params.page - 1)}
          >
            {t("previous")}
          </Button>
          <span className="text-muted-foreground text-sm">
            {t("page", { page: params.page })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!feed.data?.hasMore}
            onClick={() => goToPage(params.page + 1)}
          >
            {t("next")}
          </Button>
        </nav>
      )}
    </section>
  );
}
```

Add the `feed` namespace to `src/i18n/messages/en.json`, and remove `noRequestsYet` and `boards` from its `workspace` namespace:

```json
  "feed": {
    "boards": "Boards",
    "allBoards": "All boards",
    "sortLabel": "Sort",
    "sort": { "trending": "Trending", "top": "Top", "new": "New" },
    "statusLabel": "Status",
    "allStatuses": "All statuses",
    "searchLabel": "Search requests",
    "searchPlaceholder": "Search requests…",
    "newRequest": "New request",
    "loading": "Loading…",
    "loadFailed": "Couldn't load requests. Reload the page to try again.",
    "empty": "No requests here yet.",
    "emptySearch": "No requests match your search.",
    "pages": "Pages",
    "previous": "Previous",
    "next": "Next",
    "page": "Page {page}"
  },
```

Do the same in `src/i18n/messages/tr.json`:

```json
  "feed": {
    "boards": "Panolar",
    "allBoards": "Tüm panolar",
    "sortLabel": "Sıralama",
    "sort": { "trending": "Gündemde", "top": "En çok oy alan", "new": "En yeni" },
    "statusLabel": "Durum",
    "allStatuses": "Tüm durumlar",
    "searchLabel": "İsteklerde ara",
    "searchPlaceholder": "İsteklerde ara…",
    "newRequest": "Yeni istek",
    "loading": "Yükleniyor…",
    "loadFailed": "İstekler yüklenemedi. Tekrar denemek için sayfayı yenileyin.",
    "empty": "Burada henüz istek yok.",
    "emptySearch": "Aramanızla eşleşen istek yok.",
    "pages": "Sayfalar",
    "previous": "Önceki",
    "next": "Sonraki",
    "page": "Sayfa {page}"
  },
```

- [ ] **Step 6: Regenerate the route tree, run everything, and commit**

```bash
bun run build
bun run typecheck
bun run check:fix
bun run check
bun run test
git add src
git commit -m "feat: feed page with sorting, filters and search kept in the URL" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: everything passes. 37 test files, 266 tests. Only the old feed used the two removed `workspace.*` keys, and `src/routes/$ws.tsx` keeps using the rest of that namespace.

---

### Task 12: Link previews for shared posts

**Files:**
- Modify: `wrangler.jsonc` (an `ASSETS` binding, plus `/p/*` in `run_worker_first`); Regenerated: `worker-configuration.d.ts`
- Modify: `index.html` (default meta tags), `worker/index.ts` (a fetch handler that sends `/p/*` to `og.ts`), `worker/services/posts.ts` (`findPostMeta`)
- Create: `worker/og.ts`; Test: `worker/og.test.ts`

**Interfaces:**
- Consumes: `createDb`; `parseRef`, `postRef` and `excerpt` from Task 3; the `posts` and `organization` tables.
- Produces:
  - `findPostMeta(db, id): Promise<{ id, title, body, workspaceName } | null>`
  - `postMeta(post): { title, description, canonicalPath }` and `escapeAttribute(value): string`
  - `renderPostPage(request, env, ctx): Promise<Response>`
  - `worker/index.ts` exports `{ fetch } satisfies ExportedHandler<Env>`.

- [ ] **Step 1: Write the failing test**

`worker/og.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { escapeAttribute, postMeta } from "./og";

describe("postMeta", () => {
  const post = {
    id: 12,
    title: "Dark mode",
    body: "Please add a **dark** theme for night use.",
    workspaceName: "Acme",
  };

  it("titles the page with the post and its workspace", () => {
    expect(postMeta(post).title).toBe("Dark mode · Acme");
  });

  it("describes it with the start of the body", () => {
    expect(postMeta(post).description).toBe(
      "Please add a dark theme for night use."
    );
  });

  it("falls back to the workspace when the body is empty", () => {
    expect(postMeta({ ...post, body: "" }).description).toBe(
      "A request on Acme's board"
    );
  });

  it("points at the post's current address", () => {
    expect(postMeta(post).canonicalPath).toBe("/p/12-dark-mode");
  });
});

describe("escapeAttribute", () => {
  it("escapes what could end an attribute or start a tag", () => {
    expect(escapeAttribute(`a&b"c<d>e`)).toBe("a&amp;b&quot;c&lt;d&gt;e");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test worker/og.test.ts`
Expected: FAIL. The file can't import `./og`.

- [ ] **Step 3: Add the meta builder and the page renderer**

In `worker/services/posts.ts`, append:

```ts
/** The few fields a link preview needs. */
export async function findPostMeta(db: Database, id: number) {
  const [row] = await db
    .select({
      id: posts.id,
      title: posts.title,
      body: posts.body,
      workspaceName: organization.name,
    })
    .from(posts)
    .innerJoin(organization, eq(organization.id, posts.organizationId))
    .where(eq(posts.id, id))
    .limit(1);
  return row ?? null;
}
```

`worker/og.ts`:

```ts
import { excerpt } from "@/shared/excerpt";
import { parseRef, postRef } from "@/shared/ref";
import { createDb } from "./db/client";
import { findPostMeta } from "./services/posts";

export type PostMeta = {
  title: string;
  description: string;
  canonicalPath: string;
};

/** What a link preview shows for a post. */
export function postMeta(post: {
  id: number;
  title: string;
  body: string;
  workspaceName: string;
}): PostMeta {
  return {
    title: `${post.title} · ${post.workspaceName}`,
    description:
      excerpt(post.body, 200) || `A request on ${post.workspaceName}'s board`,
    canonicalPath: `/p/${postRef(post.id, post.title)}`,
  };
}

/** For attribute values in the HTML this file writes itself. */
export function escapeAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const withStatus = (res: Response, status: number) =>
  new Response(res.body, { status, headers: res.headers });

/**
 * /p/:ref reaches the Worker before the assets layer. It answers with the
 * SPA shell, with the post's title and excerpt in the meta tags, so shared
 * links unfurl. A stale slug redirects to the current one. An unknown post
 * keeps the shell, where the SPA shows "not found", with a 404 for crawlers.
 */
export async function renderPostPage(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  const shell = await env.ASSETS.fetch(new Request(new URL("/", url)));
  const id = parseRef(url.pathname.slice("/p/".length));
  if (id === null) return withStatus(shell, 404);
  const { db, close } = createDb(env.HYPERDRIVE.connectionString);
  try {
    const post = await findPostMeta(db, id);
    if (!post) return withStatus(shell, 404);
    const meta = postMeta(post);
    if (url.pathname !== meta.canonicalPath) {
      const current = new URL(`${meta.canonicalPath}${url.search}`, url);
      return Response.redirect(current.toString(), 301);
    }
    const canonical = escapeAttribute(new URL(meta.canonicalPath, url).toString());
    return new HTMLRewriter()
      .on("title", {
        element: (el) => {
          el.setInnerContent(meta.title);
        },
      })
      .on('meta[name="description"], meta[property="og:description"]', {
        element: (el) => {
          el.setAttribute("content", meta.description);
        },
      })
      .on('meta[property="og:title"]', {
        element: (el) => {
          el.setAttribute("content", meta.title);
        },
      })
      .on("head", {
        element: (el) => {
          el.append(
            `<meta property="og:url" content="${canonical}"><link rel="canonical" href="${canonical}">`,
            { html: true }
          );
        },
      })
      .transform(shell);
  } finally {
    ctx.waitUntil(close());
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bun run test worker/og.test.ts`
Expected: PASS. 5 tests.

- [ ] **Step 5: Route `/p/*` to the Worker**

In `wrangler.jsonc`, give `assets` a binding and add `/p/*` to `run_worker_first`:

```jsonc
  "assets": {
    // og.ts reads the app shell through this binding.
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    // /p/* gets the shell with link-preview tags, so it skips the assets layer.
    "run_worker_first": ["/api", "/api/*", "/p/*"]
  },
```

Regenerate the bindings' types: `bun run cf-typegen`. Expected: `worker-configuration.d.ts` gains `ASSETS: Fetcher`. The drift guard still holds, because `Env` only grew.

`worker/index.ts` (full replacement):

```ts
import app from "./app";
import type { Bindings } from "./env";
import { renderPostPage } from "./og";

// The app types its bindings structurally (see env.ts), so tests can build
// them by hand. This line ties them back to what wrangler.jsonc and .dev.vars
// actually provide: rename or drop a binding there and the typecheck fails,
// instead of every test passing and production answering 500.
type Assert<T extends true> = T;
export type BindingsMatchWrangler = Assert<
  Env extends Bindings ? true : false
>;

// The Workers entry point. /p/* gets the app shell with the post's link
// preview; every other path run_worker_first sends here is the API. Cron
// triggers join this file in Phase 4.
export default {
  fetch(request, env, ctx) {
    if (new URL(request.url).pathname.startsWith("/p/")) {
      return renderPostPage(request, env, ctx);
    }
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
```

In `index.html`, add the default preview tags after the existing `description` meta. The Worker fills them in for posts.

```html
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Pano" />
    <meta property="og:title" content="Pano" />
    <meta property="og:description" content="Feedback boards and a public roadmap." />
    <meta name="twitter:card" content="summary" />
```

- [ ] **Step 6: Watch a shared link unfurl**

Stop any running dev server first. These commands insert a post into the dev database with a title full of characters that need escaping, check what `/p/*` serves, and remove the post again.

```bash
(bun run dev --port 5199 --strictPort > "${TMPDIR:-/tmp}/pano-dev.log" 2>&1 &)
curl -s -o /dev/null --retry 40 --retry-connrefused --retry-delay 1 --max-time 60 http://localhost:5199/api/health
psql -h 127.0.0.1 -d pano -q -c "insert into organization (id, name, slug, created_at) values ('og-check', 'OG Check', 'og-check', now())"
psql -h 127.0.0.1 -d pano -q -c "insert into boards (organization_id, slug, name) values ('og-check', 'ideas', 'Ideas')"
ID=$(psql -h 127.0.0.1 -d pano -Atq -c "insert into posts (organization_id, board_id, title, body, search_config) select 'og-check', id, 'Dark mode & \"quotes\" <b>', 'Please add a **dark** theme.', 'english' from boards where organization_id = 'og-check' returning id")
curl -s "http://localhost:5199/p/$ID-dark-mode-quotes-b" | grep -E '<title>|og:title|og:description|og:url'
curl -s "http://localhost:5199/p/$ID-dark-mode-quotes-b" | grep -c '<title>.*<b>'
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "http://localhost:5199/p/$ID-old-title?x=1"
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5199/p/999999999
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5199/p/abc
pkill -f "vite --port 5199"
psql -h 127.0.0.1 -d pano -q -c "delete from organization where id = 'og-check'"
```

Expected:
- The first `grep` prints:
  - `<title>Dark mode &amp; "quotes" &lt;b&gt; · OG Check</title>`
  - an `og:title` whose content holds the same title, with its double quotes written as `&quot;`, so they can't end the attribute
  - `og:description` with `Please add a dark theme.`
  - `og:url` with `http://localhost:5199/p/<id>-dark-mode-quotes-b`.
- `grep -c` prints `0`: no raw `<b>` reaches the title.
- The stale slug prints `301 http://localhost:5199/p/<id>-dark-mode-quotes-b?x=1`.
- The unknown post and `abc` each print `404`.

- [ ] **Step 7: Lint and commit**

```bash
bun run typecheck
bun run build
bun run check:fix
bun run check
bun run test
git add wrangler.jsonc worker-configuration.d.ts index.html worker/index.ts worker/og.ts worker/og.test.ts worker/services/posts.ts
git commit -m "feat: shared post links unfurl with the post's title and excerpt" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: everything passes. 38 test files, 271 tests.

---

### Task 13: Click through Phase 2 in both languages

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the README's notes on votes, search and link previews, and the `vote-drift` script.

- [ ] **Step 1: Click through it**

Run `bun run db:migrate`, then `bun run dev`, and open http://localhost:5173. Sign-in codes print in the terminal. A headless browser, Playwright for example, works too. The checks:
1. Sign in with a new email. Create a workspace with English as its default, then add the boards "Features" and "Bugs" in Settings.
2. **Submit:**
   - The workspace shows "No requests here yet." Press **New request**. The form asks for your name, because the account has none yet.
   - Enter "Ayşe", choose "Features", title "Dark mode", and details `Please add a **dark** theme. [Docs](https://example.com)`. Submit.
   - You land on `/p/<id>-dark-mode`. It shows the title, an "Open" badge, "Features · Ayşe · now", the bold text, and the vote button pressed at 1. The Docs link opens a new tab.
3. **Similar requests:**
   - Back on the feed, the post is listed.
   - Press **New request** again. The form says "Posting as Ayşe." Type "dark theme" as the title: "Similar requests" lists "Dark mode" with its vote button.
   - Click the workspace's **Requests** link. The browser asks whether to leave the draft; confirm.
4. **Voting, sorting and search** (a second email, in another browser or a private window):
   - Vote for "Dark mode" from the feed. It shows 2 at once, and still 2 after a reload.
   - Switch the sort to Top, then New. The URL follows (`?sort=top`), and Back restores the previous sort.
   - Search "darkk mod": "Dark mode" is found. Search "nothing like this": "No requests match your search."
5. **Two tabs, one account** (the phase's done-when):
   - Open the post in two tabs. Click its vote button quickly 5 times in the first tab and 4 times in the second. Wait two seconds and reload both: they show the same state and the same count.
   - Then run `psql -h 127.0.0.1 -d pano -c "select vote_count, (select count(*) from votes v where v.post_id = p.id) as vote_rows from posts p order by id desc limit 1"`. The two numbers are equal.
6. **Editing:** as Ayşe, edit the title to "Dark mode everywhere". The address changes to `/p/<id>-dark-mode-everywhere`, and opening the old address lands on the new one.
7. **Turkish:** press **TR**. The feed, the post page and the form are in Turkish: Gündemde, En çok oy alan, Yeni istek, Benzer istekler, and the badge reads "Açık".
8. **A Turkish workspace:** with the second account, create a workspace whose default is Türkçe, with a board "İstekler", and post "ÖZELLİK: Çoklu şube desteği". Searching its feed for "coklu sube" finds it.
9. **Signed out:** vote buttons show the counts and link to sign-in. Signing in returns you to the same page.
10. **Link preview:** `curl -s http://localhost:5173/p/<id>-dark-mode-everywhere | grep og:title` shows "Dark mode everywhere · <workspace name>".
11. **Deleting:** as Ayşe, delete the post with the two-step confirm. You land on the feed, and the post is gone.

If you can't drive a browser, hand these checks to your human partner, and record in the ledger that they confirmed them.

- [ ] **Step 2: Note the new parts in the README**

In `README.md`, add a row to the scripts table, after the `cf-typegen` row:

```markdown
| `bun run vote-drift` | BetterNews's vote toggle under 20 rapid clicks, next to Pano's votes (local test database) |
```

In "Layout and rules", add these bullets after the `worker/auth.ts` bullet:

```markdown
- `worker/services/`: the queries behind the routes. `votes.ts` locks the
  post row and writes the state the person asked for, so the count moves
  only by the rows that changed. `ranking.ts` (trending, top, new) and
  `similar.ts` serve the feed and the submit form.
- **Search** folds case and Turkish letters with the SQL function
  `pano_fold` (migration `0005_search_fold.sql`), on the stored `tsvector`
  and on the query alike, so results don't depend on the database's locale.
- `worker/og.ts`: `/p/*` reaches the Worker before the assets layer and gets
  the app shell with the post's link-preview meta tags.
```

- [ ] **Step 3: Run everything and commit**

```bash
bun run typecheck
bun run check
bun run test
bun run build
git add README.md
git commit -m "docs: votes, search and link previews in the README" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: everything passes. 38 test files, 271 tests.

---

## Phase 2 done when

- [ ] The vote tests pass (Task 5), and two tabs voting rapidly agree once everything settles (Task 13, check 5).
- [ ] `bun run typecheck`, `bun run check`, `bun run test` (38 files, 271 tests) and `bun run build` all pass, and the CI sequence passes locally against a fresh database (Phase 0's Task 5, Step 3).
- [ ] `bun run vote-drift`'s output is in the ledger, for the Phase 5 portfolio entry.
- [ ] GitHub issue #1 closes when Task 1's commit reaches `main` on GitHub.
