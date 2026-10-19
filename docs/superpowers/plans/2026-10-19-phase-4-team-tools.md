# Phase 4: Team Tools — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The team runs the board. They:
- move requests through statuses, with a note on each post's timeline
- drag cards across a public roadmap, with a pointer or the keyboard
- merge duplicates, so their votes, comments and subscribers move to the original

People follow the requests they post, vote on or comment on. Moving a request to Shipped queues one email to each of them, and a cron sends the emails.

**Architecture:**
- **Data:**
  - `subscriptions` (post, person)
  - `status_changes` (the timeline)
  - `email_outbox` (one row per email)
  - `posts.status_changed_at`
- **Writes:** each locks the post row first, as votes and comments do.
  - A status change writes its timeline entry. Moving to Shipped also queues one email per subscriber, except the mover, in the same transaction.
  - A merge locks both posts, lower id first, and moves votes, subscriptions and comments in one transaction.
  - Posting, voting and commenting subscribe inside their own transactions.
- **Sending:** a five-minute cron claims the oldest unsent emails (`for update skip locked`) and sends them through Brevo, or prints them in local dev. Each one is then marked sent, or keeps its error for a later try.
- **Reads:**
  - `GET /api/workspaces/:slug/roadmap` returns three columns: planned, in progress, and shipped in the last 30 days.
  - The post detail gains `subscribed`, `timeline` and `mergedInto`.
- **Client:**
  - One status hook serves the post page and the roadmap. Every move waits in one queue, shows at once on every copy of the post (feeds, detail, similar requests, roadmaps), and rolls back with a toast on failure.
  - The roadmap uses dnd-kit. Its keyboard sensor moves a picked-up card one column per arrow key.

**Tech Stack:** the Phase 0–3 stack, plus `@dnd-kit/core`.

**Spec:** `docs/superpowers/specs/2026-10-16-pano-design.md`. This plan covers its "Build order → 4. Team tools", with these rows:
- the data model's `subscriptions`, `status_changes` and `email_outbox`
- the API's subscription, status, merge and roadmap endpoints
- proof point 4 (merge)
- the optimistic roadmap moves

**Verified in a throwaway spike (2026-10-19):**
- **Drizzle 0.45:** the query-builder `insert … select` demands every column in table order, generated id included, so it can't fill these tables. The plan uses one raw `insert … select` per move instead: atomic, one round trip, with no 65,535-value cap.
- **Postgres 17:** `update … where id in (select … for update skip locked)` claims emails. In the test, two overlapping sender runs each sent different emails.
- **dnd-kit 6.3.1 with React 19:**
  - Pointer and keyboard drags work in Chromium.
  - In jsdom, dnd-kit's real keyboard flow works once columns and cards get layout boxes. The test mocks `getBoundingClientRect` for that.
- **The Cloudflare Vite plugin:** in dev, it answers `/cdn-cgi/handler/scheduled?cron=…` by running the Worker's `scheduled` handler. The console mailer printed the Shipped notice.
- **TanStack Query 5.104:** a mutation queued in a scope runs `onMutate` at once. Phase 2's `mutation-scope.test.ts` pins this. So every status move can share one queue and still show at once.
- **The whole plan, applied on a throwaway branch:**
  - Typecheck, Biome and the build pass, and the suite passes with this plan's counts: 58 files, 446 tests.
  - In Chromium, the post page's status change with a note, keyboard and pointer drags on the roadmap, Shipped queuing one email, the cron sending it, and merging all worked.
- **This plan's own text, re-applied on a second throwaway branch:**
  - Every task's tests failed as each Step 2 says, then passed with the counts each task states, from 45 files and 369 tests up to 58 files and 446.
  - That run fixed two things, both in here now: an ambiguous anchor in Task 3, and a merge test in Task 5 that passed before the merge code existed.

**Decided in this plan** (the spec leaves these open):
1. **Who gets a Shipped email:**
   - Every subscriber except the person who shipped it.
   - Once per post: moving it out and shipping it again emails nobody twice.
   - Moving it back out of Shipped before the cron runs drops the emails not yet sent.
2. **Email language:** the workspace's default language. People have no stored language.
3. **Same status:** a change to the status a post already has changes nothing, note included.
4. **Merged posts:**
   - They leave the feed, the roadmap and search.
   - Their page and link preview send people to the original.
   - Votes, comments, subscriptions and status changes on them answer 409 `POST_MERGED`.
   - The target must be an unmerged post in the same workspace.
   - Posts merged into the duplicate earlier now point at the original, so a redirect is one hop.
5. **Timeline:** a post shows its latest 50 status changes, oldest first. Each shows who made it and their note, rendered as Markdown without raw HTML.
6. **Roadmap:**
   - Planned and In progress list the most voted first. Shipped lists the latest first, and only the last 30 days.
   - Each column shows at most 50.
   - The team drags a card by its handle. Columns are drop targets, not ordered lists, so a drop only changes the status.
7. **Unsubscribing:** a button on the post page. Voting or commenting again subscribes again, per the spec's "added on post, vote or comment".
8. **Outbox retries:**
   - 20 emails a run.
   - A failed email is tried again on later runs, up to 5 times.
   - A claim left by a run that died lapses after 10 minutes.
9. **Offline:** status changes, merges and subscription changes fail at once with the "Couldn't reach Pano" toast, as Phase 3's comments do.

**Still deferred:**
- Phase 2's six minors and Phase 3's nine, and GitHub issues #2–#15.
- The demo workspace's nightly reset: Phase 5's second cron.

## Global Constraints

- **Repo and branch:** `~/repos/deploys/pano`, on branch `feat/phase-4-team-tools` from `main`.
  - The repo is public at github.com/Olbioss/pano, and CI runs on pushes to `main` and `feat/**`.
  - Nothing is pushed until the finishing step's choice.
- **Earlier phases still apply:** every Phase 0–3 Global Constraint holds.
- **New package floor:** `@dnd-kit/core` `^6.3.1`.
- **Team rights:**
  - `onTeam(userId)` checks the post's own workspace. Phase 3's review fixed it for selects without joins.
  - Every team-only write checks it inside its locked select.
- **Locks:** every write to a post locks its row first (`select … for update`). A merge locks both posts, lower id first.
- **Status changes:**
  - Endpoint: `PATCH /api/posts/:id/status {status, note?}`, for the team only.
  - The note is trimmed, at most 1000 characters, with no NUL. An empty note means none.
  - It answers with the post's detail.
- **Merge:**
  - Endpoint: `POST /api/posts/:id/merge {intoId}`, for the team only. It answers with the original's detail.
  - Field errors: `MERGE_SELF` and `MERGE_TARGET`.
- **Subscriptions:** `PUT /api/posts/:id/subscription {subscribed}`, for anyone signed in. It answers `{ subscribed }`.
- **Roadmap:** `GET /api/workspaces/:slug/roadmap` answers `{ planned, in_progress, shipped }`, each a `PostSummary[]`.
- **Outbox:**
  - Kind: `shipped`.
  - Payload: `{ title, ref, workspaceName, locale, note }`.
  - Unique per (post, person, kind).
  - Cron: `*/5 * * * *`.
- **Emails:**
  - HTML escapes people's text.
  - Links use `BETTER_AUTH_URL`, the app's own origin.
- **Client:**
  - Roadmap keys are `postKeys.roadmap(ws)`, under `["posts", "roadmap"]`.
  - Status moves share `mutationKey: ["status"]` and `scope: { id: "status" }`.
  - Subscription changes use `["subscription", postId]`, in scope `subscription:<id>`.
  - Moves, merges and subscription changes use `networkMode: "always"`.

## Review Focus

