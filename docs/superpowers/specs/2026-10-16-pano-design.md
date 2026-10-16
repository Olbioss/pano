# Pano: feedback boards and a public roadmap (design)

**Date:** 2026-10-16 · **Status:** approved

## Context

- **Why.** The BetterNews review found it isn't showcase material. Its best parts are worth reusing in a new app: the typed Hono client (`hc<AppType>`), TanStack Query optimistic updates, threaded comments, and voting with sorting kept in the URL.
- **Chosen app.** A Canny-style feedback board with a public roadmap:
  - It fills a portfolio gap. No current showcase is a community or feedback product.
  - Every reused feature is a core mechanic rather than decoration.
  - It gets real use: Pano's own feedback board runs on Pano from day one, and Rezerve's Turkish board can follow later.
- **Decided with you:**
  - Cloudflare Workers + Hono + Neon Postgres through Hyperdrive.
  - The React SPA is served by the same Worker, as in project-management.
  - English + Turkish UI, with a per-workspace default language.
- **Assumptions (accepted at review):**
  - A portfolio showcase aimed at full-stack roles.
  - Free tiers only.
  - A live demo that never looks empty.
  - One hard problem it can prove it solves, in Rezerve's style.
  - Working name **Pano** (Turkish for "board", and easy to say in English). It can change.
  - A new repo at `~/repos/deploys/pano`.
- Paths below are relative to `~/repos`.

## What it does (v1)

- **Visitors:** browse a workspace's boards, roadmap and posts.
- **Signed-in users:**
  - Submit requests. The 5 most similar existing requests appear while they type.
  - Vote, comment in threads, and subscribe.
- **Team (workspace members):**
  - Change a post's status, with an optional note, and drag cards across the roadmap.
  - Reply with a "Team" badge, pin a comment, and merge duplicates.
  - Moving a post to Shipped emails its subscribers.
- **Not in v1:** changelog page, embeddable widget, Rezerve integration, private boards, custom domains, billing, comment votes, real-time push.
- **Later candidates:** AI duplicate detection with embeddings, and thread summaries.

## Proof points (each backed by a test, and claimed in the portfolio entry)

1. **Votes can't drift.**
   - The API is `PUT /api/posts/:id/vote {voted}`. It's idempotent because it sends the desired state, not a toggle.
   - `votes` has a primary key on (post_id, user_id).
   - One transaction inserts with `on conflict do nothing` (or deletes), moves `vote_count` by the number of rows that actually changed, and refuses a post merged in the meantime.
   - On the client, a per-post mutation `scope` sends requests one at a time, so rapid clicks end in the state last clicked.
   - Tests:
     - 50 users voting in parallel leave count = rows.
     - One user sending 20 alternating requests in parallel leaves count = rows.
     - A vote racing a merge never lands on the merged post.
   - Running BetterNews's read-then-write toggle through the same test, and recording how far it drifts, gives the "before" picture.
2. **Optimistic updates with real rollback.**
   - One helper snapshots every cache a mutation touches: all feed variants, the post detail, the roadmap and the similar-requests list.
   - It applies immer patches, and on error restores all of them and shows a translated toast.
   - It reconciles with the server's response, and refetches only when the last in-flight mutation for that post settles.
   - It's used for votes, roadmap moves, subscribe, pin and comments.
   - It fixes the BetterNews bugs: stuck draft comments, the `current(undefined)` throw, and rollback from a single snapshot.
3. **Typed end to end.**
   - Zod 4 schemas in `shared/` validate requests on the server (`@hono/zod-validator`, with a hook that returns the error format below with field errors). The same schemas validate forms on the client: TanStack Form takes them directly through Standard Schema, with no adapter packages.
   - The SPA reaches the API only through `hc<AppType>`, and API tests use Hono's typed `testClient`.
   - CI runs `tsc -b` over the app, the worker and `shared/`. This uses project-management's split tsconfigs, with no shared `@/` alias (the collision that broke BetterNews).
