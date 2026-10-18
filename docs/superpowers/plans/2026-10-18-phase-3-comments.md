# Phase 3: Comments — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People discuss each request in threads. They comment and reply up to three levels deep, and the team's comments carry a "Team" badge. The team pins one comment above the thread, and authors or the team delete comments without breaking the thread. A new comment shows at once and disappears again if saving fails, and every comment count stays equal to the comments it counts.

**Architecture:**
- **Data:**
  - A `comments` table with `parent_id`, `depth` (0–3), `is_official`, `reply_count`, and `deleted_at` for soft deletes.
  - On `posts`: `comment_count` and `pinned_comment_id`.
- **Writes:**
  - Each runs in one transaction that locks the post row first, as votes do, and refuses a merged post.
  - The counts (`comment_count`, and the parent's `reply_count`) move by what actually changed.
  - Deleting sets `deleted_at` and wipes the body. Repeating a delete changes nothing.
- **Reads:** keyset paging on the comment id.
  - `GET /api/posts/:id/comments` lists top-level comments newest first, each with its latest two replies.
  - `GET /api/comments/:id/replies` pages one comment's replies the same way.
- **Pinning:** `PUT /api/posts/:id/pin`, and the post's detail carries the pinned comment.
- **Client:**
  - An infinite query for the thread, plus one for each reply list a person opens, all under one key prefix per post.
  - Adding, deleting and pinning patch every cached copy through Phase 2's `applyOptimistic`, and roll back on failure with a toast.
  - Once the last change to a post settles, its comments and its count are fetched again.

**Tech Stack:** the Phase 0–2 stack. No new packages.

**Spec:** `docs/superpowers/specs/2026-10-16-pano-design.md`. This plan covers its "Build order → 3. Comments".
- Subscribing commenters needs the subscriptions table, which arrives with Phase 4.
- So does moving comments in a merge, which comes with Phase 4's merge service. This phase already makes comments refuse merged posts.

**Verified in a throwaway spike (2026-10-18):**
- **Drizzle 0.45 / drizzle-kit 0.31:** `comments.ts` and `posts.ts` reference each other (`comments.post_id` → posts, `posts.pinned_comment_id` → comments). That generates the SQL shown in Task 1, and `tsc -b` passes with `(): AnyPgColumn =>` on the references.
- **Postgres 17:**
  - Deleting a post whose pinned comment has replies removes everything. The cascade and the `set null` on `pinned_comment_id` don't collide.
  - `select … for update` accepts an `exists (…)` team check in its select list.
- **Reply previews:** the latest two replies of every listed comment come from one query. It's a `row_number() over (partition by parent_id order by id desc)` subquery, joined back to `comments`.
- **TanStack Query 5.104:** refetching an infinite query fetches the first page with its stored param. It then computes each next param from the freshly fetched pages, so keyset cursors stay consistent when comments arrive in between.
- **The whole plan, applied once on a throwaway branch** (since deleted, with the test database reset):
  - Tasks 1–9's code typechecks and passes Biome and the build.
  - The generated migration matched Task 1's SQL.
  - The suite passed with this plan's counts: 44 files, 354 tests.
  - The comment component tests passed six runs in a row.
  - It caught one test bug, fixed here: a controlled textarea's text matches `getByText`, so Task 9's reply test looks for the comment's `<p>`.

**Decided in this plan** (the spec leaves these open):
1. **Order and paging:**
   - Top-level comments are newest first, under the comment box.
   - Replies read oldest first. Each listed comment brings its latest two, and "Show N earlier replies" loads the ones before.
   - So a new reply always lands at the end of what's shown, and paging back never repeats or skips one.
   - Paging goes by id, which follows insertion order, so the spec's index on `(post_id, parent_id, created_at)` becomes `(post_id, parent_id, id)`.
2. **Depth:** a reply to a depth-3 comment goes beside it, under the same parent. It doesn't fail or nest deeper.
3. **Deleting:**
   - It's soft, and it wipes the words.
   - The placeholder ("Comment deleted") keeps its replies.
   - `comment_count` counts comments that aren't deleted. `reply_count` counts every direct reply, because placeholders stay in the thread.
   - The API still accepts a reply to a deleted comment; the UI just doesn't offer one.
4. **Team badge:** stored when the comment is written (`is_official`), so it reflects the author's role at that time.
5. **Pinning:** any comment of the post that isn't deleted, reply or not. Deleting it unpins it.
6. **Names:** the comment box asks for a display name while the account has none, as the submit form does.
7. **Rate limit:** comments and replies share the spec's 30 an hour.

**Still deferred:**
- Phase 2's six minors:
  - a NUL byte in post fields answers 500
  - a shared post link while the database is down
  - cross-post vote flicker
  - `excerpt()` stripping Markdown characters
  - `rate_limits` never pruned
  - the unused search index
- GitHub issues #2–#15.

## Global Constraints

- **Repo and branch:** `~/repos/deploys/pano`, on branch `feat/phase-3-comments` from `main`.
  - The repo is public at github.com/Olbioss/pano, and CI runs on pushes to `main` and `feat/**`.
  - Nothing is pushed until the finishing step's choice.
- **Earlier phases still apply:** every Phase 0, 1 and 2 Global Constraint holds. That covers versions, local Postgres, env files, architecture rules, aliases, the envelope, style and commits, the two response formats, translatable error keys, language order, the test database, display names, rate limits, Markdown and component tests.
- **No new packages.**
- **Comment text (spec):** 1–3000 characters after trimming, with no NUL character. It renders through `src/components/markdown.tsx`.
- **Depth:**
  - A top-level comment is depth 0, and replies go down to depth 3 (`MAX_COMMENT_DEPTH`).
  - A reply to a depth-3 comment goes under that comment's parent, beside it (`replyParentId`).
  - The server and the client apply the same rule.
- **Counts:**
  - `posts.comment_count` counts the post's comments that aren't deleted.
  - `comments.reply_count` counts direct replies, deleted ones included.
  - Every write locks the post row first (`select … for update`), and moves the counts in the same transaction by what actually changed.
- **Deleting is soft:**
  - `deleted_at` is set and the body wiped.
  - The API shows a deleted comment with an empty body and no author, keeping its place and its replies.
  - Deleting the pinned comment unpins it.
- **Who may:**
  - Anyone reads.
  - Signed-in people comment and reply: 30 an hour, together, in production.
  - The author or the team deletes.
  - Only the team pins.
- **Merged posts** answer 409 `POST_MERGED` to new comments.
- **Order and paging:**
  - Top-level comments come newest first: `?before=<id>&limit=` (limit 1–50, default 20).
  - Each listed comment carries its latest two replies, oldest first.
  - `GET /api/comments/:id/replies` pages the same way: the newest replies first, each page oldest first.
- **Client:**
  - `commentKeys.post(postId)` prefixes the thread and every reply page of that post.
  - Every comment change on a post shares `mutationKey: ["comment", postId]`. Pins also run in `scope: { id: "pin:" + postId }`.
  - Drafts have negative ids and show greyed out (`opacity-60`, `aria-busy`). The server's comment replaces a draft. An error rolls it back with a translated toast, and its text returns to the box.
  - Once the last change to a post settles, its comment queries and `postKeys.all` are fetched again.

## Review Focus

1. **Two people, or two tabs, commenting and deleting on one post at once** (parallel comments and replies, the same delete sent several times): `comment_count` equals the comments that aren't deleted, and the parent's `reply_count` equals its replies. (Task 3 and Task 6 concurrency tests.)
2. **A thread that grows while someone pages through it:** the next page neither repeats nor skips a comment. (Task 4's "arrives between pages" test.)
3. **Comment text that's blank, too long, or holds a NUL character:** the answer is 400 with a field error, never a 500. (Task 2's schema tests; Task 3's route tests.)
4. **A reply at the depth limit, under a deleted comment, or to a comment on another post:**
   - At the limit, it goes beside its parent.
   - Under a deleted comment, it's accepted and stays under the placeholder.
   - To a comment on another post, it gets 400 `COMMENT_UNKNOWN`.
   - (Task 3 and Task 4 tests.)
5. **A request that fails partway through (adding, deleting, pinning):** the change disappears from every place it showed, counts included, and a typed comment's text returns to the box. (Task 7's cache tests; Task 9's component tests.)

---
### Task 1: The comments table and the post's counters

**Files:**
- Create: `worker/db/schema/comments.ts`
- Modify: `worker/db/schema/posts.ts` (`commentCount`, `pinnedCommentId`, a check), `worker/db/schema/index.ts`
- Generate: `drizzle/0007_comments.sql`, `drizzle/meta/0007_snapshot.json`, and the new entry in `drizzle/meta/_journal.json`
- Test: `worker/db/comments.test.ts`

**Interfaces:**
- Consumes: Phase 2's `posts` and `user` tables, `testDb`, `testApp`, `setupWorkspace`, `submitPost` and `pgErrorCode`.
- Produces:
  - The `comments` table (Drizzle): `id`, `postId`, `authorId`, `parentId`, `depth`, `body`, `isOfficial`, `replyCount`, `deletedAt`, `createdAt`.
  - On `posts`: `commentCount: number` and `pinnedCommentId: number | null`.

- [ ] **Step 1: Create the branch**

```bash
cd ~/repos/deploys/pano
git switch -c feat/phase-3-comments
```

- [ ] **Step 2: Write the failing tests**

`worker/db/comments.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import { setupWorkspace, submitPost } from "../test/fixtures";
import { pgErrorCode } from "./errors";
import { comments, posts, user as users } from "./schema";

const { db, close } = testDb();
afterAll(() => close());

const CHECK_VIOLATION = "23514";

/** A post made through the API, and its author's id, for comments to go on. */
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
  return { postId: post.id, authorId: author.id };
}

describe("the comments table", () => {
  it("refuses a comment nested deeper than three replies", async () => {
    const { postId, authorId } = await aPost();
    await db
      .insert(comments)
      .values({ postId, authorId, depth: 3, body: "Deepest" });
    const err = await db
      .insert(comments)
      .values({ postId, authorId, depth: 4, body: "Too deep" })
      .catch((error: unknown) => error);
    expect(pgErrorCode(err)).toBe(CHECK_VIOLATION);
  });

  it("never lets a post's comment count go below zero", async () => {
    const { postId } = await aPost();
    const err = await db
      .update(posts)
      .set({ commentCount: -1 })
      .where(eq(posts.id, postId))
      .catch((error: unknown) => error);
    expect(pgErrorCode(err)).toBe(CHECK_VIOLATION);
  });

  it("goes with its post, the pinned comment included", async () => {
    const { postId, authorId } = await aPost();
    const [top] = await db
      .insert(comments)
      .values({ postId, authorId, body: "Top" })
      .returning({ id: comments.id });
    await db
      .insert(comments)
      .values({ postId, authorId, parentId: top!.id, depth: 1, body: "Reply" });
    await db
      .update(posts)
      .set({ pinnedCommentId: top!.id })
      .where(eq(posts.id, postId));
    await db.delete(posts).where(eq(posts.id, postId));
    const left = await db
      .select({ id: comments.id })
      .from(comments)
      .where(eq(comments.postId, postId));
    expect(left).toEqual([]);
  });

  it("stays when its author's account goes, without an author", async () => {
    const { postId, authorId } = await aPost();
    const [row] = await db
      .insert(comments)
      .values({ postId, authorId, body: "Hello" })
      .returning({ id: comments.id });
    await db.delete(users).where(eq(users.id, authorId));
    const [kept] = await db
      .select({ authorId: comments.authorId, body: comments.body })
      .from(comments)
      .where(eq(comments.id, row!.id));
    expect(kept).toEqual({ authorId: null, body: "Hello" });
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `bun run test worker/db/comments.test.ts`

Expected: FAIL, all four tests. The schema has no `comments` table and `posts` has no `commentCount`, so the inserts throw and the update has nothing to set.

- [ ] **Step 4: Add the table and the post's columns**

`worker/db/schema/comments.ts`:

```ts
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
// posts.ts imports this file too, for the pinned comment. Both references
// are lazy (`() => …`), so the cycle is harmless.
import { posts } from "./posts";

/**
 * Threads under a post. Deleting one is soft (deleted_at set, body wiped),
 * so its replies keep their place; rows go only with their post.
 */
export const comments = pgTable(
  "comments",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    postId: bigint("post_id", { mode: "number" })
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    // Kept when the account goes; the comment then shows no author.
    authorId: text("author_id").references(() => user.id, {
      onDelete: "set null",
    }),
    parentId: bigint("parent_id", { mode: "number" }).references(
      (): AnyPgColumn => comments.id,
      { onDelete: "cascade" }
    ),
    // 0 for a top-level comment. A reply to a depth-3 comment goes beside it.
    depth: integer("depth").notNull().default(0),
    body: text("body").notNull(),
    // The author was on the workspace's team when writing it: the Team badge.
    isOfficial: boolean("is_official").notNull().default(false),
    // Direct replies, deleted ones included: they stay as placeholders.
    replyCount: integer("reply_count").notNull().default(0),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Threads page by id within a post and a parent.
    index("comments_post_parent_idx").on(
      table.postId,
      table.parentId,
      table.id
    ),
    check("comments_depth_check", sql`${table.depth} between 0 and 3`),
    check("comments_reply_count_check", sql`${table.replyCount} >= 0`),
  ]
);
```

In `worker/db/schema/posts.ts`, import the table after the `boards` import:

```ts
import { boards } from "./boards";
import { comments } from "./comments";
```

Add the two columns after `voteCount`:

```ts
    voteCount: integer("vote_count").notNull().default(0),
    // Comments that aren't deleted, moved in the same transaction as they are.
    commentCount: integer("comment_count").notNull().default(0),
    // The team's pinned comment. Deleting that comment unpins it.
    pinnedCommentId: bigint("pinned_comment_id", { mode: "number" }).references(
      (): AnyPgColumn => comments.id,
      { onDelete: "set null" }
    ),
```

And a check after `posts_vote_count_check`:

```ts
    check("posts_vote_count_check", sql`${table.voteCount} >= 0`),
    check("posts_comment_count_check", sql`${table.commentCount} >= 0`),
```

In `worker/db/schema/index.ts`, export it after `boards`:

```ts
export * from "./boards";
export * from "./comments";
```

- [ ] **Step 5: Generate the migration**

Run: `bun run db:generate --name comments`

Expected: the summary lists `comments 10 columns 1 indexes 3 fks`, and `drizzle/0007_comments.sql` reads:

```sql
CREATE TABLE "comments" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "comments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"post_id" bigint NOT NULL,
	"author_id" text,
	"parent_id" bigint,
	"depth" integer DEFAULT 0 NOT NULL,
	"body" text NOT NULL,
	"is_official" boolean DEFAULT false NOT NULL,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comments_depth_check" CHECK ("comments"."depth" between 0 and 3),
	CONSTRAINT "comments_reply_count_check" CHECK ("comments"."reply_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "comment_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "pinned_comment_id" bigint;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_post_parent_idx" ON "comments" USING btree ("post_id","parent_id","id");--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_pinned_comment_id_comments_id_fk" FOREIGN KEY ("pinned_comment_id") REFERENCES "public"."comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_comment_count_check" CHECK ("posts"."comment_count" >= 0);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun run test worker/db/comments.test.ts`

Expected: PASS, 4 tests. The test run applies `0007_comments.sql` to `pano_test` itself.

Then run: `bun run test`

Expected: PASS. 39 test files, 278 tests.

- [ ] **Step 7: Migrate the dev database and commit**

```bash
bun run db:migrate
bun run typecheck
bun run check:fix && bun run check
git add worker/db/schema drizzle worker/db/comments.test.ts
git commit -m "feat: comments table, with the post's comment count and pinned comment" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `db:migrate` ends with "migrations applied successfully!", the typecheck and Biome pass.

---

### Task 2: The comment contract both sides share

**Files:**
- Create: `shared/comments.ts`; Test: `shared/comments.test.ts`
- Modify: `shared/schemas.ts` (comment schemas); Test: `shared/schemas.test.ts`
- Modify: `shared/field-errors.ts` (`COMMENT_UNKNOWN`), `src/i18n/messages/en.json`, `src/i18n/messages/tr.json`

**Interfaces:**
- Consumes: `key()` and the `z` setup in `shared/schemas.ts`; the catalog parity test.
- Produces:
  - `MAX_COMMENT_DEPTH = 3`.
  - Types:
    - `CommentView`: `{ id, postId, parentId: number | null, depth, body, author: { name } | null, official, deleted, replyCount, replies: CommentView[], canDelete, createdAt: string }`
    - `CommentPage`: `{ items: CommentView[]; hasMore: boolean }`
    - `CommentChange`: `{ comment: CommentView; commentCount: number }`
    - `PinResult`: `{ pinned: CommentView | null }`
  - `replyParentId(comment: { id: number; parentId: number | null; depth: number }): number` and `replyDepth(comment: { depth: number }): number`.
  - Schemas:
    - `commentBodySchema`: trimmed, 1–3000, no NUL
    - `createCommentSchema`: `{ body, parentId? }`
    - `commentPageQuerySchema`: `{ before?: number, limit: number }`, limit 1–50, default 20
    - `pinSchema`: `{ commentId: number | null }`
  - The field-error key `COMMENT_UNKNOWN`, in both catalogs.

- [ ] **Step 1: Write the failing tests**

`shared/comments.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { replyDepth, replyParentId } from "./comments";

describe("replyParentId", () => {
  it("puts a reply under the comment it answers", () => {
    expect(replyParentId({ id: 5, parentId: null, depth: 0 })).toBe(5);
    expect(replyParentId({ id: 9, parentId: 5, depth: 2 })).toBe(9);
  });

  it("puts a reply to a comment at the deepest level beside it", () => {
    expect(replyParentId({ id: 12, parentId: 9, depth: 3 })).toBe(9);
  });
});

describe("replyDepth", () => {
  it("goes one level deeper, down to the limit", () => {
    expect(replyDepth({ depth: 0 })).toBe(1);
    expect(replyDepth({ depth: 2 })).toBe(3);
    expect(replyDepth({ depth: 3 })).toBe(3);
  });
});
```

In `shared/schemas.test.ts`, add the four new schemas to the import from `./schemas`:

```ts
import {
  boardNameSchema,
  codeFormSchema,
  commentBodySchema,
  commentPageQuerySchema,
  createCommentSchema,
  createPostSchema,
  createWorkspaceSchema,
  displayNameSchema,
  feedQuerySchema,
  pinSchema,
  similarQuerySchema,
  updatePostSchema,
  updateWorkspaceSchema,
  voteSchema,
  workspaceSlugSchema,
} from "./schemas";
```

And append:

```ts
describe("commentBodySchema", () => {
  it("trims a comment", () => {
    expect(commentBodySchema.parse("  Same here.  ")).toBe("Same here.");
  });

  it.each([
    ["an empty comment", ""],
    ["a comment of spaces", "   \n "],
    ["a comment over 3000 characters", "x".repeat(3001)],
    ["a comment with a NUL character", "a\u0000b"],
  ])("refuses %s", (_label, body) => {
    expect(commentBodySchema.safeParse(body).success).toBe(false);
  });
});

describe("createCommentSchema", () => {
  it("takes a reply's parent as a positive id", () => {
    const reply = { body: "Yes", parentId: 4 };
    expect(createCommentSchema.safeParse(reply).success).toBe(true);
    const bad = { body: "Yes", parentId: 0 };
    expect(createCommentSchema.safeParse(bad).success).toBe(false);
  });
});

describe("commentPageQuerySchema", () => {
  it("fills in the page size", () => {
    expect(commentPageQuerySchema.parse({})).toEqual({ limit: 20 });
  });

  it.each([
    { before: "abc" },
    { before: "0" },
    { limit: "0" },
    { limit: "51" },
  ])("refuses %j", (query) => {
    expect(commentPageQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe("pinSchema", () => {
  it("takes a comment id, or null to unpin", () => {
    expect(pinSchema.safeParse({ commentId: 3 }).success).toBe(true);
    expect(pinSchema.safeParse({ commentId: null }).success).toBe(true);
    expect(pinSchema.safeParse({}).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test shared/comments.test.ts shared/schemas.test.ts`

Expected: FAIL. `shared/comments.ts` doesn't exist, and the new schemas are undefined, so `schemas.test.ts` throws on `commentBodySchema.parse`.

- [ ] **Step 3: Add the contract**

`shared/comments.ts`:

```ts
/** How deep replies go: a top-level comment is depth 0, replies reach 3. */
export const MAX_COMMENT_DEPTH = 3;

/** A comment as threads show it. */
export type CommentView = {
  id: number;
  postId: number;
  /** null for a top-level comment. */
  parentId: number | null;
  depth: number;
  /** "" once deleted. */
  body: string;
  /** null once deleted or once the account is gone; name is "" until they pick one. */
  author: { name: string } | null;
  /** Written by someone on the workspace's team: shows the Team badge. */
  official: boolean;
  deleted: boolean;
  /** Direct replies, deleted ones included: they keep their place. */
  replyCount: number;
  /**
   * The latest replies, oldest first: up to two on each comment a page
   * lists, none on the replies inside them.
   */
  replies: CommentView[];
  /** The person asking may delete it: they wrote it, or they're on the team. */
  canDelete: boolean;
  createdAt: string;
};

/**
 * A page of comments. Top-level comments come newest first. Replies come
 * oldest first within a page, and each next page holds the ones before it.
 */
export type CommentPage = { items: CommentView[]; hasMore: boolean };

/** A comment just added or deleted, and its post's new comment count. */
export type CommentChange = { comment: CommentView; commentCount: number };

export type PinResult = { pinned: CommentView | null };

/**
 * The comment a reply to `comment` goes under: that comment, or, once the
 * thread is as deep as it goes, its parent, so the reply lands beside it.
 */
export function replyParentId(
  comment: Pick<CommentView, "id" | "parentId" | "depth">
): number {
  return comment.depth >= MAX_COMMENT_DEPTH && comment.parentId !== null
    ? comment.parentId
    : comment.id;
}

/** The depth of a reply to `comment`. */
export function replyDepth(comment: Pick<CommentView, "depth">): number {
  return Math.min(comment.depth + 1, MAX_COMMENT_DEPTH);
}
```

In `shared/schemas.ts`, append:

```ts
export const commentBodySchema = z
  .string()
  .trim()
  .min(1)
  .max(3000)
  // Postgres text can't hold NUL; caught here it's a 400, not a 500.
  .refine((body) => !body.includes("\u0000"));

const idSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const createCommentSchema = z.object({
  body: commentBodySchema,
  parentId: idSchema.optional(),
});

/** Keyset paging: the page of comments before the id `before`. */
export const commentPageQuerySchema = z.object({
  before: z.coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const pinSchema = z.object({ commentId: idSchema.nullable() });
```

In `shared/field-errors.ts`, add the key at the end of `FIELD_ERROR_KEYS`:

```ts
  "CODE_FORMAT",
  "COMMENT_UNKNOWN",
] as const;
```

In `src/i18n/messages/en.json`, add to `fieldErrors`, after `CODE_FORMAT`:

```json
    "COMMENT_UNKNOWN": "That comment isn't on this request. Reload and try again."
```

In `src/i18n/messages/tr.json`, the same place:

```json
    "COMMENT_UNKNOWN": "Bu yorum bu istekte yok. Sayfayı yenileyip tekrar deneyin."
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test shared/comments.test.ts shared/schemas.test.ts src/i18n/messages.test.ts`

Expected: PASS. 3 tests in `comments.test.ts`, 42 in `schemas.test.ts`, 2 in `messages.test.ts`.

Then run: `bun run test`

Expected: PASS. 40 test files, 293 tests.

- [ ] **Step 5: Commit**

```bash
bun run typecheck
bun run check:fix && bun run check
git add shared src/i18n/messages
git commit -m "feat: the comment contract: views, depth rule and request schemas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: Writing comments and replies

**Files:**
- Create: `worker/services/team.ts` (`onTeam`, moved from `worker/services/posts.ts`)
- Create: `worker/services/comments.ts` (`createComment`, `findComment`)
- Create: `worker/routes/comments.ts` (`postCommentRoutes`)
- Modify:
  - `worker/lib/validate.ts`: `idParamSchema`
  - `worker/routes/posts.ts`: use `idParamSchema`
  - `worker/services/posts.ts`: `commentCount` in post views, `onTeam` from `team.ts`
  - `shared/posts.ts`: `PostSummary.commentCount`
  - `worker/app.ts`: mount the routes
  - `worker/test/fixtures.ts`: `commentOn`
  - `src/features/votes/vote-button.test.tsx`: `commentCount` in its fixture
- Test: `worker/routes/comments.test.ts`

**Interfaces:**
- Consumes: from Task 1, `comments` and `posts.commentCount`. From Task 2, `CommentView`, `CommentChange`, `replyParentId`, `replyDepth` and `createCommentSchema`. From Phase 2, `rateLimit`, `requireUser`, `validate`, `AppError`, `setupWorkspace` and `submitPost`.
- Produces:
  - `onTeam(userId: string): SQL<boolean>`, for queries on `posts`.
  - `type Viewer = { id: string | null; isTeam: boolean }`.
  - `findComment(db, id: number, viewer: Viewer): Promise<CommentView | null>`.
  - `createComment(db, input: { postId: number; authorId: string; body: string; parentId?: number }): Promise<CommentChange>`. It throws `AppError` 404, 409 `POST_MERGED`, or 400 with `fields.parentId = "COMMENT_UNKNOWN"`.
  - `POST /api/posts/:id/comments {body, parentId?}` answers 201 with `CommentChange`, limited to 30 an hour in production.
  - `idParamSchema` (an `:id` path segment).
  - `PostSummary.commentCount` (and so `PostDetail.commentCount`).
  - Fixture: `commentOn(t, cookie, postId, body, parentId?): Promise<CommentChange>`.

- [ ] **Step 1: Write the failing tests**

In `worker/test/fixtures.ts`, append:

```ts
/** Comments through the API as `cookie`; returns the comment and the new count. */
export async function commentOn(
  t: TestApp,
  cookie: string,
  postId: number,
  body: string,
  parentId?: number
) {
  const res = await t.client.api.posts[":id"].comments.$post(
    {
      param: { id: String(postId) },
      json: parentId === undefined ? { body } : { body, parentId },
    },
    { headers: { cookie } }
  );
  const json = await res.json();
  if (!json.success) throw new Error(`comment failed: ${json.error}`);
  return json.data;
}
```

`worker/routes/comments.test.ts`:

```ts
import { and, count, eq, isNull } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { comments, posts } from "../db/schema";
import { testApp } from "../test/app";
import { testDb } from "../test/db";
import { commentOn, setupWorkspace, submitPost } from "../test/fixtures";

const { db, close } = testDb();
afterAll(() => close());

type TestApp = ReturnType<typeof testApp>;

/** A workspace and one post by its owner, who is on the team. */
async function postByOwner(t: TestApp) {
  const { owner, slug, boards } = await setupWorkspace(t);
  const post = await submitPost(t, owner.cookie, slug, {
    boardId: boards[0]!.id,
    title: "Dark mode",
  });
  return { owner, slug, boards, post };
}

const send = (
  t: TestApp,
  cookie: string | undefined,
  postId: number,
  json: { body: string; parentId?: number }
) =>
  t.client.api.posts[":id"].comments.$post(
    { param: { id: String(postId) }, json },
    cookie ? { headers: { cookie } } : undefined
  );

/** The stored count, next to the comments it must equal. */
async function tally(postId: number) {
  const [post] = await db
    .select({ commentCount: posts.commentCount })
    .from(posts)
    .where(eq(posts.id, postId));
  const [rows] = await db
    .select({ n: count() })
    .from(comments)
    .where(and(eq(comments.postId, postId), isNull(comments.deletedAt)));
  return { commentCount: post?.commentCount, rows: rows?.n };
}

async function replyCountOf(commentId: number) {
  const [row] = await db
    .select({ replyCount: comments.replyCount })
    .from(comments)
    .where(eq(comments.id, commentId));
  return row?.replyCount;
}

describe("POST /api/posts/:id/comments", () => {
  it("adds a comment and counts it", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const reader = await t.signIn();
    const res = await send(t, reader.cookie, post.id, {
      body: "  Yes please, **for** reading at night.  ",
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      success: true,
      data: {
        comment: {
          id: expect.any(Number),
          postId: post.id,
          parentId: null,
          depth: 0,
          body: "Yes please, **for** reading at night.",
          author: { name: "" },
          official: false,
          deleted: false,
          replyCount: 0,
          replies: [],
          canDelete: true,
          createdAt: expect.any(String),
        },
        commentCount: 1,
      },
    });
    expect(await tally(post.id)).toEqual({ commentCount: 1, rows: 1 });
    await t.settle();
  });

  it("shows the count with the post and in the feed", async () => {
    const t = testApp();
    const { owner, slug, post } = await postByOwner(t);
    await commentOn(t, owner.cookie, post.id, "First");
    await commentOn(t, owner.cookie, post.id, "Second");
    const detail = await t.client.api.posts[":id"].$get({
      param: { id: String(post.id) },
    });
    expect(await detail.json()).toMatchObject({ data: { commentCount: 2 } });
    const feed = await t.client.api.workspaces[":slug"].posts.$get({
      param: { slug },
      query: {},
    });
    expect(await feed.json()).toMatchObject({
      data: { items: [{ id: post.id, commentCount: 2 }] },
    });
    await t.settle();
  });

  it("marks a comment by the workspace's team", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const { comment } = await commentOn(
      t,
      owner.cookie,
      post.id,
      "Planned for next month."
    );
    expect(comment.official).toBe(true);
    await t.settle();
  });

  it("adds a reply under its parent and counts it there", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const parent = await commentOn(t, owner.cookie, post.id, "What else?");
    const reader = await t.signIn();
    const res = await send(t, reader.cookie, post.id, {
      body: "The editor too.",
      parentId: parent.comment.id,
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      data: {
        comment: { parentId: parent.comment.id, depth: 1 },
        commentCount: 2,
      },
    });
    expect(await replyCountOf(parent.comment.id)).toBe(1);
    await t.settle();
  });

  it("puts a reply to the deepest comment beside it", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const chain: number[] = [];
    for (let depth = 0; depth <= 3; depth++) {
      const { comment } = await commentOn(
        t,
        owner.cookie,
        post.id,
        `Level ${depth}`,
        chain.at(-1)
      );
      expect(comment.depth).toBe(depth);
      chain.push(comment.id);
    }
    const { comment } = await commentOn(
      t,
      owner.cookie,
      post.id,
      "Me too",
      chain[3]
    );
    expect(comment).toMatchObject({ parentId: chain[2], depth: 3 });
    expect(await replyCountOf(chain[2]!)).toBe(2);
    await t.settle();
  });

  it("accepts a reply to a deleted comment, under its placeholder", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const parent = await commentOn(t, owner.cookie, post.id, "Gone soon");
    await db
      .update(comments)
      .set({ deletedAt: new Date(), body: "" })
      .where(eq(comments.id, parent.comment.id));
    const reply = await commentOn(
      t,
      owner.cookie,
      post.id,
      "Answering anyway",
      parent.comment.id
    );
    expect(reply.comment.parentId).toBe(parent.comment.id);
    expect(await replyCountOf(parent.comment.id)).toBe(1);
    await t.settle();
  });

  it("refuses a reply to a comment on another post", async () => {
    const t = testApp();
    const { owner, slug, boards, post } = await postByOwner(t);
    const other = await submitPost(t, owner.cookie, slug, {
      boardId: boards[0]!.id,
      title: "Export to CSV",
    });
    const elsewhere = await commentOn(t, owner.cookie, other.id, "Over here");
    const res = await send(t, owner.cookie, post.id, {
      body: "Hi",
      parentId: elsewhere.comment.id,
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "BAD_REQUEST",
      fields: { parentId: "COMMENT_UNKNOWN" },
    });
    expect(await tally(post.id)).toEqual({ commentCount: 0, rows: 0 });
    await t.settle();
  });

  it.each([
    ["blank", "   "],
    ["over 3000 characters", "x".repeat(3001)],
    ["holding a NUL character", "a\u0000b"],
  ])("refuses a comment that's %s", async (_label, body) => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const res = await send(t, owner.cookie, post.id, { body });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      fields: { body: expect.any(String) },
    });
    await t.settle();
  });

  it("needs a signed-in user", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const res = await send(t, undefined, post.id, { body: "Hi" });
    expect(res.status).toBe(401);
    await t.settle();
  });

  it("answers 404 for a post that's gone", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    await t.client.api.posts[":id"].$delete(
      { param: { id: String(post.id) } },
      { headers: { cookie: owner.cookie } }
    );
    const res = await send(t, owner.cookie, post.id, { body: "Hi" });
    expect(res.status).toBe(404);
    await t.settle();
  });

  it("refuses a comment on a merged post", async () => {
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
    const res = await send(t, owner.cookie, post.id, { body: "Hi" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      success: false,
      code: "POST_MERGED",
    });
    expect(await tally(post.id)).toEqual({ commentCount: 0, rows: 0 });
    await t.settle();
  });

  it("allows 30 comments an hour per person in production", async () => {
    // Sign in through a dev app: production also limits code requests per IP.
    const dev = testApp();
    const { post } = await postByOwner(dev);
    const member = await dev.signIn();
    const prod = testApp({ ENVIRONMENT: "production" });
    const statuses: number[] = [];
    for (let i = 1; i <= 31; i++) {
      const res = await send(prod, member.cookie, post.id, {
        body: `Thought ${i}`,
      });
      statuses.push(res.status);
    }
    expect(statuses.filter((status) => status === 201)).toHaveLength(30);
    expect(statuses.at(-1)).toBe(429);
    await dev.settle();
    await prod.settle();
  }, 30_000);

  it("keeps the counts equal to the comments when 20 arrive at once", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const parent = await commentOn(t, owner.cookie, post.id, "Top");
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        send(
          t,
          owner.cookie,
          post.id,
          i % 2 === 0
            ? { body: `Reply ${i}`, parentId: parent.comment.id }
            : { body: `Comment ${i}` }
        )
      )
    );
    expect(responses.map((res) => res.status)).toEqual(Array(20).fill(201));
    expect(await tally(post.id)).toEqual({ commentCount: 21, rows: 21 });
    expect(await replyCountOf(parent.comment.id)).toBe(10);
    await t.settle();
  }, 30_000);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test worker/routes/comments.test.ts`

Expected: FAIL. No comment route exists, so every comment answers 404: the status assertions fail, and `commentOn` throws "comment failed: Not found". The "post that's gone" test already passes, because the missing route answers 404 too.

- [ ] **Step 3: Move the team check and count comments in post views**

`worker/services/team.ts`:

```ts
import { sql } from "drizzle-orm";
import { member, posts } from "../db/schema";

