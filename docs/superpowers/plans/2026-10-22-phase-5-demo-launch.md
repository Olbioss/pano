# Phase 5: Demo and Launch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pano is ready to show and to ship:
- a demo workspace that never looks empty, with "Try as team" and "Try as member"
- Pano's own board at `/pano`
- a landing page and a visual identity
- a Playwright suite that drives the production build

Part 2, run with you after the merge, deploys it and adds the portfolio entry.

**Architecture:**
- **Demo data:** `workspace_settings.is_demo`. `worker/demo/content.ts` describes Inkwell, a made-up notes app. `resetDemo` rebuilds it from that file in four statements. `bun run seed` and the nightly cron both run it.
- **Demo sign-in:** a Better Auth plugin endpoint, `POST /api/auth/demo/sign-in {as}`. Each visit makes its own guest account at `demo.pano.invalid`.
- **Demo rules:** `confineDemo` keeps demo accounts inside the demo. `readOnlyInDemo` locks the demo's settings. The demo never queues email.
- **Crons:** the five-minute email cron connects to Postgres only while a KV flag says emails wait. `0 1 * * *` resets the demo, then sends whatever is queued.
- **Client:** cork-board tokens and paper sheets, ink stamps for statuses, a landing page with a pinned mini roadmap, and the demo banner.

**Tech Stack:** the Phase 0–4 stack, plus `@fontsource-variable/familjen-grotesk` and `@playwright/test`.

**Spec:** `docs/superpowers/specs/2026-10-16-pano-design.md`, "Build order → 5. Demo and launch", with its Demo, Verification and "Steps that need your accounts" sections.

**Verified in a throwaway spike (2026-10-22):** worktree `scratchpad/p5-spike`, branch `spike/phase-5`.
- **Reset CPU:** the reset costs about 1.5 ms of CPU under Node. Its first, statement-per-table version cost 3–17 ms.
- **Vite plugin:** `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` reaches both `vite dev` and `vite preview`. `vite preview` uses the `.dev.vars` the build copies into `dist/pano/`. `.dev.vars` wins over `vars` in `wrangler.jsonc`.
- **Better Auth 1.7.10:** a plugin endpoint can create a user and a session and set the cookie (`internalAdapter.createUser(…, { method })`, `createSession`, `setSessionCookie`). Its database rate limit applies to the endpoint.
- **Spike results:** typecheck, Biome and the build passed. Three Playwright specs passed against the production build, on an existing database and on a fresh one. Run twice against a running server, as a live run would be, they left the demo as they found it.
- **This plan's own text, re-applied on a second throwaway branch:**
  - Every task's tests failed as each Step 2 says, then passed with the counts each task states, from 59 files and 448 tests up to 68 files and 510.
  - The end-to-end suite failed and then passed as Task 8 says.
  - The production code came out identical to the spike's.
  - That run fixed four things in here. `worker/config.test.ts` now reads `wrangler.jsonc` by path: the Workers runtime's `URL` fails Node's `readFileSync` types. And Tasks 2, 5 and 7 now say which tests fail first, and which already pass and why.

**Decided in this plan** (the spec leaves these open):
1. **Every visit gets its own guest** ("Guest 4821", or "Misafir 4821" in Turkish), not one shared login. Each visitor has their own votes and their own rate limits, and two browsers really are two people.
2. **Demo accounts act only in the demo:**
   - Posting, voting, commenting, following and creating workspaces elsewhere answer 403 `DEMO_ONLY`.
   - The demo's name, language and boards are read-only (`DEMO_READ_ONLY`). One "Delete board" would otherwise empty it for everyone.
   - A team guest can still delete, merge and move requests; the reset puts them back.
   - The spec's "can't change their password or delete the workspace" already holds: there are no passwords and no workspace deletion.
3. **The nightly reset** deletes demo accounts more than a day old. A guest who joined since keeps their account one more night, so nobody mid-demo at 01:00 writes as an account that's gone.
4. **The email cron sleeps with the database.**
   - Neon's free plan allows 100 CU-hours a month. A query every five minutes keeps a 0.25 CU compute awake around the clock: about 182 CU-hours, after which Neon suspends the database until the next month.
   - So a status change that queues emails raises a KV flag for 30 minutes. The five-minute cron connects only while the flag is up, and the nightly run also sends anything queued.
5. **Hyperdrive caching stays off** (`--caching-disabled`). Cached reads up to a minute old would make a vote seem to undo itself.
6. **Production URL:** `https://pano.olbios88.workers.dev`, the free workers.dev subdomain your portfolio already uses. Moving to a custom domain later changes only `BETTER_AUTH_URL`.
7. **`/pano`** is reserved. The seed makes it, with Features and Bugs boards, owned by the address in `PANO_OWNER_EMAIL`. That address never goes in the repo.
8. **Look:**
   - Paper on a cork board, blue-black ink, and signal orange only for actions.
   - Familjen Grotesk for headings, Geist for text, ink-stamp statuses and tabular counts.
   - Dark mode follows the system.
   - One stamp animation on the landing page, only for people who allow motion.
9. **Not added:** `workspace_settings.accent`. Nothing uses it, and Phase 1 left it out too.

**Still deferred:**
- Phase 2's six minors, Phase 3's nine and Phase 4's six, plus GitHub issues #2–#15.
- An `og:image`: link previews stay title and excerpt.
- A custom domain.

## Global Constraints

- **Repo and branch:** `~/repos/deploys/pano`, on branch `feat/phase-5-demo-launch` from `main`.
  - The repo is public. Nothing is pushed until the finishing step's choice.
  - Part 2 (accounts, deploy, push, portfolio) runs only with you.
- **Earlier phases still apply:** every Phase 0–4 Global Constraint holds.
- **New packages:**
  - `@fontsource-variable/familjen-grotesk` `^5.3.0`.
  - `@playwright/test` `1.63.0`, pinned exactly: its Chromium build, 1243, is the one cached on this Mac. CI installs its own.
- **Demo constants:**
  - Slug `demo`, workspace id `org_pano_demo`, name Inkwell.
  - Account domain `demo.pano.invalid`.
  - `/pano` has id `org_pano`.
- **Demo sign-in:** `POST /api/auth/demo/sign-in {as: "team" | "member"}`. In production, 5 per minute per address.
- **Error codes:** `DEMO_ONLY` (403) and `DEMO_READ_ONLY` (403), translated in English and Turkish.
- **Crons:**
  - `*/5 * * * *` runs only while the flag is up.
  - `0 1 * * *` resets the demo, then sends one batch of email.
  - KV binding `FLAGS`, key `outbox:pending`, which expires after 1800 s.
- **Free-plan limits:**
  - 10 ms of CPU per request and per cron run, and 5 cron triggers per account.
  - Hyperdrive 100k queries a day, KV 1k writes a day.
  - Neon 100 CU-hours a month, Brevo 300 emails a day.
- **Colors:** hex tokens in `src/styles.css`. Text pairs need at least 4.5:1 and form-field edges at least 3:1 (`test/palette.test.ts`).
- **Production vars** in `wrangler.jsonc`: `ENVIRONMENT=production` and `BETTER_AUTH_URL=https://pano.olbios88.workers.dev`. `.dev.vars` overrides both locally.

## Review Focus

1. **A visitor mid-demo when the nightly reset runs:** their account survives, and they're only off the rebuilt team. (Task 2's "keeps newer ones one more night".)
2. **A demo account aimed at a real workspace:** posting, voting, commenting, following and creating a workspace all answer 403 `DEMO_ONLY`. (Task 4.)
3. **One address hammering "Try as team":** the sixth sign-in in a minute answers 429, and the page says so. (Task 3's limit test, Task 7's toast test.)
4. **The demo shipping a request:** no email is queued, no flag goes up, and the database is never woken for it. (Tasks 4 and 5.)
5. **Someone signed in with a real account opening the landing page:** no demo buttons, which would sign them out. (Task 7.)

---

### Task 1: The demo's place in the data

**Files:**
- Create: `shared/demo.ts`, `shared/demo.test.ts`
- Modify: `shared/slug.ts`, `shared/slug.test.ts`, `worker/db/schema/workspaces.ts`, `worker/routes/workspaces.ts`, `worker/routes/workspaces.test.ts`
- Generate: `drizzle/0010_demo_workspace.sql`, `drizzle/meta/0010_snapshot.json`, and the new entry in `drizzle/meta/_journal.json`

**Interfaces:**
- Consumes: Phase 1's `workspaceSettings`, `findWorkspace`, `RESERVED_SLUGS` and `isReservedSlug`.
- Produces:
  - `shared/demo.ts`:
    - `DEMO_WORKSPACE_SLUG = "demo"`
    - `DEMO_EMAIL_DOMAIN = "demo.pano.invalid"`
    - `isDemoEmail(email: string): boolean`
    - `DEMO_ROLES = ["team", "member"] as const` and `type DemoRole`
  - `workspaceSettings.isDemo`: a `boolean` column, `is_demo`, not null, default `false`.
  - `WorkspaceSummary.isDemo: boolean`, carried by `GET`, `POST` and `PATCH /api/workspaces…`.
  - `demo` and `pano` are reserved addresses.

- [ ] **Step 1: Create the branch**

```bash
cd ~/repos/deploys/pano
git switch -c feat/phase-5-demo-launch
```

- [ ] **Step 2: Write the failing tests**

`shared/demo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEMO_EMAIL_DOMAIN, isDemoEmail } from "./demo";

describe("isDemoEmail", () => {
  it("knows a demo address, whatever its case", () => {
    expect(isDemoEmail(`guest-1@${DEMO_EMAIL_DOMAIN}`)).toBe(true);
    expect(isDemoEmail("Defne@Demo.Pano.Invalid")).toBe(true);
  });

  it("leaves every other address alone", () => {
    expect(isDemoEmail("ayse@example.com")).toBe(false);
    // The whole domain, not a domain that merely ends the same way.
    expect(isDemoEmail("someone@notdemo.pano.invalid")).toBe(false);
  });
});
```

In `shared/slug.test.ts`, replace the reserved-slug test:

```ts
  it.each(["api", "signin", "new-workspace", "p"])("reserves %s", (slug) => {
    expect(isReservedSlug(slug)).toBe(true);
  });
```

with:

```ts
  it.each(["api", "signin", "new-workspace", "p", "demo", "pano"])(
    "reserves %s",
    (slug) => {
      expect(isReservedSlug(slug)).toBe(true);
    }
  );
```

In `worker/routes/workspaces.test.ts`, the first test ("creates a workspace and makes its creator the owner") expects the new workspace back. Add `isDemo: false` after `defaultLocale: "tr",` in that expected `data`:

```ts
        name: "Rezerve",
        defaultLocale: "tr",
        isDemo: false,
      },
```

- [ ] **Step 3: Run them to verify they fail**

Run: `bun run test shared/demo.test.ts shared/slug.test.ts worker/routes/workspaces.test.ts`

Expected: FAIL.
- `shared/demo.test.ts` can't import `./demo`.
- "reserves demo" and "reserves pano" fail.
- "creates a workspace and makes its creator the owner" receives no `isDemo`.

- [ ] **Step 4: Add the demo's constants, the reserved addresses and the column**

`shared/demo.ts`:

```ts
/** The sandbox workspace that "Try as team" and "Try as member" open. */
export const DEMO_WORKSPACE_SLUG = "demo";

/**
 * Every demo account's address ends here: the seeded people and each
 * visitor's guest account. `.invalid` is reserved and never resolves, so no
 * email can reach these addresses.
 */
export const DEMO_EMAIL_DOMAIN = "demo.pano.invalid";

export function isDemoEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);
}

/** Who a visitor tries the demo as: on the workspace's team, or not. */
export const DEMO_ROLES = ["team", "member"] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];
```

In `shared/slug.ts`, end the `RESERVED_SLUGS` comment with the seed's part:

```ts
/**
 * Top-level paths the app uses, plus names that would read as Pano's own. A
 * workspace can't take them. The seed makes `demo` and `pano` itself.
 */
```

And add both to the set, keeping its alphabetical order: `"demo",` after `"cdn-cgi",`, and `"pano",` after `"p",`.

In `worker/db/schema/workspaces.ts`, import `boolean` and add the column after `defaultLocale`:

```ts
import { boolean, check, pgTable, text, timestamp } from "drizzle-orm/pg-core";
```

```ts
    defaultLocale: text("default_locale", { enum: ["en", "tr"] })
      .notNull()
      .default("en"),
    // The sandbox the demo logins open: its settings are read-only, it never
    // sends email, and the nightly reset rebuilds it.
    isDemo: boolean("is_demo").notNull().default(false),
```

In `worker/routes/workspaces.ts`:
- Add the field to `WorkspaceSummary`, after `defaultLocale`:

```ts
  defaultLocale: Locale;
  /** The sandbox the demo logins open: its settings are read-only. */
  isDemo: boolean;
};
```

- In `findWorkspace`, select it after `defaultLocale: workspaceSettings.defaultLocale,`:

```ts
      isDemo: workspaceSettings.isDemo,
```

- And return it after `defaultLocale: row.defaultLocale ?? "en",`. A workspace with no settings row isn't the demo:

```ts
    isDemo: row.isDemo ?? false,
```

- In `POST /`, answer with it. Replace `data: { id: org.id, slug: org.slug, name: org.name, defaultLocale },` with:

```ts
          data: {
            id: org.id,
            slug: org.slug,
            name: org.name,
            defaultLocale,
            isDemo: false,
          },
```

- [ ] **Step 5: Generate the migration**

Run: `bunx drizzle-kit generate --name demo_workspace`

Expected: it writes `drizzle/0010_demo_workspace.sql`, its snapshot and journal entry. The SQL file holds exactly:

```sql
ALTER TABLE "workspace_settings" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun run test shared/demo.test.ts shared/slug.test.ts worker/routes/workspaces.test.ts`

Expected: PASS: 3 test files, 32 tests

Then run: `bun run test`

Expected: PASS. 60 test files, 452 tests.

- [ ] **Step 7: Migrate the dev database and commit**

```bash
bun run db:migrate
bun run typecheck
bun run check:fix && bun run check
git add shared worker/db/schema/workspaces.ts worker/routes/workspaces.ts worker/routes/workspaces.test.ts drizzle
git commit -m "feat: the demo workspace's flag, reserved addresses and constants" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The demo's content, the nightly reset and the seed

**Files:**
- Create: `worker/demo/content.ts`, `worker/services/demo-reset.ts`, `worker/services/demo-reset.test.ts`, `worker/services/pano-board.ts`, `worker/services/pano-board.test.ts`, `worker/db/seed.ts`
- Modify: `package.json` (the `seed` script)

**Interfaces:**
- Consumes:
  - Task 1's `DEMO_WORKSPACE_SLUG`, `DEMO_EMAIL_DOMAIN` and `workspaceSettings.isDemo`.
  - Phase 4's roadmap endpoint.
  - `testApp`, `testDb`, `setupWorkspace`, `submitPost` and `cleanDisplayName`.
- Produces:
  - `worker/demo/content.ts`: `DEMO_TEAM`, `DEMO_PEOPLE`, `DEMO_BOARDS` and `DEMO_POSTS`, with the types `DemoPerson`, `DemoBoard`, `DemoComment`, `DemoStatusChange` and `DemoPost`.
  - `worker/services/demo-reset.ts`:
    - `DEMO_WORKSPACE_ID = "org_pano_demo"`
    - `resetDemo(db: Database, now?: Date): Promise<DemoResetSummary>`
    - `type DemoResetSummary = { posts: number; votes: number; comments: number }`
  - `worker/services/pano-board.ts`:
    - `PANO_WORKSPACE_ID = "org_pano"`
    - `ensurePanoBoard(db: Database, input: { ownerEmail: string; ownerName?: string }): Promise<{ ownerId: string }>`
  - `bun run seed`.

The demo is Inkwell, a made-up notes app:
- 29 requests across three boards, voted on by 36 made-up people.
- A two-person team, Defne and Jonas, whose comments carry the Team badge.
- On the roadmap: 4 planned, 4 in progress and 5 shipped in the last 30 days.
- Every age is counted back from the reset, so the board never goes stale, and Shipped always has the last month.
- One request, "Night theme for late writing sessions", duplicates "Dark mode", so visitors can try merging, and the submit form's similar-requests panel has something to find.

- [ ] **Step 1: Write the failing tests**

`worker/services/demo-reset.test.ts`:

```ts
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { DEMO_WORKSPACE_SLUG } from "@/shared/demo";
import {
  member,
  organization,
  posts,
  user as users,
  workspaceSettings,
} from "../db/schema";
import { DEMO_POSTS } from "../demo/content";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import { setupWorkspace, submitPost } from "../test/fixtures";
import { DEMO_WORKSPACE_ID, resetDemo } from "./demo-reset";

const { db, close } = testDb();
afterAll(() => close());

const demoPostCount = () =>
  db
    .select({ n: sql<number>`count(*)::int` })
    .from(posts)
    .where(eq(posts.organizationId, DEMO_WORKSPACE_ID))
    .then(([row]) => row?.n);

describe("resetDemo", () => {
  it("builds the demo workspace: its boards, requests and a roadmap in motion", async () => {
    const summary = await resetDemo(db);
    expect(summary.posts).toBe(DEMO_POSTS.length);
    const t = testApp();
    const { data: workspace } = await (
      await t.client.api.workspaces[":slug"].$get({
        param: { slug: DEMO_WORKSPACE_SLUG },
      })
    ).json();
    expect(workspace.name).toBe("Inkwell");
    expect(workspace.isDemo).toBe(true);
    expect(workspace.boards.map((board) => board.slug)).toEqual([
      "features",
      "bugs",
      "integrations",
    ]);
    const { data: roadmap } = await (
      await t.client.api.workspaces[":slug"].roadmap.$get({
        param: { slug: DEMO_WORKSPACE_SLUG },
      })
    ).json();
    expect(roadmap.planned).toHaveLength(4);
    expect(roadmap.in_progress).toHaveLength(4);
    // Shipped shows the last 30 days, so it needs status_changed_at.
    expect(roadmap.shipped.map((post) => post.title)).toEqual([
      "Keyboard shortcut cheat sheet",
      "Search misses words with Turkish characters",
      "Daily notes template",
      "Import from Notion",
      "Focus mode that hides everything but the text",
    ]);
    await t.settle();
  });

  it("keeps every counter equal to its rows", async () => {
    await resetDemo(db);
    const drift = await db.execute<{ id: number }>(sql`
      select p.id from posts p
      where p.organization_id = ${DEMO_WORKSPACE_ID}
        and (p.vote_count <> (select count(*) from votes v where v.post_id = p.id)
          or p.comment_count <> (select count(*) from comments c where c.post_id = p.id and c.deleted_at is null))
      union all
      select c.id from comments c join posts p on p.id = c.post_id
      where p.organization_id = ${DEMO_WORKSPACE_ID}
        and c.reply_count <> (select count(*) from comments r where r.parent_id = c.id)`);
    expect(drift).toEqual([]);
    const [top] = await db
      .select({ title: posts.title, votes: posts.voteCount })
      .from(posts)
      .where(eq(posts.organizationId, DEMO_WORKSPACE_ID))
      .orderBy(sql`${posts.voteCount} desc`)
      .limit(1);
    expect(top).toEqual({ title: "Dark mode", votes: 31 });
  });

  it("puts back what visitors changed", async () => {
    await resetDemo(db);
    await db.delete(posts).where(eq(posts.organizationId, DEMO_WORKSPACE_ID));
    await db
      .update(organization)
      .set({ name: "Vandalized" })
      .where(eq(organization.id, DEMO_WORKSPACE_ID));

    await resetDemo(db);

    expect(await demoPostCount()).toBe(DEMO_POSTS.length);
    const [workspace] = await db
      .select({ name: organization.name, isDemo: workspaceSettings.isDemo })
      .from(organization)
      .innerJoin(
        workspaceSettings,
        eq(workspaceSettings.organizationId, organization.id)
      )
      .where(eq(organization.id, DEMO_WORKSPACE_ID));
    expect(workspace).toEqual({ name: "Inkwell", isDemo: true });
  });

  it("deletes guests from before the last reset, and keeps newer ones one more night", async () => {
    await resetDemo(db);
    const guest = async (createdAt: Date) => {
      const id = crypto.randomUUID();
      await db.insert(users).values({
        id,
        name: "Guest 1234",
        email: `guest-${id}@demo.pano.invalid`,
        emailVerified: true,
        createdAt,
      });
      await db.insert(member).values({
        id: crypto.randomUUID(),
        organizationId: DEMO_WORKSPACE_ID,
        userId: id,
        role: "member",
        createdAt,
      });
      return id;
    };
    const old = await guest(new Date(Date.now() - 2 * 86_400_000));
    const recent = await guest(new Date());

    await resetDemo(db);

    const left = await db
      .select({ id: users.id })
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
    const t = testApp();
    const { owner, slug, boards } = await setupWorkspace(t);
    const post = await submitPost(t, owner.cookie, slug, {
      boardId: boards[0]!.id,
      title: "Not part of the demo",
    });
    await t.settle();

    await resetDemo(db);

    const kept = await db
      .select({ title: posts.title })
      .from(posts)
      .where(eq(posts.id, post.id));
    expect(kept).toEqual([{ title: "Not part of the demo" }]);
    const people = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, owner.email));
    expect(people).toHaveLength(1);
  });
});
```

`worker/services/pano-board.test.ts`:

```ts
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { member, user as users } from "../db/schema";
import { testApp, uniqueEmail } from "../test/app";
import { testDb } from "../test/db";
import { ensurePanoBoard, PANO_WORKSPACE_ID } from "./pano-board";