4. **Duplicates handled at both ends.**
   - While a title is typed, the form shows the 5 most similar open requests, each with a one-click optimistic vote. Matching uses Postgres full-text search with the workspace's `english`/`turkish` config, plus `pg_trgm` to tolerate typos.
   - A team merge moves votes, comments and subscriptions in one transaction. A user who voted on both posts counts once, and a test checks it.
5. **Edge delivery without server rendering.**
   - One Worker serves the SPA and `/api`.
   - Hyperdrive pools Neon connections. Its free plan allows 100k queries a day.
   - Better Auth's 5-minute cookie cache keeps most requests off the database.
   - Shared post links unfurl with the post's title and excerpt: for `/p/*`, the Worker injects meta tags into the SPA shell with HTMLRewriter.
6. **Trending that fits feedback.**
   - Trending ranks by recent vote velocity: votes from the last 30 days, each worth half as much every 3 days. An old request that suddenly gets votes rises.
   - Top is all-time votes, and New is by date.

## Architecture

```
Browser: React SPA (TanStack Router, Query, Form · shadcn/Tailwind 4 · use-intl)
   │  hc<AppType>, same origin, session cookie
   ▼
Cloudflare Worker (Hono)
   ├─ /api/auth/*   Better Auth (Drizzle pg adapter, organization plugin, DB rate limits)
   ├─ /api/*        routers → services → Drizzle + postgres.js → Hyperdrive → Neon Postgres
   ├─ /p/*          SPA shell + per-post meta tags (HTMLRewriter)
   ├─ other paths   static assets, SPA fallback
   └─ cron          every 5 min: send email outbox · daily 01:00 UTC: reset the demo workspace
```

```
pano/
  worker/  index.ts (app, AppType, fetch + scheduled) · auth.ts · og.ts
           db/{schema/*, client.ts, seed.ts}
           middleware/{db, session, team, rate-limit}.ts
           routes/{workspaces, boards, posts, votes, comments, roadmap}.ts
           services/{votes, merge, ranking, similar, outbox, demo-reset}.ts
  shared/  schemas.ts (zod) · envelope.ts · status.ts · slug.ts
  src/     routes/ (file routes) · features/{posts, votes, comments, roadmap, similar}/
           lib/{api.ts, keys.ts, optimistic.ts, i18n.ts} · messages/{en,tr}.json · components/ui/
  drizzle/ migrations      e2e/ Playwright specs
```

**Rules:**
- Routers stay chained, so `AppType` carries every route (a Hono RPC requirement).
- Worker code reads bindings only from `c.env`, never from `cloudflare:workers`. That way the API also runs under Node in tests.
- Each request gets its own postgres.js client through Hyperdrive.

**SPA routes:**
- `/`: landing page with demo links.
- `/login`, `/signup`, `/new-workspace`.
- `/$ws`: the feed (`?board=&sort=trending|top|new&status=&q=`).
- `/$ws/new` (signed in), `/$ws/roadmap`, `/$ws/settings` (team).
- `/p/$ref`: a post, e.g. `123-dark-mode`. A wrong slug redirects to the right one.
- Reserved workspace slugs: `p`, `api`, `login`, `signup`, `new-workspace`, `settings`, `assets`, and similar.

## Data model (Postgres, Drizzle migrations)