/**
 * Whether `userId` is on the team of the post's workspace, for queries on
 * `posts`. Any membership counts: owner, admin or member.
 */
export const onTeam = (userId: string) =>
  sql<boolean>`exists (select 1 from ${member} where ${member.organizationId} = ${posts.organizationId} and ${member.userId} = ${userId})`;
```

In `worker/services/posts.ts`:
- Delete the local `const onTeam = …` (and `member` from the schema import, which only it used).
- Import it from the new file: `import { onTeam } from "./team";`.
- In `postColumns`, add after `voteCount`:

```ts
    voteCount: posts.voteCount,
    commentCount: posts.commentCount,
```

- In `PostRow`, add after `voteCount: number;`:

```ts
  commentCount: number;
```

- In `toSummary`, add after `voteCount: row.voteCount,`:

```ts
    commentCount: row.commentCount,
```

In `shared/posts.ts`, add to `PostSummary` after `voteCount: number;`:

```ts
  /** Comments that aren't deleted. */
  commentCount: number;
```

In `src/features/votes/vote-button.test.tsx`, add `commentCount: 0,` to the `summary` fixture, after `voteCount: 3,`.

- [ ] **Step 4: Share the `:id` path schema**

In `worker/lib/validate.ts`, import `z` as well:

```ts
import { type ZodType, z } from "zod";
```

And append:

```ts
/** A numeric `:id` in the path, as a safe positive integer. */
export const idParamSchema = z.object({
  id: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});