const { db, close } = testDb();
afterAll(() => close());

describe("ensurePanoBoard", () => {
  it("makes /pano with its boards, owned by whoever signs in with that address", async () => {
    const email = uniqueEmail("owner");
    await ensurePanoBoard(db, { ownerEmail: email.toUpperCase() });

    const t = testApp();
    const { cookie } = await t.signIn(email);
    const { data: me } = await (
      await t.client.api.me.$get(undefined, { headers: { cookie } })
    ).json();
    expect(me.workspaces).toContainEqual(
      expect.objectContaining({ slug: "pano", role: "owner" })
    );
    const { data: workspace } = await (
      await t.client.api.workspaces[":slug"].$get({ param: { slug: "pano" } })
    ).json();
    expect(workspace.boards.map((board) => board.slug)).toEqual([
      "features",
      "bugs",
    ]);
    await t.settle();
  });

  it("keeps an account that already exists, and a second run changes nothing", async () => {
    const t = testApp();
    const { email } = await t.signIn(uniqueEmail("owner"));
    await t.settle();
    const [account] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));

    const first = await ensurePanoBoard(db, { ownerEmail: email });
    const second = await ensurePanoBoard(db, { ownerEmail: email });

    expect(first.ownerId).toBe(account?.id);
    expect(second.ownerId).toBe(account?.id);
    const memberships = await db
      .select({ role: member.role })
      .from(member)
      .where(
        and(
          eq(member.organizationId, PANO_WORKSPACE_ID),
          eq(member.userId, account!.id)
        )
      );
    expect(memberships).toEqual([{ role: "owner" }]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test worker/services/demo-reset.test.ts worker/services/pano-board.test.ts`

Expected: FAIL. Neither file loads: `worker/demo/content.ts` and `worker/services/pano-board.ts` don't exist yet.

- [ ] **Step 3: Add the demo's content**

`worker/demo/content.ts`:

```ts
import type { PostStatus } from "@/shared/status";

/**
 * What the demo workspace holds after every reset: Inkwell, a made-up notes
 * app, with a roadmap in motion. Ages are counted back from the reset, so
 * the board always looks lived-in and Shipped always shows the last month.
 */

export type DemoPerson = { key: string; name: string };

/** The workspace's own team; their comments carry the Team badge. */
export const DEMO_TEAM: DemoPerson[] = [
  { key: "defne", name: "Defne Aksoy" },
  { key: "jonas", name: "Jonas Weber" },
];

/** People who post, vote and comment. Votes go to them in this order. */
export const DEMO_PEOPLE: DemoPerson[] = [
  { key: "ayse", name: "Ayşe Demir" },
  { key: "sarah", name: "Sarah Chen" },
  { key: "mehmet", name: "Mehmet Kaya" },
  { key: "lukas", name: "Lukas Becker" },
  { key: "elif", name: "Elif Şahin" },
  { key: "priya", name: "Priya Raman" },
  { key: "can", name: "Can Öztürk" },
  { key: "tomas", name: "Tomás García" },
  { key: "zeynep", name: "Zeynep Arslan" },
  { key: "kenji", name: "Kenji Ito" },
  { key: "burak", name: "Burak Aydın" },
  { key: "mia", name: "Mia Novak" },
  { key: "aylin", name: "Aylin Yıldız" },
  { key: "omar", name: "Omar Haddad" },
  { key: "emre", name: "Emre Koç" },
  { key: "hannah", name: "Hannah Müller" },
  { key: "selin", name: "Selin Çelik" },
  { key: "diego", name: "Diego Silva" },
  { key: "mert", name: "Mert Polat" },
  { key: "noah", name: "Noah Williams" },
  { key: "kerem", name: "Kerem Tekin" },
  { key: "amara", name: "Amara Okafor" },
  { key: "deniz", name: "Deniz Uslu" },
  { key: "sofia", name: "Sofia Lindqvist" },
  { key: "arjun", name: "Arjun Mehta" },
  { key: "chloe", name: "Chloé Martin" },
  { key: "yuki", name: "Yuki Tanaka" },
  { key: "grace", name: "Grace Kim" },
  { key: "ivan", name: "Ivan Petrov" },
  { key: "fatima", name: "Fatima Zahra" },
  { key: "ben", name: "Ben Carter" },
  { key: "lena", name: "Lena Hoffmann" },
  { key: "marco", name: "Marco Bianchi" },
  { key: "nora", name: "Nora Andersen" },
  { key: "leo", name: "Leo Rossi" },
  { key: "mateo", name: "Mateo Fernández" },
];

export const DEMO_BOARDS = [
  { slug: "features", name: "Features" },
  { slug: "bugs", name: "Bugs" },
  { slug: "integrations", name: "Integrations" },
] as const;

export type DemoBoard = (typeof DEMO_BOARDS)[number]["slug"];

export type DemoComment = {
  by: string;
  /** Hours before the reset. Replies must be younger than their parent. */
  hoursAgo: number;
  body: string;
  replies?: DemoComment[];
  /** The team's pinned comment on this post. */
  pinned?: boolean;
};

export type DemoStatusChange = {
  to: PostStatus;
  daysAgo: number;
  by: string;
  note?: string;
};

export type DemoPost = {
  board: DemoBoard;
  title: string;
  body: string;
  by: string;
  daysAgo: number;
  /** Everyone who voted, the author included. */
  votes: number;
  /** How many of those votes came in the last week: Trending ranks by them. */
  recentVotes?: number;
  /** Oldest first; the last one is the post's status now. */
  timeline?: DemoStatusChange[];
  comments?: DemoComment[];
};

export const DEMO_POSTS: DemoPost[] = [
  {
    board: "features",
    title: "Dark mode",
    body: "Writing at night with a bright white screen is rough. A dark theme, ideally one that follows the system setting, would make Inkwell so much nicer after sunset.",
    by: "ayse",
    daysAgo: 58,
    votes: 31,
    recentVotes: 6,
    timeline: [
      {
        to: "under_review",
        daysAgo: 40,
        by: "jonas",
        note: "Lots of interest here. We're scoping it.",
      },
      {
        to: "planned",
        daysAgo: 12,
        by: "defne",
        note: "Planned for the next release. It will follow your system setting, with a manual override.",
      },
    ],
    comments: [
      {
        by: "defne",
        hoursAgo: 280,
        pinned: true,
        body: "**Update:** dark mode is planned for 2.6. It follows your system theme by default, and you can override it per device.",
      },
      {
        by: "sarah",
        hoursAgo: 1300,
        body: "Yes please. Even a dimmer background for the editor would help.",
        replies: [
          {
            by: "jonas",
            hoursAgo: 1250,
            body: "Noted! We're designing it so the editor, the sidebar and code blocks all switch together.",
            replies: [
              {
                by: "sarah",
                hoursAgo: 1240,
                body: "That's even better, thank you.",
              },
            ],
          },
        ],
      },
      {
        by: "kenji",
        hoursAgo: 700,
        body: "Would love a true black option for OLED screens.",
        replies: [
          {
            by: "defne",
            hoursAgo: 650,
            body: "Good call. We'll look at a true-black variant once the base theme ships.",
          },
        ],
      },
      {
        by: "mia",
        hoursAgo: 30,
        body: "Counting the days 🌙",
      },
    ],
  },
  {
    board: "features",
    title: "Export notebooks to PDF",
    body: "I need to send notes to people who don't use Inkwell. Exporting a note, or a whole notebook, as a clean PDF would cover it.",
    by: "lukas",
    daysAgo: 45,
    votes: 24,
    recentVotes: 5,
    timeline: [
      {
        to: "planned",
        daysAgo: 20,
        by: "defne",
        note: "We'll start with single notes, then whole notebooks.",
      },
      {
        to: "in_progress",
        daysAgo: 5,
        by: "jonas",
        note: "In progress: single-note export works on staging.",
      },
    ],
    comments: [
      {
        by: "lukas",
        hoursAgo: 900,
        body: "Please keep the code highlighting in the PDF!",
        replies: [
          {
            by: "jonas",
            hoursAgo: 880,
            body: "Code blocks keep their colors in the export. That's in the first version.",
          },
        ],
      },
      {
        by: "priya",
        hoursAgo: 400,
        body: "Page size options (A4 and Letter) would be great.",
      },
    ],
  },
  {
    board: "features",
    title: "Tables in the editor",
    body: "Simple tables for comparing things side by side. Markdown tables are fine, as long as I don't have to line up the pipes by hand.",
    by: "tomas",
    daysAgo: 33,
    votes: 19,
    recentVotes: 4,
    timeline: [
      {
        to: "under_review",
        daysAgo: 8,
        by: "jonas",
        note: "Looking into how tables would round-trip through Markdown export.",
      },
    ],
    comments: [
      {
        by: "zeynep",
        hoursAgo: 500,
        body: "Sorting by a column would be a dream, but even plain tables would do.",
      },
    ],
  },
  {
    board: "features",
    title: "Offline mode on mobile",
    body: "On the metro I lose connection all the time. Let me keep writing offline and sync when I'm back.",
    by: "can",
    daysAgo: 70,
    votes: 17,
    recentVotes: 1,
    timeline: [
      {
        to: "planned",
        daysAgo: 30,
        by: "defne",
        note: "Planned after the sync rewrite: the conflict fix comes first.",
      },
    ],
    comments: [
      {
        by: "can",
        hoursAgo: 1500,
        body: "Even read-only offline access would be a big step.",
        replies: [
          {
            by: "jonas",
            hoursAgo: 1450,
            body: "Read-only comes almost for free with the new sync engine, so that part will land first.",
          },
        ],
      },
    ],
  },
  {
    board: "features",
    title: "Keyboard shortcut cheat sheet",
    body: "There are lots of shortcuts, but I can never remember them. A cheat sheet I can open from anywhere would help.",
    by: "noah",
    daysAgo: 40,
    votes: 15,
    recentVotes: 3,
    timeline: [
      { to: "planned", daysAgo: 25, by: "defne" },
      {
        to: "shipped",
        daysAgo: 4,
        by: "defne",
        note: "Shipped in 2.5! Press `?` anywhere to open it.",
      },
    ],
    comments: [
      {
        by: "noah",
        hoursAgo: 80,
        body: "The `?` cheat sheet is perfect. Thank you!",
      },
    ],
  },
  {
    board: "features",
    title: "Daily notes template",
    body: "A button that creates today's note from a template: date as the title, a checklist, and a place for meeting notes.",
    by: "selin",
    daysAgo: 52,
    votes: 12,
    recentVotes: 1,
    timeline: [
      { to: "planned", daysAgo: 30, by: "defne" },
      { to: "in_progress", daysAgo: 21, by: "jonas" },
      {
        to: "shipped",
        daysAgo: 11,
        by: "jonas",
        note: "Shipped: Settings → Templates → Daily note.",
      },
    ],
  },
  {
    board: "features",
    title: "Tags with colors",
    body: "Let me give each tag a color so I can scan the sidebar at a glance.",
    by: "zeynep",
    daysAgo: 15,
    votes: 11,
    recentVotes: 8,
    comments: [
      {
        by: "zeynep",
        hoursAgo: 300,
        body: "Colors would make scanning the sidebar so much faster.",
      },
      {
        by: "omar",
        hoursAgo: 90,
        body: "+1, and maybe emoji tags too?",
      },
    ],
  },
  {
    board: "features",
    title: "Version history for notes",
    body: "I overwrote a paragraph last week and had no way to get it back. Keeping older versions of a note would be a lifesaver.",
    by: "hannah",
    daysAgo: 21,
    votes: 9,
    recentVotes: 2,
  },
  {
    board: "features",
    title: "Focus mode that hides everything but the text",
    body: "Hide the sidebar, the toolbar and everything else. Just me and the words.",
    by: "chloe",
    daysAgo: 64,
    votes: 14,
    timeline: [
      { to: "planned", daysAgo: 45, by: "defne" },
      {
        to: "shipped",
        daysAgo: 22,
        by: "defne",
        note: "Shipped in 2.4. Toggle it with ⌘⇧F.",
      },
    ],
  },
  {
    board: "features",
    title: "Handwriting on iPad with Apple Pencil",
    body: "I take notes by hand in meetings. Drawing and handwriting right inside a note would let me drop my paper notebook.",
    by: "mia",
    daysAgo: 80,
    votes: 8,
    timeline: [
      {
        to: "closed",
        daysAgo: 30,
        by: "defne",
        note: "Not something we can do well right now, so we're closing it to be honest about it. We'll revisit after the editor rewrite.",
      },
    ],
    comments: [
      {
        by: "mia",
        hoursAgo: 700,
        body: "A shame, but thanks for being upfront.",
      },
    ],
  },
  {
    board: "features",
    title: "Share a notebook with a read-only link",
    body: "I'd like to share a notebook with my team as a read-only page, without them needing an account.",
    by: "arjun",
    daysAgo: 26,
    votes: 7,
    recentVotes: 2,
    timeline: [{ to: "under_review", daysAgo: 6, by: "jonas" }],
  },
  {
    board: "features",
    title: "Pin notes to the top of a notebook",
    body: "Some notes I open every day. Pinning them above the rest would save a lot of scrolling.",
    by: "aylin",
    daysAgo: 36,
    votes: 10,
    recentVotes: 2,
    timeline: [
      { to: "planned", daysAgo: 14, by: "defne" },
      { to: "in_progress", daysAgo: 3, by: "jonas" },
    ],
  },
  {
    board: "features",
    title: "Word count goal per note",
    body: "A small progress bar towards a word count goal, for drafts and essays.",
    by: "lena",
    daysAgo: 3,
    votes: 4,
    recentVotes: 4,
  },
  {
    board: "features",
    title: "Night theme for late writing sessions",
    body: "Could the app have a darker theme for writing late at night? The white background hurts my eyes.",
    by: "marco",
    daysAgo: 6,
    votes: 3,
    recentVotes: 3,
  },
  {
    board: "features",
    title: "Custom fonts in the editor",
    body: "I'd love to write in a serif font. Even a choice of three or four fonts would be enough.",
    by: "sofia",
    daysAgo: 1,
    votes: 2,
    recentVotes: 2,
  },
  {
    board: "bugs",
    title: "Sync conflict duplicates a note after editing on two devices",
    body: "If I edit a note on my phone while offline and then on my laptop, I end up with two copies of the note, one with '(conflict)' in the title.",
    by: "mehmet",
    daysAgo: 9,
    votes: 13,
    recentVotes: 9,
    timeline: [
      {
        to: "in_progress",
        daysAgo: 2,
        by: "jonas",
        note: "Reproduced. A fix is in progress as part of the sync rewrite.",
      },
    ],
    comments: [
      {
        by: "mehmet",
        hoursAgo: 200,
        body: "It happens when my phone was offline for a while and then I edit on the laptop.",
        replies: [
          {
            by: "jonas",
            hoursAgo: 60,
            body: "Thanks, that matches what we see. You won't lose any text, but you may get a '(conflict)' copy until the fix ships.",
          },
        ],
      },
    ],
  },
  {
    board: "bugs",
    title: "Search misses words with Turkish characters",
    body: "Searching for 'isler' doesn't find notes containing 'işler'. Search should treat ş and s, ğ and g, ı and i the same.",
    by: "elif",
    daysAgo: 16,
    votes: 9,
    recentVotes: 3,
    timeline: [
      { to: "in_progress", daysAgo: 10, by: "jonas" },
      {
        to: "shipped",
        daysAgo: 6,
        by: "defne",
        note: "Fixed in 2.5.1: search now folds Turkish letters, so 'isler' finds 'işler'.",
      },
    ],
    comments: [
      {
        by: "elif",
        hoursAgo: 370,
        body: "Searching 'işler' finds nothing unless I type it exactly the way it was written.",
        replies: [
          {
            by: "defne",
            hoursAgo: 140,
            body: "Fixed in 2.5.1. Search now treats ş and s, ğ and g, ı and i as the same letter.",
            replies: [
              {
                by: "elif",
                hoursAgo: 120,
                body: "Works perfectly now, teşekkürler!",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    board: "bugs",
    title: "Images disappear from exported Markdown",
    body: "When I export a note with images to Markdown, the image links point to files that aren't in the export.",
    by: "ivan",
    daysAgo: 19,
    votes: 6,
    recentVotes: 1,
    timeline: [{ to: "planned", daysAgo: 9, by: "jonas" }],
  },
  {
    board: "bugs",
    title: "App freezes when pasting a very long table",
    body: "Pasting a table with a few hundred rows from a spreadsheet freezes the editor for about ten seconds.",
    by: "kerem",
    daysAgo: 12,
    votes: 5,
    recentVotes: 2,
    timeline: [{ to: "under_review", daysAgo: 4, by: "jonas" }],
  },
  {
    board: "bugs",
    title: "Checkboxes reset after reopening a note",
    body: "I tick items in a checklist, close the note, open it again, and some boxes are unticked.",
    by: "fatima",
    daysAgo: 2,
    votes: 3,
    recentVotes: 3,
  },
  {
    board: "bugs",
    title: "Typo in the welcome email",
    body: "The welcome email says 'notbooks' instead of 'notebooks'.",
    by: "ben",
    daysAgo: 28,
    votes: 1,
    timeline: [
      {
        to: "closed",
        daysAgo: 27,
        by: "jonas",
        note: "Fixed, thanks for spotting it!",
      },
    ],
  },
  {
    board: "integrations",
    title: "Google Calendar: link notes to events",
    body: "Open a calendar event and see the meeting notes that belong to it, or create them in one click.",
    by: "grace",
    daysAgo: 48,
    votes: 16,
    recentVotes: 2,
    timeline: [
      {
        to: "planned",
        daysAgo: 18,
        by: "defne",
        note: "Planned. We'll start with Google Calendar, then look at Outlook.",
      },
    ],
    comments: [
      {
        by: "grace",
        hoursAgo: 1000,
        body: "Meeting notes linked to their event would save me so much searching.",
      },
    ],
  },
  {
    board: "integrations",
    title: "Import from Notion",
    body: "I'd like to move my workspace over from Notion without copying pages by hand.",
    by: "diego",
    daysAgo: 66,
    votes: 18,
    timeline: [
      { to: "planned", daysAgo: 50, by: "defne" },
      { to: "in_progress", daysAgo: 35, by: "jonas" },
      {
        to: "shipped",
        daysAgo: 17,
        by: "defne",
        note: "Shipped! File → Import → Notion. Databases come in as tables.",
      },
    ],
    comments: [
      {
        by: "hannah",
        hoursAgo: 380,
        body: "Imported 400 pages without a single problem. Great job!",
      },
      {
        by: "diego",
        hoursAgo: 350,
        body: "Nested databases came in as tables. Nice.",
      },
    ],
  },
  {
    board: "integrations",
    title: "Obsidian-compatible vault export",
    body: "Export everything as a folder of Markdown files with front matter that Obsidian can open.",
    by: "arjun",
    daysAgo: 10,
    votes: 12,
    recentVotes: 9,
    comments: [
      {
        by: "arjun",
        hoursAgo: 230,
        body: "Being able to leave without losing anything is what makes me trust a notes app.",
      },
    ],
  },
  {
    board: "integrations",
    title: "Web clipper for Firefox",
    body: "The Chrome clipper is great, but I use Firefox every day.",
    by: "nora",
    daysAgo: 38,
    votes: 8,
    recentVotes: 1,
  },
  {
    board: "integrations",
    title: "Zapier integration",
    body: "Create notes from forms, emails and other apps through Zapier.",
    by: "omar",
    daysAgo: 30,
    votes: 6,
    timeline: [{ to: "under_review", daysAgo: 15, by: "defne" }],
  },
  {
    board: "integrations",
    title: "Readwise highlights sync",
    body: "Bring my Kindle and article highlights from Readwise into a notebook automatically.",
    by: "yuki",
    daysAgo: 27,
    votes: 7,
    recentVotes: 2,
    timeline: [
      { to: "planned", daysAgo: 13, by: "defne" },
      { to: "in_progress", daysAgo: 1, by: "jonas" },
    ],
  },
  {
    board: "integrations",
    title: "Slack: save a message as a note",
    body: "A message action in Slack that saves the message, with a link back, into my inbox notebook.",
    by: "leo",
    daysAgo: 8,
    votes: 4,
    recentVotes: 3,
  },
  {
    board: "integrations",
    title: "Embed GitHub issues in a note",
    body: "Paste a GitHub issue link and see its title and status inline.",
    by: "mateo",
    daysAgo: 4,
    votes: 2,
    recentVotes: 2,
  },
];
```

- [ ] **Step 4: Add the reset**

How it works:
- **Scope:** every write is scoped to the demo's fixed workspace id and to demo addresses.
- **Accounts:** it deletes demo accounts more than a day old: the seeded people, created 120 days back on every reset, and guests from before the last reset. Their votes, sessions and memberships go with them.
- **Workspace:** deleting the workspace cascades to its boards, posts and everything on them.
- **CPU:** the nightly cron runs it inside the free plan's 10 ms of CPU.
  - The rows are built here and sent as one JSON parameter, with ids drawn from the tables' own sequences.
  - Postgres unpacks them in one statement whose parts are data-modifying CTEs.
  - Foreign keys are checked when the statement ends, so a reply can name a parent inserted in the same statement.
  - Four statements in all; about 1.5 ms of CPU under Node in the spike.

`worker/services/demo-reset.ts`:

```ts
import { and, eq, like, lt, sql } from "drizzle-orm";
import { DEMO_EMAIL_DOMAIN, DEMO_WORKSPACE_SLUG } from "@/shared/demo";
import type { PostStatus } from "@/shared/status";
import type { Database } from "../db/client";
import { organization, user as users } from "../db/schema";
import {
  DEMO_BOARDS,
  DEMO_PEOPLE,
  DEMO_POSTS,
  DEMO_TEAM,
  type DemoComment,
  type DemoPost,
} from "../demo/content";

/** Fixed, so every reset rebuilds the same workspace. */
export const DEMO_WORKSPACE_ID = "org_pano_demo";
const DEMO_WORKSPACE_NAME = "Inkwell";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const personId = (key: string) => `demo_${key}`;
const TEAM_KEYS = new Set(DEMO_TEAM.map((person) => person.key));

export type DemoResetSummary = {
  posts: number;
  votes: number;
  comments: number;
};

/**
 * Puts the demo workspace back exactly as worker/demo/content.ts describes
 * it, and deletes the guest accounts visitors made before the last reset.
 *
 * The demo logins are public, and visitors delete, merge and move requests.
 * The next visitor mustn't find what the last one left, so this doesn't
 * repair the workspace, it replaces it. Every write is scoped to the demo's
 * fixed workspace id and to demo addresses; nothing else is touched.
 *
 * The nightly cron runs it, and the Workers free plan allows a cron 10 ms of
 * CPU. So it costs four statements: the rows are built here, sent as one
 * JSON parameter, and unpacked by Postgres (`jsonb_to_recordset`).
 */
export async function resetDemo(
  db: Database,
  now = new Date()
): Promise<DemoResetSummary> {
  return db.transaction(async (tx) => {
    // Demo accounts more than a day old, with their sessions and votes: the
    // seeded people, and guests from before the last reset. A guest from
    // since keeps their account one more night, so a visitor mid-demo at
    // 01:00 isn't left writing as an account that's gone.
    await tx
      .delete(users)
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
    await tx.execute(sql`
      with data as (select ${JSON.stringify(rows)}::jsonb as d),
      new_people as (
        insert into "user" (id, name, email, email_verified, created_at, updated_at)
        select id, name, email, true, created_at, created_at
        from data, jsonb_to_recordset(d->'people') as x(id text, name text, email text, created_at timestamp)),
      new_workspace as (
        insert into organization (id, name, slug, created_at)
        select ${DEMO_WORKSPACE_ID}, ${DEMO_WORKSPACE_NAME}, ${DEMO_WORKSPACE_SLUG}, (d->>'founded')::timestamp from data),
      new_settings as (
        insert into workspace_settings (organization_id, default_locale, is_demo)
        values (${DEMO_WORKSPACE_ID}, 'en', true)),
      new_team as (
        insert into member (id, organization_id, user_id, role, created_at)
        select id, ${DEMO_WORKSPACE_ID}, user_id, role, (d->>'founded')::timestamp
        from data, jsonb_to_recordset(d->'team') as x(id text, user_id text, role text)),
      new_boards as (
        insert into boards (id, organization_id, slug, name, position)
        select id, ${DEMO_WORKSPACE_ID}, slug, name, position
        from data, jsonb_to_recordset(d->'boards') as x(id uuid, slug text, name text, position integer)),
      new_posts as (
        insert into posts (id, organization_id, board_id, author_id, title, body, status, vote_count, comment_count, pinned_comment_id, search_config, created_at, status_changed_at)
        overriding system value
        select id, ${DEMO_WORKSPACE_ID}, board_id, author_id, title, body, status, vote_count, comment_count, pinned_comment_id, 'english', created_at, status_changed_at
        from data, jsonb_to_recordset(d->'posts')
          as x(id bigint, board_id uuid, author_id text, title text, body text, status text, vote_count integer, comment_count integer, pinned_comment_id bigint, created_at timestamptz, status_changed_at timestamptz)),
      new_votes as (
        insert into votes (post_id, user_id, created_at)
        select post_id, user_id, created_at
        from data, jsonb_to_recordset(d->'votes') as x(post_id bigint, user_id text, created_at timestamptz)),
      new_subscriptions as (
        insert into subscriptions (post_id, user_id, created_at)
        select post_id, user_id, created_at
        from data, jsonb_to_recordset(d->'subscriptions') as x(post_id bigint, user_id text, created_at timestamptz)),
      new_timeline as (
        insert into status_changes (post_id, from_status, to_status, note, changed_by, created_at)
        select post_id, from_status, to_status, note, changed_by, created_at
        from data, jsonb_to_recordset(d->'statusChanges')
          as x(post_id bigint, from_status text, to_status text, note text, changed_by text, created_at timestamptz)),
      new_comments as (
        insert into comments (id, post_id, author_id, parent_id, depth, body, is_official, reply_count, created_at)
        overriding system value
        select id, post_id, author_id, parent_id, depth, body, is_official, reply_count, created_at
        from data, jsonb_to_recordset(d->'comments')
          as x(id bigint, post_id bigint, author_id text, parent_id bigint, depth integer, body text, is_official boolean, reply_count integer, created_at timestamptz))
      select 1`);
    return {
      posts: rows.posts.length,
      votes: rows.votes.length,
      comments: rows.comments.length,
    };
  });
}

function countComments(posts: DemoPost[]): number {
  const count = (list: DemoComment[] = []): number =>
    list.reduce((sum, comment) => sum + 1 + count(comment.replies), 0);
  return posts.reduce((sum, post) => sum + count(post.comments), 0);
}

/** `count` moments spaced evenly strictly between `from` and `to`. */
function spread(count: number, from: number, to: number): number[] {
  return Array.from({ length: count }, (_, i) =>
    Math.round(from + ((i + 1) * (to - from)) / (count + 1))
  );
}

/**
 * Who voted on a post: its author first, then the people after the author in
 * DEMO_PEOPLE, wrapping around. All different, so (post, person) is unique.
 */
function votersFor(post: DemoPost): string[] {
  const start = DEMO_PEOPLE.findIndex((person) => person.key === post.by);
  const others = [
    ...DEMO_PEOPLE.slice(start + 1),
    ...DEMO_PEOPLE.slice(0, start),
  ].map((person) => person.key);
  return [post.by, ...others.slice(0, post.votes - 1)];
}

type Row = Record<string, string | number | boolean | null>;

/**
 * Every row the demo holds, with times counted back from `now` and the
 * counters counted from the rows, as every write keeps them.
 */
function demoRows(input: {
  now: number;
  postIds: number[];
  commentIds: number[];
}) {
  const { now } = input;
  const iso = (ms: number) => new Date(ms).toISOString();
  const founded = iso(now - 120 * DAY);
  const boardIds = new Map(
    DEMO_BOARDS.map((board) => [board.slug, crypto.randomUUID()])
  );
  const rows = {
    founded,
    people: [...DEMO_TEAM, ...DEMO_PEOPLE].map((person) => ({
      id: personId(person.key),
      name: person.name,
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
      name: board.name,
      position,
    })),
    posts: [] as Row[],
    votes: [] as Row[],
    subscriptions: [] as Row[],
    statusChanges: [] as Row[],
    comments: [] as Row[],
  };
  const commentIds = [...input.commentIds];

  DEMO_POSTS.forEach((post, index) => {
    const postId = input.postIds[index]!;
    const created = now - post.daysAgo * DAY;
    // People follow a post from the first time they post, vote or comment.
    const followed = new Map<string, number>();
    const follow = (key: string, at: number) => {
      const before = followed.get(key);
      if (before === undefined || at < before) followed.set(key, at);
    };

    let status: PostStatus = "open";
    let statusChangedAt: number | null = null;
    for (const change of post.timeline ?? []) {
      const at = now - change.daysAgo * DAY;
      rows.statusChanges.push({
        post_id: postId,
        from_status: status,
        to_status: change.to,
        note: change.note ?? null,
        changed_by: personId(change.by),
        created_at: iso(at),
      });
      status = change.to;
      statusChangedAt = at;
    }

    // The author's vote comes with the post. The rest spread out after it,
    // `recentVotes` of them within the last week, which Trending ranks by.
    const voters = votersFor(post);
    const others = voters.length - 1;
    const recent = Math.min(post.recentVotes ?? 0, others);
    const weekAgo = Math.max(created + HOUR, now - 7 * DAY);
    const times = [
      created,
      ...spread(others - recent, created + HOUR, weekAgo),
      ...spread(recent, weekAgo, now - HOUR),
    ];
    voters.forEach((key, i) => {
      rows.votes.push({
        post_id: postId,
        user_id: personId(key),
        created_at: iso(times[i]!),
      });
      follow(key, times[i]!);
    });

    let pinnedCommentId: number | null = null;
    let commentCount = 0;
    const addComments = (
      list: DemoComment[] = [],
      parentId: number | null,
      depth: number
    ) => {
      for (const comment of list) {
        const id = commentIds.shift()!;
        const at = now - comment.hoursAgo * HOUR;
        rows.comments.push({
          id,
          post_id: postId,
          author_id: personId(comment.by),
          parent_id: parentId,
          depth,
          body: comment.body,
          is_official: TEAM_KEYS.has(comment.by),
          reply_count: comment.replies?.length ?? 0,
          created_at: iso(at),
        });
        commentCount += 1;
        if (comment.pinned) pinnedCommentId = id;
        follow(comment.by, at);
        addComments(comment.replies, id, depth + 1);
      }
    };
    addComments(post.comments, null, 0);

    rows.posts.push({
      id: postId,
      board_id: boardIds.get(post.board)!,
      author_id: personId(post.by),
      title: post.title,
      body: post.body,
      status,
      vote_count: voters.length,
      comment_count: commentCount,
      pinned_comment_id: pinnedCommentId,
      created_at: iso(created),
      status_changed_at: statusChangedAt === null ? null : iso(statusChangedAt),
    });
    for (const [key, at] of followed) {
      rows.subscriptions.push({
        post_id: postId,
        user_id: personId(key),
        created_at: iso(at),
      });
    }
  });
  return rows;
}
```

- [ ] **Step 5: Add Pano's own board**

`worker/services/pano-board.ts`:

```ts
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  boards,
  member,
  organization,
  user as users,
  workspaceSettings,
} from "../db/schema";
import { cleanDisplayName } from "../lib/display-name";

/** Pano's own feedback board lives at /pano. Fixed, so a re-run finds it. */
export const PANO_WORKSPACE_ID = "org_pano";

const PANO_BOARDS = [
  { slug: "features", name: "Features" },
  { slug: "bugs", name: "Bugs" },
];

/**
 * Makes sure Pano's own workspace exists at /pano, owned by the person who
 * signs in with `ownerEmail`. `pano` is a reserved address, so nobody can
 * create it through the app first. It only adds what's missing: running it
 * again changes nothing, and it never touches requests.
 */
export async function ensurePanoBoard(
  db: Database,
  input: { ownerEmail: string; ownerName?: string }
): Promise<{ ownerId: string }> {
  // Better Auth stores addresses lowercased; sign-in finds this account.
  const email = input.ownerEmail.trim().toLowerCase();
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    const ownerId = existing?.id ?? crypto.randomUUID();
    if (!existing) {
      await tx.insert(users).values({
        id: ownerId,
        email,
        name: cleanDisplayName(input.ownerName ?? ""),
        emailVerified: true,
      });
    }
    await tx
      .insert(organization)
      .values({
        id: PANO_WORKSPACE_ID,
        name: "Pano",
        slug: "pano",
        createdAt: new Date(),
      })
      .onConflictDoNothing();
    await tx
      .insert(workspaceSettings)
      .values({ organizationId: PANO_WORKSPACE_ID, defaultLocale: "en" })
      .onConflictDoNothing();
    await tx
      .insert(member)
      .values({
        id: `mem_pano_${ownerId}`,
        organizationId: PANO_WORKSPACE_ID,
        userId: ownerId,
        role: "owner",
        createdAt: new Date(),
      })
      .onConflictDoNothing();
    await tx
      .insert(boards)
      .values(
        PANO_BOARDS.map((board, position) => ({
          organizationId: PANO_WORKSPACE_ID,
          ...board,
          position,
        }))
      )
      .onConflictDoNothing();
    return { ownerId };
  });
}
```

- [ ] **Step 6: Add the seed command**

`worker/db/seed.ts`:

```ts
// `bun run seed` rebuilds the demo workspace in the database DATABASE_URL
// names, exactly as the nightly cron does. With PANO_OWNER_EMAIL set, it
// also makes sure Pano's own board exists at /pano, owned by that person.
//
//   bun run seed                                  (the local database in .env)
//   DATABASE_URL=… PANO_OWNER_EMAIL=… bun run seed   (production, once)
import { resetDemo } from "../services/demo-reset";
import { ensurePanoBoard } from "../services/pano-board";
import { createDb } from "./client";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");

const { db, close } = createDb(url);
try {
  const demo = await resetDemo(db);
  console.log(
    `✓ demo: ${demo.posts} requests, ${demo.votes} votes, ${demo.comments} comments`
  );
  const ownerEmail = process.env.PANO_OWNER_EMAIL;
  if (ownerEmail) {
    await ensurePanoBoard(db, {
      ownerEmail,
      ownerName: process.env.PANO_OWNER_NAME,
    });
    console.log(`✓ pano: owned by ${ownerEmail}`);
  } else {
    console.log("• pano: skipped (set PANO_OWNER_EMAIL to create it)");
  }
} finally {
  await close();
}
```

In `package.json`, add the script after `db:migrate`:

```json
    "seed": "bun worker/db/seed.ts",
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bun run test worker/services/demo-reset.test.ts worker/services/pano-board.test.ts`

Expected: PASS: 2 test files, 7 tests

Then run: `bun run test`

Expected: PASS. 62 test files, 459 tests.

- [ ] **Step 8: Seed the dev database**

Run: `bun run seed`

Expected:

```
✓ demo: 29 requests, 296 votes, 26 comments
• pano: skipped (set PANO_OWNER_EMAIL to create it)
```

- [ ] **Step 9: Commit**

```bash
bun run typecheck
bun run check:fix && bun run check
git add worker/demo worker/services/demo-reset.ts worker/services/demo-reset.test.ts worker/services/pano-board.ts worker/services/pano-board.test.ts worker/db/seed.ts package.json
git commit -m "feat: the demo workspace, rebuilt by a declarative reset, and bun run seed" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Trying the demo: a guest account per visit

**Files:**
- Create: `worker/demo/sign-in.ts`, `worker/demo/sign-in.test.ts`
- Modify: `worker/auth.ts`, `worker/test/app.ts`

**Interfaces:**
- Consumes:
  - Task 1's `DEMO_EMAIL_DOMAIN`, `DEMO_ROLES`, `DemoRole`, `DEMO_WORKSPACE_SLUG` and `isDemoEmail`.
  - Task 2's `resetDemo` and `DEMO_WORKSPACE_ID`.
  - Phase 1's `localeFromHeaders`.
- Produces:
  - `POST /api/auth/demo/sign-in {as: "team" | "member"}`. It answers `{ name, team }` and sets the session cookie, as Better Auth's own sign-ins do.
    - It makes a new guest named "Guest 1234" (or "Misafir 1234" for a Turkish visitor), at `guest-<uuid>@demo.pano.invalid`.
    - A team guest joins the demo workspace's team with the role `member`.
    - It answers 404 while there's no demo workspace, and 400 for any other role.
    - In production, 5 per minute per address; the sixth answers 429.
  - Sign-in codes are never sent to demo addresses.
  - The test helper `testApp().signInDemo(as: DemoRole, headers?)`, which answers `{ cookie, name, team }`.

Better Auth builds the endpoint: a plugin's `createAuthEndpoint` gets Better Auth's own `internalAdapter.createUser` and `createSession`, and `setSessionCookie` signs the cookie and fills the five-minute cookie cache. Better Auth's database rate limit applies to it like any of its routes.

- [ ] **Step 1: Write the failing tests**

In `worker/test/app.ts`, import the role type after the `hono/testing` import:

```ts
import type { DemoRole } from "@/shared/demo";
```

Add the helper after `signIn`:

```ts
  /** "Try as team" or "Try as member": a new guest account and its cookie. */
  async function signInDemo(
    as: DemoRole,
    headers: Record<string, string> = {}
  ) {
    const res = await post("/api/auth/demo/sign-in", { as }, headers);
    if (!res.ok) throw new Error(`demo sign-in failed with ${res.status}`);
    const body = (await res.json()) as { name: string; team: boolean };
    return { cookie: cookieFrom(res), ...body };
  }
```

And return it, after `signIn,`:

```ts
    signInDemo,
```

`worker/demo/sign-in.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { organization } from "../db/schema";
import { DEMO_WORKSPACE_ID, resetDemo } from "../services/demo-reset";
import { testApp } from "../test/app";
import { testDb } from "../test/db";

const { db, close } = testDb();
beforeAll(() => resetDemo(db));
afterAll(() => close());

/** /api/me as the holder of `cookie`. */
async function meWith(t: ReturnType<typeof testApp>, cookie: string) {
  const res = await t.client.api.me.$get(undefined, { headers: { cookie } });
  return (await res.json()).data;
}

describe("demo sign-in", () => {
  it("signs a visitor in to a new guest account on the demo team", async () => {
    const t = testApp();
    const guest = await t.signInDemo("team");
    const me = await meWith(t, guest.cookie);
    expect(me.user?.name).toMatch(/^Guest \d{4}$/);
    expect(me.user?.email).toMatch(/@demo\.pano\.invalid$/);
    expect(me.workspaces).toEqual([
      expect.objectContaining({ slug: "demo", role: "member" }),
    ]);
    await t.settle();
  });

  it("keeps a member guest off the team, and gives every visit its own account", async () => {
    const t = testApp();
    const first = await t.signInDemo("member");
    const second = await t.signInDemo("member");
    const [a, b] = [
      await meWith(t, first.cookie),
      await meWith(t, second.cookie),
    ];
    expect(a.workspaces).toEqual([]);
    expect(a.user?.id).not.toBe(b.user?.id);
    await t.settle();
  });

  it("names the guest in Turkish for a visitor who chose Turkish", async () => {
    const t = testApp();
    const guest = await t.signInDemo("member", { cookie: "pano-locale=tr" });
    expect(guest.name).toMatch(/^Misafir \d{4}$/);
    await t.settle();
  });

  it("refuses an unknown role", async () => {
    const t = testApp();
    const res = await t.post("/api/auth/demo/sign-in", { as: "owner" });
    expect(res.status).toBe(400);
    await t.settle();
  });

  it("answers 404 while the demo workspace isn't set up", async () => {
    await db.delete(organization).where(eq(organization.id, DEMO_WORKSPACE_ID));
    const t = testApp();
    const res = await t.post("/api/auth/demo/sign-in", { as: "member" });
    expect(res.status).toBe(404);
    // Its own answer, not the one for a path Better Auth doesn't know.
    expect(await res.json()).toMatchObject({
      message: "The demo workspace isn't set up",
    });
    await t.settle();
    await resetDemo(db);
  });

  it("limits each address to five demo sign-ins a minute in production", async () => {
    const t = testApp({ ENVIRONMENT: "production" });
    const ip = { "cf-connecting-ip": `203.0.113.${Date.now() % 250}` };
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push(
        (await t.post("/api/auth/demo/sign-in", { as: "member" }, ip)).status
      );
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    await t.settle();
  });

  it("sends no sign-in code to a demo address", async () => {
    const t = testApp();
    const res = await t.sendCode("defne@demo.pano.invalid");
    expect(res.ok).toBe(true);
    expect(t.mail.sent).toEqual([]);
    await t.settle();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test worker/demo/sign-in.test.ts`

Expected: FAIL, all 7.
- Better Auth answers 404 for the unknown path, so every sign-in throws "demo sign-in failed with 404".
- The 404 test fails on its message.
- The code is still sent to `defne@demo.pano.invalid`.

- [ ] **Step 3: Add the endpoint**

`worker/demo/sign-in.ts`:

```ts
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  DEMO_EMAIL_DOMAIN,
  DEMO_ROLES,
  DEMO_WORKSPACE_SLUG,
} from "@/shared/demo";
import type { Database } from "../db/client";
import { member, organization, workspaceSettings } from "../db/schema";
import { localeFromHeaders } from "../lib/request-locale";

const GUEST = { en: "Guest", tr: "Misafir" } as const;

/**
 * "Try as team" and "Try as member": POST /api/auth/demo/sign-in {as}.
 *
 * Every visit gets its own guest account, so each visitor's votes are their
 * own and their limits aren't shared with everyone else trying the demo.
 * A team guest joins the demo workspace's team. Guests have demo addresses,
 * which receive no email, and the nightly reset deletes them all.
 *
 * Better Auth sets the session cookie, the same way its own sign-ins do, and
 * its per-address rate limit applies (see worker/auth.ts).
 */
export function demoSignIn({ db }: { db: Database }) {
  return {
    id: "demo-sign-in",
    endpoints: {
      signInDemo: createAuthEndpoint(
        "/demo/sign-in",
        { method: "POST", body: z.object({ as: z.enum(DEMO_ROLES) }) },
        async (ctx) => {
          const [demo] = await db
            .select({ id: organization.id })
            .from(organization)
            .innerJoin(
              workspaceSettings,
              eq(workspaceSettings.organizationId, organization.id)
            )
            .where(
              and(
                eq(organization.slug, DEMO_WORKSPACE_SLUG),
                eq(workspaceSettings.isDemo, true)
              )
            )
            .limit(1);
          if (!demo) {
            throw new APIError("NOT_FOUND", {
              message: "The demo workspace isn't set up",
            });
          }
          const locale = localeFromHeaders(new Headers(ctx.headers));
          const number = 1000 + Math.floor(Math.random() * 9000);
          const user = await ctx.context.internalAdapter.createUser(
            {
              email: `guest-${crypto.randomUUID()}@${DEMO_EMAIL_DOMAIN}`,
              name: `${GUEST[locale]} ${number}`,
              emailVerified: true,
            },
            { method: "demo" }
          );
          const team = ctx.body.as === "team";
          if (team) {
            await db.insert(member).values({
              id: crypto.randomUUID(),
              organizationId: demo.id,
              userId: user.id,
              role: "member",
              createdAt: new Date(),
            });
          }
          const session = await ctx.context.internalAdapter.createSession(
            user.id
          );
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ name: user.name, team });
        }
      ),
    },
  } satisfies BetterAuthPlugin;
}
```

- [ ] **Step 4: Plug it into Better Auth**

In `worker/auth.ts`:
- Import the helpers, after the `better-auth/plugins` import and the schema import:

```ts
import { isDemoEmail } from "@/shared/demo";
```

```ts
import { demoSignIn } from "./demo/sign-in";
```

- Add the rate limit after the `/sign-in/email-otp` rule:

```ts
        // Each demo sign-in makes an account, until the nightly reset.
        "/demo/sign-in": { window: 60, max: 5 },
```

- In `sendVerificationOTP`, replace `if (type !== "sign-in") return;` with:

```ts
          // Demo addresses can't receive mail: nobody signs in to them.
          if (type !== "sign-in" || isDemoEmail(email)) return;
```

- Add the plugin after `organization({ organizationLimit: 1 }),`:

```ts
      demoSignIn({ db }),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test worker/demo/sign-in.test.ts`

Expected: PASS: 1 test file, 7 tests

Then run: `bun run test`

Expected: PASS. 63 test files, 466 tests.

- [ ] **Step 6: Commit**

```bash
bun run typecheck
bun run check:fix && bun run check
git add worker/demo/sign-in.ts worker/demo/sign-in.test.ts worker/auth.ts worker/test/app.ts
git commit -m "feat: try the demo as team or member, each visit its own guest account" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Demo accounts stay in the demo

**Files:**
- Create: `worker/middleware/demo.ts`, `worker/middleware/demo.test.ts`
- Modify:
  - `worker/middleware/team.ts`, `shared/envelope.ts`
  - `src/i18n/messages/en.json`, `src/i18n/messages/tr.json`
  - `worker/routes/workspaces.ts`, `worker/routes/posts.ts`, `worker/routes/comments.ts`
  - `worker/services/outbox.ts`

**Interfaces:**
- Consumes: Task 1's `isDemoEmail` and `workspaceSettings.isDemo`, Task 2's `resetDemo` and `DEMO_WORKSPACE_ID`, and Task 3's `signInDemo`.
- Produces:
  - `confineDemo(target: "new-workspace" | "workspace" | "post")`, a middleware that runs after `requireUser`. For a demo account it answers 403 `DEMO_ONLY` unless the workspace in `:slug`, or the post in `:id`, is the demo. A target that doesn't exist passes, so the route answers its own 404.
  - `readOnlyInDemo`, a middleware that runs after `requireTeam`. In the demo workspace it answers 403 `DEMO_READ_ONLY`.
  - `TeamWorkspace.isDemo: boolean`, and `TeamEnv` is exported.
  - `ApiErrorCode` gains `"DEMO_ONLY" | "DEMO_READ_ONLY"`, translated in both catalogs.
  - `queueShippedEmails` queues nothing in the demo workspace.

Anyone can get a demo account with a click. Without this task, those accounts would be a way to post, vote and comment on real boards with no email at all. Inside the demo:
- Settings and boards are read-only: one "Delete board" would empty the demo for everyone until the reset.
- Requests can still be deleted, merged and moved; the reset puts them back.

- [ ] **Step 1: Write the failing tests**

`worker/middleware/demo.test.ts`:

```ts
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { boards, emailOutbox, posts, subscriptions } from "../db/schema";
import { DEMO_WORKSPACE_ID, resetDemo } from "../services/demo-reset";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import { setupWorkspace, submitPost } from "../test/fixtures";

const { db, close } = testDb();
beforeAll(() => resetDemo(db));
afterAll(() => close());

type TestApp = ReturnType<typeof testApp>;

/** A request in the demo with followers: "Dark mode". */
async function demoPost() {
  const [post] = await db
    .select({ id: posts.id, boardId: posts.boardId })
    .from(posts)
    .where(
      and(
        eq(posts.organizationId, DEMO_WORKSPACE_ID),
        eq(posts.title, "Dark mode")
      )
    );
  if (!post) throw new Error("the demo has no Dark mode post");
  return post;
}

const codeOf = async (res: { json(): Promise<unknown> }) =>
  ((await res.json()) as { code?: string }).code;

/** Votes, comments on and follows `postId` as `cookie`: the three statuses. */
async function joinIn(t: TestApp, cookie: string, postId: number) {
  const param = { id: String(postId) };
  const headers = { headers: { cookie } };
  return Promise.all([
    t.client.api.posts[":id"].vote.$put(
      { param, json: { voted: true } },
      headers
    ),
    t.client.api.posts[":id"].comments.$post(
      { param, json: { body: "Hello from a guest" } },
      headers
    ),
    t.client.api.posts[":id"].subscription.$put(
      { param, json: { subscribed: true } },
      headers
    ),
  ]);
}

describe("demo accounts", () => {
  it("can't post, vote, comment or follow outside the demo", async () => {
    const t = testApp();
    const { owner, slug, boards: made } = await setupWorkspace(t);
    const post = await submitPost(t, owner.cookie, slug, {
      boardId: made[0]!.id,
      title: "A real request",
    });
    const guest = await t.signInDemo("member");

    const posted = await t.client.api.workspaces[":slug"].posts.$post(
      {
        param: { slug },
        json: { boardId: made[0]!.id, title: "Spam", body: "" },
      },
      { headers: { cookie: guest.cookie } }
    );
    expect(posted.status).toBe(403);
    expect(await codeOf(posted)).toBe("DEMO_ONLY");
    for (const res of await joinIn(t, guest.cookie, post.id)) {
      expect(res.status).toBe(403);
      expect(await codeOf(res)).toBe("DEMO_ONLY");
    }
    await t.settle();
  });

  it("post, vote, comment and follow in the demo", async () => {
    const t = testApp();
    const guest = await t.signInDemo("member");
    const { id, boardId } = await demoPost();
    const posted = await t.client.api.workspaces[":slug"].posts.$post(
      {
        param: { slug: "demo" },
        json: { boardId, title: "A guest's idea", body: "" },
      },
      { headers: { cookie: guest.cookie } }
    );
    expect(posted.status).toBe(201);
    const statuses = (await joinIn(t, guest.cookie, id)).map((r) => r.status);
    expect(statuses).toEqual([200, 201, 200]);
    await t.settle();
  });

  it("can't create a workspace", async () => {
    const t = testApp();
    const guest = await t.signInDemo("team");
    const res = await t.client.api.workspaces.$post(
      { json: { name: "Mine", slug: "guest-space", defaultLocale: "en" } },
      { headers: { cookie: guest.cookie } }
    );
    expect(res.status).toBe(403);
    expect(await codeOf(res)).toBe("DEMO_ONLY");
    await t.settle();
  });
});

describe("the demo workspace", () => {
  it("keeps its name, language and boards, even for its team", async () => {
    const t = testApp();
    const guest = await t.signInDemo("team");
    const headers = { headers: { cookie: guest.cookie } };
    const param = { slug: "demo" };
    const [board] = await db
      .select({ id: boards.id })
      .from(boards)
      .where(eq(boards.organizationId, DEMO_WORKSPACE_ID))
      .limit(1);
    const attempts = await Promise.all([
      t.client.api.workspaces[":slug"].$patch(
        { param, json: { name: "Renamed" } },
        headers
      ),
      t.client.api.workspaces[":slug"].boards.$post(
        { param, json: { name: "Extra" } },
        headers
      ),
      t.client.api.workspaces[":slug"].boards[":boardId"].$delete(
        { param: { ...param, boardId: board!.id } },
        headers
      ),
      t.client.api.workspaces[":slug"].boards.order.$put(
        { param, json: { ids: [board!.id] } },
        headers
      ),
    ]);
    for (const res of attempts) {
      expect(res.status).toBe(403);
      expect(await codeOf(res)).toBe("DEMO_READ_ONLY");
    }
    await t.settle();
  });

  it("sends no Shipped email when its team ships a request", async () => {
    const t = testApp();
    const guest = await t.signInDemo("team");
    const { id } = await demoPost();
    const [followers] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(subscriptions)
      .where(eq(subscriptions.postId, id));
    expect(followers?.n).toBeGreaterThan(0);

    const res = await t.client.api.posts[":id"].status.$patch(
      { param: { id: String(id) }, json: { status: "shipped" } },
      { headers: { cookie: guest.cookie } }
    );
    await t.settle();

    expect(res.status).toBe(200);
    const queued = await db
      .select({ id: emailOutbox.id })
      .from(emailOutbox)
      .where(eq(emailOutbox.postId, id));
    expect(queued).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test worker/middleware/demo.test.ts`

Expected: FAIL: 4 of 5.
- A guest posts, votes, comments and follows on a real board.
- A guest creates a workspace, or gets 409 for the one-workspace limit; either way not 403.
- The demo's team renames it and changes its boards.
- Shipping in the demo queues emails.
- "post, vote, comment and follow in the demo" passes already. It pins that the rules don't block the demo itself.

- [ ] **Step 3: Add the error codes**

In `shared/envelope.ts`, end `ApiErrorCode` with the two codes:

```ts
  | "POST_MERGED"
  | "DEMO_ONLY"
  | "DEMO_READ_ONLY";
```

In `src/i18n/messages/en.json`, add after `"POST_MERGED"` in `errors`:

```json
    "DEMO_ONLY": "Demo accounts work only in the demo workspace.",
    "DEMO_READ_ONLY": "The demo's settings stay as they are. Everything else is yours to try.",
```

In `src/i18n/messages/tr.json`, the same place:

```json
    "DEMO_ONLY": "Demo hesapları yalnızca demo çalışma alanında kullanılabilir.",
    "DEMO_READ_ONLY": "Demonun ayarları değiştirilemez. Geri kalan her şeyi deneyebilirsiniz.",
```

- [ ] **Step 4: Tell the team middleware whether a workspace is the demo**

In `worker/middleware/team.ts`:
- Add `workspaceSettings` to the schema import: `import { member, organization, workspaceSettings } from "../db/schema";`.
- Add `isDemo: boolean;` to `TeamWorkspace`, after `role`.
- Export the env type: `export type TeamEnv = {`.
- Select the flag after `role: member.role,`, joining the settings before the member join:

```ts
      role: member.role,
      isDemo: workspaceSettings.isDemo,
    })
    .from(organization)
    .leftJoin(
      workspaceSettings,
      eq(workspaceSettings.organizationId, organization.id)
    )
    .leftJoin(
      member,
```

- And set it, after `role: row.role,`:

```ts
    isDemo: row.isDemo ?? false,
```

- [ ] **Step 5: Add the two middlewares**

`worker/middleware/demo.ts`:

```ts
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { isDemoEmail } from "@/shared/demo";
import type { Database } from "../db/client";
import { organization, posts, workspaceSettings } from "../db/schema";
import { AppError } from "../lib/errors";
import type { UserEnv } from "./session";
import type { TeamEnv } from "./team";

type Target = "new-workspace" | "workspace" | "post";

/**
 * Demo accounts act only inside the demo workspace; runs after requireUser.
 * Anyone can get one with a click, so without this they would be a way to
 * post, vote and comment on real boards with no email at all.
 *
 * - "new-workspace": a demo account can't create a workspace.
 * - "workspace": the workspace in `:slug` must be the demo.
 * - "post": the post in `:id` must be in the demo.
 *
 * A target that doesn't exist passes, so the route answers its own 404.
 */
export const confineDemo = (target: Target) =>
  createMiddleware<UserEnv>(async (c, next) => {
    if (isDemoEmail(c.var.user.email)) {
      const inDemo =
        target === "new-workspace"
          ? false
          : target === "workspace"
            ? await workspaceIsDemo(c.var.db, c.req.param("slug") ?? "")
            : await postIsInDemo(c.var.db, Number(c.req.param("id")));
      if (inDemo === false) {
        throw new AppError(
          403,
          "DEMO_ONLY",
          "Demo accounts can only act in the demo workspace"
        );
      }
    }
    await next();
  });

/**
 * The demo workspace's name, language and boards stay as the nightly reset
 * makes them: one visitor deleting a board would empty the demo for everyone
 * until then. Runs after requireTeam.
 */
export const readOnlyInDemo = createMiddleware<TeamEnv>(async (c, next) => {
  if (c.var.workspace.isDemo) {
    throw new AppError(
      403,
      "DEMO_READ_ONLY",
      "The demo workspace's settings can't be changed"
    );
  }
  await next();
});

/** Whether the workspace is the demo, or null when there's no such workspace. */
async function workspaceIsDemo(db: Database, slug: string) {
  const [row] = await db
    .select({ isDemo: workspaceSettings.isDemo })
    .from(organization)
    .leftJoin(
      workspaceSettings,
      eq(workspaceSettings.organizationId, organization.id)
    )
    .where(eq(organization.slug, slug))
    .limit(1);
  return row ? (row.isDemo ?? false) : null;
}

/** Whether the post is in the demo, or null when there's no such post. */
async function postIsInDemo(db: Database, postId: number) {
  const [row] = await db
    .select({ isDemo: workspaceSettings.isDemo })
    .from(posts)
    .leftJoin(
      workspaceSettings,
      eq(workspaceSettings.organizationId, posts.organizationId)
    )
    .where(eq(posts.id, postId))
    .limit(1);
  return row ? (row.isDemo ?? false) : null;
}
```

- [ ] **Step 6: Put them on the routes**

In `worker/routes/workspaces.ts`:
- Import them after the `validate` import: `import { confineDemo, readOnlyInDemo } from "../middleware/demo";`.
- In `POST /`, add `confineDemo("new-workspace"),` after `requireUser,`.
- Add `readOnlyInDemo,` after `requireTeam,` in each of the five team routes: `PATCH /:slug`, `POST /:slug/boards`, `PATCH /:slug/boards/:boardId`, `DELETE /:slug/boards/:boardId` and `PUT /:slug/boards/order`.

In `worker/routes/posts.ts`:
- Import it after the `validate` import: `import { confineDemo } from "../middleware/demo";`.
- In `POST /:slug/posts`, add `confineDemo("workspace"),` after `requireUser,`.
- In `PUT /:id/vote` and `PUT /:id/subscription`, add `confineDemo("post"),` after `validate("param", idParamSchema),`. The id has to be valid before the middleware reads its post.

In `worker/routes/comments.ts`, import it the same way, and in `POST /:id/comments` add `confineDemo("post"),` after `validate("param", idParamSchema),`.

Status changes, merges, pins, edits and deletes need no rule: they're for the team or the author. A demo account is only ever on the demo's team, and only ever the author of demo requests.

- [ ] **Step 7: Keep the demo's Shipped emails from queuing**

In `worker/services/outbox.ts`, `queueShippedEmails`:
- Select the flag after `defaultLocale: workspaceSettings.defaultLocale,`:

```ts
      isDemo: workspaceSettings.isDemo,
```

- Return before building the payload, right after the select's `.limit(1);`:

```ts
  if (workspace?.isDemo) return;
```

- End the doc comment with the reason: replace `this post shipping isn't emailed again.` with:

```ts
 * this post shipping isn't emailed again. The demo workspace queues none:
 * its people have no inboxes.
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `bun run test worker/middleware/demo.test.ts`

Expected: PASS: 1 test file, 5 tests

Then run: `bun run test`

Expected: PASS. 64 test files, 471 tests.

- [ ] **Step 9: Commit**

```bash
bun run typecheck
bun run check:fix && bun run check
git add worker/middleware worker/routes worker/services/outbox.ts shared/envelope.ts src/i18n/messages
git commit -m "feat: demo accounts act only in the demo, whose settings stay put and which sends no email" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Crons that let the database sleep

**Files:**
- Create: `worker/routes/outbox-flag.test.ts`, `worker/config.test.ts`
- Modify:
  - `worker/env.ts`, `worker/test/env.ts`, `worker/auth.ts`, `auth.config.ts`
  - `worker/services/outbox.ts`, `worker/services/status.ts`, `worker/routes/posts.ts`
  - `worker/cron.ts`, `worker/cron.test.ts`
  - `wrangler.jsonc`, `worker-configuration.d.ts` (regenerated)

**Interfaces:**
- Consumes: Task 2's `resetDemo`, Task 3's `signInDemo`, Task 4's demo rule in `queueShippedEmails`, and Phase 4's `sendQueuedEmails`.
- Produces:
  - `Bindings.FLAGS: Flags`, where `type Flags = { get(key): Promise<string | null>; put(key, value, options?: { expirationTtl?: number }): Promise<void> }`. The binding is the KV namespace `FLAGS`.
  - `memoryFlags(): Flags`, which `testEnv()` uses.
  - In `worker/services/outbox.ts`:
    - `OUTBOX_PENDING = "outbox:pending"`
    - `markOutboxPending(flags: Flags): Promise<void>`, which raises the flag for 1800 s
    - `queueShippedEmails` now answers `Promise<number>`, the emails it queued
  - `changeStatus(…)` answers `Promise<{ queued: number }>`.
  - In `worker/cron.ts`:
    - `EVERY_FIVE_MINUTES = "*/5 * * * *"` and `NIGHTLY = "0 1 * * *"`
    - `runScheduled(cron, env, { mailer?, send?, reset? })`
  - `AuthDeps.env` is now `Pick<Bindings, "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL" | "ENVIRONMENT">`: all `createAuth` reads. So `auth.config.ts` needs no bindings it doesn't use.

Why:
- Neon's free plan counts compute hours, and the database sleeps after five quiet minutes. Phase 4's cron queried the outbox every five minutes. That keeps a 0.25 CU compute awake all month: about 182 CU-hours against the plan's 100, after which Neon suspends the database until the next month.
- So a status change that queues emails raises a flag in Workers KV. Reading it doesn't touch Postgres. The five-minute cron connects only while the flag is up.
- The flag lapses after half an hour, long enough for all 5 tries at a batch. So it never needs clearing, and two changes at once can't lose each other's emails.
- The nightly cron resets the demo, then sends whatever is queued, in case a flag was lost.

- [ ] **Step 1: Write the failing tests**

`worker/cron.test.ts`, replacing it:

```ts
import { describe, expect, it, vi } from "vitest";
import { EVERY_FIVE_MINUTES, NIGHTLY, runScheduled } from "./cron";
import type { resetDemo } from "./services/demo-reset";
import {
  markOutboxPending,
  OUTBOX_PENDING,
  type sendQueuedEmails,
} from "./services/outbox";
import { capturingMailer } from "./test/app";
import { testEnv } from "./test/env";

const nothingToSend = () =>
  vi.fn<typeof sendQueuedEmails>(async () => ({ sent: 0, failed: 0 }));
const fakeReset = () =>
  vi.fn<typeof resetDemo>(async () => ({ posts: 0, votes: 0, comments: 0 }));

/** Bindings whose database can't be reached: any connection would fail. */
function offlineEnv() {
  const { env } = testEnv();
  return {
    ...env,
    HYPERDRIVE: { connectionString: "postgresql://nobody@127.0.0.1:1/none" },
  };
}

describe("runScheduled", () => {
  it("sends queued emails every five minutes once a flag says some wait, linking to this app", async () => {
    const { env } = testEnv();
    await markOutboxPending(env.FLAGS);
    const send = nothingToSend();
    const { mailer } = capturingMailer();
    await runScheduled(EVERY_FIVE_MINUTES, env, { mailer, send });
    expect(send).toHaveBeenCalledOnce();
    const [, usedMailer, options] = send.mock.calls[0]!;
    expect(usedMailer).toBe(mailer);
    expect(options).toEqual({ origin: "http://localhost" });
  });

  it("leaves the database alone when no flag is up", async () => {
    const env = offlineEnv();
    const send = nothingToSend();
    await runScheduled(EVERY_FIVE_MINUTES, env, { send });
    expect(send).not.toHaveBeenCalled();
    expect(await env.FLAGS.get(OUTBOX_PENDING)).toBeNull();
  });

  it("resets the demo every night, then sends what's queued", async () => {
    const send = nothingToSend();
    const reset = fakeReset();
    await runScheduled(NIGHTLY, testEnv().env, { send, reset });
    expect(reset).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledOnce();
  });

  it("still sends the night's emails when the reset fails", async () => {
    const send = nothingToSend();
    const reset = vi.fn<typeof resetDemo>(async () => {
      throw new Error("demo reset broke");
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await runScheduled(NIGHTLY, testEnv().env, { send, reset });
    expect(send).toHaveBeenCalledOnce();
    expect(logged).toHaveBeenCalledWith(
      "[demo] reset failed:",
      expect.any(Error)
    );
    logged.mockRestore();
  });

  it("ignores other triggers", async () => {
    const send = nothingToSend();
    const reset = fakeReset();
    await runScheduled("0 12 * * *", testEnv().env, { send, reset });
    expect(send).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });
});
```

`worker/routes/outbox-flag.test.ts`:

```ts
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { posts } from "../db/schema";
import { DEMO_WORKSPACE_ID, resetDemo } from "../services/demo-reset";
import { OUTBOX_PENDING } from "../services/outbox";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import { setupWorkspace, submitPost, voteFor } from "../test/fixtures";

const { db, close } = testDb();
beforeAll(() => resetDemo(db));
afterAll(() => close());

describe("the outbox flag", () => {
  it("goes up when shipping a request queues emails", async () => {
    const t = testApp();
    const { owner, slug, boards: made } = await setupWorkspace(t);
    const post = await submitPost(t, owner.cookie, slug, {
      boardId: made[0]!.id,
      title: "Ship me",
    });
    const fan = await t.signIn();
    await voteFor(t, fan.cookie, post.id);
    await t.client.api.posts[":id"].status.$patch(
      { param: { id: String(post.id) }, json: { status: "shipped" } },
      { headers: { cookie: owner.cookie } }
    );
    await t.settle();
    expect(await t.env.FLAGS.get(OUTBOX_PENDING)).toBe("1");
  });

  it("stays down when the demo ships a request: it queues no email", async () => {
    const t = testApp();
    const guest = await t.signInDemo("team");
    const [post] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(
          eq(posts.organizationId, DEMO_WORKSPACE_ID),
          eq(posts.title, "Dark mode")
        )
      );
    const res = await t.client.api.posts[":id"].status.$patch(
      { param: { id: String(post!.id) }, json: { status: "shipped" } },
      { headers: { cookie: guest.cookie } }
    );
    await t.settle();
    expect(res.status).toBe(200);
    expect(await t.env.FLAGS.get(OUTBOX_PENDING)).toBeNull();
  });
});
```

`worker/config.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EVERY_FIVE_MINUTES, NIGHTLY } from "./cron";

type WranglerConfig = {
  triggers: { crons: string[] };
  kv_namespaces: { binding: string }[];
  vars?: Record<string, string>;
};

/**
 * wrangler.jsonc as JSON: its comments all sit on lines of their own. Tests
 * run from the repo root. (A URL here would be the Workers runtime's, which
 * Node's readFileSync types don't accept.)
 */
function wranglerConfig(): WranglerConfig {
  const text = readFileSync("wrangler.jsonc", "utf8");
  return JSON.parse(text.replace(/^\s*\/\/.*$/gm, ""));
}

describe("wrangler.jsonc", () => {
  it("schedules exactly the crons worker/cron.ts answers", () => {
    expect(wranglerConfig().triggers.crons).toEqual([
      EVERY_FIVE_MINUTES,
      NIGHTLY,
    ]);
  });

  it("binds the KV namespace the five-minute cron reads its flag from", () => {
    expect(wranglerConfig().kv_namespaces.map((kv) => kv.binding)).toEqual([
      "FLAGS",
    ]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test worker/cron.test.ts worker/routes/outbox-flag.test.ts worker/config.test.ts`

Expected: FAIL: 8 of 9.
- `NIGHTLY`, `OUTBOX_PENDING` and `markOutboxPending` aren't exported yet, so they're `undefined`. The cron tests fail on them: "markOutboxPending is not a function", and the nightly run is ignored.
- The config test finds one cron and no `kv_namespaces`.
- The flag tests find no `t.env.FLAGS`.
- "ignores other triggers" passes already: the old cron ignored everything but its own.

- [ ] **Step 3: Give the Worker a KV namespace**

In `worker/env.ts`, add the binding to `Bindings`, after `HYPERDRIVE`:

```ts
  /** A Workers KV namespace for flags the crons read without waking the database. */
  FLAGS: Flags;
```

And the type, before `AppEnv`:

```ts
/** The part of a KV namespace Pano uses. */
export type Flags = {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number }
  ): Promise<void>;
};
```

In `worker/test/env.ts`, import the type with the bindings, `import type { Bindings, Flags } from "../env";`, and add `FLAGS: memoryFlags(),` after `HYPERDRIVE: { connectionString },`. Then add at the end of the file:

```ts
/** A Workers KV namespace in memory. Expiry isn't simulated. */
export function memoryFlags(): Flags {
  const values = new Map<string, string>();
  return {
    async get(key) {
      return values.get(key) ?? null;
    },
    async put(key, value) {
      values.set(key, value);
    },
  };
}
```

In `worker/auth.ts`, replace `export type AuthDeps = { db: Database; env: Bindings; mailer: CodeMailer };` with:

```ts
export type AuthDeps = {
  db: Database;
  env: Pick<Bindings, "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL" | "ENVIRONMENT">;
  mailer: CodeMailer;
};
```

In `auth.config.ts`, delete the line `HYPERDRIVE: { connectionString: "" },`.

In `wrangler.jsonc`, replace the triggers and their comment with:

```jsonc
  // Every five minutes: send queued emails, if a status change queued any.
  // Every night at 01:00 UTC: reset the demo workspace. (worker/cron.ts)
  "triggers": { "crons": ["*/5 * * * *", "0 1 * * *"] },
  "kv_namespaces": [
    {
      // Flags the crons read without waking the database.
      "binding": "FLAGS",
      // Placeholder until launch creates the namespace with
      // `wrangler kv namespace create FLAGS`. Local dev keeps its own.
      "id": "00000000000000000000000000000000"
    }
  ],
```

Then run: `bun run cf-typegen`

Expected: `worker-configuration.d.ts` gains `FLAGS: KVNamespace;` in `__BaseEnv_Env`, and a new hash on its second line. `worker/index.ts`'s `BindingsMatchWrangler` check then passes.

- [ ] **Step 4: Raise the flag when emails are queued**

In `worker/services/outbox.ts`:
- Import the type after the schema import: `import type { Flags } from "../env";`.
- Replace the doc comment of `queueShippedEmails` with:

```ts
/**
 * Queues a Shipped email to each of the post's subscribers but the person
 * who shipped it, and answers how many. It runs in the status change's
 * transaction, so the emails exist exactly when the change does. Someone
 * already emailed about this post shipping isn't emailed again. The demo
 * workspace queues none: its people have no inboxes.
 */
```

- Give it a return type: `): Promise<number> {`.
- The demo's early return answers zero: `if (workspace?.isDemo) return 0;`.
- Count the insert's rows. Replace `await tx.execute(sql\`` before the `insert into email_outbox` with `const queued = await tx.execute(sql\``, and add `return queued.count;` after the statement.
- Then add after the function:

```ts
/** The flag that tells the five-minute cron emails are waiting. */
export const OUTBOX_PENDING = "outbox:pending";

/**
 * Raises that flag for half an hour: long enough for every try at a batch
 * (5 tries, 5 minutes apart). It lapses by itself, so it never needs
 * clearing, and two status changes at once can't lose each other's emails.
 */
export function markOutboxPending(flags: Flags) {
  return flags.put(OUTBOX_PENDING, "1", { expirationTtl: 30 * 60 });
}
```

In `worker/services/status.ts`, `changeStatus` answers what it queued:
- The doc comment's first sentence ends: `optional note for the timeline. Answers how many emails it queued.`
- The signature returns the transaction's result:

```ts
): Promise<{ queued: number }> {
  return db.transaction(async (tx) => {
```

- The same-status return: `if (post.status === input.status) return { queued: 0 };`.
- And the end of the transaction becomes:

```ts
    if (input.status === "shipped") {
      const queued = await queueShippedEmails(
        tx,
        {
          id: input.postId,
          title: post.title,
          organizationId: post.organizationId,
        },
        { actorId: input.userId, note }
      );
      return { queued };
    }
    if (post.status === "shipped") {
      await takeBackShippedEmails(tx, input.postId);
    }
    return { queued: 0 };
  });
```

In `worker/routes/posts.ts`, import the helper before the status import, `import { markOutboxPending } from "../services/outbox";`. In `PATCH /:id/status`, keep the result and raise the flag after the response:

```ts
      const { queued } = await changeStatus(c.var.db, {
        postId: id,
        userId: c.var.user.id,
        ...c.req.valid("json"),
      });
      // The five-minute cron sends them, once this tells it to look.
      if (queued > 0) c.executionCtx.waitUntil(markOutboxPending(c.env.FLAGS));
```

- [ ] **Step 5: Two crons, the first one gated**

`worker/cron.ts`, replacing it:

```ts
import { createDb, type Database } from "./db/client";
import type { Bindings } from "./env";
import { type Mailer, mailerFor } from "./mail/mailer";
import { resetDemo } from "./services/demo-reset";
import { OUTBOX_PENDING, sendQueuedEmails } from "./services/outbox";

/** The triggers in wrangler.jsonc. */
export const EVERY_FIVE_MINUTES = "*/5 * * * *";
export const NIGHTLY = "0 1 * * *";

type CronDeps = {
  mailer?: Mailer;
  send?: typeof sendQueuedEmails;
  reset?: typeof resetDemo;
};

/**
 * What a cron trigger does, kept free of Workers globals so it runs under
 * Node in tests.
 *
 * - Every five minutes: send queued emails. Neon's free plan counts the
 *   hours its database is awake, and the database sleeps after five quiet
 *   minutes, so a query every five minutes would keep it awake all month.
 *   The cron connects only while a status change's flag says emails wait.
 * - Every night: reset the demo workspace, then send whatever is queued, in
 *   case a flag was lost.
 */
export async function runScheduled(
  cron: string,
  env: Bindings,
  { mailer, send = sendQueuedEmails, reset = resetDemo }: CronDeps = {}
) {
  if (cron === EVERY_FIVE_MINUTES) {
    if (!(await env.FLAGS.get(OUTBOX_PENDING))) return;
    await withDb(env, (db) => sendOutbox(db, env, mailer, send));
  } else if (cron === NIGHTLY) {
    await withDb(env, async (db) => {
      try {
        const demo = await reset(db);
        console.log(
          `[demo] reset: ${demo.posts} requests, ${demo.votes} votes, ${demo.comments} comments`
        );
      } catch (error) {
        console.error("[demo] reset failed:", error);
      }
      await sendOutbox(db, env, mailer, send);
    });
  }
}

async function withDb(env: Bindings, run: (db: Database) => Promise<void>) {
  const { db, close } = createDb(env.HYPERDRIVE.connectionString);
  try {
    await run(db);
  } finally {
    await close();
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
  });
  if (result.sent + result.failed > 0) {
    console.log(`[outbox] sent ${result.sent}, failed ${result.failed}`);
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun run test worker/cron.test.ts worker/routes/outbox-flag.test.ts worker/config.test.ts`

Expected: PASS: 3 test files, 9 tests

Then run: `bun run test`

Expected: PASS. 66 test files, 478 tests. The Phase 4 status and outbox tests still pass: they read the rows, not the return values.

- [ ] **Step 7: Try both crons locally**

Run `bun run dev`, then in another terminal:

```bash
curl 'http://localhost:5173/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*'
curl 'http://localhost:5173/cdn-cgi/handler/scheduled?cron=0+1+*+*+*'
```

Expected: both answer `ok`.
- The dev server logs nothing for the first: no flag is up, so it doesn't connect.
- For the second it logs `[demo] reset: 29 requests, 296 votes, 26 comments`.

- [ ] **Step 8: Commit**

```bash
bun run typecheck
bun run check:fix && bun run check
git add worker auth.config.ts wrangler.jsonc worker-configuration.d.ts
git commit -m "feat: the email cron wakes the database only for queued mail; a nightly cron resets the demo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The look: paper on a cork board

**Files:**
- Create: `test/palette.test.ts`, `public/favicon.svg`
- Modify:
  - `package.json` and `bun.lock` (the font), `vitest.config.ts`, `index.html`
  - `src/styles.css`
  - `src/components/ui/button.tsx`, `input.tsx`, `textarea.tsx`
  - `src/components/status-badge.tsx`, `src/components/site-header.tsx`
  - `src/features/votes/vote-button.tsx`, `src/features/posts/post-card.tsx`, `src/features/roadmap/roadmap-board.tsx`
  - `src/features/comments/comment-item.tsx`, `src/features/comments/comment-thread.tsx`, `src/features/status/status-timeline.tsx`, `src/features/feed/feed-toolbar.tsx`
  - `src/routes/$ws.tsx`, `src/routes/p/$ref.tsx`, `src/routes/signin.tsx`, `src/routes/new-workspace.tsx`, `src/routes/$ws/new.tsx`, `src/routes/$ws/settings.tsx`

**Interfaces:**
- Consumes: the shadcn token names every component already uses (`background`, `card`, `primary`, `muted-foreground`, …).
- Produces:
  - Tokens in `src/styles.css`, light and dark. Dark follows `prefers-color-scheme`, through `@custom-variant dark`.
    - `--board`, the page.
    - `--card`, paper.
    - `--foreground`, blue-black ink.
    - `--primary`, signal orange, with ink text on it.
    - `--stamp-review`, `--stamp-planned`, `--stamp-progress`, `--stamp-shipped` and `--stamp-closed`, as Tailwind colors `stamp-*`.
  - Fonts: `font-heading`, Familjen Grotesk, for `h1`–`h3`; Geist stays the body font.
  - The `.paper` component class: a sheet on the board.
  - `animate-stamp`, the landing page's one animation; Task 7 uses it as `motion-safe:animate-stamp`.

The design:
- **The board is the page; everything people wrote sits on paper.**
  - Posts, roadmap cards, the post, its history and its comments, and every form are `.paper` sheets.
  - The page frame (headers, toolbars) sits on the cork.
- **Ink:** text is blue-black ink. Muted text is dark enough for the cork as well as for paper.
- **Orange means "you can act, or you did":** primary buttons, your vote, the focus ring. Nothing decorative is orange:
  - The Team badge becomes a solid ink stamp.
  - Text links are underlined ink, because orange text is too faint on cork to read.
- **Stamps and tallies:** status labels are ink stamps in their own color. Vote counts are tallies in tabular figures, so they never shift.
- **The roadmap** gets a wider page; its columns are lanes taped off with a dashed edge.
- **Measured readability:** `test/palette.test.ts` checks every text color against the surfaces it sits on (WCAG AA, 4.5:1) and form-field edges (3:1), in both themes. It's the regression net for the palette.

- [ ] **Step 1: Write the failing test**

In `vitest.config.ts`, let the tooling project's tests run too: add `"test/**/*.test.ts",` after `"src/**/*.test.{ts,tsx}",` in `include`. `test/` already compiles with Node's types (`tsconfig.node.json`), which reading the stylesheet needs. Vitest would replace an imported `.css` with an empty string.

`test/palette.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Read as text: Vitest replaces imported CSS with an empty string.
const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

// The dark block, not the @custom-variant line that names the same query.
const DARK = "@media (prefers-color-scheme: dark) {";

/** The hex colors one block of styles.css sets, by custom property. */
function palette(block: string): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const [, name, hex] of block.matchAll(
    /--([\w-]+):\s*(#[0-9a-f]{6});/gi
  )) {
    colors[name!] = hex!;
  }
  return colors;
}

/** WCAG relative luminance. */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const c = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string | undefined, b: string | undefined) {
  if (!a || !b) throw new Error("a color isn't set as hex in styles.css");
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

const light = palette(css.slice(css.indexOf(":root {"), css.indexOf(DARK)));
const dark = palette(css.slice(css.indexOf(DARK)));

// Text on the surfaces it sits on, at WCAG AA for body text.
const TEXT = [
  ["foreground", "board"],
  ["foreground", "card"],
  ["muted-foreground", "board"],
  ["muted-foreground", "card"],
  ["primary-foreground", "primary"],
  ["destructive", "card"],
  ["stamp-review", "card"],
  ["stamp-planned", "card"],
  ["stamp-progress", "card"],
  ["stamp-shipped", "card"],
  ["stamp-closed", "card"],
] as const;

// A form field's edge, which is what shows where it is: 3:1.
const EDGES = [
  ["input", "card"],
  ["input", "board"],
] as const;

describe.each([
  ["light", light],
  ["dark", dark],
])("the %s palette", (_, colors) => {
  it.each(TEXT)("keeps %s readable on %s", (text, surface) => {
    expect(contrast(colors[text], colors[surface])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(EDGES)("keeps %s edges visible on %s", (edge, surface) => {
    expect(contrast(colors[edge], colors[surface])).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test test/palette.test.ts`

Expected: FAIL, all 26, with "a color isn't set as hex in styles.css". The shadcn defaults are `oklch()` values, and there is no `--board` or `--stamp-*` yet.

- [ ] **Step 3: Add the font and the tokens**

Run: `bun add @fontsource-variable/familjen-grotesk@^5.3.0`

`src/styles.css`, replacing it:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "@fontsource-variable/geist";
@import "@fontsource-variable/familjen-grotesk";

/* Dark mode follows the system setting. */
@custom-variant dark (@media (prefers-color-scheme: dark));

@theme inline {
  /* Headings and the wordmark: a grotesk with ink traps. Everything else is
     Geist, with tabular figures wherever a count can change. */
  --font-heading: "Familjen Grotesk Variable", var(--font-sans);
  --font-sans: "Geist Variable", sans-serif;
  --color-stamp-review: var(--stamp-review);
  --color-stamp-planned: var(--stamp-planned);
  --color-stamp-progress: var(--stamp-progress);
  --color-stamp-shipped: var(--stamp-shipped);
  --color-stamp-closed: var(--stamp-closed);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --color-foreground: var(--foreground);
  --color-background: var(--background);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}

@theme {
  /* The landing page's one moment of motion: a rubber stamp coming down.
     It runs only for people who haven't asked for reduced motion. */
  --animate-stamp: stamp 0.45s cubic-bezier(0.3, 1.4, 0.5, 1) 0.9s both;
  @keyframes stamp {
    from {
      opacity: 0;
      scale: 2.2;
      rotate: -14deg;
    }
    to {
      opacity: 1;
      scale: 1;
      rotate: -7deg;
    }
  }
}

/*
 * A cork board with paper pinned to it. The board is the page; everything
 * people wrote sits on paper. Blue-black ink for text. Signal orange marks
 * what you can act on, or did: primary buttons, your vote, the focus ring.
 */
:root {
  --board: #e2cfb3;
  --background: var(--board);
  --foreground: #1e2440;
  --card: #fffcf6;
  --card-foreground: #1e2440;
  --popover: #fffcf6;
  --popover-foreground: #1e2440;
  --primary: #ff5a1f;
  --primary-foreground: #1e2440;
  --secondary: #f3e9da;
  --secondary-foreground: #1e2440;
  --muted: #efe4d3;
  --muted-foreground: #4e5266;
  --accent: #f3e9da;
  --accent-foreground: #1e2440;
  --destructive: #c62a1d;
  --border: #cbb593;
  --input: #806a4c;
  --ring: #ff5a1f;
  --radius: 0.375rem;
  /* The shadow under a sheet of paper. */
  --paper-edge: rgb(78 56 28 / 0.16);
  --speckle: rgb(120 84 40 / 0.07);
  /* Status stamps: each status inks in its own color. */
  --stamp-review: #5b3596;
  --stamp-planned: #244a9e;
  --stamp-progress: #8a5300;
  --stamp-shipped: #1c6b43;
  --stamp-closed: #5c5955;
}

@media (prefers-color-scheme: dark) {
  /* The same board after dark: warm brown, paper a shade lighter. */
  :root {
    --board: #231e19;
    --foreground: #efe7da;
    --card: #302923;
    --card-foreground: #efe7da;
    --popover: #302923;
    --popover-foreground: #efe7da;
    --primary: #ff6a2b;
    --primary-foreground: #1d1814;
    --secondary: #3a322b;
    --secondary-foreground: #efe7da;
    --muted: #3a322b;
    --muted-foreground: #b9ae9d;
    --accent: #3a322b;
    --accent-foreground: #efe7da;
    --destructive: #ff7b6b;
    --border: #4a4037;
    --input: #8c7d6b;
    --ring: #ff6a2b;
    --paper-edge: rgb(0 0 0 / 0.4);
    --speckle: rgb(255 240 220 / 0.035);
    --stamp-review: #cdb6f2;
    --stamp-planned: #a9c3f5;
    --stamp-progress: #f0c97d;
    --stamp-shipped: #94dbb3;
    --stamp-closed: #c9c2b8;
  }
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  html {
    @apply font-sans;
  }
  body {
    @apply bg-background text-foreground antialiased;
    /* Cork: two offset grids of faint dots. */
    background-image:
      radial-gradient(var(--speckle) 1px, transparent 1.5px),
      radial-gradient(var(--speckle) 1px, transparent 1.5px);
    background-size:
      7px 7px,
      11px 11px;
    background-position:
      0 0,
      3px 5px;
  }
  h1,
  h2,
  h3 {
    @apply font-heading tracking-tight;
    text-wrap: balance;
  }
}

@layer components {
  /* A sheet of paper on the board. */
  .paper {
    @apply rounded-sm bg-card text-card-foreground;
    box-shadow:
      0 0 0 1px var(--paper-edge),
      0 1px 0 var(--paper-edge),
      0 6px 14px -8px var(--paper-edge);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test test/palette.test.ts`

Expected: PASS: 1 test file, 26 tests

- [ ] **Step 5: Paper, stamps and tallies**

`src/components/status-badge.tsx`, replacing it:

```tsx
import { useTranslations } from "use-intl";
import type { PostStatus } from "@/shared/status";

// Each status inks its stamp in its own color (styles.css, --stamp-*).
const TONE: Record<PostStatus, string> = {
  open: "border-foreground/30 text-foreground",
  under_review: "border-stamp-review/40 bg-stamp-review/10 text-stamp-review",
  planned: "border-stamp-planned/40 bg-stamp-planned/10 text-stamp-planned",
  in_progress:
    "border-stamp-progress/40 bg-stamp-progress/10 text-stamp-progress",
  shipped: "border-stamp-shipped/40 bg-stamp-shipped/10 text-stamp-shipped",
  closed: "border-stamp-closed/40 bg-stamp-closed/10 text-stamp-closed",
};

export function StatusBadge({ status }: { status: PostStatus }) {
  const t = useTranslations("statuses");
  return (
    <span
      className={`inline-flex items-center rounded-[3px] border px-1.5 py-px font-medium text-xs ${TONE[status]}`}
    >
      {t(status)}
    </span>
  );
}
```

In `src/components/ui/button.tsx`:
- In the `outline` variant, replace `border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50` with `border-border bg-card hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input`. Outline buttons are paper tabs.
- Replace the `link` variant with:

```ts
        // Ink, underlined: orange text is too faint on the board to read.
        link: "text-foreground underline underline-offset-4 hover:decoration-2",
```

In `src/components/ui/input.tsx`, replace `border border-input bg-transparent px-2.5` with `border border-input bg-card px-2.5`, and delete ` dark:bg-input/30` before ` dark:disabled:bg-input/80`. In `src/components/ui/textarea.tsx`, the same two changes: `bg-transparent` becomes `bg-card`, and the trailing ` dark:bg-input/30` goes. Fields are paper even on the cork.

In `src/features/feed/feed-toolbar.tsx`, the status select's class becomes `h-8 rounded-md border border-input bg-card px-2 text-sm`.

In `src/features/votes/vote-button.tsx`, replace the `SHAPE` line with:

```ts
// A tally: the count in tabular figures, so it never shifts as it changes.
const SHAPE =
  "h-auto w-12 shrink-0 flex-col gap-0 rounded-sm py-1.5 font-semibold tabular-nums";
```

In `src/features/posts/post-card.tsx`:
- The `<li>` becomes `<li className="paper flex items-start gap-4 p-4">`.
- The title link's class becomes `font-heading font-semibold text-[1.0625rem] leading-snug hover:underline`.

In `src/features/roadmap/roadmap-board.tsx`:
- The column's classes become:

```ts
        // A lane taped off on the board; it lights up under a dragged card.
        "flex min-h-40 flex-col gap-3 rounded-md border-2 border-border border-dashed p-3",
        isOver && "border-ring bg-primary/5"
```

- The column heading: `className="font-bold text-lg"`.
- The card's classes become:

```ts
        "paper flex items-start gap-3 p-3",
        isDragging && "relative z-10 rotate-1 shadow-lg"
```

- The card's title link: `className="font-heading font-semibold leading-snug hover:underline"`.

In `src/features/comments/comment-item.tsx`, the Team badge becomes an ink stamp:

```tsx
        // The team signs in ink: solid, where everyone else is plain text.
        <span className="rounded-[3px] bg-foreground px-1.5 py-px font-medium text-background">
```

In `src/features/comments/comment-thread.tsx`:
- The thread's `<section>` class becomes `paper flex flex-col gap-4 p-5 sm:p-6`.
- The pinned comment's class becomes `flex flex-col gap-2 rounded-sm border border-dashed bg-muted/60 p-4`.

In `src/features/status/status-timeline.tsx`, the `<section>` class becomes `paper flex flex-col gap-3 p-5 sm:p-6`.

- [ ] **Step 6: The pages**

In `src/components/site-header.tsx`, the wordmark gets its pushpin:

```tsx
      <Link
        to="/"
        className="flex items-center gap-2 font-bold font-heading text-xl tracking-tight"
      >
        {/* A pushpin: the board's own mark. */}
        <span
          aria-hidden="true"
          className="size-3 rounded-full bg-foreground shadow-[inset_-2px_-2px_0_rgb(0_0_0/0.25)]"
        />
        Pano
      </Link>
```

In `src/routes/$ws.tsx`:
- Add `useMatchRoute` to the router import, after `Outlet,`.
- Import `cn` after it: `import { cn } from "cn";`.
- After the `onTeam` line:

```ts
  // The roadmap's three columns get room; the rest reads at a narrow measure.
  const wide = Boolean(useMatchRoute()({ to: "/$ws/roadmap", params: { ws } }));
```

- The outer `<div>` becomes:

```tsx
    <div
      className={cn(
        "mx-auto flex flex-col gap-6 px-6 py-10",
        wide ? "max-w-5xl" : "max-w-3xl"
      )}
    >
```

- The workspace name: `<h1 className="font-bold text-3xl">{workspace.name}</h1>`.

In `src/routes/p/$ref.tsx`:
- The article: `<article className="paper flex items-start gap-4 p-5 sm:p-6">`. `items-start` keeps the tally from stretching to the article's height.
- The title: `<h1 className="font-bold text-3xl leading-tight">{post.title}</h1>`.
- The tools under it: `<div className="paper flex flex-col gap-4 p-5 sm:p-6">`.

The forms become sheets:
- `src/routes/signin.tsx`: `<main className="paper mx-6 my-16 flex flex-col gap-6 p-6 sm:mx-auto sm:max-w-sm sm:p-8">`.
- `src/routes/new-workspace.tsx`: `<main className="paper mx-6 my-16 flex flex-col gap-6 p-6 sm:mx-auto sm:max-w-md sm:p-8">`.
- `src/routes/$ws/new.tsx`: `<section className="paper flex flex-col gap-6 p-5 sm:p-6">`.
- `src/routes/$ws/settings.tsx`: both `<section className="flex flex-col gap-4">` become `<section className="paper flex flex-col gap-4 p-5 sm:p-6">`.

- [ ] **Step 7: The favicon**

`public/favicon.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <!-- A note pinned to the board: Pano's mark. -->
  <rect x="3.5" y="6" width="25" height="23" rx="2.5" fill="#fffcf6" stroke="#cbb593" stroke-width="1.5"/>
  <path d="M9 16.5h14M9 21.5h9" stroke="#1e2440" stroke-width="2" stroke-linecap="round" opacity=".55"/>
  <circle cx="16" cy="7.5" r="4.5" fill="#1e2440"/>
  <circle cx="14.6" cy="6.1" r="1.3" fill="#fffcf6" opacity=".6"/>
</svg>
```

In `index.html`, after the viewport meta:

```html
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <meta name="theme-color" content="#e2cfb3" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#231e19" media="(prefers-color-scheme: dark)" />
```

- [ ] **Step 8: Run the tests, and look**

Run: `bun run test`

Expected: PASS. 67 test files, 504 tests. No component test reads class names.

Then `bun run dev`, and open `/demo`, `/demo/roadmap`, a request such as "Dark mode", and `/signin`, in light and dark mode. Expected:
- Paper sheets on a speckled cork board, with blue-black text.
- Stamped statuses, and orange only on primary buttons and your vote.
- A three-lane roadmap on a wider page.

- [ ] **Step 9: Commit**

```bash
bun run typecheck
bun run check:fix && bun run check
git add package.json bun.lock vitest.config.ts index.html public test src
git commit -m "feat: the look: paper on a cork board, ink, stamps and one signal orange" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The landing page, and the way into the demo

**Files:**
- Create: `src/lib/demo.ts`, `src/features/demo/demo-buttons.tsx`, `src/features/demo/demo-banner.tsx`, `src/features/landing/mini-board.tsx`, `src/features/demo/demo.test.tsx`
- Modify: `src/routes/index.tsx`, `src/components/site-header.tsx`, `src/routes/$ws.tsx`, `src/routes/$ws/settings.tsx`, `src/i18n/messages/en.json`, `src/i18n/messages/tr.json`

**Interfaces:**
- Consumes:
  - Task 1's `isDemoEmail`, `DEMO_WORKSPACE_SLUG`, `DemoRole` and `WorkspaceSummary.isDemo`.
  - Task 3's `POST /api/auth/demo/sign-in`.
  - Task 6's `.paper`, the `stamp-*` colors and `animate-stamp`.
- Produces:
  - `signInDemo(as: DemoRole): Promise<{ ok: true } | { ok: false; status: number }>`. It uses plain `fetch`, not `authClient`: Better Auth's client keeps the `fetch` it saw at import, which tests can't stand in for.
  - `<DemoButtons size?>`: the two ways in.
    - After signing in, every cached query is invalidated, because it was read as someone else.
    - The team lands on `/demo/roadmap`, where cards drag; a member lands on `/demo`.
    - A 429 says "Too many demo sign-ins from here."
  - `<DemoBanner>`, above every page of the demo workspace. It carries the two buttons for visitors who aren't signed in.
  - `<MiniBoard>`: the landing page's picture, a roadmap pinned to the board, where a request gets stamped Shipped as the page opens. It's `aria-hidden`; the demo itself is one click away.
  - The header shows a guest's name and a Demo stamp, never their made-up address.
  - The demo's settings page says they're read-only, and a disabled `<fieldset>` disables every field.
  - The landing page:
    - A headline and the demo buttons.
    - Pano's own board, and the visitor's own workspace.
    - Four proof points and a footer.
    - Someone signed in with a real account sees no demo buttons: trying the demo would sign them out.

- [ ] **Step 1: Write the failing tests**

`src/features/demo/demo.test.tsx`:

```tsx
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/provider";
import { routeTree } from "@/routeTree.gen";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({
  toast: { error: toastError },
  Toaster: () => null,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  toastError.mockReset();
});

const guest = {
  id: "g1",
  name: "Guest 4821",
  email: "guest-1f2e@demo.pano.invalid",
};
const demoWorkspace = {
  id: "org_pano_demo",
  slug: "demo",
  name: "Inkwell",
  defaultLocale: "en",
  isDemo: true,
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
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : null;
      const url = new URL(request?.url ?? String(input), "http://localhost");
      const method = init?.method ?? request?.method ?? "GET";
      const ok = (data: unknown) => Response.json({ success: true, data });
      if (url.pathname === "/api/auth/demo/sign-in" && method === "POST") {
        demoSignIns.push(
          JSON.parse(String(init?.body ?? (await request?.text())))
        );
        if (demoStatus !== 200) {
          return Response.json({ message: "no" }, { status: demoStatus });
        }
        user = guest;
        return Response.json({ name: guest.name, team: true });
      }
      if (url.pathname === "/api/me") {
        const workspace =
          user === guest
            ? { id: "org_pano_demo", slug: "demo", name: "Inkwell" }
            : { id: "org_acme", slug: "acme", name: "Acme" };
        return ok({
          user,
          workspaces: user ? [{ ...workspace, role: "member" }] : [],
        });
      }
      if (url.pathname === "/api/workspaces/demo") return ok(demoWorkspace);
      if (url.pathname === "/api/workspaces/demo/roadmap") {
        return ok({ planned: [], in_progress: [], shipped: [] });
      }
      if (url.pathname === "/api/workspaces/demo/posts") {
        return ok({ items: [], page: 1, hasMore: false });
      }
      return Response.json(
        { success: false, code: "NOT_FOUND", error: "Not found" },
        { status: 404 }
      );
    })
  );
  return demoSignIns;
}

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nProvider>
  );
  return router;
}

describe("trying the demo", () => {
  it("signs in to a guest account and opens the demo's roadmap", async () => {
    const demoSignIns = fakeServer();
    const router = renderAt("/");
    fireEvent.click(await screen.findByRole("button", { name: "Try as team" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/demo/roadmap")
    );
    expect(demoSignIns).toEqual([{ as: "team" }]);
    // The header shows the guest's name, never the made-up address.
    expect(await screen.findByText("Guest 4821")).toBeTruthy();
    expect(screen.getByText("Demo")).toBeTruthy();
    expect(screen.queryByText(guest.email)).toBeNull();
  });

  it("says so when one address started too many demos", async () => {
    fakeServer({ demoStatus: 429 });
    const router = renderAt("/");
    fireEvent.click(
      await screen.findByRole("button", { name: "Try as member" })
    );
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Too many demo sign-ins from here. Wait a minute and try again."
      )
    );
    expect(router.state.location.pathname).toBe("/");
    expect(
      screen.getByRole("button", { name: "Try as member" }).matches(":disabled")
    ).toBe(false);
  });

  it("offers the two ways in on the demo's pages to visitors who aren't signed in", async () => {
    fakeServer();
    renderAt("/demo");
    const banner = await screen.findByRole("complementary", {
      name: "About this demo",
    });
    expect(banner.textContent).toContain("resets at 01:00 UTC");
    expect(
      await screen.findByRole("button", { name: "Try as team" })
    ).toBeTruthy();
  });

  it("shows the demo's settings as read-only to its team", async () => {
    fakeServer({ signedIn: true });
    renderAt("/demo/settings");
    expect(await screen.findByText(/they stay as they are/)).toBeTruthy();
    // A disabled fieldset disables every field inside it.
    expect(screen.getByLabelText("Name").matches(":disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "Try as team" })).toBeNull();
  });

  it("keeps the demo buttons from someone signed in with a real account", async () => {
    fakeServer({
      signedIn: true,
      as: { id: "u1", name: "Ayşe", email: "ayse@example.com" },
    });
    renderAt("/");
    expect(await screen.findByRole("link", { name: "Open Acme" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try as team" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test src/features/demo/demo.test.tsx`

Expected: FAIL: 4 of 5.
- The landing page has no "Try as team" button.
- The demo pages have no banner.
- The settings page says nothing about the demo.
- "keeps the demo buttons from someone signed in with a real account" passes already, because the old landing page has no demo buttons at all. It pins that the new one hides them.

- [ ] **Step 3: The words**

In `src/i18n/messages/en.json`, replace everything from `"home": {` up to `"signin": {`, the `home` and `header` objects, with:

```json
  "home": {
    "title": "Pano",
    "headline": "Feedback boards and a public roadmap",
    "intro": "People post what they need and vote on what matters. Your team answers in the open, moves requests across the roadmap, and tells everyone the moment something ships.",
    "demoNote": "The demo is Inkwell, a made-up notes app. You get your own guest account, and everything resets each night.",
    "ownBoard": "Ideas for Pano itself go on <link>Pano's own board</link>.",
    "signInCta": "Sign in to start your own board",
    "createWorkspace": "Create your workspace",
    "openWorkspace": "Open {name}",
    "pointsHeading": "What it does well",
    "votesTitle": "Votes that add up",
    "votesBody": "Fifty people voting at the same moment still leave the count equal to the votes. Click as fast as you like: it ends the way your last click left it.",
    "instantTitle": "Instant, and honest when it fails",
    "instantBody": "Votes, moves and comments show the moment you act. If the server says no, everything goes back, with a message that says why.",
    "duplicatesTitle": "Duplicates caught twice",
    "duplicatesBody": "While someone types a title, the five closest requests appear. The team merges the rest, and a person who voted on both counts once.",
    "languagesTitle": "English and Turkish",
    "languagesBody": "Every screen and email in both languages. Search folds Turkish letters, so “isler” finds “işler”.",
    "madeBy": "Made by <link>Olbios</link>.",
    "source": "Source on GitHub"
  },
  "header": {
    "signIn": "Sign in",
    "signOut": "Sign out",
    "language": "Language",
    "demo": "Demo"
  },
  "demo": {
    "asTeam": "Try as team",
    "asMember": "Try as member",
    "failed": "The demo couldn't start. Try again.",
    "tooMany": "Too many demo sign-ins from here. Wait a minute and try again.",
    "bannerLabel": "About this demo",
    "banner": "Inkwell is a demo workspace. Every visitor gets their own guest account, and everything resets at 01:00 UTC each night.",
    "settingsReadOnly": "You're on the demo's team, so you can see its settings, but they stay as they are. Try statuses, merging and the roadmap instead."
  },
```

In `src/i18n/messages/tr.json`, the same:

```json
  "home": {
    "title": "Pano",
    "headline": "Geri bildirim panoları ve herkese açık yol haritası",
    "intro": "İnsanlar ihtiyaçlarını yazar, önemli bulduklarına oy verir. Ekibiniz herkesin önünde yanıt verir, istekleri yol haritasında ilerletir ve bir şey yayınlandığı anda herkese haber verir.",
    "demoNote": "Demo, Inkwell adlı hayalî bir not uygulaması. Size ayrı bir misafir hesabı açılır ve her şey her gece sıfırlanır.",
    "ownBoard": "Pano'yla ilgili fikirler <link>Pano'nun kendi panosuna</link> yazılıyor.",
    "signInCta": "Kendi panonuzu kurmak için giriş yapın",
    "createWorkspace": "Çalışma alanınızı oluşturun",
    "openWorkspace": "{name} çalışma alanını aç",
    "pointsHeading": "İyi yaptığı işler",
    "votesTitle": "Kaymayan oylar",
    "votesBody": "Aynı anda oy veren elli kişi bile sayıyı oy sayısıyla eşit bırakır. İstediğiniz kadar hızlı tıklayın: sonuç, son tıkladığınız gibi olur.",
    "instantTitle": "Anında, ve hata olunca dürüst",
    "instantBody": "Oylar, taşımalar ve yorumlar tıkladığınız anda görünür. Sunucu reddederse her şey eski hâline döner ve nedenini söyleyen bir mesaj çıkar.",
    "duplicatesTitle": "Kopyalar iki kez yakalanır",
    "duplicatesBody": "Başlık yazılırken en benzer beş istek görünür. Kalanları ekip birleştirir; ikisine de oy veren biri tek sayılır.",
    "languagesTitle": "Türkçe ve İngilizce",
    "languagesBody": "Her ekran ve her e-posta iki dilde. Arama Türkçe harfleri tanır: “isler” araması “işler”i bulur.",
    "madeBy": "<link>Olbios</link> tarafından yapıldı.",
    "source": "Kaynak kodu GitHub'da"
  },
  "header": {
    "signIn": "Giriş yap",
    "signOut": "Çıkış yap",
    "language": "Dil",
    "demo": "Demo"
  },
  "demo": {
    "asTeam": "Ekip olarak deneyin",
    "asMember": "Üye olarak deneyin",
    "failed": "Demo başlatılamadı. Tekrar deneyin.",
    "tooMany": "Buradan çok fazla demo girişi yapıldı. Bir dakika bekleyip tekrar deneyin.",
    "bannerLabel": "Bu demo hakkında",
    "banner": "Inkwell bir demo çalışma alanıdır. Her ziyaretçiye ayrı bir misafir hesabı verilir ve her şey her gece 01:00'de (UTC) sıfırlanır.",
    "settingsReadOnly": "Demonun ekibindesiniz; ayarları görebilirsiniz ama değiştiremezsiniz. Bunun yerine durumları, birleştirmeyi ve yol haritasını deneyin."
  },
```

- [ ] **Step 4: Signing in to the demo, and the buttons**

`src/lib/demo.ts`:

```ts
import type { DemoRole } from "@/shared/demo";

/**
 * "Try as team" or "Try as member": signs in to a new guest account in the
 * demo workspace. Better Auth answers it (worker/demo/sign-in.ts) and sets
 * the session cookie. Answers the HTTP status when it's refused, or 0 when
 * the server couldn't be reached.
 */
export async function signInDemo(
  as: DemoRole
): Promise<{ ok: true } | { ok: false; status: number }> {
  try {
    const res = await fetch("/api/auth/demo/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ as }),
    });
    return res.ok ? { ok: true } : { ok: false, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}
```

`src/features/demo/demo-buttons.tsx`:

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { signInDemo } from "@/lib/demo";
import { DEMO_WORKSPACE_SLUG, type DemoRole } from "@/shared/demo";

/**
 * The two ways into the demo. The team lands on the roadmap, where cards
 * can be dragged; a member lands on the requests.
 */
export function DemoButtons({ size = "default" }: { size?: "default" | "lg" }) {
  const t = useTranslations("demo");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [starting, setStarting] = useState<DemoRole | null>(null);

  async function start(as: DemoRole) {
    setStarting(as);
    const result = await signInDemo(as);
    if (!result.ok) {
      setStarting(null);
      toast.error(result.status === 429 ? t("tooMany") : t("failed"));
      return;
    }
    // Everything cached so far was read as someone else.
    await queryClient.invalidateQueries();
    const ws = DEMO_WORKSPACE_SLUG;
    await (as === "team"
      ? navigate({ to: "/$ws/roadmap", params: { ws } })
      : navigate({ to: "/$ws", params: { ws } }));
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Button
        size={size}
        disabled={starting !== null}
        onClick={() => void start("team")}
      >
        {t("asTeam")}
      </Button>
      <Button
        size={size}
        variant="outline"
        disabled={starting !== null}
        onClick={() => void start("member")}
      >
        {t("asMember")}
      </Button>
    </div>
  );
}
```

`src/features/demo/demo-banner.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "use-intl";
import { meQueryOptions } from "@/lib/session";
import { DemoButtons } from "./demo-buttons";

/**
 * Above every page of the demo workspace: what this place is, and for
 * visitors who aren't signed in, the two ways in.
 */
export function DemoBanner() {
  const t = useTranslations("demo");
  const me = useQuery(meQueryOptions);
  return (
    <aside
      aria-label={t("bannerLabel")}
      className="paper flex flex-col gap-3 p-4"
    >
      <p className="max-w-prose text-sm">{t("banner")}</p>
      {me.data && !me.data.user && <DemoButtons />}
    </aside>
  );
}
```

- [ ] **Step 5: The landing page**

`src/features/landing/mini-board.tsx`:

```tsx
import { cn } from "cn";
import { useTranslations } from "use-intl";
import type { RoadmapStatus } from "@/shared/status";

type Card = { title: string; votes: number; justShipped?: boolean };

// A few of the demo's real requests, as they sit on its roadmap.
const COLUMNS: { status: RoadmapStatus; cards: Card[] }[] = [
  {
    status: "planned",
    cards: [
      { title: "Dark mode", votes: 31 },
      { title: "Google Calendar: link notes to events", votes: 16 },
    ],
  },
  {
    status: "in_progress",
    cards: [
      { title: "Export notebooks to PDF", votes: 24 },
      { title: "Pin notes to the top of a notebook", votes: 10 },
    ],
  },
  {
    status: "shipped",
    cards: [
      { title: "Keyboard shortcut cheat sheet", votes: 15, justShipped: true },
      { title: "Import from Notion", votes: 18 },
    ],
  },
];

// Pinned by hand, so no two hang quite straight.
const TILT = ["-rotate-1", "rotate-[0.6deg]", "rotate-[-0.4deg]", "rotate-1"];

/**
 * The landing page's picture of Pano: a roadmap pinned to the board, where
 * a request gets stamped Shipped as the page opens. It's a picture, so
 * assistive tech skips it; the demo itself is one click away.
 */
export function MiniBoard() {
  const tStatuses = useTranslations("statuses");
  return (
    <div aria-hidden="true" className="grid grid-cols-3 gap-3 sm:gap-5">
      {COLUMNS.map((column, c) => (
        <div key={column.status} className="flex flex-col gap-4">
          <p className="font-heading font-semibold text-sm sm:text-base">
            {tStatuses(column.status)}
          </p>
          {column.cards.map((card, i) => (
            <div
              key={card.title}
              className={cn(
                "paper relative flex flex-col gap-3 p-2.5 pt-4 sm:p-4 sm:pt-5",
                TILT[(c * 2 + i) % TILT.length]
              )}
            >
              <span className="absolute -top-1.5 left-1/2 size-3 -translate-x-1/2 rounded-full bg-foreground shadow-[inset_-2px_-2px_0_rgb(0_0_0/0.25),0_2px_3px_rgb(0_0_0/0.25)]" />
              <p className="font-heading font-semibold text-xs leading-snug sm:text-[0.95rem]">
                {card.title}
              </p>
              <p className="self-start rounded-sm border px-1.5 font-semibold text-xs tabular-nums">
                {card.votes}
              </p>
              {card.justShipped && (
                <span className="motion-safe:animate-stamp absolute -rotate-[7deg] -top-3 -right-2 rounded-[3px] border-2 border-stamp-shipped bg-card/70 px-1.5 font-bold font-heading text-[0.7rem] text-stamp-shipped sm:top-auto sm:right-3 sm:bottom-3 sm:bg-transparent sm:text-sm">
                  {tStatuses("shipped")}
                </span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

`src/routes/index.tsx`, replacing it:

```tsx
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslations } from "use-intl";
import { DemoButtons } from "@/features/demo/demo-buttons";
import { MiniBoard } from "@/features/landing/mini-board";
import { meQueryOptions } from "@/lib/session";
import { isDemoEmail } from "@/shared/demo";

export const Route = createFileRoute("/")({ component: Home });

const POINTS = ["votes", "instant", "duplicates", "languages"] as const;

function Home() {
  const t = useTranslations("home");
  const me = useQuery(meQueryOptions);
  const user = me.data?.user;
  // Trying the demo signs in as a guest, which would sign a real account out.
  const showDemo = !me.isPending && (!user || isDemoEmail(user.email));

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-20 px-6 py-14 md:py-20">
      <section className="grid items-center gap-14 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex flex-col gap-6">
          <h1 className="font-bold text-5xl leading-[1.02] md:text-6xl">
            {t("headline")}
          </h1>
          <p className="max-w-[46ch] text-lg">{t("intro")}</p>
          {showDemo && (
            <div className="flex flex-col gap-3">
              <DemoButtons size="lg" />
              <p className="max-w-[46ch] text-muted-foreground text-sm">
                {t("demoNote")}
              </p>
            </div>
          )}
          <YourBoard />
        </div>
        <MiniBoard />
      </section>

      <section aria-labelledby="points" className="flex flex-col gap-8">
        <h2 id="points" className="font-bold text-3xl">
          {t("pointsHeading")}
        </h2>
        <dl className="grid gap-x-12 gap-y-8 md:grid-cols-2">
          {POINTS.map((point) => (
            <div key={point} className="flex flex-col gap-2">
              <dt className="font-heading font-semibold text-xl">
                {t(`${point}Title`)}
              </dt>
              <dd className="max-w-[52ch] text-muted-foreground">
                {t(`${point}Body`)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className="flex flex-wrap gap-x-6 gap-y-2 border-t pt-6 text-muted-foreground text-sm">
        <p>
          {t.rich("madeBy", {
            link: (chunks) => (
              <a
                className="text-foreground underline-offset-4 hover:underline"
                href="https://olbios.olbios88.workers.dev"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
        <a
          className="text-foreground underline-offset-4 hover:underline"
          href="https://github.com/Olbioss/pano"
        >
          {t("source")}
        </a>
      </footer>
    </main>
  );
}

/** Beyond the demo: Pano's own board, and the visitor's own workspace. */
function YourBoard() {
  const t = useTranslations("home");
  const me = useQuery(meQueryOptions);
  const user = me.data?.user;
  const workspace = me.data?.workspaces.find((w) => w.slug !== "demo");
  const link = "font-medium underline underline-offset-4";

  return (
    <div className="flex flex-col gap-1 text-sm">
      <p>
        {t.rich("ownBoard", {
          link: (chunks) => (
            <Link to="/$ws" params={{ ws: "pano" }} className={link}>
              {chunks}
            </Link>
          ),
        })}
      </p>
      {me.isPending ? null : !user || isDemoEmail(user.email) ? (
        <Link to="/signin" className={link}>
          {t("signInCta")}
        </Link>
      ) : workspace ? (
        <Link to="/$ws" params={{ ws: workspace.slug }} className={link}>
          {t("openWorkspace", { name: workspace.name })}
        </Link>
      ) : (
        <Link to="/new-workspace" className={link}>
          {t("createWorkspace")}
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 6: The demo inside the app**

In `src/components/site-header.tsx`:
- Import `isDemoEmail` after the session import: `import { isDemoEmail } from "@/shared/demo";`.
- Replace the signed-in person's email span with:

```tsx
            {isDemoEmail(user.email) ? (
              // Guests' addresses are made up; their name is what others see.
              <span className="hidden items-center gap-2 text-sm sm:inline-flex">
                <span className="font-medium">{user.name}</span>
                <span className="rounded-[3px] border border-foreground/30 px-1.5 py-px text-xs">
                  {t("demo")}
                </span>
              </span>
            ) : (
              <span className="hidden text-muted-foreground text-sm sm:inline">
                {user.email}
              </span>
            )}
```

In `src/routes/$ws.tsx`:
- Import the banner before the locale import: `import { DemoBanner } from "@/features/demo/demo-banner";`.
- Show it first in the layout, before the `<header>`:

```tsx
      {workspace.isDemo && <DemoBanner />}
```

In `src/routes/$ws/settings.tsx`, the demo's settings are read-only:
- Add `const tDemo = useTranslations("demo");` after `const t = useTranslations("settings");`.
- Replace the outer `<div className="flex flex-col gap-10">` and its closing `</div>` with a fieldset, with the notice first:

```tsx
    // The demo's settings stay as the nightly reset makes them; the API
    // refuses changes, and a disabled fieldset says so up front.
    <fieldset disabled={workspace.isDemo} className="flex flex-col gap-10">
      {workspace.isDemo && (
        <p className="paper p-4 text-sm">{tDemo("settingsReadOnly")}</p>
      )}
```

```tsx
    </fieldset>
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bun run test src/features/demo/demo.test.tsx`

Expected: PASS: 1 test file, 5 tests

Then run: `bun run test`

Expected: PASS. 68 test files, 509 tests. The catalogs' key-parity test passes: both gained the same keys.

- [ ] **Step 8: Look**

With `bun run dev` running, open `/`.

Expected:
- The headline beside a pinned three-column roadmap.
- About a second in, a green Shipped stamp drops onto "Keyboard shortcut cheat sheet", unless the system asks for reduced motion.
- "Try as team" signs in a guest and opens `/demo/roadmap`, with "Guest NNNN" and a Demo stamp in the header.
- On `/demo/settings`, the notice, and every field disabled.
- At 390 px wide, the hero stacks above the board.

- [ ] **Step 9: Commit**

```bash
bun run typecheck
bun run check:fix && bun run check
git add src
git commit -m "feat: the landing page, the demo buttons and banner, and read-only demo settings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The end-to-end suite

**Files:**
- Create: `playwright.config.ts`, `e2e/global-setup.ts`, `e2e/helpers.ts`, `e2e/member.spec.ts`, `e2e/roadmap.spec.ts`, `e2e/link-preview.spec.ts`
- Modify: `package.json` and `bun.lock`, `tsconfig.node.json`, `biome.json`, `.gitignore`, `.github/workflows/ci.yml`, `src/features/submit/similar-panel.tsx`

**Interfaces:**
- Consumes:
  - Task 2's `bun run seed`.
  - Task 7's landing buttons, which sign in a guest.
  - Phase 0's `assertLocalDatabaseUrl`.
- Produces:
  - `bun run e2e`. By default it builds the app and serves it with `vite preview` on port 5173, the origin `.dev.vars` names. The Worker runs in workerd against the database in `DATABASE_URL`, which must be local. Global setup migrates that database and resets the demo there.
  - With `E2E_BASE_URL` set, it runs against that site as it is, and the tests delete what they make.
  - The CI job `e2e`.

The spec's three journeys:
- A member submits a request, sees similar ones, votes and comments.
- The team drags a card to Planned, and a member, in another browser, sees the new status.
- A request's link carries its `og:title`.

Every test signs in through the landing page's demo buttons, so the suite runs unchanged against the live site, where nobody can receive a sign-in code.

- [ ] **Step 1: Add Playwright**

Run: `bun add -d --exact @playwright/test@1.63.0`

The exact version uses Chromium build 1243, which is already in `~/Library/Caches/ms-playwright` on this Mac. On a machine without it, run `bunx playwright install chromium` once.

In `package.json`, add the script after `test:watch`:

```json
    "e2e": "playwright test",
```

In `tsconfig.node.json`, add `"playwright.config.ts",` after `"auth.config.ts",` and `"e2e",` after `"test",` in `include`. In `biome.json`, add `"e2e/**/*",` after `"test/**/*",` in `files.includes`. In `.gitignore`, after `*.log`:

```
# Playwright's output
test-results
playwright-report
blob-report
```

- [ ] **Step 2: Write the suite**

`playwright.config.ts`:

```ts
import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { assertLocalDatabaseUrl } from "./worker/test/local-db";

// Playwright doesn't read .env, and `bun run` doesn't pass it on. Variables
// already set, as CI sets them, win over the file's.
if (existsSync(".env")) process.loadEnvFile(".env");

/**
 * The end-to-end suite: the production build, driven by Chromium.
 *
 * By default it builds the app and serves it with `vite preview`, so the
 * Worker runs in workerd as it does on Cloudflare, against the database in
 * DATABASE_URL; e2e/global-setup.ts resets the demo there first. With
 * E2E_BASE_URL set it runs against that site as it is, such as the live
 * demo, and the tests clean up what they make.
 */
const live = process.env.E2E_BASE_URL;
// The origin .dev.vars names as BETTER_AUTH_URL, which Better Auth trusts.
const LOCAL = "http://localhost:5173";

/** The local database the preview and the reset share. */
function localDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
  // The setup resets the demo there, and the tests write to it.
  assertLocalDatabaseUrl(url);
  // Miniflare refuses a Hyperdrive connection string without a password.
  const withPassword = new URL(url);
  if (!withPassword.password) withPassword.password = "local";
  return withPassword.toString();
}

export default defineConfig({
  testDir: "e2e",
  // Every test shares the one demo workspace, so they run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],
  globalSetup: live ? undefined : "./e2e/global-setup.ts",
  use: {
    baseURL: live ?? LOCAL,
    locale: "en-US",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: live
    ? undefined
    : {
        command: "bun run build && bunx vite preview --port 5173 --strictPort",
        url: `${LOCAL}/api/health`,
        // A dev server already on the port fails the run instead of being
        // tested: it isn't the production build.
        reuseExistingServer: false,
        timeout: 180_000,
        env: {
          CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
            localDatabase(),
        },
      },
});
```

`e2e/global-setup.ts`:

```ts
import { execFileSync } from "node:child_process";

/**
 * A local run starts from the schema production has and a freshly reset
 * demo, the way the nightly cron leaves it. Both commands read DATABASE_URL.
 */
export default function globalSetup() {
  execFileSync("bun", ["run", "db:migrate"], { stdio: "inherit" });
  execFileSync("bun", ["run", "seed"], { stdio: "inherit" });
}
```

`e2e/helpers.ts`:

```ts
import { expect, type Page } from "@playwright/test";

/** A title no other run uses, so tests find their own requests. */
export const unique = (title: string) => `${title} ${Date.now().toString(36)}`;

/** Takes a landing page button into the demo, as a new guest. */
export async function tryDemo(page: Page, as: "team" | "member") {
  await page.goto("/");
  await page
    .getByRole("button", {
      name: as === "team" ? "Try as team" : "Try as member",
    })
    .click();
  await expect(page).toHaveURL(as === "team" ? /\/demo\/roadmap$/ : /\/demo$/);
  await expect(page.getByText(/^Guest \d{4}$/)).toBeVisible();
}

/** Posts a request in the demo and answers its address. */
export async function postRequest(page: Page, title: string, body = "") {
  await page.goto("/demo/new");
  await page.getByLabel("Title").fill(title);
  if (body) await page.getByLabel("Details (optional)").fill(body);
  await page.getByRole("button", { name: "Post request" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: title })
  ).toBeVisible();
  return new URL(page.url()).pathname;
}

/** Deletes the request open on the page: its author or the team can. */
export async function deleteRequest(page: Page) {
  const article = page.getByRole("article");
  await article.getByRole("button", { name: "Delete" }).click();
  await article.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page).toHaveURL(/\/demo$/);
}
```

`e2e/member.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { deleteRequest, postRequest, tryDemo, unique } from "./helpers";

test("a member submits a request, sees similar ones, votes and comments", async ({
  page,
}) => {
  await tryDemo(page, "member");

  // Typing a title brings up the requests it may duplicate, each votable.
  await page.goto("/demo/new");
  await page.getByLabel("Title").fill("Dark theme for the editor");
  const similar = page.getByRole("complementary", {
    name: "Similar requests",
  });
  const vote = similar.getByRole("button", { name: "Vote for Dark mode" });
  const before = Number(await vote.textContent());
  await vote.click();
  await expect(vote).toHaveText(String(before + 1));
  await expect(vote).toHaveAttribute("aria-pressed", "true");
  // Taken back, so the demo is left as it was.
  await vote.click();
  await expect(vote).toHaveText(String(before));

  const title = unique("Export to Markdown, from the end-to-end suite");
  await postRequest(page, title, "Posted by the end-to-end suite.");
  // The author's own vote comes with the request.
  const article = page.getByRole("article");
  await expect(
    article.getByRole("button", { name: `Vote for ${title}` })
  ).toHaveText("1");

  await page.getByLabel("Add a comment").fill("A comment from the suite.");
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(page.getByRole("heading", { name: "1 comment" })).toBeVisible();
  await expect(
    page
      .getByRole("list", { name: "Comments" })
      .getByText("A comment from the suite.")
  ).toBeVisible();

  await deleteRequest(page);
});
```

`e2e/roadmap.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { deleteRequest, postRequest, tryDemo, unique } from "./helpers";

test("the team drags a card to Planned, and a member sees the new status", async ({
  browser,
}) => {
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await tryDemo(member, "member");
  const title = unique("Card for the roadmap test");
  const path = await postRequest(member, title);

  const teamContext = await browser.newContext();
  const team = await teamContext.newPage();
  await tryDemo(team, "team");

  // Onto the roadmap first: In progress, from the request's page.
  await team.goto(path);
  await team.getByLabel("Status", { exact: true }).selectOption("in_progress");
  await team.getByRole("button", { name: "Update status" }).click();
  await expect(
    team.getByRole("article").getByText("In progress", { exact: true })
  ).toBeVisible();

  // Then dragged by its handle into Planned.
  await team.goto("/demo/roadmap");
  const planned = team.locator('[data-roadmap-column="planned"]');
  await team.getByRole("button", { name: `Move “${title}”` }).hover();
  await team.mouse.down();
  const target = await planned.boundingBox();
  if (!target) throw new Error("the Planned column isn't on screen");
  await team.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    { steps: 15 }
  );
  await team.mouse.up();
  await expect(planned.getByRole("link", { name: title })).toBeVisible();

  // The member, in another browser, sees it planned.
  await member.reload();
  await expect(
    member.getByRole("article").getByText("Planned", { exact: true })
  ).toBeVisible();

  await team.goto(path);
  await deleteRequest(team);
  await memberContext.close();
  await teamContext.close();
});
```

`e2e/link-preview.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("a request's link carries its title for previews", async ({ request }) => {
  const feed = await request.get("/api/workspaces/demo/posts?sort=top");
  const { data } = (await feed.json()) as {
    data: { items: { ref: string; title: string }[] };
  };
  const post = data.items[0];
  if (!post) throw new Error("the demo has no requests");

  const page = await request.get(`/p/${post.ref}`);
  expect(page.status()).toBe(200);
  expect(await page.text()).toMatch(
    new RegExp(
      `<meta property="og:title" content="${escapeRegExp(`${post.title} · Inkwell`)}"`
    )
  );
});
```

- [ ] **Step 3: Run it to watch the member journey fail**

Stop `bun run dev` if it's running: the suite needs port 5173 and refuses a server that's already there. Then run: `bun run e2e`

Expected: 2 passed, 1 failed.
- `member.spec.ts` times out looking for the "Similar requests" panel by name: the `<aside>` has a heading but no accessible name.
- `roadmap.spec.ts` and `link-preview.spec.ts` pass. They check what Tasks 1–7 already built.

- [ ] **Step 4: Name the similar-requests panel**

In `src/features/submit/similar-panel.tsx`, give the `<aside>` its heading as a label: add `aria-labelledby="similar-heading"` after `aria-live="polite"`, and an id on the heading:

```tsx
        <h3 id="similar-heading" className="font-medium text-sm">
          {t("similarHeading")}
        </h3>
```

- [ ] **Step 5: Run it to verify it passes**

Run: `bun run e2e`

Expected: 3 passed. Global setup prints `✓ demo: 29 requests, 296 votes, 26 comments` first.

Then run: `bun run test`

Expected: PASS. 68 test files, 509 tests, as before: Playwright's specs aren't Vitest's.

- [ ] **Step 6: Run it in CI**

In `.github/workflows/ci.yml`, add a second job after `verify`:

```yaml
  e2e:
    name: end-to-end
    runs-on: ubuntu-latest

    # The production build in workerd (vite preview), driven by Chromium,
    # against this job's own Postgres. The suite's setup migrates it and
    # seeds the demo workspace.
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: pano_e2e
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/pano_e2e

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.1

      - name: Install
        run: bun install --frozen-lockfile

      # vite preview reads the Worker's variables from .dev.vars. Not a
      # secret: the database it signs sessions for lasts one job.
      - name: Worker variables
        run: |
          cp .dev.vars.example .dev.vars
          sed -i 's/^BETTER_AUTH_SECRET=.*/BETTER_AUTH_SECRET=ci-not-a-secret-ci-not-a-secret-0123/' .dev.vars

      - name: Cache Playwright's browser
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('bun.lock') }}

      - name: Install Chromium
        run: bunx playwright install --with-deps chromium

      - name: End-to-end
        run: bun run e2e

      - name: Keep the Playwright report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

- [ ] **Step 7: Commit**

```bash
bun run typecheck
bun run check:fix && bun run check
git add package.json bun.lock tsconfig.node.json biome.json .gitignore playwright.config.ts e2e .github/workflows/ci.yml src/features/submit/similar-panel.tsx
git commit -m "test: end-to-end journeys against the production build, locally, in CI and live" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Ready to deploy

**Files:**
- Modify: `wrangler.jsonc`, `worker/config.test.ts`, `package.json`, `README.md`

**Interfaces:**
- Consumes: Task 5's `worker/config.test.ts`.
- Produces:
  - `vars` in `wrangler.jsonc`: `ENVIRONMENT=production` and `BETTER_AUTH_URL=https://pano.olbios88.workers.dev`. Locally, `.dev.vars` wins over both; the spike checked this.
  - `bun run deploy`: `vite build && wrangler deploy`.
  - The README's demo, end-to-end and deploying sections.

Production has to know it's production:
- `ENVIRONMENT=production` turns on the rate limits.
- It also makes a missing Brevo key fail loudly. Without it, the mailer would fall back to printing sign-in codes into the Worker's logs.
- `BETTER_AUTH_URL` is the origin Better Auth trusts, and the one email links use.

- [ ] **Step 1: Write the failing test**

In `worker/config.test.ts`, add inside the `describe`, after the KV test:

```ts
  it("runs production as production, at its own address", () => {
    const { vars } = wranglerConfig();
    // Without it, rate limits are off, and a missing Brevo key would print
    // sign-in codes to the log instead of failing.
    expect(vars?.ENVIRONMENT).toBe("production");
    expect(vars?.BETTER_AUTH_URL).toBe("https://pano.olbios88.workers.dev");
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test worker/config.test.ts`

Expected: FAIL: "runs production as production" receives `undefined`.

- [ ] **Step 3: Production's settings, and the deploy script**

In `wrangler.jsonc`, after `"observability": { "enabled": true },`:

```jsonc
  // Production's settings. Local dev and the tests take theirs from
  // .dev.vars, which wins over these.
  "vars": {
    "ENVIRONMENT": "production",
    "BETTER_AUTH_URL": "https://pano.olbios88.workers.dev"
  },
```

In `package.json`, add after `preview`:

```json
    "deploy": "vite build && wrangler deploy",
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bun run test worker/config.test.ts`

Expected: PASS: 1 test file, 3 tests

Then run `bun run cf-typegen`.

Expected: `worker-configuration.d.ts` doesn't change. `.dev.vars` already defines both names as strings.

- [ ] **Step 5: The README**

`README.md`, replacing it:

````markdown
# Pano

Feedback boards and a public roadmap. People post feature requests, vote, and
discuss in threads; teams move requests across a public roadmap. English and
Turkish.

Live: <https://pano.olbios88.workers.dev>. "Try as team" and "Try as member"
open a demo workspace with your own guest account.

Design: [docs/superpowers/specs/2026-10-16-pano-design.md](docs/superpowers/specs/2026-10-16-pano-design.md)

## Stack

- **One Worker:** a single Cloudflare Worker serves the React app and the Hono
  API.
- **Database:** Postgres, reached through Drizzle and postgres.js. Production
  uses Neon through Hyperdrive; local dev uses Homebrew Postgres 17.
- **Frontend:** TanStack Router and Query, Tailwind CSS 4 with shadcn/ui, and
  use-intl.
- **Tooling:** Bun, Biome, Vitest and Playwright.

## Local setup

You need Bun 1.3 and Postgres 17 at `127.0.0.1:5432`, set to trust local
connections (Homebrew's default).

```sh
createdb -h 127.0.0.1 pano
createdb -h 127.0.0.1 pano_test
cp .env.example .env            # tool-only variables (drizzle-kit, Vitest)
cp .dev.vars.example .dev.vars  # Worker variables; the file must exist
# then set BETTER_AUTH_SECRET in .dev.vars to: openssl rand -base64 32
bun install
bun run db:migrate
bun run seed                    # the demo workspace, at /demo
bun run dev                     # http://localhost:5173
```

If your Postgres role isn't `olbios`, change the user in two places:

- `.env`
- the `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` variable

The Hyperdrive string needs a password, even a dummy one: Miniflare rejects it
otherwise.

## Scripts

| Script | What it does |
|---|---|
| `bun run dev` | Vite with the Worker running in workerd |
| `bun run build` | Builds the Worker and the client into `dist/` |
| `bun run typecheck` | `tsc -b` over the app, worker and tooling projects |
| `bun run check` / `check:fix` | Biome lint and format |
| `bun run test` | Vitest; migrates `pano_test` first |
| `bun run e2e` | Playwright against the production build in workerd (see below) |
| `bun run seed` | Rebuilds the demo workspace in `DATABASE_URL`; with `PANO_OWNER_EMAIL`, also makes `/pano` |
| `bun run deploy` | Builds and deploys the Worker (see Deploying) |
| `bun run db:generate` / `db:migrate` | drizzle-kit against `DATABASE_URL` |
| `bun run cf-typegen` | Regenerates `worker-configuration.d.ts` after `wrangler.jsonc` changes |
| `bun run vote-drift` | BetterNews's vote toggle under 20 rapid clicks, next to Pano's votes (local test database) |

## Layout and rules

- `worker/app.ts`: the whole API as one chained Hono app. It stays
  runtime-agnostic (no Workers globals, bindings only from `c.env`), because
  the browser project typechecks it through `AppType` and tests run it under
  Node.
- `worker/index.ts`: the Workers entry. Workers-only code goes here: `/p/*`
  link previews, and the cron triggers, which run `worker/cron.ts`:
  - Every five minutes it sends queued emails, but only while a KV flag says
    a status change queued some. Neon's free plan counts the hours the
    database is awake, and it sleeps after five quiet minutes.
  - Every night at 01:00 UTC it resets the demo workspace.

  In local dev, `curl 'http://localhost:5173/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*'`
  (or `cron=0+1+*+*+*`) runs one, and emails print in the terminal.
- `worker/auth.ts`: Better Auth, with email-code sign-in and workspaces as
  organizations. Its routes under `/api/auth/*` answer in Better Auth's JSON,
  so the browser calls them through `authClient`. In local dev, sign-in codes
  print in the terminal running `bun run dev`.
- `worker/services/`: the queries behind the routes. `votes.ts` locks the
  post row and writes the state the person asked for, so the count moves
  only by the rows that changed. `comments.ts` takes the same lock and
  moves `comment_count` and `reply_count` in the comment's own transaction.
  Deleting a comment is soft, so its replies keep their place. `ranking.ts`
  (trending, top, new) and `similar.ts` serve the feed and the submit form.
  `status.ts` moves a post and, on Shipped, queues one email per subscriber
  in the same transaction (`outbox.ts`). `merge.ts` locks both posts and
  moves votes, subscriptions and comments at once.
- **Search** folds case and Turkish letters with the SQL function
  `pano_fold` (migration `0005_search_fold.sql`), on the stored `tsvector`
  and on the query alike, so results don't depend on the database's locale.
- `worker/og.ts`: `/p/*` reaches the Worker before the assets layer and gets
  the app shell with the post's link-preview meta tags.
- **The demo** (`worker/demo/`, `worker/services/demo-reset.ts`): the `demo`
  workspace is Inkwell, a made-up notes app, described in
  `worker/demo/content.ts`.
  - Each "Try as team" or "Try as member" makes a new guest account with an
    address at `demo.pano.invalid`, which can't receive mail.
  - Demo accounts act only inside the demo (`worker/middleware/demo.ts`).
  - The demo's settings are read-only, and it never sends email.
  - The nightly reset replaces the whole workspace and deletes guests from
    before the last reset, in four statements, to stay inside the free
    plan's 10 ms of CPU.
- `shared/`: code both sides use, including the response envelope in
  `shared/envelope.ts`.
- `src/`: the React app. It calls the API only through
  `unwrap(await api.….$get())` from `src/lib/api.ts`.
- `src/features/comments/`: the thread under each post. A new comment shows
  at once as a greyed-out draft. It gives way to the server's copy, or
  disappears again, with its text back in the box, if saving fails.
- `src/features/roadmap/`: the public roadmap. The team drags cards between
  columns with dnd-kit, and the arrow keys move a picked-up card a column at
  a time.
- **The look** (`src/styles.css`): paper on a cork board. Everything people
  wrote sits on a `.paper` sheet, text is blue-black ink, and signal orange
  marks only what you can act on. Status labels are ink stamps, counts use
  tabular figures, and dark mode follows the system setting.
- **Aliases:** `@/shared/*` works everywhere. `@/*` means `src/` and is used
  only there. Worker files import each other relatively.

## End-to-end tests

`bun run e2e` builds the app, serves it with `vite preview` on port 5173,
and drives it with Chromium. Stop `bun run dev` first: the suite refuses a
server that is already running. Its setup migrates the database in
`DATABASE_URL`, which must be local, and resets the demo there.

`E2E_BASE_URL=https://pano.olbios88.workers.dev bun run e2e` runs the same
tests against the live site, in its demo workspace; they delete what they
create.

## Deploying

Production is a Cloudflare Worker with Neon Postgres behind Hyperdrive, all
on free plans. One-time setup:

1. Create a Neon project with a `pano` database, and copy its direct
   connection string (not the pooled one: Hyperdrive pools).
2. `bunx wrangler hyperdrive create pano --connection-string="$NEON_URL" --caching-disabled`,
   then put the id it prints in `wrangler.jsonc`. Caching stays off:
   Hyperdrive would otherwise answer a read with results up to a minute old,
   and a vote would seem to undo itself.
3. `bunx wrangler kv namespace create FLAGS`, then put that id in
   `wrangler.jsonc` too.
4. Set the secrets with `bunx wrangler secret put <NAME>`:
   - `BETTER_AUTH_SECRET`: `openssl rand -base64 32`
   - `BREVO_API_KEY`: a Brevo API key
   - `MAIL_FROM`: a sender address Brevo has verified

   In Brevo, also turn off blocking of unknown IP addresses for the key:
   Workers send from changing addresses.
5. `DATABASE_URL="$NEON_URL" bun run db:migrate`
6. `DATABASE_URL="$NEON_URL" PANO_OWNER_EMAIL=you@example.com bun run seed`
   builds the demo and makes `/pano`, owned by whoever signs in with that
   address.

Then `bun run deploy`, and check the live site with
`E2E_BASE_URL=… bun run e2e`. `vars` in `wrangler.jsonc` hold production's
`ENVIRONMENT` and `BETTER_AUTH_URL`; `.dev.vars` overrides both locally.
````

- [ ] **Step 6: Run everything**

```bash
bun run typecheck
bun run check
bun run test
bun run build
git diff --exit-code src/routeTree.gen.ts
bun run e2e
```

Expected:
- Typecheck, Biome and the build pass.
- The suite passes: 68 test files, 510 tests.
- The route tree is unchanged.
- The end-to-end suite passes: 3 tests.

- [ ] **Step 7: Commit**

```bash
bun run check:fix && bun run check
git add wrangler.jsonc worker/config.test.ts package.json README.md
git commit -m "chore: production's settings, bun run deploy, and the README's demo and deploy guides" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Part 2: Launch (after the merge, with you)

**Executors stop after Task 9.** The final review, its fixes and the finishing step come first. These steps start only once `main` holds Phase 5 and you say go.

They touch your accounts and publish things, so each says who runs it:
- **You:** anything that needs your login or a secret. I never see a secret: you type those into your own terminal, or with `!` in this session.
- **Me:** config edits and checks, once you've said go for that step.

The spec's done-when for Phase 5 is L7: the live URL passes the end-to-end suite.

### L1. Before you start (you)

1. `bunx wrangler whoami`: it should name the account whose workers.dev subdomain is `olbios88`, the one your portfolio runs on. If it doesn't, run `bunx wrangler login`.
2. The Workers free plan allows **5 cron triggers per account**, and Pano adds 2. Check the triggers on your other Workers: dashboard → Workers & Pages → each Worker → Settings → Triggers.

### L2. The database (you)

1. In the Neon console, create a project `pano`:
   - Postgres 17.
   - Region AWS Europe Central 1 (Frankfurt), the closest to you. Hyperdrive pools near it.
   - Database `pano`.
2. Connection details: switch **Connection pooling off** (Hyperdrive pools), then copy the connection string. It ends in `?sslmode=require`.
3. Keep it in your shell only, never in a file in the repo: `export NEON_URL='postgresql://…'`.

### L3. Hyperdrive and KV (you run them; I edit the config)

```bash
bunx wrangler hyperdrive create pano --connection-string="$NEON_URL" --caching-disabled
bunx wrangler kv namespace create FLAGS
```

Caching stays off. Otherwise Hyperdrive answers reads with results up to a minute old, and a vote would seem to undo itself.

Send me the two ids they print. They aren't secrets. I put them in `wrangler.jsonc` in place of the zeros and commit on `main`: `chore: production Hyperdrive and KV ids`.

### L4. Secrets (you)

```bash
openssl rand -base64 32 | bunx wrangler secret put BETTER_AUTH_SECRET
bunx wrangler secret put BREVO_API_KEY
bunx wrangler secret put MAIL_FROM
```

- **Order:** these come before the first deploy, so sign-in works from the first request. On a Worker that doesn't exist yet, wrangler offers to create it.
- **`BREVO_API_KEY`:** an API key (`xkeysib-…`), not an SMTP key.
- **`MAIL_FROM`:** a sender Brevo has verified.
- **IP blocking:** in Brevo → Security → Authorised IPs, **deactivate blocking of unknown addresses**. Workers send from changing addresses, and Brevo turns blocking on by itself after 30 days without a new one.
- **Quota:** Brevo's free 300 emails a day are shared with anything else on the account, Rezerve included.

### L5. Schema and seed (you)

```bash
DATABASE_URL="$NEON_URL" bun run db:migrate
DATABASE_URL="$NEON_URL" PANO_OWNER_EMAIL='you@example.com' PANO_OWNER_NAME='Your name' bun run seed
```

Expected: the migrations apply, then:

```
✓ demo: 29 requests, 296 votes, 26 comments
✓ pano: owned by you@example.com
```

### L6. Deploy (you say go, then you or I run it)

```bash
bun run deploy
```

Expected: wrangler uploads the Worker and its assets, and prints `https://pano.olbios88.workers.dev` and both cron schedules. Deploying from your machine keeps every deploy yours; Workers Builds can come later.

### L7. Check it (me, then you)

Me:
1. `curl -s https://pano.olbios88.workers.dev/api/health` answers ok, and `/` answers 200.
2. `E2E_BASE_URL=https://pano.olbios88.workers.dev bun run e2e`, expecting 3 passed. **This is the spec's done-when.** Wait a minute before running it again: production allows 5 demo sign-ins a minute per address, and a run uses 3.

You:
1. Sign in at `/signin` with the address you gave the seed. The code arrives by email, and `/pano` shows you as its owner.
2. The spec's checks by hand:
   - two browsers voting on the same request
   - the Turkish interface
   - a `/p/…` link previewing in WhatsApp or Slack with the request's title

### L8. A day later (me, with you on the dashboards)

1. Workers dashboard → pano → Observability:
   - CPU time per request, p99 under 10 ms.
   - The nightly run's `[demo] reset: 29 requests, 296 votes, 26 comments` and its CPU time.
   - Five-minute runs connecting only after a request shipped.
2. Neon → Monitoring: a few hours of compute in the day at most, not 24.
3. If CPU is near 10 ms, or Neon stayed awake all day, we stop and decide together before anything else.

### L9. The portfolio entry (me, on a branch in `~/repos/deploys/olbios`; you decide merge and deploy)

1. Take screenshots of the live site with Playwright at 1280×800, into `src/assets/projects/`:
   - the landing page: `pano-landing.png`, the thumbnail
   - the roadmap as the team: `pano-roadmap.png`
   - a request with its history and comments: `pano-post.png`
2. Write `src/content/projects/en/pano.md` and `tr/pano.md` in `rezerve.md`'s shape.
   - Front matter:
     - `liveUrl: https://pano.olbios88.workers.dev` and `sourceUrl: https://github.com/Olbioss/pano`
     - `tags: [Cloudflare Workers, Hono, PostgreSQL, Drizzle, React, TanStack, Better Auth, Playwright]`
     - `featured: true`
     - **`order` is yours to choose.** By default it goes right after Rezerve, at 3, and the others move down one, in both languages.
   - Body:
     - Overview.
     - Highlights: the spec's six proof points, with `vote-drift`'s numbers. BetterNews's toggle drifted to −4 with 5 rows from one person; Pano kept count = rows ≤ 1.
     - Tech notes, and how to try the demo.
3. Run `bun run build` in the portfolio. Pushing or deploying it is yours.

### L10. Push (you decide)

`git push origin main` publishes Phases 2–5 and closes issue #1. CI then runs the verify and end-to-end jobs. The portfolio's source link shows only Phases 0–1 until then.