| Table | Key columns | Notes |
|---|---|---|
| Better Auth tables | user, session, account, verification, organization, member, invitation, rateLimit | organization = workspace; owner/admin/member = team |
| `workspace_settings` | organization_id (PK), default_locale (`en`/`tr`), accent, is_demo | Like Rezerve's business profile |
| `boards` | id, organization_id, slug, name, position | Unique (organization_id, slug) |
| `posts` | id, organization_id, board_id, author_id, title, body, status, vote_count, comment_count, merged_into_id, pinned_comment_id, search_config, search (generated tsvector), created_at, status_changed_at | Indexes: (board_id, created_at), (organization_id, vote_count), GIN(search), trigram GIN(title) |
| `votes` | (post_id, user_id) PK, created_at | Foreign keys cascade; index on created_at for trending |
| `comments` | id, post_id, author_id, parent_id, depth (≤ 3), body, is_official, reply_count, deleted_at, created_at | Soft delete keeps a thread's shape; index (post_id, parent_id, created_at) |
| `subscriptions` | (post_id, user_id) PK | Added on post, vote or comment |
| `status_changes` | post_id, from, to, note, changed_by, created_at | Post timeline; feeds the outbox |
| `email_outbox` | id, user_id, kind, payload, sent_at, attempts, last_error | Written in the same transaction as the status change |
| `rate_limits` | (user_id, bucket, window_start) PK, count | AskDocs' limiter |

Statuses: `open`, `under_review`, `planned`, `in_progress`, `shipped`, `closed`.

## API (all JSON)

| Endpoint | Who | Notes |
|---|---|---|
| `GET /api/me` | anyone | User, plus the workspaces where they're on the team |
| `POST /api/workspaces` · `GET`/`PATCH /api/workspaces/:ws` | signed in · anyone · team | 1 workspace per account; settings include the default language |
| `POST`/`PATCH`/`DELETE …/boards` | team | |
| `GET /api/workspaces/:ws/posts` | anyone | board, sort, status, q, page (limit ≤ 50, page ≥ 1) |
| `POST /api/workspaces/:ws/posts` | signed in, 5/hour | The author automatically votes and subscribes |
| `GET /api/workspaces/:ws/similar?q=&board=` | anyone | Top 5 open, unmerged posts |
| `GET /api/posts/:id` · `PATCH`/`DELETE` | anyone · author or team | |
| `PUT /api/posts/:id/vote {voted}` | signed in, 120/hour | Returns `{ voted, voteCount }` |
| `PUT /api/posts/:id/subscription {subscribed}` | signed in | |
| `PATCH /api/posts/:id/status {status, note?}` | team | Writes `status_changes`; Shipped also writes the outbox |
| `POST /api/posts/:id/merge {intoId}` | team | One transaction |
| `PUT /api/posts/:id/pin {commentId \| null}` | team | |
| `GET /api/posts/:id/comments` · `GET /api/comments/:id/replies` | anyone | Top-level comments paged with their first 2 replies; more replies paged on demand |
| `POST /api/posts/:id/comments {body, parentId?}` · `DELETE /api/comments/:id` | signed in, 30/hour · author or team | |
| `GET /api/workspaces/:ws/roadmap` | anyone | Planned, in progress, and shipped in the last 30 days |

**Errors** look like `{ success: false, code, error, fields? }`:
- `code` is stable, such as `RATE_LIMITED` or `POST_MERGED`, and the UI translates it.
- The client wrapper always throws on a non-2xx response, so TanStack Query's `onError` runs. This fixes the BetterNews comment bug.

## Optimistic updates

- **Query keys:** a key factory for each entity (`postKeys`, `commentKeys`), as in Stack Shop's `cartKeys`.
- **`src/lib/optimistic.ts`:** `applyOptimistic(qc, [{ filters, update }])` does the following:
  1. Cancels matching queries.
  2. Snapshots every matched query by its key.
  3. Applies immer `produce` patches, skipping entries that have no data.
  4. Returns `rollback()`.
- **Votes:** `useVote(postId)` runs with `scope: { id: 'vote:' + postId }`.
  - `onMutate` patches the feed, detail, roadmap and similar list.
  - `onError` rolls back and shows a toast.
  - `onSuccess` writes the server's `voteCount`.
  - `onSettled` refetches only when `isMutating({ mutationKey: ['vote', postId] }) === 1`, meaning no other vote on that post is still in flight.