```

In `worker/routes/posts.ts`:
- Delete the local `postParamSchema` and the `z` import that only it used.
- Import the shared one: `import { idParamSchema, validate } from "../lib/validate";`.
- Replace each of the four `validate("param", postParamSchema)` with `validate("param", idParamSchema)`.

- [ ] **Step 5: Add the service**

`worker/services/comments.ts`:

```ts
import { and, eq, sql } from "drizzle-orm";
import {
  type CommentChange,
  type CommentView,
  replyDepth,
  replyParentId,
} from "@/shared/comments";
import type { Database } from "../db/client";
import { comments, posts, user as users } from "../db/schema";
import { AppError } from "../lib/errors";
import { onTeam } from "./team";

/** Who's reading: their id, and whether they're on the post's team. */
export type Viewer = { id: string | null; isTeam: boolean };

/**
 * What every comment view selects. Queries using it left-join `users` on
 * the author.
 */
const commentColumns = {
  id: comments.id,
  postId: comments.postId,
  parentId: comments.parentId,
  depth: comments.depth,
  body: comments.body,
  authorId: comments.authorId,
  authorName: users.name,
  official: comments.isOfficial,
  replyCount: comments.replyCount,
  deletedAt: comments.deletedAt,
  createdAt: comments.createdAt,
};

type CommentRow = {
  id: number;
  postId: number;
  parentId: number | null;
  depth: number;
  body: string;
  authorId: string | null;
  authorName: string | null;
  official: boolean;
  replyCount: number;
  deletedAt: Date | null;
  createdAt: Date;
};

/** A deleted comment keeps its place and its replies, not its words or author. */
function toView(
  row: CommentRow,
  viewer: Viewer,
  replies: CommentView[] = []
): CommentView {
  const deleted = row.deletedAt !== null;
  return {
    id: row.id,
    postId: row.postId,
    parentId: row.parentId,
    depth: row.depth,
    body: deleted ? "" : row.body,
    author:
      deleted || row.authorId === null
        ? null
        : { name: row.authorName ?? "" },
    official: !deleted && row.official,
    deleted,
    replyCount: row.replyCount,
    replies,
    canDelete:
      !deleted &&
      viewer.id !== null &&
      (row.authorId === viewer.id || viewer.isTeam),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function findComment(
  db: Database,
  id: number,
  viewer: Viewer
): Promise<CommentView | null> {
  const [row] = await db
    .select(commentColumns)
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.id, id))
    .limit(1);
  return row ? toView(row, viewer) : null;
}

/**
 * Adds a comment, or a reply when `parentId` is set, and counts it.
 *
 * Every change to a post's comments locks the post row first, so the
 * counts move one change at a time, by exactly what changed. From Phase 4,
 * a merge takes the same lock, so a comment can't land on a post that was
 * just merged away.
 */
export async function createComment(
  db: Database,
  input: { postId: number; authorId: string; body: string; parentId?: number }
): Promise<CommentChange> {
  const saved = await db.transaction(async (tx) => {
    const [post] = await tx
      .select({
        mergedIntoId: posts.mergedIntoId,
        isTeam: onTeam(input.authorId),
      })
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
    let parentId: number | null = null;
    let depth = 0;
    if (input.parentId !== undefined) {
      const [parent] = await tx
        .select({
          id: comments.id,
          parentId: comments.parentId,
          depth: comments.depth,
        })
        .from(comments)
        .where(
          and(
            eq(comments.id, input.parentId),
            eq(comments.postId, input.postId)
          )
        )
        .limit(1);
      if (!parent) {
        throw new AppError(
          400,
          "BAD_REQUEST",
          "That comment isn't on this post",
          { parentId: "COMMENT_UNKNOWN" }
        );
      }
      parentId = replyParentId(parent);
      depth = replyDepth(parent);
      await tx
        .update(comments)
        .set({ replyCount: sql`${comments.replyCount} + 1` })
        .where(eq(comments.id, parentId));
    }
    const [created] = await tx
      .insert(comments)
      .values({
        postId: input.postId,
        authorId: input.authorId,
        parentId,
        depth,
        body: input.body,
        isOfficial: post.isTeam,
      })
      .returning({ id: comments.id });
    const [counted] = await tx
      .update(posts)
      .set({ commentCount: sql`${posts.commentCount} + 1` })
      .where(eq(posts.id, input.postId))
      .returning({ commentCount: posts.commentCount });
    if (!created || !counted) {
      throw new Error("the comment insert returned nothing");
    }
    return {
      id: created.id,
      commentCount: counted.commentCount,
      isTeam: post.isTeam,
    };
  });
  const comment = await findComment(db, saved.id, {
    id: input.authorId,
    isTeam: saved.isTeam,
  });
  if (!comment) throw new Error("the new comment is missing");
  return { comment, commentCount: saved.commentCount };
}
```

- [ ] **Step 6: Add the route and mount it**

`worker/routes/comments.ts`:

```ts
import { Hono } from "hono";
import type { CommentChange } from "@/shared/comments";
import type { SuccessResponse } from "@/shared/envelope";
import { createCommentSchema } from "@/shared/schemas";
import type { AppEnv } from "../env";
import { idParamSchema, validate } from "../lib/validate";
import { rateLimit } from "../middleware/rate-limit";
import { requireUser } from "../middleware/session";
import { createComment } from "../services/comments";

/** Under /posts: a post's comments. */
export const postCommentRoutes = new Hono<AppEnv>().post(
  "/:id/comments",
  requireUser,
  validate("param", idParamSchema),
  validate("json", createCommentSchema),
  rateLimit("comment", 30, 3600),
  async (c) => {
    const { body, parentId } = c.req.valid("json");
    const result = await createComment(c.var.db, {
      postId: c.req.valid("param").id,
      authorId: c.var.user.id,
      body,
      parentId,
    });
    return c.json<SuccessResponse<CommentChange>>(
      { success: true, data: result },
      201
    );
  }
);
```

In `worker/app.ts`, import it:

```ts
import { postCommentRoutes } from "./routes/comments";
```

And mount it after the post routes:

```ts
    .route("/posts", postRoutes)
    .route("/posts", postCommentRoutes);
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bun run test worker/routes/comments.test.ts`

Expected: PASS, 15 tests.

Then run: `bun run test`

Expected: PASS. 41 test files, 308 tests. Phase 2's post, vote and feed tests still pass with `idParamSchema` and the moved team check.

- [ ] **Step 8: Commit**

```bash
bun run typecheck
bun run check:fix && bun run check
git add worker shared/posts.ts src/features/votes/vote-button.test.tsx
git commit -m "feat: comments and replies, counted in the same transaction as they're written" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 4: Reading a thread, a page at a time

**Files:**
- Modify: `worker/services/comments.ts` (`listComments`, `listReplies`)
- Modify: `worker/routes/comments.ts` (`GET /posts/:id/comments`, and a new `commentRoutes` with `GET /comments/:id/replies`)
- Modify: `worker/app.ts` (mount `commentRoutes`)
- Test: `worker/routes/comments.test.ts`

**Interfaces:**
- Consumes: from Task 3, `Viewer`, `toView`, `commentColumns`, `onTeam`, `postCommentRoutes` and `commentOn`. From Task 2, `CommentPage` and `commentPageQuerySchema`. From Phase 2, `readViewerId`.
- Produces:
  - `listComments(db, input: { postId: number; before?: number; limit: number; viewerId: string | null }): Promise<CommentPage>`. Top-level comments, newest first, each with its latest two replies (oldest first). It throws 404 for an unknown post.
  - `listReplies(db, input: { commentId: number; before?: number; limit: number; viewerId: string | null }): Promise<CommentPage>`. A comment's replies: the newest `limit` before `before`, oldest first, each with its own latest two replies. It throws 404 for an unknown comment.
  - Routes: `GET /api/posts/:id/comments?before=&limit=` and `GET /api/comments/:id/replies?before=&limit=`, both open to anyone.
  - `commentRoutes`, mounted at `/comments`. Task 6 adds the delete route to it.

- [ ] **Step 1: Write the failing tests**

In `worker/routes/comments.test.ts`, add after `replyCountOf`:

```ts
type PageQuery = { before?: string; limit?: string };

async function readThread(
  t: TestApp,
  postId: number,
  query: PageQuery = {},
  cookie?: string
) {
  const res = await t.client.api.posts[":id"].comments.$get(
    { param: { id: String(postId) }, query },
    cookie ? { headers: { cookie } } : undefined
  );
  const body = await res.json();
  if (!body.success) throw new Error(`thread failed: ${body.error}`);
  return body.data;
}

async function readReplies(
  t: TestApp,
  commentId: number,
  query: PageQuery = {}
) {
  const res = await t.client.api.comments[":id"].replies.$get({
    param: { id: String(commentId) },
    query,
  });
  const body = await res.json();
  if (!body.success) throw new Error(`replies failed: ${body.error}`);
  return body.data;
}

const bodies = (list: { body: string }[]) => list.map((item) => item.body);
```

And append:

```ts
describe("GET /api/posts/:id/comments", () => {
  it("lists top-level comments newest first, a page at a time", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    for (let i = 1; i <= 3; i++) {
      await commentOn(t, owner.cookie, post.id, `Comment ${i}`);
    }
    const first = await readThread(t, post.id, { limit: "2" });
    expect(bodies(first.items)).toEqual(["Comment 3", "Comment 2"]);
    expect(first.hasMore).toBe(true);
    const second = await readThread(t, post.id, {
      limit: "2",
      before: String(first.items[1]!.id),
    });
    expect(bodies(second.items)).toEqual(["Comment 1"]);
    expect(second.hasMore).toBe(false);
    await t.settle();
  });

  it("neither repeats nor skips a comment that arrives between pages", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    for (let i = 1; i <= 3; i++) {
      await commentOn(t, owner.cookie, post.id, `Comment ${i}`);
    }
    const first = await readThread(t, post.id, { limit: "2" });
    await commentOn(t, owner.cookie, post.id, "Comment 4");
    const second = await readThread(t, post.id, {
      limit: "2",
      before: String(first.items.at(-1)!.id),
    });
    expect(bodies(second.items)).toEqual(["Comment 1"]);
    await t.settle();
  });

  it("brings each comment's latest two replies, oldest first", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const top = await commentOn(t, owner.cookie, post.id, "Top");
    for (let i = 1; i <= 3; i++) {
      await commentOn(t, owner.cookie, post.id, `Reply ${i}`, top.comment.id);
    }
    const { items } = await readThread(t, post.id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ body: "Top", replyCount: 3 });
    expect(bodies(items[0]!.replies)).toEqual(["Reply 2", "Reply 3"]);
    expect(items[0]!.replies[0]!.replies).toEqual([]);
    await t.settle();
  });

  it("shows a deleted comment as a placeholder that keeps its replies", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const reader = await t.signIn();
    const top = await commentOn(t, reader.cookie, post.id, "Oops");
    await commentOn(t, owner.cookie, post.id, "Still here", top.comment.id);
    await db
      .update(comments)
      .set({ deletedAt: new Date(), body: "" })
      .where(eq(comments.id, top.comment.id));
    const { items } = await readThread(t, post.id, {}, reader.cookie);
    expect(items[0]).toMatchObject({
      deleted: true,
      body: "",
      author: null,
      official: false,
      canDelete: false,
      replyCount: 1,
    });
    expect(bodies(items[0]!.replies)).toEqual(["Still here"]);
    await t.settle();
  });

  it("lets only the author and the team delete", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const writer = await t.signIn();
    const other = await t.signIn();
    await commentOn(t, writer.cookie, post.id, "Mine");
    const canDelete = async (cookie?: string) =>
      (await readThread(t, post.id, {}, cookie)).items[0]!.canDelete;
    expect(await canDelete(writer.cookie)).toBe(true);
    expect(await canDelete(owner.cookie)).toBe(true);
    expect(await canDelete(other.cookie)).toBe(false);
    expect(await canDelete()).toBe(false);
    await t.settle();
  });

  it("answers 404 for an unknown post, and 400 for a bad page", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const missing = await t.client.api.posts[":id"].comments.$get({
      param: { id: "999999999" },
      query: {},
    });
    expect(missing.status).toBe(404);
    for (const query of [{ before: "abc" }, { limit: "0" }]) {
      const res = await t.client.api.posts[":id"].comments.$get({
        param: { id: String(post.id) },
        query,
      });
      expect(res.status).toBe(400);
    }
    await t.settle();
  });
});

describe("GET /api/comments/:id/replies", () => {
  it("pages back through replies: newest page first, each oldest first", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const top = await commentOn(t, owner.cookie, post.id, "Top");
    for (let i = 1; i <= 5; i++) {
      await commentOn(t, owner.cookie, post.id, `Reply ${i}`, top.comment.id);
    }
    const newest = await readReplies(t, top.comment.id, { limit: "2" });
    expect(bodies(newest.items)).toEqual(["Reply 4", "Reply 5"]);
    expect(newest.hasMore).toBe(true);
    const earlier = await readReplies(t, top.comment.id, {
      limit: "2",
      before: String(newest.items[0]!.id),
    });
    expect(bodies(earlier.items)).toEqual(["Reply 2", "Reply 3"]);
    const earliest = await readReplies(t, top.comment.id, {
      limit: "2",
      before: String(earlier.items[0]!.id),
    });
    expect(bodies(earliest.items)).toEqual(["Reply 1"]);
    expect(earliest.hasMore).toBe(false);
    await t.settle();
  });

  it("brings each reply's latest replies", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const top = await commentOn(t, owner.cookie, post.id, "Top");
    const reply = await commentOn(
      t,
      owner.cookie,
      post.id,
      "Reply",
      top.comment.id
    );
    await commentOn(t, owner.cookie, post.id, "Deeper", reply.comment.id);
    const { items } = await readReplies(t, top.comment.id);
    expect(items[0]).toMatchObject({ body: "Reply", replyCount: 1 });
    expect(bodies(items[0]!.replies)).toEqual(["Deeper"]);
    await t.settle();
  });

  it("answers 404 for a comment that doesn't exist", async () => {
    const t = testApp();
    const res = await t.client.api.comments[":id"].replies.$get({
      param: { id: "999999999" },
      query: {},
    });
    expect(res.status).toBe(404);
    await t.settle();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test worker/routes/comments.test.ts`

Expected: FAIL. No GET route exists:
- `readThread` and `readReplies` throw "thread failed: Not found" or "replies failed: Not found".
- The bad-page requests answer 404 instead of 400.
- Only "answers 404 for a comment that doesn't exist" already passes, because a missing route answers 404 too. Task 3's 15 tests still pass.

- [ ] **Step 3: Add the queries**

In `worker/services/comments.ts`, widen the drizzle import:

```ts
import { and, asc, desc, eq, inArray, isNull, lt, lte, sql } from "drizzle-orm";
```

Add `CommentPage` to the import from `@/shared/comments`:

```ts
import {
  type CommentChange,
  type CommentPage,
  type CommentView,
  replyDepth,
  replyParentId,
} from "@/shared/comments";
```

And append:

```ts
/** How many of each comment's latest replies come with it. */
const PREVIEW_REPLIES = 2;

/** The viewer of a post's comments, or null when the post doesn't exist. */
async function viewerOf(
  db: Database,
  postId: number,
  viewerId: string | null
): Promise<Viewer | null> {
  const [post] = await db
    .select({ isTeam: viewerId ? onTeam(viewerId) : sql<boolean>`false` })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);
  return post ? { id: viewerId, isTeam: post.isTeam } : null;
}

/**
 * Up to `limit` comments under `parentId` (null: the top level), newest
 * first, all older than the comment `before`. Ids follow insertion order,
 * so a comment added meanwhile never shifts a later page.
 */
async function pageOf(
  db: Database,
  input: {
    postId: number;
    parentId: number | null;
    before?: number;
    limit: number;
  }
) {
  const rows = await db
    .select(commentColumns)
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorId))
    .where(
      and(
        eq(comments.postId, input.postId),
        input.parentId === null
          ? isNull(comments.parentId)
          : eq(comments.parentId, input.parentId),
        input.before === undefined ? undefined : lt(comments.id, input.before)
      )
    )
    .orderBy(desc(comments.id))
    .limit(input.limit + 1);
  return { rows: rows.slice(0, input.limit), hasMore: rows.length > input.limit };
}

/** The latest replies of each of `parentIds`, oldest first, in one query. */
async function latestReplies(
  db: Database,
  postId: number,
  parentIds: number[]
) {
  if (parentIds.length === 0) return [];
  const ranked = db
    .select({
      id: comments.id,
      rank: sql<number>`row_number() over (partition by ${comments.parentId} order by ${comments.id} desc)`.as(
        "rank"
      ),
    })
    .from(comments)
    .where(
      and(eq(comments.postId, postId), inArray(comments.parentId, parentIds))
    )
    .as("ranked");
  return db
    .select(commentColumns)
    .from(comments)
    .innerJoin(ranked, eq(ranked.id, comments.id))
    .leftJoin(users, eq(users.id, comments.authorId))
    .where(lte(ranked.rank, PREVIEW_REPLIES))
    .orderBy(asc(comments.id));
}

/** The rows as views, each carrying its latest replies. */
async function withReplies(
  db: Database,
  postId: number,
  rows: CommentRow[],
  viewer: Viewer
) {
  const parents = rows.filter((row) => row.replyCount > 0).map((row) => row.id);
  const replies = await latestReplies(db, postId, parents);
  return rows.map((row) =>
    toView(
      row,
      viewer,
      replies
        .filter((reply) => reply.parentId === row.id)
        .map((reply) => toView(reply, viewer))
    )
  );
}

export async function listComments(
  db: Database,
  input: {
    postId: number;
    before?: number;
    limit: number;
    viewerId: string | null;
  }
): Promise<CommentPage> {
  const viewer = await viewerOf(db, input.postId, input.viewerId);
  if (!viewer) throw new AppError(404, "NOT_FOUND", "Post not found");
  const page = await pageOf(db, { ...input, parentId: null });
  return {
    items: await withReplies(db, input.postId, page.rows, viewer),
    hasMore: page.hasMore,
  };
}

export async function listReplies(
  db: Database,
  input: {
    commentId: number;
    before?: number;
    limit: number;
    viewerId: string | null;
  }
): Promise<CommentPage> {
  const [parent] = await db
    .select({ postId: comments.postId })
    .from(comments)
    .where(eq(comments.id, input.commentId))
    .limit(1);
  const viewer = parent
    ? await viewerOf(db, parent.postId, input.viewerId)
    : null;
  if (!parent || !viewer) {
    throw new AppError(404, "NOT_FOUND", "Comment not found");
  }
  const page = await pageOf(db, {
    postId: parent.postId,
    parentId: input.commentId,
    before: input.before,
    limit: input.limit,
  });
  // The query brings the newest first; a page of replies reads oldest first.
  return {
    items: await withReplies(db, parent.postId, page.rows.reverse(), viewer),
    hasMore: page.hasMore,
  };
}
```