1. **Two teammates moving the same post at once, or one drop sent twice:** one status change, one timeline entry, and each subscriber's email queued once. (Task 4's "five moves at once" test.)
2. **A merge racing votes on the duplicate:**
   - Nothing lands on the merged post.
   - The original's count equals its vote rows.
   - Someone who voted on both counts once.
   - (Task 5's race and double-voter tests.)
3. **Bad merges:**
   - Merging into itself, into another workspace's post, or into a merged post answers 400 with `MERGE_SELF` or `MERGE_TARGET`.
   - Merging a post twice answers 409 `POST_MERGED`.
   - Earlier merges are re-pointed.
   - (Task 5.)
4. **The mail provider failing, or a cron run dying partway:**
   - The email stays queued and is tried again, up to 5 times.
   - Overlapping runs never send one email twice.
   - A dead run's claim lapses.
   - People's text is escaped in the HTML.
   - (Task 7's sender and template tests.)
5. **A drag that fails, or one by keyboard:**
   - A failed move puts the card back in its column, with a toast.
   - The arrow keys move a card a column at a time.
   - Dropping a card where it was sends nothing.
   - (Task 10's board tests.)

---

### Task 1: The subscriptions, timeline and outbox tables

**Files:**
- Create: `worker/db/schema/subscriptions.ts`, `worker/db/schema/status-changes.ts`, `worker/db/schema/email-outbox.ts`
- Modify: `worker/db/schema/posts.ts` (`statusChangedAt`), `worker/db/schema/index.ts`
- Generate: `drizzle/0008_team_tools.sql`, `drizzle/meta/0008_snapshot.json`, and the new entry in `drizzle/meta/_journal.json`
- Test: `worker/db/team-tools.test.ts`

**Interfaces:**
- Consumes: Phase 2's `posts` and `user` tables, `testDb`, `testApp`, `setupWorkspace`, `submitPost` and `pgErrorCode`.
- Produces:
  - `subscriptions` (Drizzle): `postId`, `userId`, `createdAt`, with the primary key (post, person).
  - `statusChanges`: `id`, `postId`, `fromStatus`, `toStatus`, `note`, `changedBy`, `createdAt`.
  - `emailOutbox`: `id`, `userId`, `postId`, `kind` (`"shipped"`), `payload: ShippedPayload`, `createdAt`, `claimedAt`, `sentAt`, `attempts` and `lastError`. One row per (post, person, kind).
  - `type ShippedPayload = { title: string; ref: string; workspaceName: string; locale: Locale; note: string | null }`.
  - On `posts`: `statusChangedAt: Date | null`.

- [ ] **Step 1: Create the branch**

```bash
cd ~/repos/deploys/pano
git switch -c feat/phase-4-team-tools
```

- [ ] **Step 2: Write the failing tests**

`worker/db/team-tools.test.ts`:

```ts
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import { setupWorkspace, submitPost } from "../test/fixtures";
import { pgErrorCode } from "./errors";
import {
  emailOutbox,
  posts,
  statusChanges,
  subscriptions,
  user as users,
} from "./schema";

const { db, close } = testDb();
afterAll(() => close());

const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";

const payload = {
  title: "Dark mode",
  ref: "1-dark-mode",
  workspaceName: "Acme",
  locale: "en" as const,
  note: null,
};

/** A post made through the API, and its author's id. */
async function aPost() {
  const t = testApp();
  const { owner, slug, boards } = await setupWorkspace(t);
  const post = await submitPost(t, owner.cookie, slug, {
    boardId: boards[0]!.id,
    title: "Dark mode",
  });
  await t.settle();
  const [author] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, owner.email));
  if (!author) throw new Error("the post's author is missing");
  return { postId: post.id, userId: author.id };
}

describe("the team tools tables", () => {
  it("refuses a status change to an unknown status", async () => {
    const { postId } = await aPost();
    // Raw SQL: the types already refuse "done", the table must too.
    const err = await db
      .execute(
        sql`insert into status_changes (post_id, from_status, to_status) values (${postId}, 'open', 'done')`
      )
      .catch((error: unknown) => error);
    expect(pgErrorCode(err)).toBe(CHECK_VIOLATION);
  });

  it("keeps one email per person, post and kind", async () => {
    const { postId, userId } = await aPost();
    const email = { userId, postId, kind: "shipped" as const, payload };
    await db.insert(emailOutbox).values(email);
    const err = await db
      .insert(emailOutbox)
      .values(email)
      .catch((error: unknown) => error);
    expect(pgErrorCode(err)).toBe(UNIQUE_VIOLATION);
  });

  it("goes with its post: subscriptions, timeline and emails", async () => {
    const { postId, userId } = await aPost();
    // Posting may already have subscribed the author.
    await db
      .insert(subscriptions)
      .values({ postId, userId })
      .onConflictDoNothing();
    await db.insert(statusChanges).values({
      postId,
      fromStatus: "open",
      toStatus: "planned",
      changedBy: userId,
    });
    await db
      .insert(emailOutbox)
      .values({ userId, postId, kind: "shipped", payload });
    await db.delete(posts).where(eq(posts.id, postId));
    const left = await Promise.all([
      db.select().from(subscriptions).where(eq(subscriptions.postId, postId)),
      db.select().from(statusChanges).where(eq(statusChanges.postId, postId)),
      db.select().from(emailOutbox).where(eq(emailOutbox.postId, postId)),
    ]);
    expect(left).toEqual([[], [], []]);
  });

  it("drops an account's subscriptions and emails, and keeps its timeline entries nameless", async () => {
    const { postId, userId } = await aPost();
    // Posting may already have subscribed the author.
    await db
      .insert(subscriptions)
      .values({ postId, userId })
      .onConflictDoNothing();
    await db
      .insert(emailOutbox)
      .values({ userId, postId, kind: "shipped", payload });
    const [entry] = await db
      .insert(statusChanges)
      .values({
        postId,
        fromStatus: "open",
        toStatus: "planned",
        changedBy: userId,
      })
      .returning({ id: statusChanges.id });
    await db.delete(users).where(eq(users.id, userId));
    expect(
      await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.postId, postId))
    ).toEqual([]);
    expect(
      await db.select().from(emailOutbox).where(eq(emailOutbox.postId, postId))
    ).toEqual([]);
    const [kept] = await db
      .select({ changedBy: statusChanges.changedBy })
      .from(statusChanges)
      .where(eq(statusChanges.id, entry!.id));
    expect(kept).toEqual({ changedBy: null });
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `bun run test worker/db/team-tools.test.ts`

Expected: FAIL, all four tests.
- The raw insert fails because the relation `status_changes` doesn't exist, so the error code is 42P01, not 23514.
- The other three insert into tables the schema doesn't export yet.

- [ ] **Step 4: Add the tables and the post's column**

`worker/db/schema/subscriptions.ts`:

```ts
import {
  bigint,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { posts } from "./posts";

/**
 * Who follows a post: they hear when it ships. Posting, voting and
 * commenting subscribe; the post's page unsubscribes.
 */
export const subscriptions = pgTable(
  "subscriptions",
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
  (table) => [primaryKey({ columns: [table.postId, table.userId] })]
);
```

`worker/db/schema/status-changes.ts`:

```ts
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
// Relative, not @/shared: drizzle-kit reads this file without the alias.
import { POST_STATUSES } from "../../../shared/status";
import { user } from "./auth";
import { posts } from "./posts";

/** A post's timeline: every status change, with the team's note. */
export const statusChanges = pgTable(
  "status_changes",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    postId: bigint("post_id", { mode: "number" })
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    fromStatus: text("from_status", { enum: POST_STATUSES }).notNull(),
    toStatus: text("to_status", { enum: POST_STATUSES }).notNull(),
    note: text("note"),
    // Kept when the account goes; the entry then shows no name.
    changedBy: text("changed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("status_changes_post_idx").on(table.postId, table.id),
    check(
      "status_changes_from_check",
      sql`${table.fromStatus} in ('open', 'under_review', 'planned', 'in_progress', 'shipped', 'closed')`
    ),
    check(
      "status_changes_to_check",
      sql`${table.toStatus} in ('open', 'under_review', 'planned', 'in_progress', 'shipped', 'closed')`
    ),
  ]
);
```

`worker/db/schema/email-outbox.ts`:

```ts
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
// Relative, not @/shared: drizzle-kit reads this file without the alias.
import type { Locale } from "../../../shared/locale";
import { user } from "./auth";
import { posts } from "./posts";

/** What a Shipped email says, fixed when the post ships. */
export type ShippedPayload = {
  title: string;
  ref: string;
  workspaceName: string;
  locale: Locale;
  note: string | null;
};

/**
 * Emails waiting to go out. A status change writes them in its own
 * transaction, and the cron sends them every five minutes, so a slow or
 * failing mail provider never holds up the team's click.
 */
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // With kind, it keeps one email per person per post and event.
    postId: bigint("post_id", { mode: "number" })
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["shipped"] }).notNull(),
    payload: jsonb("payload").$type<ShippedPayload>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    // Set while a cron run sends it, so an overlapping run skips it.
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
  },
  (table) => [
    uniqueIndex("email_outbox_once_idx").on(
      table.postId,
      table.userId,
      table.kind
    ),
    // The sender reads the unsent ones, oldest first.
    index("email_outbox_unsent_idx")
      .on(table.id)
      .where(sql`${table.sentAt} is null`),
    check("email_outbox_kind_check", sql`${table.kind} in ('shipped')`),
  ]
);
```

In `worker/db/schema/posts.ts`, add a column after `createdAt`:

```ts
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    // When the team last changed the status: the roadmap shows what shipped
    // in the last 30 days.
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
```

In `worker/db/schema/index.ts`, export the new files in alphabetical order:

```ts
export * from "./auth";
export * from "./boards";
export * from "./comments";
export * from "./email-outbox";
export * from "./posts";
export * from "./rate-limits";
export * from "./status-changes";
export * from "./subscriptions";
export * from "./workspaces";
```

- [ ] **Step 5: Generate the migration**

Run: `bun run db:generate --name team_tools`

Expected: the summary lists `email_outbox 10 columns 2 indexes 2 fks`, `status_changes 7 columns 1 indexes 2 fks`, `subscriptions 3 columns 0 indexes 2 fks` and `posts 15 columns 5 indexes 5 fks`. `drizzle/0008_team_tools.sql` reads:

```sql
CREATE TABLE "email_outbox" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "email_outbox_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"post_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	CONSTRAINT "email_outbox_kind_check" CHECK ("email_outbox"."kind" in ('shipped'))
);
--> statement-breakpoint
CREATE TABLE "status_changes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "status_changes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"post_id" bigint NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"note" text,
	"changed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "status_changes_from_check" CHECK ("status_changes"."from_status" in ('open', 'under_review', 'planned', 'in_progress', 'shipped', 'closed')),
	CONSTRAINT "status_changes_to_check" CHECK ("status_changes"."to_status" in ('open', 'under_review', 'planned', 'in_progress', 'shipped', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"post_id" bigint NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_changes" ADD CONSTRAINT "status_changes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_changes" ADD CONSTRAINT "status_changes_changed_by_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_outbox_once_idx" ON "email_outbox" USING btree ("post_id","user_id","kind");--> statement-breakpoint
CREATE INDEX "email_outbox_unsent_idx" ON "email_outbox" USING btree ("id") WHERE "email_outbox"."sent_at" is null;--> statement-breakpoint
CREATE INDEX "status_changes_post_idx" ON "status_changes" USING btree ("post_id","id");
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun run test worker/db/team-tools.test.ts`

Expected: PASS, 4 tests. The test run applies `0008_team_tools.sql` to `pano_test` itself.

Then run: `bun run test`

Expected: PASS. 45 test files, 369 tests.

- [ ] **Step 7: Migrate the dev database and commit**

```bash
bun run db:migrate
bun run typecheck
bun run check:fix && bun run check
git add worker/db drizzle
git commit -m "feat: subscriptions, status timeline and email outbox tables" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `db:migrate` ends with "migrations applied successfully!". The typecheck and Biome pass.

---

### Task 2: The contract both sides share

**Files:**
- Modify: `shared/status.ts` (roadmap columns); Test: `shared/status.test.ts`
- Modify: `shared/posts.ts` (the timeline, roadmap and subscription types)
- Modify: `shared/schemas.ts` (request schemas); Test: `shared/schemas.test.ts`
- Modify: `shared/field-errors.ts`, `src/i18n/messages/en.json`, `src/i18n/messages/tr.json` (`MERGE_SELF`, `MERGE_TARGET`)

**Interfaces:**
- Consumes: `POST_STATUSES`, the `idSchema` in `shared/schemas.ts`, and the catalog parity test.
- Produces:
  - `ROADMAP_STATUSES = ["planned", "in_progress", "shipped"]`, `type RoadmapStatus`, and `isRoadmapStatus(status: PostStatus): status is RoadmapStatus`.
  - `StatusChangeView`: `{ id, from: PostStatus, to: PostStatus, note: string | null, by: { name } | null, createdAt: string }`.
  - `Roadmap = Record<RoadmapStatus, PostSummary[]>` and `SubscriptionResult = { subscribed: boolean }`.
  - Schemas:
    - `statusNoteSchema`: trimmed, at most 1000, no NUL
    - `changeStatusSchema`: `{ status, note? }`
    - `mergeSchema`: `{ intoId }`
    - `subscriptionSchema`: `{ subscribed }`
  - Field-error keys `MERGE_SELF` and `MERGE_TARGET`, in both catalogs.

- [ ] **Step 1: Write the failing tests**

`shared/status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isRoadmapStatus, POST_STATUSES } from "./status";

describe("isRoadmapStatus", () => {
  it("is true for the roadmap's three columns only", () => {
    expect(POST_STATUSES.filter(isRoadmapStatus)).toEqual([
      "planned",
      "in_progress",
      "shipped",
    ]);
  });
});
```

In `shared/schemas.test.ts`, add the three new schemas to the import from `./schemas`, in alphabetical order: `changeStatusSchema` after `boardNameSchema`, `mergeSchema` after `feedQuerySchema`, and `subscriptionSchema` after `similarQuerySchema`. Then append:

```ts
describe("changeStatusSchema", () => {
  it("takes a status, with or without a note, trimmed", () => {
    expect(
      changeStatusSchema.parse({ status: "planned", note: "  Next month.  " })
    ).toEqual({ status: "planned", note: "Next month." });
    expect(changeStatusSchema.parse({ status: "shipped" })).toEqual({
      status: "shipped",
    });
  });

  it.each([
    ["an unknown status", { status: "done" }],
    [
      "a note over 1000 characters",
      { status: "planned", note: "x".repeat(1001) },
    ],
    ["a note with a NUL character", { status: "planned", note: "a\u0000b" }],
  ])("refuses %s", (_label, input) => {
    expect(changeStatusSchema.safeParse(input).success).toBe(false);
  });
});

describe("mergeSchema", () => {
  it("takes the target as a positive id", () => {
    expect(mergeSchema.safeParse({ intoId: 4 }).success).toBe(true);
    expect(mergeSchema.safeParse({ intoId: 0 }).success).toBe(false);
  });
});

describe("subscriptionSchema", () => {
  it("takes only true or false", () => {
    expect(subscriptionSchema.safeParse({ subscribed: "yes" }).success).toBe(
      false
    );
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test shared/status.test.ts shared/schemas.test.ts`

Expected: FAIL.
- `isRoadmapStatus` isn't exported, so `POST_STATUSES.filter` gets `undefined`.
- The three new schemas are undefined, so their tests throw on `.parse` and `.safeParse`.

- [ ] **Step 3: Add the contract**

In `shared/status.ts`, append:

```ts
/** The roadmap's columns, left to right. */
export const ROADMAP_STATUSES = [
  "planned",
  "in_progress",
  "shipped",
] as const satisfies readonly PostStatus[];
export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number];

export function isRoadmapStatus(status: PostStatus): status is RoadmapStatus {
  return (ROADMAP_STATUSES as readonly PostStatus[]).includes(status);
}
```

In `shared/posts.ts`, widen the status import:

```ts
import type { PostStatus, RoadmapStatus } from "./status";
```

And append:

```ts
/** One entry on a post's timeline. */
export type StatusChangeView = {
  id: number;
  from: PostStatus;
  to: PostStatus;
  /** The team's note, if they left one. */
  note: string | null;
  /** null once the account is gone; name is "" until they pick one. */
  by: { name: string } | null;
  createdAt: string;
};

/** The public roadmap: each column's unmerged posts. */
export type Roadmap = Record<RoadmapStatus, PostSummary[]>;

export type SubscriptionResult = { subscribed: boolean };
```

In `shared/schemas.ts`, append:

```ts
/** The team's note on a status change. Empty means none. */
export const statusNoteSchema = z
  .string()
  .trim()
  .max(1000)
  .refine((note) => !note.includes("\u0000"));

export const changeStatusSchema = z.object({
  status: z.enum(POST_STATUSES),
  note: statusNoteSchema.optional(),
});

export const mergeSchema = z.object({ intoId: idSchema });

export const subscriptionSchema = z.object({ subscribed: z.boolean() });
```

In `shared/field-errors.ts`, add the keys at the end of `FIELD_ERROR_KEYS`:

```ts
  "COMMENT_UNKNOWN",
  "MERGE_SELF",
  "MERGE_TARGET",
] as const;
```

In `src/i18n/messages/en.json`, add to `fieldErrors`, after `COMMENT_UNKNOWN`:

```json
    "MERGE_SELF": "A request can't be merged into itself.",
    "MERGE_TARGET": "Pick a request from this workspace that hasn't been merged."
```

In `src/i18n/messages/tr.json`, the same place:

```json
    "MERGE_SELF": "Bir istek kendisiyle birleştirilemez.",
    "MERGE_TARGET": "Bu çalışma alanından, birleştirilmemiş bir istek seçin."
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test shared src/i18n`

Expected: PASS: 1 test in `status.test.ts`, 6 new in `schemas.test.ts`, and both catalog tests.

Then run: `bun run test`

Expected: PASS. 46 test files, 376 tests.

- [ ] **Step 5: Commit**

```bash
bun run typecheck
bun run check:fix && bun run check
git add shared src/i18n/messages
git commit -m "feat: the team tools contract: roadmap columns, timeline and request schemas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Following a post

**Files:**
- Create: `worker/services/subscriptions.ts` (`subscribe`, `setSubscription`)
- Modify:
  - `worker/db/client.ts`: the `Transaction` type
  - `worker/services/posts.ts`: subscribe the author; `subscribed` on the detail
  - `worker/services/votes.ts` and `worker/services/comments.ts`: subscribe the voter and the commenter
  - `shared/posts.ts`: `PostDetail.subscribed`
  - `worker/routes/posts.ts`: `PUT /posts/:id/subscription`
  - `src/features/votes/vote-button.test.tsx`, `src/features/comments/comment-cache.test.ts` and `src/features/comments/comment-thread.test.tsx`: `subscribed` in their `detail` fixtures
- Test: `worker/routes/subscriptions.test.ts`

**Interfaces:**
- Consumes:
  - From Task 1: `subscriptions`.
  - From Task 2: `SubscriptionResult` and `subscriptionSchema`.
  - From Phases 2–3: `createPost`, `setVote`, `createComment`, `findPostDetail`, `requireUser`, `validate` and `idParamSchema`.
- Produces:
  - `type Transaction`: a transaction's handle, from `worker/db/client.ts`.
  - `subscribe(tx: Transaction, postId: number, userId: string): Promise<void>`. It does nothing if they already follow the post.
  - `setSubscription(db, input: { postId: number; userId: string; subscribed: boolean }): Promise<SubscriptionResult>`. It throws `AppError` 404 or 409 `POST_MERGED`.
  - `PUT /api/posts/:id/subscription {subscribed}` returns `{ subscribed }`. Signed in only.
  - `PostDetail.subscribed: boolean`, always false when signed out.

- [ ] **Step 1: Write the failing tests**

`worker/routes/subscriptions.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { posts } from "../db/schema";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import {
  commentOn,
  setupWorkspace,
  submitPost,
  voteFor,
} from "../test/fixtures";

const { db, close } = testDb();
afterAll(() => close());

type TestApp = ReturnType<typeof testApp>;

/** A workspace and one post by its owner. */
async function postByOwner(t: TestApp) {
  const { owner, slug, boards } = await setupWorkspace(t);
  const post = await submitPost(t, owner.cookie, slug, {
    boardId: boards[0]!.id,
    title: "Dark mode",
  });
  return { owner, slug, boards, post };
}

const subscribe = (
  t: TestApp,
  cookie: string | undefined,
  postId: number,
  subscribed: boolean
) =>
  t.client.api.posts[":id"].subscription.$put(
    { param: { id: String(postId) }, json: { subscribed } },
    cookie ? { headers: { cookie } } : undefined
  );

async function isSubscribed(t: TestApp, postId: number, cookie?: string) {
  const res = await t.client.api.posts[":id"].$get(
    { param: { id: String(postId) } },
    cookie ? { headers: { cookie } } : undefined
  );
  const body = await res.json();
  if (!body.success) throw new Error(`post failed: ${body.error}`);
  return body.data.subscribed;
}

describe("subscriptions", () => {
  it("subscribes the author of a new post", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    expect(await isSubscribed(t, post.id, owner.cookie)).toBe(true);
    await t.settle();
  });

  it("subscribes a voter, who stays subscribed after taking the vote back", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const voter = await t.signIn();
    expect(await isSubscribed(t, post.id, voter.cookie)).toBe(false);
    await voteFor(t, voter.cookie, post.id);
    expect(await isSubscribed(t, post.id, voter.cookie)).toBe(true);
    await voteFor(t, voter.cookie, post.id, false);
    expect(await isSubscribed(t, post.id, voter.cookie)).toBe(true);
    await t.settle();
  });

  it("subscribes a commenter", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const reader = await t.signIn();
    await commentOn(t, reader.cookie, post.id, "Yes please.");
    expect(await isSubscribed(t, post.id, reader.cookie)).toBe(true);
    await t.settle();
  });

  it("unsubscribes and subscribes as asked, repeats included", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    for (const subscribed of [false, false, true, true, false]) {
      const res = await subscribe(t, owner.cookie, post.id, subscribed);
      expect(await res.json()).toEqual({ success: true, data: { subscribed } });
      expect(await isSubscribed(t, post.id, owner.cookie)).toBe(subscribed);
    }
    await t.settle();
  });

  it("doesn't undo an unsubscribe when the same vote is sent again", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    await subscribe(t, owner.cookie, post.id, false);
    // The author's vote was counted at posting, so this changes nothing.
    await voteFor(t, owner.cookie, post.id);
    expect(await isSubscribed(t, post.id, owner.cookie)).toBe(false);
    await t.settle();
  });

  it("shows false to everyone else, and when signed out", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const other = await t.signIn();
    expect(await isSubscribed(t, post.id, other.cookie)).toBe(false);
    expect(await isSubscribed(t, post.id)).toBe(false);
    await t.settle();
  });

  it("refuses a merged post", async () => {
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
    const res = await subscribe(t, owner.cookie, post.id, true);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "POST_MERGED" });
    await t.settle();
  });

  it("needs a signed-in user, and a post that exists", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    expect((await subscribe(t, undefined, post.id, true)).status).toBe(401);
    expect((await subscribe(t, owner.cookie, 999_999_999, true)).status).toBe(
      404
    );
    await t.settle();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test worker/routes/subscriptions.test.ts`

Expected: FAIL, all 8 tests.
- The route doesn't exist, so every `PUT` answers 404.
- The post detail has no `subscribed`, so `isSubscribed` reads `undefined`.

- [ ] **Step 3: Add the subscription service**

In `worker/db/client.ts`, append:

```ts
/** A transaction's handle, for helpers that write inside one. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
```

`worker/services/subscriptions.ts`:

```ts
import { and, eq } from "drizzle-orm";
import type { SubscriptionResult } from "@/shared/posts";
import type { Database, Transaction } from "../db/client";
import { posts, subscriptions } from "../db/schema";
import { AppError } from "../lib/errors";

/**
 * Subscribes someone to a post unless they already are. Posting, voting and
 * commenting call it inside their own transaction, which already holds the
 * post's lock, so it can't land on a post a merge just moved away.
 */
export async function subscribe(
  tx: Transaction,
  postId: number,
  userId: string
) {
  await tx
    .insert(subscriptions)
    .values({ postId, userId })
    .onConflictDoNothing();
}

/**
 * Sets whether someone follows a post. Like a vote, it sends the state
 * wanted, so repeating it changes nothing.
 */
export async function setSubscription(
  db: Database,
  input: { postId: number; userId: string; subscribed: boolean }
): Promise<SubscriptionResult> {
  return db.transaction(async (tx) => {
    const [post] = await tx
      .select({ mergedIntoId: posts.mergedIntoId })
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
    if (input.subscribed) {
      await subscribe(tx, input.postId, input.userId);
    } else {
      await tx
        .delete(subscriptions)
        .where(
          and(
            eq(subscriptions.postId, input.postId),
            eq(subscriptions.userId, input.userId)
          )
        );
    }
    return { subscribed: input.subscribed };
  });
}
```

- [ ] **Step 4: Subscribe on posting, voting and commenting**

In `worker/services/posts.ts`:
- Add `subscriptions` to the schema import, after `posts`.
- Import the helper after the `searchConfigFor` import: `import { subscribe } from "./subscriptions";`.
- In `createPost`, after the author's vote is inserted:

```ts
    await tx.insert(votes).values({ postId: post.id, userId: input.authorId });
    await subscribe(tx, post.id, input.authorId);
    return post.id;
```

- Replace its doc comment with:

```ts
/**
 * A new post, with its author's vote counted and its author subscribed.
 * Returns its id.
 */
```

In `worker/services/votes.ts`, import the helper after the `AppError` import:

```ts
import { subscribe } from "./subscriptions";
```

And after the `changed.length === 0` early return, add:

```ts
    // A new vote follows the post. Taking it back doesn't unfollow.
    if (input.voted) await subscribe(tx, input.postId, input.userId);
```

In `worker/services/comments.ts`, import it before the `onTeam` import:

```ts
import { subscribe } from "./subscriptions";
```

And in `createComment`, add the call before the update that adds one to `comment_count`:

```ts
    await subscribe(tx, input.postId, input.authorId);
    const [counted] = await tx
      .update(posts)
      .set({ commentCount: sql`${posts.commentCount} + 1` })
```

- [ ] **Step 5: Show it on the post, and add the route**

In `shared/posts.ts`, add to `PostDetail`, after `pinned`:

```ts
  /** The person asking follows it; always false when signed out. */
  subscribed: boolean;
```

In `worker/services/posts.ts`, `findPostDetail`, add to the select after `pinnedCommentId`. The table is aliased, so the columns don't depend on how Drizzle prints the outer query (Phase 3's `onTeam` lesson):

```ts
      pinnedCommentId: posts.pinnedCommentId,
      subscribed: viewerId
        ? sql<boolean>`exists (select 1 from ${subscriptions} as s where s.post_id = ${posts}.id and s.user_id = ${viewerId})`
        : sql<boolean>`false`,
```

And to the returned object, after `isTeam: row.onTeam,`:

```ts
    subscribed: row.subscribed,
```

In `worker/routes/posts.ts`:
- Add `SubscriptionResult` to the `@/shared/posts` type import.
- Add `subscriptionSchema` to the `@/shared/schemas` import.
- Import the service: `import { setSubscription } from "../services/subscriptions";`.

Then chain the route onto `postRoutes`, after the vote route, moving the `;` to the end:

```ts
  .put(
    "/:id/subscription",
    requireUser,
    validate("param", idParamSchema),
    validate("json", subscriptionSchema),
    async (c) => {
      const result = await setSubscription(c.var.db, {
        postId: c.req.valid("param").id,
        userId: c.var.user.id,
        subscribed: c.req.valid("json").subscribed,
      });
      return c.json<SuccessResponse<SubscriptionResult>>({
        success: true,
        data: result,
      });
    }
  );
```

In the `detail` fixtures of `src/features/votes/vote-button.test.tsx`, `src/features/comments/comment-cache.test.ts` and `src/features/comments/comment-thread.test.tsx`, add after `pinned: null,`:

```ts
  subscribed: false,
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun run test worker/routes/subscriptions.test.ts worker/db/team-tools.test.ts`

Expected: PASS: 8 and 4 tests. The table tests already skip a subscription that posting created.

Then run: `bun run test`

Expected: PASS. 47 test files, 384 tests.

- [ ] **Step 7: Commit**

```bash
bun run typecheck
bun run check:fix && bun run check
git add worker shared/posts.ts src/features
git commit -m "feat: follow posts: subscribed on posting, voting and commenting, and a toggle" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Status changes, the timeline, and queuing Shipped emails

**Files:**
- Create: `worker/services/outbox.ts` (`queueShippedEmails`, `takeBackShippedEmails`)
- Create: `worker/services/status.ts` (`changeStatus`, `findTimeline`)
- Modify:
  - `worker/services/posts.ts`: `timeline` on the detail
  - `shared/posts.ts`: `PostDetail.timeline`
  - `worker/routes/posts.ts`: `PATCH /posts/:id/status`
  - the three `detail` fixtures from Task 3: `timeline`
- Test: `worker/routes/status.test.ts`

**Interfaces:**
- Consumes:
  - From Task 1: `statusChanges`, `emailOutbox` and `ShippedPayload`.
  - From Task 2: `StatusChangeView` and `changeStatusSchema`.
  - From Task 3: `Transaction`, and the subscriptions that posting, voting and commenting create.
  - From Phase 3: `onTeam`.
- Produces:
  - `changeStatus(db, input: { postId: number; userId: string; status: PostStatus; note?: string }): Promise<void>`. It throws `AppError` 404, 403 or 409 `POST_MERGED`.
  - `findTimeline(db, postId: number): Promise<StatusChangeView[]>`, oldest first, at most the latest 50.
  - `queueShippedEmails(tx, post: { id; title; organizationId }, input: { actorId; note })` and `takeBackShippedEmails(tx, postId)`. Task 7 adds the sender to `outbox.ts`.
  - `PATCH /api/posts/:id/status {status, note?}` returns the `PostDetail`. Team only.
  - `PostDetail.timeline: StatusChangeView[]`.

- [ ] **Step 1: Write the failing tests**

`worker/routes/status.test.ts`:

```ts
import { count, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { PostStatus } from "@/shared/status";
import { emailOutbox, posts, statusChanges, user as users } from "../db/schema";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import {
  commentOn,
  setupWorkspace,
  submitPost,
  voteFor,
} from "../test/fixtures";

const { db, close } = testDb();
afterAll(() => close());

type TestApp = ReturnType<typeof testApp>;

/** A workspace, and a post by a member who isn't on its team. */
async function postByMember(t: TestApp, defaultLocale: "en" | "tr" = "en") {
  const workspace = await setupWorkspace(t, { defaultLocale });
  const author = await t.signIn();
  const post = await submitPost(t, author.cookie, workspace.slug, {
    boardId: workspace.boards[0]!.id,
    title: "Dark mode",
  });
  return { ...workspace, author, post };
}

const setStatus = (
  t: TestApp,
  cookie: string | undefined,
  postId: number,
  json: { status: PostStatus; note?: string }
) =>
  t.client.api.posts[":id"].status.$patch(
    { param: { id: String(postId) }, json },
    cookie ? { headers: { cookie } } : undefined
  );

async function idOf(email: string) {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  if (!row) throw new Error(`no user ${email}`);
  return row.id;
}

/** Who has a Shipped email queued for the post. */
async function emailedIds(postId: number) {
  const rows = await db
    .select({ userId: emailOutbox.userId })
    .from(emailOutbox)
    .where(eq(emailOutbox.postId, postId));
  return rows.map((row) => row.userId).sort();
}

describe("PATCH /api/posts/:id/status", () => {
  it("lets the team move a post, with its note on the timeline", async () => {
    const t = testApp();
    const { owner, post } = await postByMember(t);
    const res = await setStatus(t, owner.cookie, post.id, {
      status: "planned",
      note: "  Next month.  ",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      data: {
        status: "planned",
        timeline: [
          {
            from: "open",
            to: "planned",
            note: "Next month.",
            by: { name: "" },
            createdAt: expect.any(String),
          },
        ],
      },
    });
    await t.settle();
  });

  it("keeps every change on the timeline, oldest first", async () => {
    const t = testApp();
    const { owner, post } = await postByMember(t);
    for (const status of ["planned", "in_progress", "shipped"] as const) {
      await setStatus(t, owner.cookie, post.id, { status });
    }
    const res = await setStatus(t, owner.cookie, post.id, { status: "closed" });
    const body = await res.json();
    if (!body.success) throw new Error(body.error);
    expect(body.data.timeline.map((entry) => [entry.from, entry.to])).toEqual([
      ["open", "planned"],
      ["planned", "in_progress"],
      ["in_progress", "shipped"],
      ["shipped", "closed"],
    ]);
    expect(body.data.timeline.every((entry) => entry.note === null)).toBe(true);
    await t.settle();
  });

  it("changes nothing when the status is the same", async () => {
    const t = testApp();
    const { owner, post } = await postByMember(t);
    const res = await setStatus(t, owner.cookie, post.id, {
      status: "open",
      note: "Still open.",
    });
    expect(await res.json()).toMatchObject({
      data: { status: "open", timeline: [] },
    });
    const [row] = await db
      .select({ changedAt: posts.statusChangedAt })
      .from(posts)
      .where(eq(posts.id, post.id));
    expect(row?.changedAt).toBeNull();
    await t.settle();
  });

  it("is only for the post's own team", async () => {
    const t = testApp();
    const { author, post } = await postByMember(t);
    const { owner: outsider } = await setupWorkspace(t);
    const shipped = { status: "shipped" } as const;
    expect((await setStatus(t, author.cookie, post.id, shipped)).status).toBe(
      403
    );
    expect((await setStatus(t, outsider.cookie, post.id, shipped)).status).toBe(
      403
    );
    expect((await setStatus(t, undefined, post.id, shipped)).status).toBe(401);
    expect(await emailedIds(post.id)).toEqual([]);
    await t.settle();
  });

  it("refuses a merged post, and answers 404 for one that's gone", async () => {
    const t = testApp();
    const { owner, slug, boards, post } = await postByMember(t);
    const target = await submitPost(t, owner.cookie, slug, {
      boardId: boards[0]!.id,
      title: "Dark theme",
    });
    await db
      .update(posts)
      .set({ mergedIntoId: target.id })
      .where(eq(posts.id, post.id));
    const merged = await setStatus(t, owner.cookie, post.id, {
      status: "planned",
    });
    expect(merged.status).toBe(409);
    expect(await merged.json()).toMatchObject({ code: "POST_MERGED" });
    const gone = await setStatus(t, owner.cookie, 999_999_999, {
      status: "planned",
    });
    expect(gone.status).toBe(404);
    await t.settle();
  });

  it("refuses an unknown status or a note with a NUL character", async () => {
    const t = testApp();
    const { owner, post } = await postByMember(t);
    const unknown = await t.request(`/api/posts/${post.id}/status`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: owner.cookie,
        origin: "http://localhost",
      },
      body: JSON.stringify({ status: "done" }),
    });
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toMatchObject({
      fields: { status: expect.any(String) },
    });
    const nul = await setStatus(t, owner.cookie, post.id, {
      status: "planned",
      note: "a\u0000b",
    });
    expect(nul.status).toBe(400);
    expect(await nul.json()).toMatchObject({
      fields: { note: expect.any(String) },
    });
    await t.settle();
  });
});

describe("Shipped emails", () => {
  it("queues one per subscriber, and none for whoever shipped it", async () => {
    const t = testApp();
    const { owner, author, post } = await postByMember(t);
    const voter = await t.signIn();
    const commenter = await t.signIn();
    await voteFor(t, voter.cookie, post.id);
    await commentOn(t, commenter.cookie, post.id, "Yes please.");
    // The owner follows it too, by voting, but ships it themselves.
    await voteFor(t, owner.cookie, post.id);
    await setStatus(t, owner.cookie, post.id, {
      status: "shipped",
      note: "In today's release.",
    });
    const expected = await Promise.all(
      [author, voter, commenter].map((person) => idOf(person.email))
    );
    expect(await emailedIds(post.id)).toEqual(expected.sort());
    const [email] = await db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.postId, post.id))
      .limit(1);
    expect(email).toMatchObject({
      kind: "shipped",
      sentAt: null,
      attempts: 0,
      payload: {
        title: "Dark mode",
        ref: `${post.id}-dark-mode`,
        workspaceName: "Acme",
        locale: "en",
        note: "In today's release.",
      },
    });
    await t.settle();
  });

  it("writes a Turkish workspace's emails in Turkish", async () => {
    const t = testApp();
    const { owner, post } = await postByMember(t, "tr");
    await setStatus(t, owner.cookie, post.id, { status: "shipped" });
    const [email] = await db
      .select({ payload: emailOutbox.payload })
      .from(emailOutbox)
      .where(eq(emailOutbox.postId, post.id));
    expect(email?.payload.locale).toBe("tr");
    await t.settle();
  });

  it("takes back the unsent ones when the post leaves Shipped", async () => {
    const t = testApp();
    const { owner, post } = await postByMember(t);
    await setStatus(t, owner.cookie, post.id, { status: "shipped" });
    expect(await emailedIds(post.id)).toHaveLength(1);
    await setStatus(t, owner.cookie, post.id, { status: "in_progress" });
    expect(await emailedIds(post.id)).toEqual([]);
    await t.settle();
  });

  it("never emails the same person twice about one post shipping", async () => {
    const t = testApp();
    const { owner, author, post } = await postByMember(t);
    await setStatus(t, owner.cookie, post.id, { status: "shipped" });
    // The cron sent them.
    await db
      .update(emailOutbox)
      .set({ sentAt: new Date() })
      .where(eq(emailOutbox.postId, post.id));
    await setStatus(t, owner.cookie, post.id, { status: "in_progress" });
    await setStatus(t, owner.cookie, post.id, { status: "shipped" });
    expect(await emailedIds(post.id)).toEqual([await idOf(author.email)]);
    await t.settle();
  });

  it("ships once when five moves to Shipped arrive at once", async () => {
    const t = testApp();
    const { owner, post } = await postByMember(t);
    const voters = await Promise.all([t.signIn(), t.signIn()]);
    for (const voter of voters) await voteFor(t, voter.cookie, post.id);
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        setStatus(t, owner.cookie, post.id, { status: "shipped" })
      )
    );
    expect(responses.map((res) => res.status)).toEqual(Array(5).fill(200));
    const [changes] = await db
      .select({ n: count() })
      .from(statusChanges)
      .where(eq(statusChanges.postId, post.id));
    expect(changes?.n).toBe(1);
    expect(await emailedIds(post.id)).toHaveLength(3);
    await t.settle();
  }, 30_000);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test worker/routes/status.test.ts`

Expected: FAIL, all 11 tests.
- The route doesn't exist, so every `PATCH` answers 404 and nothing is queued.
- The unknown-status request answers 404 instead of 400.

- [ ] **Step 3: Add the outbox queue and the status service**

`worker/services/outbox.ts`:

```ts
import { and, eq, isNull, sql } from "drizzle-orm";
import { postRef } from "@/shared/ref";
import type { Transaction } from "../db/client";
import {
  emailOutbox,
  organization,
  type ShippedPayload,
  workspaceSettings,
} from "../db/schema";

/**
 * Queues a Shipped email to each of the post's subscribers but the person
 * who shipped it. It runs in the status change's transaction, so the
 * emails exist exactly when the change does. Someone already emailed about
 * this post shipping isn't emailed again.
 */
export async function queueShippedEmails(
  tx: Transaction,
  post: { id: number; title: string; organizationId: string },
  input: { actorId: string; note: string | null }
) {
  const [workspace] = await tx
    .select({
      name: organization.name,
      defaultLocale: workspaceSettings.defaultLocale,
    })
    .from(organization)
    .leftJoin(
      workspaceSettings,
      eq(workspaceSettings.organizationId, organization.id)
    )
    .where(eq(organization.id, post.organizationId))
    .limit(1);
  const payload: ShippedPayload = {
    title: post.title,
    ref: postRef(post.id, post.title),
    workspaceName: workspace?.name ?? "",
    // People have no stored language, so it's the workspace's.
    locale: workspace?.defaultLocale ?? "en",
    note: input.note,
  };
  // Raw SQL: Drizzle's insert … select wants every column, the generated
  // id included, so it can't fill this table from a query.
  await tx.execute(sql`
    insert into email_outbox (user_id, post_id, kind, payload)
    select user_id, ${post.id}::bigint, 'shipped', ${JSON.stringify(payload)}::jsonb
    from subscriptions
    where post_id = ${post.id} and user_id <> ${input.actorId}
    on conflict do nothing`);
}

/** A post moved back out of Shipped: drop its emails that haven't gone out. */
export async function takeBackShippedEmails(tx: Transaction, postId: number) {
  await tx
    .delete(emailOutbox)
    .where(
      and(
        eq(emailOutbox.postId, postId),
        eq(emailOutbox.kind, "shipped"),
        isNull(emailOutbox.sentAt),
        isNull(emailOutbox.claimedAt)
      )
    );
}
```

`worker/services/status.ts`:

```ts
import { desc, eq, sql } from "drizzle-orm";
import type { StatusChangeView } from "@/shared/posts";
import type { PostStatus } from "@/shared/status";
import type { Database } from "../db/client";
import { posts, statusChanges, user as users } from "../db/schema";
import { AppError } from "../lib/errors";
import { queueShippedEmails, takeBackShippedEmails } from "./outbox";
import { onTeam } from "./team";

/** How many of a post's latest status changes its page shows. */
const TIMELINE_LENGTH = 50;

/**
 * Moves a post to `status` as someone on its workspace's team, with an
 * optional note for the timeline.
 *
 * It locks the post row first, like every write to a post, so moves sent at
 * once run one after another and only the first one changes anything.
 * Moving to Shipped queues the subscribers' emails in the same transaction.
 * Moving back out before the cron sends them takes the unsent ones back.
 */
export async function changeStatus(
  db: Database,
  input: { postId: number; userId: string; status: PostStatus; note?: string }
) {
  await db.transaction(async (tx) => {
    const [post] = await tx
      .select({
        status: posts.status,
        title: posts.title,
        organizationId: posts.organizationId,
        mergedIntoId: posts.mergedIntoId,
        isTeam: onTeam(input.userId),
      })
      .from(posts)
      .where(eq(posts.id, input.postId))
      .for("update");
    if (!post) throw new AppError(404, "NOT_FOUND", "Post not found");
    if (!post.isTeam) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Only the workspace team can do that"
      );
    }
    if (post.mergedIntoId !== null) {
      throw new AppError(
        409,
        "POST_MERGED",
        "This request was merged into another one"
      );
    }
    if (post.status === input.status) return;
    const note = input.note ? input.note : null;
    await tx
      .update(posts)
      .set({ status: input.status, statusChangedAt: sql`now()` })
      .where(eq(posts.id, input.postId));
    await tx.insert(statusChanges).values({
      postId: input.postId,
      fromStatus: post.status,
      toStatus: input.status,
      note,
      changedBy: input.userId,
    });
    if (input.status === "shipped") {
      await queueShippedEmails(
        tx,
        {
          id: input.postId,
          title: post.title,
          organizationId: post.organizationId,
        },
        { actorId: input.userId, note }
      );
    } else if (post.status === "shipped") {
      await takeBackShippedEmails(tx, input.postId);
    }
  });
}

/** A post's latest status changes, oldest first. */
export async function findTimeline(
  db: Database,
  postId: number
): Promise<StatusChangeView[]> {
  const rows = await db
    .select({
      id: statusChanges.id,
      from: statusChanges.fromStatus,
      to: statusChanges.toStatus,
      note: statusChanges.note,
      changedBy: statusChanges.changedBy,
      name: users.name,
      createdAt: statusChanges.createdAt,
    })
    .from(statusChanges)
    .leftJoin(users, eq(users.id, statusChanges.changedBy))
    .where(eq(statusChanges.postId, postId))
    .orderBy(desc(statusChanges.id))
    .limit(TIMELINE_LENGTH);
  return rows.reverse().map((row) => ({
    id: row.id,
    from: row.from,
    to: row.to,
    note: row.note,
    by: row.changedBy === null ? null : { name: row.name ?? "" },
    createdAt: row.createdAt.toISOString(),
  }));
}
```

- [ ] **Step 4: Show the timeline, and add the route**

In `shared/posts.ts`, add to `PostDetail`, after `subscribed`:

```ts
  /** Its status changes, oldest first. */
  timeline: StatusChangeView[];
```

In `worker/services/posts.ts`, import it after the `searchConfigFor` import:

```ts
import { findTimeline } from "./status";
```

And in `findPostDetail`'s returned object, after `subscribed: row.subscribed,`:

```ts
    timeline: await findTimeline(db, row.id),
```

In `worker/routes/posts.ts`:
- Add `changeStatusSchema` to the `@/shared/schemas` import.
- Import the service: `import { changeStatus } from "../services/status";`.

Then chain the route after the subscription route, moving the `;` to the end:

```ts
  .patch(
    "/:id/status",
    requireUser,
    validate("param", idParamSchema),
    validate("json", changeStatusSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      await changeStatus(c.var.db, {
        postId: id,
        userId: c.var.user.id,
        ...c.req.valid("json"),
      });
      return c.json<SuccessResponse<PostDetail>>({
        success: true,
        data: await postDetail(c.var.db, id, c.var.user.id),
      });
    }
  );
```

In the three `detail` fixtures, add after `subscribed: false,`:

```ts
  timeline: [],
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test worker/routes/status.test.ts`

Expected: PASS, 11 tests.

Then run: `bun run test`

Expected: PASS. 48 test files, 395 tests.

- [ ] **Step 6: Commit**

```bash
bun run typecheck
bun run check:fix && bun run check
git add worker shared/posts.ts src/features
git commit -m "feat: status changes with a timeline, queuing Shipped emails in the same transaction" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Merging a duplicate into the original

**Files:**
- Create: `worker/services/merge.ts` (`mergePost`)
- Modify:
  - `worker/services/posts.ts`: `mergedInto` on the detail, `mergedIntoId` in `findPostMeta`
  - `shared/posts.ts`: `PostDetail.mergedInto`
  - `worker/og.ts`: a merged post's link redirects to the original
  - `worker/routes/posts.ts`: `POST /posts/:id/merge`
  - the three `detail` fixtures: `mergedInto`
- Test: `worker/routes/merge.test.ts`, `worker/og.test.ts`

**Interfaces:**
- Consumes:
  - From Tasks 1 and 3: `subscriptions`.
  - From Task 2: `mergeSchema`, `MERGE_SELF` and `MERGE_TARGET`.
  - From Phases 2–3: `votes`, `comments`, `onTeam`, `findPostMeta` and `postMeta`.
- Produces:
  - `mergePost(db, input: { postId: number; intoId: number; userId: string }): Promise<void>`. It throws `AppError` 404, 403, 409 `POST_MERGED`, or 400 with `fields.intoId = "MERGE_SELF" | "MERGE_TARGET"`.
  - `POST /api/posts/:id/merge {intoId}` returns the original's `PostDetail`. Team only.
  - `PostDetail.mergedInto: { id: number; ref: string } | null`.

- [ ] **Step 1: Write the failing tests**

`worker/routes/merge.test.ts`:

```ts
import { and, count, eq, isNull } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { comments, posts, subscriptions, votes } from "../db/schema";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import {
  commentOn,
  setupWorkspace,
  submitPost,
  voteFor,
} from "../test/fixtures";

const { db, close } = testDb();
afterAll(() => close());

type TestApp = ReturnType<typeof testApp>;

/** A workspace with two posts by a member: a duplicate and the original. */
async function twoPosts(t: TestApp) {
  const workspace = await setupWorkspace(t);
  const author = await t.signIn();
  const boardId = workspace.boards[0]!.id;
  const duplicate = await submitPost(t, author.cookie, workspace.slug, {
    boardId,
    title: "Dark theme",
  });
  const original = await submitPost(t, author.cookie, workspace.slug, {
    boardId,
    title: "Dark mode",
  });
  return { ...workspace, author, duplicate, original };
}

const merge = (
  t: TestApp,
  cookie: string | undefined,
  postId: number,
  intoId: number
) =>
  t.client.api.posts[":id"].merge.$post(
    { param: { id: String(postId) }, json: { intoId } },
    cookie ? { headers: { cookie } } : undefined
  );

/** A post's stored counts, next to the rows they count. */
async function tally(postId: number) {
  const [post] = await db
    .select({
      voteCount: posts.voteCount,
      commentCount: posts.commentCount,
      mergedIntoId: posts.mergedIntoId,
    })
    .from(posts)
    .where(eq(posts.id, postId));
  const [voteRows] = await db
    .select({ n: count() })
    .from(votes)
    .where(eq(votes.postId, postId));
  const [commentRows] = await db
    .select({ n: count() })
    .from(comments)
    .where(and(eq(comments.postId, postId), isNull(comments.deletedAt)));
  const [followers] = await db
    .select({ n: count() })
    .from(subscriptions)
    .where(eq(subscriptions.postId, postId));
  return {
    ...post,
    votes: voteRows?.n,
    comments: commentRows?.n,
    subscribers: followers?.n,
  };
}

describe("POST /api/posts/:id/merge", () => {
  it("moves votes, comments and subscribers to the original", async () => {
    const t = testApp();
    const { owner, duplicate, original } = await twoPosts(t);
    const fan = await t.signIn();
    await voteFor(t, fan.cookie, duplicate.id);
    const top = await commentOn(t, fan.cookie, duplicate.id, "Same idea.");
    await commentOn(t, owner.cookie, duplicate.id, "Agreed.", top.comment.id);
    const res = await merge(t, owner.cookie, duplicate.id, original.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      data: { id: original.id, voteCount: 2, commentCount: 2 },
    });
    // The author voted on both, and counts once.
    expect(await tally(original.id)).toEqual({
      voteCount: 2,
      commentCount: 2,
      mergedIntoId: null,
      votes: 2,
      comments: 2,
      subscribers: 3,
    });
    expect(await tally(duplicate.id)).toEqual({
      voteCount: 0,
      commentCount: 0,
      mergedIntoId: original.id,
      votes: 0,
      comments: 0,
      subscribers: 0,
    });
    await t.settle();
  });

  it("counts someone who voted on both posts once", async () => {
    const t = testApp();
    const { owner, duplicate, original } = await twoPosts(t);
    const both = await t.signIn();
    await voteFor(t, both.cookie, duplicate.id);
    await voteFor(t, both.cookie, original.id);
    const res = await merge(t, owner.cookie, duplicate.id, original.id);
    expect(res.status).toBe(200);
    // The author and `both` voted on each post: two people, two votes.
    expect(await tally(original.id)).toMatchObject({ voteCount: 2, votes: 2 });
    expect(await tally(duplicate.id)).toMatchObject({ voteCount: 0, votes: 0 });
    await t.settle();
  });

  it("never lets a vote racing the merge land on the merged post", async () => {
    const t = testApp();
    const { owner, duplicate, original } = await twoPosts(t);
    const voters = await Promise.all(
      Array.from({ length: 12 }, () => t.signIn())
    );
    const [merged, ...cast] = await Promise.all([
      merge(t, owner.cookie, duplicate.id, original.id),
      ...voters.map((voter) => voteFor(t, voter.cookie, duplicate.id)),
    ]);
    expect(merged.status).toBe(200);
    // Each vote either landed first and moved, or came after and was refused.
    for (const res of cast) expect([200, 409]).toContain(res.status);
    const landed = cast.filter((res) => res.status === 200).length;
    expect(await tally(duplicate.id)).toMatchObject({ votes: 0, voteCount: 0 });
    const after = await tally(original.id);
    expect(after.votes).toBe(after.voteCount);
    expect(after.votes).toBe(1 + landed);
    await t.settle();
  }, 30_000);

  it("keeps threads whole and the original's pin", async () => {
    const t = testApp();
    const { owner, duplicate, original } = await twoPosts(t);
    const top = await commentOn(t, owner.cookie, duplicate.id, "Question?");
    const reply = await commentOn(
      t,
      owner.cookie,
      duplicate.id,
      "Answer.",
      top.comment.id
    );
    const kept = await commentOn(t, owner.cookie, original.id, "Pinned here.");
    for (const [postId, commentId] of [
      [duplicate.id, top.comment.id],
      [original.id, kept.comment.id],
    ] as const) {
      await t.client.api.posts[":id"].pin.$put(
        { param: { id: String(postId) }, json: { commentId } },
        { headers: { cookie: owner.cookie } }
      );
    }
    await merge(t, owner.cookie, duplicate.id, original.id);
    const [moved] = await db
      .select({ postId: comments.postId, parentId: comments.parentId })
      .from(comments)
      .where(eq(comments.id, reply.comment.id));
    expect(moved).toEqual({ postId: original.id, parentId: top.comment.id });
    const pins = await db
      .select({ id: posts.id, pinned: posts.pinnedCommentId })
      .from(posts)
      .where(eq(posts.organizationId, (await orgOf(original.id))!));
    expect(pins).toEqual(
      expect.arrayContaining([
        { id: original.id, pinned: kept.comment.id },
        { id: duplicate.id, pinned: null },
      ])
    );
    await t.settle();
  });

  it("points posts merged into the duplicate at the original", async () => {
    const t = testApp();
    const { owner, slug, boards, duplicate, original } = await twoPosts(t);
    const older = await submitPost(t, owner.cookie, slug, {
      boardId: boards[0]!.id,
      title: "Night mode",
    });
    await merge(t, owner.cookie, older.id, duplicate.id);
    await merge(t, owner.cookie, duplicate.id, original.id);
    expect((await tally(older.id)).mergedIntoId).toBe(original.id);
    await t.settle();
  });

  it("refuses to merge into itself, another workspace's post, or a merged one", async () => {
    const t = testApp();
    const { owner, slug, boards, duplicate, original } = await twoPosts(t);
    const elsewhere = await twoPosts(t);
    const gone = await submitPost(t, owner.cookie, slug, {
      boardId: boards[0]!.id,
      title: "Night mode",
    });
    await merge(t, owner.cookie, gone.id, original.id);
    for (const [intoId, field] of [
      [duplicate.id, "MERGE_SELF"],
      [elsewhere.original.id, "MERGE_TARGET"],
      [gone.id, "MERGE_TARGET"],
      [999_999_999, "MERGE_TARGET"],
    ] as const) {
      const res = await merge(t, owner.cookie, duplicate.id, intoId);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ fields: { intoId: field } });
    }
    expect((await tally(duplicate.id)).mergedIntoId).toBeNull();
    await t.settle();
  });

  it("refuses a post that's already merged, and one that's gone", async () => {
    const t = testApp();
    const { owner, duplicate, original } = await twoPosts(t);
    await merge(t, owner.cookie, duplicate.id, original.id);
    const again = await merge(t, owner.cookie, duplicate.id, original.id);
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ code: "POST_MERGED" });
    expect(
      (await merge(t, owner.cookie, 999_999_999, original.id)).status
    ).toBe(404);
    await t.settle();
  });

  it("is only for the post's own team", async () => {
    const t = testApp();
    const { author, duplicate, original } = await twoPosts(t);
    const { owner: outsider } = await setupWorkspace(t);
    expect(
      (await merge(t, author.cookie, duplicate.id, original.id)).status
    ).toBe(403);
    expect(
      (await merge(t, outsider.cookie, duplicate.id, original.id)).status
    ).toBe(403);
    expect((await merge(t, undefined, duplicate.id, original.id)).status).toBe(
      401
    );
    expect((await tally(duplicate.id)).mergedIntoId).toBeNull();
    await t.settle();
  });

  it("points a merged post's page at the original", async () => {
    const t = testApp();
    const { owner, duplicate, original } = await twoPosts(t);
    await merge(t, owner.cookie, duplicate.id, original.id);
    const res = await t.client.api.posts[":id"].$get({
      param: { id: String(duplicate.id) },
    });
    expect(await res.json()).toMatchObject({
      data: {
        mergedInto: { id: original.id, ref: `${original.id}-dark-mode` },
      },
    });
    await t.settle();
  });
});