- **Roadmap:** built with dnd-kit, keyboard-accessible. Moving a card changes the post's status, and patches the roadmap columns, the detail and the status labels in the feed.
- **Comments:** a draft with a temporary id shows greyed out. The server's comment replaces it, and an error removes it.
- **Tests:**
  - Rapid clicks end in the last state.
  - A failing vote restores both the list and the detail.
  - `onMutate` runs immediately for a scoped mutation that's waiting in the queue. This needs checking before relying on it.

## Auth, security, language

- **Better Auth**, mounted on Hono at `/api/auth/*` and created per request with the Hyperdrive-backed Drizzle client. It's Rezerve's config minus `nextCookies`:
  - Email + password (minimum 8 characters) and GitHub sign-in.
  - Organization plugin for workspaces.
  - Rate limits stored in the database, and a 5-minute cookie cache.
- **Security:**
  - Same origin, so no CORS is needed.
  - Hono's `csrf()` runs on mutating `/api` routes.
  - Team rights are checked on the server only (`requireTeam`).
  - Markdown renders without raw HTML, and links get `nofollow ugc noopener`.
  - Size caps: titles 3–120 characters, bodies ≤ 5000, comments ≤ 3000.
- **Demo:**
  - "Try as team" and "Try as member" log into a sandbox `demo` workspace that resets nightly, the way Rezerve's demo does.
  - Demo accounts can't change their password or delete the workspace.
  - The real `pano` workspace is Pano's own feedback board.
- **Language:**
  - `use-intl` with `messages/{en,tr}.json`, guarded by AskDocs' key-parity test.
  - The language comes from the user's choice (cookie), then the workspace default, then the browser.
  - Validation messages use Zod's built-in `en`/`tr` locales.
  - Dates are formatted with `Intl`, which drops luxon.
  - Each post stores its workspace's search config (`english` or `turkish`).
  - Slugs handle Turkish letters (ı→i, ş→s, and so on).
- **Workers config:**
  - The `nodejs_compat` flag, which postgres.js and Better Auth need.
  - A Hyperdrive binding with a local connection string for dev and CI.
  - `run_worker_first: ["/api/*", "/p/*"]`.
  - Two cron triggers.

## Reuse map