- [ ] **Step 4: Add the routes**

In `worker/routes/comments.ts`, replace the imports and `postCommentRoutes` with:

```ts
import { Hono } from "hono";
import type { CommentChange, CommentPage } from "@/shared/comments";
import type { SuccessResponse } from "@/shared/envelope";
import {
  commentPageQuerySchema,
  createCommentSchema,
} from "@/shared/schemas";
import type { AppEnv } from "../env";
import { idParamSchema, validate } from "../lib/validate";
import { rateLimit } from "../middleware/rate-limit";
import { readViewerId, requireUser } from "../middleware/session";
import {
  createComment,
  listComments,
  listReplies,
} from "../services/comments";

/** Under /posts: a post's thread, and commenting on it. */
export const postCommentRoutes = new Hono<AppEnv>()
  .get(
    "/:id/comments",
    validate("param", idParamSchema),
    validate("query", commentPageQuerySchema),
    async (c) => {
      const page = await listComments(c.var.db, {
        postId: c.req.valid("param").id,
        ...c.req.valid("query"),
        viewerId: await readViewerId(c),
      });
      return c.json<SuccessResponse<CommentPage>>({
        success: true,
        data: page,
      });
    }
  )
  .post(
    "/:id/comments",
    requireUser,
    validate("param", idParamSchema),
    validate("json", createCommentSchema),
    rateLimit("comment", 30, 3600),
    async (c) => {
      const { body, parentId } = c.req.valid("json");
      const result = await createComment(c.var.db, {
        postId: c.req.valid("param").id,
        authorId: c.var.user.id,
        body,
        parentId,
      });
      return c.json<SuccessResponse<CommentChange>>(
        { success: true, data: result },
        201
      );
    }
  );

/** Under /comments: one comment's replies. */
export const commentRoutes = new Hono<AppEnv>().get(
  "/:id/replies",
  validate("param", idParamSchema),
  validate("query", commentPageQuerySchema),
  async (c) => {
    const page = await listReplies(c.var.db, {
      commentId: c.req.valid("param").id,
      ...c.req.valid("query"),
      viewerId: await readViewerId(c),
    });
    return c.json<SuccessResponse<CommentPage>>({ success: true, data: page });
  }
);
```

In `worker/app.ts`, import both:

```ts
import { commentRoutes, postCommentRoutes } from "./routes/comments";
```

And mount `commentRoutes` last:

```ts
    .route("/posts", postRoutes)
    .route("/posts", postCommentRoutes)
    .route("/comments", commentRoutes);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test worker/routes/comments.test.ts`

Expected: PASS, 24 tests.

Then run: `bun run test`

Expected: PASS. 41 test files, 317 tests.

- [ ] **Step 6: Commit**

```bash
bun run typecheck
bun run check:fix && bun run check
git add worker
git commit -m "feat: read threads newest first, with each comment's latest replies" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: Pinning a comment

**Files:**
- Modify: `worker/services/comments.ts` (`setPin`)
- Modify: `worker/services/posts.ts` (`findPostDetail`: `isTeam` and `pinned`)
- Modify: `shared/posts.ts` (`PostDetail.isTeam`, `PostDetail.pinned`)
- Modify: `worker/routes/comments.ts` (`PUT /posts/:id/pin`)
- Modify: `src/features/votes/vote-button.test.tsx` (the `detail` fixture)
- Test: `worker/routes/comments.test.ts`

**Interfaces:**
- Consumes: from Task 3, `findComment`, `Viewer` and `onTeam`. From Task 2, `PinResult` and `pinSchema`.
- Produces:
  - `setPin(db, input: { postId: number; userId: string; commentId: number | null }): Promise<CommentView | null>`. It throws `AppError` 404, 403, or 400 with `fields.commentId = "COMMENT_UNKNOWN"`.
  - `PUT /api/posts/:id/pin {commentId}` returns `{ pinned: CommentView | null }`. Team only.
  - `PostDetail.isTeam: boolean` and `PostDetail.pinned: CommentView | null`, on every post detail: GET, create and edit.

- [ ] **Step 1: Write the failing tests**

In `worker/routes/comments.test.ts`, add after `bodies`:

```ts
const pin = (
  t: TestApp,
  cookie: string | undefined,
  postId: number,
  commentId: number | null
) =>
  t.client.api.posts[":id"].pin.$put(
    { param: { id: String(postId) }, json: { commentId } },
    cookie ? { headers: { cookie } } : undefined
  );

async function readPost(t: TestApp, postId: number, cookie?: string) {
  const res = await t.client.api.posts[":id"].$get(
    { param: { id: String(postId) } },
    cookie ? { headers: { cookie } } : undefined
  );
  const body = await res.json();
  if (!body.success) throw new Error(`post failed: ${body.error}`);
  return body.data;
}
```

And append:

```ts
describe("PUT /api/posts/:id/pin", () => {
  it("lets the team pin a comment, shown with the post", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const reader = await t.signIn();
    const { comment } = await commentOn(
      t,
      reader.cookie,
      post.id,
      "Use the system setting."
    );
    const res = await pin(t, owner.cookie, post.id, comment.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      data: { pinned: { id: comment.id, body: "Use the system setting." } },
    });
    expect(await readPost(t, post.id, reader.cookie)).toMatchObject({
      isTeam: false,
      pinned: { id: comment.id, canDelete: true },
    });
    expect(await readPost(t, post.id, owner.cookie)).toMatchObject({
      isTeam: true,
      pinned: { id: comment.id },
    });
    expect(await readPost(t, post.id)).toMatchObject({
      isTeam: false,
      pinned: { id: comment.id, canDelete: false },
    });
    await t.settle();
  });

  it("unpins with null", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const { comment } = await commentOn(t, owner.cookie, post.id, "Pinned");
    await pin(t, owner.cookie, post.id, comment.id);
    const res = await pin(t, owner.cookie, post.id, null);
    expect(await res.json()).toEqual({ success: true, data: { pinned: null } });
    expect((await readPost(t, post.id)).pinned).toBeNull();
    await t.settle();
  });

  it("is only for the team", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const { comment } = await commentOn(t, owner.cookie, post.id, "Hello");
    const reader = await t.signIn();
    const asReader = await pin(t, reader.cookie, post.id, comment.id);
    expect(asReader.status).toBe(403);
    const signedOut = await pin(t, undefined, post.id, comment.id);
    expect(signedOut.status).toBe(401);
    expect((await readPost(t, post.id)).pinned).toBeNull();
    await t.settle();
  });

  it("refuses a comment from another post, or a deleted one", async () => {
    const t = testApp();
    const { owner, slug, boards, post } = await postByOwner(t);
    const other = await submitPost(t, owner.cookie, slug, {
      boardId: boards[0]!.id,
      title: "Export to CSV",
    });
    const elsewhere = await commentOn(t, owner.cookie, other.id, "Over there");
    const gone = await commentOn(t, owner.cookie, post.id, "Gone");
    await db
      .update(comments)
      .set({ deletedAt: new Date(), body: "" })
      .where(eq(comments.id, gone.comment.id));
    for (const commentId of [elsewhere.comment.id, gone.comment.id]) {
      const res = await pin(t, owner.cookie, post.id, commentId);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({
        fields: { commentId: "COMMENT_UNKNOWN" },
      });
    }
    await t.settle();
  });

  it("answers 404 for a post that doesn't exist", async () => {
    const t = testApp();
    const owner = await t.signIn();
    const res = await pin(t, owner.cookie, 999_999_999, null);
    expect(res.status).toBe(404);
    await t.settle();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test worker/routes/comments.test.ts`

Expected: FAIL. No pin route exists, so every pin answers 404, and post details have no `isTeam` or `pinned`. Only the "doesn't exist" test already passes. Tasks 3 and 4's 24 tests still pass.

- [ ] **Step 3: Add pinning to the service**

In `worker/services/comments.ts`, append:

```ts
/**
 * Pins one of the post's comments above its thread, or unpins with null.
 * Only the team may, and only a comment of this post that isn't deleted.
 */
export async function setPin(
  db: Database,
  input: { postId: number; userId: string; commentId: number | null }
): Promise<CommentView | null> {
  await db.transaction(async (tx) => {
    // The same lock a delete takes, so a comment can't be pinned while it's
    // being deleted.
    const [post] = await tx
      .select({ isTeam: onTeam(input.userId) })
      .from(posts)
      .where(eq(posts.id, input.postId))
      .for("update");
    if (!post) throw new AppError(404, "NOT_FOUND", "Post not found");
    if (!post.isTeam) {
      throw new AppError(403, "FORBIDDEN", "Only the workspace team can do that");
    }
    if (input.commentId !== null) {
      const [comment] = await tx
        .select({ id: comments.id })
        .from(comments)
        .where(
          and(
            eq(comments.id, input.commentId),
            eq(comments.postId, input.postId),
            isNull(comments.deletedAt)
          )
        )
        .limit(1);
      if (!comment) {
        throw new AppError(
          400,
          "BAD_REQUEST",
          "That comment isn't on this post",
          { commentId: "COMMENT_UNKNOWN" }
        );
      }
    }
    await tx
      .update(posts)
      .set({ pinnedCommentId: input.commentId })
      .where(eq(posts.id, input.postId));
  });
  return input.commentId === null
    ? null
    : findComment(db, input.commentId, { id: input.userId, isTeam: true });
}
```

- [ ] **Step 4: Show the pin with the post**

In `shared/posts.ts`, import the comment type:

```ts
import type { CommentView } from "./comments";
```

And add two fields to `PostDetail`, after `canEdit`:

```ts
  /** The person asking wrote it or is on the workspace's team. */
  canEdit: boolean;
  /** The person asking is on the workspace's team: they pin, and delete any comment. */
  isTeam: boolean;
  /** The comment the team pinned above the thread. */
  pinned: CommentView | null;
```

In `worker/services/posts.ts`, import `findComment`:

```ts
import { findComment } from "./comments";
```

In `findPostDetail`, select the pinned comment's id with the rest. The `onTeam` line stays as it is:

```ts
      onTeam: viewerId ? onTeam(viewerId) : sql<boolean>`false`,
      pinnedCommentId: posts.pinnedCommentId,
```

And replace its `return { … }` with:

```ts
  const viewer = { id: viewerId, isTeam: row.onTeam };
  return {
    ...toSummary(row),
    body: row.body,
    workspace: {
      slug: row.workspaceSlug,
      name: row.workspaceName,
      defaultLocale: row.defaultLocale ?? "en",
    },
    canEdit: viewerId !== null && (row.authorId === viewerId || row.onTeam),
    isTeam: row.onTeam,
    pinned:
      row.pinnedCommentId === null
        ? null
        : await findComment(db, row.pinnedCommentId, viewer),
  };
```

In `src/features/votes/vote-button.test.tsx`, add the two fields to the `detail` fixture, after `canEdit: false,`:

```ts
  isTeam: false,
  pinned: null,
```

- [ ] **Step 5: Add the route**

In `worker/routes/comments.ts`:
- Add `PinResult` to the type import: `import type { CommentChange, CommentPage, PinResult } from "@/shared/comments";`
- Add `pinSchema` to the schema import.
- Add `setPin` to the service import.

Then chain the pin route onto `postCommentRoutes`, after the `.post(…)`:

```ts
  .put(
    "/:id/pin",
    requireUser,
    validate("param", idParamSchema),
    validate("json", pinSchema),
    async (c) => {
      const pinned = await setPin(c.var.db, {
        postId: c.req.valid("param").id,
        userId: c.var.user.id,
        commentId: c.req.valid("json").commentId,
      });
      return c.json<SuccessResponse<PinResult>>({
        success: true,
        data: { pinned },
      });
    }
  );
```

Move the `;` that ended the `.post(…)` call to the end of this one, and update the router's doc comment to "Under /posts: a post's thread, commenting on it, and pinning."

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun run test worker/routes/comments.test.ts`

Expected: PASS, 29 tests.

Then run: `bun run test`

Expected: PASS. 41 test files, 322 tests. Phase 2's post tests use `toMatchObject` on details, so the new fields don't disturb them.

- [ ] **Step 7: Commit**

```bash
bun run typecheck
bun run check:fix && bun run check
git add worker shared/posts.ts src/features/votes/vote-button.test.tsx
git commit -m "feat: the team pins a comment above the thread" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Deleting comments without breaking the thread

**Files:**
- Modify: `worker/services/comments.ts` (`deleteComment`)
- Modify: `worker/routes/comments.ts` (`DELETE /comments/:id`)
- Test: `worker/routes/comments.test.ts`

**Interfaces:**
- Consumes: from Task 3, `findComment` and `onTeam`; from Task 4, `commentRoutes`; from Task 5, `pin` and `readPost` in the test file.
- Produces:
  - `deleteComment(db, input: { commentId: number; userId: string }): Promise<CommentChange>`. It returns the deleted comment's view and the post's new count, and throws `AppError` 404 or 403.
  - `DELETE /api/comments/:id` returns `CommentChange`. Open to the author or the team. Repeating it changes nothing.

- [ ] **Step 1: Write the failing tests**

In `worker/routes/comments.test.ts`, add after `readPost`:

```ts
const remove = (t: TestApp, cookie: string | undefined, commentId: number) =>
  t.client.api.comments[":id"].$delete(
    { param: { id: String(commentId) } },
    cookie ? { headers: { cookie } } : undefined
  );
```

And append:

```ts
describe("DELETE /api/comments/:id", () => {
  it("lets the author delete a comment, keeping its place", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const writer = await t.signIn();
    const { comment } = await commentOn(t, writer.cookie, post.id, "Oops");
    const res = await remove(t, writer.cookie, comment.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      data: {
        comment: { id: comment.id, deleted: true, body: "", author: null },
        commentCount: 0,
      },
    });
    const [row] = await db
      .select({ body: comments.body, deletedAt: comments.deletedAt })
      .from(comments)
      .where(eq(comments.id, comment.id));
    expect(row?.body).toBe("");
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect(await tally(post.id)).toEqual({ commentCount: 0, rows: 0 });
    await t.settle();
  });

  it("lets the team delete anyone's comment", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const writer = await t.signIn();
    const { comment } = await commentOn(t, writer.cookie, post.id, "Spam");
    const res = await remove(t, owner.cookie, comment.id);
    expect(res.status).toBe(200);
    expect(await tally(post.id)).toEqual({ commentCount: 0, rows: 0 });
    await t.settle();
  });

  it("refuses everyone else", async () => {
    const t = testApp();
    const { post } = await postByOwner(t);
    const writer = await t.signIn();
    const other = await t.signIn();
    const { comment } = await commentOn(t, writer.cookie, post.id, "Mine");
    expect((await remove(t, other.cookie, comment.id)).status).toBe(403);
    expect((await remove(t, undefined, comment.id)).status).toBe(401);
    expect(await tally(post.id)).toEqual({ commentCount: 1, rows: 1 });
    await t.settle();
  });

  it("changes nothing the second time", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    await commentOn(t, owner.cookie, post.id, "Keep");
    const { comment } = await commentOn(t, owner.cookie, post.id, "Drop");
    await remove(t, owner.cookie, comment.id);
    const again = await remove(t, owner.cookie, comment.id);
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ data: { commentCount: 1 } });
    expect(await tally(post.id)).toEqual({ commentCount: 1, rows: 1 });
    await t.settle();
  });

  it("moves the count once when the same delete arrives five times at once", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    await commentOn(t, owner.cookie, post.id, "Keep");
    const { comment } = await commentOn(t, owner.cookie, post.id, "Drop");
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => remove(t, owner.cookie, comment.id))
    );
    expect(responses.map((res) => res.status)).toEqual(Array(5).fill(200));
    expect(await tally(post.id)).toEqual({ commentCount: 1, rows: 1 });
    await t.settle();
  });

  it("unpins a deleted comment", async () => {
    const t = testApp();
    const { owner, post } = await postByOwner(t);
    const { comment } = await commentOn(t, owner.cookie, post.id, "Pinned");
    await pin(t, owner.cookie, post.id, comment.id);
    await remove(t, owner.cookie, comment.id);
    expect((await readPost(t, post.id)).pinned).toBeNull();
    await t.settle();
  });

  it("answers 404 for a comment that doesn't exist", async () => {
    const t = testApp();
    const owner = await t.signIn();
    expect((await remove(t, owner.cookie, 999_999_999)).status).toBe(404);
    await t.settle();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test worker/routes/comments.test.ts`

Expected: FAIL. No delete route exists, so every delete answers 404 and nothing changes. Only "answers 404 for a comment that doesn't exist" already passes. The 29 earlier tests still pass.

- [ ] **Step 3: Add deleting to the service**

In `worker/services/comments.ts`, append:

```ts
/**
 * Deletes a comment as its author or as the team. The row stays, so its
 * replies keep their place, but its words go. Only the first delete changes
 * the row, so repeating one, or racing it against itself, uncounts it once.
 * A deleted comment can't stay pinned.
 */
export async function deleteComment(
  db: Database,
  input: { commentId: number; userId: string }
): Promise<CommentChange> {
  const [target] = await db
    .select({ postId: comments.postId })
    .from(comments)
    .where(eq(comments.id, input.commentId))
    .limit(1);
  if (!target) throw new AppError(404, "NOT_FOUND", "Comment not found");
  const saved = await db.transaction(async (tx) => {
    // Post first, like every comment write, so writes queue in one order.
    const [post] = await tx
      .select({
        commentCount: posts.commentCount,
        pinnedCommentId: posts.pinnedCommentId,
        isTeam: onTeam(input.userId),
      })
      .from(posts)
      .where(eq(posts.id, target.postId))
      .for("update");
    const [comment] = await tx
      .select({ authorId: comments.authorId })
      .from(comments)
      .where(
        and(
          eq(comments.id, input.commentId),
          eq(comments.postId, target.postId)
        )
      )
      .limit(1);
    if (!post || !comment) {
      throw new AppError(404, "NOT_FOUND", "Comment not found");
    }
    if (comment.authorId !== input.userId && !post.isTeam) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Only the author or the workspace team can do that"
      );
    }
    const changed = await tx
      .update(comments)
      .set({ deletedAt: sql`now()`, body: "" })
      .where(
        and(eq(comments.id, input.commentId), isNull(comments.deletedAt))
      )
      .returning({ id: comments.id });
    if (changed.length === 0) {
      return { commentCount: post.commentCount, isTeam: post.isTeam };
    }
    const [counted] = await tx
      .update(posts)
      .set({
        commentCount: sql`${posts.commentCount} - 1`,
        ...(post.pinnedCommentId === input.commentId
          ? { pinnedCommentId: null }
          : {}),
      })
      .where(eq(posts.id, target.postId))
      .returning({ commentCount: posts.commentCount });
    return {
      commentCount: counted?.commentCount ?? post.commentCount,
      isTeam: post.isTeam,
    };
  });
  const comment = await findComment(db, input.commentId, {
    id: input.userId,
    isTeam: saved.isTeam,
  });
  if (!comment) throw new AppError(404, "NOT_FOUND", "Comment not found");
  return { comment, commentCount: saved.commentCount };
}
```

- [ ] **Step 4: Add the route**

In `worker/routes/comments.ts`, add `deleteComment` to the service import. Then chain the delete route onto `commentRoutes`, after its `.get(…)`, moving the `;` to the end:

```ts
  .delete(
    "/:id",
    requireUser,
    validate("param", idParamSchema),
    async (c) => {
      const result = await deleteComment(c.var.db, {
        commentId: c.req.valid("param").id,
        userId: c.var.user.id,
      });
      return c.json<SuccessResponse<CommentChange>>({
        success: true,
        data: result,
      });
    }
  );