async function orgOf(postId: number) {
  const [row] = await db
    .select({ organizationId: posts.organizationId })
    .from(posts)
    .where(eq(posts.id, postId));
  return row?.organizationId;
}
```

In `worker/og.test.ts`, import `eq` at the top:

```ts
import { eq } from "drizzle-orm";
```

And add a test at the end of the `renderPostPage` block:

```ts
  it("sends a merged post's link to the post it was merged into", async () => {
    const id = await postTitled("Dark mode");
    const into = await postTitled("Dark theme");
    await db.update(posts).set({ mergedIntoId: into }).where(eq(posts.id, id));
    const res = await renderPostPage(
      new Request(`http://localhost/p/${id}-dark-mode`),
      env,
      ctx
    );
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(
      `http://localhost/p/${into}-dark-theme`
    );
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test worker/routes/merge.test.ts worker/og.test.ts`

Expected: FAIL.
- All 9 merge tests: the route doesn't exist, so every merge answers 404 and nothing moves.
- The new link-preview test: it gets the app shell (200), not a redirect.

- [ ] **Step 3: Add the merge service**

`worker/services/merge.ts`:

```ts
import { asc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { comments, posts } from "../db/schema";
import { AppError } from "../lib/errors";
import { onTeam } from "./team";

/**
 * Merges a duplicate into another post of the same workspace, as its team.
 * Votes, subscriptions and comments move in one transaction: someone who
 * voted on both counts once, and threads keep their shape. The merged post
 * stays, pointing at the other, so its address keeps working.
 *
 * Both rows are locked, lower id first, so the merge waits for votes and
 * comments in progress on either post, two merges can't deadlock, and
 * anything arriving after it sees the merge and is refused.
 */
export async function mergePost(
  db: Database,
  input: { postId: number; intoId: number; userId: string }
) {
  if (input.postId === input.intoId) {
    throw new AppError(
      400,
      "BAD_REQUEST",
      "A post can't be merged into itself",
      { intoId: "MERGE_SELF" }
    );
  }
  await db.transaction(async (tx) => {
    const locked = await tx
      .select({
        id: posts.id,
        organizationId: posts.organizationId,
        mergedIntoId: posts.mergedIntoId,
        commentCount: posts.commentCount,
        isTeam: onTeam(input.userId),
      })
      .from(posts)
      .where(inArray(posts.id, [input.postId, input.intoId]))
      .orderBy(asc(posts.id))
      .for("update");
    const source = locked.find((row) => row.id === input.postId);
    const target = locked.find((row) => row.id === input.intoId);
    if (!source) throw new AppError(404, "NOT_FOUND", "Post not found");
    if (!source.isTeam) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Only the workspace team can do that"
      );
    }
    if (source.mergedIntoId !== null) {
      throw new AppError(
        409,
        "POST_MERGED",
        "This request was merged into another one"
      );
    }
    if (
      !target ||
      target.organizationId !== source.organizationId ||
      target.mergedIntoId !== null
    ) {
      throw new AppError(
        400,
        "BAD_REQUEST",
        "Merge into an unmerged post of the same workspace",
        { intoId: "MERGE_TARGET" }
      );
    }
    // Raw SQL: Drizzle's insert … select wants every column of the table.
    // A voter already on the target keeps one vote there, and a vote keeps
    // its time, which trending counts.
    const moved = await tx.execute(sql`
      insert into votes (post_id, user_id, created_at)
      select ${input.intoId}::bigint, user_id, created_at
      from votes where post_id = ${input.postId}
      on conflict do nothing
      returning user_id`);
    await tx.execute(sql`delete from votes where post_id = ${input.postId}`);
    await tx.execute(sql`
      insert into subscriptions (post_id, user_id, created_at)
      select ${input.intoId}::bigint, user_id, created_at
      from subscriptions where post_id = ${input.postId}
      on conflict do nothing`);
    await tx.execute(
      sql`delete from subscriptions where post_id = ${input.postId}`
    );
    // Replies move with their comments, so threads keep their shape.
    await tx
      .update(comments)
      .set({ postId: input.intoId })
      .where(eq(comments.postId, input.postId));
    await tx
      .update(posts)
      .set({
        voteCount: sql`${posts.voteCount} + ${moved.length}`,
        commentCount: sql`${posts.commentCount} + ${source.commentCount}`,
      })
      .where(eq(posts.id, input.intoId));
    await tx
      .update(posts)
      .set({
        mergedIntoId: input.intoId,
        voteCount: 0,
        commentCount: 0,
        // Its comments, the pinned one included, live on the target now.
        pinnedCommentId: null,
      })
      .where(eq(posts.id, input.postId));
    // Posts merged into this one before now point straight at the target.
    await tx
      .update(posts)
      .set({ mergedIntoId: input.intoId })
      .where(eq(posts.mergedIntoId, input.postId));
  });
}
```

- [ ] **Step 4: Point merged posts at the original**

In `shared/posts.ts`, add to `PostDetail`, after `timeline`:

```ts
  /** Set once the team merged it into another post: its page sends people there. */
  mergedInto: { id: number; ref: string } | null;
```

In `worker/services/posts.ts`, `findPostDetail`, select the merge after `pinnedCommentId`:

```ts
      pinnedCommentId: posts.pinnedCommentId,
      mergedIntoId: posts.mergedIntoId,
```

Add to its returned object, after `timeline`:

```ts
    mergedInto:
      row.mergedIntoId === null ? null : await findRef(db, row.mergedIntoId),
```

Add this helper before `boardInWorkspace`:

```ts
/** Where a post lives now, for pointing at it. */
async function findRef(db: Database, id: number) {
  const [row] = await db
    .select({ id: posts.id, title: posts.title })
    .from(posts)
    .where(eq(posts.id, id))
    .limit(1);
  return row ? { id: row.id, ref: postRef(row.id, row.title) } : null;
}
```

And in `findPostMeta`, select the merge after `workspaceName`:

```ts
      workspaceName: organization.name,
      mergedIntoId: posts.mergedIntoId,
```

In `worker/og.ts`, `renderPostPage`, replace `const meta = postMeta(post);` with the following. The original's canonical path differs from the requested one, so the existing redirect branch sends the 301:

```ts
    // A merged post's link lands on the post it was merged into.
    const live =
      post.mergedIntoId === null
        ? post
        : ((await findPostMeta(db, post.mergedIntoId)) ?? post);
    const meta = postMeta(live);
```

- [ ] **Step 5: Add the route**

In `worker/routes/posts.ts`:
- Add `mergeSchema` to the `@/shared/schemas` import.
- Import the service: `import { mergePost } from "../services/merge";`.

Then chain the route after the status route, moving the `;` to the end:

```ts
  .post(
    "/:id/merge",
    requireUser,
    validate("param", idParamSchema),
    validate("json", mergeSchema),
    async (c) => {
      const { intoId } = c.req.valid("json");
      await mergePost(c.var.db, {
        postId: c.req.valid("param").id,
        intoId,
        userId: c.var.user.id,
      });
      return c.json<SuccessResponse<PostDetail>>({
        success: true,
        data: await postDetail(c.var.db, intoId, c.var.user.id),
      });
    }
  );
```

In the three `detail` fixtures, add after `timeline: [],`:

```ts
  mergedInto: null,
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun run test worker/routes/merge.test.ts worker/og.test.ts`

Expected: PASS: 9 merge tests, and 7 link-preview tests.

Then run: `bun run test`

Expected: PASS. 49 test files, 405 tests.

- [ ] **Step 7: Commit**

```bash
bun run typecheck
bun run check:fix && bun run check
git add worker shared/posts.ts src/features
git commit -m "feat: merge duplicates: votes, comments and subscribers move in one transaction" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The roadmap endpoint

**Files:**
- Create: `worker/services/roadmap.ts` (`listRoadmap`), `worker/routes/roadmap.ts` (`workspaceRoadmapRoutes`)
- Modify: `worker/app.ts` (mount the routes)
- Test: `worker/routes/roadmap.test.ts`

**Interfaces:**
- Consumes:
  - From Task 2: `Roadmap` and `RoadmapStatus`.
  - From Task 4: `posts.statusChangedAt`, set by `changeStatus`.
  - From Task 5: merged posts, which the roadmap leaves out.
  - From Phase 2: `postColumns`, `toSummary`, `findWorkspace` and `readViewerId`.
- Produces:
  - `listRoadmap(db, input: { workspaceId: string; viewerId: string | null }): Promise<Roadmap>`.
  - `GET /api/workspaces/:slug/roadmap`, open to anyone:
    - Planned and In progress: the most voted first.
    - Shipped: the latest first, from the last 30 days.
    - Merged posts are left out, and each column holds at most 50.

- [ ] **Step 1: Write the failing tests**

`worker/routes/roadmap.test.ts`:

```ts
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { PostStatus } from "@/shared/status";
import { posts } from "../db/schema";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import { setupWorkspace, submitPost, voteFor } from "../test/fixtures";

const { db, close } = testDb();
afterAll(() => close());

type TestApp = ReturnType<typeof testApp>;

async function readRoadmap(t: TestApp, slug: string, cookie?: string) {
  const res = await t.client.api.workspaces[":slug"].roadmap.$get(
    { param: { slug } },
    cookie ? { headers: { cookie } } : undefined
  );
  if (!res.ok) throw new Error(`roadmap failed: ${res.status}`);
  return (await res.json()).data;
}

/** Posts with these titles, moved to `status` by the workspace's owner. */
async function postsIn(
  t: TestApp,
  workspace: Awaited<ReturnType<typeof setupWorkspace>>,
  status: PostStatus,
  titles: string[]
) {
  const made = [];
  for (const title of titles) {
    const post = await submitPost(t, workspace.owner.cookie, workspace.slug, {
      boardId: workspace.boards[0]!.id,
      title,
    });
    if (status !== "open") {
      await t.client.api.posts[":id"].status.$patch(
        { param: { id: String(post.id) }, json: { status } },
        { headers: { cookie: workspace.owner.cookie } }
      );
    }
    made.push(post);
  }
  return made;
}

const titles = (list: { title: string }[]) => list.map((post) => post.title);

describe("GET /api/workspaces/:slug/roadmap", () => {
  it("shows planned and in-progress posts, most voted first", async () => {
    const t = testApp();
    const workspace = await setupWorkspace(t);
    const [, high] = await postsIn(t, workspace, "planned", [
      "Export to CSV",
      "Dark mode",
    ]);
    await postsIn(t, workspace, "in_progress", ["Faster search"]);
    const fan = await t.signIn();
    await voteFor(t, fan.cookie, high!.id);
    const roadmap = await readRoadmap(t, workspace.slug);
    expect(titles(roadmap.planned)).toEqual(["Dark mode", "Export to CSV"]);
    expect(titles(roadmap.in_progress)).toEqual(["Faster search"]);
    expect(roadmap.shipped).toEqual([]);
    await t.settle();
  });

  it("shows what shipped in the last 30 days, latest first", async () => {
    const t = testApp();
    const workspace = await setupWorkspace(t);
    const [old] = await postsIn(t, workspace, "shipped", [
      "Old news",
      "Earlier",
      "Latest",
    ]);
    await db
      .update(posts)
      .set({ statusChangedAt: sql`now() - interval '31 days'` })
      .where(eq(posts.id, old!.id));
    const roadmap = await readRoadmap(t, workspace.slug);
    expect(titles(roadmap.shipped)).toEqual(["Latest", "Earlier"]);
    await t.settle();
  });

  it("leaves out open, under-review, closed and merged posts", async () => {
    const t = testApp();
    const workspace = await setupWorkspace(t);
    await postsIn(t, workspace, "open", ["Open one"]);
    await postsIn(t, workspace, "under_review", ["Reviewing"]);
    await postsIn(t, workspace, "closed", ["Closed one"]);
    const [duplicate, original] = await postsIn(t, workspace, "planned", [
      "Dark theme",
      "Dark mode",
    ]);
    await t.client.api.posts[":id"].merge.$post(
      { param: { id: String(duplicate!.id) }, json: { intoId: original!.id } },
      { headers: { cookie: workspace.owner.cookie } }
    );
    const roadmap = await readRoadmap(t, workspace.slug);
    expect(titles(roadmap.planned)).toEqual(["Dark mode"]);
    expect([...roadmap.in_progress, ...roadmap.shipped]).toEqual([]);
    await t.settle();
  });

  it("shows each reader their own votes", async () => {
    const t = testApp();
    const workspace = await setupWorkspace(t);
    const [post] = await postsIn(t, workspace, "planned", ["Dark mode"]);
    const fan = await t.signIn();
    await voteFor(t, fan.cookie, post!.id);
    const asFan = await readRoadmap(t, workspace.slug, fan.cookie);
    expect(asFan.planned[0]).toMatchObject({ voted: true, voteCount: 2 });
    const signedOut = await readRoadmap(t, workspace.slug);
    expect(signedOut.planned[0]).toMatchObject({ voted: false });
    await t.settle();
  });

  it("answers 404 for an unknown workspace", async () => {
    const t = testApp();
    const res = await t.client.api.workspaces[":slug"].roadmap.$get({
      param: { slug: "no-such-place" },
    });
    expect(res.status).toBe(404);
    await t.settle();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test worker/routes/roadmap.test.ts`

Expected: FAIL.
- `readRoadmap` throws "roadmap failed: 404", because the route doesn't exist.
- Only "answers 404 for an unknown workspace" already passes, since a missing route answers 404 too.

- [ ] **Step 3: Add the query and the route**

`worker/services/roadmap.ts`:

```ts
import { and, desc, eq, gt, isNull, type SQL, sql } from "drizzle-orm";
import type { Roadmap } from "@/shared/posts";
import type { RoadmapStatus } from "@/shared/status";
import type { Database } from "../db/client";
import { boards, posts, user as users } from "../db/schema";
import { postColumns, toSummary } from "./posts";

/** How many posts a column shows. */
const COLUMN_LENGTH = 50;

/**
 * The public roadmap: unmerged posts that are planned or in progress, most
 * voted first, and what shipped in the last 30 days, latest first.
 */
export async function listRoadmap(
  db: Database,
  input: { workspaceId: string; viewerId: string | null }
): Promise<Roadmap> {
  const column = (status: RoadmapStatus, extra: SQL[], order: SQL[]) =>
    db
      .select(postColumns(input.viewerId))
      .from(posts)
      .innerJoin(boards, eq(boards.id, posts.boardId))
      .leftJoin(users, eq(users.id, posts.authorId))
      .where(
        and(
          eq(posts.organizationId, input.workspaceId),
          isNull(posts.mergedIntoId),
          eq(posts.status, status),
          ...extra
        )
      )
      .orderBy(...order)
      .limit(COLUMN_LENGTH);
  const byVotes = [
    desc(posts.voteCount),
    desc(posts.createdAt),
    desc(posts.id),
  ];
  const [planned, inProgress, shipped] = await Promise.all([
    column("planned", [], byVotes),
    column("in_progress", [], byVotes),
    column(
      "shipped",
      [gt(posts.statusChangedAt, sql`now() - interval '30 days'`)],
      [desc(posts.statusChangedAt), desc(posts.id)]
    ),
  ]);
  return {
    planned: planned.map(toSummary),
    in_progress: inProgress.map(toSummary),
    shipped: shipped.map(toSummary),
  };
}
```

`worker/routes/roadmap.ts`:

```ts
import { Hono } from "hono";
import type { SuccessResponse } from "@/shared/envelope";
import type { Roadmap } from "@/shared/posts";
import type { AppEnv } from "../env";
import { readViewerId } from "../middleware/session";
import { listRoadmap } from "../services/roadmap";
import { findWorkspace } from "./workspaces";

/** Under /workspaces: a workspace's public roadmap. */
export const workspaceRoadmapRoutes = new Hono<AppEnv>().get(
  "/:slug/roadmap",
  async (c) => {
    const workspace = await findWorkspace(c.var.db, c.req.param("slug"));
    const roadmap = await listRoadmap(c.var.db, {
      workspaceId: workspace.id,
      viewerId: await readViewerId(c),
    });
    return c.json<SuccessResponse<Roadmap>>({ success: true, data: roadmap });
  }
);
```

In `worker/app.ts`, import the routes after the post routes:

```ts
import { workspaceRoadmapRoutes } from "./routes/roadmap";
```

And mount them after `workspacePostRoutes`:

```ts
    .route("/workspaces", workspacePostRoutes)
    .route("/workspaces", workspaceRoadmapRoutes)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test worker/routes/roadmap.test.ts`

Expected: PASS, 5 tests.

Then run: `bun run test`

Expected: PASS. 50 test files, 410 tests.

- [ ] **Step 5: Commit**

```bash
bun run typecheck
bun run check:fix && bun run check
git add worker
git commit -m "feat: the public roadmap: planned, in progress, and shipped in the last 30 days" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Sending the queued emails every five minutes

**Files:**
- Modify: `worker/mail/templates.ts` (the Shipped email); Test: `worker/mail/templates.test.ts`
- Modify: `worker/mail/mailer.ts` (`sendShipped`, `CodeMailer`); Test: `worker/mail/mailer.test.ts`
- Modify: `worker/auth.ts`, `worker/middleware/auth.ts`, `worker/app.ts` (sign-in takes a `CodeMailer`)
- Modify: `worker/test/app.ts` (the capturing mailer keeps Shipped notices)
- Modify: `worker/services/outbox.ts` (`sendQueuedEmails`); Test: `worker/services/outbox.test.ts`
- Create: `worker/cron.ts` (`runScheduled`); Test: `worker/cron.test.ts`
- Modify: `worker/index.ts` (the `scheduled` handler), `wrangler.jsonc` (the trigger)

**Interfaces:**
- Consumes:
  - From Task 1: `emailOutbox` and `ShippedPayload`.
  - From Task 4: the queued emails.
  - From Phase 1: `mailerFor`, `brevoMailer`, `consoleMailer` and `createDb`.
- Produces:
  - `type ShippedNotice = { to; locale; title; url; workspaceName; note }` and `shippedEmail(notice): { subject; text; html }`.
  - The mailers:
    - `Mailer.sendShipped(notice): Promise<void>` on the console, Brevo and capturing mailers.
    - `type CodeMailer = Pick<Mailer, "sendSignInCode">`, which is all sign-in needs.
  - `sendQueuedEmails(db, mailer, options: { origin: string; batch?: number; postIds?: number[] }): Promise<{ sent: number; failed: number }>`.
  - `runScheduled(cron: string, env: Bindings, deps?: { mailer?; send? })` and `EVERY_FIVE_MINUTES = "*/5 * * * *"`.
  - `capturingMailer()` now also returns `shipped: ShippedNotice[]`.

- [ ] **Step 1: Write the failing tests**

`worker/mail/templates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { shippedEmail } from "./templates";

const notice = {
  locale: "en" as const,
  title: "Dark mode",
  url: "https://pano.example/p/7-dark-mode",
  workspaceName: "Acme",
  note: null,
};

describe("shippedEmail", () => {
  it("names the post, links to it, and says how to stop", () => {
    const email = shippedEmail(notice);
    expect(email.subject).toBe("Shipped: Dark mode");
    expect(email.text).toContain("“Dark mode” on Acme's board has shipped.");
    expect(email.text).toContain(
      "See it on Pano: https://pano.example/p/7-dark-mode"
    );
    expect(email.text).toContain("press Unsubscribe");
    expect(email.html).toContain(
      '<a href="https://pano.example/p/7-dark-mode">'
    );
  });

  it("carries the team's note", () => {
    const email = shippedEmail({ ...notice, note: "In v2.\nEnjoy!" });
    expect(email.text).toContain("The team's note:\nIn v2.\nEnjoy!");
    expect(email.html).toContain("In v2.<br>Enjoy!");
  });

  it("escapes people's text in the HTML", () => {
    const email = shippedEmail({
      ...notice,
      title: '<img src=x onerror="alert(1)">',
      note: "a & b <script>",
    });
    expect(email.html).not.toContain("<img");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
    );
    expect(email.html).toContain("a &amp; b &lt;script&gt;");
  });

  it("keeps the subject on one line", () => {
    expect(shippedEmail({ ...notice, title: "Dark\nmode" }).subject).toBe(
      "Shipped: Dark mode"
    );
  });

  it("writes Turkish for a Turkish workspace", () => {
    const email = shippedEmail({
      ...notice,
      locale: "tr",
      workspaceName: "Duman Kafe",
    });
    expect(email.subject).toBe("Yayında: Dark mode");
    expect(email.text).toContain(
      "Duman Kafe panosundaki “Dark mode” isteği yayına alındı."
    );
  });
});
```

In `worker/mail/mailer.test.ts`, add a test before "fails when Brevo refuses the email":

```ts
  it("sends a Shipped email through Brevo", async () => {
    const send = vi.fn<SendFn>(accepted);
    await brevoMailer("k", "hello@pano.example", send).sendShipped({
      to: "ayse@example.com",
      locale: "en",
      title: "Dark mode",
      url: "https://pano.example/p/7-dark-mode",
      workspaceName: "Acme",
      note: null,
    });
    const body = JSON.parse(String(send.mock.calls[0]![1].body));
    expect(body).toMatchObject({
      to: [{ email: "ayse@example.com" }],
      subject: "Shipped: Dark mode",
    });
    expect(body.textContent).toContain("https://pano.example/p/7-dark-mode");
  });
