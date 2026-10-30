# Pano Phase 6: a changelog and team invitations (design)

## Context

- **Why.** Pano launched on 2026-10-25, but two things keep it from serving a real team:
  - A workspace's team is only its owner. Status changes, merges and pinned replies only ever have one person to use them.
  - The landing page promises to tell everyone "the moment something ships", yet the only record of what shipped is the roadmap's last 30 days.
- **This phase adds:**
  - a changelog for each workspace, with a feed
  - email invitations, with a Team page
  - one daily email budget, because invitations become a third sender on Brevo's free 300 emails a day, next to sign-in codes and Shipped emails
- **Decided with the user (2026-10-30):**
  - The changelog is an automatic list built from shipped requests and the team's notes, plus an Atom feed. No hand-written entries.
  - Invitations come with a full Team page: roles, resend and cancel, role changes, removal, leaving.
  - Invitations go through Pano's own API, which calls Better Auth on the server. Better Auth's `/api/auth/organization/*` endpoints stay closed (`worker/app.ts`).
  - One shared daily email budget, with room kept back for sign-in codes.
  - The planned Phase 7 (live updates, #40) is dropped; #40 stays open as a parked idea.
- **Issues this phase closes:**
  - #2 (sign-in code caps)
  - #7 (two simultaneous workspace creates)
  - #8 (the workspace limit counts memberships)
  - #39 (`db:migrate:prod`)
  - the budget and timeout parts of #25 (its retry backoff stays open)
- **Unchanged constraints:**
  - free tiers only
  - the Workers free plan's 10 ms of CPU per request (#38)
  - Neon's 100 CU-hours a month: nothing new may wake the database on a timer
  - English and Turkish
  - the demo rules (`confineDemo`, `readOnlyInDemo`, no email from the demo)

## What it does

- **Visitors** open `/<workspace>/changelog`. It shows what shipped, newest first, grouped by month, each request with the team's shipping note. They can follow it with any feed reader.
- **Owners and admins** invite people by email from Settings → Team, as admins or members. They resend or cancel pending invitations, switch people between admin and member, and remove people.
- **Invited people** follow the emailed link, sign in with a code at the invited address, and join.
- **Members** can leave a team.
- **Every email Pano sends** draws on one daily budget, so no sender can lock everyone out of signing in.

## Changelog

**Page:**
- A "Changelog" link joins each workspace's menu: Requests · Roadmap · Changelog · Settings.
- The roadmap's Shipped column gets a "Full changelog" link.
- The page shows every shipped request that wasn't merged into another, newest first.
- Requests are grouped by month in the visitor's language and time zone (`Intl`).
- Each entry has:
  - the title, linking to `/p/<ref>`
  - the date it shipped
  - the vote count
  - the note from the request's latest move to Shipped, as plain text, shown only when there is one
- 20 per page, with an "Older" link (`?page=`). An empty changelog says nothing has shipped yet.

**API:**
- `GET /api/workspaces/:slug/changelog?page=` answers shipped, unmerged posts of the workspace, ordered by `status_changed_at` desc, then `id` desc. Each post comes with its latest shipping note, from `status_changes` where `to = 'shipped'`.
- Anyone can read it, since roadmaps are public.

**Feed:**
- `GET /api/workspaces/:slug/changelog.atom` answers Atom 1.0 (`application/atom+xml`) with the latest 20 entries.
  - **Feed:** title "<Workspace> changelog".
  - **Each entry:** id is the request's URL, the title, `updated` is the ship time, and the summary is the note.
  - **Text:** everything is XML-escaped.
- The page links to it as "Follow with RSS".

**The feed cache:**
- **Why:** feed readers check every hour or so, and a database query on every check would keep Neon awake.
- **How:** the rendered feed is stored in KV (`FLAGS` namespace, key `changelog:<workspace id>`) for one hour.
- **Hits:** a check that finds it there never reaches Postgres.
- **Dropping it:** the cached copy is deleted whenever the feed's content changes:
  - a request moves into or out of Shipped
  - a shipped request is edited, merged or deleted
  - the nightly demo reset runs (for the demo's copy)
- **Free limits:** the deletes and rebuilds stay far below KV's free 1,000 writes a day.

**Data:**
- No new tables.
- Migration 0011 adds an index on `posts (organization_id, status, status_changed_at)`. It serves this query and the roadmap's Shipped column.

**Demo:**
- Inkwell's changelog shows its five seeded shipped requests and their notes.
- Anything a guest ships appears too, until the nightly reset.

**Out of scope:** email digests (Brevo's quota), hand-written release notes, and feed-discovery tags in the page head.

## Team and invitations

**Roles** (Better Auth's `member.role`):

| Role | Can |
|---|---|
| Owner | Everything an admin can. There's exactly one: whoever created the workspace. Can't be removed, demoted, or leave (no ownership transfer in this phase). |
| Admin | Invite, resend and cancel invitations; switch admins and members; remove admins and members. Edit the workspace's settings (name, language, boards). |
| Member | Use the team tools as today: statuses with notes, roadmap moves, merges, pins, the Team badge. See the Team page. Leave. |

Workspace settings move from "anyone on the team" to owners and admins. `requireTeam` gains a minimum-role option for these routes. Only owners exist today, so nobody loses access.

**Team page (Settings → Team):**
- an invite form: email, and a role of admin or member
- members, with name (or "Anonymous"), email, role and join date
- pending invitations, with email, role, expiry, and Resend / Cancel

Rules for the page:
- Only the team can see it, so addresses are visible to teammates and nowhere else.
- Members see the lists; only owners and admins see the controls.
- In the demo, the page shows Inkwell's team read-only, without addresses, since they're made up.

**Invitation flow:**
1. An owner or admin invites an address as admin or member.
2. Pano sends the email at once, in the workspace's default language: "<Inviter> invited you to <Workspace>'s team on Pano". The inviter is named by their display name, or by the workspace's name when they haven't set one.
   - The link is `/invite/<id>` and expires in 7 days.
   - If Brevo refuses, the invitation stays pending and the page says so, so the inviter can resend.
3. `/invite/<id>` shows the workspace, the inviter, the role and the masked address (`s•••@studio.dev`):
   - **Signed out:** "Sign in", which returns to the invitation afterwards. The address never goes in a URL.
   - **Signed in at another address:** says the invitation is for another address, with "Sign out".
   - **Expired, cancelled, or already used:** a plain explanation.
   - **Already on that team:** a link to the workspace.
4. "Join <Workspace> as <role>" adds them and opens `/<workspace>`.

**Rules:**
- **Who can accept:** only the invited address. Better Auth checks the session's email. Invitation ids are long random strings.
- **Repeat invites:** inviting an address that already has a pending invitation resends it, with a fresh expiry, instead of creating a second one. Inviting someone already on the team is refused.
- **Limits:**
  - 20 pending invitations per workspace
  - 50 people per team
  - 10 invitations or resends an hour per person
- **Demo:** inviting, accepting, role changes and removals are refused (DEMO_READ_ONLY / DEMO_ONLY). Demo accounts can't accept invitations to real workspaces.
- **Reserved address:** `invite` joins the reserved workspace addresses.

**One owned workspace per account (#8, #7):**
- "One workspace per account" now counts only workspaces you own, so joining a team never stops you from creating your own.
- Better Auth's `organizationLimit` (which counts memberships) is dropped.
- A partial unique index on `member (user_id) where role = 'owner'`, added in migration 0011, enforces the rule. That also fixes #7, where two simultaneous creates both succeeded.
- `POST /api/workspaces` answers the existing "one workspace per account" error when the index refuses. If a half-created workspace is left behind, it removes it.

**API** (Pano's typed API; each route calls Better Auth's server API or the tables):

| Endpoint | Who | Notes |
|---|---|---|
| `GET /api/workspaces/:slug/team` | team | Members and pending invitations |
| `POST /api/workspaces/:slug/invitations {email, role}` | owner, admin | Resends when one is pending; rate-limited; uses the email budget |
| `POST /api/invitations/:id/resend` | owner, admin | Fresh expiry; rate-limited; uses the email budget |
| `DELETE /api/invitations/:id` | owner, admin | Cancels |
| `GET /api/invitations/:id` | anyone with the link | Workspace, inviter, role, masked address, state |
| `POST /api/invitations/:id/accept` | the invited address | Joins with the invited role |
| `PATCH /api/workspaces/:slug/members/:userId {role}` | owner, admin | Admin ↔ member; never the owner |
| `DELETE /api/workspaces/:slug/members/:userId` | owner, admin; or yourself | Remove, or leave; never the owner |

**Error codes** (translated in the UI):
- INVITATION_EXPIRED
- INVITATION_NOT_FOUND
- INVITATION_WRONG_ADDRESS
- ALREADY_ON_TEAM
- TEAM_FULL
- TOO_MANY_INVITATIONS
- OWNER_PROTECTED
- EMAIL_BUDGET
- CODE_LIMIT

## Email budget and sign-in limits

**Counters:**
- Migration 0011 adds `email_counters (key, window_start, count)`, with the primary key `(key, window_start)`.
- A sender claims a slot with one atomic statement before sending: an insert, or an increment while under the limit. Simultaneous claims can't pass a limit.
- The nightly cron deletes windows older than two days.

**The daily budget** (key `daily`, window = the UTC day):
- Sign-in codes may claim up to 300, Brevo's free daily limit.
- Invitations and Shipped emails may claim only while the day's count is under 200, so at least 100 always remain for sign-in.
- The demo sends no email, so it never claims.

**When the budget is spent:**
- **Invitations** are refused with EMAIL_BUDGET: "Pano has sent all the email it can today. Try again tomorrow."
- **Shipped emails** stay queued. The five-minute cron sets a KV key that expires at the next UTC midnight, and while it exists, the cron returns before connecting to the database. Neon isn't woken every five minutes until then. The queue continues the next day: the 01:00 run sends a batch, as it does every night, and raises the pending flag again after a full one.
- **Sign-in codes** past 300 are refused with EMAIL_BUDGET.

**Per-address code limit (#2):**
- At most 3 codes per address in 10 minutes. The key is `code:<sha-256 of the lowercased address>`, with a 10-minute window, so no plain addresses are stored.
- Over the limit, the request is refused with CODE_LIMIT: "Too many codes sent to this address. Try again in a few minutes."
- Both checks happen in the email-code callback. The auth route answers 429 with the code, the way it already reports a failed send.
- The existing per-IP limits stay.

**Brevo:** every call gets a 10-second timeout (`AbortSignal.timeout`).

## Production migrations (#39)

- `.env` keeps `DATABASE_URL` on the local database, and the production URL as `NEON_DATABASE_URL`.
- A new `bun run db:migrate:prod` script runs drizzle-kit's migrations with `DATABASE_URL` taken from `NEON_DATABASE_URL`.
- The README's Deploying section names the script.

## Languages

New strings come in English and Turkish, guarded by the key-parity test:
- the changelog
- the Team page
- the invitation page and email
- the new error messages

The invitation email uses the workspace's default language.

## Security

- **Endpoints:** Better Auth's organization endpoints stay closed to browsers. Every team change goes through Pano's routes and their checks.
- **Roles:** checked on the server only. The owner can't be removed, demoted, or have their role changed by anyone.
- **Invitations:** the accept route requires a signed-in session at the invited address. GET answers only a masked address.
- **Addresses:** none appear in URLs. Rate-limit keys for addresses are hashed.
- **Abuse:** invitations are rate-limited per person and draw on the email budget, so a team can't be used to spam addresses.

## Testing

- **API tests** (Node and Postgres, as today):
  - **Changelog:** order and paging, notes, merged requests and other workspaces left out, Atom well-formed with escaping, and the KV cache (hit, miss, dropped on every change listed above).
  - **Invitations and the team:** who may do what per role, the owner protected, wrong address, expired, cancelled, inviting again, the limits, the demo refusals, the email's language.
  - **One owned workspace:** including two creates at once.
  - **The budget:** concurrent claims never pass a limit; invitations and Shipped emails stop at 200 while codes go on to 300; the day rolls over; the per-address limit works.
  - **The paused cron:** doesn't touch the database.
  - **Brevo:** a hanging call is cut off.
- **Component tests:**
  - the changelog's month grouping and empty state
  - the Team page by role
  - every state of the invitation page
- **Browser tests:**
  - the team ships a request in the demo with a note, and it heads the changelog
  - the demo's Team page lists Inkwell's team, read-only
- **By hand on the live site:** the user invites a second address of their own to `/pano` and joins from its inbox, and the feed opens in a feed reader.

## Done when

1. Typecheck, Biome, all tests and the build pass locally and in GitHub CI.
2. The user deploys with `bun run deploy` and migrates production with `bun run db:migrate:prod`.
3. The browser tests pass against the live site.
4. The by-hand checks above pass.

## Out of scope

- ownership transfer
- declining an invitation (it simply expires)
- email digests and hand-written release notes
- feed discovery tags
- the retry backoff in #25
- live updates (#40)
