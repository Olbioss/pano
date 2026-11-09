# Pano Phase 8: sign-in methods (design)

## Context

- **Why.** Email codes are Pano's only way in, so every sign-in waits for an email. Each code also spends part of Brevo's 300 emails a day, which Shipped emails and invitations share.
- **What this phase adds:**
  - passwords, with sign-up confirmed by a code
  - passkeys
  - GitHub sign-in
  - an account page to manage them
- **Decided with the user (2026-11-09):**
  - Better Auth stays. Its password hashing is replaced with PBKDF2 from Web Crypto, because its default (scrypt) measured about 33 ms of CPU per hash on 2026-11-06.
  - Phase 8 is sign-in only. The UI-polish backlog (#4–#6, #9, #10, #15–#18, #21, #22, #24, #29) and the chores (#11, #13, #14, #23, #34, #35) move to Phase 9.
  - People sign up with an email and a password, then confirm with an emailed code. A "Forgot password?" flow resets a password with a code.
  - A GitHub sign-in whose email GitHub has verified joins the existing Pano account with that email.
  - The build uses Better Auth's own pieces (approach A): its password sign-in, its email-code plugin, its passkey plugin and its GitHub provider. Pano adds the rules around them and the screens.
  - Better Auth goes from 1.7.10 to 1.7.18. The passkey plugin needs it, and the user wants the upgrade anyway.
  - New passwords are checked against Have I Been Pwned's leaked-password list. When that service doesn't answer, the password is accepted and the miss is logged.
- **Issues:** none of these features has an issue. This phase closes none; it adds none of its own unless the review finds one.
- **Unchanged constraints:**
  - free tiers only
  - Neon's 100 CU-hours a month: nothing new may wake the database on a timer
  - English and Turkish
  - the demo rules (`confineDemo`, `readOnlyInDemo`, no email from the demo)
  - no secrets in the repo or in `wrangler.jsonc`
- **Handoff:** after the phase, a report in chat lists every authentication file added or changed, and what each change does.

## What people see

### Sign-in (`/signin`)

- Email and password, with a "Forgot password?" link.
- "Email me a code instead": today's code flow, unchanged.
- "Continue with GitHub", shown only when the GitHub secrets are set.
- "Sign in with a passkey". Browsers that support passkey autofill also offer saved passkeys when the email field is focused. The field carries `autocomplete="username webauthn"`.
- "New here? Create an account" links to `/signup`.
- The password field uses `autocomplete="current-password"`, so password managers fill it.
- An unconfirmed account that signs in with its password is told to confirm its email first. The screen offers "Send a new code", which leads to the confirmation step below.
- After any sign-in, the app goes where today's sign-in goes: the `redirect`, your workspace, or `/new-workspace`.

### Create an account (`/signup`)

1. Email and password (8 to 128 characters, `autocomplete="new-password"`). No name: the submit form asks for one later, as today.
2. "We sent a code to …": the code field, plus "Send a new code".
3. You're signed in, then go where sign-in goes.

The confirmation step sends the code together with the password typed in step 1, which the page still holds. Passwords below explains why.

### Forgot password

1. Enter your email.
2. Enter the emailed code and a new password.
3. The app signs in with the new password. Your other devices are signed out.

The screens look the same whether or not the address has an account.

### Account page (`/account`)

Your name in the header links here. Signed-out visitors are sent to `/signin?redirect=/account`.

- **Name:** change it, through the existing `PATCH /api/me`.
- **Password:** "Set a password" for accounts without one. "Change password" for the rest; it asks for the current one.
- **Passkeys:** each one's name (the browser and system it was made on, such as "Safari on iPhone") and the date it was added. "Add a passkey"; "Remove" on each.
- **GitHub:** connected or not, with "Connect GitHub" or "Disconnect". Email codes always work, so disconnecting never locks anyone out.
- **Sign in again:** adding a sign-in method needs a sign-in within the last 24 hours. When the session is older, those buttons are replaced by "Sign in again to add a sign-in method", which links to `/signin?redirect=/account`.
- **Demo guests:** the page says demo accounts can't add sign-in methods, and shows no controls.

### Existing users

Nothing changes for them: email codes keep working. They can add any of the new methods from the account page.

## Passwords

### Hashing

- PBKDF2-SHA256 with 100,000 rounds, the most workerd allows. Each hash gets a random 16-byte salt and is 32 bytes long.
- Stored in the existing `account.password` column as `pbkdf2-sha256$100000$<salt>$<hash>`, with salt and hash in base64url.
- Checking a password reads the round count from the stored hash, so the count can be raised later without breaking old hashes. The comparison runs in constant time.
- A stored value that doesn't parse counts as a wrong password; it never throws.
- No existing hashes need converting: passwords were never enabled.
- Measured on 2026-11-09 on the development Mac: 5.8 ms per hash at 100,000 rounds (33.7 ms at OWASP's 600,000).

### Rules

- 8 to 128 characters.
- **Breach check:** a new password (sign-up, set, change, reset) is checked against Have I Been Pwned's Pwned Passwords.
  - Only the first 5 characters of its SHA-1 hash are sent. The reply is padded, and the match happens in the Worker.
  - A leaked password is refused with a translated message.
  - When the service fails or doesn't answer, the password is accepted and `[auth] breach check unavailable` is logged.
  - It uses Better Auth's exported `isPasswordCompromised` inside Pano's hash function. Better Auth's plugin version would refuse the password during an outage, so Pano doesn't use it.

### Confirmation

- `requireEmailVerification` is on: an unconfirmed account's password can't sign in.
- Sign-up emails a confirmation code, through Better Auth's email-code plugin.
- **Confirming keeps the password only when the confirmation carries that password.**
  - The confirmation goes to `POST /api/auth/sign-up/confirm` `{ email, code, password }`. It's a small Pano plugin endpoint, like the demo sign-in.
  - If the password matches the unconfirmed account's, the address is confirmed and the password kept.
  - If it doesn't, the address is still confirmed and the person signed in, but the unconfirmed password is deleted.
  - Why: someone who signs up with another person's address knows the password but never sees the code. The owner sees the code but not the attacker's password. Only someone with both keeps a password.
  - Every request runs one password check, against a dummy hash when there's no unconfirmed account, so timing doesn't reveal which case applies.
  - If the address belongs to an already-confirmed account (see duplicate sign-ups below), the code signs into that account and the typed password is ignored.
  - Wrong codes, expired codes and unknown addresses all get the same answer.

### Unconfirmed sign-ups

- **They belong to nobody.** An account counts as an unconfirmed sign-up when its `emailVerified` is false and it has a password. Only password sign-up makes these: email-code and demo accounts are created confirmed and have no password, and GitHub accounts without a verified email are refused. Requiring the password as well means an older account that somehow has `emailVerified` false is never replaced or cleaned up.
- **Other proof deletes the password.** When an unconfirmed address is confirmed some other way, Pano deletes the account's password before the sign-in finishes. "Other ways" are a sign-in code, GitHub with that verified email, or `/sign-up/confirm` without the matching password.
  - A password reset is exempt: it replaces the password anyway.
- **Signing up again replaces the earlier unconfirmed sign-up.** Pano deletes it before Better Auth creates the new one. The confirmation rule above keeps this safe: a code entered without the latest password confirms the address but keeps no password.
- **Cleanup:** the nightly cron deletes unconfirmed sign-ups more than 7 days old. They can't own anything, since they can't sign in. Demo accounts are confirmed, so the cleanup never touches them.

### Duplicate sign-ups

- Signing up with an address that already has a confirmed account shows the same "We sent a code" step. Better Auth returns its generic response for this case.
- The owner gets an email saying someone tried to create an account with their address, that they already have one, and that the code signs them in. It ends with "ignore this email if it wasn't you".
- Entering that code on the sign-up screen signs into the existing account. The typed password isn't saved.

### Wrong passwords

- A wrong password and an address with no account get the same error. Better Auth already hashes a dummy password for missing accounts.
- **Per-address pause:** after 10 wrong passwords for one address within a UTC hour, password sign-in for that address is refused until the hour ends.
  - The refusal says to use an email code. Codes still work, so an attacker can't lock the owner out.
  - It's counted per address, keyed by the address's hash as the email caps are, whether or not an account exists. So the pause reveals nothing.

### Sessions

- Changing a password signs out your other devices. Pano forces `revokeOtherSessions`.
- A reset signs out all sessions (`revokeSessionsOnPasswordReset`).
- Pano's 5-minute session cookie cache lets another device stay signed in for up to 5 minutes after either.

## Passkeys

- `@better-auth/passkey` 1.7.18.
- The relying party is the host of `BETTER_AUTH_URL`: `pano.olbios88.workers.dev` in production, `localhost` in development. The origin is `BETTER_AUTH_URL` itself, and the relying-party name is "Pano".
- Passkeys are discoverable, so a passkey can sign in without typing an email. Pano asks the device to verify the user where it can.
- Added only while signed in, subject to the 24-hour rule, and never by demo guests.
- At most 10 per account. The 11th is refused with a translated message.
- The name is made in the browser from its user agent ("Chrome on macOS"). Renaming is out of scope.
- Removing one needs only a signed-in session.
- A passkey sign-in creates a session like any other sign-in.

## GitHub sign-in

- Better Auth's GitHub provider, with the scopes `read:user` and `user:email`. It reads the account's primary email and whether GitHub has verified it.
- Configured only when both `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are set. `GET /api/me` reports whether GitHub sign-in is available, and the app hides its buttons when it isn't. A missing secret never breaks sign-in.
- **Joining an existing account:** account linking is on, but GitHub isn't a "trusted provider". So Better Auth links only when GitHub says the email is verified.
- **No verified email:** refused. The person lands on `/signin` with a translated message.
- **New accounts:** the display name is the GitHub name, or the login when there's no name, after `cleanDisplayName`. It can be changed on the account page.
- **Connecting from the account page:** needs a sign-in within the last 24 hours. GitHub returns you to `/account`.
- **Disconnecting:** allowed even when GitHub is the account's only linked sign-in (`allowUnlinkingAll`), since email codes always work.
- **Errors:** any GitHub failure lands on `/signin?error=…`, with a translated message.

## Shared rules

### The email budget

Every code email takes exactly one place in the existing caps (`CODES_PER_ADDRESS` per 10 minutes, and the daily total) before it's sent. That covers sign-in, confirmation, duplicate-sign-up and reset codes.
- A refused claim sends nothing and answers 429, which the screens show as "wait before asking for another code".
- The caps apply to every address alike, so a refusal reveals nothing.
- Pano no longer sends confirmation codes on password sign-in (`sendOnSignIn` is off). "Send a new code" goes through sign-up again instead, so codes are claimed in only three places:
  - sign-up
  - the sign-in code request
  - the reset code request

### Rate limits

These use Better Auth's database-backed limiter, per IP address, per minute:

| Route | Limit |
|---|---|
| `/sign-up/email` | 3 |
| `/sign-in/email` | 5 |
| `/sign-up/confirm` | 10 |
| The reset-code request | 3 |
| `/email-otp/reset-password` | 10 |
| Passkey sign-in (its options and its check) | 20 (the passkey autofill asks once per sign-in page view) |
| `/sign-in/social` | 10 |

Unchanged: the sign-in code request (3), the sign-in code check (10) and demo sign-in (5).

`POST /api/me/password` uses Pano's own per-account limiter: 5 an hour.

### Adding a sign-in method needs a recent sign-in

- Setting a first password, adding a passkey and connecting GitHub each need a session created within the last 24 hours.
- An older session gets `SIGN_IN_AGAIN` (403), and the account page shows its "Sign in again" prompt. `GET /api/me` tells the page when the session started, so it can show the prompt up front.
- Changing a password doesn't need this: it asks for the current password instead.

### Demo guests

The server refuses all of these for demo accounts, with the existing demo error:
- setting or changing a password
- adding a passkey
- connecting GitHub
- signing up with a demo address

Demo accounts have no password, so they can't sign in with one either.

## Code and data

### Packages

- `better-auth` and the `@better-auth/*` packages: 1.7.10 → 1.7.18.
- New: `@better-auth/passkey` 1.7.18, which brings `@simplewebauthn/server` and `@simplewebauthn/browser`.

### Migration 0015

- A new `passkey` table, with Better Auth's passkey columns:
  - `id`, `name`, `public_key`
  - `user_id`, deleted with its user
  - `credential_id`, unique
  - `counter`, `device_type`, `backed_up`, `transports`, `aaguid`, `created_at`
- An index on `passkey (user_id)`.
- Nothing else changes: passwords use `account.password`, and GitHub uses ordinary `account` rows.

### Worker

`worker/auth.ts` becomes the folder `worker/auth/`:
- **`index.ts`:** `createAuth`. It holds the Better Auth config:
  - email and password, with Pano's hash and verify
  - the email-code plugin with its confirmation and reset codes
  - passkeys, the GitHub provider and account linking
  - the rate limits
  - the hooks from `guards.ts`
- **`password.ts`:** `hashPassword` and `verifyPassword` (PBKDF2), and the fail-open breach check.
- **`guards.ts`:** the rules above:
  - the email-budget claims
  - replacing and cleaning up unconfirmed sign-ups
  - deleting an unconfirmed password on other proof
  - the per-address password pause
  - the 24-hour rule
  - the demo refusals
  - the passkey cap
- **`sign-up-confirm.ts`:** the `/sign-up/confirm` plugin endpoint.

Elsewhere in the Worker:
- **`worker/demo/sign-in.ts`:** stays as it is, imported from the new folder.
- **Mailer:** `sendSignInCode` becomes `sendCode({ to, code, locale, kind })`, where `kind` is `sign-in`, `confirm`, `existing-account` or `reset`. Templates for each, in English and Turkish.
- **New route `POST /api/me/password`** `{ password }`. It sets a first password through Better Auth's server-only `setPassword`. It refuses:
  - an account that already has a password (409, `PASSWORD_EXISTS`)
  - a stale session (`SIGN_IN_AGAIN`)
  - a demo guest
- **`GET /api/me`** adds:
  - `signIn: { github: boolean }`, telling the app whether GitHub sign-in is available
  - for a signed-in user, `sessionStartedAt`
- **Nightly cron:** also deletes unconfirmed sign-ups more than 7 days old.
- **`worker/env.ts`:** optional `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.

### App

- **`/signin`:** reworked.
- **New routes:** `/signup`, `/forgot-password` and `/account`.
- **The header:** your name links to `/account`.
- **`src/lib/auth-client.ts`:** gains the passkey client plugin.
- **Errors:** Better Auth's error codes map to translated messages. The app never shows Better Auth's English text.
- All new text is in `messages/en.json` and `messages/tr.json`.

## CPU

- **Ordinary requests must not get slower.** The passkey library makes the Worker bigger, and every cold request pays to load it.
  - The spike measures the Worker's size, and cold-request CPU under Node as in Phase 7, before and after adding it.
  - If cold requests grow by more than 1 ms, the passkey code is loaded with a dynamic import, so only passkey routes pay for it.
  - Live, the ordinary-request median must stay at or under 10 ms.
- **Sign-in paths** (password, confirmation, passkey, GitHub callback) are measured live after release.
  - Sign-in already costs more than 10 ms (demo sign-in: a median of 67 ms on 2026-11-08), and people sign in rarely.
  - The target is no CPU-limit errors in `wrangler tail`, with each path's median recorded.

## Spike questions

The spike runs on Better Auth 1.7.18 in a throwaway worktree and answers each of these before the plan is written. A "no" makes the plan use the fallback named here.

1. **Custom hashing everywhere:** Better Auth uses Pano's `hash` and `verify` for sign-up, sign-in, set, change and reset. The breach check sees the endpoint path through `getCurrentAuthEndpointContext`.
2. **Empty sign-up name:** sign-up accepts an empty `name`. Fallback: the app sends a placeholder that the `user.create` hook clears.
3. **Duplicate sign-ups:** `onExistingUserSignUp` can send one sign-in code with the `existing-account` wording, taking a single place in the caps.
4. **Confirmation signing in:** `/sign-up/confirm` can confirm through the email-code plugin's verify-email, sign in, and return the session cookies. Its keep-or-delete decision reaches the hook through the per-request `createAuth` dependencies. Fallback: the endpoint confirms and creates the session through Better Auth's internal adapter.
5. **Catching other proof:** a sign-in code and a GitHub link on an unconfirmed account each set `emailVerified` through a user update, which the `user.update` hook sees with the endpoint path. A reset's own update is recognised by its path. Fallback: before hooks on those paths delete the unconfirmed password once the code or OAuth state has been checked.
6. **GitHub's verified flag:** the GitHub provider reports `emailVerified` from the primary email's verified flag, implicit linking requires it, and `user.create` can refuse an unverified GitHub user.
7. **Counting failures:** after hooks see a failed `/sign-in/email`, so the per-address pause can count it. Fallback: a before hook counts the attempt, and an after hook clears the count on success.
8. **Passkeys on Workers:** the plugin works in workerd. Discoverable credentials can be required. The spike records its registration paths, and the bundle-size and CPU numbers above.
9. **Resetting without a password:** a reset on an account with no password creates one. Fallback: the reset route sets it through `setPassword`.
10. **Disconnecting GitHub:** `allowUnlinkingAll` lets an account disconnect its only linked sign-in.
11. **Test passkeys:** a software authenticator for integration tests can be built with SimpleWebAuthn's own CBOR and COSE helpers.
12. **Email-code accounts are confirmed:** an email-code sign-in creates its account with `emailVerified` true, and sets it on an existing account where it's false. The spike reads Better Auth's code; production data isn't read.

## Languages

- Every new screen, message and email exists in English and Turkish, guarded by the existing matching-keys test.
- Code emails pick the language as today (`localeFromHeaders`).
- Better Auth's error codes are translated in the app.

## Security

- No secrets in the repo: the GitHub values are Worker secrets the user sets with `wrangler secret put`.
- The breach check sends 5 characters of a SHA-1 hash, never the password.
- **Unconfirmed sign-ups can't be hijacked:**
  - A password survives confirmation only together with the code.
  - Any other proof of the address deletes it.
  - A second sign-up replaces the first.
- **No screen reveals whether an address has an account:**
  - sign-up, forgot password and wrong passwords answer the same
  - the confirmation route's timing is the same
  - the email caps and the password pause are per address
- Adding a sign-in method needs a session under 24 hours old. A password change needs the current password, and signs out other devices.
- Linking GitHub requires GitHub's verified flag.
- Passkeys are bound to Pano's host.

## Testing

- **Unit tests:** `hashPassword` and `verifyPassword`:
  - a password checks against its own hash
  - a wrong password fails
  - a tampered or malformed hash fails without throwing
  - the round count is read from the hash
- **Integration tests** run against Postgres through the Worker app and Better Auth's routes. The mailer is captured, so tests read the codes.
  - **Sign-up:**
    - sign up, confirm with the code and the password, and you're signed in
    - the password refused before confirmation
    - "Send a new code" through sign-up again
  - **The confirmation rule:**
    - the code with the wrong password confirms and signs in but leaves no password
    - wrong codes, expired codes and unknown addresses answer the same
  - **Duplicate sign-ups:**
    - the same response
    - the `existing-account` email is sent once
    - its code signs into the existing account, and the typed password isn't saved
  - **Unconfirmed sign-ups:**
    - signing up again replaces the earlier one
    - a sign-in code deletes the unconfirmed password
    - a GitHub link deletes it
    - a reset keeps the new password
    - the nightly cleanup deletes sign-ups at 7 days but not at 6, and never a demo or confirmed account
  - **Forgot password:**
    - the reset works and signs out other sessions
    - an unknown address gets the same answer and no email
    - an account with no password gets one
  - **The email budget:** each kind of code takes one place; a refused claim sends nothing and answers 429.
  - **Limits:**
    - each new rate limit
    - the per-address pause after 10 wrong passwords, the same for an address with no account, with email codes still working
  - **Sessions:** a password change signs out other sessions; a reset signs out all of them.
  - **`POST /api/me/password`:**
    - sets a first password
    - refuses an existing password, a stale session and a demo guest
    - its own limit
  - **The breach check:** a leaked password is refused on each of the four paths. With the service failing, it's accepted and logged. A fetch stub stands in for the service.
  - **GitHub,** with fetch stubs for GitHub's token, user and email endpoints:
    - a new account takes the GitHub name, or the login
    - a verified email joins the existing account
    - an unverified email is refused
    - connecting needs a fresh session
    - disconnecting works when GitHub is the only linked sign-in
    - with no secrets, `GET /api/me` reports GitHub unavailable and sign-in still works
  - **Passkeys,** with a software authenticator:
    - add one, then sign in with it
    - the cap of 10
    - the fresh-session rule
    - a demo guest refused
    - removing one
  - **Demo guests:** each new method refused.
- **Component tests:**
  - `/signin`'s modes and its unconfirmed-account prompt
  - `/signup`'s code step sending the password along
  - `/forgot-password`
  - the account page's states: no password, has one, passkeys listed, GitHub connected or not or unavailable, "Sign in again", demo
  - translated errors
- **Browser tests:**
  - **Sign up, then sign in:** sign up with a password, then sign out and sign in with it. Codes are stored hashed, so the test confirms the address through the database. The code screens are covered by the integration and component tests.
  - **Passkeys:** add a passkey with Chrome's virtual authenticator, sign out, and sign in with it.
  - These run locally and in CI only. The live-site run skips them, so the live site never emails test addresses or keeps test accounts.
- **CPU:** the spike's bundle-size and cold-request numbers go in the plan.

## Release and done when

1. Typecheck, Biome, all tests and the build pass locally, and CI is green.
2. The user creates a GitHub OAuth app with the homepage `https://pano.olbios88.workers.dev` and the callback `https://pano.olbios88.workers.dev/api/auth/callback/github`. Then they set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` with `wrangler secret put`.
3. The user runs `bun run db:migrate:prod`, which applies 0015.
4. The user pushes `main`. CI runs `verify` and `e2e`, then `deploy`, whose guard confirms 0015 is in place.
5. The browser tests pass against the live site, minus the local-only ones.
6. `wrangler tail` meets the CPU targets above.
7. **By hand:**
   - sign up with a real address and confirm it
   - sign in with the password
   - reset the password
   - add a passkey on your own device, and sign in with it
   - sign in with GitHub into your existing account
   - check the Turkish screens and emails
8. The authentication report is posted in chat.

## Out of scope

- the UI-polish backlog and the chores (Phase 9)
- changing an account's email address
- deleting accounts
- renaming passkeys
- two-factor codes (TOTP)
- other sign-in providers (Google and so on)
- passkeys creating new accounts
- running production migrations from CI
- live updates (#40)