```

`worker/services/outbox.test.ts`. Every run passes `postIds`: test files run at once against one database, and a run without it would send emails other files are still checking.

```ts
import { asc, eq, inArray, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { emailOutbox, user as users } from "../db/schema";
import type { Mailer, ShippedNotice } from "../mail/mailer";
import { capturingMailer, testApp } from "../test/app";
import { testDb } from "../test/db";
import { setupWorkspace, submitPost } from "../test/fixtures";
import { sendQueuedEmails } from "./outbox";

const { db, close } = testDb();
afterAll(() => close());

const ORIGIN = "http://localhost";

/** A post with a Shipped email queued for each of `people` new accounts. */
async function queued(people: number) {
  const t = testApp();
  const { owner, slug, boards } = await setupWorkspace(t);
  const post = await submitPost(t, owner.cookie, slug, {
    boardId: boards[0]!.id,
    title: "Dark mode",
  });
  const emails: string[] = [];
  for (let i = 0; i < people; i++) emails.push((await t.signIn()).email);
  await t.settle();
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.email, emails));
  await db.insert(emailOutbox).values(
    rows.map((row) => ({
      userId: row.id,
      postId: post.id,
      kind: "shipped" as const,
      payload: {
        title: "Dark mode",
        ref: `${post.id}-dark-mode`,
        workspaceName: "Acme",
        locale: "en" as const,
        note: null,
      },
    }))
  );
  return { postId: post.id, emails: emails.sort() };
}

