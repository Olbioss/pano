# Pano Phase 7: stabilize, then deploy from GitHub (design)

## Context

- **Why.** Pano has been live since 2026-10-25. Twenty-three open issues are production risks:
  - CPU over the Workers free plan's limit
  - demo bugs
  - the outbox's missing backoff
  - the Phase 6 review's follow-ups
  - CI and deploy hygiene

  Deploys still run from a laptop.
- **This phase:**
  - brings ordinary requests under the free plan's 10 ms of CPU
  - makes the demo dependable
  - finishes the outbox
  - fixes the Phase 6 follow-ups
  - deploys from GitHub Actions once CI passes
- **Decided with the user (2026-11-06):**
  - Stabilize first, then deploy from GitHub.
  - The scope is production risks only. The UI-polish backlog (#4–#6, #9, #10, #15–#18, #21, #22, #24, #29) and the chores (#11, #13, #14, #23, #34, #35) move to Phase 8.
  - Deploys go through GitHub Actions after CI passes, not Workers Builds.
  - CPU: measure first, then trim the cold path.
  - Sign-in stays passwordless. Better Auth's password hashing measured about 33 ms of CPU per hash or check on 2026-11-06, against a limit of 10 ms. GitHub sign-in heads Phase 8's list.
- **Issues this phase closes:**
  - CPU: #38, #19, #20
  - the demo: #36, #31, #28, #27, #33, #32, #30, #3
  - email: #25, #26
  - the Phase 6 follow-ups: #42, #43, #44, #45, #46, #47
  - CI and deploys: #48, #12, #37, #41 (done with Actions instead of Workers Builds)
- **Unchanged constraints:**
  - free tiers only
  - Neon's 100 CU-hours a month: nothing new may wake the database on a timer
  - English and Turkish
  - the demo rules (`confineDemo`, `readOnlyInDemo`, no email from the demo)
  - no secrets in the repo or in `wrangler.jsonc`

## CPU on the free plan (#38, #19, #20)

### Measure first

The phase's spike does the following before any fix is planned:
- Times each API route's first call and later calls under Node, as on 2026-10-24.
- Measures the Worker bundle's size before and after each change.
- Records the numbers in the plan, which picks its fixes from them.

If the numbers show the fixes below can't reach the target, the plan says so before any code is written. Caching public answers (the feed, the roadmap, a request) in KV then becomes the fallback, designed at that point.

### The fixes

- **Smaller code.** Better Auth is imported from `better-auth/minimal`. That leaves out Kysely and the SQLite dialects, about 800 KB of the Worker.
- **Better Auth only when needed.**
  - Today `withAuth` builds Better Auth for every API request. Afterwards it supplies Better Auth lazily: the first use builds it, and later uses reuse it.
  - `readSession` answers "signed out" without building it when the request carries no Better Auth session-token cookie. The check uses Better Auth's own cookie helper, so the `__Secure-` form counts too.
  - `/api/auth/*`, signed-in requests and team actions build it as today.
- **Comment pages (#19).**
  - `limit` on `GET /api/posts/:id/comments` and `GET /api/comments/:id/replies` goes from at most 50 to at most 20, which is the size the app already asks for. A larger `limit` is refused with 400, like any other value out of range.
  - `withReplies` stops recursing at `MAX_COMMENT_DEPTH`, so a page can't nest deeper than threads allow, even if the data does.
- **Indexes (#20).** Migration 0014 adds:
  - an index on `comments (parent_id)`
  - a partial index on `posts (pinned_comment_id) where pinned_comment_id is not null`

  Deleting a post, which the nightly demo reset does for the whole demo workspace, then finds replies and pins without scanning.

### Target

After the release, `wrangler tail --format json` over about 20 ordinary live requests (feed, roadmap, a request page, `/api/me`, a vote) shows a median under 10 ms of CPU and no error 1102. On 2026-10-24 the median was 14 ms.

## The demo (#36, #31, #28, #27, #33, #32, #30, #3)

- **Stable demo links (#36).**
  - Each seeded request in `worker/demo/content.ts` gets an explicit `id` from a reserved block starting at 900001.
  - The reset inserts the seeded requests with those ids, using `OVERRIDING SYSTEM VALUE` (Drizzle's `.overridingSystemValue()`).
  - A link like `/p/900015-custom-fonts-in-the-editor` keeps working after the 01:00 UTC reset. The demo feed's entry ids, which are built from `/p/<id>`, stay the same too, so feed readers stop seeing them as new each morning.
  - A new seeded request takes the next unused id, and reordering the seed list moves no links.
  - Requests guests post during the day get ordinary ids from the identity sequence and still disappear at the reset.
  - The block holds while real request ids stay under 900,000.
- **Team guests at the reset (#31).** Before deleting the demo workspace, the reset reads the demo team's guest members who will survive it (accounts younger than a day) and their roles. After rebuilding, it adds them back with those roles.
- **A demo-wide posting cap (#28).**
  - In production, a demo account creating a request or a comment in the demo is refused once the demo has 30 requests, or 60 comments, created in the past hour. The answer is 429 with the code `DEMO_BUSY`.
  - The count comes from the demo's own rows, so no new table is needed.
  - Two posts at the same moment may overshoot the cap by one.
- **The landing page's demo buttons (#27).** "Try as team" and "Try as member" show only when `/api/me` answered and said signed out, or signed in as a demo guest. While it's loading or after it fails, they're hidden.
- **Guests on real boards (#33).**
  - When the signed-in account is a demo guest and the workspace isn't the demo, these controls are disabled: voting, New request, the comment form, and Follow.
  - One note explains why: "Guest accounts only work in the demo."
- **The banner on demo request pages (#32).** `PostDetail.workspace` gains `isDemo`, and `/p/…` shows the same demo banner as the demo's other pages. The guest rule in #33 uses the same field.
- **Guest names (#30).** A new guest is named from the language cookie, then the demo workspace's default language. The browser's language is no longer used.
- **Reserved addresses (#3).** `demo` and `pano` join `RESERVED_SLUGS` in `shared/slug.ts`.
  - The seeds insert both workspaces directly, so the reservation doesn't block them.
  - Nothing renames an existing workspace's address.

## Email (#25, #26)

Phase 6 added the daily budget and the 10-second Brevo timeout. The retry backoff is the part of #25 that's left.

- **Backoff (#25).**
  - `email_outbox` gains `next_attempt_at` (timestamptz, not null, default `now()`) in migration 0014.
  - A run picks only due emails: `next_attempt_at <= now()`.
  - A failed try schedules the next one: 5 minutes after the 1st, 30 minutes after the 2nd, 2 hours after the 3rd, and 8 hours after the 4th. The 5th failure is final, so `MAX_ATTEMPTS` stays 5. An email now survives a Brevo outage of up to about ten hours.
  - Emails held back by a spent daily budget keep their due time. As today, they're released with no try counted.
- **Keeping Neon asleep while emails wait.**
  - `outbox:pending` works as today. A status change raises it for 30 minutes, and a full batch raises it again.
  - A failed email no longer raises `outbox:pending`.
  - A new KV flag, `outbox:retry`, holds the earliest `next_attempt_at` among emails waiting for another try, in epoch milliseconds. It expires 30 minutes after that time.
  - Each run rewrites `outbox:retry`. A run that leaves no email waiting clears it, if it was set.
  - The five-minute cron connects only when the outbox isn't paused and either `outbox:pending` is up or the time in `outbox:retry` has passed. Otherwise it reads KV and stops.
  - Status changes write only `outbox:pending` and the cron writes only `outbox:retry`, so neither can overwrite the other's due time.
  - The 01:00 run sends only due emails.
- **Unsubscribing (#26).** Unfollowing a request (`setSubscription` with `subscribed: false`) deletes, in the same transaction, the person's unsent emails for that request that no run has picked up yet. An email already being sent still goes out.

## Phase 6 follow-ups (#42–#47)

- **The invitation page after signing in (#42).** The invitation query's key becomes `["invitation", id, viewerId]`, where `viewerId` is the signed-in user's id or `null`. The signed-out answer is never shown to someone signed in.
- **Demoting yourself (#43).** A role change whose target is the viewer refreshes `me` as well as the team, so the admin controls disappear immediately.
- **Control characters in the feed (#44).** `escapeXml` drops the characters XML 1.0 forbids: U+0000–U+0008, U+000B, U+000C, U+000E–U+001F, U+FFFE and U+FFFF. Stored titles and notes stay as they were typed.
- **A stale feed (#45).** `PATCH /api/workspaces/:slug` (name and language) and deleting a board both call `dropChangelog`.
- **Join dates (#46).** Settings → Team shows each member's join date (`joinedAt`), formatted with `Intl` the same way as the invitations' expiry dates.
- **The invitation limit message (#47).**
  - `rateLimit` takes an optional error code.
  - The invitation routes pass `INVITE_LIMIT`, whose message is "You can send ten invitations an hour. Try again later."
  - Every other limit keeps `RATE_LIMITED`.

## CI and deploys (#48, #12, #37, #41)

- **Limit tests that don't flake (#48).**
  - Tests that fill a fixed window freeze the clock with `vi.useFakeTimers({ toFake: ["Date"] })`.
  - `vi.setSystemTime` sets the time to the middle of the window that holds the real current time: the hour, the ten-minute window, or the UTC day.
  - This covers the invitation, sign-in code, daily budget, post, vote and comment limits.
  - The spike confirms each limit reads its time from JavaScript. Any limit that reads Postgres's `now()` gets a `now` parameter instead.
- **Tighter CI (#12).**
  - Each job sets up Node 24 with `actions/setup-node`.
  - The workflow runs with `permissions: contents: read`.
  - `actions/checkout` moves to v5.
- **No preview URLs (#37).** `wrangler.jsonc` sets `"preview_urls": false` and `"workers_dev": true`.
- **The deploy job.**
  - **When:** on pushes to `main` only, after `verify` and `e2e` pass on that commit (`needs: [verify, e2e]`). Pull requests and feature branches never deploy.
  - **Environment:** the job uses a GitHub environment named `production`. Environments are free on public repositories, and it holds the job's two secrets:
    - `CLOUDFLARE_API_TOKEN`, created from Cloudflare's "Edit Cloudflare Workers" template and limited to the user's account
    - `CLOUDFLARE_ACCOUNT_ID`

    The Worker's own secrets stay on the Worker.
  - **One at a time:** the job is in the `production` concurrency group with `cancel-in-progress: false`, so deploys run in push order. The workflow's existing cancel-in-progress becomes `${{ github.ref != 'refs/heads/main' }}`, so a newer push can't cancel a run on `main` halfway through.
  - **Steps:** check out, set up Bun and Node, install, check migrations (below), then `bun run deploy`.
  - `bun run deploy` from a laptop stays as a manual fallback.
- **The migration guard.**
  - Production migrations stay a manual `bun run db:migrate:prod`, run by the user before pushing.
  - `GET /api/health` adds `migration`: the `created_at` of the newest row in `drizzle.__drizzle_migrations`. The route already queries the database, so this adds no new load.
  - `scripts/check-migrations.ts` fetches production's `/api/health` and compares `migration` with the last entry's `when` in `drizzle/meta/_journal.json`.
  - If production is behind, it fails and names the missing migrations, for example "production is missing 0014_…; run `bun run db:migrate:prod`, then re-run this job".
  - It also fails when `/api/health` doesn't answer or doesn't report `migration`.
  - New code never runs against an old schema.
- **#41** is closed with a note: deploys run from GitHub Actions instead of Workers Builds.

## Migration 0014

One migration holds:
- `comments (parent_id)` index
- `posts (pinned_comment_id)` partial index
- `email_outbox.next_attempt_at`

All three are additive, so the deployed code keeps working while the migration runs ahead of it.

## Languages

New strings come in English and Turkish, guarded by the key-parity test:
- `DEMO_BUSY`:
  - English: "The demo has had a lot of new posts this hour. Try again later."
  - Turkish: "Demoya bu saat çok sayıda yeni gönderi eklendi. Daha sonra tekrar deneyin."
- the guest note:
  - English: "Guest accounts only work in the demo."
  - Turkish: "Misafir hesaplar yalnızca demoda çalışır."
- `INVITE_LIMIT`:
  - English: "You can send ten invitations an hour. Try again later."
  - Turkish: "Saatte en fazla on davet gönderebilirsiniz. Daha sonra tekrar deneyin."
- the join date on Settings → Team

## Security

- **Preview URLs** are off, so no uploaded version except the deployed one runs against production's KV and Neon.
- **The deploy token** sits only in the `production` environment, and only the deploy job reads it. That job runs only on pushes to `main`. The workflow's default token is read-only.
- **Better Auth on demand** changes no rule: any request with a session-token cookie still has its session checked by Better Auth, and only requests without one skip it.
- **`/api/health`** reveals only a migration timestamp.
- **The demo cap** limits what one script can post through many guests.

## Testing

- **API tests** (Node and Postgres, as today):
  - **CPU:**
    - A request without a session cookie is answered without building Better Auth. A test counts the builds.
    - A comment `limit` of 21 is refused.
    - `withReplies` stops at `MAX_COMMENT_DEPTH` on data nested deeper.
    - Both indexes exist.
  - **The demo:**
    - Seeded ids are identical across two resets, and a `/p/<id>` link from before a reset still opens.
    - A team guest is still on the team after a reset.
    - The cap refuses the 31st request and the 61st comment in an hour, in production only.
    - Guest names follow the cookie, then the demo's default language.
    - `demo` and `pano` are refused as new addresses.
  - **The outbox:**
    - The backoff schedule.
    - An email isn't picked up before its due time.
    - `outbox:retry` holds the earliest due time and is cleared when nothing waits.
    - The cron doesn't connect before that time and does after it.
    - The nightly run respects due times.
    - Unfollowing drops the person's queued email and leaves others' alone.
  - **The follow-ups:**
    - The feed parses with every forbidden character in a title.
    - Renaming a workspace and deleting a board drop the cached feed.
    - The invitation limit answers `INVITE_LIMIT`.
    - `/api/health` reports the newest migration.
  - **#48:** the spike runs each frozen-clock test with the clock set a second before its window's edge, to show it passes there. The permanent tests freeze in the middle of the window.
- **Script tests:** `check-migrations`:
  - passes when production is current
  - fails and names the migrations when production is behind
  - fails when `/api/health` lacks `migration` or doesn't answer
- **Component tests:**
  - the landing page's demo buttons for signed out, guest, signed in, loading and error (#27)
  - the disabled controls and note for a guest on a real board (#33)
  - the banner on a demo request page (#32)
  - the join date (#46)
  - the invitation key changing with the viewer (#42)
  - demoting yourself refreshing `me` (#43)
- **Browser tests:** as today, plus a guest opening `/pano` and seeing voting disabled with the note.

## Release and done when

1. Typecheck, Biome, all tests and the build pass locally, and CI is green.
2. The user creates the Cloudflare API token, then a GitHub environment named `production` holding `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
3. The user runs `bun run db:migrate:prod`, which applies 0014.
4. The user deploys once by hand with `bun run deploy`. The guard needs a production that reports `migration`, and the deployed version before this one doesn't.
5. The user pushes `main`. CI runs `verify` and `e2e`, then `deploy`. The guard passes and the job deploys.
6. The browser tests pass against the live site.
7. `wrangler tail` meets the CPU target above.
8. **By hand:**
   - a demo request link saved today still opens after the next 01:00 UTC reset
   - a guest on `/pano` sees the disabled controls and the note
   - a shared demo `/p/…` link shows the banner
9. Issues are closed after these checks, with the user's consent.

## Out of scope

- the UI-polish backlog and the chores (Phase 8)
- GitHub sign-in (first on Phase 8's list) and passkeys
- password sign-in (its hashing doesn't fit the free plan's CPU)
- running production migrations from CI
- Workers Builds
- KV caching of public answers, unless the measurement calls for it
- redirecting demo links shared before this phase
- live updates (#40)