```

Update its doc comment to "Under /comments: one comment's replies, and deleting it."

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test worker/routes/comments.test.ts`

Expected: PASS, 36 tests.

Then run: `bun run test`

Expected: PASS. 41 test files, 329 tests.

- [ ] **Step 6: Commit**

```bash
bun run typecheck
bun run check:fix && bun run check
git add worker
git commit -m "feat: delete comments softly, keeping their replies in place" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: The client's comment queries and cache edits

**Files:**
- Modify: `src/lib/keys.ts` (`commentKeys`, `commentMutationKey`)
- Create: `src/lib/comments.ts` (query options and requests)
- Create: `src/features/posts/post-cache.ts` (`everyCopyOfPost`, moved out of `vote-cache.ts`)
- Modify: `src/features/votes/vote-cache.ts` (use it)
- Create: `src/features/comments/comment-cache.ts`; Test: `src/features/comments/comment-cache.test.ts`

**Interfaces:**
- Consumes:
  - From Phase 2: `applyOptimistic`, `patch`, `patchQueries`, `postKeys`, `api` and `unwrap`.
  - From Task 2: `CommentView`, `CommentPage`, `replyParentId` and `replyDepth`.
  - From Tasks 4–6: the comment routes.
- Produces:
  - Keys:
    - `commentKeys.post(postId)` (prefix), `commentKeys.thread(postId)` and `commentKeys.replies(postId, commentId)`
    - `commentMutationKey(postId) = ["comment", postId]`
  - Query options:
    - `threadQueryOptions(postId)`: infinite, a `number | null` page param, newest first
    - `repliesQueryOptions(postId, commentId)`: infinite, newest page first, each page oldest first
  - Requests: `addComment(postId, { body, parentId? }): Promise<CommentChange>`, `removeComment(commentId): Promise<CommentChange>` and `pinComment(postId, commentId | null): Promise<PinResult>`.
  - `everyCopyOfPost(postId, edit): CachePatch[]`.
  - Cache edits, in `comment-cache.ts`:
    - `draftComment({ postId, parent, body, authorName, official }): CommentView` and `isDraft(comment): boolean`
    - `optimisticAddComment(qc, draft)`, `optimisticDeleteComment(qc, comment)` and `optimisticPin(qc, postId, comment | null)`, each resolving to a rollback
    - `replaceDraft(qc, draftId, saved)`, `writeCommentCount(qc, postId, count)` and `writePin(qc, postId, pinned)`

- [ ] **Step 1: Write the failing tests**

`src/features/comments/comment-cache.test.ts`:

```ts
import { type InfiniteData, QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { commentKeys, type FeedParams, postKeys } from "@/lib/keys";
import type { CommentPage, CommentView } from "@/shared/comments";
import type { FeedPage, PostDetail, PostSummary } from "@/shared/posts";
import {
  draftComment,
  optimisticAddComment,
  optimisticDeleteComment,
  optimisticPin,
  replaceDraft,
  writeCommentCount,
} from "./comment-cache";

type Pages = InfiniteData<CommentPage>;

const comment = (
  id: number,
  overrides: Partial<CommentView> = {}
): CommentView => ({
  id,
  postId: 7,
  parentId: null,
  depth: 0,
  body: `Comment ${id}`,
  author: { name: "Ayşe" },
  official: false,
  deleted: false,
  replyCount: 0,
  replies: [],
  canDelete: false,
  createdAt: "2026-10-01T00:00:00.000Z",
  ...overrides,
});

const summary: PostSummary = {
  id: 7,
  ref: "7-dark-mode",
  title: "Dark mode",
  excerpt: "",
  status: "open",
  voteCount: 3,
  commentCount: 3,
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
  isTeam: false,
  pinned: null,
};
const feedParams: FeedParams = { sort: "trending", page: 1 };
const feedKey = postKeys.feed("acme", feedParams);

/** Two comments, the first with one reply, cached with the post and a feed. */
function seed() {
  const qc = new QueryClient();
  const reply = comment(11, { parentId: 10, depth: 1 });
  qc.setQueryData<Pages>(commentKeys.thread(7), {
    pages: [
      {
        items: [comment(10, { replyCount: 1, replies: [reply] }), comment(9)],
        hasMore: false,
      },
    ],
    pageParams: [null],
  });
  qc.setQueryData(postKeys.detail(7), detail);
  qc.setQueryData<FeedPage>(feedKey, {
    items: [summary],
    page: 1,
    hasMore: false,
  });
  return qc;
}

const threadOf = (qc: QueryClient) =>
  qc.getQueryData<Pages>(commentKeys.thread(7))?.pages[0]?.items ?? [];
const counts = (qc: QueryClient) => ({
  detail: qc.getQueryData<PostDetail>(postKeys.detail(7))?.commentCount,
  feed: qc.getQueryData<FeedPage>(feedKey)?.items[0]?.commentCount,
});
const draft = (parent: CommentView | null, body = "New") =>
  draftComment({ postId: 7, parent, body, authorName: "Bora", official: false });

describe("comment cache", () => {
  it("drafts a comment with a temporary negative id", () => {
    const first = draft(null, "  New  ");
    const second = draft(null);
    expect(first).toMatchObject({
      postId: 7,
      parentId: null,
      depth: 0,
      body: "New",
      author: { name: "Bora" },
    });
    expect(first.id).toBeLessThan(0);
    expect(second.id).not.toBe(first.id);
  });

  it("drafts a reply to the deepest comment beside it", () => {
    const deepest = comment(20, { parentId: 19, depth: 3 });
    expect(draft(deepest)).toMatchObject({ parentId: 19, depth: 3 });
  });

  it("puts a new comment atop the thread, counted wherever the post shows", async () => {
    const qc = seed();
    const added = draft(null);
    await optimisticAddComment(qc, added);
    expect(threadOf(qc).map((c) => c.id)).toEqual([added.id, 10, 9]);
    expect(counts(qc)).toEqual({ detail: 4, feed: 4 });
  });

  it("adds a reply last among its parent's replies, open reply pages included", async () => {
    const qc = seed();
    qc.setQueryData<Pages>(commentKeys.replies(7, 10), {
      pages: [
        { items: [comment(11, { parentId: 10, depth: 1 })], hasMore: false },
      ],
      pageParams: [null],
    });
    const reply = draft(threadOf(qc)[0]!);
    await optimisticAddComment(qc, reply);
    expect(threadOf(qc)[0]?.replyCount).toBe(2);
    expect(threadOf(qc)[0]?.replies.map((c) => c.id)).toEqual([11, reply.id]);
    const pages = qc.getQueryData<Pages>(commentKeys.replies(7, 10));
    expect(pages?.pages[0]?.items.map((c) => c.id)).toEqual([11, reply.id]);
  });

  it("rolls a failed comment back out of every list and count", async () => {
    const qc = seed();
    const rollback = await optimisticAddComment(qc, draft(threadOf(qc)[0]!));
    rollback();
    expect(threadOf(qc)[0]).toMatchObject({
      replyCount: 1,
      replies: [{ id: 11 }],
    });
    expect(counts(qc)).toEqual({ detail: 3, feed: 3 });
  });

  it("swaps the saved comment in for its draft", async () => {
    const qc = seed();
    const added = draft(null, "Saved soon");
    await optimisticAddComment(qc, added);
    replaceDraft(qc, added.id, comment(12, { body: "Saved soon", canDelete: true }));
    expect(threadOf(qc)[0]).toMatchObject({
      id: 12,
      body: "Saved soon",
      canDelete: true,
    });
  });

  it("shows a deleted comment as a placeholder, unpinned and uncounted", async () => {
    const qc = seed();
    const reply = threadOf(qc)[0]!.replies[0]!;
    qc.setQueryData<PostDetail>(postKeys.detail(7), { ...detail, pinned: reply });
    await optimisticDeleteComment(qc, reply);
    expect(threadOf(qc)[0]?.replies[0]).toMatchObject({
      id: 11,
      deleted: true,
      body: "",
      author: null,
      canDelete: false,
    });
    expect(qc.getQueryData<PostDetail>(postKeys.detail(7))?.pinned).toBeNull();
    expect(counts(qc)).toEqual({ detail: 2, feed: 2 });
  });

  it("pins on the post's page at once, and rolls the pin back", async () => {
    const qc = seed();
    const rollback = await optimisticPin(qc, 7, threadOf(qc)[1]!);
    expect(
      qc.getQueryData<PostDetail>(postKeys.detail(7))?.pinned
    ).toMatchObject({ id: 9, replies: [] });
    rollback();
    expect(qc.getQueryData<PostDetail>(postKeys.detail(7))?.pinned).toBeNull();
  });

  it("writes the server's count wherever the post shows", () => {
    const qc = seed();
    writeCommentCount(qc, 7, 5);
    expect(counts(qc)).toEqual({ detail: 5, feed: 5 });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test src/features/comments/comment-cache.test.ts`

Expected: FAIL. `./comment-cache` doesn't exist, and `commentKeys` isn't exported from `@/lib/keys`.

- [ ] **Step 3: Add the keys and the requests**

In `src/lib/keys.ts`, append:

```ts
/**
 * Query keys for comments. A post's thread and every reply page under it
 * share the post's prefix, so one call reaches all of them.
 */
export const commentKeys = {
  all: ["comments"] as const,
  post: (postId: number) => ["comments", postId] as const,
  thread: (postId: number) => ["comments", postId, "thread"] as const,
  replies: (postId: number, commentId: number) =>
    ["comments", postId, "replies", commentId] as const,
};

/** Every change to one post's comments shares this key, so they can be counted. */
export const commentMutationKey = (postId: number) =>
  ["comment", postId] as const;
```

`src/lib/comments.ts`:

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

/** A post's top-level comments, newest first; each next page is older. */
export const threadQueryOptions = (postId: number) =>
  infiniteQueryOptions({
    queryKey: commentKeys.thread(postId),
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.posts[":id"].comments.$get({
          param: { id: String(postId) },
          query: pageQuery(pageParam),
        })
      ),
    initialPageParam: null as number | null,
    // The oldest comment so far is the last one.
    getNextPageParam: (page) =>
      page.hasMore ? (page.items.at(-1)?.id ?? null) : null,
    staleTime: 30_000,
  });

/** A comment's replies: newest page first, each page oldest first. */
export const repliesQueryOptions = (postId: number, commentId: number) =>
  infiniteQueryOptions({
    queryKey: commentKeys.replies(postId, commentId),
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.comments[":id"].replies.$get({
          param: { id: String(commentId) },
          query: pageQuery(pageParam),
        })
      ),
    initialPageParam: null as number | null,
    // The oldest reply so far is the first one on the last page.
    getNextPageParam: (page) =>
      page.hasMore ? (page.items[0]?.id ?? null) : null,
    staleTime: 30_000,
  });

export async function addComment(
  postId: number,
  json: { body: string; parentId?: number }
) {
  return unwrap(
    await api.posts[":id"].comments.$post({
      param: { id: String(postId) },
      json,
    })
  );
}

export async function removeComment(commentId: number) {
  return unwrap(
    await api.comments[":id"].$delete({ param: { id: String(commentId) } })
  );
}

export async function pinComment(postId: number, commentId: number | null) {
  return unwrap(
    await api.posts[":id"].pin.$put({
      param: { id: String(postId) },
      json: { commentId },
    })
  );
}
```

- [ ] **Step 4: Share "every copy of a post" between votes and comments**

`src/features/posts/post-cache.ts`:

```ts
import type { Draft } from "immer";
import { postKeys } from "@/lib/keys";
import { type CachePatch, patch } from "@/lib/optimistic";
import type { FeedPage, PostDetail, PostSummary } from "@/shared/posts";

/**
 * The same edit to one post wherever it's cached: every feed page, its own
 * page, and the similar-requests lists.
 */
export function everyCopyOfPost(
  postId: number,
  edit: (post: Draft<PostSummary>) => void
): CachePatch[] {
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
```

Replace `src/features/votes/vote-cache.ts` with:

```ts
import type { QueryClient } from "@tanstack/react-query";
import { everyCopyOfPost } from "@/features/posts/post-cache";
import { applyOptimistic, patchQueries } from "@/lib/optimistic";
import type { VoteResult } from "@/shared/posts";

/** Flips this person's vote everywhere at once; resolves to a rollback. */
export function optimisticVote(
  qc: QueryClient,
  postId: number,
  voted: boolean
) {
  return applyOptimistic(
    qc,
    everyCopyOfPost(postId, (post) => {
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
    everyCopyOfPost(postId, (post) => {
      post.voted = result.voted;
      post.voteCount = result.voteCount;
    })
  );
}
```

- [ ] **Step 5: Add the comment cache edits**

`src/features/comments/comment-cache.ts`:

```ts
import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { Draft } from "immer";
import { everyCopyOfPost } from "@/features/posts/post-cache";
import { commentKeys, postKeys } from "@/lib/keys";
import {
  applyOptimistic,
  type CachePatch,
  patch,
  patchQueries,
} from "@/lib/optimistic";
import {
  type CommentPage,
  type CommentView,
  replyDepth,
  replyParentId,
} from "@/shared/comments";
import type { PostDetail } from "@/shared/posts";

type Pages = InfiniteData<CommentPage>;
type Edit = (comment: Draft<CommentView>) => void;

let lastDraftId = 0;

/**
 * A comment as it will look once saved, to show while it's sent. Its id is
 * negative, which marks it as a draft, until the server's copy replaces it.
 */
export function draftComment(input: {
  postId: number;
  parent: CommentView | null;
  body: string;
  authorName: string;
  official: boolean;
}): CommentView {
  lastDraftId -= 1;
  return {
    id: lastDraftId,
    postId: input.postId,
    parentId: input.parent ? replyParentId(input.parent) : null,
    depth: input.parent ? replyDepth(input.parent) : 0,
    body: input.body.trim(),
    author: { name: input.authorName },
    official: input.official,
    deleted: false,
    replyCount: 0,
    replies: [],
    canDelete: false,
    createdAt: new Date().toISOString(),
  };
}

export const isDraft = (comment: Pick<CommentView, "id">) => comment.id < 0;

function editAll(list: Draft<CommentView>[], edit: Edit) {
  for (const comment of list) {
    edit(comment);
    editAll(comment.replies, edit);
  }
}

/**
 * The same edit to every cached comment of a post: its thread, its open
 * reply pages, and the replies shown inside them.
 */
function everyComment(postId: number, edit: Edit): CachePatch {
  return patch<Pages>({ queryKey: commentKeys.post(postId) }, (data) => {
    for (const page of data.pages) editAll(page.items, edit);
  });
}

function countBy(postId: number, delta: number): CachePatch[] {
  return everyCopyOfPost(postId, (post) => {
    post.commentCount = Math.max(0, post.commentCount + delta);
  });
}

function pinnedIs(postId: number, comment: CommentView | null): CachePatch {
  return patch<PostDetail>({ queryKey: postKeys.detail(postId) }, (post) => {
    // The pinned copy shows without replies; the thread has them.
    post.pinned = comment === null ? null : { ...comment, replies: [] };
  });
}

/**
 * Shows a new comment at once: atop the thread, or last among its parent's
 * replies, and counts it on the parent and the post. Resolves to a rollback.
 */
export function optimisticAddComment(qc: QueryClient, draft: CommentView) {
  const { postId, parentId } = draft;
  const patches = countBy(postId, 1);
  if (parentId === null) {
    patches.push(
      patch<Pages>(
        { queryKey: commentKeys.thread(postId), exact: true },
        (data) => {
          data.pages[0]?.items.unshift(draft);
        }
      )
    );
  } else {
    patches.push(
      everyComment(postId, (comment) => {
        if (comment.id !== parentId) return;
        comment.replyCount += 1;
        comment.replies.push(draft);
      }),
      // The parent's reply pages, when open: the first page holds the newest
      // replies, oldest first.
      patch<Pages>(
        { queryKey: commentKeys.replies(postId, parentId), exact: true },
        (data) => {
          data.pages[0]?.items.push(draft);
        }
      )
    );
  }
  return applyOptimistic(qc, patches);
}

/** Puts the server's copy of a comment where its draft was. */
export function replaceDraft(
  qc: QueryClient,
  draftId: number,
  saved: CommentView
) {
  patchQueries(qc, [
    everyComment(saved.postId, (comment) => {
      if (comment.id === draftId) Object.assign(comment, saved);
    }),
  ]);
}

/**
 * Shows a comment as deleted at once: a placeholder, unpinned, and no longer
 * counted on the post. Resolves to a rollback.
 */
export function optimisticDeleteComment(
  qc: QueryClient,
  target: CommentView
) {
  return applyOptimistic(qc, [
    everyComment(target.postId, (comment) => {
      if (comment.id !== target.id) return;
      comment.deleted = true;
      comment.body = "";
      comment.author = null;
      comment.official = false;
      comment.canDelete = false;
    }),
    patch<PostDetail>(
      { queryKey: postKeys.detail(target.postId) },
      (post) => {
        if (post.pinned?.id === target.id) post.pinned = null;
      }
    ),
    ...countBy(target.postId, -1),
  ]);
}

/** Pins `comment` above the thread at once, or unpins with null. Resolves to a rollback. */
export function optimisticPin(
  qc: QueryClient,
  postId: number,
  comment: CommentView | null
) {
  return applyOptimistic(qc, [pinnedIs(postId, comment)]);
}

export function writePin(
  qc: QueryClient,
  postId: number,
  pinned: CommentView | null
) {
  patchQueries(qc, [pinnedIs(postId, pinned)]);
}

/** Writes the server's comment count wherever the post is cached. */
export function writeCommentCount(
  qc: QueryClient,
  postId: number,
  commentCount: number
) {
  patchQueries(
    qc,
    everyCopyOfPost(postId, (post) => {
      post.commentCount = commentCount;
    })
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun run test src/features/comments/comment-cache.test.ts src/features/votes`

Expected: PASS. 9 tests in `comment-cache.test.ts`, and the 3 vote-button tests still pass on the shared `everyCopyOfPost`.

Then run: `bun run test`

Expected: PASS. 42 test files, 338 tests.

- [ ] **Step 7: Commit**

```bash
bun run typecheck
bun run check:fix && bun run check
git add src/lib src/features
git commit -m "feat: comment queries and optimistic cache edits for threads" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 8: The thread on the post page

**Files:**
- Create: `src/features/comments/thread-context.ts`
- Create: `src/features/comments/comment-item.tsx` (`CommentItem`, `CommentByline`, the replies list)
- Create: `src/features/comments/comment-thread.tsx` (`CommentThread`, the pinned comment)
- Modify:
  - `src/routes/p/$ref.tsx`: render the thread, and start loading it with the post
  - `src/features/posts/post-card.tsx`: the comment count
  - `src/i18n/messages/en.json` and `src/i18n/messages/tr.json`: the `comments` namespace
- Test: `src/features/comments/comment-thread.test.tsx`

**Interfaces:**
- Consumes:
  - From Task 7: `threadQueryOptions`, `repliesQueryOptions` and `isDraft`.
  - From Task 5: `PostDetail.pinned` and `isTeam`.
  - From Phase 2: `Markdown`, `AuthorName`, `postQueryOptions` and the `Button` sizes `xs`, `icon-xs` and `sm`.
- Produces:
  - `CommentThread({ post }: { post: PostDetail })`.
  - `CommentItem({ comment })` and `CommentByline({ comment })`.
  - `ThreadContext` and `useThread(): ThreadState`, with `ThreadState = { post: PostDetail }`. Task 9 widens it.
  - Catalog keys `comments.*`: heading, count, listLabel, loading, loadFailed, empty, olderComments, earlierReplies, moreReplies, hideReplies, showReplies, deleted, team, pinned and pinnedByTeam.

- [ ] **Step 1: Write the failing tests**

`src/features/comments/comment-thread.test.tsx`:

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
import en from "@/i18n/messages/en.json";
import { type FeedParams, postKeys } from "@/lib/keys";
import { postQueryOptions } from "@/lib/posts";
import type { CommentView } from "@/shared/comments";
import type { PostDetail, PostSummary } from "@/shared/posts";
import { CommentThread } from "./comment-thread";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const comment = (
  id: number,
  body: string,
  overrides: Partial<CommentView> = {}
): CommentView => ({
  id,
  postId: 7,
  parentId: null,
  depth: 0,
  body,
  author: { name: "Ayşe" },
  official: false,
  deleted: false,
  replyCount: 0,
  replies: [],
  canDelete: false,
  createdAt: "2026-10-01T00:00:00.000Z",
  ...overrides,
});

const summary: PostSummary = {
  id: 7,
  ref: "7-dark-mode",
  title: "Dark mode",
  excerpt: "",
  status: "open",
  voteCount: 3,
  commentCount: 6,
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
  isTeam: false,
  pinned: null,
};
const feedParams: FeedParams = { sort: "trending", page: 1 };

/**
 * What the fake server starts with: four top-level comments, newest first,
 * one of them deleted, and three replies to the newest. Six aren't deleted.
 */
function startingThread() {
  return {
    top: [
      comment(10, "Comment A", { replyCount: 3 }),
      comment(8, "My comment", { author: { name: "Bora" }, canDelete: true }),
      comment(6, "", { deleted: true, author: null }),
      comment(5, "Comment C"),
    ],
    replies: new Map<number, CommentView[]>([
      [
        10,
        [
          comment(11, "Reply 11", { parentId: 10, depth: 1 }),
          comment(12, "Reply 12", {
            parentId: 10,
            depth: 1,
            author: { name: "Bora" },
          }),
          comment(13, "Reply 13", {
            parentId: 10,
            depth: 1,
            author: { name: "Can" },
            official: true,
          }),
        ],
      ],
    ]),
  };
}

type ServerOptions = { top?: CommentView[]; pinnedId?: number | null };

/**
 * A stand-in for the API that keeps the thread in memory. It answers after
 * 20 ms, pages top-level comments three at a time, and lists each comment's
 * latest two replies with it.
 */
function fakeServer({ top, pinnedId = null }: ServerOptions = {}) {
  const start = startingThread();
  const state = {
    top: top ?? start.top,
    replies: start.replies,
    pinnedId,
    commentCount: 6,
  };
  const find = (id: number) =>
    [...state.top, ...[...state.replies.values()].flat()].find(
      (c) => c.id === id
    );
  const withLatest = (c: CommentView): CommentView => ({
    ...c,
    replies: (state.replies.get(c.id) ?? [])
      .slice(-2)
      .map((reply) => ({ ...reply, replies: [] })),
  });
  const ok = (data: unknown, status = 200) =>
    Response.json({ success: true, data }, { status });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const method = init?.method ?? "GET";
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (url.pathname === "/api/me") {
        return ok({
          user: { id: "u1", name: "Bora", email: "bora@example.com" },
          workspaces: [],
        });
      }
      if (url.pathname === "/api/posts/7" && method === "GET") {
        const pinned =
          state.pinnedId === null ? undefined : find(state.pinnedId);
        return ok({
          ...detail,
          commentCount: state.commentCount,
          pinned: pinned ? { ...pinned, replies: [] } : null,
        });
      }
      if (url.pathname === "/api/posts/7/comments" && method === "GET") {
        const before = Number(
          url.searchParams.get("before") ?? Number.POSITIVE_INFINITY
        );
        const older = state.top.filter((c) => c.id < before);
        return ok({
          items: older.slice(0, 3).map(withLatest),
          hasMore: older.length > 3,
        });
      }
      const replies = /^\/api\/comments\/(\d+)\/replies$/.exec(url.pathname);
      if (replies && method === "GET") {
        return ok({
          items: (state.replies.get(Number(replies[1])) ?? []).map(withLatest),
          hasMore: false,
        });
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
  return data ? <CommentThread post={data} /> : null;
}

/** The thread under the post, with the post and a feed page already cached. */
function renderThread(post: Partial<PostDetail> = {}) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  qc.setQueryData(postKeys.detail(7), { ...detail, ...post });
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
  return { qc };
}

/** The comment a piece of text belongs to. */
async function itemOf(text: string) {
  const node = await screen.findByText(text);
  const item = node.closest("li");
  if (!item) throw new Error(`"${text}" isn't in a comment`);
  return item;
}

describe("CommentThread", () => {
  it("shows comments with their latest replies, the Team badge and deleted placeholders", async () => {
    fakeServer();
    renderThread();
    expect(await screen.findByText("Comment A")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "6 comments" })).toBeTruthy();
    expect(screen.getByText("Reply 12")).toBeTruthy();
    expect(screen.queryByText("Reply 11")).toBeNull();
    expect(within(await itemOf("Reply 13")).getByText("Team")).toBeTruthy();
    expect(screen.getByText("Comment deleted")).toBeTruthy();
  });

  it("shows earlier replies on request, oldest first", async () => {
    fakeServer();
    renderThread();
    fireEvent.click(
      await screen.findByRole("button", { name: "Show 1 earlier reply" })
    );
    expect(await screen.findByText("Reply 11")).toBeTruthy();
    const order = screen
      .getAllByText(/^Reply \d+$/)
      .map((node) => node.textContent);
    expect(order).toEqual(["Reply 11", "Reply 12", "Reply 13"]);
    expect(screen.queryByRole("button", { name: /earlier repl/ })).toBeNull();
  });

  it("loads older comments on request", async () => {
    fakeServer();
    renderThread();
    fireEvent.click(
      await screen.findByRole("button", { name: "Show older comments" })
    );
    expect(await screen.findByText("Comment C")).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Show older comments" })
      ).toBeNull()
    );
  });

  it("shows the pinned comment above the thread, and marks it in place", async () => {
    fakeServer({ pinnedId: 8 });
    renderThread({
      pinned: comment(8, "My comment", { author: { name: "Bora" } }),
    });
    const pinned = await screen.findByRole("region", {
      name: "Pinned by the team",
    });
    expect(within(pinned).getByText("My comment")).toBeTruthy();
    const list = await screen.findByRole("list", { name: "Comments" });
    expect(within(list).getByText("Pinned")).toBeTruthy();
  });

  it("renders a comment's Markdown without its HTML", async () => {
    fakeServer({
      top: [comment(20, 'This is **bold** <img src="x" onerror="alert(1)">')],
    });
    renderThread();
    expect((await screen.findByText("bold")).tagName).toBe("STRONG");
    expect(document.querySelector("li img")).toBeNull();
  });

  it("hides and shows a comment's replies", async () => {
    fakeServer();
    renderThread();
    const item = await itemOf("Comment A");
    fireEvent.click(within(item).getByRole("button", { name: "Hide replies" }));
    expect(screen.queryByText("Reply 12")).toBeNull();
    fireEvent.click(within(item).getByRole("button", { name: "Show replies" }));
    expect(screen.getByText("Reply 12")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test src/features/comments/comment-thread.test.tsx`

Expected: FAIL. `./comment-thread` doesn't exist.

- [ ] **Step 3: Add the catalog keys**

In `src/i18n/messages/en.json`, add a namespace after `post`:

```json
  "comments": {
    "heading": "{count, plural, =0 {Comments} one {# comment} other {# comments}}",
    "count": "{count, plural, =0 {No comments} one {# comment} other {# comments}}",
    "listLabel": "Comments",
    "loading": "Loading comments…",
    "loadFailed": "Couldn't load comments. Reload the page to try again.",
    "empty": "No comments yet.",
    "olderComments": "Show older comments",
    "earlierReplies": "{count, plural, one {Show # earlier reply} other {Show # earlier replies}}",
    "moreReplies": "Show earlier replies",
    "hideReplies": "Hide replies",
    "showReplies": "Show replies",
    "deleted": "Comment deleted",
    "team": "Team",
    "pinned": "Pinned",
    "pinnedByTeam": "Pinned by the team"
  },
```

In `src/i18n/messages/tr.json`, the same place:

```json
  "comments": {
    "heading": "{count, plural, =0 {Yorumlar} other {# yorum}}",
    "count": "{count, plural, =0 {Yorum yok} other {# yorum}}",
    "listLabel": "Yorumlar",
    "loading": "Yorumlar yükleniyor…",
    "loadFailed": "Yorumlar yüklenemedi. Tekrar denemek için sayfayı yenileyin.",
    "empty": "Henüz yorum yok.",
    "olderComments": "Daha eski yorumları göster",
    "earlierReplies": "Önceki {count} yanıtı göster",
    "moreReplies": "Önceki yanıtları göster",
    "hideReplies": "Yanıtları gizle",
    "showReplies": "Yanıtları göster",
    "deleted": "Yorum silindi",
    "team": "Ekip",
    "pinned": "Sabitlendi",
    "pinnedByTeam": "Ekip tarafından sabitlendi"
  },
```

Turkish needs no plural forms for a counted noun ("1 yorum", "6 yorum"), so its messages use only `other` or a plain `{count}`. The parity test compares argument names, and both sides use `count`.

- [ ] **Step 4: Add the thread**

`src/features/comments/thread-context.ts`:

```ts
import { createContext, useContext } from "react";
import type { PostDetail } from "@/shared/posts";

/** What every comment in a thread needs to know about the thread. */
export type ThreadState = { post: PostDetail };

export const ThreadContext = createContext<ThreadState | null>(null);

/** The thread around a comment. Only for components inside CommentThread. */
export function useThread(): ThreadState {
  const state = useContext(ThreadContext);
  if (!state) throw new Error("useThread must be used inside CommentThread");
  return state;
}
```

`src/features/comments/comment-item.tsx`:

```tsx
import { useInfiniteQuery } from "@tanstack/react-query";
import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { useFormatter, useNow, useTranslations } from "use-intl";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { AuthorName } from "@/features/posts/author-name";
import { repliesQueryOptions } from "@/lib/comments";
import { cn } from "@/lib/utils";
import type { CommentView } from "@/shared/comments";
import { isDraft } from "./comment-cache";
import { useThread } from "./thread-context";

/** One comment: who wrote it and when, its words, and its replies. */
export function CommentItem({ comment }: { comment: CommentView }) {
  const t = useTranslations("comments");
  const { post } = useThread();
  const [showReplies, setShowReplies] = useState(true);
  const draft = isDraft(comment);
  return (
    <li
      className={cn("flex flex-col gap-2", draft && "opacity-60")}
      aria-busy={draft || undefined}
    >
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
        <CommentByline comment={comment} />
        {post.pinned?.id === comment.id && (
          <span className="font-medium text-foreground">{t("pinned")}</span>
        )}
        {comment.replyCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-expanded={showReplies}
            aria-label={showReplies ? t("hideReplies") : t("showReplies")}
            onClick={() => setShowReplies((shown) => !shown)}
          >
            {showReplies ? (
              <Minus aria-hidden="true" />
            ) : (
              <Plus aria-hidden="true" />
            )}
          </Button>
        )}
      </div>
      {comment.deleted ? (
        <p className="text-muted-foreground text-sm italic">{t("deleted")}</p>
      ) : (
        <Markdown>{comment.body}</Markdown>
      )}
      {showReplies && <Replies comment={comment} />}
    </li>
  );
}

/** Who wrote a comment, the Team badge, and when. A deleted one shows only when. */
export function CommentByline({ comment }: { comment: CommentView }) {
  const t = useTranslations("comments");
  const format = useFormatter();
  const now = useNow();
  return (
    <>
      {!comment.deleted && (
        <span className="font-medium text-foreground">
          <AuthorName author={comment.author} />
        </span>
      )}
      {comment.official && (
        <span className="rounded-full bg-primary px-2 py-0.5 font-medium text-primary-foreground">
          {t("team")}
        </span>
      )}
      <time dateTime={comment.createdAt}>
        {format.relativeTime(new Date(comment.createdAt), now)}
      </time>
    </>
  );
}

/**
 * A comment's replies, oldest first. At first these are the latest ones
 * its page brought along. Asking for earlier ones switches to the reply
 * pages: newest page first, each page oldest first.
 */
function Replies({ comment }: { comment: CommentView }) {
  const t = useTranslations("comments");
  const [expanded, setExpanded] = useState(false);
  const pages = useInfiniteQuery({
    ...repliesQueryOptions(comment.postId, comment.id),
    enabled: expanded,
  });
  const data = expanded ? pages.data : undefined;
  const list = data
    ? [...data.pages].reverse().flatMap((page) => page.items)
    : comment.replies;
  const remaining = comment.replyCount - list.length;
  const hasEarlier = data ? pages.hasNextPage : remaining > 0;
  if (list.length === 0 && !hasEarlier) return null;
  return (
    <div className="flex flex-col gap-3 border-l pl-4">
      {hasEarlier && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto self-start p-0"
          disabled={pages.isFetching}
          onClick={() => {
            if (data) void pages.fetchNextPage();
            else setExpanded(true);
          }}
        >
          {remaining > 0
            ? t("earlierReplies", { count: remaining })
            : t("moreReplies")}
        </Button>
      )}
      {list.length > 0 && (
        <ol className="flex flex-col gap-3">
          {list.map((reply) => (
            <CommentItem key={reply.id} comment={reply} />
          ))}
        </ol>
      )}
    </div>
  );
}
```

`src/features/comments/comment-thread.tsx`:

```tsx
import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslations } from "use-intl";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { threadQueryOptions } from "@/lib/comments";
import type { CommentView } from "@/shared/comments";
import type { PostDetail } from "@/shared/posts";
import { CommentByline, CommentItem } from "./comment-item";
import { ThreadContext } from "./thread-context";

/** A post's comments: the pinned one, then the thread, newest first. */
export function CommentThread({ post }: { post: PostDetail }) {
  const t = useTranslations("comments");
  const thread = useInfiniteQuery(threadQueryOptions(post.id));
  const state = useMemo(() => ({ post }), [post]);
  const items = thread.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <ThreadContext value={state}>
      <section
        aria-labelledby="comments-heading"
        className="flex flex-col gap-4"
      >
        <h2 id="comments-heading" className="font-semibold text-lg">
          {t("heading", { count: post.commentCount })}
        </h2>
        {post.pinned && <PinnedComment comment={post.pinned} />}
        {thread.isPending ? (
          <p className="text-muted-foreground text-sm">{t("loading")}</p>
        ) : thread.isError ? (
          <p className="text-destructive text-sm" role="alert">
            {t("loadFailed")}
          </p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <ol aria-label={t("listLabel")} className="flex flex-col gap-5">
            {items.map((comment) => (
              <CommentItem key={comment.id} comment={comment} />
            ))}
          </ol>
        )}
        {thread.hasNextPage && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={thread.isFetchingNextPage}
            onClick={() => void thread.fetchNextPage()}
          >
            {t("olderComments")}
          </Button>
        )}
      </section>
    </ThreadContext>
  );
}