const rowsOf = (postId: number) =>
  db
    .select({
      id: emailOutbox.id,
      sentAt: emailOutbox.sentAt,
      attempts: emailOutbox.attempts,
      lastError: emailOutbox.lastError,
      claimedAt: emailOutbox.claimedAt,
    })
    .from(emailOutbox)
    .where(eq(emailOutbox.postId, postId))
    .orderBy(asc(emailOutbox.id));

const failing: Mailer = {
  ...capturingMailer().mailer,
  async sendShipped() {
    throw new Error("Brevo is down");
  },
};

describe("sendQueuedEmails", () => {
  it("sends each queued email once, with a link to the post", async () => {
    const { postId, emails } = await queued(2);
    const mail = capturingMailer();
    const run = (options = { origin: ORIGIN, postIds: [postId] }) =>
      sendQueuedEmails(db, mail.mailer, options);
    expect(await run()).toEqual({ sent: 2, failed: 0 });
    expect(mail.shipped.map((notice) => notice.to).sort()).toEqual(emails);
    expect(mail.shipped[0]).toMatchObject({
      title: "Dark mode",
      url: `http://localhost/p/${postId}-dark-mode`,
      locale: "en",
      workspaceName: "Acme",
      note: null,
    });
    expect((await rowsOf(postId)).every((row) => row.sentAt !== null)).toBe(
      true
    );
    expect(await run()).toEqual({ sent: 0, failed: 0 });
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
        attempts: 5,
        lastError: "Brevo is down",
        claimedAt: null,
      },
    ]);
    const mail = capturingMailer();
    expect(await sendQueuedEmails(db, mail.mailer, options)).toEqual({
      sent: 0,
      failed: 0,
    });
    expect(mail.shipped).toEqual([]);
  });

  it("sends each email once when two runs overlap", async () => {
    const { postId, emails } = await queued(4);
    const second = testDb();
    const delivered: string[] = [];
    const slow: Mailer = {
      ...capturingMailer().mailer,
      async sendShipped(notice: ShippedNotice) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        delivered.push(notice.to);
      },
    };
    const options = { origin: ORIGIN, postIds: [postId], batch: 4 };
    const runs = await Promise.all([
      sendQueuedEmails(db, slow, options),
      sendQueuedEmails(second.db, slow, options),
    ]);
    await second.close();
    expect(runs[0].sent + runs[1].sent).toBe(4);
    expect(delivered.sort()).toEqual(emails);
  });

  it("sends an email left claimed by a run that died, once the claim lapses", async () => {
    const { postId } = await queued(2);
    const [stale, fresh] = await rowsOf(postId);
    await db
      .update(emailOutbox)
      .set({ claimedAt: sql`now() - interval '11 minutes'`, attempts: 1 })
      .where(eq(emailOutbox.id, stale!.id));
    await db
      .update(emailOutbox)
      .set({ claimedAt: sql`now()`, attempts: 1 })
      .where(eq(emailOutbox.id, fresh!.id));
    const mail = capturingMailer();
    expect(
      await sendQueuedEmails(db, mail.mailer, {
        origin: ORIGIN,
        postIds: [postId],
      })
    ).toEqual({ sent: 1, failed: 0 });
    const after = await rowsOf(postId);
    expect(after.map((row) => row.sentAt !== null)).toEqual([true, false]);
  });

  it("sends at most a batch a run, oldest first", async () => {
    const { postId } = await queued(3);
    const mail = capturingMailer();
    const options = { origin: ORIGIN, postIds: [postId], batch: 2 };
    expect(await sendQueuedEmails(db, mail.mailer, options)).toEqual({
      sent: 2,
      failed: 0,
    });
    expect((await rowsOf(postId)).map((row) => row.sentAt !== null)).toEqual([
      true,
      true,
      false,
    ]);
    expect(await sendQueuedEmails(db, mail.mailer, options)).toEqual({
      sent: 1,
      failed: 0,
    });
  });
});
```

`worker/cron.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { EVERY_FIVE_MINUTES, runScheduled } from "./cron";
import type { sendQueuedEmails } from "./services/outbox";
import { capturingMailer } from "./test/app";
import { testEnv } from "./test/env";

const nothingToSend = () =>
  vi.fn<typeof sendQueuedEmails>(async () => ({ sent: 0, failed: 0 }));

