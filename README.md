# Pano

Feedback boards and a public roadmap. People post feature requests, vote, and
discuss in threads; teams move requests across a public roadmap. English and
Turkish.

Design: [docs/superpowers/specs/2026-10-16-pano-design.md](docs/superpowers/specs/2026-10-16-pano-design.md)

## Stack

- **One Worker:** a single Cloudflare Worker serves the React app and the Hono
  API.
- **Database:** Postgres, reached through Drizzle and postgres.js. Production
  uses Neon through Hyperdrive; local dev uses Homebrew Postgres 17.
- **Frontend:** TanStack Router and Query, Tailwind CSS 4 with shadcn/ui, and
  use-intl.
- **Tooling:** Bun, Biome and Vitest.

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
| `bun run db:generate` / `db:migrate` | drizzle-kit against `DATABASE_URL` |
| `bun run cf-typegen` | Regenerates `worker-configuration.d.ts` after `wrangler.jsonc` changes |
| `bun run vote-drift` | BetterNews's vote toggle under 20 rapid clicks, next to Pano's votes (local test database) |

## Layout and rules

- `worker/app.ts`: the whole API as one chained Hono app. It stays
  runtime-agnostic (no Workers globals, bindings only from `c.env`), because
  the browser project typechecks it through `AppType` and tests run it under
  Node.
- `worker/index.ts`: the Workers entry. Workers-only code goes here.
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
- **Search** folds case and Turkish letters with the SQL function
  `pano_fold` (migration `0005_search_fold.sql`), on the stored `tsvector`
  and on the query alike, so results don't depend on the database's locale.
- `worker/og.ts`: `/p/*` reaches the Worker before the assets layer and gets
  the app shell with the post's link-preview meta tags.
- `shared/`: code both sides use, including the response envelope in
  `shared/envelope.ts`.
- `src/`: the React app. It calls the API only through
  `unwrap(await api.….$get())` from `src/lib/api.ts`.
- `src/features/comments/`: the thread under each post. A new comment shows
  at once as a greyed-out draft. It gives way to the server's copy, or
  disappears again, with its text back in the box, if saving fails.
- **Aliases:** `@/shared/*` works everywhere. `@/*` means `src/` and is used
  only there. Worker files import each other relatively.
