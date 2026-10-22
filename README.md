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