| From | Take | Change |
|---|---|---|
| `deploys/project-management/vite.config.ts`, `wrangler.jsonc`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.worker.json` | Cloudflare Vite plugin, one Worker for SPA + API, split tsconfigs | Hyperdrive instead of D1; add `/p/*` and crons |
| `deploys/project-management/worker/index.ts`, `src/lib/api.ts` | `onError` error format, chained routers, `hc` client | Add `code` and field errors; throw on non-2xx |
| `betternews/frontend/src/components/comment-card.tsx`, `comment-form.tsx` | Thread UI: replies loaded page by page, collapse, one open reply box | Depth cap, Team badge, pin, translations |
| `betternews/server/routes/comments.ts`, comment routes in `posts.ts` | Reply and paging queries | Move into a service; add foreign keys; fix the counters |
| `betternews/frontend/src/lib/api-hooks.tsx` | The optimistic-update patterns | Rebuild on `optimistic.ts` with the fixes |
| `betternews/frontend/src/components/sort-bar.tsx`, `routes/_auth.tsx`, `routes/_auth/submit.tsx` | Sort bar driven by the URL, sign-in guard, `useBlocker` on unsaved forms | Use Zod 4 directly, without `router-zod-adapter` |
| `deploys/rezerve/lib/auth.ts`, `lib/db/errors.ts`, `lib/demo/reset.ts`, `.github/workflows/ci.yml`, `playwright.config.ts`, `biome.json` | Auth config, Postgres error codes, declarative demo reset, CI with a Postgres service, E2E setup, lint config | Read Workers env instead of `process.env` |
| `deploys/askdocs/lib/rate-limit.ts`, `messages/messages.test.ts` | Fixed-window rate limiter, EN/TR key-parity test | none |
| `deploys/stack-shop/src/hooks/store/use-cart.tsx` | Query-key factory pattern | none |

## Build order

0. **Scaffold.**
   - Set up Vite, React, the Cloudflare plugin and Hono, with split tsconfigs.
   - Add Biome, Vitest, shadcn/Tailwind 4, TanStack Router/Query/Form and use-intl.
   - Point local Postgres through Hyperdrive's local connection string.
   - Write the Drizzle schema and first migration (with `pg_trgm`), and a CI skeleton.
   - *Done when* `vite dev` serves a page that calls a typed `/api/health`, and CI passes.
1. **Auth and workspaces.**
   - Better Auth with the organization plugin, session middleware and `/api/me`.
   - Workspace creation and settings, boards, reserved slugs, and language switching.
   - *Done when* a new user can create a workspace and a board in both languages.
2. **Posts and votes.**
   - Submit form with the similar-requests panel.
   - Feed with sort, filter and search kept in the URL, and the post page.
   - Idempotent votes with the concurrency tests.
   - The optimistic helper and `useVote`, plus the link-preview meta tags.
   - *Done when* the vote tests pass, and two tabs voting rapidly agree once everything settles.
3. **Comments.**
   - Port and fix the BetterNews threads.
   - Add the Team badge, pinning and soft delete.
   - *Done when* a failed comment disappears and the counts stay right.
4. **Team tools.**
   - Status changes with a timeline, and roadmap drag-and-drop.
   - Merge, with its tests, and subscriptions.
   - Email outbox through Brevo's HTTP API, logged instead of sent when running locally.
   - *Done when* moving a card to Shipped queues one email per subscriber.
5. **Demo and launch.**
   - Seed the `pano` and `demo` workspaces, the nightly reset and the demo logins.
   - Landing page.
   - A visual identity pass using the frontend-design skill. Starting idea: paper cards on a warm board, ink with a signal-orange accent, and vote counts in tabular figures.
   - The Playwright suite, then deploy.
   - Add the portfolio entry: `deploys/olbios/src/content/projects/{en,tr}/pano.md` plus screenshots.
   - *Done when* the live URL passes the E2E suite.

**Later:** changelog, embeddable widget, Rezerve's Turkish board, email invitations, AI duplicate detection.

## Verification

- **Every phase:** `bun run typecheck` (`tsc -b`), `bun run check` (Biome), `bun run test`, `bun run build`.
- **Integration tests** run the Hono app in Node against a real Postgres (local, or the CI service) through `testClient` / `app.request(…, env)`. They cover:
  - vote concurrency
  - duplicate merge, including a vote racing a merge
  - comment counters
  - team-only routes
  - rate limits
  - similar-request search on English and Turkish fixtures
  - the outbox filling on Shipped.
- **Component tests** (Vitest + Testing Library) cover:
  - rapid vote clicks
  - rollback after a failure
  - removing a failed draft comment
  - EN/TR catalog parity.
- **E2E (Playwright)** runs against the production build in workerd (`vite preview`):
  - A member submits a request, sees similar ones, votes and comments.
  - The team drags a card to Planned, and the member sees the new status.
  - The HTML for `/p/:ref` contains the post's `og:title`.
- **By hand on the live URL:**
  - Two browsers voting on the same post.
  - The Turkish interface.
  - A shared link previewing in WhatsApp or Slack.

## Steps that need your accounts

- **Database:** create the Neon project and database, then run `wrangler hyperdrive create` with its connection string. I'll give the exact commands.
- **Secrets:** set the Worker secrets `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` and `BREVO_API_KEY`.
- **Deploy:** connect the GitHub repo to Workers Builds, or approve a deploy from CI.
- **Migrations:** run the production migrations.
- Nothing gets pushed or deployed without asking you first.

## Next steps

1. Write the step-by-step implementation plan in `docs/superpowers/plans/`, starting with Phase 0 (scaffold), for review.
2. Choose how to run it: subagents task by task, or inline in one session.