/** The team's pinned comment, above the thread. */
function PinnedComment({ comment }: { comment: CommentView }) {
  const t = useTranslations("comments");
  return (
    <section
      aria-label={t("pinnedByTeam")}
      className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-4"
    >
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
        <span className="font-medium text-foreground">
          {t("pinnedByTeam")}
        </span>
        <CommentByline comment={comment} />
      </div>
      <Markdown>{comment.body}</Markdown>
    </section>
  );
}
```

- [ ] **Step 5: Put the thread under the post, and the count in the feed**

In `src/routes/p/$ref.tsx`, import the thread and its query:

```tsx
import { CommentThread } from "@/features/comments/comment-thread";
import { threadQueryOptions } from "@/lib/comments";
```

In the loader, after the stale-slug `redirect` block:

```tsx
    // Comments start loading with the post instead of after it renders.
    void context.queryClient.prefetchInfiniteQuery(threadQueryOptions(id));
```

And in `PostPage`, after the closing `</article>`:

```tsx
      </article>
      <CommentThread post={post} />
```

In `src/features/posts/post-card.tsx`:
- Import the icon: `import { MessageSquare } from "lucide-react";`.
- Import `useTranslations` alongside `useFormatter`: `import { useFormatter, useTranslations } from "use-intl";`.
- In `PostCard`, add `const tComments = useTranslations("comments");`.
- After the `<time>` element, add:

```tsx
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <MessageSquare aria-hidden="true" className="size-3.5" />
            <span aria-hidden="true">{post.commentCount}</span>
            <span className="sr-only">
              {tComments("count", { count: post.commentCount })}
            </span>
          </span>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun run test src/features/comments src/i18n`

Expected: PASS. 6 tests in `comment-thread.test.tsx`, 9 in `comment-cache.test.ts`, and both catalog tests.

Then run: `bun run test`

Expected: PASS. 43 test files, 344 tests.

- [ ] **Step 7: Commit**

The browser checks wait for Task 10, once the thread can take comments.

```bash
bun run typecheck
bun run check:fix && bun run check
bun run build
git add src
git commit -m "feat: the comment thread under each post, with replies, placeholders and the pinned comment" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the typecheck, Biome and the build pass.