describe("runScheduled", () => {
  it("sends queued emails every five minutes, linking to this app", async () => {
    const send = nothingToSend();
    const { mailer } = capturingMailer();
    await runScheduled(EVERY_FIVE_MINUTES, testEnv().env, { mailer, send });
    expect(send).toHaveBeenCalledOnce();
    const [, usedMailer, options] = send.mock.calls[0]!;
    expect(usedMailer).toBe(mailer);
    expect(options).toEqual({ origin: "http://localhost" });
  });

  it("ignores other triggers", async () => {
    const send = nothingToSend();
    await runScheduled("0 1 * * *", testEnv().env, { send });
    expect(send).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test worker/mail worker/services/outbox.test.ts worker/cron.test.ts`

Expected: FAIL.
- `templates.test.ts`: `shippedEmail` isn't exported.
- `mailer.test.ts`: the new test fails because `sendShipped` isn't a function. The other 6 still pass.
- `outbox.test.ts`: `sendQueuedEmails` isn't exported.
- `cron.test.ts`: `./cron` doesn't exist.

- [ ] **Step 3: Add the Shipped email**

In `worker/mail/templates.ts`, append:

```ts
/** A Shipped email, for one subscriber. */
export type ShippedNotice = {
  to: string;
  locale: Locale;
  title: string;
  /** The post's address on Pano. */
  url: string;
  workspaceName: string;
  /** The team's note on the status change, if any. */
  note: string | null;
};

/** Titles and notes are people's text: escaped before they go into HTML. */
function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const shippedCopy = {
  en: {
    subject: (title: string) => `Shipped: ${title}`,
    intro: (title: string, workspace: string) =>
      `Good news: “${title}” on ${workspace}'s board has shipped.`,
    note: "The team's note:",
    link: "See it on Pano",
    why: "You're getting this because you follow this request. To stop, open it and press Unsubscribe.",
  },
  tr: {
    subject: (title: string) => `Yayında: ${title}`,
    intro: (title: string, workspace: string) =>
      `Güzel haber: ${workspace} panosundaki “${title}” isteği yayına alındı.`,
    note: "Ekibin notu:",
    link: "Pano'da görün",
    why: "Bu isteği takip ettiğiniz için bu e-postayı alıyorsunuz. Durdurmak için isteği açıp “Abonelikten çık” düğmesine basın.",
  },
} satisfies Record<Locale, unknown>;

/** The email a subscriber gets when a post they follow ships. */
export function shippedEmail(notice: Omit<ShippedNotice, "to">) {
  const c = shippedCopy[notice.locale];
  // A subject is one line.
  const title = notice.title.replace(/\s+/g, " ");
  const intro = c.intro(title, notice.workspaceName);
  const text = [
    intro,
    ...(notice.note ? [`${c.note}\n${notice.note}`] : []),
    `${c.link}: ${notice.url}`,
    c.why,
  ].join("\n\n");
  const html = [
    `<p>${escapeHtml(intro)}</p>`,
    ...(notice.note
      ? [
          `<p>${escapeHtml(c.note)}<br>${escapeHtml(notice.note).replaceAll("\n", "<br>")}</p>`,
        ]
      : []),
    `<p><a href="${escapeHtml(notice.url)}">${escapeHtml(c.link)}</a></p>`,
    `<p style="color:#666;font-size:12px">${escapeHtml(c.why)}</p>`,
  ].join("");
  return { subject: c.subject(title), text, html };
}
```

Replace `worker/mail/mailer.ts` with:

```ts
import type { Locale } from "@/shared/locale";
import type { Bindings } from "../env";
import { type ShippedNotice, shippedEmail, signInCodeEmail } from "./templates";

export type { ShippedNotice } from "./templates";

export type SignInCode = { to: string; code: string; locale: Locale };

export interface Mailer {
  sendSignInCode(message: SignInCode): Promise<void>;
  sendShipped(message: ShippedNotice): Promise<void>;
}

/** What sign-in needs from a mailer. */
export type CodeMailer = Pick<Mailer, "sendSignInCode">;

/** Local dev: emails go to the terminal instead of an inbox. */
export const consoleMailer: Mailer = {
  async sendSignInCode({ to, code }) {
    console.log(`[mail] sign-in code for ${to}: ${code}`);
  },
  async sendShipped({ to, title, url }) {
    console.log(`[mail] shipped notice for ${to}: ${title} ${url}`);
  },
};

export type SendFn = (url: string, init: RequestInit) => Promise<Response>;

/** Brevo's transactional email API (its free tier allows 300 emails a day). */
export function brevoMailer(
  apiKey: string,
  from: string,
  send: SendFn = (url, init) => fetch(url, init)
): Mailer {
  async function deliver(
    to: string,
    { subject, text, html }: { subject: string; text: string; html: string }
  ) {
    const res = await send("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: "Pano", email: from },
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html,
      }),
    });
    if (!res.ok) {
      throw new Error(
        `Brevo refused the email: ${res.status} ${await res.text()}`
      );
    }
  }
  return {
    sendSignInCode: ({ to, code, locale }) =>
      deliver(to, signInCodeEmail(code, locale)),
    sendShipped: (message) => deliver(message.to, shippedEmail(message)),
  };
}

export type MailEnv = Pick<
  Bindings,
  "ENVIRONMENT" | "BREVO_API_KEY" | "MAIL_FROM"
>;

/**
 * Production sends through Brevo. Without a key, local dev prints codes; a
 * production deploy without one fails loudly rather than logging codes.
 */
export function mailerFor(env: MailEnv): Mailer {
  if (env.BREVO_API_KEY) {
    if (!env.MAIL_FROM) throw new Error("MAIL_FROM is not set");
    return brevoMailer(env.BREVO_API_KEY, env.MAIL_FROM);
  }
  if (env.ENVIRONMENT === "production") {
    throw new Error("BREVO_API_KEY is not set");
  }
  return consoleMailer;
}
```

Sign-in only sends codes, so it asks for a `CodeMailer`:
- In `worker/auth.ts`:
  - Import `type CodeMailer` instead of `type Mailer`.
  - The deps become `export type AuthDeps = { db: Database; env: Bindings; mailer: CodeMailer };`.
- In `worker/middleware/auth.ts`:
  - Import `{ type CodeMailer, mailerFor }`.
  - Type the parameter `withAuth = (mailer?: CodeMailer) =>`.
  - Declare `const lazyMailer: CodeMailer = {`.
- In `worker/app.ts`:
  - Import `type CodeMailer` instead of `type Mailer`.
  - The deps become `export type AppDeps = { mailer?: CodeMailer };`.

In `worker/test/app.ts`, add `ShippedNotice` to the mailer type import, and replace `capturingMailer` with:

```ts
/** A mailer that keeps what it would have sent, so tests can read it. */
export function capturingMailer() {
  const sent: SignInCode[] = [];
  const shipped: ShippedNotice[] = [];
  const mailer: Mailer = {
    async sendSignInCode(message) {
      sent.push(message);
    },
    async sendShipped(message) {
      shipped.push(message);
    },
  };
  return { mailer, sent, shipped };
}
```

- [ ] **Step 4: Add the sender and the cron**

In `worker/services/outbox.ts`, replace the imports with:

```ts
import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { postRef } from "@/shared/ref";
import type { Database, Transaction } from "../db/client";
import {
  emailOutbox,
  organization,
  type ShippedPayload,
  user as users,
  workspaceSettings,
} from "../db/schema";
import type { Mailer } from "../mail/mailer";
```

And append:

```ts
/** After this many failed tries, an email stays unsent with its last error. */
const MAX_ATTEMPTS = 5;

/**
 * Sends the oldest unsent emails, at most `batch` of them: Brevo's free plan
 * allows 300 a day, and the cron runs every five minutes.
 *
 * Each email is claimed before it's sent, skipping rows another run has
 * locked, so overlapping runs send different ones. A claim left by a run
 * that died lapses after ten minutes. A failed email is tried again on
 * later runs. `postIds` limits a run to those posts' emails; the cron sends
 * them all, and tests pass their own posts so test files running at once
 * leave each other's emails alone.
 */
export async function sendQueuedEmails(
  db: Database,
  mailer: Mailer,
  options: { origin: string; batch?: number; postIds?: number[] }
) {
  const due = db
    .select({ id: emailOutbox.id })
    .from(emailOutbox)
    .where(
      and(
        isNull(emailOutbox.sentAt),
        lt(emailOutbox.attempts, MAX_ATTEMPTS),
        or(
          isNull(emailOutbox.claimedAt),
          lt(emailOutbox.claimedAt, sql`now() - interval '10 minutes'`)
        ),
        options.postIds
          ? inArray(emailOutbox.postId, options.postIds)
          : undefined
      )
    )
    .orderBy(asc(emailOutbox.id))
    .limit(options.batch ?? 20)
    .for("update", { skipLocked: true });
  const claimed = await db
    .update(emailOutbox)
    .set({
      claimedAt: sql`now()`,
      attempts: sql`${emailOutbox.attempts} + 1`,
    })
    .where(inArray(emailOutbox.id, due))
    .returning({
      id: emailOutbox.id,
      userId: emailOutbox.userId,
      payload: emailOutbox.payload,
    });
  if (claimed.length === 0) return { sent: 0, failed: 0 };
  const recipients = new Map(
    (
      await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(
          inArray(users.id, [...new Set(claimed.map((row) => row.userId))])
        )
    ).map((row) => [row.id, row.email])
  );
  let sent = 0;
  // One at a time: a run stays well inside the Workers subrequest limit.
  for (const email of claimed.sort((a, b) => a.id - b.id)) {
    try {
      const to = recipients.get(email.userId);
      if (!to) throw new Error("the recipient has no email address");
      const { title, ref, workspaceName, locale, note } = email.payload;
      await mailer.sendShipped({
        to,
        locale,
        title,
        url: new URL(`/p/${ref}`, options.origin).toString(),
        workspaceName,
        note,
      });
      await db
        .update(emailOutbox)
        .set({ sentAt: sql`now()`, lastError: null })
        .where(eq(emailOutbox.id, email.id));
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

`worker/cron.ts`:

```ts
import { createDb } from "./db/client";
import type { Bindings } from "./env";
import { type Mailer, mailerFor } from "./mail/mailer";
import { sendQueuedEmails } from "./services/outbox";

/** The trigger in wrangler.jsonc that sends queued emails. */
export const EVERY_FIVE_MINUTES = "*/5 * * * *";

type CronDeps = {
  mailer?: Mailer;
  send?: typeof sendQueuedEmails;
};

/**
 * What a cron trigger does, kept free of Workers globals so it runs under
 * Node in tests: every five minutes, send queued emails.
 */
export async function runScheduled(
  cron: string,
  env: Bindings,
  { mailer, send = sendQueuedEmails }: CronDeps = {}
) {
  if (cron !== EVERY_FIVE_MINUTES) return;
  const { db, close } = createDb(env.HYPERDRIVE.connectionString);
  try {
    const result = await send(db, mailer ?? mailerFor(env), {
      origin: env.BETTER_AUTH_URL,
    });
    if (result.sent + result.failed > 0) {
      console.log(`[outbox] sent ${result.sent}, failed ${result.failed}`);
    }
  } finally {
    await close();
  }
}
```

In `worker/index.ts`:
- Import it after `app`: `import { runScheduled } from "./cron";`.
- In the comment above the handler, replace its last sentence, "Cron triggers join this file in Phase 4.", with "Cron triggers run in the background after the trigger is acknowledged."
- Add the handler after `fetch`:

```ts
  scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(controller.cron, env));
  },
```

In `wrangler.jsonc`, add the trigger after `observability`:

```jsonc
  // Every five minutes: send queued emails (worker/cron.ts).
  "triggers": { "crons": ["*/5 * * * *"] },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test worker/mail worker/services/outbox.test.ts worker/cron.test.ts`

Expected: PASS: 5 in `templates.test.ts`, 7 in `mailer.test.ts`, 5 in `outbox.test.ts`, and 2 in `cron.test.ts`.

Then run: `bun run test`

Expected: PASS. 53 test files, 423 tests.

- [ ] **Step 6: Commit**

```bash
bun run typecheck
bun run check:fix && bun run check
git add worker wrangler.jsonc
git commit -m "feat: send queued emails every five minutes, claimed so overlapping runs never double-send" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The client's roadmap query, requests and cache edits

**Files:**
- Modify: `src/lib/keys.ts` (roadmap keys, mutation keys), `src/lib/posts.ts` (the roadmap query and three requests)
- Modify: `src/features/posts/post-cache.ts` (`everyCopyOfPost` reaches the roadmaps)
- Create: `src/features/status/status-cache.ts` (`cardOf`, `placeOnRoadmap`, `optimisticStatus`); Test: `src/features/status/status-cache.test.ts`
- Create: `src/features/status/use-change-status.ts` (`useChangeStatus`)
- Create: `src/features/subscriptions/use-subscription.ts` (`useSubscription`)

**Interfaces:**
- Consumes:
  - From Phases 2–3: `applyOptimistic`, `patch`, `everyCopyOfPost`, `postKeys`, `api`, `unwrap`, `apiErrorKey` and `optimisticVote`.
  - From Task 2: `Roadmap`, `ROADMAP_STATUSES` and `isRoadmapStatus`.
  - From Tasks 3–6: the routes.
- Produces:
  - Keys:
    - `postKeys.roadmapAll` (`["posts", "roadmap"]`) and `postKeys.roadmap(ws)`
    - `statusMutationKey` (`["status"]`) and `subscriptionKey(postId)`
  - `roadmapQueryOptions(ws)`.
  - Requests:
    - `changeStatus(id, { status, note? }): Promise<PostDetail>`
    - `mergePost(id, intoId): Promise<PostDetail>`
    - `setSubscription(id, subscribed): Promise<SubscriptionResult>`
  - Status cache edits:
    - `cardOf(post: PostSummary, status): PostSummary`
    - `placeOnRoadmap(board: Draft<Roadmap>, card: PostSummary): void`
    - `optimisticStatus(qc, { post, workspace, status }): Promise<() => void>`
  - Hooks:
    - `useChangeStatus()`: a mutation taking `StatusMove = { post: PostSummary; workspace: string; status: PostStatus; note?: string }`.
    - `useSubscription(postId)`: a mutation taking `subscribed: boolean`.

- [ ] **Step 1: Write the failing tests**

`src/features/status/status-cache.test.ts`:

```ts
import { QueryClient } from "@tanstack/react-query";
import { produce } from "immer";
import { describe, expect, it } from "vitest";
import { optimisticVote } from "@/features/votes/vote-cache";
import { type FeedParams, postKeys } from "@/lib/keys";
import type {
  FeedPage,
  PostDetail,
  PostSummary,
  Roadmap,
} from "@/shared/posts";
import { cardOf, optimisticStatus, placeOnRoadmap } from "./status-cache";

const post = (
  id: number,
  overrides: Partial<PostSummary> = {}
): PostSummary => ({
  id,
  ref: `${id}-post`,
  title: `Post ${id}`,
  excerpt: "",
  status: "planned",
  voteCount: 1,
  commentCount: 0,
  voted: false,
  board: { slug: "features", name: "Features" },
  author: { name: "Ayşe" },
  createdAt: "2026-10-01T00:00:00.000Z",
  ...overrides,
});

const detailOf = (summary: PostSummary): PostDetail => ({
  ...summary,
  body: "A long body.",
  workspace: { slug: "acme", name: "Acme", defaultLocale: "en" },
  canEdit: true,
  isTeam: true,
  pinned: null,
  subscribed: true,
  timeline: [],
  mergedInto: null,
});

const board = (): Roadmap => ({
  planned: [post(1, { voteCount: 5 }), post(2, { voteCount: 2 })],
  in_progress: [
    post(3, { status: "in_progress", voteCount: 4 }),
    post(4, { status: "in_progress", voteCount: 1 }),
  ],
  shipped: [post(5, { status: "shipped" })],
});

const columns = (roadmap: Roadmap | undefined) => ({
  planned: roadmap?.planned.map((item) => item.id),
  in_progress: roadmap?.in_progress.map((item) => item.id),
  shipped: roadmap?.shipped.map((item) => item.id),
});

describe("placeOnRoadmap", () => {
  it("moves a card into its new column, most voted first", () => {
    const next = produce(board(), (draft) => {
      placeOnRoadmap(draft, cardOf(post(1, { voteCount: 3 }), "in_progress"));
    });
    expect(columns(next)).toEqual({
      planned: [2],
      in_progress: [3, 1, 4],
      shipped: [5],
    });
  });

  it("puts a shipped card first", () => {
    const next = produce(board(), (draft) => {
      placeOnRoadmap(draft, cardOf(post(4), "shipped"));
    });
    expect(columns(next).shipped).toEqual([4, 5]);
  });

  it("takes a card off for a status the roadmap doesn't show", () => {
    const next = produce(board(), (draft) => {
      placeOnRoadmap(draft, cardOf(post(2), "closed"));
    });
    expect(columns(next).planned).toEqual([1]);
  });

  it("adds a card it didn't have", () => {
    const next = produce(board(), (draft) => {
      placeOnRoadmap(draft, cardOf(post(9, { voteCount: 10 }), "planned"));
    });
    expect(columns(next).planned).toEqual([9, 1, 2]);
  });
});

describe("cardOf", () => {
  it("keeps only what a card shows, at the new status", () => {
    const card = cardOf(detailOf(post(7)), "shipped");
    expect(card).toEqual({ ...post(7), status: "shipped" });
  });
});

describe("optimisticStatus", () => {
  const feedParams: FeedParams = { sort: "trending", page: 1 };
  const empty: Roadmap = { planned: [], in_progress: [], shipped: [] };

  function seed() {
    const qc = new QueryClient();
    qc.setQueryData(postKeys.roadmap("acme"), board());
    qc.setQueryData(postKeys.roadmap("other"), empty);
    qc.setQueryData(postKeys.detail(2), detailOf(post(2)));
    qc.setQueryData<FeedPage>(postKeys.feed("acme", feedParams), {
      items: [post(2)],
      page: 1,
      hasMore: false,
    });
    return qc;
  }

  it("moves the card on its own workspace's roadmap, and relabels every copy", async () => {
    const qc = seed();
    await optimisticStatus(qc, {
      post: post(2),
      workspace: "acme",
      status: "shipped",
    });
    expect(columns(qc.getQueryData(postKeys.roadmap("acme")))).toEqual({
      planned: [1],
      in_progress: [3, 4],
      shipped: [2, 5],
    });
    expect(qc.getQueryData<PostDetail>(postKeys.detail(2))?.status).toBe(
      "shipped"
    );
    expect(
      qc.getQueryData<FeedPage>(postKeys.feed("acme", feedParams))?.items[0]
        ?.status
    ).toBe("shipped");
    expect(qc.getQueryData(postKeys.roadmap("other"))).toEqual(empty);
  });

  it("rolls every copy back", async () => {
    const qc = seed();
    const before = qc.getQueryData(postKeys.roadmap("acme"));
    const rollback = await optimisticStatus(qc, {
      post: post(2),
      workspace: "acme",
      status: "closed",
    });
    rollback();
    expect(qc.getQueryData(postKeys.roadmap("acme"))).toEqual(before);
    expect(qc.getQueryData<PostDetail>(postKeys.detail(2))?.status).toBe(
      "planned"
    );
  });
});

describe("a vote", () => {
  it("counts on the roadmap's card too", async () => {
    const qc = new QueryClient();
    qc.setQueryData(postKeys.roadmap("acme"), board());
    await optimisticVote(qc, 2, true);
    expect(
      qc.getQueryData<Roadmap>(postKeys.roadmap("acme"))?.planned[1]
    ).toMatchObject({ id: 2, voted: true, voteCount: 3 });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test src/features/status/status-cache.test.ts`

Expected: FAIL. `./status-cache` doesn't exist.

- [ ] **Step 3: Add the keys and the requests**

In `src/lib/keys.ts`, add to `postKeys`, after `similar`:

```ts
  roadmapAll: ["posts", "roadmap"] as const,
  roadmap: (workspace: string) => ["posts", "roadmap", workspace] as const,
```

And before `voteKey`:

```ts
/** Every status change shares this key: the board refetches once none is left. */
export const statusMutationKey = ["status"] as const;

/** Every subscription change to one post shares this key. */
export const subscriptionKey = (postId: number) =>
  ["subscription", postId] as const;
```

In `src/lib/posts.ts`, import the status type after the TanStack import:

```ts
import type { PostStatus } from "@/shared/status";
```

And append:

```ts
export const roadmapQueryOptions = (workspace: string) =>
  queryOptions({
    queryKey: postKeys.roadmap(workspace),
    queryFn: async () =>
      unwrap(
        await api.workspaces[":slug"].roadmap.$get({
          param: { slug: workspace },
        })
      ),
  });

export async function changeStatus(
  id: number,
  json: { status: PostStatus; note?: string }
) {
  return unwrap(
    await api.posts[":id"].status.$patch({ param: { id: String(id) }, json })
  );
}

export async function mergePost(id: number, intoId: number) {
  return unwrap(
    await api.posts[":id"].merge.$post({
      param: { id: String(id) },
      json: { intoId },
    })
  );
}

export async function setSubscription(id: number, subscribed: boolean) {
  return unwrap(
    await api.posts[":id"].subscription.$put({
      param: { id: String(id) },
      json: { subscribed },
    })
  );
}
```

- [ ] **Step 4: Reach the roadmaps, and add the status edits and hooks**

In `src/features/posts/post-cache.ts`:
- Import `Roadmap` with the other post types.
- Import `ROADMAP_STATUSES` from `@/shared/status`.
- End the doc comment with "page, the similar-requests lists, and the roadmaps."
- Add a fourth patch to the returned list:

```ts
    patch<Roadmap>({ queryKey: postKeys.roadmapAll }, (board) => {
      for (const status of ROADMAP_STATUSES) {
        for (const item of board[status]) {
          if (item.id === postId) edit(item);
        }
      }
    }),
```

`src/features/status/status-cache.ts`:

```ts
import type { QueryClient } from "@tanstack/react-query";
import type { Draft } from "immer";
import { everyCopyOfPost } from "@/features/posts/post-cache";
import { postKeys } from "@/lib/keys";
import { applyOptimistic, patch } from "@/lib/optimistic";
import type { PostSummary, Roadmap } from "@/shared/posts";
import {
  isRoadmapStatus,
  type PostStatus,
  ROADMAP_STATUSES,
} from "@/shared/status";

/**
 * A post as a roadmap card, at `status`. The caller may hold a whole post
 * page; the board keeps only what a card shows.
 */
export function cardOf(post: PostSummary, status: PostStatus): PostSummary {
  const { id, ref, title, excerpt, voteCount, commentCount, voted } = post;
  const { board, author, createdAt } = post;
  return {
    ...{ id, ref, title, excerpt, status, voteCount, commentCount, voted },
    ...{ board, author, createdAt },
  };
}

/**
 * Puts `card` in the column for its status, the way the server orders it:
 * shipped latest first, the others most voted first. A status off the
 * roadmap takes it off.
 */
export function placeOnRoadmap(board: Draft<Roadmap>, card: PostSummary) {
  for (const status of ROADMAP_STATUSES) {
    const at = board[status].findIndex((item) => item.id === card.id);
    if (at !== -1) board[status].splice(at, 1);
  }
  if (!isRoadmapStatus(card.status)) return;
  const column = board[card.status];
  const at =
    card.status === "shipped"
      ? 0
      : column.findIndex((item) => item.voteCount < card.voteCount);
  column.splice(at === -1 ? column.length : at, 0, card);
}

/**
 * Shows a post at its new status everywhere at once, moving its card on its
 * workspace's roadmap. Resolves to a rollback.
 */
export function optimisticStatus(
  qc: QueryClient,
  input: { post: PostSummary; workspace: string; status: PostStatus }
) {
  const card = cardOf(input.post, input.status);
  return applyOptimistic(qc, [
    ...everyCopyOfPost(input.post.id, (copy) => {
      copy.status = input.status;
    }),
    patch<Roadmap>(
      { queryKey: postKeys.roadmap(input.workspace), exact: true },
      (board) => placeOnRoadmap(board, card)
    ),
  ]);
}
```

`src/features/status/use-change-status.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "use-intl";
import { apiErrorKey } from "@/lib/error-text";
import { postKeys, statusMutationKey } from "@/lib/keys";
import { changeStatus } from "@/lib/posts";
import type { PostSummary } from "@/shared/posts";
import type { PostStatus } from "@/shared/status";
import { optimisticStatus } from "./status-cache";

/** One status change: the post, its workspace's slug, and where it goes. */
export type StatusMove = {
  post: PostSummary;
  workspace: string;
  status: PostStatus;
  note?: string;
};

/**
 * Changes posts' statuses, from the post page or the roadmap. Every change
 * waits in one queue (`scope`), so a card moved twice ends where it was
 * dropped last; each shows at once and rolls back on failure. The server's
 * post is written once no later change to it is waiting, and the lists are
 * fetched again once no change at all is, so a card still waiting its turn
 * doesn't jump back.
 */
export function useChangeStatus() {
  const qc = useQueryClient();
  const tErrors = useTranslations("errors");
  // In its own callbacks a mutation still counts itself.
  const pending = (postId?: number) =>
    qc.isMutating({
      mutationKey: statusMutationKey,
      predicate: (mutation) =>
        postId === undefined ||
        (mutation.state.variables as StatusMove | undefined)?.post.id ===
          postId,
    });
  return useMutation({
    mutationKey: statusMutationKey,
    scope: { id: "status" },
    // Offline, fail at once with a toast instead of waiting unseen.
    networkMode: "always",
    mutationFn: ({ post, status, note }: StatusMove) =>
      changeStatus(post.id, note ? { status, note } : { status }),
    onMutate: async (move) => ({ rollback: await optimisticStatus(qc, move) }),
    onError: (error, _move, context) => {
      context?.rollback();
      toast.error(tErrors(apiErrorKey(error)));
    },
    onSuccess: (detail, { post }) => {
      if (pending(post.id) === 1)
        qc.setQueryData(postKeys.detail(post.id), detail);
    },
    onSettled: () => {
      if (pending() === 1)
        void qc.invalidateQueries({ queryKey: postKeys.all });
    },
  });
}
```

`src/features/subscriptions/use-subscription.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "use-intl";
import { apiErrorKey } from "@/lib/error-text";
import { postKeys, subscriptionKey } from "@/lib/keys";
import { applyOptimistic, patch } from "@/lib/optimistic";
import { setSubscription } from "@/lib/posts";
import type { PostDetail } from "@/shared/posts";

/**
 * Follows or unfollows one post. Like votes, each request sends the state
 * clicked, one at a time, so rapid clicks end where the last one did.
 */
export function useSubscription(postId: number) {
  const qc = useQueryClient();
  const tErrors = useTranslations("errors");
  const mutationKey = subscriptionKey(postId);
  const isLast = () => qc.isMutating({ mutationKey }) === 1;
  return useMutation({
    mutationKey,
    scope: { id: `subscription:${postId}` },
    networkMode: "always",
    mutationFn: (subscribed: boolean) => setSubscription(postId, subscribed),
    onMutate: async (subscribed) => ({
      rollback: await applyOptimistic(qc, [
        patch<PostDetail>({ queryKey: postKeys.detail(postId) }, (post) => {
          post.subscribed = subscribed;
        }),
      ]),
    }),
    onError: (error, _subscribed, context) => {
      context?.rollback();
      toast.error(tErrors(apiErrorKey(error)));
    },
    onSettled: () => {
      if (isLast()) {
        void qc.invalidateQueries({ queryKey: postKeys.detail(postId) });
      }
    },
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test src/features/status src/features/votes`

Expected: PASS: 8 tests in `status-cache.test.ts`, and the 3 vote-button tests. The vote patch now reaches roadmap cards too.

Then run: `bun run test`

Expected: PASS. 54 test files, 431 tests.

- [ ] **Step 6: Commit**

```bash
bun run typecheck
bun run check:fix && bun run check
git add src/lib src/features
git commit -m "feat: client roadmap query, status and subscription hooks, and roadmap-aware cache edits" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Status, following and merging on the post page

**Files:**
- Modify: `src/i18n/messages/en.json` and `src/i18n/messages/tr.json` (the `status`, `subscription` and `merge` namespaces)
- Create: `src/features/status/status-control.tsx`, `src/features/status/status-timeline.tsx`; Test: `src/features/status/status-control.test.tsx`
- Create: `src/features/subscriptions/subscribe-button.tsx`; Test: `src/features/subscriptions/subscribe-button.test.tsx`
- Create: `src/features/merge/merge-panel.tsx`; Test: `src/features/merge/merge-panel.test.tsx`
- Modify: `src/routes/p/$ref.tsx` (the tools, the timeline, and the merged-post redirect)

**Interfaces:**
- Consumes:
  - From Task 8: `useChangeStatus`, `useSubscription`, `mergePost` and `feedQueryOptions`.
  - From Tasks 3–5: `PostDetail.subscribed`, `timeline`, `mergedInto` and `isTeam`.
  - From Phases 2–3: `StatusBadge`, `Markdown`, `AuthorName`, `useDebouncedValue`, `ApiError`, `fieldErrorKey`, `apiErrorKey` and `commentKeys`.
- Produces:
  - `StatusControl({ post }: { post: PostDetail })`, team only. A note field appears once a new status is picked.
  - `StatusTimeline({ timeline }: { timeline: StatusChangeView[] })`. It renders nothing for an empty timeline.
  - `SubscribeButton({ post })`, signed in only.
  - `MergePanel({ post, onMerged: (target: PostDetail) => Promise<unknown> | undefined })`, team only.
  - Catalog keys:
    - `status.*`: label, update, noteLabel, noteHint, timelineHeading, movedTo
    - `subscription.*`: subscribe, unsubscribe, hint
    - `merge.*`: open, heading, searchLabel, searchPlaceholder, pick, noResults, confirm, confirmButton, back, cancel

- [ ] **Step 1: Write the failing tests**

`src/features/status/status-control.test.tsx`:

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
  within,
} from "@testing-library/react";
import { IntlProvider } from "use-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StatusBadge } from "@/components/status-badge";
import en from "@/i18n/messages/en.json";
import { postQueryOptions } from "@/lib/posts";
import type { PostDetail, StatusChangeView } from "@/shared/posts";
import { StatusControl } from "./status-control";
import { StatusTimeline } from "./status-timeline";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  toastError.mockReset();
});

const detail: PostDetail = {
  id: 7,
  ref: "7-dark-mode",
  title: "Dark mode",
  excerpt: "",
  status: "open",
  voteCount: 3,
  commentCount: 0,
  voted: false,
  board: { slug: "features", name: "Features" },
  author: { name: "Ayşe" },
  createdAt: "2026-10-01T00:00:00.000Z",
  body: "",
  workspace: { slug: "acme", name: "Acme", defaultLocale: "en" },
  canEdit: true,
  isTeam: true,
  pinned: null,
  subscribed: false,
  timeline: [],
  mergedInto: null,
};

/** The post's API: it answers after 20 ms and keeps the timeline. */
function fakeServer({ failWrites = false } = {}) {
  const state = { detail, received: [] as unknown[] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const method = init?.method ?? "GET";
      const body =
        typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      await new Promise((resolve) => setTimeout(resolve, 20));
      const ok = (data: unknown) => Response.json({ success: true, data });
      if (url.pathname === "/api/posts/7" && method === "GET") {
        return ok(state.detail);
      }
      if (url.pathname === "/api/posts/7/status" && method === "PATCH") {
        state.received.push(body);
        if (failWrites) {
          return Response.json(
            { success: false, code: "INTERNAL_ERROR", error: "boom" },
            { status: 500 }
          );
        }
        const entry: StatusChangeView = {
          id: state.detail.timeline.length + 1,
          from: state.detail.status,
          to: body.status,
          note: body.note ?? null,
          by: { name: "Ayşe" },
          createdAt: "2026-10-19T00:00:00.000Z",
        };
        state.detail = {
          ...state.detail,
          status: body.status,
          timeline: [...state.detail.timeline, entry],
        };
        return ok(state.detail);
      }
      return Response.json(
        { success: false, code: "NOT_FOUND", error: "Not found" },
        { status: 404 }
      );
    })
  );
  return state;
}

function Harness() {
  const { data } = useQuery(postQueryOptions(7));
  if (!data) return null;
  return (
    <>
      <section aria-label="Current status">
        <StatusBadge status={data.status} />
      </section>
      <StatusControl post={data} />
      <StatusTimeline timeline={data.timeline} />
    </>
  );
}

function renderPost() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  qc.setQueryData(postQueryOptions(7).queryKey, detail);
  render(
    <IntlProvider locale="en" messages={en} timeZone="UTC">
      <QueryClientProvider client={qc}>
        <Harness />
      </QueryClientProvider>
    </IntlProvider>
  );
}

const current = () =>
  within(screen.getByRole("region", { name: "Current status" }));

describe("StatusControl", () => {
  it("offers a note only once a new status is picked", () => {
    fakeServer();
    renderPost();
    expect(screen.queryByLabelText(/Note for the timeline/)).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Update status",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "planned" },
    });
    expect(screen.getByLabelText(/Note for the timeline/)).toBeTruthy();
  });

  it("moves the post at once, and puts the note on its timeline", async () => {
    const server = fakeServer();
    renderPost();
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "planned" },
    });
    fireEvent.change(screen.getByLabelText(/Note for the timeline/), {
      target: { value: "  Next month.  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update status" }));
    expect(await current().findByText("Planned")).toBeTruthy();
    expect(await screen.findByText("Next month.")).toBeTruthy();
    expect(server.received).toEqual([
      { status: "planned", note: "Next month." },
    ]);
    expect(
      screen.getByRole("heading", { name: "Status history" })
    ).toBeTruthy();
  });

  it("puts the status back, with a toast, when the move fails", async () => {
    fakeServer({ failWrites: true });
    renderPost();
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "shipped" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update status" }));
    expect(await current().findByText("Shipped")).toBeTruthy();
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Something went wrong on our side. Try again."
      )
    );
    expect(await current().findByText("Open")).toBeTruthy();
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe(
      "open"
    );
  });
});