---
### Task 9: Commenting, deleting and pinning in the thread

**Files:**
- Create: `src/features/comments/use-comment-actions.ts` (`useAddComment`, `useDeleteComment`, `usePinComment`)
- Create: `src/features/comments/form-schema.ts`; Test: `src/features/comments/form-schema.test.ts`
- Create: `src/features/comments/comment-composer.tsx` (`CommentComposer`, `SignInToComment`)
- Modify:
  - `src/features/comments/thread-context.ts`, replaced whole: who's reading, and the one open reply box
  - `src/features/comments/comment-thread.tsx`, replaced whole: the comment box, the sign-in link, unpinning
  - `src/features/comments/comment-item.tsx`: Reply, Pin and Delete, and the reply box
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/tr.json` (the comment box and the actions)
- Test: `src/features/comments/comment-thread.test.tsx`

**Interfaces:**
- Consumes:
  - From Task 7: `draftComment`, `isDraft`, `optimisticAddComment`, `optimisticDeleteComment`, `optimisticPin`, `replaceDraft`, `writeCommentCount`, `writePin`, `addComment`, `removeComment`, `pinComment`, `commentKeys` and `commentMutationKey`.
  - From Task 8: `CommentThread`, `CommentItem`, `CommentByline` and its test harness.
  - From Phase 2: `meQueryOptions`, `updateMe`, `displayNameSchema` and `FieldError`.
- Produces:
  - `useAddComment(postId)`, a mutation taking a draft `CommentView`.
  - `useDeleteComment(postId)`, a mutation taking a `CommentView`.
  - `usePinComment(postId)`, a mutation taking a `CommentView | null`.
  - `commentFormSchema(needsName: boolean)`.
  - `CommentComposer({ parent: CommentView | null; onClose?: () => void })` and `SignInToComment()`.
  - `ThreadState = { post; viewerName: string | null; replyingTo: number | null; setReplyingTo }`.

- [ ] **Step 1: Write the failing tests**

`src/features/comments/form-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { commentFormSchema } from "./form-schema";

describe("commentFormSchema", () => {
  it("needs a name only while the person has none", () => {
    const unnamed = { name: "", body: "Hi" };
    expect(commentFormSchema(false).safeParse(unnamed).success).toBe(true);
    expect(commentFormSchema(true).safeParse(unnamed).success).toBe(false);
  });

  it("refuses a blank comment", () => {
    const blank = { name: "", body: "   " };
    expect(commentFormSchema(false).safeParse(blank).success).toBe(false);
  });
});
```

In `src/features/comments/comment-thread.test.tsx`, make five changes.

1. Add `FeedPage` to the type import: `import type { FeedPage, PostDetail, PostSummary } from "@/shared/posts";`.

2. After the imports, mock the toasts:

```tsx
const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));
```

3. Reset the mock in `afterEach`:

```tsx
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  toastError.mockReset();
});
```

4. Replace `ServerOptions` and `fakeServer` with this version. It also takes writes, and records them:

```tsx
type ServerOptions = {
  top?: CommentView[];
  pinnedId?: number | null;
  /** Every write answers 500. */
  failWrites?: boolean;
  /** The signed-in person is on the workspace's team. */
  isTeam?: boolean;
  /** The signed-in person's name: "" until they pick one. */
  viewerName?: string;
};

/**
 * A stand-in for the API that keeps the thread in memory. It answers after
 * 20 ms, pages top-level comments three at a time, lists each comment's
 * latest two replies with it, and records every write in `received`.
 */
function fakeServer({
  top,
  pinnedId = null,
  failWrites = false,
  isTeam = false,
  viewerName = "Bora",
}: ServerOptions = {}) {
  const start = startingThread();
  const state = {
    top: top ?? start.top,
    replies: start.replies,
    pinnedId,
    commentCount: 6,
    name: viewerName,
    nextId: 100,
    received: [] as unknown[],
  };
  const find = (id: number) =>
    [...state.top, ...[...state.replies.values()].flat()].find(
      (c) => c.id === id
    );
  const withLatest = (c: CommentView): CommentView => ({
    ...c,
    replies: (state.replies.get(c.id) ?? [])
      .slice(-2)
      .map((reply) => ({ ...reply, replies: [] })),
  });
  const pinnedView = () => {
    const pinned = state.pinnedId === null ? undefined : find(state.pinnedId);
    return pinned ? { ...pinned, replies: [] } : null;
  };
  const ok = (data: unknown, status = 200) =>
    Response.json({ success: true, data }, { status });
  const failed = () =>
    Response.json(
      { success: false, code: "INTERNAL_ERROR", error: "boom" },
      { status: 500 }
    );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const method = init?.method ?? "GET";
      const body =
        typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (url.pathname === "/api/me") {
        if (method === "PATCH") {
          state.received.push(body);
          state.name = body.name;
        }
        return ok({
          user: { id: "u1", name: state.name, email: "bora@example.com" },
          workspaces: [],
        });
      }
      if (url.pathname === "/api/posts/7" && method === "GET") {
        return ok({
          ...detail,
          commentCount: state.commentCount,
          isTeam,
          pinned: pinnedView(),
        });
      }
      if (url.pathname === "/api/posts/7/comments" && method === "GET") {
        const before = Number(
          url.searchParams.get("before") ?? Number.POSITIVE_INFINITY
        );
        const older = state.top.filter((c) => c.id < before);
        return ok({
          items: older.slice(0, 3).map(withLatest),
          hasMore: older.length > 3,
        });
      }
      if (url.pathname === "/api/posts/7/comments" && method === "POST") {
        state.received.push(body);
        if (failWrites) return failed();
        const saved = comment(state.nextId++, body.body, {
          parentId: body.parentId ?? null,
          depth: body.parentId ? 1 : 0,
          author: { name: state.name },
          official: isTeam,
          canDelete: true,
        });
        if (saved.parentId === null) {
          state.top.unshift(saved);
        } else {
          const siblings = state.replies.get(saved.parentId) ?? [];
          state.replies.set(saved.parentId, [...siblings, saved]);
          const parent = find(saved.parentId);
          if (parent) parent.replyCount += 1;
        }
        state.commentCount += 1;
        return ok({ comment: saved, commentCount: state.commentCount }, 201);
      }
      const replies = /^\/api\/comments\/(\d+)\/replies$/.exec(url.pathname);
      if (replies && method === "GET") {
        return ok({
          items: (state.replies.get(Number(replies[1])) ?? []).map(withLatest),
          hasMore: false,
        });
      }
      const one = /^\/api\/comments\/(\d+)$/.exec(url.pathname);
      const target = one ? find(Number(one[1])) : undefined;
      if (target && method === "DELETE") {
        state.received.push({ deleted: target.id });
        if (failWrites) return failed();
        Object.assign(target, {
          deleted: true,
          body: "",
          author: null,
          official: false,
          canDelete: false,
        });
        state.commentCount -= 1;
        if (state.pinnedId === target.id) state.pinnedId = null;
        return ok({
          comment: { ...target, replies: [] },
          commentCount: state.commentCount,
        });
      }
      if (url.pathname === "/api/posts/7/pin" && method === "PUT") {
        state.received.push(body);
        if (failWrites) return failed();
        state.pinnedId = body.commentId;
        return ok({ pinned: pinnedView() });
      }
      return Response.json(
        { success: false, code: "NOT_FOUND", error: "Not found" },
        { status: 404 }
      );
    })
  );
  return state;
}
```

5. Add a helper after `itemOf`:

```tsx
const feedCount = (qc: QueryClient) =>
  qc.getQueryData<FeedPage>(postKeys.feed("acme", feedParams))?.items[0]
    ?.commentCount;