describe("StatusTimeline", () => {
  it("shows each change with who made it and their note", () => {
    render(
      <IntlProvider locale="en" messages={en} timeZone="UTC">
        <StatusTimeline
          timeline={[
            {
              id: 1,
              from: "open",
              to: "planned",
              note: "**Next** month.",
              by: { name: "" },
              createdAt: "2026-10-01T00:00:00.000Z",
            },
            {
              id: 2,
              from: "planned",
              to: "shipped",
              note: null,
              by: null,
              createdAt: "2026-10-02T00:00:00.000Z",
            },
          ]}
        />
      </IntlProvider>
    );
    const entries = screen.getAllByRole("listitem");
    expect(within(entries[0]!).getByText("Planned")).toBeTruthy();
    expect(within(entries[0]!).getByText("Next").tagName).toBe("STRONG");
    expect(within(entries[0]!).getByText("Anonymous")).toBeTruthy();
    expect(within(entries[1]!).getByText("Shipped")).toBeTruthy();
  });

  it("shows nothing for a post that never changed", () => {
    const { container } = render(
      <IntlProvider locale="en" messages={en} timeZone="UTC">
        <StatusTimeline timeline={[]} />
      </IntlProvider>
    );
    expect(container.innerHTML).toBe("");
  });
});
```

`src/features/subscriptions/subscribe-button.test.tsx`:

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
import { postQueryOptions } from "@/lib/posts";
import type { PostDetail } from "@/shared/posts";
import { SubscribeButton } from "./subscribe-button";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  toastError.mockReset();
});

const detail: PostDetail = {
  id: 7,
  ref: "7-dark-mode",
  title: "Dark mode",
  excerpt: "",
  status: "open",
  voteCount: 3,
  commentCount: 0,
  voted: false,
  board: { slug: "features", name: "Features" },
  author: { name: "Ayşe" },
  createdAt: "2026-10-01T00:00:00.000Z",
  body: "",
  workspace: { slug: "acme", name: "Acme", defaultLocale: "en" },
  canEdit: false,
  isTeam: false,
  pinned: null,
  subscribed: false,
  timeline: [],
  mergedInto: null,
};

function fakeServer({ failWrites = false } = {}) {
  const state = { subscribed: false, received: [] as unknown[] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const method = init?.method ?? "GET";
      await new Promise((resolve) => setTimeout(resolve, 20));
      const ok = (data: unknown) => Response.json({ success: true, data });
      if (url.pathname === "/api/posts/7" && method === "GET") {
        return ok({ ...detail, subscribed: state.subscribed });
      }
      if (url.pathname === "/api/posts/7/subscription" && method === "PUT") {
        const body = JSON.parse(String(init?.body));
        state.received.push(body);
        if (failWrites) {
          return Response.json(
            { success: false, code: "INTERNAL_ERROR", error: "boom" },
            { status: 500 }
          );
        }
        state.subscribed = body.subscribed;
        return ok({ subscribed: state.subscribed });
      }
      return Response.json(
        { success: false, code: "NOT_FOUND", error: "Not found" },
        { status: 404 }
      );
    })
  );
  return state;
}

function Harness() {
  const { data } = useQuery(postQueryOptions(7));
  return data ? <SubscribeButton post={data} /> : null;
}

function renderButton() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  qc.setQueryData(postQueryOptions(7).queryKey, detail);
  render(
    <IntlProvider locale="en" messages={en} timeZone="UTC">
      <QueryClientProvider client={qc}>
        <Harness />
      </QueryClientProvider>
    </IntlProvider>
  );
}

describe("SubscribeButton", () => {
  it("subscribes at once, and unsubscribes", async () => {
    const server = fakeServer();
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(
      await screen.findByRole("button", { name: "Unsubscribe" })
    ).toBeTruthy();
    await waitFor(() => expect(server.subscribed).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Unsubscribe" }));
    expect(
      await screen.findByRole("button", { name: "Subscribe" })
    ).toBeTruthy();
    await waitFor(() =>
      expect(server.received).toEqual([
        { subscribed: true },
        { subscribed: false },
      ])
    );
  });

  it("flips back, with a toast, when it fails", async () => {
    fakeServer({ failWrites: true });
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(
      await screen.findByRole("button", { name: "Unsubscribe" })
    ).toBeTruthy();
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(
      await screen.findByRole("button", { name: "Subscribe" })
    ).toBeTruthy();
  });
});
```

`src/features/merge/merge-panel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import type { PostDetail, PostSummary } from "@/shared/posts";
import { MergePanel } from "./merge-panel";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  toastError.mockReset();
});

const summary = (id: number, title: string): PostSummary => ({
  id,
  ref: `${id}-${title.toLowerCase().replace(/ /g, "-")}`,
  title,
  excerpt: "",
  status: "open",
  voteCount: 3,
  commentCount: 0,
  voted: false,
  board: { slug: "features", name: "Features" },
  author: { name: "Ayşe" },
  createdAt: "2026-10-01T00:00:00.000Z",
});

const detailOf = (post: PostSummary): PostDetail => ({
  ...post,
  body: "",
  workspace: { slug: "acme", name: "Acme", defaultLocale: "en" },
  canEdit: true,
  isTeam: true,
  pinned: null,
  subscribed: true,
  timeline: [],
  mergedInto: null,
});

const duplicate = detailOf(summary(7, "Dark theme"));
const original = summary(3, "Dark mode");

/** The feed search and the merge endpoint. */
function fakeServer({ refuse = false } = {}) {
  const state = { received: [] as unknown[] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const method = init?.method ?? "GET";
      await new Promise((resolve) => setTimeout(resolve, 20));
      const ok = (data: unknown) => Response.json({ success: true, data });
      if (url.pathname === "/api/workspaces/acme/posts" && method === "GET") {
        // The search finds the post itself too; the panel leaves it out.
        return ok({
          items: [original, summary(7, "Dark theme")],
          page: 1,
          hasMore: false,
        });
      }
      if (url.pathname === "/api/posts/7/merge" && method === "POST") {
        state.received.push(JSON.parse(String(init?.body)));
        if (refuse) {
          return Response.json(
            {
              success: false,
              code: "BAD_REQUEST",
              error: "Merge into an unmerged post of the same workspace",
              fields: { intoId: "MERGE_TARGET" },
            },
            { status: 400 }
          );
        }
        return ok({ ...detailOf(original), voteCount: 6 });
      }
      return Response.json(
        { success: false, code: "NOT_FOUND", error: "Not found" },
        { status: 404 }
      );
    })
  );
  return state;
}

function renderPanel(onMerged = vi.fn(async () => {})) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <IntlProvider locale="en" messages={en} timeZone="UTC">
      <QueryClientProvider client={qc}>
        <MergePanel post={duplicate} onMerged={onMerged} />
      </QueryClientProvider>
    </IntlProvider>
  );
  return { onMerged };
}

async function pickOriginal() {
  fireEvent.click(
    screen.getByRole("button", { name: "Merge into another request" })
  );
  fireEvent.change(screen.getByLabelText("Find the request to merge into"), {
    target: { value: "dark" },
  });
  fireEvent.click(
    await screen.findByRole("button", { name: "Merge into “Dark mode”" })
  );
}

describe("MergePanel", () => {
  it("finds the original, asks first, and goes there once merged", async () => {
    const server = fakeServer();
    const { onMerged } = renderPanel();
    await pickOriginal();
    expect(
      screen.getByText(/Its votes, comments and subscribers/)
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm merge" }));
    await waitFor(() => expect(onMerged).toHaveBeenCalledOnce());
    expect(onMerged.mock.calls[0]).toMatchObject([{ id: 3, voteCount: 6 }]);
    expect(server.received).toEqual([{ intoId: 3 }]);
  });

  it("leaves the post itself out of the search", async () => {
    fakeServer();
    renderPanel();
    fireEvent.click(
      screen.getByRole("button", { name: "Merge into another request" })
    );
    fireEvent.change(screen.getByLabelText("Find the request to merge into"), {
      target: { value: "dark" },
    });
    expect(
      await screen.findByRole("button", { name: "Merge into “Dark mode”" })
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Merge into “Dark theme”" })
    ).toBeNull();
  });

  it("says why when the original can't take the merge", async () => {
    fakeServer({ refuse: true });
    const { onMerged } = renderPanel();
    await pickOriginal();
    fireEvent.click(screen.getByRole("button", { name: "Confirm merge" }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Pick a request from this workspace that hasn't been merged."
      )
    );
    expect(onMerged).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test src/features/status/status-control.test.tsx src/features/subscriptions src/features/merge`

Expected: FAIL. `./status-control`, `./status-timeline`, `./subscribe-button` and `./merge-panel` don't exist.

- [ ] **Step 3: Add the catalog keys**

In `src/i18n/messages/en.json`, add three namespaces after `comments`:

```json
  "status": {
    "label": "Status",
    "update": "Update status",
    "noteLabel": "Note for the timeline (optional)",
    "noteHint": "Shown on the request's timeline, and in the email when it ships.",
    "timelineHeading": "Status history",
    "movedTo": "Moved to"
  },
  "subscription": {
    "subscribe": "Subscribe",
    "unsubscribe": "Unsubscribe",
    "hint": "Get an email when it ships."
  },
  "merge": {
    "open": "Merge into another request",
    "heading": "Merge this request",
    "searchLabel": "Find the request to merge into",
    "searchPlaceholder": "Search by title",
    "pick": "Merge into “{title}”",
    "noResults": "No other requests match.",
    "confirm": "Merge into “{title}”? Its votes, comments and subscribers move there, and this request's page sends people to it.",
    "confirmButton": "Confirm merge",
    "back": "Back",
    "cancel": "Cancel"
  },
```

In `src/i18n/messages/tr.json`, the same place:

```json
  "status": {
    "label": "Durum",
    "update": "Durumu güncelle",
    "noteLabel": "Zaman çizelgesi için not (isteğe bağlı)",
    "noteHint": "İsteğin zaman çizelgesinde ve yayına alındığında gönderilen e-postada görünür.",
    "timelineHeading": "Durum geçmişi",
    "movedTo": "Taşındığı durum:"
  },
  "subscription": {
    "subscribe": "Abone ol",
    "unsubscribe": "Abonelikten çık",
    "hint": "Yayına alındığında e-posta alın."
  },
  "merge": {
    "open": "Başka bir istekle birleştir",
    "heading": "Bu isteği birleştir",
    "searchLabel": "Birleştirilecek isteği bulun",
    "searchPlaceholder": "Başlığa göre arayın",
    "pick": "“{title}” ile birleştir",
    "noResults": "Eşleşen başka istek yok.",
    "confirm": "“{title}” ile birleştirilsin mi? Oyları, yorumları ve aboneleri oraya taşınır; bu isteğin sayfası da ziyaretçileri oraya yönlendirir.",
    "confirmButton": "Birleştirmeyi onayla",
    "back": "Geri",
    "cancel": "Vazgeç"
  },
```

- [ ] **Step 4: Add the tools**

`src/features/status/status-control.tsx`:

```tsx
import { useEffect, useId, useState } from "react";
import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PostDetail } from "@/shared/posts";
import { POST_STATUSES, type PostStatus } from "@/shared/status";
import { useChangeStatus } from "./use-change-status";

/**
 * The team's status picker on a post's page. Picking a new status offers a
 * note for the timeline. The change shows at once and rolls back with a
 * toast if it fails.
 */
export function StatusControl({ post }: { post: PostDetail }) {
  const t = useTranslations("status");
  const tStatuses = useTranslations("statuses");
  const change = useChangeStatus();
  const id = useId();
  const [status, setStatus] = useState<PostStatus>(post.status);
  const [note, setNote] = useState("");
  // Follows a change made elsewhere: the roadmap, or a refetch.
  useEffect(() => setStatus(post.status), [post.status]);
  const changed = status !== post.status;
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = note.trim();
        change.mutate(
          {
            post,
            workspace: post.workspace.slug,
            status,
            ...(trimmed ? { note: trimmed } : {}),
          },
          { onSuccess: () => setNote("") }
        );
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-status`}>{t("label")}</Label>
          <select
            id={`${id}-status`}
            className="h-8 rounded-md border bg-transparent px-2 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value as PostStatus)}
          >
            {POST_STATUSES.map((option) => (
              <option key={option} value={option}>
                {tStatuses(option)}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" size="sm" disabled={!changed}>
          {t("update")}
        </Button>
      </div>
      {changed && (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-note`}>{t("noteLabel")}</Label>
          <Textarea
            id={`${id}-note`}
            rows={2}
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <p className="text-muted-foreground text-xs">{t("noteHint")}</p>
        </div>
      )}
    </form>
  );
}
```

`src/features/status/status-timeline.tsx`:

```tsx
import { useFormatter, useNow, useTranslations } from "use-intl";
import { Markdown } from "@/components/markdown";
import { StatusBadge } from "@/components/status-badge";
import { AuthorName } from "@/features/posts/author-name";
import type { StatusChangeView } from "@/shared/posts";

/** A post's status changes, oldest first, with the team's notes. */
export function StatusTimeline({ timeline }: { timeline: StatusChangeView[] }) {
  const t = useTranslations("status");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  if (timeline.length === 0) return null;
  return (
    <section aria-labelledby="timeline-heading" className="flex flex-col gap-3">
      <h2 id="timeline-heading" className="font-semibold text-lg">
        {t("timelineHeading")}
      </h2>
      <ol className="flex flex-col gap-3">
        {timeline.map((entry) => (
          <li key={entry.id} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
              <span className="sr-only">{t("movedTo")}</span>
              <StatusBadge status={entry.to} />
              <span aria-hidden="true">·</span>
              <AuthorName author={entry.by} />
              <span aria-hidden="true">·</span>
              <time dateTime={entry.createdAt}>
                {format.relativeTime(new Date(entry.createdAt), now)}
              </time>
            </div>
            {entry.note && <Markdown>{entry.note}</Markdown>}
          </li>
        ))}
      </ol>
    </section>
  );
}
```

`src/features/subscriptions/subscribe-button.tsx`:

```tsx
import { Bell, BellOff } from "lucide-react";
import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import type { PostDetail } from "@/shared/posts";
import { useSubscription } from "./use-subscription";

/** Follows or unfollows a post: followers get an email when it ships. */
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
      >
        {post.subscribed ? (
          <BellOff aria-hidden="true" />
        ) : (
          <Bell aria-hidden="true" />
        )}
        {post.subscribed ? t("unsubscribe") : t("subscribe")}
      </Button>
      {!post.subscribed && (
        <span className="text-muted-foreground text-xs">{t("hint")}</span>
      )}
    </div>
  );
}
```

`src/features/merge/merge-panel.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { apiErrorKey, fieldErrorKey } from "@/lib/error-text";
import { commentKeys, postKeys } from "@/lib/keys";
import { feedQueryOptions, mergePost } from "@/lib/posts";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import type { PostDetail, PostSummary } from "@/shared/posts";

type Props = {
  post: PostDetail;
  /** Goes to the post it was merged into. The panel tidies the cache after. */
  onMerged: (target: PostDetail) => Promise<unknown> | undefined;
};

/**
 * The team's merge tool: find the original by its title, confirm, and the
 * duplicate's votes, comments and subscribers move there.
 */
export function MergePanel({ post, onMerged }: Props) {
  const t = useTranslations("merge");
  const tErrors = useTranslations("errors");
  const tFields = useTranslations("fieldErrors");
  const qc = useQueryClient();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<PostSummary | null>(null);
  const q = useDebouncedValue(query.trim(), 300);
  // The feed's search: every status, merged posts left out.
  const results = useQuery({
    ...feedQueryOptions(post.workspace.slug, { sort: "top", page: 1, q }),
    enabled: open && q.length >= 2,
  });
  const merge = useMutation({
    mutationFn: (intoId: number) => mergePost(post.id, intoId),
    networkMode: "always",
  });
  const candidates = (results.data?.items ?? [])
    .filter((item) => item.id !== post.id)
    .slice(0, 5);

  const confirm = (into: PostSummary) =>
    merge.mutate(into.id, {
      onSuccess: async (detail) => {
        qc.setQueryData(postKeys.detail(detail.id), detail);
        // Leave first: dropping this page's post under it would refetch it.
        await onMerged(detail);
        qc.removeQueries({ queryKey: postKeys.detail(post.id), exact: true });
        void qc.invalidateQueries({ queryKey: postKeys.all });
        void qc.invalidateQueries({ queryKey: commentKeys.post(detail.id) });
      },
      onError: (error) => {
        const field =
          error instanceof ApiError && error.fields?.intoId
            ? fieldErrorKey(error.fields.intoId)
            : null;
        toast.error(field ? tFields(field) : tErrors(apiErrorKey(error)));
      },
    });

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => setOpen(true)}
      >
        {t("open")}
      </Button>
    );
  }
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="flex flex-col gap-3 rounded-lg border p-4"
    >
      <h2 id={`${id}-heading`} className="font-medium">
        {t("heading")}
      </h2>
      {target ? (
        <>
          <p className="text-sm">{t("confirm", { title: target.title })}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={merge.isPending}
              onClick={() => confirm(target)}
            >
              {t("confirmButton")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setTarget(null)}
            >
              {t("back")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-search`}>{t("searchLabel")}</Label>
            <Input
              id={`${id}-search`}
              type="search"
              placeholder={t("searchPlaceholder")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          {q.length >= 2 && !results.isFetching && candidates.length === 0 && (
            <p className="text-muted-foreground text-sm">{t("noResults")}</p>
          )}
          {candidates.length > 0 && (
            <ul className="flex flex-col gap-1">
              {candidates.map((item) => (
                <li key={item.id}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => setTarget(item)}
                  >
                    <span className="truncate">
                      {t("pick", { title: item.title })}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => {
              setOpen(false);
              setQuery("");
            }}
          >
            {t("cancel")}
          </Button>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Put them on the post page**

In `src/routes/p/$ref.tsx`, import them in alphabetical place:

```tsx
import { MergePanel } from "@/features/merge/merge-panel";
import { StatusControl } from "@/features/status/status-control";
import { StatusTimeline } from "@/features/status/status-timeline";
import { SubscribeButton } from "@/features/subscriptions/subscribe-button";
```

In the loader, before the stale-slug check, send a merged post's page to the original:

```tsx
    // A merged post's page is the one it was merged into.
    if (post.mergedInto) {
      throw redirect({
        to: "/p/$ref",
        params: { ref: post.mergedInto.ref },
        replace: true,
      });
    }
```

In `PostPage`, after `const [editing, setEditing] = useState(false);`:

```tsx
  const navigate = useNavigate();
  const signedIn = Boolean(me.data?.user);
```

Replace the vote button's condition `me.data?.user ?` with `signedIn ?`. Then, after the closing `</article>` and before `<CommentThread post={post} />`:

```tsx
      {(signedIn || post.isTeam) && (
        <div className="flex flex-col gap-4">
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
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun run test src/features/status src/features/subscriptions src/features/merge src/i18n`

Expected: PASS:
- 5 in `status-control.test.tsx`
- 8 in `status-cache.test.ts`
- 2 in `subscribe-button.test.tsx`
- 3 in `merge-panel.test.tsx`
- the catalog tests

Then run: `bun run test`

Expected: PASS. 57 test files, 441 tests.

- [ ] **Step 7: Commit**

```bash
bun run typecheck
bun run check:fix && bun run check
bun run build
git add src
git commit -m "feat: status with a note, the timeline, following and merging on the post page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the typecheck, Biome and the build pass.

---

### Task 10: The roadmap page, with drag-and-drop for the team

**Files:**
- Modify: `package.json`, `bun.lock` (`@dnd-kit/core`)
- Modify: `src/i18n/messages/en.json` and `src/i18n/messages/tr.json` (the `roadmap` namespace, `workspace.roadmap`)
- Create: `src/features/roadmap/keyboard.ts` (`columnKeyboardCoordinates`)
- Create: `src/features/roadmap/roadmap-board.tsx` (`RoadmapBoard`); Test: `src/features/roadmap/roadmap-board.test.tsx`
- Create: `src/routes/$ws/roadmap.tsx`
- Modify: `src/routes/$ws.tsx` (the nav link), `src/routeTree.gen.ts` (regenerated by the build)

**Interfaces:**
- Consumes:
  - From Task 8: `useChangeStatus`, `roadmapQueryOptions` and `postKeys.roadmap`.
  - From Task 6: the roadmap route.
  - From Phase 2: `VoteButton`, `SignInToVote` and `meQueryOptions`.
- Produces:
  - `RoadmapBoard({ workspace, roadmap, isTeam, signedIn })`. The team gets a handle on each card. Arrow keys move a picked-up card one column at a time, and a drop on another column changes the status.
  - `columnKeyboardCoordinates: KeyboardCoordinateGetter`.
  - The route `/$ws/roadmap`, and a "Roadmap" link in the workspace header.
  - Catalog keys:
    - `roadmap.*`: empty, shippedHint, loading, loadFailed, move, instructions, pickedUp, over, dropped, stayed
    - `workspace.roadmap`

- [ ] **Step 1: Write the failing tests**

`src/features/roadmap/roadmap-board.test.tsx`. jsdom lays nothing out, and dnd-kit finds columns by their boxes, so the test gives columns and cards boxes. Its keyboard steps then run dnd-kit's real sensor and the plan's arrow-key handler:

```tsx
// @vitest-environment jsdom
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { IntlProvider } from "use-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";
import { roadmapQueryOptions } from "@/lib/posts";
import type { PostSummary, Roadmap } from "@/shared/posts";
import { ROADMAP_STATUSES, type RoadmapStatus } from "@/shared/status";
import { RoadmapBoard } from "./roadmap-board";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

/**
 * jsdom lays nothing out, and dnd-kit finds columns by their boxes: each
 * column gets a box side by side, and anything inside it a card's box near
 * its top.
 */
function layout(this: HTMLElement) {
  const column = this.closest<HTMLElement>("[data-roadmap-column]");
  const index = column
    ? ROADMAP_STATUSES.indexOf(column.dataset.roadmapColumn as RoadmapStatus)
    : -1;
  const [left, top, width, height] =
    index === -1
      ? [0, 0, 0, 0]
      : this === column
        ? [index * 300, 0, 280, 600]
        : [index * 300 + 10, 60, 260, 80];
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    layout
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  toastError.mockReset();
});

const card = (
  id: number,
  title: string,
  status: RoadmapStatus,
  voteCount = 1
): PostSummary => ({
  id,
  ref: `${id}-${title.toLowerCase().replace(/ /g, "-")}`,
  title,
  excerpt: "",
  status,
  voteCount,
  commentCount: 0,
  voted: false,
  board: { slug: "features", name: "Features" },
  author: { name: "Ayşe" },
  createdAt: "2026-10-01T00:00:00.000Z",
});

const startingRoadmap = (): Roadmap => ({
  planned: [card(1, "Dark mode", "planned", 5), card(2, "Export", "planned")],
  in_progress: [card(3, "Faster search", "in_progress", 3)],
  shipped: [],
});

/** The roadmap's API, keeping moves, answering after 20 ms. */
function fakeServer({ failWrites = false } = {}) {
  const state = { roadmap: startingRoadmap(), received: [] as unknown[] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const method = init?.method ?? "GET";
      await new Promise((resolve) => setTimeout(resolve, 20));
      const ok = (data: unknown) => Response.json({ success: true, data });
      if (url.pathname === "/api/workspaces/acme/roadmap") {
        return ok(state.roadmap);
      }
      const status = /^\/api\/posts\/(\d+)\/status$/.exec(url.pathname);
      if (status && method === "PATCH") {
        const body = JSON.parse(String(init?.body));
        state.received.push({ id: Number(status[1]), ...body });
        if (failWrites) {
          return Response.json(
            { success: false, code: "INTERNAL_ERROR", error: "boom" },
            { status: 500 }
          );
        }
        const moved = ROADMAP_STATUSES.flatMap(
          (column) => state.roadmap[column]
        ).find((post) => post.id === Number(status[1]));
        for (const column of ROADMAP_STATUSES) {
          state.roadmap[column] = state.roadmap[column].filter(
            (post) => post.id !== moved?.id
          );
        }
        if (moved) {
          state.roadmap[body.status as RoadmapStatus].unshift({
            ...moved,
            status: body.status,
          });
        }
        return ok({ ...moved, status: body.status });
      }
      return Response.json(
        { success: false, code: "NOT_FOUND", error: "Not found" },
        { status: 404 }
      );
    })
  );
  return state;
}

function renderBoard({ isTeam }: { isTeam: boolean }) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  qc.setQueryData(roadmapQueryOptions("acme").queryKey, startingRoadmap());
  function Board() {
    const { data } = useQuery(roadmapQueryOptions("acme"));
    return data ? (
      <RoadmapBoard workspace="acme" roadmap={data} isTeam={isTeam} signedIn />
    ) : null;
  }
  const router = createRouter({
    routeTree: createRootRoute({ component: Board }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <IntlProvider locale="en" messages={en} timeZone="UTC">
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </IntlProvider>
  );
}

const column = (name: string) =>
  within(screen.getByRole("region", { name: new RegExp(`^${name}`) }));

/** Picks up a card by its handle, presses the keys, and drops it. */
async function moveWithKeys(title: string, keys: string[]) {
  const handle = await screen.findByRole("button", {
    name: `Move “${title}”`,
  });
  handle.focus();
  fireEvent.keyDown(handle, { code: "Space" });
  // The sensor listens for the next keys from the following tick.
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  for (const code of keys) fireEvent.keyDown(document, { code });
  fireEvent.keyDown(document, { code: "Space" });
}

describe("RoadmapBoard", () => {
  it("shows each column with its cards, and no handles to visitors", async () => {
    fakeServer();
    renderBoard({ isTeam: false });
    // The router renders on the next tick.
    await screen.findByRole("region", { name: /^Planned/ });
    expect(column("Planned").getByText("Dark mode")).toBeTruthy();
    expect(column("In progress").getByText("Faster search")).toBeTruthy();
    expect(column("Shipped").getByText("Nothing here yet.")).toBeTruthy();
    expect(column("Shipped").getByText("Last 30 days")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Move/ })).toBeNull();
  });

  it("lets the team move a card a column over with the keyboard", async () => {
    const server = fakeServer();
    renderBoard({ isTeam: true });
    await moveWithKeys("Dark mode", ["ArrowRight"]);
    expect(await column("In progress").findByText("Dark mode")).toBeTruthy();
    expect(column("Planned").queryByText("Dark mode")).toBeNull();
    await waitFor(() =>
      expect(server.received).toEqual([{ id: 1, status: "in_progress" }])
    );
    expect(
      await screen.findByText("“Dark mode” moved to In progress.")
    ).toBeTruthy();
  });

  it("moves two columns over with two presses", async () => {
    const server = fakeServer();
    renderBoard({ isTeam: true });
    await moveWithKeys("Export", ["ArrowRight", "ArrowRight"]);
    expect(await column("Shipped").findByText("Export")).toBeTruthy();
    await waitFor(() =>
      expect(server.received).toEqual([{ id: 2, status: "shipped" }])
    );
  });

  it("puts the card back, with a toast, when the move fails", async () => {
    fakeServer({ failWrites: true });
    renderBoard({ isTeam: true });
    await moveWithKeys("Dark mode", ["ArrowRight"]);
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Something went wrong on our side. Try again."
      )
    );
    expect(await column("Planned").findByText("Dark mode")).toBeTruthy();
    expect(column("In progress").queryByText("Dark mode")).toBeNull();
  });

  it("sends nothing when a card is dropped where it was", async () => {
    const server = fakeServer();
    renderBoard({ isTeam: true });
    await moveWithKeys("Dark mode", []);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(server.received).toEqual([]);
    expect(column("Planned").getByText("Dark mode")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test src/features/roadmap`

Expected: FAIL. `./roadmap-board` doesn't exist.

- [ ] **Step 3: Add dnd-kit and the catalog keys**

```bash
bun add @dnd-kit/core@^6.3.1
```

Expected: `package.json` lists `"@dnd-kit/core": "^6.3.1"`.

In `src/i18n/messages/en.json`, add after `merge`:

```json
  "roadmap": {
    "empty": "Nothing here yet.",
    "shippedHint": "Last 30 days",
    "loading": "Loading the roadmap…",
    "loadFailed": "Couldn't load the roadmap. Reload the page to try again.",
    "move": "Move “{title}”",
    "instructions": "To move a request, press space or enter, pick a column with the arrow keys, then press space or enter again. Escape cancels.",
    "pickedUp": "Picked up “{title}”.",
    "over": "“{title}” is over {column}.",
    "dropped": "“{title}” moved to {column}.",
    "stayed": "“{title}” stayed where it was."
  },
```

And in `workspace`, after `requests`:

```json
    "roadmap": "Roadmap",
```

In `src/i18n/messages/tr.json`, the same places:

```json
  "roadmap": {
    "empty": "Henüz bir şey yok.",
    "shippedHint": "Son 30 gün",
    "loading": "Yol haritası yükleniyor…",
    "loadFailed": "Yol haritası yüklenemedi. Tekrar denemek için sayfayı yenileyin.",
    "move": "“{title}” isteğini taşı",
    "instructions": "Bir isteği taşımak için boşluk veya enter tuşuna basın, ok tuşlarıyla bir sütun seçin, sonra yeniden boşluk veya enter tuşuna basın. Escape iptal eder.",
    "pickedUp": "“{title}” alındı.",
    "over": "“{title}”, {column} sütununun üzerinde.",
    "dropped": "“{title}”, {column} sütununa taşındı.",
    "stayed": "“{title}” yerinde kaldı."
  },
```

```json
    "roadmap": "Yol haritası",
```

- [ ] **Step 4: Add the board and the page**

`src/features/roadmap/keyboard.ts`:

```ts
import type { KeyboardCoordinateGetter } from "@dnd-kit/core";

const DIRECTIONS: Record<string, [number, number]> = {
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0],
  ArrowDown: [0, 1],
  ArrowUp: [0, -1],
};

/**
 * The arrow keys move a picked-up card a whole column at a time: left and
 * right when the columns sit side by side, up and down when a narrow screen
 * stacks them. It returns where the card's top-left corner goes: centered
 * near the top of the nearest column that lies that way.
 */
export const columnKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { context: { collisionRect, droppableRects, droppableContainers } }
) => {
  const direction = DIRECTIONS[event.code];
  if (!direction || !collisionRect) return undefined;
  event.preventDefault();
  const from = {
    x: collisionRect.left + collisionRect.width / 2,
    y: collisionRect.top + collisionRect.height / 2,
  };
  let best: { left: number; top: number; distance: number } | undefined;
  for (const container of droppableContainers.getEnabled()) {
    const rect = droppableRects.get(container.id);
    if (!rect) continue;
    const left = rect.left + (rect.width - collisionRect.width) / 2;
    const top = rect.top + Math.min(16, rect.height / 4);
    const dx = left + collisionRect.width / 2 - from.x;
    const dy = top + collisionRect.height / 2 - from.y;
    // Only columns ahead in the arrow's direction count.
    if (dx * direction[0] + dy * direction[1] <= 1) continue;
    const distance = Math.hypot(dx, dy);
    if (!best || distance < best.distance) best = { left, top, distance };
  }
  return best && { x: best.left, y: best.top };
};
```

`src/features/roadmap/roadmap-board.tsx`:

```tsx
import {
  type Announcements,
  type CollisionDetection,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  type UniqueIdentifier,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Link } from "@tanstack/react-router";
import { GripVertical } from "lucide-react";
import { useTranslations } from "use-intl";
import { useChangeStatus } from "@/features/status/use-change-status";
import { SignInToVote, VoteButton } from "@/features/votes/vote-button";
import { cn } from "@/lib/utils";
import type { PostSummary, Roadmap } from "@/shared/posts";
import {
  isRoadmapStatus,
  type PostStatus,
  ROADMAP_STATUSES,
  type RoadmapStatus,
} from "@/shared/status";
import { columnKeyboardCoordinates } from "./keyboard";

type Props = {
  workspace: string;
  roadmap: Roadmap;
  /** The team drags cards between columns; everyone else reads and votes. */
  isTeam: boolean;
  signedIn: boolean;
};

// The pointer's column when there is a pointer; the keyboard has none, and
// moves the card over a column instead.
const columnUnder: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  return underPointer.length > 0 ? underPointer : rectIntersection(args);
};

const statusOf = (id: UniqueIdentifier | undefined) =>
  typeof id === "string" && isRoadmapStatus(id as PostStatus)
    ? (id as RoadmapStatus)
    : null;

/**
 * The public roadmap: planned, in progress, and recently shipped. The team
 * moves a request by dragging its card's handle to another column, with a
 * pointer or the keyboard; the move shows at once and rolls back with a
 * toast if it fails.
 */
export function RoadmapBoard({ workspace, roadmap, isTeam, signedIn }: Props) {
  const t = useTranslations("roadmap");
  const tStatuses = useTranslations("statuses");
  const move = useChangeStatus();
  const sensors = useSensors(
    // A few pixels of travel before a drag starts, so clicks still click.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnKeyboardCoordinates })
  );
  const find = (id: UniqueIdentifier) =>
    ROADMAP_STATUSES.flatMap((status) => roadmap[status]).find(
      (post) => post.id === id
    );
  const title = (id: UniqueIdentifier) => find(id)?.title ?? "";
  const column = (id: UniqueIdentifier | undefined) => {
    const status = statusOf(id);
    return status ? tStatuses(status) : "";
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => t("pickedUp", { title: title(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? t("over", { title: title(active.id), column: column(over.id) })
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? t("dropped", { title: title(active.id), column: column(over.id) })
        : t("stayed", { title: title(active.id) }),
    onDragCancel: ({ active }) => t("stayed", { title: title(active.id) }),
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={columnUnder}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t("instructions") },
      }}
      onDragEnd={({ active, over }) => {
        const post = find(active.id);
        const status = statusOf(over?.id);
        if (!post || !status || status === post.status) return;
        move.mutate({ post, workspace, status });
      }}
    >
      <div className="grid gap-4 md:grid-cols-3">
        {ROADMAP_STATUSES.map((status) => (
          <RoadmapColumn
            key={status}
            status={status}
            posts={roadmap[status]}
            isTeam={isTeam}
            signedIn={signedIn}
          />
        ))}
      </div>
    </DndContext>
  );
}

function RoadmapColumn({
  status,
  posts,
  isTeam,
  signedIn,
}: {
  status: RoadmapStatus;
  posts: PostSummary[];
  isTeam: boolean;
  signedIn: boolean;
}) {
  const t = useTranslations("roadmap");
  const tStatuses = useTranslations("statuses");
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    disabled: !isTeam,
  });
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={`roadmap-${status}`}
      data-roadmap-column={status}
      className={cn(
        "flex min-h-40 flex-col gap-3 rounded-lg bg-muted/50 p-3",
        isOver && "ring-2 ring-ring"
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={`roadmap-${status}`} className="font-semibold">
          {tStatuses(status)}
        </h2>
        <span className="text-muted-foreground text-xs tabular-nums">
          {posts.length}
        </span>
      </div>
      {status === "shipped" && (
        <p className="-mt-2 text-muted-foreground text-xs">
          {t("shippedHint")}
        </p>
      )}
      {posts.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {posts.map((post) => (
            <RoadmapCard
              key={post.id}
              post={post}
              isTeam={isTeam}
              signedIn={signedIn}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function RoadmapCard({
  post,
  isTeam,
  signedIn,
}: {
  post: PostSummary;
  isTeam: boolean;
  signedIn: boolean;
}) {
  const t = useTranslations("roadmap");
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id: post.id, disabled: !isTeam });
  return (
    <li
      ref={setNodeRef}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
      className={cn(
        "flex items-start gap-3 rounded-lg border bg-background p-3",
        isDragging && "relative z-10 shadow-lg"
      )}
    >
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
          className="font-medium text-sm hover:underline"
        >
          {post.title}
        </Link>
        <span className="text-muted-foreground text-xs">{post.board.name}</span>
      </div>
      {isTeam && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={t("move", { title: post.title })}
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        >
          <GripVertical aria-hidden="true" className="size-4" />
        </button>
      )}
    </li>
  );
}
```

`src/routes/$ws/roadmap.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslations } from "use-intl";
import { RoadmapBoard } from "@/features/roadmap/roadmap-board";
import { roadmapQueryOptions } from "@/lib/posts";
import { meQueryOptions } from "@/lib/session";

export const Route = createFileRoute("/$ws/roadmap")({
  loader: ({ context, params }) => {
    // Starts loading with the route instead of after it renders.
    void context.queryClient.prefetchQuery(roadmapQueryOptions(params.ws));
  },
  component: RoadmapPage,
});

function RoadmapPage() {
  const { ws } = Route.useParams();
  const t = useTranslations("roadmap");
  const me = useQuery(meQueryOptions);
  const roadmap = useQuery(roadmapQueryOptions(ws));
  const isTeam = me.data?.workspaces.some((w) => w.slug === ws) ?? false;
  if (roadmap.isPending) {
    return <p className="text-muted-foreground text-sm">{t("loading")}</p>;
  }
  if (roadmap.isError) {
    return (
      <p className="text-destructive text-sm" role="alert">
        {t("loadFailed")}
      </p>
    );
  }
  return (
    <RoadmapBoard
      workspace={ws}
      roadmap={roadmap.data}
      isTeam={isTeam}
      signedIn={Boolean(me.data?.user)}
    />
  );
}
```

In `src/routes/$ws.tsx`, add the link after the "Requests" link:

```tsx
          <Link
            to="/$ws/roadmap"
            params={{ ws }}
            activeProps={{ className: "font-semibold" }}
          >
            {t("roadmap")}
          </Link>
```

Run `bun run build` once. The router plugin adds the route to `src/routeTree.gen.ts`, which the typecheck needs, and CI checks that the file is committed.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test src/features/roadmap src/i18n`

Expected: PASS: 5 board tests and the catalog tests.

Then run: `bun run test`

Expected: PASS. 58 test files, 446 tests.

- [ ] **Step 6: Commit**

```bash
bun run typecheck
bun run check:fix && bun run check
bun run build
git add package.json bun.lock src
git commit -m "feat: the roadmap page, with drag-and-drop by pointer or keyboard for the team" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the typecheck, Biome and the build pass, and `git status` shows nothing left over.

---

### Task 11: Click through Phase 4 in both languages

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the README's notes on the team tools.

- [ ] **Step 1: Click through it**

Run `bun run db:migrate`, then `bun run dev`, and open http://localhost:5173. Sign-in codes and emails print in the terminal. A headless browser, Playwright for example, works too. The checks:

1. **Setup:** sign in as A with a new email. Create a workspace with English as its default and a board "Features". As "Ayşe", post "Dark mode" and "Export to CSV".
2. **Following:**
   - As B, in another browser or a private window, vote on "Dark mode". Its page now offers "Unsubscribe".
   - Press it, and it offers "Subscribe". Press that, and it's "Unsubscribe" again.
   - As C, comment on "Dark mode". C follows it too.
3. **A status with a note:**
   - As A, on "Dark mode", pick Planned. A note field appears. Write "Next month." and press **Update status**.
   - The badge reads Planned at once, and "Status history" shows Planned · Ayşe · now with "Next month.".
   - The feed card reads Planned.
4. **The roadmap, signed out:** it shows Planned (with "Dark mode"), In progress, and Shipped with "Last 30 days". There are no drag handles.
5. **A keyboard drag:**
   - As A, on the roadmap, focus "Move “Dark mode”". Press Space, then the right arrow, then Space.
   - The card moves to In progress at once, and stays there after a reload.
6. **A pointer drag to Shipped** (the phase's done-when):
   - Drag "Dark mode" by its handle to Shipped. The card moves at once.
   - Then:

     ```bash
     psql -h 127.0.0.1 -d pano -c "select u.email, o.sent_at from email_outbox o join \"user\" u on u.id = o.user_id where o.post_id = (select id from posts where title = 'Dark mode' order by id desc limit 1)"
     ```

     It lists exactly B and C, unsent. A shipped it, so A gets nothing.
7. **The cron sends them:**
   - Run `curl 'http://localhost:5173/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*'`. The terminal prints a `[mail] shipped notice for …` line for B and for C, then `[outbox] sent 2, failed 0`.
   - The query above now shows both sent. Running the `curl` again prints nothing new.
8. **A move that fails:**
   - Go offline (DevTools → Network → Offline). With Playwright, make `PATCH /api/posts/*/status` fail with `route.abort()`.
   - Drag a card to another column. It moves, then returns to its column, with "Couldn't reach Pano. Check your connection and try again."
9. **A merge:**
   - As A, open "Export to CSV" and press **Merge into another request**. Search "dark", press **Merge into “Dark mode”**, read the warning, and confirm.
   - You land on "Dark mode", and its vote count includes Export's voters, each once.
   - The old address of "Export to CSV" redirects to "Dark mode", and the feed no longer lists it.
10. **Turkish:** press **TR**.
    - The roadmap reads Planlandı, Yapılıyor and Yayında, with "Son 30 gün".
    - The post page reads "Durum geçmişi", "Durumu güncelle", "Abonelikten çık" and "Başka bir istekle birleştir".
11. **The counts match the database:**

    ```bash
    psql -h 127.0.0.1 -d pano -c "select p.title, p.vote_count, (select count(*) from votes v where v.post_id = p.id) as votes from posts p order by p.id desc limit 2"
    ```

    Each post's two numbers are equal. The merged "Export to CSV" has 0 and 0.

If you can't drive a browser, hand these checks to your human partner, and record in the ledger that they confirmed them.

- [ ] **Step 2: Note the team tools in the README**

In `README.md`, in "Layout and rules", replace the `worker/index.ts` bullet with:

```markdown
- `worker/index.ts`: the Workers entry. Workers-only code goes here: `/p/*`
  link previews, and the cron trigger, which runs `worker/cron.ts` every five
  minutes to send queued emails. In local dev,
  `curl 'http://localhost:5173/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*'`
  runs it, and the emails print in the terminal.
```

Append to the `worker/services/` bullet:

```markdown
  `status.ts` moves a post and, on Shipped, queues one email per subscriber
  in the same transaction (`outbox.ts`). `merge.ts` locks both posts and
  moves votes, subscriptions and comments at once.
```

And add a bullet after the `src/features/comments/` one:

```markdown
- `src/features/roadmap/`: the public roadmap. The team drags cards between
  columns with dnd-kit, and the arrow keys move a picked-up card a column at
  a time.
```

- [ ] **Step 3: Run everything and commit**

```bash
bun run typecheck
bun run check
bun run test
bun run build
git add README.md
git commit -m "docs: the team tools in the README" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: everything passes. 58 test files, 446 tests.

---

## Phase 4 done when

- [ ] Moving a card to Shipped queues one email per subscriber:
  - Task 4's "queues one per subscriber" test.
  - Task 11, checks 6 and 7.
- [ ] The merge tests pass:
  - Votes, comments and subscribers move.
  - Someone who voted on both counts once.
  - A vote racing the merge never lands on the merged post.
  - (Task 5.)
- [ ] The team drags cards across the roadmap with a pointer and with the keyboard (Task 10's tests; Task 11, checks 5 and 6).
- [ ] `bun run typecheck`, `bun run check`, `bun run test` (58 files, 446 tests) and `bun run build` all pass.
- [ ] The CI sequence passes locally against a fresh database (Phase 0's Task 5, Step 3).