```

And append the new tests:

```tsx
describe("changing the thread", () => {
  it("shows a new comment at once, greyed out, and keeps it once saved", async () => {
    const server = fakeServer();
    renderThread();
    await screen.findByText("Comment A");
    const box = (await screen.findByLabelText(
      "Add a comment"
    )) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "Count me in" } });
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));
    const list = screen.getByRole("list", { name: "Comments" });
    const draft = await within(list).findByText("Count me in");
    expect(draft.closest("li")?.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("heading", { name: "7 comments" })).toBeTruthy();
    expect(box.value).toBe("");
    await waitFor(() =>
      expect(
        within(list).getByText("Count me in").closest("li")?.hasAttribute(
          "aria-busy"
        )
      ).toBe(false)
    );
    expect(server.received).toEqual([{ body: "Count me in" }]);
    expect(screen.getByRole("heading", { name: "7 comments" })).toBeTruthy();
  });

  it("removes a failed comment, puts its text back, and restores the counts", async () => {
    fakeServer({ failWrites: true });
    const { qc } = renderThread();
    await screen.findByText("Comment A");
    const box = (await screen.findByLabelText(
      "Add a comment"
    )) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "Count me in" } });
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));
    const list = screen.getByRole("list", { name: "Comments" });
    expect(await within(list).findByText("Count me in")).toBeTruthy();
    expect(feedCount(qc)).toBe(7);
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Something went wrong on our side. Try again."
      )
    );
    await waitFor(() =>
      expect(within(list).queryByText("Count me in")).toBeNull()
    );
    await waitFor(() => expect(box.value).toBe("Count me in"));
    expect(screen.getByRole("heading", { name: "6 comments" })).toBeTruthy();
    expect(feedCount(qc)).toBe(6);
  });

  it("posts a reply under its parent, and closes the reply box once saved", async () => {
    const server = fakeServer();
    renderThread();
    const parent = await itemOf("Comment A");
    const [reply] = await within(parent).findAllByRole("button", {
      name: "Reply",
    });
    fireEvent.click(reply!);
    const box = await screen.findByLabelText("Your reply");
    fireEvent.change(box, { target: { value: "Same here" } });
    fireEvent.click(screen.getByRole("button", { name: "Post reply" }));
    // The box's own text matches too, until it empties: look for the comment.
    const draft = await within(parent).findByText("Same here", {
      selector: "p",
    });
    expect(draft.closest("li")?.getAttribute("aria-busy")).toBe("true");
    await waitFor(() =>
      expect(screen.queryByLabelText("Your reply")).toBeNull()
    );
    expect(server.received).toEqual([{ body: "Same here", parentId: 10 }]);
    expect(
      within(parent).getByText("Same here", { selector: "p" })
    ).toBeTruthy();
  });

  it("keeps one reply box open at a time", async () => {
    fakeServer();
    renderThread();
    const first = await itemOf("Comment A");
    const mine = await itemOf("My comment");
    const [replyToFirst] = await within(first).findAllByRole("button", {
      name: "Reply",
    });
    fireEvent.click(replyToFirst!);
    fireEvent.click(within(mine).getByRole("button", { name: "Reply" }));
    expect(screen.getAllByLabelText("Your reply")).toHaveLength(1);
    expect(within(mine).getByLabelText("Your reply")).toBeTruthy();
  });

  it("deletes a comment after a confirm, keeping its place", async () => {
    const server = fakeServer();
    renderThread();
    const mine = await itemOf("My comment");
    fireEvent.click(await within(mine).findByRole("button", { name: "Delete" }));
    fireEvent.click(within(mine).getByRole("button", { name: "Confirm delete" }));
    expect(await within(mine).findByText("Comment deleted")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "5 comments" })).toBeTruthy();
    await waitFor(() => expect(server.received).toEqual([{ deleted: 8 }]));
  });

  it("puts a comment back when deleting it fails", async () => {
    fakeServer({ failWrites: true });
    renderThread();
    const mine = await itemOf("My comment");
    fireEvent.click(await within(mine).findByRole("button", { name: "Delete" }));
    fireEvent.click(within(mine).getByRole("button", { name: "Confirm delete" }));
    expect(await within(mine).findByText("Comment deleted")).toBeTruthy();
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    await waitFor(() =>
      expect(within(mine).getByText("My comment")).toBeTruthy()
    );
    expect(screen.getByRole("heading", { name: "6 comments" })).toBeTruthy();
  });

  it("pins a comment above the thread, and unpins it", async () => {
    const server = fakeServer({ isTeam: true });
    renderThread({ isTeam: true });
    const mine = await itemOf("My comment");
    fireEvent.click(await within(mine).findByRole("button", { name: "Pin" }));
    const pinned = await screen.findByRole("region", {
      name: "Pinned by the team",
    });
    expect(within(pinned).getByText("My comment")).toBeTruthy();
    await waitFor(() => expect(server.pinnedId).toBe(8));
    fireEvent.click(within(pinned).getByRole("button", { name: "Unpin" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Pinned by the team" })
      ).toBeNull()
    );
    await waitFor(() => expect(server.pinnedId).toBeNull());
  });

  it("asks for a name first when the account has none", async () => {
    const server = fakeServer({ viewerName: "" });
    renderThread();
    await screen.findByText("Comment A");
    fireEvent.change(await screen.findByLabelText("Your name"), {
      target: { value: "Deniz" },
    });
    fireEvent.change(screen.getByLabelText("Add a comment"), {
      target: { value: "Hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));
    const list = screen.getByRole("list", { name: "Comments" });
    const draft = await within(list).findByText("Hello");
    const item = draft.closest("li");
    expect(item && within(item).getByText("Deniz")).toBeTruthy();
    expect(server.received[0]).toEqual({ name: "Deniz" });
    await waitFor(() =>
      expect(screen.queryByLabelText("Your name")).toBeNull()
    );
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test src/features/comments`

Expected: FAIL.
- `form-schema.test.ts` can't find `./form-schema`.
- In `comment-thread.test.tsx`, the six Task 8 tests still pass. The eight new ones fail, because the thread has no comment box, Reply, Delete or Pin buttons yet.

- [ ] **Step 3: Add the catalog keys**

In `src/i18n/messages/en.json`, add these to `comments`, after `pinnedByTeam`:

```json
    "addLabel": "Add a comment",
    "replyLabel": "Your reply",
    "bodyHint": "Markdown works: **bold**, lists, links.",
    "nameLabel": "Your name",
    "nameHint": "Shown with your comments.",
    "submit": "Comment",
    "submitReply": "Post reply",
    "cancel": "Cancel",
    "reply": "Reply",
    "delete": "Delete",
    "confirmDelete": "Confirm delete",
    "pin": "Pin",
    "unpin": "Unpin",
    "signInToComment": "Sign in to comment"
```

In `src/i18n/messages/tr.json`, the same place:

```json
    "addLabel": "Yorum ekleyin",
    "replyLabel": "Yanıtınız",
    "bodyHint": "Markdown kullanabilirsiniz: **kalın**, listeler, bağlantılar.",
    "nameLabel": "Adınız",
    "nameHint": "Yorumlarınızla birlikte gösterilir.",
    "submit": "Yorum yap",
    "submitReply": "Yanıtı gönder",
    "cancel": "Vazgeç",
    "reply": "Yanıtla",
    "delete": "Sil",
    "confirmDelete": "Silmeyi onayla",
    "pin": "Sabitle",
    "unpin": "Sabitlemeyi kaldır",
    "signInToComment": "Yorum yapmak için giriş yapın"
```

- [ ] **Step 4: Add the form schema and the mutations**

`src/features/comments/form-schema.ts`:

```ts
import { z } from "zod";
import { commentBodySchema, displayNameSchema } from "@/shared/schemas";

/** The comment box. The name is asked for only while the person has none. */
export function commentFormSchema(needsName: boolean) {
  return z.object({
    name: needsName ? displayNameSchema : z.string(),
    body: commentBodySchema,
  });
}
```

`src/features/comments/use-comment-actions.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "use-intl";
import { addComment, pinComment, removeComment } from "@/lib/comments";
import { apiErrorKey } from "@/lib/error-text";
import { commentKeys, commentMutationKey, postKeys } from "@/lib/keys";
import type { CommentView } from "@/shared/comments";
import {
  optimisticAddComment,
  optimisticDeleteComment,
  optimisticPin,
  replaceDraft,
  writeCommentCount,
  writePin,
} from "./comment-cache";

/**
 * What every change to one post's comments shares. The cache changes at
 * once and rolls back on failure, with a toast. Answers are written as they
 * arrive. Once the last change to the post settles, everything showing its
 * comments or its count is fetched again. That also mends anything a
 * neighbouring change's rollback undid.
 */
function useCommentChange(postId: number) {
  const qc = useQueryClient();
  const tErrors = useTranslations("errors");
  const mutationKey = commentMutationKey(postId);
  // In its own callbacks a mutation still counts itself.
  const isLast = () => qc.isMutating({ mutationKey }) === 1;
  const fail = (error: unknown) => {
    toast.error(tErrors(apiErrorKey(error)));
  };
  const resync = async () => {
    if (!isLast()) return;
    await Promise.all([
      qc.invalidateQueries({ queryKey: commentKeys.post(postId) }),
      qc.invalidateQueries({ queryKey: postKeys.all }),
    ]);
  };
  return { qc, mutationKey, isLast, fail, resync };
}

/**
 * Adds a comment or a reply. The draft (from draftComment) shows at once,
 * then gives way to the server's copy, or disappears if saving fails.
 */
export function useAddComment(postId: number) {
  const { qc, mutationKey, isLast, fail, resync } = useCommentChange(postId);
  return useMutation({
    mutationKey,
    mutationFn: (draft: CommentView) =>
      addComment(
        postId,
        draft.parentId === null
          ? { body: draft.body }
          : { body: draft.body, parentId: draft.parentId }
      ),
    onMutate: async (draft) => ({
      rollback: await optimisticAddComment(qc, draft),
    }),
    onError: (error, _draft, context) => {
      context?.rollback();
      fail(error);
    },
    onSuccess: (result, draft) => {
      replaceDraft(qc, draft.id, result.comment);
      if (isLast()) writeCommentCount(qc, postId, result.commentCount);
    },
    onSettled: resync,
  });
}

/** Deletes a comment: it turns into a placeholder at once. */
export function useDeleteComment(postId: number) {
  const { qc, mutationKey, isLast, fail, resync } = useCommentChange(postId);
  return useMutation({
    mutationKey,
    mutationFn: (comment: CommentView) => removeComment(comment.id),
    onMutate: async (comment) => ({
      rollback: await optimisticDeleteComment(qc, comment),
    }),
    onError: (error, _comment, context) => {
      context?.rollback();
      fail(error);
    },
    onSuccess: (result) => {
      if (isLast()) writeCommentCount(qc, postId, result.commentCount);
    },
    onSettled: resync,
  });
}

/** Pins a comment, or unpins with null. Pins go one at a time, so the last click wins. */
export function usePinComment(postId: number) {
  const { qc, mutationKey, isLast, fail, resync } = useCommentChange(postId);
  return useMutation({
    mutationKey,
    scope: { id: `pin:${postId}` },
    mutationFn: (comment: CommentView | null) =>
      pinComment(postId, comment?.id ?? null),
    onMutate: async (comment) => ({
      rollback: await optimisticPin(qc, postId, comment),
    }),
    onError: (error, _comment, context) => {
      context?.rollback();
      fail(error);
    },
    onSuccess: (result) => {
      if (isLast()) writePin(qc, postId, result.pinned);
    },
    onSettled: resync,
  });
}
```

- [ ] **Step 5: Add the comment box**

`src/features/comments/comment-composer.tsx`:

```tsx
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { useId, useMemo, useState } from "react";
import { useTranslations } from "use-intl";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorKey } from "@/lib/error-text";
import { meQueryOptions, updateMe } from "@/lib/session";
import type { CommentView } from "@/shared/comments";
import { draftComment } from "./comment-cache";
import { commentFormSchema } from "./form-schema";
import { useThread } from "./thread-context";
import { useAddComment } from "./use-comment-actions";

type Props = {
  /** The comment being answered; null for a new top-level comment. */
  parent: CommentView | null;
  /** Closes a reply box: on Cancel, and once the reply is saved. */
  onClose?: () => void;
};

/**
 * The comment box. Sending empties it and shows the comment at once,
 * greyed out. If saving fails, the comment disappears and its text comes
 * back here. While the account has no name yet, the box asks for one.
 */
export function CommentComposer({ parent, onClose }: Props) {
  const t = useTranslations("comments");
  const tErrors = useTranslations("errors");
  const qc = useQueryClient();
  const { post, viewerName } = useThread();
  const add = useAddComment(post.id);
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const currentName = viewerName ?? "";
  const needsName = currentName === "";
  const schema = useMemo(() => commentFormSchema(needsName), [needsName]);

  const form = useForm({
    defaultValues: { name: "", body: "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value, formApi }) => {
      setError(null);
      let authorName = currentName;
      if (needsName) {
        try {
          const me = await updateMe(value.name);
          qc.setQueryData(meQueryOptions.queryKey, me);
          authorName = me.user?.name ?? value.name.trim();
        } catch (err) {
          setError(tErrors(apiErrorKey(err)));
          return;
        }
      }
      const draft = draftComment({
        postId: post.id,
        parent,
        body: value.body,
        authorName,
        official: post.isTeam,
      });
      formApi.setFieldValue("body", "");
      add.mutate(draft, {
        onSuccess: () => onClose?.(),
        // Back into the box, unless a new comment is already being typed.
        onError: () => {
          if (formApi.getFieldValue("body") === "") {
            formApi.setFieldValue("body", value.body);
          }
        },
      });
    },
  });

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

/** What signed-out visitors see instead of the comment box. */
export function SignInToComment() {
  const t = useTranslations("comments");
  const href = useRouterState({ select: (state) => state.location.href });
  return (
    <p className="text-sm">
      <Link to="/signin" search={{ redirect: href }} className="underline">
        {t("signInToComment")}
      </Link>
    </p>
  );
}
```

- [ ] **Step 6: Wire the box and the actions into the thread**

Replace `src/features/comments/thread-context.ts` with:

```ts
import { createContext, useContext } from "react";
import type { PostDetail } from "@/shared/posts";

/** What every comment in a thread needs to know about the thread. */
export type ThreadState = {
  post: PostDetail;
  /** The signed-in person's name ("" until they pick one), or null when signed out. */
  viewerName: string | null;
  /** The comment whose reply box is open: one at a time. */
  replyingTo: number | null;
  setReplyingTo: (commentId: number | null) => void;
};

export const ThreadContext = createContext<ThreadState | null>(null);

/** The thread around a comment. Only for components inside CommentThread. */
export function useThread(): ThreadState {
  const state = useContext(ThreadContext);
  if (!state) throw new Error("useThread must be used inside CommentThread");
  return state;
}
```

Replace `src/features/comments/comment-thread.tsx` with:

```tsx
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslations } from "use-intl";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { threadQueryOptions } from "@/lib/comments";
import { meQueryOptions } from "@/lib/session";
import type { CommentView } from "@/shared/comments";
import type { PostDetail } from "@/shared/posts";
import { CommentComposer, SignInToComment } from "./comment-composer";
import { CommentByline, CommentItem } from "./comment-item";
import { ThreadContext, useThread } from "./thread-context";
import { usePinComment } from "./use-comment-actions";

/**
 * A post's comments: the pinned one, the comment box, then the thread,
 * newest first.
 */
export function CommentThread({ post }: { post: PostDetail }) {
  const t = useTranslations("comments");
  const me = useQuery(meQueryOptions);
  const thread = useInfiniteQuery(threadQueryOptions(post.id));
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const viewerName = me.data?.user ? me.data.user.name : null;
  const state = useMemo(
    () => ({ post, viewerName, replyingTo, setReplyingTo }),
    [post, viewerName, replyingTo]
  );
  const items = thread.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <ThreadContext value={state}>
      <section
        aria-labelledby="comments-heading"
        className="flex flex-col gap-4"
      >
        <h2 id="comments-heading" className="font-semibold text-lg">
          {t("heading", { count: post.commentCount })}
        </h2>
        {post.pinned && <PinnedComment comment={post.pinned} />}
        {viewerName !== null ? (
          <CommentComposer parent={null} />
        ) : me.isPending ? null : (
          <SignInToComment />
        )}
        {thread.isPending ? (
          <p className="text-muted-foreground text-sm">{t("loading")}</p>
        ) : thread.isError ? (
          <p className="text-destructive text-sm" role="alert">
            {t("loadFailed")}
          </p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <ol aria-label={t("listLabel")} className="flex flex-col gap-5">
            {items.map((comment) => (
              <CommentItem key={comment.id} comment={comment} />
            ))}
          </ol>
        )}
        {thread.hasNextPage && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={thread.isFetchingNextPage}
            onClick={() => void thread.fetchNextPage()}
          >
            {t("olderComments")}
          </Button>
        )}
      </section>
    </ThreadContext>
  );
}

/** The team's pinned comment, above the thread. The team can unpin it here. */
function PinnedComment({ comment }: { comment: CommentView }) {
  const t = useTranslations("comments");
  const { post } = useThread();
  const pin = usePinComment(post.id);
  return (
    <section
      aria-label={t("pinnedByTeam")}
      className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-4"
    >
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
        <span className="font-medium text-foreground">
          {t("pinnedByTeam")}
        </span>
        <CommentByline comment={comment} />
      </div>
      <Markdown>{comment.body}</Markdown>
      {post.isTeam && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="self-start"
          onClick={() => pin.mutate(null)}
        >
          {t("unpin")}
        </Button>
      )}
    </section>
  );
}
```

In `src/features/comments/comment-item.tsx`:

1. Add the imports:

```tsx
import { CommentComposer } from "./comment-composer";
import { useDeleteComment, usePinComment } from "./use-comment-actions";
```

2. Replace `CommentItem` with this version. It adds the actions and the reply box; `CommentByline` and `Replies` stay as they are:

```tsx
/**
 * One comment: who wrote it and when, its words, what the person reading
 * can do with it, and its replies.
 */
export function CommentItem({ comment }: { comment: CommentView }) {
  const t = useTranslations("comments");
  const { post, replyingTo, setReplyingTo } = useThread();
  const [showReplies, setShowReplies] = useState(true);
  const draft = isDraft(comment);
  return (
    <li
      className={cn("flex flex-col gap-2", draft && "opacity-60")}
      aria-busy={draft || undefined}
    >
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
        <CommentByline comment={comment} />
        {post.pinned?.id === comment.id && (
          <span className="font-medium text-foreground">{t("pinned")}</span>
        )}
        {comment.replyCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-expanded={showReplies}
            aria-label={showReplies ? t("hideReplies") : t("showReplies")}
            onClick={() => setShowReplies((shown) => !shown)}
          >
            {showReplies ? (
              <Minus aria-hidden="true" />
            ) : (
              <Plus aria-hidden="true" />
            )}
          </Button>
        )}
      </div>
      {comment.deleted ? (
        <p className="text-muted-foreground text-sm italic">{t("deleted")}</p>
      ) : (
        <Markdown>{comment.body}</Markdown>
      )}
      {!draft && !comment.deleted && <CommentActions comment={comment} />}
      {replyingTo === comment.id && (
        <CommentComposer
          parent={comment}
          onClose={() => setReplyingTo(null)}
        />
      )}
      {showReplies && <Replies comment={comment} />}
    </li>
  );
}

/** Reply for anyone signed in, Pin for the team, Delete for its author and the team. */
function CommentActions({ comment }: { comment: CommentView }) {
  const t = useTranslations("comments");
  const { post, viewerName, replyingTo, setReplyingTo } = useThread();
  const remove = useDeleteComment(post.id);
  const pin = usePinComment(post.id);
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
          onClick={() => setReplyingTo(replying ? null : comment.id)}
        >
          {t("reply")}
        </Button>
      )}
      {post.isTeam && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => pin.mutate(pinned ? null : comment)}
        >
          {pinned ? t("unpin") : t("pin")}
        </Button>
      )}
      {comment.canDelete &&
        (confirming ? (
          <Button
            type="button"
            variant="destructive"
            size="xs"
            onClick={() => {
              setConfirming(false);
              remove.mutate(comment);
            }}
          >
            {t("confirmDelete")}
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setConfirming(true)}
          >
            {t("delete")}
          </Button>
        ))}
    </div>
  );
}
```

`comment-composer.tsx` and `comment-item.tsx` now import each other, since a reply box sits inside a comment. Both only use the other's exports inside components, so the cycle is harmless.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bun run test src/features/comments src/i18n`

Expected: PASS.
- 14 tests in `comment-thread.test.tsx`.
- 2 in `form-schema.test.ts`.
- 9 in `comment-cache.test.ts`.
- Both catalog tests.

Then run: `bun run test`

Expected: PASS. 44 test files, 354 tests.

- [ ] **Step 8: Commit**

```bash
bun run typecheck
bun run check:fix && bun run check
bun run build
git add src
git commit -m "feat: comment, reply, delete and pin in the thread, shown at once and rolled back on failure" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the typecheck, Biome and the build pass.

---
### Task 10: Click through Phase 3 in both languages

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the README's notes on comments.

- [ ] **Step 1: Click through it**

Run `bun run db:migrate`, then `bun run dev`, and open http://localhost:5173. Sign-in codes print in the terminal. A headless browser, Playwright for example, works too. The checks:

1. **Setup:** sign in as A with a new email. Create a workspace with English as its default and a board "Features", then post "Dark mode" as "Ayşe".
2. **Commenting** (a second email, B, in another browser or a private window):
   - Open the post. The heading reads "Comments" and the thread "No comments yet.". The box asks for B's name, because the account has none.
   - Enter "Bora" and "Yes please, for reading at night." and press **Comment**.
   - The comment shows at once, greyed out, then turns normal. The heading reads "1 comment", and the feed card for "Dark mode" shows 1.
3. **A team reply:** as A, reply to Bora's comment with "Planned for next month." It shows under Bora's comment with the "Team" badge, and the reply box closes.
4. **Depth:**
   - As B, reply to A's reply, then to that reply, to reach depth 3.
   - Press **Reply** on the depth-3 comment and post. The new reply lands beside it, at the same indent.
5. **Earlier replies:**
   - As A, add three more replies to Bora's comment, then reload.
   - Bora's comment shows its latest two replies and "Show N earlier replies". Pressing it shows all of them, oldest first.
   - The [−] button hides the replies, and [+] brings them back.
6. **Pinning:**
   - As A, press **Pin** on Bora's comment. "Pinned by the team" appears above the thread, and "Pinned" next to the comment.
   - After a reload, B sees the same, without any Pin buttons.
   - As A, press **Unpin**. The block is gone.
7. **Deleting:**
   - As B, delete Bora's comment with the two-step confirm. It becomes "Comment deleted", and its replies stay under it. The heading count and the feed card drop by one.
   - B sees no Delete on A's comments. A, on the team, sees Delete on everyone's.
8. **A failed comment** (the phase's done-when):
   - In B's tab, go offline: DevTools → Network → Offline. With Playwright, make `POST /api/posts/*/comments` fail with `page.route(…, (route) => route.abort())`.
   - Type "This one fails" and press **Comment**. It shows greyed out, then disappears. The text is back in the box, a toast says "Couldn't reach Pano. Check your connection and try again.", and the heading count is unchanged.
   - Go back online and press **Comment** again. This time it stays.
9. **The counts match the database:**

   ```bash
   psql -h 127.0.0.1 -d pano -c "select p.comment_count, (select count(*) from comments c where c.post_id = p.id and c.deleted_at is null) as comments from posts p order by p.id desc limit 1"
   ```

   The two numbers are equal.
10. **Turkish:** press **TR**. The thread reads "Yorumlar" or "N yorum", with "Yorum ekleyin", "Yanıtla", "Ekip", "Yorum silindi" and "Ekip tarafından sabitlendi".
11. **Signed out:**
    - The comments are readable, and "Sign in to comment" replaces the box.
    - Signing in from it returns you to the post.
12. **Hostile Markdown:** post a comment with ``<img src=x onerror=alert(1)> **bold**``. It shows "bold" in bold, with no image and no alert.

If you can't drive a browser, hand these checks to your human partner, and record in the ledger that they confirmed them.

- [ ] **Step 2: Note comments in the README**

In `README.md`, in "Layout and rules", replace the `worker/services/` bullet with:

```markdown
- `worker/services/`: the queries behind the routes. `votes.ts` locks the
  post row and writes the state the person asked for, so the count moves
  only by the rows that changed. `comments.ts` takes the same lock and
  moves `comment_count` and `reply_count` in the comment's own transaction.
  Deleting a comment is soft, so its replies keep their place. `ranking.ts`
  (trending, top, new) and `similar.ts` serve the feed and the submit form.
```

And add a bullet after the `src/` bullet:

```markdown
- `src/features/comments/`: the thread under each post. A new comment shows
  at once as a greyed-out draft. It gives way to the server's copy, or
  disappears again, with its text back in the box, if saving fails.
```

- [ ] **Step 3: Run everything and commit**

```bash
bun run typecheck
bun run check
bun run test
bun run build
git add README.md
git commit -m "docs: comments in the README" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: everything passes. 44 test files, 354 tests.

---

## Phase 3 done when

- [ ] A failed comment disappears and the counts stay right:
  - Task 9's "removes a failed comment" test.
  - Task 10, check 8.
  - The counts match the database (Task 10, check 9).
- [ ] The comment tests pass:
  - `comment_count` equals the comments that aren't deleted after 20 arrive at once, and after five copies of one delete (Tasks 3 and 6).
  - A thread that grows between pages neither repeats nor skips a comment (Task 4).
- [ ] `bun run typecheck`, `bun run check`, `bun run test` (44 files, 354 tests) and `bun run build` all pass.
- [ ] The CI sequence passes locally against a fresh database (Phase 0's Task 5, Step 3).
