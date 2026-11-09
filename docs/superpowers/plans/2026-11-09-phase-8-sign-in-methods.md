# Phase 8: Sign-in methods — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People can sign in with a password, a passkey or GitHub, as well as an emailed code, and manage those on an account page, all within the Workers free plan.

**Architecture:**
- **Better Auth stays,** on 1.7.18, and does the work through its own pieces:
  - email and password, with Pano's PBKDF2 hash in place of scrypt
  - the email-code plugin, for confirmation and reset codes
  - the passkey plugin
  - the GitHub provider
- **`worker/auth/` replaces `worker/auth.ts`:**
  - **`guards.ts`:** one before hook and one after hook hold Pano's rules around Better Auth's routes:
    - the email budget
    - unconfirmed sign-ups
    - the confirmation rule
    - leaked passwords
    - the pause after ten wrong passwords
    - demo guests
    - the recent sign-in that adding a way to sign in needs
  - **`passkeys.ts`:** loaded with a dynamic import only for `/api/auth/passkey/*`, so other requests start without its 650 KB.
- **The confirmation rule:** a sign-up's password survives confirmation only when it comes with the code. Any other proof of the address keeps no password: a code alone, a sign-in code, or a reset.
- **The app:**
  - a reworked `/signin`
  - new `/signup`, `/forgot-password` and `/account` pages
  - all their text in English and Turkish

**Tech Stack:**
- the Phase 0–7 stack
- Better Auth 1.7.18 (from 1.7.10)
- new: `@better-auth/passkey` 1.7.18
- new, for tests only: `@simplewebauthn/server` 13

**Spec:** `docs/superpowers/specs/2026-11-09-phase-8-sign-in-methods-design.md`

**Verified in a throwaway spike (2026-11-09):** worktree `scratchpad/p8-spike`, branch `spike/phase-8`, commits fd88e68..1f336ef.
- **Spike results:** every task was built there with its tests.
  - The suite went from 83 files and 665 tests to 94 files and 811.
  - Typecheck, Biome and the build passed.
  - `wrangler deploy --dry-run` passed at 2507 KiB, 557 KiB gzipped. The free plan allows 3 MB gzipped.
  - The browser tests passed 8/8 against the production build, passkey sign-in included.
- **Each task's failing tests were measured** on its parent commit. The plan's "watch it fail" lines are those runs.
- **Re-applied from this plan's own text (2026-11-09):** a second worktree, branch `reapply/phase-8` from 876106e. Each task's steps were applied exactly as written, and every Run was compared with its Expected.
  - Every task's new tests failed first, as stated, then passed at the counts each task states.
  - It ended at 94 files and 811 tests, with the build, the dry-run deploy (2507 KiB) and 8/8 browser tests passing.
  - The finished tree is byte-identical to the spike's, apart from drizzle's generated snapshot id and timestamp.
  - It caught one step whose command exited 1 on success (Task 1, Step 3), fixed in this text.
- **CPU per request** (Node, a fresh process, median of 5 runs, ms of CPU):

  | Route | Before passkeys: first / later | With passkeys: first / later |
  |---|---|---|
  | `/api/me`, signed out | 3.3 / 0.9 | 3.2 / 0.9 |
  | feed | 7.3 / 5.0 | 7.3 / 4.9 |
  | `/api/me`, signed in, no cache cookie (builds Better Auth) | 18.4 / 5.4 | 19.1 / 5.6 |

- **Worker startup** (`wrangler check startup`, local workerd, active ms, 3 runs each):

  | Build | Startup | Worker JS |
  |---|---|---|
  | Without passkeys | 21.1–22.4 | 1,890,730 B (417.5 KiB gzipped) |
  | Passkeys imported statically | 25.3–27.2 | 2,563,228 B (554 KiB gzipped) |
  | Passkeys imported only for their routes | 21.1, 21.1, 21.1 | 1,345,709 B, plus a 669,108 B passkey chunk |

  The spec's rule triggers: about 4.5 ms more startup on every cold isolate is more than 1 ms. So the passkey plugin loads with a dynamic import.
- **Password hashing:** PBKDF2-SHA256 at 100,000 rounds measured 5.8 ms on the development Mac, against 33.7 ms at OWASP's 600,000.
- **Better Auth 1.7.18 answers the spec's 12 questions:**
  1. **Custom hashing everywhere:** `emailAndPassword.password.{hash, verify}` serves sign-up, sign-in, set, change and reset. `setPassword` is server-only, so `/api/me/password` checks for leaks itself.
  2. **Empty sign-up name:** `name` may be an empty string.
  3. **Duplicate sign-ups:**
     - With `requireEmailVerification`, a duplicate gets Better Auth's generic response.
     - The email-code plugin's `sendVerificationOnSignUp` after-hook then makes a confirmation code for that address and sends it, so the existing owner gets one.
     - `onExistingUserSignUp` isn't needed.
  4. **Confirmation signing in:** `/email-otp/verify-email` checks the code, sets `emailVerified`, and with `autoSignInAfterVerification` signs in. Before hooks see the raw body, so a `password` field reaches Pano's guard. `disabledPaths` closes routes over HTTP only.
  5. **Other proof:**
     - A sign-in code on an unconfirmed account runs Better Auth's `revokeUnprovenAccountAccess`, which deletes its password, its OAuth links and its sessions.
     - GitHub refuses to join an unconfirmed account (`requireLocalEmailVerified` defaults to true).
     - A reset replaces the password, then confirms.
  6. **GitHub's verified flag:**
     - `emailVerified` comes from GitHub's email list.
     - The display name is `name`, else `login`.
     - `user.validateUserInfo` can refuse creating an account.
  7. **Counting failures:** after hooks run when the endpoint throws, with `ctx.context.returned` set to the `APIError`.
  8. **Passkeys:**
     - Registration uses `freshSessionMiddleware`, whose `session.freshAge` defaults to one day.
     - `authenticatorSelection` sets `residentKey`.
     - The routes are `/passkey/generate-register-options`, `/passkey/verify-registration`, `/passkey/generate-authenticate-options`, `/passkey/verify-authentication`, `/passkey/list-user-passkeys` and `/passkey/delete-passkey`.
  9. **Resetting without a password:** a reset on an account without one creates its password.
  10. **Disconnecting GitHub:** `allowUnlinkingAll` exists. `/unlink-account` takes the listed account's `accountId` and needs a fresh session.
  11. **Test passkeys:** SimpleWebAuthn's `isoCBOR`, `cose` and `isoBase64URL` helpers build a software passkey device.
  12. **Email-code accounts are confirmed:** they're created with `emailVerified` true.

**Decided in this plan** (flag any you disagree with at review):
1. **Confirming goes through Better Auth's own `/email-otp/verify-email`,** with `password` in the body, rather than a new `/sign-up/confirm` endpoint. The guard checks the password before the route runs, and drops it afterwards unless it matched. It means one route fewer.
2. **GitHub can't sign in to an unconfirmed sign-up's address.** The spec said GitHub would delete the unconfirmed password; Better Auth refuses the link instead.
   - The person is told to sign in with an email code first, which deletes the unconfirmed password.
   - The security is the same, with no custom hook.
3. **"Sign in again" uses Better Auth's `SESSION_NOT_FRESH`,** not a new `SIGN_IN_AGAIN` code. Its `freshAge` is set to Pano's 24 hours.
4. **Disconnecting GitHub needs a recent sign-in too:** Better Auth's `/unlink-account` requires one.
5. **`passkey.credential_id` is indexed, not unique:** Better Auth's generated schema stays the source, so `bun run auth:generate` keeps working.
6. **Routes Pano doesn't use are closed** with `disabledPaths`. `/email-otp/send-verification-otp` sends sign-in codes only; confirmation codes come from sign-up.
7. **GitHub connected from the account page may use another address** (`allowDifferentEmails`): the person is signed in, in a recent session.
8. **The passkey plugin loads only on its routes,** the spec's fallback, which the startup measurement triggered.
9. **`account` and `forgot-password` are reserved workspace addresses:** they're new top-level pages, and workspaces live at `/<slug>`.
10. **`/signin` sends someone already signed in onward.** That's how GitHub sign-in ends: GitHub sends the browser back there.
11. **"Sign in again" signs out first,** since `/signin` would otherwise send a signed-in person straight back.
12. **The breach check runs in production only,** like the email limits, so development and tests never call Have I Been Pwned. The wrong-password pause runs everywhere.
13. **Each new production-mode test file has its own client-address range** (10.81, 10.82, 10.83). Rate-limit rows in the shared test database otherwise collide across files.
14. **Browser tests confirm the address in the database:** codes are stored hashed. They skip the live site.
15. **Commit messages mention no issue numbers:** these features have none.

**Still open afterwards:** Phase 9's UI polish and chores; #40, live updates.

## Global Constraints

- **Repo and branch:** `~/repos/deploys/pano`, on branch `feat/phase-8-sign-in-methods` from `main`.
  - The repo is public. Nothing is pushed until the finishing step's choice.
  - Part 2 (GitHub app, migration, push, checks) runs only with you.
- **Earlier phases still apply:** every Phase 0–7 Global Constraint holds.
- **Packages:**
  - `better-auth` `^1.7.18`
  - `auth` `1.7.18` (exact, as before)
  - `@better-auth/passkey` `^1.7.18`
  - dev only: `@simplewebauthn/server` `^13.3.2`
  - Nothing else.
- **The local test database starts at migration 0014.** Task 8 adds 0015. `worker/routes/health.test.ts` compares the database's newest migration with the branch's, so a database already at 0015 fails it until then.
- **Free plans:**
  - Workers allows 10 ms of CPU per request.
  - Neon allows 100 CU-hours a month, so nothing new may wake the database on a timer.
  - Brevo allows 300 emails a day, shared by every code, Shipped email and invitation.
- **Values from the spec:**
  - PBKDF2-SHA256, 100,000 rounds, a 16-byte salt and a 32-byte hash, stored as `pbkdf2-sha256$<rounds>$<salt>$<hash>` in base64url.
  - Passwords are 8 to 128 characters.
  - Adding a way to sign in needs a session under 24 hours old.
  - At most 10 passkeys an account.
  - Unconfirmed sign-ups are deleted at 7 days.
  - 10 wrong passwords for one address in a UTC hour pause password sign-in for it.
  - **Rate limits, per IP per minute:**
    - `/sign-up/email`: 3
    - `/sign-in/email`: 5
    - `/email-otp/verify-email`: 10
    - `/email-otp/request-password-reset`: 3
    - `/email-otp/reset-password`: 10
    - passkey options and check: 20
    - `/sign-in/social`: 10

    `POST /api/me/password` allows 5 an hour per person.
- **New error codes:**
  - **Pano's envelope:** `SESSION_NOT_FRESH` (403), `PASSWORD_EXISTS` (409), `PASSWORD_COMPROMISED` (400).
  - **The guards, in Better Auth's JSON:** `PASSWORD_PAUSED` (429), `PASSKEY_LIMIT` (400), `PASSWORD_COMPROMISED` (400), `DEMO_ONLY` (403), `SESSION_NOT_FRESH` (403).
  - The app translates each, along with Better Auth's own codes. It never shows Better Auth's English.
- **Production stays out of reach:**
  - Tests use `TEST_DATABASE_URL`, and browser tests use `DATABASE_URL`, which stays local.
  - `NEON_DATABASE_URL` is read only by `bun run db:migrate:prod`, in Part 2.
  - Never print `.env`.
  - The GitHub secrets are yours to set with `wrangler secret put`.
- **Messages:** every new string goes into `src/i18n/messages/en.json` and `tr.json` together. `src/i18n/messages.test.ts` checks that their keys match.

## Review Focus

1. **Production's https cookies:** over https Better Auth names its cookies `__Secure-…`, including the passkey challenge and GitHub's state. The tests run over http. Expected: passkey sign-in and GitHub sign-in work on the live site. Checked by hand in R4.
2. **The email-code plugin's own rate limits:** it ships 3 a minute on `/email-otp/verify-email` and the reset routes, and Pano sets 10. Expected: Pano's `customRules` win, so someone mistyping a code gets ten tries a minute. The production tests cover sign-up and the reset request, not this pair.
3. **The passkey autofill against the passkey button:** pressing "Sign in with a passkey" while the email field's autofill request waits must abort that request, not fail. SimpleWebAuthn aborts the older ceremony. Expected: one prompt, then signed in. The browser test presses the button with autofill available.
4. **A GitHub profile whose public email isn't its primary one:** Better Auth checks the verified flag of `profile.email` when it's public. Expected: a verified public address works like a primary one, and an unverified one is refused.
5. **Signing up with an address that has an account but no password,** made with email codes: it answers like any duplicate, and the code signs its owner in. Expected: they can then set a password on the account page. Covered for password accounts in Task 4. The account page's set-password path is Task 6's.

---

### Task 1: Better Auth 1.7.18

**Files:**
- Modify: `package.json`, `bun.lock`

**Interfaces:**
- Produces: Better Auth 1.7.18 everywhere, `@better-auth/core` included, which the passkey plugin (Task 8) needs.

- [ ] **Step 1: Create the branch**

```bash
cd ~/repos/deploys/pano
git switch -c feat/phase-8-sign-in-methods
```

- [ ] **Step 2: Upgrade**

Run: `bun add better-auth@^1.7.18 && bun add -d -E auth@1.7.18`
Expected: `package.json` changes only `"better-auth": "^1.7.18"` and `"auth": "1.7.18"`.

- [ ] **Step 3: Check that nothing stayed on 1.7.10**

Run: `grep -m1 '"version"' node_modules/@better-auth/core/package.json node_modules/@better-auth/drizzle-adapter/package.json && ! grep -q '1\.7\.10' bun.lock && echo "nothing left on 1.7.10"`
Expected: both say `"version": "1.7.18"`, then `nothing left on 1.7.10`. The `auth` CLI pinned `@better-auth/core` 1.7.10 until it moved too.

- [ ] **Step 4: Run the whole suite**

Run: `bun run typecheck && bun run check && bun run test`
Expected: typecheck and Biome clean; `Test Files  83 passed (83)`, `Tests  665 passed (665)`.

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: Better Auth 1.7.18"
```

---

### Task 2: PBKDF2 hashing, and `worker/auth/`

**Files:**
- Move: `worker/auth.ts` → `worker/auth/index.ts`
- Create: `worker/auth/password.ts`, `worker/auth/password.test.ts`

**Interfaces:**
- Produces:
  - `hashPassword(password: string, rounds = PBKDF2_ROUNDS): Promise<string>`
  - `verifyPassword({ hash, password }): Promise<boolean>`, false for a wrong password or a stored value that doesn't parse; it never throws
  - `isBreached(password: string): Promise<boolean>`, false when the service fails, and it logs `[auth] breach check unavailable`
  - `PBKDF2_ROUNDS = 100_000`
  - `worker/auth/index.ts` exports `createAuth` and `Auth` as `worker/auth.ts` did. Imports of `../auth` and `./auth` resolve to it unchanged.

- [ ] **Step 1: Move Better Auth's file into a folder**

```bash
mkdir -p worker/auth
git mv worker/auth.ts worker/auth/index.ts
```

In `worker/auth/index.ts`, replace:

```ts
import type { Database } from "./db/client";
import * as schema from "./db/schema";
import { demoSignIn } from "./demo/sign-in";
import type { Bindings } from "./env";
import { cleanDisplayName } from "./lib/display-name";
import { localeFromHeaders } from "./lib/request-locale";
import type { CodeMailer } from "./mail/mailer";
```

with:

```ts
import type { Database } from "../db/client";
import * as schema from "../db/schema";
import { demoSignIn } from "../demo/sign-in";
import type { Bindings } from "../env";
import { cleanDisplayName } from "../lib/display-name";
import { localeFromHeaders } from "../lib/request-locale";
import type { CodeMailer } from "../mail/mailer";
```

- [ ] **Step 2: Check that everything still finds it**

Run: `bun run typecheck`
Expected: clean. `auth.config.ts`, `worker/env.ts`, `worker/middleware/auth.ts` and the rest import `./worker/auth` or `../auth`, which now resolve to the folder's `index.ts`.

- [ ] **Step 3: Write the failing tests**

Create `worker/auth/password.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hashPassword,
  isBreached,
  PBKDF2_ROUNDS,
  verifyPassword,
} from "./password";

describe("hashPassword", () => {
  it("stores the algorithm, the round count, a salt and the hash", async () => {
    expect(await hashPassword("correct horse")).toMatch(
      /^pbkdf2-sha256\$100000\$[\w-]{22}\$[\w-]{43}$/
    );
  });

  it("salts every hash, so the same password hashes differently", async () => {
    expect(await hashPassword("correct horse")).not.toBe(
      await hashPassword("correct horse")
    );
  });
});

describe("verifyPassword", () => {
  it("accepts the password a hash was made from", async () => {
    const hash = await hashPassword("correct horse");
    expect(await verifyPassword({ hash, password: "correct horse" })).toBe(
      true
    );
  });

  it("refuses any other password", async () => {
    const hash = await hashPassword("correct horse");
    expect(await verifyPassword({ hash, password: "correct horsf" })).toBe(
      false
    );
  });

  it("reads the round count from the hash, so it can be raised later", async () => {
    const hash = await hashPassword("correct horse", 1000);
    expect(hash).toContain("$1000$");
    expect(await verifyPassword({ hash, password: "correct horse" })).toBe(
      true
    );
  });

  it("treats the same text typed in either Unicode form as one password", async () => {
    // "ş" as one character, then as "s" plus a combining cedilla.
    const hash = await hashPassword("şifre-güçlü");
    expect(
      await verifyPassword({
        hash,
        password: "şifre-güçlü",
      })
    ).toBe(true);
  });

  it("refuses a tampered hash", async () => {
    const hash = await hashPassword("correct horse");
    // The hash's first character: all six of its bits are data, unlike the
    // last one's, whose low bits are padding.
    const at = hash.lastIndexOf("$") + 1;
    const swapped = hash[at] === "A" ? "Q" : "A";
    expect(
      await verifyPassword({
        hash: `${hash.slice(0, at)}${swapped}${hash.slice(at + 1)}`,
        password: "correct horse",
      })
    ).toBe(false);
  });

  it.each([
    "",
    "not a hash",
    "scrypt$100000$c2FsdA$aGFzaA",
    "pbkdf2-sha256$abc$c2FsdA$aGFzaA",
    "pbkdf2-sha256$0$c2FsdA$aGFzaA",
    `pbkdf2-sha256$${PBKDF2_ROUNDS + 1}$c2FsdA$aGFzaA`,
    "pbkdf2-sha256$1000$not base64!$aGFzaA",
    "pbkdf2-sha256$1000$c2FsdA$a",
    "pbkdf2-sha256$1000$c2FsdA",
  ])("refuses the malformed stored value %j without throwing", async (hash) => {
    expect(await verifyPassword({ hash, password: "correct horse" })).toBe(
      false
    );
  });
});

describe("isBreached", () => {
  afterEach(() => vi.unstubAllGlobals());

  // SHA-1 of "password" is 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8.
  const PREFIX = "5BAA6";
  const SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

  function stubRange(body: string, status = 200) {
    const fetch = vi.fn(async () => new Response(body, { status }));
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  it("sends only the first five characters of the SHA-1 hash", async () => {
    const fetch = stubRange(`${SUFFIX}:10434004\r\n`);
    await isBreached("password");
    expect(String(fetch.mock.calls[0]?.at(0))).toBe(
      `https://api.pwnedpasswords.com/range/${PREFIX}`
    );
  });

  it("is true for a password in the list", async () => {
    stubRange(`0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${SUFFIX}:10434004`);
    expect(await isBreached("password")).toBe(true);
  });

  it("is false for a password missing from the list, or listed as padding", async () => {
    stubRange(`0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${SUFFIX}:0`);
    expect(await isBreached("password")).toBe(false);
  });

  it("accepts the password, and logs it, when the service fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubRange("unavailable", 503);
    expect(await isBreached("password")).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("[auth] breach check unavailable")
    );
    warn.mockRestore();
  });

  it("accepts the password when the service can't be reached", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );
    expect(await isBreached("password")).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
```

- [ ] **Step 4: Run them to watch them fail**

Run: `bunx vitest run worker/auth/password.test.ts`
Expected: FAIL: `Cannot find module './password'`, `Test Files  1 failed (1)`, `Tests  no tests`.

- [ ] **Step 5: Write the hashing**

Create `worker/auth/password.ts`:

```ts
import { isPasswordCompromised } from "better-auth/plugins/haveibeenpwned";

/**
 * Password hashing that fits the Workers free plan's CPU. Better Auth's
 * default, scrypt, cost about 33 ms a hash on 2026-11-06; PBKDF2 runs in
 * Web Crypto's native code, about 6 ms at 100,000 rounds, which is the most
 * workerd allows.
 *
 * Stored as `pbkdf2-sha256$<rounds>$<salt>$<hash>` (base64url), so a later
 * phase can raise the rounds while old hashes still check.
 */
export const PBKDF2_ROUNDS = 100_000;

const ALGORITHM = "pbkdf2-sha256";
const SALT_BYTES = 16;
const HASH_BYTES = 32;

export async function hashPassword(password: string, rounds = PBKDF2_ROUNDS) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, rounds);
  return [ALGORITHM, rounds, toBase64Url(salt), toBase64Url(hash)].join("$");
}

/** False for a wrong password and for a stored value that doesn't parse. */
export async function verifyPassword({
  hash,
  password,
}: {
  hash: string;
  password: string;
}) {
  const [algorithm, roundsText, saltText, hashText, ...rest] = hash.split("$");
  if (algorithm !== ALGORITHM || rest.length > 0) return false;
  const rounds = Number(roundsText);
  if (!Number.isSafeInteger(rounds) || rounds < 1 || rounds > PBKDF2_ROUNDS) {
    return false;
  }
  const salt = fromBase64Url(saltText);
  const expected = fromBase64Url(hashText);
  if (!salt || expected?.length !== HASH_BYTES) return false;
  return sameBytes(await derive(password, salt, rounds), expected);
}

/**
 * Whether Have I Been Pwned lists the password among those leaked in past
 * breaches. Only the first five characters of its SHA-1 hash leave the
 * Worker. When the service fails, the password is accepted: an outage there
 * must not stop anyone signing up.
 */
export async function isBreached(password: string) {
  try {
    return await isPasswordCompromised(password);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[auth] breach check unavailable: ${reason}`);
    return false;
  }
}

async function derive(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  rounds: number
) {
  const key = await crypto.subtle.importKey(
    "raw",
    // The same text can arrive in either Unicode form, depending on the
    // keyboard; NFKC makes them one password, as Better Auth's scrypt does.
    new TextEncoder().encode(password.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: rounds },
    key,
    HASH_BYTES * 8
  );
  return new Uint8Array(bits);
}

/** Compares every byte, so the time taken doesn't hint at a near match. */
function sameBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}

function toBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function fromBase64Url(text: string | undefined) {
  if (!text || !/^[\w-]+$/.test(text)) return null;
  try {
    const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}
```

- [ ] **Step 6: Run them to watch them pass**

Run: `bunx vitest run worker/auth/password.test.ts`
Expected: PASS, `Tests  21 passed (21)`.

- [ ] **Step 7: Run the whole suite**

Run: `bun run typecheck && bun run check && bun run test`
Expected: typecheck and Biome clean; `Test Files  84 passed (84)`, `Tests  686 passed (686)`.

- [ ] **Step 8: Commit**

```bash
git add worker/auth
git commit -m "feat: PBKDF2 password hashing and a fail-open breach check; worker/auth.ts becomes worker/auth/"
```

---

### Task 3: Code emails in four kinds

**Files:**
- Modify: `worker/mail/templates.ts`, `worker/mail/templates.test.ts`, `worker/mail/mailer.ts`, `worker/mail/mailer.test.ts`, `worker/middleware/mailer.ts`, `worker/middleware/auth.ts`, `worker/auth/index.ts`, `worker/test/app.ts`, `worker/routes/me.test.ts`

**Interfaces:**
- Produces:
  - `CODE_KINDS = ["sign-in", "confirm", "existing-account", "reset"]` and `CodeKind`
  - `codeEmail(kind, code, locale)` in `worker/mail/templates.ts`
  - `Mailer.sendSignInCode` becomes `Mailer.sendCode(message: CodeMessage)`, where `CodeMessage = { to, code, locale, kind }`. `CodeMailer` is `Pick<Mailer, "sendCode">`.
  - `capturingMailer().sent` holds `CodeMessage`s, so tests can find a code by its kind.

- [ ] **Step 1: Write the failing tests**

In `worker/mail/templates.test.ts`, replace:

```ts
import { describe, expect, it } from "vitest";
import { invitationEmail, shippedEmail } from "./templates";

const notice = {
  locale: "en" as const,
```

with:

```ts
import { describe, expect, it } from "vitest";
import { LOCALES } from "@/shared/locale";
import {
  CODE_KINDS,
  codeEmail,
  invitationEmail,
  shippedEmail,
} from "./templates";

describe("codeEmail", () => {
  it.each(
    CODE_KINDS.flatMap((kind) =>
      LOCALES.map((locale) => [kind, locale] as const)
    )
  )("puts the code in the %s email's subject and body (%s)", (kind, locale) => {
    const email = codeEmail(kind, "482913", locale);
    expect(email.subject).toContain("482913");
    expect(email.text).toContain("482913");
    expect(email.html).toContain("482913");
  });

  it("names what each code does", () => {
    expect(codeEmail("sign-in", "1", "en").subject).toBe(
      "1 is your Pano sign-in code"
    );
    expect(codeEmail("confirm", "1", "en").subject).toBe(
      "1 confirms your Pano account"
    );
    expect(codeEmail("existing-account", "1", "en").subject).toBe(
      "1 signs you in to Pano"
    );
    expect(codeEmail("reset", "1", "tr").subject).toBe(
      "Pano şifre sıfırlama kodunuz: 1"
    );
  });

  it("tells an existing account's owner that their account hasn't changed", () => {
    const email = codeEmail("existing-account", "1", "en");
    expect(email.text).toContain("you already have one");
    expect(email.text).toContain("your account hasn't changed");
  });

  it("tells a stranger who got a confirmation code that nothing is set up", () => {
    expect(codeEmail("confirm", "1", "en").text).toContain(
      "nothing is set up until the code is entered"
    );
  });
});

const notice = {
  locale: "en" as const,
```

In `worker/mail/mailer.test.ts`, replace:

```ts
describe("brevoMailer", () => {
  it("sends the code email through Brevo in the person's language", async () => {
    const send = vi.fn<SendFn>(accepted);
    await brevoMailer("key-123", "hello@pano.example", send).sendSignInCode({
      to: "ayse@example.com",
      code: "482913",
      locale: "tr",
    });

    expect(send).toHaveBeenCalledOnce();
```

with:

```ts
describe("brevoMailer", () => {
  it("sends the code email through Brevo in the person's language", async () => {
    const send = vi.fn<SendFn>(accepted);
    await brevoMailer("key-123", "hello@pano.example", send).sendCode({
      to: "ayse@example.com",
      code: "482913",
      locale: "tr",
      kind: "sign-in",
    });

    expect(send).toHaveBeenCalledOnce();
```

In the same file, replace:

```ts

  it("writes English when asked", async () => {
    const send = vi.fn<SendFn>(accepted);
    await brevoMailer("k", "hello@pano.example", send).sendSignInCode({
      to: "a@example.com",
      code: "111222",
      locale: "en",
    });
    const body = JSON.parse(String(send.mock.calls[0]![1].body));
    expect(body.subject).toBe("111222 is your Pano sign-in code");
  });

  it("sends a Shipped email through Brevo", async () => {
```

with:

```ts

  it("writes English when asked", async () => {
    const send = vi.fn<SendFn>(accepted);
    await brevoMailer("k", "hello@pano.example", send).sendCode({
      to: "a@example.com",
      code: "111222",
      locale: "en",
      kind: "sign-in",
    });
    const body = JSON.parse(String(send.mock.calls[0]![1].body));
    expect(body.subject).toBe("111222 is your Pano sign-in code");
  });

  it("sends each kind of code with its own wording", async () => {
    const send = vi.fn<SendFn>(accepted);
    await brevoMailer("k", "hello@pano.example", send).sendCode({
      to: "a@example.com",
      code: "333444",
      locale: "en",
      kind: "reset",
    });
    const body = JSON.parse(String(send.mock.calls[0]![1].body));
    expect(body.subject).toBe("333444 resets your Pano password");
  });

  it("sends a Shipped email through Brevo", async () => {
```

In the same file, replace:

```ts
      new Response('{"message":"unauthorized"}', { status: 401 });
    const mailer = brevoMailer("bad", "hello@pano.example", send);
    await expect(
      mailer.sendSignInCode({
        to: "a@example.com",
        code: "123456",
        locale: "en",
      })
    ).rejects.toThrow(/401/);
  });
```

with:

```ts
      new Response('{"message":"unauthorized"}', { status: 401 });
    const mailer = brevoMailer("bad", "hello@pano.example", send);
    await expect(
      mailer.sendCode({
        to: "a@example.com",
        code: "123456",
        locale: "en",
        kind: "sign-in",
      })
    ).rejects.toThrow(/401/);
  });
```

In the same file, replace:

```ts
      });
    const mailer = brevoMailer("k", "hello@pano.example", send, 20);
    await expect(
      mailer.sendSignInCode({
        to: "a@example.com",
        code: "123456",
        locale: "en",
      })
    ).rejects.toThrow(/timeout/i);
  });
```

with:

```ts
      });
    const mailer = brevoMailer("k", "hello@pano.example", send, 20);
    await expect(
      mailer.sendCode({
        to: "a@example.com",
        code: "123456",
        locale: "en",
        kind: "sign-in",
      })
    ).rejects.toThrow(/timeout/i);
  });
```

- [ ] **Step 2: Run them to watch them fail**

Run: `bunx vitest run worker/mail/templates.test.ts worker/mail/mailer.test.ts`
Expected: FAIL, `Test Files  2 failed (2)`, `Tests  5 failed | 5 passed (10)`.
- `templates.test.ts` doesn't load: `Cannot read properties of undefined (reading 'flatMap')`, since `CODE_KINDS` doesn't exist yet.
- Five mailer tests say `brevoMailer(...).sendCode is not a function`.

- [ ] **Step 3: Write the emails and the mailer**

In `worker/mail/templates.ts`, replace:

```ts
import type { Locale } from "@/shared/locale";

const copy = {
  en: {
    subject: (code: string) => `${code} is your Pano sign-in code`,
    intro: "Use this code to sign in to Pano:",
    expiry:
      "It expires in 5 minutes. If you didn't ask for it, you can ignore this email.",
  },
  tr: {
    subject: (code: string) => `Pano giriş kodunuz: ${code}`,
    intro: "Pano'ya giriş yapmak için bu kodu kullanın:",
    expiry:
      "Kod 5 dakika içinde geçersiz olur. Bu kodu siz istemediyseniz bu e-postayı yok sayabilirsiniz.",
  },
} satisfies Record<Locale, unknown>;

/** The sign-in code email. The code is six digits, so it needs no escaping. */
export function signInCodeEmail(code: string, locale: Locale) {
  const c = copy[locale];
  return {
    subject: c.subject(code),
    text: `${c.intro}\n\n${code}\n\n${c.expiry}`,
```

with:

```ts
import type { Locale } from "@/shared/locale";

/**
 * What a code is for:
 * - `sign-in`: signs in, or creates an account (Sign in with a code)
 * - `confirm`: confirms a new password account's address
 * - `existing-account`: someone signed up with an address that already has
 *   an account; the code signs its owner in
 * - `reset`: sets a new password
 */
export const CODE_KINDS = [
  "sign-in",
  "confirm",
  "existing-account",
  "reset",
] as const;
export type CodeKind = (typeof CODE_KINDS)[number];

type CodeCopy = {
  subject: (code: string) => string;
  intro: string;
  expiry: string;
};

const copy = {
  en: {
    "sign-in": {
      subject: (code) => `${code} is your Pano sign-in code`,
      intro: "Use this code to sign in to Pano:",
      expiry:
        "It expires in 5 minutes. If you didn't ask for it, you can ignore this email.",
    },
    confirm: {
      subject: (code) => `${code} confirms your Pano account`,
      intro:
        "Use this code to confirm your email address and finish creating your Pano account:",
      expiry:
        "It expires in 5 minutes. If you didn't create a Pano account, you can ignore this email: nothing is set up until the code is entered.",
    },
    "existing-account": {
      subject: (code) => `${code} signs you in to Pano`,
      intro:
        "Someone tried to create a Pano account with this address, but you already have one. If it was you, use this code to sign in:",
      expiry:
        "It expires in 5 minutes. If it wasn't you, ignore this email: your account hasn't changed.",
    },
    reset: {
      subject: (code) => `${code} resets your Pano password`,
      intro: "Use this code to choose a new Pano password:",
      expiry:
        "It expires in 5 minutes. If you didn't ask for it, ignore this email: your password hasn't changed.",
    },
  },
  tr: {
    "sign-in": {
      subject: (code) => `Pano giriş kodunuz: ${code}`,
      intro: "Pano'ya giriş yapmak için bu kodu kullanın:",
      expiry:
        "Kod 5 dakika içinde geçersiz olur. Bu kodu siz istemediyseniz bu e-postayı yok sayabilirsiniz.",
    },
    confirm: {
      subject: (code) => `Pano hesabınızı onaylama kodu: ${code}`,
      intro:
        "E-posta adresinizi onaylayıp Pano hesabınızı oluşturmayı bitirmek için bu kodu kullanın:",
      expiry:
        "Kod 5 dakika içinde geçersiz olur. Pano hesabı oluşturmadıysanız bu e-postayı yok sayabilirsiniz: kod girilmeden hiçbir şey kurulmaz.",
    },
    "existing-account": {
      subject: (code) => `Pano'ya giriş kodunuz: ${code}`,
      intro:
        "Bu adresle bir Pano hesabı oluşturulmak istendi, ancak zaten bir hesabınız var. Siz istediyseniz giriş yapmak için bu kodu kullanın:",
      expiry:
        "Kod 5 dakika içinde geçersiz olur. Siz istemediyseniz bu e-postayı yok sayın: hesabınızda bir değişiklik olmadı.",
    },
    reset: {
      subject: (code) => `Pano şifre sıfırlama kodunuz: ${code}`,
      intro: "Yeni bir Pano şifresi belirlemek için bu kodu kullanın:",
      expiry:
        "Kod 5 dakika içinde geçersiz olur. Bunu siz istemediyseniz bu e-postayı yok sayın: şifreniz değişmedi.",
    },
  },
} satisfies Record<Locale, Record<CodeKind, CodeCopy>>;

/** A code email. The code is six digits, so it needs no escaping. */
export function codeEmail(kind: CodeKind, code: string, locale: Locale) {
  const c = copy[locale][kind];
  return {
    subject: c.subject(code),
    text: `${c.intro}\n\n${code}\n\n${c.expiry}`,
```

In `worker/mail/mailer.ts`, replace:

```ts
import type { Locale } from "@/shared/locale";
import type { Bindings } from "../env";
import {
  type InvitationNotice,
  invitationEmail,
  type ShippedNotice,
  shippedEmail,
  signInCodeEmail,
} from "./templates";

export type { InvitationNotice, ShippedNotice } from "./templates";

export type SignInCode = { to: string; code: string; locale: Locale };

export interface Mailer {
  sendSignInCode(message: SignInCode): Promise<void>;
  sendShipped(message: ShippedNotice): Promise<void>;
  sendInvitation(message: InvitationNotice): Promise<void>;
}

/** What sign-in needs from a mailer. */
export type CodeMailer = Pick<Mailer, "sendSignInCode">;

/** What the API's routes send: sign-in codes and invitations. */
export type AppMailer = Pick<Mailer, "sendSignInCode" | "sendInvitation">;

/** Local dev: emails go to the terminal instead of an inbox. */
export const consoleMailer: Mailer = {
  async sendSignInCode({ to, code }) {
    console.log(`[mail] sign-in code for ${to}: ${code}`);
  },
  async sendShipped({ to, title, url }) {
    console.log(`[mail] shipped notice for ${to}: ${title} ${url}`);
```

with:

```ts
import type { Locale } from "@/shared/locale";
import type { Bindings } from "../env";
import {
  type CodeKind,
  codeEmail,
  type InvitationNotice,
  invitationEmail,
  type ShippedNotice,
  shippedEmail,
} from "./templates";

export type { CodeKind, InvitationNotice, ShippedNotice } from "./templates";

export type CodeMessage = {
  to: string;
  code: string;
  locale: Locale;
  kind: CodeKind;
};

export interface Mailer {
  sendCode(message: CodeMessage): Promise<void>;
  sendShipped(message: ShippedNotice): Promise<void>;
  sendInvitation(message: InvitationNotice): Promise<void>;
}

/** What sign-in needs from a mailer. */
export type CodeMailer = Pick<Mailer, "sendCode">;

/** What the API's routes send: codes and invitations. */
export type AppMailer = Pick<Mailer, "sendCode" | "sendInvitation">;

/** Local dev: emails go to the terminal instead of an inbox. */
export const consoleMailer: Mailer = {
  async sendCode({ to, code, kind }) {
    console.log(`[mail] ${kind} code for ${to}: ${code}`);
  },
  async sendShipped({ to, title, url }) {
    console.log(`[mail] shipped notice for ${to}: ${title} ${url}`);
```

In the same file, replace:

```ts
    }
  }
  return {
    sendSignInCode: ({ to, code, locale }) =>
      deliver(to, signInCodeEmail(code, locale)),
    sendShipped: (message) => deliver(message.to, shippedEmail(message)),
    sendInvitation: (message) => deliver(message.to, invitationEmail(message)),
  };
```

with:

```ts
    }
  }
  return {
    sendCode: ({ to, code, locale, kind }) =>
      deliver(to, codeEmail(kind, code, locale)),
    sendShipped: (message) => deliver(message.to, shippedEmail(message)),
    sendInvitation: (message) => deliver(message.to, invitationEmail(message)),
  };
```

- [ ] **Step 4: Rename the callers**

In `worker/middleware/mailer.ts`, replace:

```ts
    c.set(
      "mailer",
      mailer ?? {
        sendSignInCode: (message) => mailerFor(c.env).sendSignInCode(message),
        sendInvitation: (message) => mailerFor(c.env).sendInvitation(message),
      }
    );
```

with:

```ts
    c.set(
      "mailer",
      mailer ?? {
        sendCode: (message) => mailerFor(c.env).sendCode(message),
        sendInvitation: (message) => mailerFor(c.env).sendInvitation(message),
      }
    );
```

In `worker/middleware/auth.ts`, replace:

```ts
    return true;
  }
  const codes: CodeMailer = {
    async sendSignInCode(message) {
      try {
        await c.var.mailer.sendSignInCode(message);
      } catch (err) {
        // Better Auth logs the error but still answers 200, so remember it
        // for the /auth route to report.
```

with:

```ts
    return true;
  }
  const codes: CodeMailer = {
    async sendCode(message) {
      try {
        await c.var.mailer.sendCode(message);
      } catch (err) {
        // Better Auth logs the error but still answers 200, so remember it
        // for the /auth route to report.
```

In `worker/auth/index.ts`, replace:

```ts
        async sendVerificationOTP({ email, otp, type }, ctx) {
          // Demo addresses can't receive mail: nobody signs in to them.
          if (type !== "sign-in" || isDemoEmail(email)) return;
          await mailer.sendSignInCode({
            to: email,
            code: otp,
            locale: localeFromHeaders(new Headers(ctx?.headers)),
          });
        },
```

with:

```ts
        async sendVerificationOTP({ email, otp, type }, ctx) {
          // Demo addresses can't receive mail: nobody signs in to them.
          if (type !== "sign-in" || isDemoEmail(email)) return;
          await mailer.sendCode({
            to: email,
            code: otp,
            kind: "sign-in",
            locale: localeFromHeaders(new Headers(ctx?.headers)),
          });
        },
```

In `worker/test/app.ts`, replace:

```ts
import { createApp } from "../app";
import type { Bindings } from "../env";
import type {
  InvitationNotice,
  Mailer,
  ShippedNotice,
  SignInCode,
} from "../mail/mailer";
import { testEnv } from "./env";

```

with:

```ts
import { createApp } from "../app";
import type { Bindings } from "../env";
import type {
  CodeMessage,
  InvitationNotice,
  Mailer,
  ShippedNotice,
} from "../mail/mailer";
import { testEnv } from "./env";

```

In the same file, replace:

```ts

/** A mailer that keeps what it would have sent, so tests can read it. */
export function capturingMailer() {
  const sent: SignInCode[] = [];
  const shipped: ShippedNotice[] = [];
  const invited: InvitationNotice[] = [];
  const mailer: Mailer = {
    async sendSignInCode(message) {
      sent.push(message);
    },
    async sendShipped(message) {
```

with:

```ts

/** A mailer that keeps what it would have sent, so tests can read it. */
export function capturingMailer() {
  const sent: CodeMessage[] = [];
  const shipped: ShippedNotice[] = [];
  const invited: InvitationNotice[] = [];
  const mailer: Mailer = {
    async sendCode(message) {
      sent.push(message);
    },
    async sendShipped(message) {
```

In `worker/routes/me.test.ts`, replace:

```ts
  it("tells the person when the code email couldn't be sent", async () => {
    const app = createApp({
      mailer: {
        async sendSignInCode() {
          throw new Error("Brevo refused the email: 401 unauthorized");
        },
        async sendInvitation() {},
```

with:

```ts
  it("tells the person when the code email couldn't be sent", async () => {
    const app = createApp({
      mailer: {
        async sendCode() {
          throw new Error("Brevo refused the email: 401 unauthorized");
        },
        async sendInvitation() {},
```

- [ ] **Step 5: Run them to watch them pass**

Run: `bunx vitest run worker/mail/templates.test.ts worker/mail/mailer.test.ts`
Expected: PASS, `Tests  29 passed (29)`.

- [ ] **Step 6: Run the whole suite**

Run: `bun run typecheck && bun run check && bun run test`
Expected: typecheck and Biome clean; `Test Files  84 passed (84)`, `Tests  698 passed (698)`.

- [ ] **Step 7: Commit**

```bash
git add worker
git commit -m "feat: code emails in four kinds: sign-in, confirm, existing account and reset"
```

---

### Task 4: Password sign-up, confirmed by a code that comes with the password

**Files:**
- Create: `shared/password.ts`, `worker/auth/guards.ts`, `worker/auth/sign-up.test.ts`
- Modify: `worker/auth/index.ts`, `worker/middleware/auth.ts`, `worker/test/app.ts`

**Interfaces:**
- Consumes:
  - `hashPassword`, `verifyPassword` and `isBreached` (Task 2)
  - `CodeKind` and `sendCode` (Task 3)
- Produces:
  - `PASSWORD_MIN = 8`, `PASSWORD_MAX = 128` and `passwordSchema` in `shared/password.ts`
  - `authGuards({ db, claimCode?, checkBreach? })` in `worker/auth/guards.ts`, returning `{ before, after }`, Better Auth's `hooks`. Tasks 5 to 8 add to both hooks.
  - `AuthDeps.checkBreach?`, which `withAuth` passes in production only
  - **Test helpers, on `testApp()`:**
    - `signUp(email, password, headers?)`
    - `confirm(email, otp, password?, headers?)`
    - `signInWithPassword(email, password, headers?)`
    - `signUpConfirmed(email?, password?, headers?)`, which returns `{ email, password, cookie }`
    - `signIn(email?, headers?)`
    - `lastCode(email, kind?)`

- [ ] **Step 1: Write the failing tests, and their helpers**

In `worker/test/app.ts`, replace:

```ts
import { createApp } from "../app";
import type { Bindings } from "../env";
import type {
  CodeMessage,
  InvitationNotice,
  Mailer,
```

with:

```ts
import { createApp } from "../app";
import type { Bindings } from "../env";
import type {
  CodeKind,
  CodeMessage,
  InvitationNotice,
  Mailer,
```

In the same file, replace:

```ts
      headers
    );

  function lastCode(email: string) {
    const message = mail.sent.findLast((sent) => sent.to === email);
    if (!message) throw new Error(`no code was sent to ${email}`);
    return message.code;
  }

  async function signIn(email = uniqueEmail()) {
    await sendCode(email);
    const res = await post("/api/auth/sign-in/email-otp", {
      email,
      otp: lastCode(email),
    });
    if (!res.ok) throw new Error(`sign-in failed with ${res.status}`);
    return { email, cookie: cookieFrom(res) };
  }
```

with:

```ts
      headers
    );

  function lastCode(email: string, kind?: CodeKind) {
    const message = mail.sent.findLast(
      (sent) => sent.to === email && (!kind || sent.kind === kind)
    );
    if (!message) throw new Error(`no ${kind ?? ""} code was sent to ${email}`);
    return message.code;
  }

  /** Password sign-up: the account waits for its confirmation code. */
  const signUp = (
    email: string,
    password: string,
    headers: Record<string, string> = {}
  ) => post("/api/auth/sign-up/email", { email, password, name: "" }, headers);

  /** Enters a confirmation code, with the password the sign-up page holds. */
  const confirm = (
    email: string,
    otp: string,
    password?: string,
    headers: Record<string, string> = {}
  ) =>
    post("/api/auth/email-otp/verify-email", { email, otp, password }, headers);

  const signInWithPassword = (
    email: string,
    password: string,
    headers: Record<string, string> = {}
  ) => post("/api/auth/sign-in/email", { email, password }, headers);

  /**
   * A confirmed password account, signed in: its email and cookie.
   * `headers`: a production test gives its own client address.
   */
  async function signUpConfirmed(
    email = uniqueEmail(),
    password = "correct horse battery",
    headers: Record<string, string> = {}
  ) {
    const res = await signUp(email, password, headers);
    if (!res.ok) throw new Error(`sign-up failed with ${res.status}`);
    const confirmed = await confirm(
      email,
      lastCode(email, "confirm"),
      password,
      headers
    );
    if (!confirmed.ok)
      throw new Error(`confirming failed with ${confirmed.status}`);
    return { email, password, cookie: cookieFrom(confirmed) };
  }

  /** `headers`: a production test gives its own client address. */
  async function signIn(
    email = uniqueEmail(),
    headers: Record<string, string> = {}
  ) {
    await sendCode(email, headers);
    const res = await post(
      "/api/auth/sign-in/email-otp",
      { email, otp: lastCode(email) },
      headers
    );
    if (!res.ok) throw new Error(`sign-in failed with ${res.status}`);
    return { email, cookie: cookieFrom(res) };
  }
```

In the same file, replace:

```ts
    lastCode,
    signIn,
    signInDemo,
    mail,
    settle: base.settle,
  };
```

with:

```ts
    lastCode,
    signIn,
    signInDemo,
    signUp,
    confirm,
    signInWithPassword,
    signUpConfirmed,
    mail,
    settle: base.settle,
  };
```

Create `worker/auth/sign-up.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_EMAIL_DOMAIN } from "@/shared/demo";
import { cookieFrom, testApp, uniqueEmail } from "../test/app";
import { startMidWindow } from "../test/clock";

const PASSWORD = "correct horse battery";
/** A client address of its own: no other test file uses 10.81.x.x. */
const ip = () => ({
  "cf-connecting-ip": `10.81.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`,
});

async function whoIsSignedIn(t: ReturnType<typeof testApp>, cookie: string) {
  const res = await t.client.api.me.$get(undefined, { headers: { cookie } });
  const body = await res.json();
  return body.success ? body.data.user : null;
}

describe("password sign-up", () => {
  it("emails a confirmation code, and the code with the password signs in", async () => {
    const t = testApp();
    const email = uniqueEmail("ayse");

    const res = await t.signUp(email, PASSWORD);
    expect(res.status).toBe(200);
    expect(t.mail.sent).toEqual([
      expect.objectContaining({ to: email, kind: "confirm" }),
    ]);

    const confirmed = await t.confirm(email, t.lastCode(email), PASSWORD);
    expect(confirmed.status).toBe(200);
    expect(await whoIsSignedIn(t, cookieFrom(confirmed))).toMatchObject({
      email,
    });

    const again = await t.signInWithPassword(email, PASSWORD);
    expect(again.status).toBe(200);
    await t.settle();
  });

  it("refuses the password until the address is confirmed", async () => {
    const t = testApp();
    const email = uniqueEmail();
    await t.signUp(email, PASSWORD);

    const res = await t.signInWithPassword(email, PASSWORD);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    await t.settle();
  });

  it("refuses a password shorter than 8 characters, and sends nothing", async () => {
    const t = testApp();
    const res = await t.signUp(uniqueEmail(), "short12");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "PASSWORD_TOO_SHORT" });
    expect(t.mail.sent).toEqual([]);
    await t.settle();
  });

  it("refuses demo addresses", async () => {
    const t = testApp();
    const res = await t.signUp(`someone@${DEMO_EMAIL_DOMAIN}`, PASSWORD);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "DEMO_ONLY" });
    await t.settle();
  });
});

describe("confirming a sign-up", () => {
  it("confirms but keeps no password when the code comes with another password", async () => {
    const t = testApp();
    const email = uniqueEmail();
    await t.signUp(email, PASSWORD);

    const confirmed = await t.confirm(email, t.lastCode(email), "not the one");
    expect(confirmed.status).toBe(200);
    expect(await whoIsSignedIn(t, cookieFrom(confirmed))).toMatchObject({
      email,
    });

    // The sign-up's password never took: someone else may have typed it.
    const res = await t.signInWithPassword(email, PASSWORD);
    expect(res.status).toBe(401);
    await t.settle();
  });

  it("keeps no password when the code comes alone", async () => {
    const t = testApp();
    const email = uniqueEmail();
    await t.signUp(email, PASSWORD);

    expect((await t.confirm(email, t.lastCode(email))).status).toBe(200);
    expect((await t.signInWithPassword(email, PASSWORD)).status).toBe(401);
    await t.settle();
  });

  it("answers a wrong code and an unknown address the same way", async () => {
    const t = testApp();
    const email = uniqueEmail();
    await t.signUp(email, PASSWORD);

    const wrong = await t.confirm(email, "000000", PASSWORD);
    const unknown = await t.confirm(uniqueEmail(), "000000", PASSWORD);
    expect(wrong.status).toBe(400);
    expect(unknown.status).toBe(400);
    expect(await wrong.json()).toEqual(await unknown.json());
    await t.settle();
  });
});

describe("signing up again", () => {
  it("replaces a sign-up that was never confirmed", async () => {
    const t = testApp();
    const email = uniqueEmail();
    await t.signUp(email, "first password!");
    await t.signUp(email, PASSWORD);

    await t.confirm(email, t.lastCode(email), PASSWORD);
    expect((await t.signInWithPassword(email, PASSWORD)).status).toBe(200);
    expect((await t.signInWithPassword(email, "first password!")).status).toBe(
      401
    );
    await t.settle();
  });

  it("answers an existing account's address like a new one, and emails its owner a sign-in code", async () => {
    const t = testApp();
    const { email, cookie } = await t.signIn();
    const owner = await whoIsSignedIn(t, cookie);

    const res = await t.signUp(email, PASSWORD);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ token: null, user: { email } });
    expect(t.mail.sent.at(-1)).toMatchObject({
      to: email,
      kind: "existing-account",
    });

    // The code signs the owner in; the password typed isn't saved.
    const confirmed = await t.confirm(email, t.lastCode(email), PASSWORD);
    expect(confirmed.status).toBe(200);
    expect(await whoIsSignedIn(t, cookieFrom(confirmed))).toMatchObject({
      id: owner?.id,
    });
    expect((await t.signInWithPassword(email, PASSWORD)).status).toBe(401);
    await t.settle();
  });

  it("leaves an existing account's password alone", async () => {
    const t = testApp();
    const { email, password } = await t.signUpConfirmed();

    await t.signUp(email, "an attacker's guess");
    await t.confirm(email, t.lastCode(email, "existing-account"), "whatever");
    expect((await t.signInWithPassword(email, password)).status).toBe(200);
    await t.settle();
  });
});

describe("codes and routes", () => {
  it("sends codes of other kinds only from their own flows", async () => {
    const t = testApp();
    const res = await t.post("/api/auth/email-otp/send-verification-otp", {
      email: uniqueEmail(),
      type: "email-verification",
    });
    expect(res.status).toBe(400);
    expect(t.mail.sent).toEqual([]);
    await t.settle();
  });

  it.each([
    "/api/auth/email-otp/check-verification-otp",
    "/api/auth/forget-password/email-otp",
    "/api/auth/email-otp/request-email-change",
    "/api/auth/send-verification-email",
  ])("closes %s, which Pano doesn't use", async (path) => {
    const t = testApp();
    const res = await t.post(path, { email: uniqueEmail() });
    expect(res.status).toBe(404);
    await t.settle();
  });
});

describe("sign-up limits in production", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("counts a sign-up's code against the address's three in ten minutes", async () => {
    startMidWindow(10 * 60 * 1000);
    const t = testApp({ ENVIRONMENT: "production" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 200 }))
    );
    const email = uniqueEmail();
    for (let i = 0; i < 3; i++) {
      expect((await t.signUp(email, PASSWORD, ip())).status).toBe(200);
    }
    const refused = await t.signUp(email, PASSWORD, ip());
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ code: "CODE_LIMIT" });
    expect(t.mail.sent).toHaveLength(3);
    await t.settle();
  });

  it("refuses a password from a data breach before sending anything", async () => {
    const t = testApp({ ENVIRONMENT: "production" });
    // SHA-1 of "password" starts 5BAA6; the rest is listed.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("1E4C9B93F3F0682250B6CF8331B7EE68FD8:42"))
    );
    const res = await t.signUp(uniqueEmail(), "password", ip());
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "PASSWORD_COMPROMISED" });
    expect(t.mail.sent).toEqual([]);
    await t.settle();
  });

  it("allows three sign-ups a minute from one address", async () => {
    const t = testApp({ ENVIRONMENT: "production" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 200 }))
    );
    const from = ip();
    for (let i = 0; i < 3; i++) {
      expect((await t.signUp(uniqueEmail(), PASSWORD, from)).status).toBe(200);
    }
    expect((await t.signUp(uniqueEmail(), PASSWORD, from)).status).toBe(429);
    await t.settle();
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `bunx vitest run worker/auth/sign-up.test.ts`
Expected: FAIL, `Tests  17 failed | 1 passed (18)`. The one that passes, "answers a wrong code and an unknown address the same way", holds already: Better Auth answers both alike. It stays to catch the guard ever changing that.

- [ ] **Step 3: Write the shared rules and the guards**

Create `shared/password.ts`:

```ts
import { z } from "zod";

/** A password's length, the same on the client and the server. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const passwordSchema = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);
```

Create `worker/auth/guards.ts`:

```ts
import { APIError, createAuthMiddleware } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { isDemoEmail } from "@/shared/demo";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/shared/password";
import type { Database } from "../db/client";
import { account, user } from "../db/schema";
import { hashPassword, verifyPassword } from "./password";

export type GuardDeps = {
  db: Database;
  /**
   * Takes a code email's place in Pano's limits before Better Auth makes
   * the code; false refuses it.
   */
  claimCode?: (email: string) => Promise<boolean>;
  /** Whether a new password is on a leaked-password list. */
  checkBreach?: (password: string) => Promise<boolean>;
};

/**
 * Pano's rules around Better Auth's own routes, as one before hook and one
 * after hook. Better Auth is built per request, so the state the two share
 * belongs to one request.
 *
 * - Every code email takes its place in the limits before it's made.
 * - Sign-up refuses demo addresses and leaked passwords, and replaces an
 *   earlier sign-up of the same address that was never confirmed.
 * - Confirming keeps a sign-up's password only when the password comes with
 *   the code (see beforeConfirm).
 */
export function authGuards({ db, claimCode, checkBreach }: GuardDeps) {
  /** The unconfirmed sign-up this request confirms, if it is a confirmation. */
  let confirming: { userId: string; hash: string; keep: boolean } | null = null;

  async function claim(email: string) {
    if (claimCode && !(await claimCode(email))) {
      throw new APIError("TOO_MANY_REQUESTS");
    }
  }

  async function refuseBreached(password: string) {
    if (checkBreach && (await checkBreach(password))) {
      throw new APIError("BAD_REQUEST", {
        code: "PASSWORD_COMPROMISED",
        message: "This password appears in a data breach",
      });
    }
  }

  /** Sign in with a code. Codes of other kinds come from their own flows. */
  async function beforeSignInCode(body: unknown) {
    const { email, type } = (body ?? {}) as { email?: unknown; type?: unknown };
    if (type !== "sign-in") {
      throw new APIError("BAD_REQUEST", { message: "Only sign-in codes" });
    }
    // Better Auth refuses a bad address; demo addresses get no email.
    if (typeof email !== "string" || isDemoEmail(email)) return;
    if (!z.email().safeParse(email).success) return;
    await claim(email);
  }

  async function beforeSignUp(body: unknown) {
    const parsed = signUpBody.safeParse(body);
    // Better Auth answers anything malformed in its own words.
    if (!parsed.success) return;
    const email = parsed.data.email.toLowerCase();
    if (isDemoEmail(email)) {
      throw new APIError("FORBIDDEN", {
        code: "DEMO_ONLY",
        message: "Demo addresses can't sign up",
      });
    }
    await refuseBreached(parsed.data.password);
    await claim(email);
    await deleteUnconfirmed(db, email);
  }

  /**
   * The code alone proves the address; the password typed at sign-up has to
   * come with it. Someone who signs up with another person's address knows
   * the password but never sees the code, and the address's owner sees the
   * code but not their password. Every confirmation runs one password check,
   * so how long it takes doesn't say whether a sign-up is waiting.
   */
  async function beforeConfirm(body: unknown) {
    const { email, password } = (body ?? {}) as {
      email?: unknown;
      password?: unknown;
    };
    if (typeof email !== "string") return;
    const pending = await findUnconfirmed(db, email.toLowerCase());
    const matches = await verifyPassword({
      hash: pending?.hash ?? (await dummyHash()),
      password: typeof password === "string" ? password : "",
    });
    confirming = pending ? { ...pending, keep: matches } : null;
  }

  /**
   * After a confirmation, an account keeps its password only if it's the one
   * checked before and it matched. A sign-up that replaced it in between, or
   * a code that came without the password, leaves the account confirmed and
   * signed in but with no password.
   */
  async function afterConfirm(email: string) {
    if (!confirming) return;
    const now = await findCredential(db, email);
    const kept =
      confirming.keep &&
      now?.userId === confirming.userId &&
      now.hash === confirming.hash;
    if (now && !kept) await dropPassword(db, now.userId);
  }

  return {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/email-otp/send-verification-otp") {
        await beforeSignInCode(ctx.body);
      } else if (ctx.path === "/sign-up/email") {
        await beforeSignUp(ctx.body);
      } else if (ctx.path === "/email-otp/verify-email") {
        await beforeConfirm(ctx.body);
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (
        ctx.path === "/email-otp/verify-email" &&
        !(ctx.context.returned instanceof Error)
      ) {
        const { email } = ctx.body as { email: string };
        await afterConfirm(email.toLowerCase());
      }
    }),
  };
}

const signUpBody = z.object({
  email: z.email(),
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
});

let dummy: Promise<string> | undefined;
/** A hash no password matches, to check against when nothing is waiting. */
function dummyHash() {
  dummy ??= hashPassword(crypto.randomUUID());
  return dummy;
}

/** A password account whose address was never confirmed. */
async function findUnconfirmed(db: Database, email: string) {
  const [row] = await db
    .select({ userId: user.id, hash: account.password })
    .from(user)
    .innerJoin(
      account,
      and(eq(account.userId, user.id), eq(account.providerId, "credential"))
    )
    .where(and(eq(user.email, email), eq(user.emailVerified, false)))
    .limit(1);
  return row?.hash ? { userId: row.userId, hash: row.hash } : null;
}

async function findCredential(db: Database, email: string) {
  const [row] = await db
    .select({ userId: user.id, hash: account.password })
    .from(user)
    .innerJoin(
      account,
      and(eq(account.userId, user.id), eq(account.providerId, "credential"))
    )
    .where(eq(user.email, email))
    .limit(1);
  return row ? { userId: row.userId, hash: row.hash } : null;
}

/**
 * An unconfirmed sign-up can't sign in, so it owns nothing; deleting it lets
 * the new sign-up start fresh. Only accounts with a password qualify, so an
 * older account somehow left unconfirmed is never touched.
 */
async function deleteUnconfirmed(db: Database, email: string) {
  const pending = await findUnconfirmed(db, email);
  if (pending) await db.delete(user).where(eq(user.id, pending.userId));
}

async function dropPassword(db: Database, userId: string) {
  await db
    .delete(account)
    .where(
      and(eq(account.userId, userId), eq(account.providerId, "credential"))
    );
}
```

- [ ] **Step 4: Turn on password sign-up**

In `worker/auth/index.ts`, replace:

```ts
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
// The minimal build leaves out Kysely and its SQLite dialects: Pano reaches
// Postgres through Drizzle, and the Worker stays about 0.5 MB smaller.
import { betterAuth } from "better-auth/minimal";
import { emailOTP, organization } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { isDemoEmail } from "@/shared/demo";
import { INVITATION_DAYS, PENDING_INVITATIONS, TEAM_SIZE } from "@/shared/team";
import type { Database } from "../db/client";
import * as schema from "../db/schema";
```

with:

```ts
import { drizzleAdapter } from "better-auth/adapters/drizzle";
// The minimal build leaves out Kysely and its SQLite dialects: Pano reaches
// Postgres through Drizzle, and the Worker stays about 0.5 MB smaller.
import { betterAuth } from "better-auth/minimal";
import { emailOTP, organization } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { isDemoEmail } from "@/shared/demo";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/shared/password";
import { INVITATION_DAYS, PENDING_INVITATIONS, TEAM_SIZE } from "@/shared/team";
import type { Database } from "../db/client";
import * as schema from "../db/schema";
```

In the same file, replace:

```ts
import type { Bindings } from "../env";
import { cleanDisplayName } from "../lib/display-name";
import { localeFromHeaders } from "../lib/request-locale";
import type { CodeMailer } from "../mail/mailer";

export type AuthDeps = {
  db: Database;
  env: Pick<Bindings, "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL" | "ENVIRONMENT">;
  mailer: CodeMailer;
  /**
   * Takes a sign-in code's place in Pano's limits before Better Auth makes
   * the code; false refuses it.
   */
  claimCode?: (email: string) => Promise<boolean>;
};

/**
```

with:

```ts
import type { Bindings } from "../env";
import { cleanDisplayName } from "../lib/display-name";
import { localeFromHeaders } from "../lib/request-locale";
import type { CodeKind, CodeMailer } from "../mail/mailer";
import { authGuards } from "./guards";
import { hashPassword, verifyPassword } from "./password";

export type AuthDeps = {
  db: Database;
  env: Pick<Bindings, "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL" | "ENVIRONMENT">;
  mailer: CodeMailer;
  /**
   * Takes a code email's place in Pano's limits before Better Auth makes
   * the code; false refuses it.
   */
  claimCode?: (email: string) => Promise<boolean>;
  /** Whether a new password is on a leaked-password list (production). */
  checkBreach?: (password: string) => Promise<boolean>;
};

/**
```

In the same file, replace:

```ts
 * request's own database client (a Worker can't share sockets across
 * requests); building it costs about 0.3 ms.
 *
 * Sign-in is email codes only. Password hashing doesn't fit the Workers free
 * plan's 10 ms of CPU per request; a code is cheap to create and check.
 */
export function createAuth({ db, env, mailer, claimCode }: AuthDeps) {
  return betterAuth({
    appName: "Pano",
    baseURL: env.BETTER_AUTH_URL,
```

with:

```ts
 * request's own database client (a Worker can't share sockets across
 * requests); building it costs about 0.3 ms.
 *
 * People sign in with an email code or a password. A password account
 * confirms its address with a code before the password works. Passwords are
 * hashed with PBKDF2 (./password.ts): Better Auth's scrypt costs more CPU
 * than the Workers free plan gives a request.
 */
export function createAuth({
  db,
  env,
  mailer,
  claimCode,
  checkBreach,
}: AuthDeps) {
  const guards = authGuards({ db, claimCode, checkBreach });
  return betterAuth({
    appName: "Pano",
    baseURL: env.BETTER_AUTH_URL,
```

In the same file, replace:

```ts
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL],
    database: drizzleAdapter(db, { provider: "pg", schema }),
    hooks: {
      // A code takes its place in Pano's limits before Better Auth stores
      // it, so a refused request leaves the last code sent working. Better
      // Auth's per-IP limit has already run by then.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/email-otp/send-verification-otp" || !claimCode) {
          return;
        }
        const { email, type } = (ctx.body ?? {}) as {
          email?: unknown;
          type?: unknown;
        };
        // Better Auth refuses a bad address, and mails no code for the rest.
        if (
          typeof email !== "string" ||
          type !== "sign-in" ||
          isDemoEmail(email) ||
          !z.email().safeParse(email).success
        ) {
          return;
        }
        if (!(await claimCode(email))) throw new APIError("TOO_MANY_REQUESTS");
      }),
    },
    databaseHooks: {
      user: {
        create: {
```

with:

```ts
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL],
    database: drizzleAdapter(db, { provider: "pg", schema }),
    hooks: guards,
    emailAndPassword: {
      enabled: true,
      // Until its code is entered, a new account's password can't sign in.
      requireEmailVerification: true,
      minPasswordLength: PASSWORD_MIN,
      maxPasswordLength: PASSWORD_MAX,
      revokeSessionsOnPasswordReset: true,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    // Entering the confirmation code signs the person in.
    emailVerification: { autoSignInAfterVerification: true },
    // Routes Pano doesn't use. Confirmation codes are checked only through
    // /email-otp/verify-email, where Pano's guard sees the password.
    disabledPaths: [
      "/email-otp/check-verification-otp",
      "/forget-password/email-otp",
      "/email-otp/request-email-change",
      "/email-otp/change-email",
      "/send-verification-email",
      "/verify-email",
    ],
    databaseHooks: {
      user: {
        create: {
```

In the same file, replace:

```ts
      customRules: {
        "/email-otp/send-verification-otp": { window: 60, max: 3 },
        "/sign-in/email-otp": { window: 60, max: 10 },
        // Each demo sign-in makes an account, until the nightly reset.
        "/demo/sign-in": { window: 60, max: 5 },
      },
```

with:

```ts
      customRules: {
        "/email-otp/send-verification-otp": { window: 60, max: 3 },
        "/sign-in/email-otp": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 3 },
        "/sign-in/email": { window: 60, max: 5 },
        "/email-otp/verify-email": { window: 60, max: 10 },
        // Each demo sign-in makes an account, until the nightly reset.
        "/demo/sign-in": { window: 60, max: 5 },
      },
```

In the same file, replace:

```ts
    plugins: [
      emailOTP({
        storeOTP: "hashed",
        async sendVerificationOTP({ email, otp, type }, ctx) {
          // Demo addresses can't receive mail: nobody signs in to them.
          if (type !== "sign-in" || isDemoEmail(email)) return;
          await mailer.sendCode({
            to: email,
            code: otp,
            kind: "sign-in",
            locale: localeFromHeaders(new Headers(ctx?.headers)),
          });
        },
```

with:

```ts
    plugins: [
      emailOTP({
        storeOTP: "hashed",
        // A password sign-up gets its confirmation code from here. So does
        // a sign-up with an address that already has an account: Better
        // Auth answers it like any other, and the code signs its owner in.
        sendVerificationOnSignUp: true,
        async sendVerificationOTP({ email, otp, type }, ctx) {
          // Demo addresses can't receive mail: nobody signs in to them.
          if (isDemoEmail(email)) return;
          const kind = await codeKind(db, type, email);
          if (!kind) return;
          await mailer.sendCode({
            to: email,
            code: otp,
            kind,
            locale: localeFromHeaders(new Headers(ctx?.headers)),
          });
        },
```

In the same file, replace:

```ts

export type Auth = ReturnType<typeof createAuth>;
```

with:

```ts

export type Auth = ReturnType<typeof createAuth>;

/**
 * Which email a code goes in. A confirmation code for an address that is
 * already confirmed came from a sign-up with an existing account's address.
 */
async function codeKind(
  db: Database,
  type: "sign-in" | "email-verification" | "forget-password" | "change-email",
  email: string
): Promise<CodeKind | null> {
  if (type === "sign-in") return "sign-in";
  if (type === "forget-password") return "reset";
  if (type !== "email-verification") return null;
  const [found] = await db
    .select({ confirmed: schema.user.emailVerified })
    .from(schema.user)
    .where(eq(schema.user.email, email.toLowerCase()))
    .limit(1);
  return found?.confirmed ? "existing-account" : "confirm";
}
```

In `worker/middleware/auth.ts`, replace:

```ts
import { createMiddleware } from "hono/factory";
import { type Auth, createAuth } from "../auth";
import type { AppEnv } from "../env";
import type { CodeMailer } from "../mail/mailer";
import { claimCodeForAddress, claimDailyEmail } from "../services/email-budget";
```

with:

```ts
import { createMiddleware } from "hono/factory";
import { type Auth, createAuth } from "../auth";
import { isBreached } from "../auth/password";
import type { AppEnv } from "../env";
import type { CodeMailer } from "../mail/mailer";
import { claimCodeForAddress, claimDailyEmail } from "../services/email-budget";
```

In the same file, replace:

```ts
 * asks for it: building it is most of a cold request's CPU, and signed-out
 * visitors never need it. Runs after withMailer.
 *
 * In production a code first takes its place in two limits: three per
 * address in ten minutes, and the day's email budget. It claims before
 * Better Auth makes the code, so a refused request leaves the last code
 * sent working, and the /auth route says which limit refused it.
 */
export const withAuth = createMiddleware<AppEnv>(async (c, next) => {
  const mail: AppEnv["Variables"]["mail"] = { failed: false };
```

with:

```ts
 * asks for it: building it is most of a cold request's CPU, and signed-out
 * visitors never need it. Runs after withMailer.
 *
 * In production a code email (sign-in, confirmation or reset) first takes
 * its place in two limits: three per address in ten minutes, and the day's
 * email budget. It claims before Better Auth makes the code, so a refused
 * request leaves the last code sent working, and the /auth route says which
 * limit refused it. New passwords are checked against Have I Been Pwned in
 * production only, so development and tests never call it.
 */
export const withAuth = createMiddleware<AppEnv>(async (c, next) => {
  const mail: AppEnv["Variables"]["mail"] = { failed: false };
```

In the same file, replace:

```ts
  c.set("mail", mail);
  let auth: Auth | undefined;
  c.set("auth", () => {
    auth ??= createAuth({ db: c.var.db, env: c.env, mailer: codes, claimCode });
    return auth;
  });
  await next();
```

with:

```ts
  c.set("mail", mail);
  let auth: Auth | undefined;
  c.set("auth", () => {
    auth ??= createAuth({
      db: c.var.db,
      env: c.env,
      mailer: codes,
      claimCode,
      checkBreach: c.env.ENVIRONMENT === "production" ? isBreached : undefined,
    });
    return auth;
  });
  await next();
```

- [ ] **Step 5: Run them to watch them pass**

Run: `bunx vitest run worker/auth/sign-up.test.ts`
Expected: PASS, `Tests  18 passed (18)`.

- [ ] **Step 6: Run the whole suite**

Run: `bun run typecheck && bun run check && bun run test`
Expected: typecheck and Biome clean; `Test Files  85 passed (85)`, `Tests  716 passed (716)`.

- [ ] **Step 7: Commit**

```bash
git add shared worker
git commit -m "feat: password sign-up confirmed by a code that must come with the password; duplicate sign-ups email the owner a sign-in code"
```

---

### Task 5: Forgot password, password changes, and the wrong-password pause

**Files:**
- Create: `worker/services/password-attempts.ts`, `worker/auth/passwords.test.ts`
- Modify: `worker/services/email-budget.ts`, `worker/auth/guards.ts`, `worker/auth/index.ts`

**Interfaces:**
- Consumes: `authGuards` (Task 4)
- Produces:
  - `addressKey(email, prefix: "code" | "password" = "code")`
  - `WRONG_PASSWORDS_PER_HOUR = 10`
  - `passwordPaused(db, email, now?)` and `noteWrongPassword(db, email, now?)` in `worker/services/password-attempts.ts`

- [ ] **Step 1: Write the failing tests**

Create `worker/auth/passwords.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { WRONG_PASSWORDS_PER_HOUR } from "../services/password-attempts";
import { cookieFrom, testApp, uniqueEmail } from "../test/app";
import { startMidWindow } from "../test/clock";

/** A client address of its own: no other test file uses 10.82.x.x. */
const ip = () => ({
  "cf-connecting-ip": `10.82.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`,
});

/** Just the session token: what a browser sends once the cache cookie expired. */
const tokenOnly = (cookie: string) =>
  cookie
    .split("; ")
    .filter((part) => part.startsWith("better-auth.session_token="))
    .join("; ");

async function signedIn(t: ReturnType<typeof testApp>, cookie: string) {
  const res = await t.client.api.me.$get(undefined, { headers: { cookie } });
  const body = await res.json();
  return body.success && body.data.user !== null;
}

function requestReset(t: ReturnType<typeof testApp>, email: string) {
  return t.post("/api/auth/email-otp/request-password-reset", { email });
}

function resetPassword(
  t: ReturnType<typeof testApp>,
  email: string,
  otp: string,
  password: string
) {
  return t.post("/api/auth/email-otp/reset-password", {
    email,
    otp,
    password,
  });
}

describe("forgot password", () => {
  it("emails a reset code, and the code sets a new password", async () => {
    const t = testApp();
    const { email, password } = await t.signUpConfirmed();

    expect((await requestReset(t, email)).status).toBe(200);
    const code = t.lastCode(email, "reset");
    const res = await resetPassword(t, email, code, "a brand new password");
    expect(res.status).toBe(200);

    expect(
      (await t.signInWithPassword(email, "a brand new password")).status
    ).toBe(200);
    expect((await t.signInWithPassword(email, password)).status).toBe(401);
    await t.settle();
  });

  it("signs every session out", async () => {
    const t = testApp();
    const { email, cookie } = await t.signUpConfirmed();

    await requestReset(t, email);
    await resetPassword(
      t,
      email,
      t.lastCode(email, "reset"),
      "a brand new password"
    );
    expect(await signedIn(t, tokenOnly(cookie))).toBe(false);
    await t.settle();
  });

  it("answers an unknown address the same way, and emails nothing", async () => {
    const t = testApp();
    const { email } = await t.signUpConfirmed();
    const known = await requestReset(t, email);
    const unknown = await requestReset(t, uniqueEmail());

    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
    expect(t.mail.sent.filter((sent) => sent.kind === "reset")).toHaveLength(1);
    await t.settle();
  });

  it("gives an account made with email codes its first password", async () => {
    const t = testApp();
    const { email } = await t.signIn();

    await requestReset(t, email);
    await resetPassword(t, email, t.lastCode(email, "reset"), "first password");
    expect((await t.signInWithPassword(email, "first password")).status).toBe(
      200
    );
    await t.settle();
  });

  it("confirms an unconfirmed sign-up with the new password", async () => {
    const t = testApp();
    const email = uniqueEmail();
    await t.signUp(email, "someone else's password");

    await requestReset(t, email);
    await resetPassword(
      t,
      email,
      t.lastCode(email, "reset"),
      "my own password"
    );
    expect((await t.signInWithPassword(email, "my own password")).status).toBe(
      200
    );
    expect(
      (await t.signInWithPassword(email, "someone else's password")).status
    ).toBe(401);
    await t.settle();
  });
});

describe("changing a password", () => {
  const change = (
    t: ReturnType<typeof testApp>,
    cookie: string,
    body: Record<string, unknown>
  ) =>
    t.post("/api/auth/change-password", body, {
      cookie,
    });

  it("needs the current password", async () => {
    const t = testApp();
    const { cookie } = await t.signUpConfirmed();
    const res = await change(t, cookie, {
      currentPassword: "not my password",
      newPassword: "a brand new password",
    });
    expect(res.status).toBe(400);
    await t.settle();
  });

  it("signs out the other devices, even when asked not to", async () => {
    const t = testApp();
    const { email, password, cookie } = await t.signUpConfirmed();
    const other = cookieFrom(await t.signInWithPassword(email, password));

    const res = await change(t, cookie, {
      currentPassword: password,
      newPassword: "a brand new password",
      revokeOtherSessions: false,
    });
    expect(res.status).toBe(200);
    expect(await signedIn(t, tokenOnly(other))).toBe(false);
    expect(await signedIn(t, cookieFrom(res))).toBe(true);
    await t.settle();
  });
});

describe("wrong passwords", () => {
  it(`pauses password sign-in for an address after ${WRONG_PASSWORDS_PER_HOUR} in an hour`, async () => {
    startMidWindow(60 * 60 * 1000);
    const t = testApp();
    const { email, password } = await t.signUpConfirmed();

    for (let i = 0; i < WRONG_PASSWORDS_PER_HOUR; i++) {
      expect((await t.signInWithPassword(email, `wrong ${i}`)).status).toBe(
        401
      );
    }
    const paused = await t.signInWithPassword(email, password);
    expect(paused.status).toBe(429);
    expect(await paused.json()).toMatchObject({ code: "PASSWORD_PAUSED" });

    // An email code still signs the owner in.
    expect((await t.signIn(email)).cookie).not.toBe("");
    await t.settle();
  });

  it("pauses an address with no account the same way", async () => {
    startMidWindow(60 * 60 * 1000);
    const t = testApp();
    const email = uniqueEmail();
    for (let i = 0; i < WRONG_PASSWORDS_PER_HOUR; i++) {
      await t.signInWithPassword(email, `wrong ${i}`);
    }
    const paused = await t.signInWithPassword(email, "anything at all");
    expect(paused.status).toBe(429);
    expect(await paused.json()).toMatchObject({ code: "PASSWORD_PAUSED" });
    await t.settle();
  });
});

describe("password limits in production", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("counts a reset code against the address's three in ten minutes", async () => {
    startMidWindow(10 * 60 * 1000);
    const t = testApp({ ENVIRONMENT: "production" });
    const email = uniqueEmail();
    for (let i = 0; i < 3; i++) await t.sendCode(email, ip());
    const refused = await t.post(
      "/api/auth/email-otp/request-password-reset",
      { email },
      ip()
    );
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ code: "CODE_LIMIT" });
    await t.settle();
  });

  it("refuses a leaked password as the new one on reset and on change", async () => {
    const t = testApp({ ENVIRONMENT: "production" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(""))
    );
    const { email, password, cookie } = await t.signUpConfirmed(
      undefined,
      undefined,
      ip()
    );
    // SHA-1 of "password" starts 5BAA6; the rest is listed.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("1E4C9B93F3F0682250B6CF8331B7EE68FD8:42"))
    );
    const changed = await t.post(
      "/api/auth/change-password",
      { currentPassword: password, newPassword: "password" },
      { cookie, ...ip() }
    );
    expect(await changed.json()).toMatchObject({
      code: "PASSWORD_COMPROMISED",
    });

    await t.post("/api/auth/email-otp/request-password-reset", { email }, ip());
    const reset = await t.post(
      "/api/auth/email-otp/reset-password",
      { email, otp: t.lastCode(email, "reset"), password: "password" },
      ip()
    );
    expect(await reset.json()).toMatchObject({ code: "PASSWORD_COMPROMISED" });
    await t.settle();
  });

  it("allows three reset requests a minute from one address", async () => {
    const t = testApp({ ENVIRONMENT: "production" });
    const from = ip();
    for (let i = 0; i < 3; i++) {
      const res = await t.post(
        "/api/auth/email-otp/request-password-reset",
        { email: uniqueEmail() },
        from
      );
      expect(res.status).toBe(200);
    }
    const refused = await t.post(
      "/api/auth/email-otp/request-password-reset",
      { email: uniqueEmail() },
      from
    );
    expect(refused.status).toBe(429);
    await t.settle();
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `bunx vitest run worker/auth/passwords.test.ts`
Expected: FAIL: `Cannot find module '../services/password-attempts'`, `Test Files  1 failed (1)`, `Tests  no tests`.

- [ ] **Step 3: Count wrong passwords per address**

In `worker/services/email-budget.ts`, replace:

```ts
  return claim(db, await addressKey(email), windowStart, CODES_PER_ADDRESS);
}

/** The counter key for an address: a hash, never the address itself. */
export async function addressKey(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return `code:${Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Drops windows older than two days; the nightly cron calls it. */
```

with:

```ts
  return claim(db, await addressKey(email), windowStart, CODES_PER_ADDRESS);
}

/**
 * The counter key for an address: a hash, never the address itself. `code`
 * counts its code emails; `password` its wrong passwords.
 */
export async function addressKey(
  email: string,
  prefix: "code" | "password" = "code"
): Promise<string> {
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return `${prefix}:${Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Drops windows older than two days; the nightly cron calls it. */
```

Create `worker/services/password-attempts.ts`:

```ts
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { emailCounters } from "../db/schema";
import { addressKey } from "./email-budget";

/**
 * Wrong passwords one address can have in a UTC hour before password
 * sign-in pauses for it. Email codes still work, so a stranger guessing
 * can't lock the owner out.
 */
export const WRONG_PASSWORDS_PER_HOUR = 10;

const HOUR_MS = 60 * 60 * 1000;

function hourOf(now: Date) {
  return new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);
}

/**
 * Whether password sign-in is paused for the address this hour. Counted by
 * the address's hash, whether or not it has an account, so a pause says
 * nothing about who signed up.
 */
export async function passwordPaused(
  db: Database,
  email: string,
  now = new Date()
): Promise<boolean> {
  const [row] = await db
    .select({ count: emailCounters.count })
    .from(emailCounters)
    .where(
      and(
        eq(emailCounters.key, await addressKey(email, "password")),
        eq(emailCounters.windowStart, hourOf(now))
      )
    )
    .limit(1);
  return (row?.count ?? 0) >= WRONG_PASSWORDS_PER_HOUR;
}

/** Counts a wrong password for the address. */
export async function noteWrongPassword(
  db: Database,
  email: string,
  now = new Date()
) {
  await db
    .insert(emailCounters)
    .values({
      key: await addressKey(email, "password"),
      windowStart: hourOf(now),
      count: 1,
    })
    .onConflictDoUpdate({
      target: [emailCounters.key, emailCounters.windowStart],
      set: { count: sql`${emailCounters.count} + 1` },
    });
}
```

- [ ] **Step 4: Guard resets, changes and password sign-in**

In `worker/auth/guards.ts`, replace:

```ts
import { PASSWORD_MAX, PASSWORD_MIN } from "@/shared/password";
import type { Database } from "../db/client";
import { account, user } from "../db/schema";
import { hashPassword, verifyPassword } from "./password";

export type GuardDeps = {
```

with:

```ts
import { PASSWORD_MAX, PASSWORD_MIN } from "@/shared/password";
import type { Database } from "../db/client";
import { account, user } from "../db/schema";
import {
  noteWrongPassword,
  passwordPaused,
} from "../services/password-attempts";
import { hashPassword, verifyPassword } from "./password";

export type GuardDeps = {
```

In the same file, replace:

```ts
 *   earlier sign-up of the same address that was never confirmed.
 * - Confirming keeps a sign-up's password only when the password comes with
 *   the code (see beforeConfirm).
 */
export function authGuards({ db, claimCode, checkBreach }: GuardDeps) {
  /** The unconfirmed sign-up this request confirms, if it is a confirmation. */
```

with:

```ts
 *   earlier sign-up of the same address that was never confirmed.
 * - Confirming keeps a sign-up's password only when the password comes with
 *   the code (see beforeConfirm).
 * - Every new password (sign-up, reset, change) is checked for leaks, and
 *   changing a password signs out the account's other devices.
 * - Ten wrong passwords for an address in an hour pause password sign-in
 *   for it until the hour ends.
 */
export function authGuards({ db, claimCode, checkBreach }: GuardDeps) {
  /** The unconfirmed sign-up this request confirms, if it is a confirmation. */
```

In the same file, replace:

```ts
    if (typeof email !== "string" || isDemoEmail(email)) return;
    if (!z.email().safeParse(email).success) return;
    await claim(email);
  }

  async function beforeSignUp(body: unknown) {
```

with:

```ts
    if (typeof email !== "string" || isDemoEmail(email)) return;
    if (!z.email().safeParse(email).success) return;
    await claim(email);
  }

  /** Forgot password: the reset code is a code email like any other. */
  async function beforeResetCode(body: unknown) {
    const { email } = (body ?? {}) as { email?: unknown };
    if (typeof email !== "string" || isDemoEmail(email)) return;
    if (!z.email().safeParse(email).success) return;
    await claim(email);
  }

  /** A reset's or a change's new password, checked like a sign-up's. */
  async function beforeNewPassword(
    body: unknown,
    field: "password" | "newPassword"
  ) {
    const parsed = newPassword.safeParse(
      (body as Record<string, unknown> | undefined)?.[field]
    );
    if (parsed.success) await refuseBreached(parsed.data);
  }

  async function beforePasswordSignIn(body: unknown) {
    const { email } = (body ?? {}) as { email?: unknown };
    if (typeof email !== "string") return;
    if (await passwordPaused(db, email)) {
      throw new APIError("TOO_MANY_REQUESTS", {
        code: "PASSWORD_PAUSED",
        message:
          "Too many wrong passwords for this address. Sign in with an email code.",
      });
    }
  }

  async function beforeSignUp(body: unknown) {
```

In the same file, replace:

```ts
        await beforeSignUp(ctx.body);
      } else if (ctx.path === "/email-otp/verify-email") {
        await beforeConfirm(ctx.body);
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (
        ctx.path === "/email-otp/verify-email" &&
        !(ctx.context.returned instanceof Error)
```

with:

```ts
        await beforeSignUp(ctx.body);
      } else if (ctx.path === "/email-otp/verify-email") {
        await beforeConfirm(ctx.body);
      } else if (ctx.path === "/email-otp/request-password-reset") {
        await beforeResetCode(ctx.body);
      } else if (ctx.path === "/email-otp/reset-password") {
        await beforeNewPassword(ctx.body, "password");
      } else if (ctx.path === "/change-password") {
        await beforeNewPassword(ctx.body, "newPassword");
        // A changed password signs out every other device, whatever the
        // request asked for.
        return {
          context: { body: { ...(ctx.body ?? {}), revokeOtherSessions: true } },
        };
      } else if (ctx.path === "/sign-in/email") {
        await beforePasswordSignIn(ctx.body);
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      const returned = ctx.context.returned;
      if (
        ctx.path === "/sign-in/email" &&
        returned instanceof APIError &&
        returned.body?.code === "INVALID_EMAIL_OR_PASSWORD"
      ) {
        const { email } = ctx.body as { email: string };
        await noteWrongPassword(db, email);
      }
      if (
        ctx.path === "/email-otp/verify-email" &&
        !(ctx.context.returned instanceof Error)
```

In the same file, replace:

```ts
  };
}

const signUpBody = z.object({
  email: z.email(),
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
});

let dummy: Promise<string> | undefined;
/** A hash no password matches, to check against when nothing is waiting. */
```

with:

```ts
  };
}

const newPassword = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);
const signUpBody = z.object({ email: z.email(), password: newPassword });

let dummy: Promise<string> | undefined;
/** A hash no password matches, to check against when nothing is waiting. */
```

In `worker/auth/index.ts`, replace:

```ts
        "/sign-up/email": { window: 60, max: 3 },
        "/sign-in/email": { window: 60, max: 5 },
        "/email-otp/verify-email": { window: 60, max: 10 },
        // Each demo sign-in makes an account, until the nightly reset.
        "/demo/sign-in": { window: 60, max: 5 },
      },
```

with:

```ts
        "/sign-up/email": { window: 60, max: 3 },
        "/sign-in/email": { window: 60, max: 5 },
        "/email-otp/verify-email": { window: 60, max: 10 },
        "/email-otp/request-password-reset": { window: 60, max: 3 },
        "/email-otp/reset-password": { window: 60, max: 10 },
        // Each demo sign-in makes an account, until the nightly reset.
        "/demo/sign-in": { window: 60, max: 5 },
      },
```

- [ ] **Step 5: Run them to watch them pass**

Run: `bunx vitest run worker/auth/passwords.test.ts`
Expected: PASS, `Tests  12 passed (12)`.

- [ ] **Step 6: Run the whole suite**

Run: `bun run typecheck && bun run check && bun run test`
Expected: typecheck and Biome clean; `Test Files  86 passed (86)`, `Tests  728 passed (728)`.

- [ ] **Step 7: Commit**

```bash
git add worker
git commit -m "feat: forgot password with a reset code, password changes sign out other devices, and ten wrong passwords pause an address for the hour"
```

---

### Task 6: A first password, and what `/api/me` tells the account page

**Files:**
- Create: `shared/account.ts`, `worker/routes/me-password.test.ts`
- Modify: `shared/envelope.ts`, `src/i18n/messages/en.json`, `src/i18n/messages/tr.json`, `src/lib/session.test.ts`, `worker/auth/guards.ts`, `worker/auth/index.ts`, `worker/env.ts`, `worker/middleware/session.ts`, `worker/routes/me.ts`, `worker/routes/me.test.ts`

**Interfaces:**
- Consumes: `isBreached` (Task 2); `passwordSchema` (Task 4); `authGuards` (Task 4)
- Produces:
  - `FRESH_SESSION_SECONDS` and `isSessionFresh(startedAt, now?)` in `shared/account.ts`
  - `requireUser` also sets `c.var.sessionStartedAt: Date`
  - `GET` and `PATCH /api/me` add `user.sessionStartedAt` (an ISO string) and `signIn: { github: boolean }`
  - `POST /api/me/password { password }`, which answers `{ password: true }`
  - `Bindings.GITHUB_CLIENT_ID?` and `GITHUB_CLIENT_SECRET?`

- [ ] **Step 1: Write the failing tests**

Create `worker/routes/me-password.test.ts`:

```ts
import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { session, user } from "../db/schema";
import { resetDemo } from "../services/demo-reset";
import { testApp } from "../test/app";
import { testDb } from "../test/db";

const { db, close } = testDb();
beforeAll(() => resetDemo(db));
afterAll(() => close());

/** A client address of its own: no other test file uses 10.83.x.x. */
const ip = () => ({
  "cf-connecting-ip": `10.83.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`,
});

/** Just the session token, so the request reads the session from the database. */
const tokenOnly = (cookie: string) =>
  cookie
    .split("; ")
    .filter((part) => part.startsWith("better-auth.session_token="))
    .join("; ");

function setPassword(
  t: ReturnType<typeof testApp>,
  cookie: string,
  password: string,
  headers: Record<string, string> = {}
) {
  return t.post("/api/me/password", { password }, { cookie, ...headers });
}

/** Makes every session of the account look like it signed in `hours` ago. */
async function ageSessions(email: string, hours: number) {
  const started = new Date(Date.now() - hours * 60 * 60 * 1000);
  const [owner] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email));
  await db
    .update(session)
    .set({ createdAt: started })
    .where(eq(session.userId, owner!.id));
}

describe("GET /api/me", () => {
  it("says when the session signed in", async () => {
    const t = testApp();
    const before = Date.now();
    const { cookie } = await t.signIn();
    const res = await t.client.api.me.$get(undefined, { headers: { cookie } });
    const body = await res.json();
    if (!body.success || !body.data.user) throw new Error("not signed in");
    const started = Date.parse(body.data.user.sessionStartedAt);
    expect(started).toBeGreaterThanOrEqual(before - 1000);
    expect(started).toBeLessThanOrEqual(Date.now());
    await t.settle();
  });

  it("offers GitHub sign-in only when both of its secrets are set", async () => {
    const answer = async (overrides: Record<string, string>) => {
      const t = testApp(overrides);
      const body = await (await t.client.api.me.$get()).json();
      await t.settle();
      return body.success ? body.data.signIn : null;
    };
    expect(await answer({})).toEqual({ github: false });
    expect(await answer({ GITHUB_CLIENT_ID: "id" })).toEqual({ github: false });
    expect(
      await answer({ GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: "secret" })
    ).toEqual({ github: true });
  });
});

describe("POST /api/me/password", () => {
  it("gives an account made with email codes its first password", async () => {
    const t = testApp();
    const { email, cookie } = await t.signIn();

    const res = await setPassword(t, cookie, "my first password");
    expect(res.status).toBe(200);
    expect(
      (await t.signInWithPassword(email, "my first password")).status
    ).toBe(200);
    await t.settle();
  });

  it("refuses an account that has a password already", async () => {
    const t = testApp();
    const { cookie } = await t.signUpConfirmed();
    const res = await setPassword(t, cookie, "another password");
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "PASSWORD_EXISTS" });
    await t.settle();
  });

  it("needs a session that signed in within the last day", async () => {
    const t = testApp();
    const { email, cookie } = await t.signIn();
    await ageSessions(email, 25);

    const res = await setPassword(t, tokenOnly(cookie), "my first password");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "SESSION_NOT_FRESH" });
    await t.settle();
  });

  it("refuses demo guests", async () => {
    const t = testApp();
    const { cookie } = await t.signInDemo("member");
    const res = await setPassword(t, cookie, "my first password");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "DEMO_ONLY" });
    await t.settle();
  });

  it("refuses a password shorter than 8 characters", async () => {
    const t = testApp();
    const { cookie } = await t.signIn();
    expect((await setPassword(t, cookie, "short12")).status).toBe(400);
    await t.settle();
  });

  it("needs a signed-in user", async () => {
    const t = testApp();
    expect((await setPassword(t, "", "my first password")).status).toBe(401);
    await t.settle();
  });
});

describe("POST /api/me/password in production", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("refuses a leaked password", async () => {
    const t = testApp({ ENVIRONMENT: "production" });
    const { cookie } = await t.signIn(undefined, ip());
    // SHA-1 of "password" starts 5BAA6; the rest is listed.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("1E4C9B93F3F0682250B6CF8331B7EE68FD8:42"))
    );
    const res = await setPassword(t, cookie, "password", ip());
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "PASSWORD_COMPROMISED" });
    await t.settle();
  });

  it("allows five tries an hour", async () => {
    const t = testApp({ ENVIRONMENT: "production" });
    const { cookie } = await t.signIn(undefined, ip());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(""))
    );
    // Too short: refused after the limit counts it, so nothing gets set.
    for (let i = 0; i < 5; i++) {
      expect((await setPassword(t, cookie, "short", ip())).status).toBe(400);
    }
    expect((await setPassword(t, cookie, "long enough now", ip())).status).toBe(
      429
    );
    await t.settle();
  });
});

describe("changing a password as a demo guest", () => {
  it("is refused as a demo action", async () => {
    const t = testApp();
    const { cookie } = await t.signInDemo("member");
    const res = await t.post(
      "/api/auth/change-password",
      { currentPassword: "anything", newPassword: "something new" },
      { cookie }
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "DEMO_ONLY" });
    await t.settle();
  });
});
```

In `worker/routes/me.test.ts`, replace:

```ts
    expect(await me.json()).toEqual({
      success: true,
      data: {
        user: { id: expect.any(String), email, name: "" },
        workspaces: [],
      },
    });
    await t.settle();
```

with:

```ts
    expect(await me.json()).toEqual({
      success: true,
      data: {
        user: {
          id: expect.any(String),
          email,
          name: "",
          sessionStartedAt: expect.any(String),
        },
        workspaces: [],
        signIn: { github: false },
      },
    });
    await t.settle();
```

In the same file, replace:

```ts
    const me = await t.client.api.me.$get();
    expect(await me.json()).toEqual({
      success: true,
      data: { user: null, workspaces: [] },
    });
    await t.settle();
  });
```

with:

```ts
    const me = await t.client.api.me.$get();
    expect(await me.json()).toEqual({
      success: true,
      data: { user: null, workspaces: [], signIn: { github: false } },
    });
    await t.settle();
  });
```

- [ ] **Step 2: Run them to watch them fail**

Run: `bunx vitest run worker/routes/me-password.test.ts worker/routes/me.test.ts`
Expected: FAIL, `Test Files  2 failed (2)`, `Tests  13 failed | 18 passed (31)`.
- All 11 new tests fail.
- So do `me.test.ts`'s two that read `/api/me` whole, which lacks `sessionStartedAt` and `signIn`.

- [ ] **Step 3: The fresh-session rule, the error codes and their messages**

Create `shared/account.ts`:

```ts
/**
 * Adding a way to sign in (a password, a passkey, GitHub) needs a session
 * started within this long, so a stolen session that has been around for
 * days can't add a way back in. Better Auth's own checks use the same age.
 */
export const FRESH_SESSION_SECONDS = 24 * 60 * 60;

/** Whether a session that started at `startedAt` may add a sign-in method. */
export function isSessionFresh(startedAt: string | Date, now = Date.now()) {
  return now - new Date(startedAt).getTime() < FRESH_SESSION_SECONDS * 1000;
}
```

In `shared/envelope.ts`, replace:

```ts
  | "TEAM_FULL"
  | "INVITATION_NOT_FOUND"
  | "INVITATION_EXPIRED"
  | "INVITATION_WRONG_ADDRESS";

export type SuccessResponse<T> = { success: true; data: T };

```

with:

```ts
  | "TEAM_FULL"
  | "INVITATION_NOT_FOUND"
  | "INVITATION_EXPIRED"
  | "INVITATION_WRONG_ADDRESS"
  | "SESSION_NOT_FRESH"
  | "PASSWORD_EXISTS"
  | "PASSWORD_COMPROMISED";

export type SuccessResponse<T> = { success: true; data: T };

```

In `src/i18n/messages/en.json`, replace:

```json
    "TEAM_FULL": "The team is full: a workspace can have 50 people.",
    "INVITATION_NOT_FOUND": "This invitation isn't open any more: it was cancelled or already used.",
    "INVITATION_EXPIRED": "This invitation has expired. Ask whoever invited you to send it again.",
    "INVITATION_WRONG_ADDRESS": "This invitation is for another address. Sign in with the address it was sent to."
  },
  "fieldErrors": {
    "SLUG_FORMAT": "Use lowercase letters, numbers and single hyphens.",
```

with:

```json
    "TEAM_FULL": "The team is full: a workspace can have 50 people.",
    "INVITATION_NOT_FOUND": "This invitation isn't open any more: it was cancelled or already used.",
    "INVITATION_EXPIRED": "This invitation has expired. Ask whoever invited you to send it again.",
    "INVITATION_WRONG_ADDRESS": "This invitation is for another address. Sign in with the address it was sent to.",
    "SESSION_NOT_FRESH": "For your security, sign in again to add a way to sign in.",
    "PASSWORD_EXISTS": "This account already has a password. Change it instead.",
    "PASSWORD_COMPROMISED": "This password appears in a known data breach. Choose another one."
  },
  "fieldErrors": {
    "SLUG_FORMAT": "Use lowercase letters, numbers and single hyphens.",
```

In `src/i18n/messages/tr.json`, replace:

```json
    "TEAM_FULL": "Ekip dolu: bir çalışma alanında en fazla 50 kişi olabilir.",
    "INVITATION_NOT_FOUND": "Bu davet artık geçerli değil: iptal edilmiş ya da kullanılmış.",
    "INVITATION_EXPIRED": "Bu davetin süresi doldu. Sizi davet eden kişiden yeniden göndermesini isteyin.",
    "INVITATION_WRONG_ADDRESS": "Bu davet başka bir adres için. Davetin gönderildiği adresle giriş yapın."
  },
  "fieldErrors": {
    "SLUG_FORMAT": "Küçük harf, rakam ve tek tire kullanın.",
```

with:

```json
    "TEAM_FULL": "Ekip dolu: bir çalışma alanında en fazla 50 kişi olabilir.",
    "INVITATION_NOT_FOUND": "Bu davet artık geçerli değil: iptal edilmiş ya da kullanılmış.",
    "INVITATION_EXPIRED": "Bu davetin süresi doldu. Sizi davet eden kişiden yeniden göndermesini isteyin.",
    "INVITATION_WRONG_ADDRESS": "Bu davet başka bir adres için. Davetin gönderildiği adresle giriş yapın.",
    "SESSION_NOT_FRESH": "Güvenliğiniz için, yeni bir giriş yöntemi eklemeden önce yeniden giriş yapın.",
    "PASSWORD_EXISTS": "Bu hesabın zaten bir şifresi var. Bunun yerine şifreyi değiştirin.",
    "PASSWORD_COMPROMISED": "Bu şifre bilinen bir veri sızıntısında yer alıyor. Başka bir şifre seçin."
  },
  "fieldErrors": {
    "SLUG_FORMAT": "Küçük harf, rakam ve tek tire kullanın.",
```

- [ ] **Step 4: The session's start, `/api/me`, and the new route**

In `worker/env.ts`, replace:

```ts
  BREVO_API_KEY?: string;
  /** The sender address Brevo has verified. */
  MAIL_FROM?: string;
};

/** The part of a KV namespace Pano uses. */
```

with:

```ts
  BREVO_API_KEY?: string;
  /** The sender address Brevo has verified. */
  MAIL_FROM?: string;
  /** GitHub sign-in, from a GitHub OAuth app; without both it's off. */
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
};

/** The part of a KV namespace Pano uses. */
```

In `worker/middleware/session.ts`, replace:

```ts

export type UserEnv = {
  Bindings: Bindings;
  Variables: AppEnv["Variables"] & { user: SessionUser };
};

/**
```

with:

```ts

export type UserEnv = {
  Bindings: Bindings;
  Variables: AppEnv["Variables"] & {
    user: SessionUser;
    /** When this session signed in, for the fresh-session rule. */
    sessionStartedAt: Date;
  };
};

/**
```

In the same file, replace:

```ts
  return cache;
}

/** Answers 401 unless the request carries a valid session; sets c.var.user. */
export const requireUser = createMiddleware<UserEnv>(async (c, next) => {
  const session = await readSession(c);
  if (!session) throw new AppError(401, "UNAUTHORIZED", "Sign in first");
  const { id, name, email } = session.user;
  c.set("user", { id, name, email });
  await next();
});

```

with:

```ts
  return cache;
}

/**
 * Answers 401 unless the request carries a valid session; sets c.var.user
 * and c.var.sessionStartedAt.
 */
export const requireUser = createMiddleware<UserEnv>(async (c, next) => {
  const session = await readSession(c);
  if (!session) throw new AppError(401, "UNAUTHORIZED", "Sign in first");
  const { id, name, email } = session.user;
  c.set("user", { id, name, email });
  c.set("sessionStartedAt", new Date(session.session.createdAt));
  await next();
});

```

In `worker/routes/me.ts`, replace:

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
```

with:

```ts
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { isSessionFresh } from "@/shared/account";
import { isDemoEmail } from "@/shared/demo";
import type { SuccessResponse } from "@/shared/envelope";
import { passwordSchema } from "@/shared/password";
import { updateMeSchema } from "@/shared/schemas";
import { isBreached } from "../auth/password";
import type { Database } from "../db/client";
import { account, member, organization } from "../db/schema";
import type { AppEnv, Bindings } from "../env";
import { cleanDisplayName } from "../lib/display-name";
import { AppError } from "../lib/errors";
import { validate } from "../lib/validate";
import { rateLimit } from "../middleware/rate-limit";
import { readSession, requireUser } from "../middleware/session";

type Me = {
  user: {
    id: string;
    name: string;
    email: string;
    /** When this session signed in: adding a sign-in method needs it recent. */
    sessionStartedAt: string;
  } | null;
  workspaces: { id: string; slug: string; name: string; role: string }[];
  /** The ways to sign in this deployment offers besides codes and passwords. */
  signIn: { github: boolean };
};

const setPasswordSchema = z.object({ password: passwordSchema });

/** GitHub sign-in is on only when both of its secrets are set. */
function signInMethods(env: Bindings): Me["signIn"] {
  return { github: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) };
}

function workspacesOf(db: Database, userId: string) {
  return db
```

In the same file, replace:

```ts
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
```

with:

```ts
    if (!session) {
      return c.json<SuccessResponse<Me>>({
        success: true,
        data: { user: null, workspaces: [], signIn: signInMethods(c.env) },
      });
    }
    const { id, name, email } = session.user;
    return c.json<SuccessResponse<Me>>({
      success: true,
      data: {
        user: {
          id,
          name,
          email,
          sessionStartedAt: new Date(session.session.createdAt).toISOString(),
        },
        workspaces: await workspacesOf(c.var.db, id),
        signIn: signInMethods(c.env),
      },
    });
  })
```

In the same file, replace:

```ts
    return c.json<SuccessResponse<Me>>({
      success: true,
      data: {
        user: { id, name, email },
        workspaces: await workspacesOf(c.var.db, id),
      },
    });
  });
```

with:

```ts
    return c.json<SuccessResponse<Me>>({
      success: true,
      data: {
        user: {
          id,
          name,
          email,
          sessionStartedAt: c.var.sessionStartedAt.toISOString(),
        },
        workspaces: await workspacesOf(c.var.db, id),
        signIn: signInMethods(c.env),
      },
    });
  })
  /**
   * A first password for an account made with email codes or GitHub.
   * Better Auth's own set-password can only be called from the server.
   * Changing an existing password goes through Better Auth's
   * /change-password, which asks for the current one.
   */
  .post(
    "/password",
    requireUser,
    rateLimit("set-password", 5, 3600),
    validate("json", setPasswordSchema),
    async (c) => {
      if (isDemoEmail(c.var.user.email)) {
        throw new AppError(
          403,
          "DEMO_ONLY",
          "Demo accounts can't add a way to sign in"
        );
      }
      if (!isSessionFresh(c.var.sessionStartedAt)) {
        throw new AppError(
          403,
          "SESSION_NOT_FRESH",
          "Sign in again to add a way to sign in"
        );
      }
      if (await hasPassword(c.var.db, c.var.user.id)) {
        throw new AppError(
          409,
          "PASSWORD_EXISTS",
          "There's a password already"
        );
      }
      const { password } = c.req.valid("json");
      if (c.env.ENVIRONMENT === "production" && (await isBreached(password))) {
        throw new AppError(
          400,
          "PASSWORD_COMPROMISED",
          "This password appears in a data breach"
        );
      }
      await c.var.auth().api.setPassword({
        body: { newPassword: password },
        headers: c.req.raw.headers,
      });
      return c.json<SuccessResponse<{ password: true }>>({
        success: true,
        data: { password: true },
      });
    }
  );

async function hasPassword(db: Database, userId: string) {
  const [found] = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, "credential"),
        isNotNull(account.password)
      )
    )
    .limit(1);
  return found !== undefined;
}
```

In `worker/auth/index.ts`, replace:

```ts
import { betterAuth } from "better-auth/minimal";
import { emailOTP, organization } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { isDemoEmail } from "@/shared/demo";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/shared/password";
import { INVITATION_DAYS, PENDING_INVITATIONS, TEAM_SIZE } from "@/shared/team";
```

with:

```ts
import { betterAuth } from "better-auth/minimal";
import { emailOTP, organization } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { FRESH_SESSION_SECONDS } from "@/shared/account";
import { isDemoEmail } from "@/shared/demo";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/shared/password";
import { INVITATION_DAYS, PENDING_INVITATIONS, TEAM_SIZE } from "@/shared/team";
```

In the same file, replace:

```ts
      // A signed copy of the session in a cookie keeps most requests off the
      // database, and off the Hyperdrive query budget, for five minutes.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    rateLimit: {
      enabled: env.ENVIRONMENT === "production",
```

with:

```ts
      // A signed copy of the session in a cookie keeps most requests off the
      // database, and off the Hyperdrive query budget, for five minutes.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
      // Adding a passkey or disconnecting GitHub needs a session this new.
      freshAge: FRESH_SESSION_SECONDS,
    },
    rateLimit: {
      enabled: env.ENVIRONMENT === "production",
```

In `worker/auth/guards.ts`, replace:

```ts
import { APIError, createAuthMiddleware } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { isDemoEmail } from "@/shared/demo";
```

with:

```ts
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { isDemoEmail } from "@/shared/demo";
```

In the same file, replace:

```ts
      } else if (ctx.path === "/email-otp/reset-password") {
        await beforeNewPassword(ctx.body, "password");
      } else if (ctx.path === "/change-password") {
        await beforeNewPassword(ctx.body, "newPassword");
        // A changed password signs out every other device, whatever the
        // request asked for.
```

with:

```ts
      } else if (ctx.path === "/email-otp/reset-password") {
        await beforeNewPassword(ctx.body, "password");
      } else if (ctx.path === "/change-password") {
        await refuseDemo(await getSessionFromCtx(ctx));
        await beforeNewPassword(ctx.body, "newPassword");
        // A changed password signs out every other device, whatever the
        // request asked for.
```

In the same file, replace:

```ts
      }
    }),
  };
}

const newPassword = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);
```

with:

```ts
      }
    }),
  };
}

/** Demo accounts can't add or change a way to sign in. */
async function refuseDemo(session: { user: { email: string } } | null) {
  if (session && isDemoEmail(session.user.email)) {
    throw new APIError("FORBIDDEN", {
      code: "DEMO_ONLY",
      message: "Demo accounts can't add a way to sign in",
    });
  }
}

const newPassword = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);
```

In `src/lib/session.test.ts`, replace:

```ts
  function visit(workspaces: ReturnType<typeof workspace>[]) {
    const queryClient = new QueryClient();
    queryClient.setQueryData(meQueryOptions.queryKey, {
      user: { id: "u-sam", name: "Sam", email: "sam@studio.dev" },
      workspaces,
    });
    return NewWorkspaceRoute.options.beforeLoad?.({
      context: { queryClient },
```

with:

```ts
  function visit(workspaces: ReturnType<typeof workspace>[]) {
    const queryClient = new QueryClient();
    queryClient.setQueryData(meQueryOptions.queryKey, {
      user: {
        id: "u-sam",
        name: "Sam",
        email: "sam@studio.dev",
        sessionStartedAt: new Date().toISOString(),
      },
      workspaces,
      signIn: { github: false },
    });
    return NewWorkspaceRoute.options.beforeLoad?.({
      context: { queryClient },
```

- [ ] **Step 5: Run them to watch them pass**

Run: `bunx vitest run worker/routes/me-password.test.ts worker/routes/me.test.ts`
Expected: PASS, `Tests  31 passed (31)`.

- [ ] **Step 6: Run the whole suite**

Run: `bun run typecheck && bun run check && bun run test`
Expected: typecheck and Biome clean; `Test Files  87 passed (87)`, `Tests  739 passed (739)`.

- [ ] **Step 7: Commit**

```bash
git add shared src worker
git commit -m "feat: POST /api/me/password sets a first password from a recent session; /api/me says when the session started and whether GitHub sign-in is on; demo guests can't change a password"
```

---

### Task 7: GitHub sign-in

**Files:**
- Create: `worker/auth/github.test.ts`
- Modify: `worker/auth/index.ts`, `worker/auth/guards.ts`

**Interfaces:**
- Consumes: `isSessionFresh` (Task 6); `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` (Task 6)
- Produces:
  - **The callbacks:** GitHub sign-in redirects to `callbackURL`, or to `errorCallbackURL` with `?error=`:
    - `account_not_linked` when the address belongs to an unconfirmed sign-up
    - `github_email_unverified` when GitHub hasn't verified the email
  - **Disconnecting:** `/unlink-account` takes `{ accountId }`, the id `/list-accounts` gives.

- [ ] **Step 1: Write the failing tests**

They stand in for GitHub's token, user and email endpoints with a fetch stub.

Create `worker/auth/github.test.ts`:

```ts
import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { account, session, user } from "../db/schema";
import { resetDemo } from "../services/demo-reset";
import { testApp, uniqueEmail, updateCookie } from "../test/app";
import { testDb } from "../test/db";

const { db, close } = testDb();
beforeAll(() => resetDemo(db));
afterAll(() => close());
afterEach(() => vi.unstubAllGlobals());

const GITHUB = {
  GITHUB_CLIENT_ID: "test-id",
  GITHUB_CLIENT_SECRET: "test-secret",
};

type GitHubUser = {
  email: string;
  verified?: boolean;
  name?: string | null;
  login?: string;
};

/** Stands in for GitHub's token, user and email endpoints. */
function stubGitHub({
  email,
  verified = true,
  name = "Mona Lisa",
  login = "octocat",
}: GitHubUser) {
  const id = Math.floor(Math.random() * 1e9);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith("https://github.com/login/oauth/access_token")) {
        return Response.json({
          access_token: "gho_test",
          token_type: "bearer",
          scope: "read:user,user:email",
        });
      }
      if (url === "https://api.github.com/user") {
        return Response.json({ id, login, name, email: null, avatar_url: "" });
      }
      if (url === "https://api.github.com/user/emails") {
        return Response.json([{ email, primary: true, verified }]);
      }
      return new Response("not stubbed", { status: 500 });
    })
  );
}

/**
 * Runs GitHub's round trip: Pano's redirect to GitHub, then GitHub's
 * redirect back. Returns where Pano sent the browser, and its cookies.
 */
async function viaGitHub(
  t: ReturnType<typeof testApp>,
  start: { path: string; body: Record<string, unknown> },
  cookie = ""
) {
  const started = await t.post(
    start.path,
    start.body,
    cookie ? { cookie } : {}
  );
  if (!started.ok) return { started, location: null, cookie };
  const { url } = (await started.json()) as { url: string };
  const state = new URL(url).searchParams.get("state");
  const jar = updateCookie(cookie, started);
  const back = await t.request(
    `/api/auth/callback/github?code=test-code&state=${state}`,
    { headers: { cookie: jar } }
  );
  return {
    started,
    location: back.headers.get("location"),
    cookie: updateCookie(jar, back),
  };
}

const signInWithGitHub = (t: ReturnType<typeof testApp>) =>
  viaGitHub(t, {
    path: "/api/auth/sign-in/social",
    body: { provider: "github", callbackURL: "/", errorCallbackURL: "/signin" },
  });

const connectGitHub = (t: ReturnType<typeof testApp>, cookie: string) =>
  viaGitHub(
    t,
    {
      path: "/api/auth/link-social",
      body: {
        provider: "github",
        callbackURL: "/account",
        errorCallbackURL: "/account",
      },
    },
    cookie
  );

async function me(t: ReturnType<typeof testApp>, cookie: string) {
  const res = await t.client.api.me.$get(undefined, { headers: { cookie } });
  const body = await res.json();
  return body.success ? body.data.user : null;
}

async function providers(userId: string) {
  const rows = await db
    .select({ provider: account.providerId })
    .from(account)
    .where(eq(account.userId, userId));
  return rows.map((row) => row.provider).sort();
}

describe("signing in with GitHub", () => {
  it("makes an account named after the GitHub profile", async () => {
    const t = testApp(GITHUB);
    const email = uniqueEmail("mona");
    stubGitHub({ email });

    const { location, cookie } = await signInWithGitHub(t);
    expect(location).toBe("/");
    expect(await me(t, cookie)).toMatchObject({ email, name: "Mona Lisa" });
    await t.settle();
  });

  it("uses the login when the profile has no name", async () => {
    const t = testApp(GITHUB);
    stubGitHub({ email: uniqueEmail(), name: null, login: "octocat" });
    const { cookie } = await signInWithGitHub(t);
    expect(await me(t, cookie)).toMatchObject({ name: "octocat" });
    await t.settle();
  });

  it("joins the account that has the same, verified email", async () => {
    const t = testApp(GITHUB);
    const { email, cookie: codeCookie } = await t.signIn();
    const owner = await me(t, codeCookie);
    stubGitHub({ email });

    const { cookie } = await signInWithGitHub(t);
    expect(await me(t, cookie)).toMatchObject({ id: owner?.id });
    expect(await providers(owner!.id)).toEqual(["github"]);
    await t.settle();
  });

  it("refuses a GitHub account whose email GitHub hasn't verified", async () => {
    const t = testApp(GITHUB);
    const email = uniqueEmail();
    stubGitHub({ email, verified: false });

    const { location } = await signInWithGitHub(t);
    expect(location).toMatch(/^\/signin\?error=/);
    expect(await db.select().from(user).where(eq(user.email, email))).toEqual(
      []
    );
    await t.settle();
  });

  it("won't join an unconfirmed sign-up, so its password never gains a GitHub link", async () => {
    const t = testApp(GITHUB);
    const email = uniqueEmail();
    await t.signUp(email, "someone else's password");
    stubGitHub({ email });

    const { location } = await signInWithGitHub(t);
    expect(location).toMatch(/^\/signin\?error=account_not_linked/);
    await t.settle();
  });

  it("isn't offered without GitHub's secrets", async () => {
    const t = testApp();
    const res = await t.post("/api/auth/sign-in/social", {
      provider: "github",
      callbackURL: "/",
    });
    expect(res.ok).toBe(false);
    await t.settle();
  });
});

describe("connecting GitHub from the account page", () => {
  it("links GitHub to the signed-in account, even with another address", async () => {
    const t = testApp(GITHUB);
    const { cookie } = await t.signIn();
    const owner = await me(t, cookie);
    stubGitHub({ email: uniqueEmail("elsewhere") });

    const { location } = await connectGitHub(t, cookie);
    expect(location).toBe("/account");
    expect(await providers(owner!.id)).toEqual(["github"]);
    await t.settle();
  });

  it("needs a session that signed in within the last day", async () => {
    const t = testApp(GITHUB);
    const { email, cookie } = await t.signIn();
    const [owner] = await db.select().from(user).where(eq(user.email, email));
    await db
      .update(session)
      .set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(session.userId, owner!.id));
    const tokenOnly = cookie
      .split("; ")
      .filter((part) => part.startsWith("better-auth.session_token="))
      .join("; ");

    const { started } = await connectGitHub(t, tokenOnly);
    expect(started.status).toBe(403);
    expect(await started.json()).toMatchObject({ code: "SESSION_NOT_FRESH" });
    await t.settle();
  });

  it("refuses demo guests", async () => {
    const t = testApp(GITHUB);
    const { cookie } = await t.signInDemo("member");
    const { started } = await connectGitHub(t, cookie);
    expect(started.status).toBe(403);
    expect(await started.json()).toMatchObject({ code: "DEMO_ONLY" });
    await t.settle();
  });

  it("lets an account made with GitHub disconnect it: email codes still work", async () => {
    const t = testApp(GITHUB);
    const email = uniqueEmail();
    stubGitHub({ email });
    const { cookie } = await signInWithGitHub(t);
    const owner = await me(t, cookie);

    // The account page lists sign-ins through Better Auth, and disconnects
    // one by the id it lists.
    const listed = await t.request("/api/auth/list-accounts", {
      headers: { cookie },
    });
    const linked = (await listed.json()) as {
      id: string;
      providerId: string;
    }[];
    const github = linked.find((row) => row.providerId === "github");
    const res = await t.post(
      "/api/auth/unlink-account",
      { accountId: github?.id },
      { cookie }
    );
    expect(res.status).toBe(200);
    expect(await providers(owner!.id)).toEqual([]);
    expect((await t.signIn(email)).cookie).not.toBe("");
    await t.settle();
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `bunx vitest run worker/auth/github.test.ts`
Expected: FAIL, `Tests  9 failed | 1 passed (10)`. "isn't offered without GitHub's secrets" passes already: GitHub isn't set up yet. It stays to keep it that way when the secrets are missing.

- [ ] **Step 3: Configure GitHub and its rules**

In `worker/auth/index.ts`, replace:

```ts

export type AuthDeps = {
  db: Database;
  env: Pick<Bindings, "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL" | "ENVIRONMENT">;
  mailer: CodeMailer;
  /**
   * Takes a code email's place in Pano's limits before Better Auth makes
```

with:

```ts

export type AuthDeps = {
  db: Database;
  env: Pick<
    Bindings,
    | "BETTER_AUTH_SECRET"
    | "BETTER_AUTH_URL"
    | "ENVIRONMENT"
    | "GITHUB_CLIENT_ID"
    | "GITHUB_CLIENT_SECRET"
  >;
  mailer: CodeMailer;
  /**
   * Takes a code email's place in Pano's limits before Better Auth makes
```

In the same file, replace:

```ts
    },
    // Entering the confirmation code signs the person in.
    emailVerification: { autoSignInAfterVerification: true },
    // Routes Pano doesn't use. Confirmation codes are checked only through
    // /email-otp/verify-email, where Pano's guard sees the password.
    disabledPaths: [
```

with:

```ts
    },
    // Entering the confirmation code signs the person in.
    emailVerification: { autoSignInAfterVerification: true },
    // GitHub sign-in, when both of its secrets are set. Its name (or login)
    // becomes the display name of an account it creates.
    socialProviders:
      env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? {
            github: {
              clientId: env.GITHUB_CLIENT_ID,
              clientSecret: env.GITHUB_CLIENT_SECRET,
            },
          }
        : {},
    account: {
      accountLinking: {
        // A GitHub sign-in joins the account with the same email only when
        // GitHub has verified that email (GitHub isn't a trusted provider)
        // and the Pano account's address is confirmed (Better Auth's
        // default), so an unconfirmed sign-up can't collect a GitHub link.
        enabled: true,
        // Connecting GitHub from the account page works even when GitHub's
        // address differs: the person is signed in, in a recent session.
        allowDifferentEmails: true,
        // Email codes always work, so GitHub can go even when it's the only
        // linked sign-in.
        allowUnlinkingAll: true,
      },
    },
    // Routes Pano doesn't use. Confirmation codes are checked only through
    // /email-otp/verify-email, where Pano's guard sees the password.
    disabledPaths: [
```

In the same file, replace:

```ts
      "/send-verification-email",
      "/verify-email",
    ],
    databaseHooks: {
      user: {
        create: {
```

with:

```ts
      "/send-verification-email",
      "/verify-email",
    ],
    user: {
      // A GitHub account whose email GitHub hasn't verified doesn't get a
      // Pano account: anyone can type any address into GitHub.
      async validateUserInfo({ user, source }) {
        if (
          source.action === "create-user" &&
          source.oauth?.providerId === "github" &&
          !user.emailVerified
        ) {
          return { error: "github_email_unverified" };
        }
      },
    },
    databaseHooks: {
      user: {
        create: {
```

In `worker/auth/guards.ts`, replace:

```ts
} from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { isDemoEmail } from "@/shared/demo";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/shared/password";
import type { Database } from "../db/client";
```

with:

```ts
} from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { isSessionFresh } from "@/shared/account";
import { isDemoEmail } from "@/shared/demo";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/shared/password";
import type { Database } from "../db/client";
```

In the same file, replace:

```ts
        };
      } else if (ctx.path === "/sign-in/email") {
        await beforePasswordSignIn(ctx.body);
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
```

with:

```ts
        };
      } else if (ctx.path === "/sign-in/email") {
        await beforePasswordSignIn(ctx.body);
      } else if (ctx.path === "/link-social") {
        const session = await getSessionFromCtx(ctx);
        await refuseDemo(session);
        refuseStale(session);
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
```

In the same file, replace:

```ts
      }
    }),
  };
}

/** Demo accounts can't add or change a way to sign in. */
```

with:

```ts
      }
    }),
  };
}

/**
 * Adding a way to sign in needs a recent session. Better Auth checks this
 * itself for passkeys and for disconnecting; this covers connecting GitHub.
 */
function refuseStale(session: { session: { createdAt: Date } } | null) {
  if (session && !isSessionFresh(session.session.createdAt)) {
    throw new APIError("FORBIDDEN", {
      code: "SESSION_NOT_FRESH",
      message: "Sign in again to add a way to sign in",
    });
  }
}

/** Demo accounts can't add or change a way to sign in. */
```

- [ ] **Step 4: Run them to watch them pass**

Run: `bunx vitest run worker/auth/github.test.ts`
Expected: PASS, `Tests  10 passed (10)`.

- [ ] **Step 5: Run the whole suite**

Run: `bun run typecheck && bun run check && bun run test`
Expected: typecheck and Biome clean; `Test Files  88 passed (88)`, `Tests  749 passed (749)`.

- [ ] **Step 6: Commit**

```bash
git add worker
git commit -m "feat: GitHub sign-in when its secrets are set: joins the account with the same verified email, refuses unverified GitHub emails, and connecting it needs a recent session"
```

---

### Task 8: Passkeys, loaded only for their routes, and migration 0015

**Files:**
- Create: `worker/auth/passkeys.ts`, `worker/auth/passkeys.test.ts`, `worker/test/passkey.ts`
- Modify: `package.json`, `bun.lock`, `auth.config.ts`, `shared/account.ts`, `worker/auth/guards.ts`, `worker/auth/index.ts`, `worker/middleware/auth.ts`
- Generate: `worker/db/schema/auth.ts` (the `passkey` table), `drizzle/0015_passkeys.sql`, `drizzle/meta/0015_snapshot.json`, and the new entry in `drizzle/meta/_journal.json`

**Interfaces:**
- Consumes: `authGuards` and its demo and fresh-session checks (Tasks 4–7)
- Produces:
  - `passkeyPlugin(env)` in `worker/auth/passkeys.ts`
  - `AuthDeps.passkeys?`, which `withAuth` fills only for paths starting with `/api/auth/passkey/`, with a dynamic import
  - `PASSKEYS_PER_ACCOUNT = 10`
  - `softPasskey(origin?)` in `worker/test/passkey.ts`, a software passkey device with `register(options)` and `authenticate(options)`
  - The `passkey` table, from Better Auth's schema

- [ ] **Step 1: Add the packages**

Run: `bun add @better-auth/passkey@^1.7.18 && bun add -d @simplewebauthn/server@^13.3.2`
Expected: `package.json` gains `"@better-auth/passkey": "^1.7.18"` in `dependencies` and `"@simplewebauthn/server": "^13.3.2"` in `devDependencies`.

- [ ] **Step 2: Write the failing tests**

Create `worker/test/passkey.ts`:

```ts
import { cose, isoBase64URL, isoCBOR } from "@simplewebauthn/server/helpers";

/**
 * A passkey device in software, for tests: it answers Better Auth's
 * registration and sign-in challenges the way a phone or a laptop would,
 * with a P-256 key and "none" attestation.
 */
export async function softPasskey(
  origin = "http://localhost",
  rpID = new URL(origin).hostname
) {
  const keys = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey(
    "jwk",
    keys.publicKey
  )) as JsonWebKey;
  const credentialId = crypto.getRandomValues(new Uint8Array(16));
  const id = isoBase64URL.fromBuffer(credentialId);
  const rpIdHash = await sha256(new TextEncoder().encode(rpID));
  let signCount = 0;
  let userHandle: string | undefined;

  const clientData = (type: string, challenge: string) =>
    new Uint8Array(
      new TextEncoder().encode(
        JSON.stringify({ type, challenge, origin, crossOrigin: false })
      )
    );

  return {
    id,
    /** The answer to /passkey/generate-register-options. */
    async register(options: { challenge: string; user: { id: string } }) {
      userHandle = options.user.id;
      const publicKey = isoCBOR.encode(
        new Map<number, number | Uint8Array>([
          [cose.COSEKEYS.kty, cose.COSEKTY.EC2],
          [cose.COSEKEYS.alg, cose.COSEALG.ES256],
          [cose.COSEKEYS.crv, cose.COSECRV.P256],
          [cose.COSEKEYS.x, isoBase64URL.toBuffer(jwk.x ?? "")],
          [cose.COSEKEYS.y, isoBase64URL.toBuffer(jwk.y ?? "")],
        ])
      );
      const authData = concat(
        rpIdHash,
        // User present, user verified, attested credential data included.
        Uint8Array.of(0x45),
        uint32(signCount),
        new Uint8Array(16),
        Uint8Array.of(0, credentialId.length),
        credentialId,
        publicKey
      );
      const attestationObject = isoCBOR.encode(
        new Map<string, CBORValue>([
          ["fmt", "none"],
          ["attStmt", new Map()],
          ["authData", authData],
        ])
      );
      return {
        id,
        rawId: id,
        type: "public-key",
        response: {
          clientDataJSON: isoBase64URL.fromBuffer(
            clientData("webauthn.create", options.challenge)
          ),
          attestationObject: isoBase64URL.fromBuffer(attestationObject),
          transports: ["internal"],
        },
        clientExtensionResults: {},
        authenticatorAttachment: "platform",
      };
    },
    /** The answer to /passkey/generate-authenticate-options. */
    async authenticate(options: { challenge: string }) {
      signCount += 1;
      // User present and verified.
      const authData = concat(rpIdHash, Uint8Array.of(0x05), uint32(signCount));
      const clientDataJSON = clientData("webauthn.get", options.challenge);
      const signed = concat(authData, await sha256(clientDataJSON));
      const raw = new Uint8Array(
        await crypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          keys.privateKey,
          signed as Uint8Array<ArrayBuffer>
        )
      );
      return {
        id,
        rawId: id,
        type: "public-key",
        response: {
          clientDataJSON: isoBase64URL.fromBuffer(clientDataJSON),
          authenticatorData: isoBase64URL.fromBuffer(authData),
          signature: isoBase64URL.fromBuffer(derSignature(raw)),
          userHandle,
        },
        clientExtensionResults: {},
        authenticatorAttachment: "platform",
      };
    },
  };
}

async function sha256(data: Uint8Array) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", data as Uint8Array<ArrayBuffer>)
  );
}

type CBORValue = Parameters<typeof isoCBOR.encode>[0];

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function uint32(value: number) {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value);
  return out;
}

/** Web Crypto signs as r‖s; WebAuthn wants the ASN.1 DER form. */
function derSignature(raw: Uint8Array) {
  const integer = (bytes: Uint8Array) => {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start++;
    const trimmed = bytes.slice(start);
    const body =
      (trimmed[0] ?? 0) & 0x80 ? concat(Uint8Array.of(0), trimmed) : trimmed;
    return concat(Uint8Array.of(0x02, body.length), body);
  };
  const body = concat(integer(raw.slice(0, 32)), integer(raw.slice(32)));
  return concat(Uint8Array.of(0x30, body.length), body);
}
```

Create `worker/auth/passkeys.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PASSKEYS_PER_ACCOUNT } from "@/shared/account";
import { passkey, session, user } from "../db/schema";
import { resetDemo } from "../services/demo-reset";
import { testApp, updateCookie } from "../test/app";
import { testDb } from "../test/db";
import { softPasskey } from "../test/passkey";

const { db, close } = testDb();
beforeAll(() => resetDemo(db));
afterAll(() => close());

type Device = Awaited<ReturnType<typeof softPasskey>>;

/** The account page's "Add a passkey": options, the device's answer, the check. */
async function addPasskey(
  t: ReturnType<typeof testApp>,
  cookie: string,
  device: Device,
  name = "Chrome on macOS"
) {
  const options = await t.request(
    "/api/auth/passkey/generate-register-options",
    { headers: { cookie } }
  );
  if (!options.ok) return options;
  const response = await device.register(await options.json());
  return t.post(
    "/api/auth/passkey/verify-registration",
    { response, name },
    { cookie: updateCookie(cookie, options) }
  );
}

/** "Sign in with a passkey" on the sign-in page. */
async function signInWithPasskey(
  t: ReturnType<typeof testApp>,
  device: Device
) {
  const options = await t.request(
    "/api/auth/passkey/generate-authenticate-options"
  );
  const response = await device.authenticate(await options.json());
  return t.post(
    "/api/auth/passkey/verify-authentication",
    { response },
    { cookie: updateCookie("", options) }
  );
}

async function me(t: ReturnType<typeof testApp>, cookie: string) {
  const res = await t.client.api.me.$get(undefined, { headers: { cookie } });
  const body = await res.json();
  return body.success ? body.data.user : null;
}

describe("passkeys", () => {
  it("adds a passkey, which then signs in without an email", async () => {
    const t = testApp();
    const { cookie } = await t.signIn();
    const owner = await me(t, cookie);
    const device = await softPasskey();

    expect((await addPasskey(t, cookie, device)).status).toBe(200);
    const res = await signInWithPasskey(t, device);
    expect(res.status).toBe(200);
    expect(await me(t, updateCookie("", res))).toMatchObject({
      id: owner?.id,
    });
    await t.settle();
  });

  it("lists each passkey with its name and when it was added", async () => {
    const t = testApp();
    const { cookie } = await t.signIn();
    await addPasskey(t, cookie, await softPasskey(), "Safari on iPhone");

    const res = await t.request("/api/auth/passkey/list-user-passkeys", {
      headers: { cookie },
    });
    expect(await res.json()).toEqual([
      expect.objectContaining({
        name: "Safari on iPhone",
        createdAt: expect.any(String),
      }),
    ]);
    await t.settle();
  });

  it("stops signing in once removed", async () => {
    const t = testApp();
    const { cookie } = await t.signIn();
    const device = await softPasskey();
    await addPasskey(t, cookie, device);
    const listed = await t.request("/api/auth/passkey/list-user-passkeys", {
      headers: { cookie },
    });
    const [added] = (await listed.json()) as { id: string }[];

    const removed = await t.post(
      "/api/auth/passkey/delete-passkey",
      { id: added?.id },
      { cookie }
    );
    expect(removed.status).toBe(200);
    expect((await signInWithPasskey(t, device)).ok).toBe(false);
    await t.settle();
  });

  it("refuses a passkey made for another site", async () => {
    const t = testApp();
    const { cookie } = await t.signIn();
    const device = await softPasskey("https://elsewhere.example");
    expect((await addPasskey(t, cookie, device)).ok).toBe(false);
    await t.settle();
  });

  it(`stops at ${PASSKEYS_PER_ACCOUNT} passkeys an account`, async () => {
    const t = testApp();
    const { email, cookie } = await t.signIn();
    const [owner] = await db.select().from(user).where(eq(user.email, email));
    await db.insert(passkey).values(
      Array.from({ length: PASSKEYS_PER_ACCOUNT }, (_, i) => ({
        id: crypto.randomUUID(),
        publicKey: "test",
        userId: owner!.id,
        credentialID: `credential-${crypto.randomUUID()}-${i}`,
        counter: 0,
        deviceType: "singleDevice",
        backedUp: false,
      }))
    );

    const res = await addPasskey(t, cookie, await softPasskey());
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "PASSKEY_LIMIT" });
    await t.settle();
  });

  it("needs a session that signed in within the last day", async () => {
    const t = testApp();
    const { email, cookie } = await t.signIn();
    const [owner] = await db.select().from(user).where(eq(user.email, email));
    await db
      .update(session)
      .set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(session.userId, owner!.id));
    const tokenOnly = cookie
      .split("; ")
      .filter((part) => part.startsWith("better-auth.session_token="))
      .join("; ");

    const res = await addPasskey(t, tokenOnly, await softPasskey());
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "SESSION_NOT_FRESH" });
    await t.settle();
  });

  it("refuses demo guests", async () => {
    const t = testApp();
    const { cookie } = await t.signInDemo("member");
    const res = await addPasskey(t, cookie, await softPasskey());
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "DEMO_ONLY" });
    await t.settle();
  });

  it("needs a signed-in user to add one", async () => {
    const t = testApp();
    const res = await addPasskey(t, "", await softPasskey());
    expect(res.status).toBe(401);
    await t.settle();
  });
});
```

- [ ] **Step 3: Run them to watch them fail**

Run: `bunx vitest run worker/auth/passkeys.test.ts`
Expected: FAIL, `Tests  7 failed | 1 passed (8)`.
- The passkey routes answer 404.
- The limit test's title reads "stops at undefined passkeys", since `PASSKEYS_PER_ACCOUNT` doesn't exist yet.
- "refuses a passkey made for another site" passes already, because nothing is accepted.

- [ ] **Step 4: The plugin, its rules, and loading it only for its routes**

In `shared/account.ts`, replace:

```ts
  return now - new Date(startedAt).getTime() < FRESH_SESSION_SECONDS * 1000;
}
```

with:

```ts
  return now - new Date(startedAt).getTime() < FRESH_SESSION_SECONDS * 1000;
}

/** Passkeys one account can hold. */
export const PASSKEYS_PER_ACCOUNT = 10;
```

Create `worker/auth/passkeys.ts`:

```ts
import { passkey } from "@better-auth/passkey";
import type { Bindings } from "../env";

/**
 * Passkeys, through Better Auth's plugin. Its WebAuthn libraries make the
 * Worker about 650 KB bigger and its startup about 8 ms longer (measured
 * 2026-11-09), so withAuth imports this file only for /api/auth/passkey/*:
 * every other request starts without it.
 */
export function passkeyPlugin(env: Pick<Bindings, "BETTER_AUTH_URL">) {
  return passkey({
    // A passkey belongs to Pano's host: pano.olbios88.workers.dev in
    // production, localhost in development.
    rpID: new URL(env.BETTER_AUTH_URL).hostname,
    rpName: "Pano",
    origin: env.BETTER_AUTH_URL,
    // Discoverable, so a passkey signs in without typing an email.
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "preferred",
    },
  });
}
```

In `worker/auth/index.ts`, replace:

```ts
import { localeFromHeaders } from "../lib/request-locale";
import type { CodeKind, CodeMailer } from "../mail/mailer";
import { authGuards } from "./guards";
import { hashPassword, verifyPassword } from "./password";

export type AuthDeps = {
```

with:

```ts
import { localeFromHeaders } from "../lib/request-locale";
import type { CodeKind, CodeMailer } from "../mail/mailer";
import { authGuards } from "./guards";
import type { passkeyPlugin } from "./passkeys";
import { hashPassword, verifyPassword } from "./password";

export type AuthDeps = {
```

In the same file, replace:

```ts
  claimCode?: (email: string) => Promise<boolean>;
  /** Whether a new password is on a leaked-password list (production). */
  checkBreach?: (password: string) => Promise<boolean>;
};

/**
```

with:

```ts
  claimCode?: (email: string) => Promise<boolean>;
  /** Whether a new password is on a leaked-password list (production). */
  checkBreach?: (password: string) => Promise<boolean>;
  /** The passkey plugin, on the requests that need it (see ./passkeys.ts). */
  passkeys?: ReturnType<typeof passkeyPlugin>;
};

/**
```

In the same file, replace:

```ts
  mailer,
  claimCode,
  checkBreach,
}: AuthDeps) {
  const guards = authGuards({ db, claimCode, checkBreach });
  return betterAuth({
```

with:

```ts
  mailer,
  claimCode,
  checkBreach,
  passkeys,
}: AuthDeps) {
  const guards = authGuards({ db, claimCode, checkBreach });
  return betterAuth({
```

In the same file, replace:

```ts
        "/email-otp/verify-email": { window: 60, max: 10 },
        "/email-otp/request-password-reset": { window: 60, max: 3 },
        "/email-otp/reset-password": { window: 60, max: 10 },
        // Each demo sign-in makes an account, until the nightly reset.
        "/demo/sign-in": { window: 60, max: 5 },
      },
```

with:

```ts
        "/email-otp/verify-email": { window: 60, max: 10 },
        "/email-otp/request-password-reset": { window: 60, max: 3 },
        "/email-otp/reset-password": { window: 60, max: 10 },
        // The browser's passkey autofill asks for options on every visit
        // to the sign-in page.
        "/passkey/generate-authenticate-options": { window: 60, max: 20 },
        "/passkey/verify-authentication": { window: 60, max: 20 },
        "/sign-in/social": { window: 60, max: 10 },
        // Each demo sign-in makes an account, until the nightly reset.
        "/demo/sign-in": { window: 60, max: 5 },
      },
```

In the same file, replace:

```ts
        membershipLimit: TEAM_SIZE,
      }),
      demoSignIn({ db }),
    ],
  });
}
```

with:

```ts
        membershipLimit: TEAM_SIZE,
      }),
      demoSignIn({ db }),
      ...(passkeys ? [passkeys] : []),
    ],
  });
}
```

In `worker/auth/guards.ts`, replace:

```ts
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { isSessionFresh } from "@/shared/account";
import { isDemoEmail } from "@/shared/demo";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/shared/password";
import type { Database } from "../db/client";
import { account, user } from "../db/schema";
import {
  noteWrongPassword,
  passwordPaused,
```

with:

```ts
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { isSessionFresh, PASSKEYS_PER_ACCOUNT } from "@/shared/account";
import { isDemoEmail } from "@/shared/demo";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/shared/password";
import type { Database } from "../db/client";
import { account, passkey, user } from "../db/schema";
import {
  noteWrongPassword,
  passwordPaused,
```

In the same file, replace:

```ts
        const session = await getSessionFromCtx(ctx);
        await refuseDemo(session);
        refuseStale(session);
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
```

with:

```ts
        const session = await getSessionFromCtx(ctx);
        await refuseDemo(session);
        refuseStale(session);
      } else if (
        ctx.path === "/passkey/generate-register-options" ||
        ctx.path === "/passkey/verify-registration"
      ) {
        // Better Auth checks the session is recent itself.
        const session = await getSessionFromCtx(ctx);
        await refuseDemo(session);
        if (session) await refuseExtraPasskey(db, session.user.id);
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
```

In the same file, replace:

```ts
    throw new APIError("FORBIDDEN", {
      code: "SESSION_NOT_FRESH",
      message: "Sign in again to add a way to sign in",
    });
  }
}
```

with:

```ts
    throw new APIError("FORBIDDEN", {
      code: "SESSION_NOT_FRESH",
      message: "Sign in again to add a way to sign in",
    });
  }
}

/** An account holds at most PASSKEYS_PER_ACCOUNT passkeys. */
async function refuseExtraPasskey(db: Database, userId: string) {
  const [row] = await db
    .select({ passkeys: count() })
    .from(passkey)
    .where(eq(passkey.userId, userId));
  if ((row?.passkeys ?? 0) >= PASSKEYS_PER_ACCOUNT) {
    throw new APIError("BAD_REQUEST", {
      code: "PASSKEY_LIMIT",
      message: `An account can have ${PASSKEYS_PER_ACCOUNT} passkeys`,
    });
  }
}
```

In `worker/middleware/auth.ts`, replace:

```ts
    },
  };
  c.set("mail", mail);
  let auth: Auth | undefined;
  c.set("auth", () => {
    auth ??= createAuth({
```

with:

```ts
    },
  };
  c.set("mail", mail);
  // Loaded only where it's used: see worker/auth/passkeys.ts. Only a
  // dynamic import keeps it out of every other request's startup.
  const passkeys = c.req.path.startsWith("/api/auth/passkey/")
    ? (await import("../auth/passkeys")).passkeyPlugin(c.env)
    : undefined;
  let auth: Auth | undefined;
  c.set("auth", () => {
    auth ??= createAuth({
```

In the same file, replace:

```ts
      mailer: codes,
      claimCode,
      checkBreach: c.env.ENVIRONMENT === "production" ? isBreached : undefined,
    });
    return auth;
  });
```

with:

```ts
      mailer: codes,
      claimCode,
      checkBreach: c.env.ENVIRONMENT === "production" ? isBreached : undefined,
      passkeys,
    });
    return auth;
  });
```

In `auth.config.ts`, replace:

```ts
// imports this file.
import { drizzle } from "drizzle-orm/postgres-js";
import { createAuth } from "./worker/auth";
import type { Database } from "./worker/db/client";
import { consoleMailer } from "./worker/mail/mailer";

```

with:

```ts
// imports this file.
import { drizzle } from "drizzle-orm/postgres-js";
import { createAuth } from "./worker/auth";
import { passkeyPlugin } from "./worker/auth/passkeys";
import type { Database } from "./worker/db/client";
import { consoleMailer } from "./worker/mail/mailer";

```

In the same file, replace:

```ts
    BETTER_AUTH_URL: "http://localhost:5173",
  },
  mailer: consoleMailer,
});
```

with:

```ts
    BETTER_AUTH_URL: "http://localhost:5173",
  },
  mailer: consoleMailer,
  passkeys: passkeyPlugin({ BETTER_AUTH_URL: "http://localhost:5173" }),
});
```

`worker/middleware/auth.ts` names the path itself rather than importing it from `worker/auth/passkeys.ts`. Any static import of that file would pull the plugin back into every request's startup.

- [ ] **Step 5: Generate the table**

Run: `bun run auth:generate && bunx biome check --write worker/db/schema/auth.ts && git diff --stat worker/db/schema/auth.ts`
Expected:
- `🚀 Schema was overwritten successfully!`, then `1 file changed, 31 insertions(+)`.
- The insertions are:
  - the `passkey` table: `id`, `name`, `public_key`, `user_id` (deleted with its user), `credential_id`, `counter`, `device_type`, `backed_up`, `transports`, `created_at` and `aaguid`
  - its two indexes
  - `passkeys: many(passkey)` in `userRelations`
  - `passkeyRelations`
- Biome's check puts the imports back in order. Without it, the generator's reordering would show as changed lines.

- [ ] **Step 6: Generate the migration**

Run: `bun run db:generate -- --name passkeys`
Expected: `[✓] Your SQL migration file ➜ drizzle/0015_passkeys.sql`. The file must read exactly:

```sql
CREATE TABLE "passkey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp,
	"aaguid" text
);
--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "passkey_userId_idx" ON "passkey" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkey_credentialID_idx" ON "passkey" USING btree ("credential_id");
```

It only adds, so the running Worker keeps working while production migrates ahead of the deploy.

- [ ] **Step 7: Run them to watch them pass**

The test setup applies the new migration first.

Run: `bunx vitest run worker/auth/passkeys.test.ts`
Expected: PASS, `Tests  8 passed (8)`.

- [ ] **Step 8: Check that the plugin stays out of the main bundle**

Run: `bun run build && find dist/pano -name 'passkeys-*.js' -exec wc -c {} + && wc -c dist/pano/index.js`
Expected:
- one `passkeys-….js` chunk of about 669,000 bytes
- `dist/pano/index.js` about 1,346,000 bytes, smaller than before the plugin, because Vite moved shared code into chunks

If `index.js` is about 2.28 MB and there's no passkey chunk, something imports `worker/auth/passkeys.ts` statically.

- [ ] **Step 9: Run the whole suite**

Run: `bun run typecheck && bun run check && bun run test`
Expected: typecheck and Biome clean; `Test Files  89 passed (89)`, `Tests  757 passed (757)`.

- [ ] **Step 10: Commit**

```bash
git add package.json bun.lock auth.config.ts shared worker drizzle
git commit -m "feat: passkeys through Better Auth's plugin, loaded only for passkey routes; migration 0015 adds the passkey table; at most 10 an account, none for demo guests"
```

---

### Task 9: The nightly cron deletes week-old unconfirmed sign-ups

**Files:**
- Create: `worker/services/unconfirmed.ts`, `worker/services/unconfirmed.test.ts`
- Modify: `worker/cron.ts`, `worker/cron.test.ts`

**Interfaces:**
- Produces: `UNCONFIRMED_DAYS = 7` and `deleteStaleSignUps(db, now?): Promise<number>`. Only accounts with `emailVerified` false and a password qualify.

- [ ] **Step 1: Write the failing tests**

Create `worker/services/unconfirmed.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { user } from "../db/schema";
import { testApp, uniqueEmail } from "../test/app";
import { testDb } from "../test/db";
import { deleteStaleSignUps, UNCONFIRMED_DAYS } from "./unconfirmed";

const { db, close } = testDb();
afterAll(() => close());

const DAY_MS = 24 * 60 * 60 * 1000;

/** Makes the account look `days` old. */
async function age(email: string, days: number) {
  await db
    .update(user)
    .set({ createdAt: new Date(Date.now() - days * DAY_MS) })
    .where(eq(user.email, email));
}

const exists = async (email: string) =>
  (await db.select().from(user).where(eq(user.email, email))).length > 0;

describe("deleteStaleSignUps", () => {
  it(`deletes a sign-up left unconfirmed for ${UNCONFIRMED_DAYS} days, and not one day sooner`, async () => {
    const t = testApp();
    const stale = uniqueEmail("stale");
    const recent = uniqueEmail("recent");
    await t.signUp(stale, "correct horse battery");
    await t.signUp(recent, "correct horse battery");
    await age(stale, UNCONFIRMED_DAYS + 1);
    await age(recent, UNCONFIRMED_DAYS - 1);

    expect(await deleteStaleSignUps(db)).toBeGreaterThanOrEqual(1);
    expect(await exists(stale)).toBe(false);
    expect(await exists(recent)).toBe(true);
    await t.settle();
  });

  it("keeps confirmed accounts, however old", async () => {
    const t = testApp();
    const { email } = await t.signUpConfirmed();
    await age(email, 30);
    await deleteStaleSignUps(db);
    expect(await exists(email)).toBe(true);
    await t.settle();
  });

  it("keeps an old unconfirmed account that has no password", async () => {
    const t = testApp();
    const { email } = await t.signIn();
    await db
      .update(user)
      .set({ emailVerified: false })
      .where(eq(user.email, email));
    await age(email, 30);
    await deleteStaleSignUps(db);
    expect(await exists(email)).toBe(true);
    await t.settle();
  });
});
```

In `worker/cron.test.ts`, replace:

```ts
import { describe, expect, it, vi } from "vitest";
import { EVERY_FIVE_MINUTES, NIGHTLY, runScheduled } from "./cron";
import { createDb } from "./db/client";
import { emailCounters } from "./db/schema";
import { changelogKey } from "./services/changelog";
import type { resetDemo } from "./services/demo-reset";
import {
```

with:

```ts
import { describe, expect, it, vi } from "vitest";
import { EVERY_FIVE_MINUTES, NIGHTLY, runScheduled } from "./cron";
import { createDb } from "./db/client";
import { account, emailCounters, user } from "./db/schema";
import { changelogKey } from "./services/changelog";
import type { resetDemo } from "./services/demo-reset";
import {
```

In the same file, replace:

```ts
    expect(left).toEqual([]);
  });

  it("resets the demo every night, then sends what's queued", async () => {
    const send = nothingToSend();
    const reset = fakeReset();
```

with:

```ts
    expect(left).toEqual([]);
  });

  it("deletes week-old unconfirmed sign-ups every night", async () => {
    const { env } = testEnv();
    const { db, close } = createDb(env.HYPERDRIVE.connectionString);
    const id = crypto.randomUUID();
    await db.insert(user).values({
      id,
      name: "",
      email: `cron-${id}@example.com`,
      emailVerified: false,
      createdAt: new Date(Date.now() - 8 * 86_400_000),
      updatedAt: new Date(),
    });
    await db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: "pbkdf2-sha256$1$c2FsdA$aGFzaA",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await runScheduled(NIGHTLY, env, {
      send: nothingToSend(),
      reset: fakeReset(),
    });
    const left = await db.select().from(user).where(eq(user.id, id));
    await close();
    expect(left).toEqual([]);
  });

  it("resets the demo every night, then sends what's queued", async () => {
    const send = nothingToSend();
    const reset = fakeReset();
```

- [ ] **Step 2: Run them to watch them fail**

Run: `bunx vitest run worker/services/unconfirmed.test.ts worker/cron.test.ts`
Expected: FAIL, `Test Files  2 failed (2)`, `Tests  1 failed | 16 passed (17)`.
- `unconfirmed.test.ts` can't find `./unconfirmed`.
- The new cron test finds the week-old sign-up still there.

- [ ] **Step 3: Write the cleanup, and run it nightly**

Create `worker/services/unconfirmed.ts`:

```ts
import { and, eq, exists, isNotNull, lt } from "drizzle-orm";
import type { Database } from "../db/client";
import { account, user } from "../db/schema";

/** How long a password sign-up may wait for its code before it's removed. */
export const UNCONFIRMED_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes password sign-ups whose address was never confirmed, once they're
 * UNCONFIRMED_DAYS old; the nightly cron calls it. They can't sign in, so
 * they own nothing. Only accounts with a password qualify: email-code,
 * GitHub and demo accounts are confirmed when they're made, and an older
 * account somehow left unconfirmed is never touched. Returns how many went.
 */
export async function deleteStaleSignUps(db: Database, now = new Date()) {
  const deleted = await db
    .delete(user)
    .where(
      and(
        eq(user.emailVerified, false),
        lt(user.createdAt, new Date(now.getTime() - UNCONFIRMED_DAYS * DAY_MS)),
        exists(
          db
            .select({ id: account.id })
            .from(account)
            .where(
              and(
                eq(account.userId, user.id),
                eq(account.providerId, "credential"),
                isNotNull(account.password)
              )
            )
        )
      )
    )
    .returning({ id: user.id });
  return deleted.length;
}
```

In `worker/cron.ts`, replace:

```ts
  pauseOutboxUntilTomorrow,
  sendQueuedEmails,
} from "./services/outbox";

/** The triggers in wrangler.jsonc. */
export const EVERY_FIVE_MINUTES = "*/5 * * * *";
```

with:

```ts
  pauseOutboxUntilTomorrow,
  sendQueuedEmails,
} from "./services/outbox";
import { deleteStaleSignUps } from "./services/unconfirmed";

/** The triggers in wrangler.jsonc. */
export const EVERY_FIVE_MINUTES = "*/5 * * * *";
```

In the same file, replace:

```ts
 *   or once a failed email's next try is due, and puts the flag back up
 *   while a full batch left some behind. Once the day's email is spent, a
 *   third flag keeps it from connecting until the next UTC day.
 * - Every night: reset the demo workspace, prune old email counters, then
 *   send whatever is queued, in case a flag was lost.
 */
export async function runScheduled(
  cron: string,
```

with:

```ts
 *   or once a failed email's next try is due, and puts the flag back up
 *   while a full batch left some behind. Once the day's email is spent, a
 *   third flag keeps it from connecting until the next UTC day.
 * - Every night: reset the demo workspace, prune old email counters, delete
 *   password sign-ups left unconfirmed for a week, then send whatever is
 *   queued, in case a flag was lost.
 */
export async function runScheduled(
  cron: string,
```

In the same file, replace:

```ts
        await pruneEmailCounters(db);
      } catch (error) {
        console.error("[email] pruning counters failed:", error);
      }
      const retry = await env.FLAGS.get(OUTBOX_RETRY);
      await sendOutbox(db, env, mailer, send, retry !== null);
```

with:

```ts
        await pruneEmailCounters(db);
      } catch (error) {
        console.error("[email] pruning counters failed:", error);
      }
      try {
        const removed = await deleteStaleSignUps(db);
        if (removed > 0) {
          console.log(`[auth] removed ${removed} unconfirmed sign-ups`);
        }
      } catch (error) {
        console.error("[auth] removing unconfirmed sign-ups failed:", error);
      }
      const retry = await env.FLAGS.get(OUTBOX_RETRY);
      await sendOutbox(db, env, mailer, send, retry !== null);
```

- [ ] **Step 4: Run them to watch them pass**

Run: `bunx vitest run worker/services/unconfirmed.test.ts worker/cron.test.ts`
Expected: PASS, `Tests  20 passed (20)`.

- [ ] **Step 5: Run the whole suite**

Run: `bun run typecheck && bun run check && bun run test`
Expected: typecheck and Biome clean; `Test Files  90 passed (90)`, `Tests  761 passed (761)`.

- [ ] **Step 6: Commit**

```bash
git add worker
git commit -m "feat: the nightly cron deletes password sign-ups left unconfirmed for a week"
```

---

### Task 10: Signing in, signing up, and resetting a password, in the app

**Files:**
- Create in `src/features/auth/`:
  - `after-sign-in.ts`
  - `auth-error.ts`, `auth-error.test.ts`
  - `auth-pages.test.tsx`
  - `code-sign-in.tsx`, `confirm-step.tsx`
  - `sign-in-page.tsx`, `sign-up-page.tsx`, `forgot-password-page.tsx`
- Create: `src/routes/signup.tsx`, `src/routes/forgot-password.tsx`
- Modify: `src/routes/signin.tsx`, `src/lib/auth-client.ts`, `src/i18n/messages/en.json`, `src/i18n/messages/tr.json`, `shared/slug.ts`, `shared/slug.test.ts`
- Generate: `src/routeTree.gen.ts`

**Interfaces:**
- Consumes:
  - `/api/me`'s `signIn.github` (Task 6)
  - the server's routes and codes (Tasks 4–8)
  - `passwordSchema` (Task 4)
- Produces:
  - `useAfterSignIn()`: stable across renders; it goes to the redirect, else the first workspace, else `/new-workspace`
  - `authErrorKey(failure)`, `passkeyCancelled(failure)` and `githubErrorKey(error)`, which give `signin.*` message keys
  - `ConfirmStep({ email, password, redirect? })`
  - `SignInPage({ redirect?, error? })`, `SignUpPage({ redirect? })` and `ForgotPasswordPage({ redirect? })`
  - `authClient` with the passkey client plugin

- [ ] **Step 1: Write the failing tests**

Create `src/features/auth/auth-error.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { authErrorKey, githubErrorKey, passkeyCancelled } from "./auth-error";

describe("authErrorKey", () => {
  it.each([
    ["INVALID_EMAIL_OR_PASSWORD", "wrongPassword"],
    ["EMAIL_NOT_VERIFIED", "notConfirmed"],
    ["PASSWORD_PAUSED", "passwordPaused"],
    ["PASSWORD_TOO_SHORT", "passwordLength"],
    ["PASSWORD_COMPROMISED", "passwordCompromised"],
    ["INVALID_OTP", "codeInvalid"],
    ["CODE_LIMIT", "codeLimit"],
    ["EMAIL_BUDGET", "emailBudget"],
    ["DEMO_ONLY", "demoOnly"],
    ["SESSION_NOT_FRESH", "signInAgain"],
    ["PASSKEY_LIMIT", "passkeyLimit"],
    ["PASSWORD_EXISTS", "passwordExists"],
    ["INVALID_PASSWORD", "currentPasswordWrong"],
  ])("names %s", (code, key) => {
    expect(authErrorKey({ status: 400, code })).toBe(key);
  });

  it("falls back to the per-IP limit, then to a general message", () => {
    expect(authErrorKey({ status: 429 })).toBe("tooManyAttempts");
    expect(authErrorKey({ status: 500, code: "SOMETHING_NEW" })).toBe(
      "somethingWrong"
    );
  });
});

describe("passkeyCancelled", () => {
  it("treats a closed passkey prompt as no error", () => {
    expect(passkeyCancelled({ code: "AUTH_CANCELLED" })).toBe(true);
    expect(passkeyCancelled({ code: "PASSKEY_LIMIT" })).toBe(false);
  });
});

describe("githubErrorKey", () => {
  it("explains why GitHub sign-in came back refused", () => {
    expect(githubErrorKey("account_not_linked")).toBe("githubNotLinked");
    expect(githubErrorKey("github_email_unverified")).toBe("githubUnverified");
    expect(githubErrorKey("state_mismatch")).toBe("githubFailed");
  });
});
```

Create `src/features/auth/auth-pages.test.tsx`:

```tsx
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { IntlProvider } from "use-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";
import { ForgotPasswordPage } from "./forgot-password-page";
import { SignInPage } from "./sign-in-page";
import { SignUpPage } from "./sign-up-page";

// Better Auth's client keeps its own fetch: each test says what it answers.
const auth = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  signUpEmail: vi.fn(),
  fetch: vi.fn(),
  requestReset: vi.fn(),
  resetPassword: vi.fn(),
  signInPasskey: vi.fn(),
  signInSocial: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: {
      email: auth.signInEmail,
      passkey: auth.signInPasskey,
      social: auth.signInSocial,
      emailOtp: vi.fn(),
    },
    signUp: { email: auth.signUpEmail },
    $fetch: auth.fetch,
    emailOtp: {
      requestPasswordReset: auth.requestReset,
      resetPassword: auth.resetPassword,
      sendVerificationOtp: vi.fn(),
    },
  },
}));

const ok = { data: {}, error: null };
const refused = (code: string, status = 400) => ({
  data: null,
  error: { code, status, message: "refused" },
});

/** /api/me: signed out until a sign-in succeeds, and whether GitHub is on. */
function fakeMe({ github = false } = {}) {
  const state = { signedIn: false };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/me") {
        return Response.json({
          success: true,
          data: {
            user: state.signedIn
              ? {
                  id: "u1",
                  name: "",
                  email: "sam@studio.dev",
                  sessionStartedAt: new Date().toISOString(),
                }
              : null,
            workspaces: [],
            signIn: { github },
          },
        });
      }
      return new Response("not faked", { status: 500 });
    })
  );
  return state;
}

/** Renders the page and waits for the router to show it. */
async function renderPage(page: ReactNode) {
  const root = createRootRoute({ component: Outlet });
  const routeTree = root.addChildren([
    createRoute({
      getParentRoute: () => root,
      path: "/",
      component: () => page,
    }),
    createRoute({
      getParentRoute: () => root,
      path: "/new-workspace",
      component: () => <p>New workspace page</p>,
    }),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <IntlProvider locale="en" messages={en} timeZone="UTC">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </IntlProvider>
  );
  await screen.findByRole("heading", { level: 1 });
}

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const press = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  for (const fn of Object.values(auth)) fn.mockReset();
  auth.signInPasskey.mockResolvedValue(refused("AUTH_CANCELLED"));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SignInPage", () => {
  it("signs in with a password, then goes on to make a workspace", async () => {
    const me = fakeMe();
    auth.signInEmail.mockImplementation(async () => {
      me.signedIn = true;
      return ok;
    });
    await renderPage(<SignInPage />);

    type("Email", "sam@studio.dev");
    type("Password", "correct horse battery");
    press("Sign in");

    expect(await screen.findByText("New workspace page")).toBeTruthy();
    expect(auth.signInEmail).toHaveBeenCalledWith({
      email: "sam@studio.dev",
      password: "correct horse battery",
    });
  });

  it("says when the email and password don't match", async () => {
    fakeMe();
    auth.signInEmail.mockResolvedValue(
      refused("INVALID_EMAIL_OR_PASSWORD", 401)
    );
    await renderPage(<SignInPage />);
    type("Email", "sam@studio.dev");
    type("Password", "not it");
    press("Sign in");
    expect(
      await screen.findByText("That email and password don't match.")
    ).toBeTruthy();
  });

  it("confirms an unconfirmed account, sending the password along with the code", async () => {
    const me = fakeMe();
    auth.signInEmail.mockResolvedValue(refused("EMAIL_NOT_VERIFIED", 403));
    auth.signUpEmail.mockResolvedValue(ok);
    auth.fetch.mockImplementation(async () => {
      me.signedIn = true;
      return ok;
    });
    await renderPage(<SignInPage />);

    type("Email", "sam@studio.dev");
    type("Password", "correct horse battery");
    press("Sign in");
    fireEvent.click(
      await screen.findByRole("button", { name: "Send a new code" })
    );

    expect(
      await screen.findByText(/We sent a code to sam@studio.dev/)
    ).toBeTruthy();
    expect(auth.signUpEmail).toHaveBeenCalledWith({
      email: "sam@studio.dev",
      password: "correct horse battery",
      name: "",
    });
    type("6-digit code", "123456");
    press("Confirm");

    expect(await screen.findByText("New workspace page")).toBeTruthy();
    expect(auth.fetch).toHaveBeenCalledWith("/email-otp/verify-email", {
      method: "POST",
      body: {
        email: "sam@studio.dev",
        otp: "123456",
        password: "correct horse battery",
      },
    });
  });

  it("switches to an emailed code", async () => {
    fakeMe();
    await renderPage(<SignInPage />);
    press("Email me a code instead");
    expect(
      await screen.findByRole("button", { name: "Send code" })
    ).toBeTruthy();
  });

  it("offers GitHub only when the server has it, and comes back here", async () => {
    fakeMe({ github: true });
    await renderPage(<SignInPage redirect="/acme" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Continue with GitHub" })
    );
    expect(auth.signInSocial).toHaveBeenCalledWith({
      provider: "github",
      callbackURL: "/signin?redirect=%2Facme",
      errorCallbackURL: "/signin",
    });
  });

  it("has no GitHub button when the server has no GitHub secrets", async () => {
    fakeMe({ github: false });
    await renderPage(<SignInPage />);
    await screen.findByRole("button", { name: "Sign in with a passkey" });
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Continue with GitHub" })
      ).toBeNull()
    );
  });

  it("explains why GitHub sign-in came back refused", async () => {
    fakeMe();
    await renderPage(<SignInPage error="github_email_unverified" />);
    expect(
      await screen.findByText(/GitHub hasn't verified this account's email/)
    ).toBeTruthy();
  });

  it("says nothing when the passkey prompt is closed, and explains a failure", async () => {
    fakeMe();
    await renderPage(<SignInPage />);
    press("Sign in with a passkey");
    await waitFor(() => expect(auth.signInPasskey).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();

    auth.signInPasskey.mockResolvedValue(refused("SOMETHING_ELSE"));
    press("Sign in with a passkey");
    expect(await screen.findByText(/That passkey didn't work/)).toBeTruthy();
  });
});

describe("SignUpPage", () => {
  it("makes the account, then confirms it with the code and the password", async () => {
    const me = fakeMe();
    auth.signUpEmail.mockResolvedValue(ok);
    auth.fetch.mockImplementation(async () => {
      me.signedIn = true;
      return ok;
    });
    await renderPage(<SignUpPage />);

    type("Email", "sam@studio.dev");
    type("Password", "correct horse battery");
    press("Create account");
    await screen.findByLabelText("6-digit code");
    type("6-digit code", "654321");
    press("Confirm");

    expect(await screen.findByText("New workspace page")).toBeTruthy();
    expect(auth.fetch).toHaveBeenCalledWith(
      "/email-otp/verify-email",
      expect.objectContaining({
        body: {
          email: "sam@studio.dev",
          otp: "654321",
          password: "correct horse battery",
        },
      })
    );
  });

  it("refuses a password shorter than 8 characters before asking the server", async () => {
    fakeMe();
    await renderPage(<SignUpPage />);
    type("Email", "sam@studio.dev");
    type("Password", "short");
    press("Create account");
    await screen.findByRole("button", { name: "Create account" });
    await waitFor(() => expect(auth.signUpEmail).not.toHaveBeenCalled());
  });

  it("explains a leaked password", async () => {
    fakeMe();
    auth.signUpEmail.mockResolvedValue(refused("PASSWORD_COMPROMISED"));
    await renderPage(<SignUpPage />);
    type("Email", "sam@studio.dev");
    type("Password", "password1234");
    press("Create account");
    expect(
      await screen.findByText(/appears in a known data breach/)
    ).toBeTruthy();
  });
});

describe("ForgotPasswordPage", () => {
  it("emails a code, sets the new password, then signs in with it", async () => {
    const me = fakeMe();
    auth.requestReset.mockResolvedValue(ok);
    auth.resetPassword.mockResolvedValue(ok);
    auth.signInEmail.mockImplementation(async () => {
      me.signedIn = true;
      return ok;
    });
    await renderPage(<ForgotPasswordPage />);

    type("Email", "sam@studio.dev");
    press("Send code");
    expect(
      await screen.findByText(/If sam@studio.dev has a Pano account/)
    ).toBeTruthy();
    type("6-digit code", "111222");
    type("New password", "a brand new password");
    press("Set new password");

    expect(await screen.findByText("New workspace page")).toBeTruthy();
    expect(auth.resetPassword).toHaveBeenCalledWith({
      email: "sam@studio.dev",
      otp: "111222",
      password: "a brand new password",
    });
    expect(auth.signInEmail).toHaveBeenCalledWith({
      email: "sam@studio.dev",
      password: "a brand new password",
    });
  });
});
```

In `shared/slug.test.ts`, replace:

```ts
});

describe("isReservedSlug", () => {
  it.each(["api", "signin", "new-workspace", "p", "demo", "pano", "invite"])(
    "reserves %s",
    (slug) => {
      expect(isReservedSlug(slug)).toBe(true);
    }
  );

  it("leaves ordinary names free", () => {
    expect(isReservedSlug("acme")).toBe(false);
```

with:

```ts
});

describe("isReservedSlug", () => {
  it.each([
    "api",
    "signin",
    "signup",
    "forgot-password",
    "account",
    "new-workspace",
    "p",
    "demo",
    "pano",
    "invite",
  ])("reserves %s", (slug) => {
    expect(isReservedSlug(slug)).toBe(true);
  });

  it("leaves ordinary names free", () => {
    expect(isReservedSlug("acme")).toBe(false);
```

- [ ] **Step 2: Run them to watch them fail**

Run: `bunx vitest run src/features/auth shared/slug.test.ts`
Expected: FAIL, `Test Files  3 failed (3)`, `Tests  2 failed | 17 passed (19)`.
- `auth-error.test.ts` can't find `./auth-error`.
- `auth-pages.test.tsx` can't resolve `./sign-up-page`.
- `forgot-password` and `account` aren't reserved yet.

- [ ] **Step 3: Reserve the new top-level addresses, and add the text**

In `shared/slug.ts`, replace:

```ts
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "about",
  "admin",
  "api",
  "app",
```

with:

```ts
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "about",
  "account",
  "admin",
  "api",
  "app",
```

In the same file, replace:

```ts
  "cdn-cgi",
  "demo",
  "docs",
  "help",
  "invite",
  "login",
```

with:

```ts
  "cdn-cgi",
  "demo",
  "docs",
  "forgot-password",
  "help",
  "invite",
  "login",
```

In `src/i18n/messages/en.json`, replace:

```json
    "useAnotherEmail": "Use a different email",
    "codeLimit": "Too many codes went to this address. Try again in a few minutes.",
    "emailBudget": "Pano has sent all the email it can today. Try again tomorrow.",
    "useLatestCode": "That address has had three codes in the last ten minutes. Enter the latest one, or ask for a new code in a few minutes."
  },
  "newWorkspace": {
    "title": "Create your workspace",
```

with:

```json
    "useAnotherEmail": "Use a different email",
    "codeLimit": "Too many codes went to this address. Try again in a few minutes.",
    "emailBudget": "Pano has sent all the email it can today. Try again tomorrow.",
    "useLatestCode": "That address has had three codes in the last ten minutes. Enter the latest one, or ask for a new code in a few minutes.",
    "passwordLabel": "Password",
    "forgotPassword": "Forgot password?",
    "useCode": "Email me a code instead",
    "usePassword": "Sign in with a password instead",
    "otherWays": "Or",
    "github": "Continue with GitHub",
    "passkey": "Sign in with a passkey",
    "newHere": "New here?",
    "createAccount": "Create an account",
    "confirmFirst": "Confirm your email address first: enter the code we send you.",
    "sendNewCode": "Send a new code",
    "newCodeSent": "We sent a new code.",
    "confirmSentTo": "We sent a code to {email}. Enter it to confirm your address.",
    "confirm": "Confirm",
    "wrongPassword": "That email and password don't match.",
    "notConfirmed": "This address isn't confirmed yet.",
    "passwordPaused": "Too many wrong passwords for this address. Sign in with an email code, or try again in an hour.",
    "passwordLength": "Use 8 to 128 characters.",
    "passwordCompromised": "This password appears in a known data breach. Choose another one.",
    "demoOnly": "Demo accounts can't do this.",
    "signInAgain": "For your security, sign in again first.",
    "passkeyLimit": "You have 10 passkeys, the most an account can have. Remove one first.",
    "passwordExists": "This account already has a password.",
    "currentPasswordWrong": "Your current password isn't right.",
    "passkeyFailed": "That passkey didn't work. Try again, or sign in another way.",
    "somethingWrong": "Something went wrong. Try again in a moment.",
    "githubNotLinked": "This email already has a Pano account that GitHub can't join yet. Sign in with an email code, then connect GitHub on your account page.",
    "githubUnverified": "GitHub hasn't verified this account's email address. Verify it on GitHub, or sign in another way.",
    "githubFailed": "GitHub sign-in didn't work. Try again, or sign in another way."
  },
  "newWorkspace": {
    "title": "Create your workspace",
```

In the same file, replace:

```json
    "join": "Join {workspace}",
    "onTeam": "You're on {workspace}'s team.",
    "open": "Open {workspace}"
  }
}
```

with:

```json
    "join": "Join {workspace}",
    "onTeam": "You're on {workspace}'s team.",
    "open": "Open {workspace}"
  },
  "signup": {
    "title": "Create your Pano account",
    "intro": "Use your email and a password. We'll send a code to confirm the address.",
    "passwordHint": "8 to 128 characters.",
    "create": "Create account",
    "haveAccount": "Already have an account?",
    "signIn": "Sign in"
  },
  "forgot": {
    "title": "Reset your password",
    "intro": "Enter your email and we'll send you a code to choose a new password.",
    "send": "Send code",
    "sentTo": "If {email} has a Pano account, we sent it a code. It expires in 5 minutes.",
    "newPassword": "New password",
    "reset": "Set new password",
    "back": "Back to sign in"
  }
}
```

In `src/i18n/messages/tr.json`, replace:

```json
    "useAnotherEmail": "Başka bir e-posta kullan",
    "codeLimit": "Bu adrese çok fazla kod gönderildi. Birkaç dakika sonra tekrar deneyin.",
    "emailBudget": "Pano bugün gönderebileceği tüm e-postaları gönderdi. Yarın tekrar deneyin.",
    "useLatestCode": "Bu adrese son on dakikada üç kod gönderildi. En son geleni girin ya da birkaç dakika sonra yeni kod isteyin."
  },
  "newWorkspace": {
    "title": "Çalışma alanınızı oluşturun",
```

with:

```json
    "useAnotherEmail": "Başka bir e-posta kullan",
    "codeLimit": "Bu adrese çok fazla kod gönderildi. Birkaç dakika sonra tekrar deneyin.",
    "emailBudget": "Pano bugün gönderebileceği tüm e-postaları gönderdi. Yarın tekrar deneyin.",
    "useLatestCode": "Bu adrese son on dakikada üç kod gönderildi. En son geleni girin ya da birkaç dakika sonra yeni kod isteyin.",
    "passwordLabel": "Şifre",
    "forgotPassword": "Şifrenizi mi unuttunuz?",
    "useCode": "Bunun yerine bana kod gönder",
    "usePassword": "Bunun yerine şifreyle giriş yap",
    "otherWays": "Ya da",
    "github": "GitHub ile devam et",
    "passkey": "Geçiş anahtarıyla giriş yap",
    "newHere": "Yeni misiniz?",
    "createAccount": "Hesap oluşturun",
    "confirmFirst": "Önce e-posta adresinizi onaylayın: gönderdiğimiz kodu girin.",
    "sendNewCode": "Yeni kod gönder",
    "newCodeSent": "Yeni bir kod gönderdik.",
    "confirmSentTo": "{email} adresine bir kod gönderdik. Adresinizi onaylamak için girin.",
    "confirm": "Onayla",
    "wrongPassword": "Bu e-posta ve şifre eşleşmiyor.",
    "notConfirmed": "Bu adres henüz onaylanmadı.",
    "passwordPaused": "Bu adres için çok fazla yanlış şifre girildi. E-posta koduyla giriş yapın ya da bir saat sonra yeniden deneyin.",
    "passwordLength": "8 ile 128 karakter arasında olmalı.",
    "passwordCompromised": "Bu şifre bilinen bir veri sızıntısında yer alıyor. Başka bir şifre seçin.",
    "demoOnly": "Demo hesapları bunu yapamaz.",
    "signInAgain": "Güvenliğiniz için önce yeniden giriş yapın.",
    "passkeyLimit": "10 geçiş anahtarınız var; bir hesapta en fazla bu kadar olabilir. Önce birini kaldırın.",
    "passwordExists": "Bu hesabın zaten bir şifresi var.",
    "currentPasswordWrong": "Mevcut şifreniz doğru değil.",
    "passkeyFailed": "Bu geçiş anahtarı işe yaramadı. Yeniden deneyin ya da başka bir yolla giriş yapın.",
    "somethingWrong": "Bir şeyler ters gitti. Biraz sonra yeniden deneyin.",
    "githubNotLinked": "Bu e-postanın, GitHub'ın henüz bağlanamadığı bir Pano hesabı var. E-posta koduyla giriş yapın, ardından hesap sayfanızdan GitHub'ı bağlayın.",
    "githubUnverified": "GitHub bu hesabın e-posta adresini doğrulamamış. Adresi GitHub'da doğrulayın ya da başka bir yolla giriş yapın.",
    "githubFailed": "GitHub ile giriş olmadı. Yeniden deneyin ya da başka bir yolla giriş yapın."
  },
  "newWorkspace": {
    "title": "Çalışma alanınızı oluşturun",
```

In the same file, replace:

```json
    "join": "{workspace} ekibine katıl",
    "onTeam": "{workspace} ekibindesiniz.",
    "open": "{workspace} panosunu açın"
  }
}
```

with:

```json
    "join": "{workspace} ekibine katıl",
    "onTeam": "{workspace} ekibindesiniz.",
    "open": "{workspace} panosunu açın"
  },
  "signup": {
    "title": "Pano hesabınızı oluşturun",
    "intro": "E-postanızı ve bir şifre kullanın. Adresi onaylamak için bir kod göndereceğiz.",
    "passwordHint": "8 ile 128 karakter arası.",
    "create": "Hesap oluştur",
    "haveAccount": "Zaten hesabınız var mı?",
    "signIn": "Giriş yapın"
  },
  "forgot": {
    "title": "Şifrenizi sıfırlayın",
    "intro": "E-postanızı girin, yeni bir şifre belirlemeniz için size bir kod gönderelim.",
    "send": "Kod gönder",
    "sentTo": "{email} adresinin bir Pano hesabı varsa ona bir kod gönderdik. Kod 5 dakika içinde geçersiz olur.",
    "newPassword": "Yeni şifre",
    "reset": "Yeni şifreyi kaydet",
    "back": "Girişe dön"
  }
}
```

- [ ] **Step 4: The building blocks**

Replace the whole of `src/lib/auth-client.ts` with:

```ts
import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/client";
import { emailOTPClient } from "better-auth/client/plugins";

/**
 * Better Auth's own routes (codes, passwords, passkeys, GitHub, sign out).
 * They answer in Better Auth's JSON, so they go through this client, not
 * `unwrap`.
 */
export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [emailOTPClient(), passkeyClient()],
});
```

Create `src/features/auth/auth-error.ts`:

```ts
/** A `signin.*` message for a refusal from Better Auth or Pano. */
export type AuthErrorKey =
  | "wrongPassword"
  | "notConfirmed"
  | "passwordPaused"
  | "passwordLength"
  | "passwordCompromised"
  | "codeInvalid"
  | "codeLimit"
  | "emailBudget"
  | "tooManyAttempts"
  | "sendFailed"
  | "demoOnly"
  | "signInAgain"
  | "passkeyLimit"
  | "passwordExists"
  | "currentPasswordWrong"
  | "passkeyFailed"
  | "somethingWrong";

/**
 * Better Auth's client puts the response's JSON on its error, so both its
 * own codes and Pano's arrive in `code`. Better Auth's English messages are
 * never shown.
 */
export function authErrorKey(failure: {
  status?: number;
  code?: unknown;
}): AuthErrorKey {
  switch (failure.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "wrongPassword";
    case "EMAIL_NOT_VERIFIED":
      return "notConfirmed";
    case "PASSWORD_PAUSED":
      return "passwordPaused";
    case "PASSWORD_TOO_SHORT":
    case "PASSWORD_TOO_LONG":
      return "passwordLength";
    case "PASSWORD_COMPROMISED":
      return "passwordCompromised";
    case "INVALID_OTP":
    case "OTP_EXPIRED":
    case "TOO_MANY_ATTEMPTS":
      return "codeInvalid";
    case "CODE_LIMIT":
      return "codeLimit";
    case "EMAIL_BUDGET":
      return "emailBudget";
    case "INTERNAL_ERROR":
      return "sendFailed";
    case "DEMO_ONLY":
      return "demoOnly";
    case "SESSION_NOT_FRESH":
      return "signInAgain";
    case "PASSKEY_LIMIT":
      return "passkeyLimit";
    case "PASSWORD_EXISTS":
    case "PASSWORD_ALREADY_SET":
      return "passwordExists";
    case "INVALID_PASSWORD":
      return "currentPasswordWrong";
  }
  return failure.status === 429 ? "tooManyAttempts" : "somethingWrong";
}

/** A passkey prompt the person closed is no error worth showing. */
export function passkeyCancelled(failure: object) {
  const code = "code" in failure ? failure.code : undefined;
  return code === "AUTH_CANCELLED" || code === "ERROR_CEREMONY_ABORTED";
}

/** A `signin.*` message for the `?error=` GitHub sign-in came back with. */
export function githubErrorKey(error: string) {
  if (error === "account_not_linked") return "githubNotLinked" as const;
  if (error === "github_email_unverified") return "githubUnverified" as const;
  return "githubFailed" as const;
}
```

Create `src/features/auth/after-sign-in.ts`:

```ts
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { safeRedirect } from "@/lib/redirect";
import { meQueryOptions } from "@/lib/session";

/**
 * Where a person goes once signed in, however they signed in: the page that
 * sent them to sign in, else their workspace, else making one. Stable across
 * renders, so effects can depend on it.
 */
export function useAfterSignIn() {
  const router = useRouter();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useCallback(
    async (redirectTo?: string) => {
      const me = await queryClient.fetchQuery({
        ...meQueryOptions,
        staleTime: 0,
      });
      const redirect = safeRedirect(redirectTo);
      const workspace = me.workspaces[0];
      if (redirect) router.history.push(redirect);
      else if (workspace) {
        await navigate({ to: "/$ws", params: { ws: workspace.slug } });
      } else await navigate({ to: "/new-workspace" });
    },
    [router, navigate, queryClient]
  );
}
```

Create `src/features/auth/confirm-step.tsx`:

```tsx
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { codeFormSchema } from "@/shared/schemas";
import { useAfterSignIn } from "./after-sign-in";
import { authErrorKey } from "./auth-error";

/**
 * Asks for a new account's confirmation code. The code goes back with the
 * password typed a step earlier: without it the server confirms the address
 * but keeps no password, so someone who signed up with another person's
 * address never ends up with a way into their account.
 */
export function ConfirmStep({
  email,
  password,
  redirect,
}: {
  email: string;
  password: string;
  redirect?: string;
}) {
  const t = useTranslations("signin");
  const afterSignIn = useAfterSignIn();
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const form = useForm({
    defaultValues: { code: "" },
    validators: { onSubmit: codeFormSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      const { error: failure } = await authClient.$fetch(
        "/email-otp/verify-email",
        {
          method: "POST",
          body: { email, otp: value.code.trim(), password },
        }
      );
      if (failure) {
        setError(t(authErrorKey(failure)));
        return;
      }
      await afterSignIn(redirect);
    },
  });

  // A new code comes from signing up again: it replaces the sign-up that
  // was waiting, with the same password.
  async function sendNewCode() {
    setError(null);
    setResent(false);
    const { error: failure } = await authClient.signUp.email({
      email,
      password,
      name: "",
    });
    if (failure) setError(t(authErrorKey(failure)));
    else setResent(true);
  }

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <p className="text-muted-foreground text-sm">
        {t("confirmSentTo", { email })}
      </p>
      <form.Field name="code">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor={field.name}>{t("codeLabel")}</Label>
            <Input
              id={field.name}
              name={field.name}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
            <FieldError errors={field.state.meta.errors} />
          </div>
        )}
      </form.Field>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      {resent && (
        <p className="text-sm" role="status">
          {t("newCodeSent")}
        </p>
      )}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" disabled={isSubmitting}>
            {t("confirm")}
          </Button>
        )}
      </form.Subscribe>
      <Button type="button" variant="link" onClick={sendNewCode}>
        {t("sendNewCode")}
      </Button>
    </form>
  );
}
```

`code-sign-in.tsx` is today's email-code flow from `src/routes/signin.tsx`, moved. Its code step now ends with `useAfterSignIn`.

Create `src/features/auth/code-sign-in.tsx`:

```tsx
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { afterRefusedCode } from "@/lib/sign-in-error";
import { codeFormSchema, emailFormSchema } from "@/shared/schemas";
import { useAfterSignIn } from "./after-sign-in";

/**
 * Sign in with an emailed code: the email, then the code. A new address
 * gets an account the same way.
 */
export function CodeSignIn({ redirect }: { redirect?: string }) {
  const [sent, setSent] = useState<{ email: string; note?: Note } | null>(null);
  return sent === null ? (
    <EmailStep onSent={(email, note) => setSent({ email, note })} />
  ) : (
    <CodeStep
      email={sent.email}
      note={sent.note}
      redirect={redirect}
      onBack={() => setSent(null)}
    />
  );
}

/** Why the code step asks for a code sent earlier. */
type Note = "useLatestCode";

function EmailStep({
  onSent,
}: {
  onSent: (email: string, note?: Note) => void;
}) {
  const t = useTranslations("signin");
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { email: "" },
    validators: { onSubmit: emailFormSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      const { error: failure } = await authClient.emailOtp.sendVerificationOtp({
        email: value.email,
        type: "sign-in",
      });
      if (failure) {
        const next = afterRefusedCode(failure);
        if (next.step === "code") onSent(value.email, next.note);
        else setError(t(next.error));
        return;
      }
      onSent(value.email);
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
      <p className="text-muted-foreground text-sm">{t("emailIntro")}</p>
      <form.Field name="email">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor={field.name}>{t("emailLabel")}</Label>
            <Input
              id={field.name}
              name={field.name}
              type="email"
              autoComplete="email"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
            <FieldError errors={field.state.meta.errors} />
          </div>
        )}
      </form.Field>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" disabled={isSubmitting}>
            {t("sendCode")}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}

function CodeStep({
  email,
  note,
  redirect,
  onBack,
}: {
  email: string;
  note?: Note;
  redirect?: string;
  onBack: () => void;
}) {
  const t = useTranslations("signin");
  const afterSignIn = useAfterSignIn();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { code: "" },
    validators: { onSubmit: codeFormSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      const { error: failure } = await authClient.signIn.emailOtp({
        email,
        otp: value.code.trim(),
      });
      if (failure) {
        setError(
          failure.status === 429 ? t("tooManyAttempts") : t("codeInvalid")
        );
        return;
      }
      await afterSignIn(redirect);
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
      <p className="text-muted-foreground text-sm">
        {t("codeSentTo", { email })}
      </p>
      {note && (
        <p className="text-sm" role="status">
          {t(note)}
        </p>
      )}
      <form.Field name="code">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor={field.name}>{t("codeLabel")}</Label>
            <Input
              id={field.name}
              name={field.name}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
            <FieldError errors={field.state.meta.errors} />
          </div>
        )}
      </form.Field>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" disabled={isSubmitting}>
            {t("verify")}
          </Button>
        )}
      </form.Subscribe>
      <Button type="button" variant="link" onClick={onBack}>
        {t("useAnotherEmail")}
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: The pages**

Create `src/features/auth/sign-in-page.tsx`:

```tsx
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslations } from "use-intl";
import { z } from "zod";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { meQueryOptions } from "@/lib/session";
import { useAfterSignIn } from "./after-sign-in";
import { authErrorKey, githubErrorKey, passkeyCancelled } from "./auth-error";
import { CodeSignIn } from "./code-sign-in";
import { ConfirmStep } from "./confirm-step";

const passwordSignInSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

/**
 * Sign in to Pano: a password by default, an emailed code instead, a passkey
 * or GitHub. `error` is what GitHub sign-in came back with.
 */
export function SignInPage({
  redirect,
  error,
}: {
  redirect?: string;
  error?: string;
}) {
  const t = useTranslations("signin");
  const [mode, setMode] = useState<"password" | "code">("password");
  const [confirming, setConfirming] = useState<{
    email: string;
    password: string;
  } | null>(null);

  return (
    <main className="paper mx-6 my-16 flex flex-col gap-6 p-6 sm:mx-auto sm:max-w-sm sm:p-8">
      <h1 className="font-semibold text-2xl">{t("title")}</h1>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {t(githubErrorKey(error))}
        </p>
      )}
      {confirming ? (
        <ConfirmStep {...confirming} redirect={redirect} />
      ) : mode === "password" ? (
        <>
          <PasswordSignIn redirect={redirect} onUnconfirmed={setConfirming} />
          <Button type="button" variant="link" onClick={() => setMode("code")}>
            {t("useCode")}
          </Button>
        </>
      ) : (
        <>
          <CodeSignIn redirect={redirect} />
          <Button
            type="button"
            variant="link"
            onClick={() => setMode("password")}
          >
            {t("usePassword")}
          </Button>
        </>
      )}
      <OtherWays redirect={redirect} />
      <p className="text-muted-foreground text-sm">
        {t("newHere")}{" "}
        <Link to="/signup" search={{ redirect }} className="underline">
          {t("createAccount")}
        </Link>
      </p>
    </main>
  );
}

function PasswordSignIn({
  redirect,
  onUnconfirmed,
}: {
  redirect?: string;
  onUnconfirmed: (account: { email: string; password: string }) => void;
}) {
  const t = useTranslations("signin");
  const afterSignIn = useAfterSignIn();
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: passwordSignInSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      setUnconfirmed(false);
      const { error: failure } = await authClient.signIn.email(value);
      if (!failure) {
        await afterSignIn(redirect);
        return;
      }
      if (failure.code === "EMAIL_NOT_VERIFIED") setUnconfirmed(true);
      else setError(t(authErrorKey(failure)));
    },
  });

  // "Send a new code": signing up again with the same password replaces the
  // waiting sign-up and emails a fresh code.
  async function sendNewCode() {
    const { email, password } = form.state.values;
    const { error: failure } = await authClient.signUp.email({
      email,
      password,
      name: "",
    });
    if (failure) setError(t(authErrorKey(failure)));
    else onUnconfirmed({ email, password });
  }

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="email">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor={field.name}>{t("emailLabel")}</Label>
            <Input
              id={field.name}
              name={field.name}
              type="email"
              // "webauthn" lets the browser offer saved passkeys here.
              autoComplete="username webauthn"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
            <FieldError errors={field.state.meta.errors} />
          </div>
        )}
      </form.Field>
      <form.Field name="password">
        {(field) => (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor={field.name}>{t("passwordLabel")}</Label>
              <Link
                to="/forgot-password"
                search={{ redirect }}
                className="text-sm underline"
              >
                {t("forgotPassword")}
              </Link>
            </div>
            <Input
              id={field.name}
              name={field.name}
              type="password"
              autoComplete="current-password"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
            <FieldError errors={field.state.meta.errors} />
          </div>
        )}
      </form.Field>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      {unconfirmed && (
        <div className="flex flex-col gap-2" role="alert">
          <p className="text-sm">{t("confirmFirst")}</p>
          <Button type="button" variant="outline" onClick={sendNewCode}>
            {t("sendNewCode")}
          </Button>
        </div>
      )}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" disabled={isSubmitting}>
            {t("verify")}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}

/** A passkey, and GitHub when the server has it set up. */
function OtherWays({ redirect }: { redirect?: string }) {
  const t = useTranslations("signin");
  const me = useQuery(meQueryOptions);
  const afterSignIn = useAfterSignIn();
  const [error, setError] = useState<string | null>(null);

  // Browsers that can offer saved passkeys in the email field's suggestions
  // wait for the person to pick one there.
  useEffect(() => {
    let active = true;
    void (async () => {
      if (!(await conditionalPasskeys())) return;
      const { data } = await authClient.signIn.passkey({ autoFill: true });
      if (active && data) await afterSignIn(redirect);
    })();
    return () => {
      active = false;
    };
  }, [afterSignIn, redirect]);

  async function signInWithPasskey() {
    setError(null);
    const { error: failure } = await authClient.signIn.passkey();
    if (!failure) await afterSignIn(redirect);
    else if (!passkeyCancelled(failure)) setError(t("passkeyFailed"));
  }

  async function signInWithGitHub() {
    // GitHub sends the browser back here; signed in, this page moves on.
    const back = redirect
      ? `/signin?redirect=${encodeURIComponent(redirect)}`
      : "/signin";
    await authClient.signIn.social({
      provider: "github",
      callbackURL: back,
      errorCallbackURL: "/signin",
    });
  }

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <p className="text-muted-foreground text-sm">{t("otherWays")}</p>
      <Button type="button" variant="outline" onClick={signInWithPasskey}>
        {t("passkey")}
      </Button>
      {me.data?.signIn.github && (
        <Button type="button" variant="outline" onClick={signInWithGitHub}>
          {t("github")}
        </Button>
      )}
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

async function conditionalPasskeys() {
  if (typeof PublicKeyCredential === "undefined") return false;
  return (
    (await PublicKeyCredential.isConditionalMediationAvailable?.()) ?? false
  );
}
```

Create `src/features/auth/sign-up-page.tsx`:

```tsx
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { z } from "zod";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { passwordSchema } from "@/shared/password";
import { authErrorKey } from "./auth-error";
import { ConfirmStep } from "./confirm-step";

const signUpSchema = z.object({ email: z.email(), password: passwordSchema });

/** Create an account: an email and a password, then the emailed code. */
export function SignUpPage({ redirect }: { redirect?: string }) {
  const t = useTranslations("signup");
  const signin = useTranslations("signin");
  const [account, setAccount] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: signUpSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      const { error: failure } = await authClient.signUp.email({
        ...value,
        name: "",
      });
      if (failure) setError(signin(authErrorKey(failure)));
      else setAccount(value);
    },
  });

  return (
    <main className="paper mx-6 my-16 flex flex-col gap-6 p-6 sm:mx-auto sm:max-w-sm sm:p-8">
      <h1 className="font-semibold text-2xl">{t("title")}</h1>
      {account ? (
        <ConfirmStep {...account} redirect={redirect} />
      ) : (
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <p className="text-muted-foreground text-sm">{t("intro")}</p>
          <form.Field name="email">
            {(field) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor={field.name}>{signin("emailLabel")}</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  autoComplete="email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                <FieldError errors={field.state.meta.errors} />
              </div>
            )}
          </form.Field>
          <form.Field name="password">
            {(field) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor={field.name}>{signin("passwordLabel")}</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  autoComplete="new-password"
                  aria-describedby="password-hint"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                <p id="password-hint" className="text-muted-foreground text-xs">
                  {t("passwordHint")}
                </p>
                <FieldError errors={field.state.meta.errors} />
              </div>
            )}
          </form.Field>
          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting}>
                {t("create")}
              </Button>
            )}
          </form.Subscribe>
        </form>
      )}
      <p className="text-muted-foreground text-sm">
        {t("haveAccount")}{" "}
        <Link to="/signin" search={{ redirect }} className="underline">
          {t("signIn")}
        </Link>
      </p>
    </main>
  );
}
```

Create `src/features/auth/forgot-password-page.tsx`:

```tsx
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { passwordSchema } from "@/shared/password";
import { codeFormSchema, emailFormSchema } from "@/shared/schemas";
import { useAfterSignIn } from "./after-sign-in";
import { authErrorKey } from "./auth-error";

const resetSchema = codeFormSchema.extend({ password: passwordSchema });

/**
 * Forgot password: the email, then the emailed code and a new password.
 * The reset signs every device out; the new password then signs this one in.
 */
export function ForgotPasswordPage({ redirect }: { redirect?: string }) {
  const t = useTranslations("forgot");
  const [email, setEmail] = useState<string | null>(null);
  return (
    <main className="paper mx-6 my-16 flex flex-col gap-6 p-6 sm:mx-auto sm:max-w-sm sm:p-8">
      <h1 className="font-semibold text-2xl">{t("title")}</h1>
      {email === null ? (
        <RequestStep onSent={setEmail} />
      ) : (
        <ResetStep email={email} redirect={redirect} />
      )}
      <Link to="/signin" search={{ redirect }} className="text-sm underline">
        {t("back")}
      </Link>
    </main>
  );
}

function RequestStep({ onSent }: { onSent: (email: string) => void }) {
  const t = useTranslations("forgot");
  const signin = useTranslations("signin");
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { email: "" },
    validators: { onSubmit: emailFormSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      const { error: failure } = await authClient.emailOtp.requestPasswordReset(
        { email: value.email }
      );
      if (failure) setError(signin(authErrorKey(failure)));
      else onSent(value.email);
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
      <p className="text-muted-foreground text-sm">{t("intro")}</p>
      <form.Field name="email">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor={field.name}>{signin("emailLabel")}</Label>
            <Input
              id={field.name}
              name={field.name}
              type="email"
              autoComplete="email"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
            <FieldError errors={field.state.meta.errors} />
          </div>
        )}
      </form.Field>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" disabled={isSubmitting}>
            {t("send")}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}

function ResetStep({ email, redirect }: { email: string; redirect?: string }) {
  const t = useTranslations("forgot");
  const signin = useTranslations("signin");
  const afterSignIn = useAfterSignIn();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { code: "", password: "" },
    validators: { onSubmit: resetSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      const { error: failure } = await authClient.emailOtp.resetPassword({
        email,
        otp: value.code.trim(),
        password: value.password,
      });
      if (failure) {
        setError(signin(authErrorKey(failure)));
        return;
      }
      const { error: signInFailure } = await authClient.signIn.email({
        email,
        password: value.password,
      });
      if (signInFailure) setError(signin(authErrorKey(signInFailure)));
      else await afterSignIn(redirect);
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
      <p className="text-muted-foreground text-sm">{t("sentTo", { email })}</p>
      <form.Field name="code">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor={field.name}>{signin("codeLabel")}</Label>
            <Input
              id={field.name}
              name={field.name}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
            <FieldError errors={field.state.meta.errors} />
          </div>
        )}
      </form.Field>
      <form.Field name="password">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor={field.name}>{t("newPassword")}</Label>
            <Input
              id={field.name}
              name={field.name}
              type="password"
              autoComplete="new-password"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
            <FieldError errors={field.state.meta.errors} />
          </div>
        )}
      </form.Field>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" disabled={isSubmitting}>
            {t("reset")}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
```

- [ ] **Step 6: The routes**

Replace the whole of `src/routes/signin.tsx` with:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { SignInPage } from "@/features/auth/sign-in-page";
import { safeRedirect } from "@/lib/redirect";
import { meQueryOptions } from "@/lib/session";

export const Route = createFileRoute("/signin")({
  validateSearch: z.object({
    redirect: z.string().optional().catch(undefined),
    // Set by GitHub sign-in when it came back refused.
    error: z.string().optional().catch(undefined),
  }),
  // Someone already signed in moves on, which is also how GitHub sign-in
  // ends: GitHub sends the browser back here.
  beforeLoad: async ({ context, search }) => {
    const me = await context.queryClient
      .ensureQueryData(meQueryOptions)
      .catch(() => null);
    if (!me?.user) return;
    const target = safeRedirect(search.redirect);
    if (target) throw redirect({ href: target });
    const workspace = me.workspaces[0];
    if (workspace) {
      throw redirect({ to: "/$ws", params: { ws: workspace.slug } });
    }
    throw redirect({ to: "/new-workspace" });
  },
  component: SignIn,
});

function SignIn() {
  const { redirect, error } = Route.useSearch();
  return <SignInPage redirect={redirect} error={error} />;
}
```

Create `src/routes/signup.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SignUpPage } from "@/features/auth/sign-up-page";

export const Route = createFileRoute("/signup")({
  validateSearch: z.object({
    redirect: z.string().optional().catch(undefined),
  }),
  component: SignUp,
});

function SignUp() {
  const { redirect } = Route.useSearch();
  return <SignUpPage redirect={redirect} />;
}
```

Create `src/routes/forgot-password.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ForgotPasswordPage } from "@/features/auth/forgot-password-page";

export const Route = createFileRoute("/forgot-password")({
  validateSearch: z.object({
    redirect: z.string().optional().catch(undefined),
  }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const { redirect } = Route.useSearch();
  return <ForgotPasswordPage redirect={redirect} />;
}
```

Run: `bun run build && git diff --stat src/routeTree.gen.ts`
Expected: the build passes, and the generated route tree gains `/signup` and `/forgot-password`: `1 file changed, 42 insertions(+)`.

- [ ] **Step 7: Run them to watch them pass**

Run: `bunx vitest run src/features/auth shared/slug.test.ts`
Expected: PASS, `Tests  47 passed (47)`.

- [ ] **Step 8: Run the whole suite**

Run: `bun run typecheck && bun run check && bun run test`
Expected: typecheck and Biome clean; `Test Files  92 passed (92)`, `Tests  792 passed (792)`.

- [ ] **Step 9: Commit**

```bash
git add shared src
git commit -m "feat: sign in with a password, a code, a passkey or GitHub; create an account and confirm it with a code; forgot password; account and forgot-password are reserved addresses"
```

---

### Task 11: The account page

**Files:**
- Create in `src/features/account/`:
  - `account-page.tsx`, `account-page.test.tsx`
  - `device-name.ts`, `device-name.test.ts`
- Create: `src/routes/account.tsx`
- Modify: `src/components/site-header.tsx`, `src/lib/session.ts`, `src/i18n/messages/en.json`, `src/i18n/messages/tr.json`
- Generate: `src/routeTree.gen.ts`

**Interfaces:**
- Consumes:
  - `authErrorKey`, `githubErrorKey` and `passkeyCancelled` (Task 10)
  - `isSessionFresh` (Task 6)
  - `POST /api/me/password` (Task 6)
  - Better Auth's `listAccounts`, `changePassword`, `linkSocial`, `unlinkAccount` and the passkey client (Tasks 5, 7 and 8)
- Produces:
  - `AccountPage({ error? })` and `deviceName(userAgent)`
  - `setFirstPassword(password)` in `src/lib/session.ts`
  - the `/account` route

- [ ] **Step 1: Write the failing tests**

Create `src/features/account/device-name.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deviceName } from "./device-name";

describe("deviceName", () => {
  it.each([
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      "Safari on iPhone",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      "Chrome on macOS",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
      "Edge on Windows",
    ],
    [
      "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
      "Chrome on Android",
    ],
    [
      "Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0",
      "Firefox on Linux",
    ],
  ])("names %s", (userAgent, name) => {
    expect(deviceName(userAgent)).toBe(name);
  });

  it("falls back to a plain name", () => {
    expect(deviceName("curl/8.0")).toBe("Passkey");
  });
});
```

Create `src/features/account/account-page.test.tsx`:

```tsx
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { IntlProvider } from "use-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";
import { DEMO_EMAIL_DOMAIN } from "@/shared/demo";
import { AccountPage } from "./account-page";

const auth = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  listPasskeys: vi.fn(),
  addPasskey: vi.fn(),
  deletePasskey: vi.fn(),
  changePassword: vi.fn(),
  linkSocial: vi.fn(),
  unlinkAccount: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    listAccounts: auth.listAccounts,
    changePassword: auth.changePassword,
    linkSocial: auth.linkSocial,
    unlinkAccount: auth.unlinkAccount,
    signOut: auth.signOut,
    passkey: {
      listUserPasskeys: auth.listPasskeys,
      addPasskey: auth.addPasskey,
      deletePasskey: auth.deletePasskey,
    },
  },
}));

const HOUR = 60 * 60 * 1000;
const ok = (data: unknown = {}) => ({ data, error: null });

type Setup = {
  email?: string;
  /** Hours since this session signed in. */
  sessionAge?: number;
  github?: boolean;
  accounts?: { id: string; providerId: string }[];
  passkeys?: { id: string; name: string | null; createdAt: string }[];
};

/** /api/me and the routes this page calls, as the case needs them. */
function fakeServer({
  email = "sam@studio.dev",
  sessionAge = 1,
  github = true,
  accounts = [],
  passkeys = [],
}: Setup = {}) {
  const posted: unknown[] = [];
  auth.listAccounts.mockResolvedValue(ok(accounts));
  auth.listPasskeys.mockResolvedValue(ok(passkeys));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const reply = (data: unknown) => Response.json({ success: true, data });
      if (url.pathname === "/api/me" && (init?.method ?? "GET") === "GET") {
        return reply({
          user: {
            id: "u1",
            name: "Sam",
            email,
            sessionStartedAt: new Date(
              Date.now() - sessionAge * HOUR
            ).toISOString(),
          },
          workspaces: [],
          signIn: { github },
        });
      }
      if (url.pathname === "/api/me/password") {
        posted.push(JSON.parse(String(init?.body)));
        return reply({ password: true });
      }
      return new Response("not faked", { status: 500 });
    })
  );
  return { posted };
}

async function renderAccount(error?: string) {
  const root = createRootRoute({ component: Outlet });
  const routeTree = root.addChildren([
    createRoute({
      getParentRoute: () => root,
      path: "/",
      component: () => <AccountPage error={error} />,
    }),
    createRoute({
      getParentRoute: () => root,
      path: "/signin",
      component: () => <p>Sign-in page</p>,
    }),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <IntlProvider locale="en" messages={en} timeZone="UTC">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </IntlProvider>
  );
  await screen.findByRole("heading", { name: "Your account" });
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  for (const fn of Object.values(auth)) fn.mockReset();
  // jsdom has no WebAuthn; most cases act as a browser that has it.
  vi.stubGlobal("PublicKeyCredential", function PublicKeyCredential() {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AccountPage: password", () => {
  it("sets a first password for an account without one", async () => {
    const { posted } = fakeServer({ accounts: [] });
    await renderAccount();

    await screen.findByLabelText("New password");
    type("New password", "my first password");
    fireEvent.click(
      await screen.findByRole("button", { name: "Set a password" })
    );
    expect(await screen.findByText("Password set.")).toBeTruthy();
    expect(posted).toEqual([{ password: "my first password" }]);
  });

  it("changes a password, signing out the other devices", async () => {
    fakeServer({ accounts: [{ id: "a1", providerId: "credential" }] });
    auth.changePassword.mockResolvedValue(ok());
    await renderAccount();

    await screen.findByRole("button", { name: "Change password" });
    type("Current password", "old password!");
    type("New password", "a brand new password");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(
      await screen.findByText(
        "Password changed. Your other devices are signed out."
      )
    ).toBeTruthy();
    expect(auth.changePassword).toHaveBeenCalledWith({
      currentPassword: "old password!",
      newPassword: "a brand new password",
      revokeOtherSessions: true,
    });
  });

  it("says when the current password is wrong", async () => {
    fakeServer({ accounts: [{ id: "a1", providerId: "credential" }] });
    auth.changePassword.mockResolvedValue({
      data: null,
      error: { code: "INVALID_PASSWORD", status: 400 },
    });
    await renderAccount();
    await screen.findByRole("button", { name: "Change password" });
    type("Current password", "not it at all");
    type("New password", "a brand new password");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(
      await screen.findByText("Your current password isn't right.")
    ).toBeTruthy();
  });
});

describe("AccountPage: passkeys", () => {
  it("lists each passkey with its name and date, and removes one", async () => {
    fakeServer({
      passkeys: [
        {
          id: "pk1",
          name: "Safari on iPhone",
          createdAt: "2026-11-01T10:00:00Z",
        },
      ],
    });
    auth.deletePasskey.mockResolvedValue(ok());
    await renderAccount();

    expect(await screen.findByText("Safari on iPhone")).toBeTruthy();
    expect(screen.getByText("Added Nov 1, 2026")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(auth.deletePasskey).toHaveBeenCalledWith({ id: "pk1" })
    );
  });

  it("adds a passkey named after this browser", async () => {
    fakeServer();
    auth.addPasskey.mockResolvedValue(ok());
    await renderAccount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Add a passkey" })
    );
    await waitFor(() =>
      expect(auth.addPasskey).toHaveBeenCalledWith({ name: expect.any(String) })
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("explains the limit of 10", async () => {
    fakeServer();
    auth.addPasskey.mockResolvedValue({
      data: null,
      error: { code: "PASSKEY_LIMIT", status: 400 },
    });
    await renderAccount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Add a passkey" })
    );
    expect(
      await screen.findByText(/the most an account can have/)
    ).toBeTruthy();
  });

  it("says so in a browser that can't make passkeys", async () => {
    fakeServer();
    vi.stubGlobal("PublicKeyCredential", undefined);
    await renderAccount();
    expect(
      await screen.findByText("This browser can't make passkeys.")
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add a passkey" })).toBeNull();
  });
});

describe("AccountPage: GitHub", () => {
  it("connects GitHub, coming back to this page", async () => {
    fakeServer({ accounts: [] });
    await renderAccount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Connect GitHub" })
    );
    expect(auth.linkSocial).toHaveBeenCalledWith({
      provider: "github",
      callbackURL: "/account",
      errorCallbackURL: "/account",
    });
  });

  it("disconnects GitHub by the account Better Auth listed", async () => {
    fakeServer({ accounts: [{ id: "acc-gh", providerId: "github" }] });
    auth.unlinkAccount.mockResolvedValue(ok());
    await renderAccount();
    expect(
      await screen.findByText("Connected: you can sign in with GitHub.")
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() =>
      expect(auth.unlinkAccount).toHaveBeenCalledWith({ accountId: "acc-gh" })
    );
  });

  it("leaves GitHub out when the server has no GitHub secrets", async () => {
    fakeServer({ github: false });
    await renderAccount();
    await screen.findByRole("heading", { name: "Passkeys" });
    expect(screen.queryByRole("heading", { name: "GitHub" })).toBeNull();
  });

  it("explains why connecting GitHub came back refused", async () => {
    fakeServer();
    await renderAccount("account_not_linked");
    expect(await screen.findByText(/can't join yet/)).toBeTruthy();
  });
});

describe("AccountPage: who may change what", () => {
  it("asks for a fresh sign-in before adding a way to sign in", async () => {
    fakeServer({ sessionAge: 25, accounts: [] });
    auth.signOut.mockResolvedValue(ok());
    await renderAccount();

    await screen.findByRole("heading", { name: "Passkeys" });
    expect(screen.queryByRole("button", { name: "Add a passkey" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Connect GitHub" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Set a password" })).toBeNull();

    fireEvent.click(
      screen.getAllByRole("button", { name: "Sign in again" })[0]!
    );
    expect(await screen.findByText("Sign-in page")).toBeTruthy();
    expect(auth.signOut).toHaveBeenCalled();
  });

  it("shows demo guests a note and no controls", async () => {
    fakeServer({ email: `guest-1@${DEMO_EMAIL_DOMAIN}` });
    await renderAccount();
    expect(
      await screen.findByText(/Demo accounts can't add ways to sign in/)
    ).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `bunx vitest run src/features/account`
Expected: FAIL: neither `./device-name` nor `./account-page` exists; `Test Files  2 failed (2)`, `Tests  no tests`.

- [ ] **Step 3: The text, the device names and the client call**

In `src/i18n/messages/en.json`, replace:

```json
    "newPassword": "New password",
    "reset": "Set new password",
    "back": "Back to sign in"
  }
}
```

with:

```json
    "newPassword": "New password",
    "reset": "Set new password",
    "back": "Back to sign in"
  },
  "account": {
    "title": "Your account",
    "signedInAs": "Signed in as {email}",
    "nameHeading": "Name",
    "nameHelp": "Shown next to your requests and comments.",
    "save": "Save",
    "saved": "Saved.",
    "passwordHeading": "Password",
    "noPassword": "No password yet. Email codes always work.",
    "setPassword": "Set a password",
    "passwordSet": "Password set.",
    "currentPassword": "Current password",
    "newPassword": "New password",
    "changePassword": "Change password",
    "passwordChanged": "Password changed. Your other devices are signed out.",
    "passkeysHeading": "Passkeys",
    "passkeysHelp": "Sign in with your fingerprint, face or device PIN instead of a password.",
    "noPasskeys": "No passkeys yet.",
    "addPasskey": "Add a passkey",
    "removePasskey": "Remove",
    "addedOn": "Added {date}",
    "noWebAuthn": "This browser can't make passkeys.",
    "githubHeading": "GitHub",
    "githubConnected": "Connected: you can sign in with GitHub.",
    "githubNotConnected": "Not connected.",
    "connectGitHub": "Connect GitHub",
    "disconnectGitHub": "Disconnect",
    "signInAgain": "Adding or removing a way to sign in needs a sign-in from the last day.",
    "signInAgainButton": "Sign in again",
    "demo": "Demo accounts can't add ways to sign in. The demo resets every night."
  }
}
```

In `src/i18n/messages/tr.json`, replace:

```json
    "newPassword": "Yeni şifre",
    "reset": "Yeni şifreyi kaydet",
    "back": "Girişe dön"
  }
}
```

with:

```json
    "newPassword": "Yeni şifre",
    "reset": "Yeni şifreyi kaydet",
    "back": "Girişe dön"
  },
  "account": {
    "title": "Hesabınız",
    "signedInAs": "{email} olarak giriş yaptınız",
    "nameHeading": "Ad",
    "nameHelp": "İsteklerinizin ve yorumlarınızın yanında görünür.",
    "save": "Kaydet",
    "saved": "Kaydedildi.",
    "passwordHeading": "Şifre",
    "noPassword": "Henüz şifre yok. E-posta kodları her zaman işe yarar.",
    "setPassword": "Şifre belirle",
    "passwordSet": "Şifre belirlendi.",
    "currentPassword": "Mevcut şifre",
    "newPassword": "Yeni şifre",
    "changePassword": "Şifreyi değiştir",
    "passwordChanged": "Şifre değişti. Diğer cihazlarınızdan çıkış yapıldı.",
    "passkeysHeading": "Geçiş anahtarları",
    "passkeysHelp": "Şifre yerine parmak iziniz, yüzünüz ya da cihaz PIN'inizle giriş yapın.",
    "noPasskeys": "Henüz geçiş anahtarı yok.",
    "addPasskey": "Geçiş anahtarı ekle",
    "removePasskey": "Kaldır",
    "addedOn": "{date} tarihinde eklendi",
    "noWebAuthn": "Bu tarayıcı geçiş anahtarı oluşturamıyor.",
    "githubHeading": "GitHub",
    "githubConnected": "Bağlı: GitHub ile giriş yapabilirsiniz.",
    "githubNotConnected": "Bağlı değil.",
    "connectGitHub": "GitHub'ı bağla",
    "disconnectGitHub": "Bağlantıyı kes",
    "signInAgain": "Bir giriş yöntemi eklemek ya da kaldırmak için son bir gün içinde giriş yapmış olmanız gerekir.",
    "signInAgainButton": "Yeniden giriş yap",
    "demo": "Demo hesapları giriş yöntemi ekleyemez. Demo her gece sıfırlanır."
  }
}
```

Create `src/features/account/device-name.ts`:

```ts
const BROWSERS: [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/OPR\//, "Opera"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/CrOS/, "ChromeOS"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Windows/, "Windows"],
  [/Linux/, "Linux"],
];

/**
 * A passkey's name, from the browser that made it: "Safari on iPhone". It
 * helps tell passkeys apart on the account page; renaming is out of scope.
 */
export function deviceName(userAgent: string) {
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1];
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? "Passkey";
}
```

In `src/lib/session.ts`, replace:

```ts
  queryFn: async () => unwrap(await api.me.$get()),
  staleTime: 60_000,
});

/** Sets the signed-in person's display name. */
export async function updateMe(name: string) {
```

with:

```ts
  queryFn: async () => unwrap(await api.me.$get()),
  staleTime: 60_000,
});

/** A first password for an account made with email codes or GitHub. */
export async function setFirstPassword(password: string) {
  return unwrap(await api.me.password.$post({ json: { password } }));
}

/** Sets the signed-in person's display name. */
export async function updateMe(name: string) {
```

- [ ] **Step 4: The page, its route, and the header's link**

Create `src/features/account/account-page.tsx`:

```tsx
import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { z } from "zod";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  authErrorKey,
  githubErrorKey,
  passkeyCancelled,
} from "@/features/auth/auth-error";
import { ApiError } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { meQueryOptions, setFirstPassword, updateMe } from "@/lib/session";
import { isSessionFresh } from "@/shared/account";
import { isDemoEmail } from "@/shared/demo";
import { passwordSchema } from "@/shared/password";
import { updateMeSchema } from "@/shared/schemas";
import { deviceName } from "./device-name";

/** The account's sign-ins, as Better Auth lists them. */
const accountsQuery = {
  queryKey: ["account", "sign-ins"],
  queryFn: async () => {
    const { data, error } = await authClient.listAccounts();
    if (error) throw error;
    return data;
  },
} as const;

const passkeysQuery = {
  queryKey: ["account", "passkeys"],
  queryFn: async () => {
    const { data, error } = await authClient.passkey.listUserPasskeys();
    if (error) throw error;
    return data;
  },
} as const;

type Me = { email: string; name: string; sessionStartedAt: string };

/**
 * The signed-in person's name and ways to sign in: a password, passkeys and
 * GitHub. Email codes always work, so nothing here can lock anyone out.
 * `error` is what connecting GitHub came back with.
 */
export function AccountPage({ error }: { error?: string }) {
  const t = useTranslations("account");
  const signin = useTranslations("signin");
  const me = useQuery(meQueryOptions);
  const user = me.data?.user;
  if (!user) return null;
  const demo = isDemoEmail(user.email);
  return (
    <main className="mx-6 my-12 flex flex-col gap-6 sm:mx-auto sm:max-w-lg">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl">{t("title")}</h1>
        {!demo && (
          <p className="text-muted-foreground text-sm">
            {t("signedInAs", { email: user.email })}
          </p>
        )}
      </header>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {signin(githubErrorKey(error))}
        </p>
      )}
      {demo ? (
        <p className="paper p-4 text-sm">{t("demo")}</p>
      ) : (
        <>
          <NameSection user={user} />
          <PasswordSection user={user} />
          <PasskeysSection user={user} />
          {me.data?.signIn.github && <GitHubSection user={user} />}
        </>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="paper flex flex-col gap-3 p-5">
      <h2 className="font-semibold text-lg">{title}</h2>
      {children}
    </section>
  );
}

/** In place of a control that adds or removes a way to sign in. */
function SignInAgain() {
  const t = useTranslations("account");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  async function signInAgain() {
    await authClient.signOut();
    await queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey });
    await navigate({ to: "/signin", search: { redirect: "/account" } });
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-muted-foreground text-sm">{t("signInAgain")}</p>
      <Button type="button" variant="outline" size="sm" onClick={signInAgain}>
        {t("signInAgainButton")}
      </Button>
    </div>
  );
}

function Message({
  error,
  done,
}: {
  error: string | null;
  done: string | null;
}) {
  if (error) {
    return (
      <p className="text-destructive text-sm" role="alert">
        {error}
      </p>
    );
  }
  return done ? (
    <p className="text-sm" role="status">
      {done}
    </p>
  ) : null;
}

function NameSection({ user }: { user: Me }) {
  const t = useTranslations("account");
  const signin = useTranslations("signin");
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { name: user.name },
    validators: { onSubmit: updateMeSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      setDone(null);
      try {
        await updateMe(value.name);
        await queryClient.invalidateQueries({
          queryKey: meQueryOptions.queryKey,
        });
        setDone(t("saved"));
      } catch {
        setError(signin("somethingWrong"));
      }
    },
  });
  return (
    <Section title={t("nameHeading")}>
      <form
        className="flex flex-col gap-3"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="name">
          {(field) => (
            <div className="flex flex-col gap-2">
              <Label htmlFor="account-name">{t("nameHeading")}</Label>
              <Input
                id="account-name"
                name={field.name}
                autoComplete="name"
                aria-describedby="account-name-help"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <p
                id="account-name-help"
                className="text-muted-foreground text-xs"
              >
                {t("nameHelp")}
              </p>
              <FieldError errors={field.state.meta.errors} />
            </div>
          )}
        </form.Field>
        <Message error={error} done={done} />
        <Button type="submit" className="self-start">
          {t("save")}
        </Button>
      </form>
    </Section>
  );
}

function PasswordSection({ user }: { user: Me }) {
  const t = useTranslations("account");
  const accounts = useQuery(accountsQuery);
  if (!accounts.data) return null;
  const hasPassword = accounts.data.some(
    (account) => account.providerId === "credential"
  );
  return (
    <Section title={t("passwordHeading")}>
      {hasPassword ? (
        <ChangePassword />
      ) : isSessionFresh(user.sessionStartedAt) ? (
        <SetPassword />
      ) : (
        <>
          <p className="text-muted-foreground text-sm">{t("noPassword")}</p>
          <SignInAgain />
        </>
      )}
    </Section>
  );
}

function SetPassword() {
  const t = useTranslations("account");
  const signin = useTranslations("signin");
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { password: "" },
    validators: { onSubmit: z.object({ password: passwordSchema }) },
    onSubmit: async ({ value }) => {
      setError(null);
      try {
        await setFirstPassword(value.password);
        setDone(t("passwordSet"));
        await queryClient.invalidateQueries({
          queryKey: accountsQuery.queryKey,
        });
      } catch (failure) {
        setError(
          signin(
            authErrorKey(failure instanceof ApiError ? failure : { status: 0 })
          )
        );
      }
    },
  });
  return (
    <form
      className="flex flex-col gap-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <p className="text-muted-foreground text-sm">{t("noPassword")}</p>
      <form.Field name="password">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-password">{t("newPassword")}</Label>
            <Input
              id="new-password"
              name={field.name}
              type="password"
              autoComplete="new-password"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
            <FieldError errors={field.state.meta.errors} />
          </div>
        )}
      </form.Field>
      <Message error={error} done={done} />
      <Button type="submit" className="self-start">
        {t("setPassword")}
      </Button>
    </form>
  );
}

function ChangePassword() {
  const t = useTranslations("account");
  const signin = useTranslations("signin");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { currentPassword: "", newPassword: "" },
    validators: {
      onSubmit: z.object({
        currentPassword: z.string().min(1),
        newPassword: passwordSchema,
      }),
    },
    onSubmit: async ({ value, formApi }) => {
      setError(null);
      setDone(null);
      const { error: failure } = await authClient.changePassword({
        ...value,
        revokeOtherSessions: true,
      });
      if (failure) {
        setError(signin(authErrorKey(failure)));
        return;
      }
      formApi.reset();
      setDone(t("passwordChanged"));
    },
  });
  return (
    <form
      className="flex flex-col gap-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="currentPassword">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor="current-password">{t("currentPassword")}</Label>
            <Input
              id="current-password"
              name={field.name}
              type="password"
              autoComplete="current-password"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
            <FieldError errors={field.state.meta.errors} />
          </div>
        )}
      </form.Field>
      <form.Field name="newPassword">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-password">{t("newPassword")}</Label>
            <Input
              id="new-password"
              name={field.name}
              type="password"
              autoComplete="new-password"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
            <FieldError errors={field.state.meta.errors} />
          </div>
        )}
      </form.Field>
      <Message error={error} done={done} />
      <Button type="submit" className="self-start">
        {t("changePassword")}
      </Button>
    </form>
  );
}

function PasskeysSection({ user }: { user: Me }) {
  const t = useTranslations("account");
  const signin = useTranslations("signin");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const passkeys = useQuery(passkeysQuery);
  const [error, setError] = useState<string | null>(null);
  const supported = typeof PublicKeyCredential !== "undefined";
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: passkeysQuery.queryKey });

  async function add() {
    setError(null);
    const { error: failure } = await authClient.passkey.addPasskey({
      name: deviceName(navigator.userAgent),
    });
    if (failure && !passkeyCancelled(failure)) {
      setError(signin(authErrorKey(failure)));
    }
    await refresh();
  }

  async function remove(id: string) {
    setError(null);
    const { error: failure } = await authClient.passkey.deletePasskey({ id });
    if (failure) setError(signin(authErrorKey(failure)));
    await refresh();
  }

  return (
    <Section title={t("passkeysHeading")}>
      <p className="text-muted-foreground text-sm">{t("passkeysHelp")}</p>
      {passkeys.data?.length ? (
        <ul className="flex flex-col divide-y">
          {passkeys.data.map((passkey) => (
            <li
              key={passkey.id}
              className="flex items-center justify-between gap-3 py-2"
            >
              <span className="flex flex-col">
                <span className="font-medium text-sm">
                  {passkey.name ?? deviceName("")}
                </span>
                <span className="text-muted-foreground text-xs">
                  {t("addedOn", {
                    date: format.dateTime(new Date(passkey.createdAt), {
                      dateStyle: "medium",
                    }),
                  })}
                </span>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => remove(passkey.id)}
              >
                {t("removePasskey")}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm">{t("noPasskeys")}</p>
      )}
      <Message error={error} done={null} />
      {!supported ? (
        <p className="text-muted-foreground text-sm">{t("noWebAuthn")}</p>
      ) : isSessionFresh(user.sessionStartedAt) ? (
        <Button type="button" className="self-start" onClick={add}>
          {t("addPasskey")}
        </Button>
      ) : (
        <SignInAgain />
      )}
    </Section>
  );
}

function GitHubSection({ user }: { user: Me }) {
  const t = useTranslations("account");
  const signin = useTranslations("signin");
  const queryClient = useQueryClient();
  const accounts = useQuery(accountsQuery);
  const [error, setError] = useState<string | null>(null);
  if (!accounts.data) return null;
  const github = accounts.data.find(
    (account) => account.providerId === "github"
  );
  const fresh = isSessionFresh(user.sessionStartedAt);

  async function connect() {
    await authClient.linkSocial({
      provider: "github",
      callbackURL: "/account",
      errorCallbackURL: "/account",
    });
  }

  async function disconnect(accountId: string) {
    setError(null);
    const { error: failure } = await authClient.unlinkAccount({ accountId });
    if (failure) setError(signin(authErrorKey(failure)));
    await queryClient.invalidateQueries({ queryKey: accountsQuery.queryKey });
  }

  return (
    <Section title={t("githubHeading")}>
      <p className="text-sm">
        {github ? t("githubConnected") : t("githubNotConnected")}
      </p>
      <Message error={error} done={null} />
      {!fresh ? (
        <SignInAgain />
      ) : github ? (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => disconnect(github.id)}
        >
          {t("disconnectGitHub")}
        </Button>
      ) : (
        <Button type="button" className="self-start" onClick={connect}>
          {t("connectGitHub")}
        </Button>
      )}
    </Section>
  );
}
```

Create `src/routes/account.tsx`:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { AccountPage } from "@/features/account/account-page";
import { meQueryOptions } from "@/lib/session";

export const Route = createFileRoute("/account")({
  validateSearch: z.object({
    // Set when connecting GitHub came back refused.
    error: z.string().optional().catch(undefined),
  }),
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    if (!me.user) {
      throw redirect({ to: "/signin", search: { redirect: location.href } });
    }
  },
  component: Account,
});

function Account() {
  const { error } = Route.useSearch();
  return <AccountPage error={error} />;
}
```

In `src/components/site-header.tsx`, replace:

```tsx
        <LanguageSwitcher />
        {user ? (
          <>
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
            <Button size="sm" variant="outline" onClick={signOut}>
              {t("signOut")}
```

with:

```tsx
        <LanguageSwitcher />
        {user ? (
          <>
            {/* Your name, or your email, opens your account page. */}
            {isDemoEmail(user.email) ? (
              // Guests' addresses are made up; their name is what others see.
              <Link
                to="/account"
                className="hidden items-center gap-2 text-sm hover:underline sm:inline-flex"
              >
                <span className="font-medium">{user.name}</span>
                <span className="rounded-[3px] border border-foreground/30 px-1.5 py-px text-xs">
                  {t("demo")}
                </span>
              </Link>
            ) : (
              <Link
                to="/account"
                className="hidden text-muted-foreground text-sm hover:underline sm:inline"
              >
                {user.email}
              </Link>
            )}
            <Button size="sm" variant="outline" onClick={signOut}>
              {t("signOut")}
```

Run: `bun run build && git diff --stat src/routeTree.gen.ts`
Expected: the build passes, and the route tree gains `/account`: `1 file changed, 21 insertions(+)`.

- [ ] **Step 5: Run them to watch them pass**

Run: `bunx vitest run src/features/account`
Expected: PASS, `Tests  19 passed (19)`.

- [ ] **Step 6: Run the whole suite**

Run: `bun run typecheck && bun run check && bun run test`
Expected: typecheck and Biome clean; `Test Files  94 passed (94)`, `Tests  811 passed (811)`.

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat: the account page: name, password, passkeys and GitHub, each change behind a recent sign-in; your name in the header links to it"
```

---

### Task 12: Browser tests for passwords and passkeys

**Files:**
- Create: `e2e/accounts.spec.ts`

**Interfaces:**
- Consumes: the pages from Tasks 10 and 11; Chrome's virtual authenticator through the DevTools protocol

- [ ] **Step 1: Write the browser tests**

They exercise what Tasks 4–11 built, so they pass when they're first run.

Create `e2e/accounts.spec.ts`:

```ts
import { expect, type Page, test } from "@playwright/test";
import postgres from "postgres";

/**
 * Password accounts and passkeys, end to end. Codes are stored hashed and
 * only logged in development, so these tests confirm the address in the
 * database; the code screens have their own component and API tests. They
 * make real accounts, so they run locally and in CI, never on the live site.
 */
test.skip(
  Boolean(process.env.E2E_BASE_URL),
  "makes accounts: local and CI only"
);

const PASSWORD = "correct horse battery";
const newEmail = () => `e2e-${Date.now().toString(36)}@example.com`;

/** What entering the emailed code does, without the email. */
async function confirmAddress(email: string) {
  const sql = postgres(process.env.DATABASE_URL ?? "", { max: 1 });
  try {
    await sql`update "user" set email_verified = true where email = ${email}`;
  } finally {
    await sql.end();
  }
}

async function signUp(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(`We sent a code to ${email}`)).toBeVisible();
  await confirmAddress(email);
}

async function signInWithPassword(page: Page, email: string) {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/new-workspace$/);
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
}

test("signs up with a password, then signs in with it", async ({ page }) => {
  const email = newEmail();
  await signUp(page, email);
  await signInWithPassword(page, email);
  await signOut(page);
  await signInWithPassword(page, email);
});

test("adds a passkey on the account page, then signs in with it", async ({
  page,
}) => {
  // Chrome's built-in test device stands in for a phone or a laptop.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  const email = newEmail();
  await signUp(page, email);
  await signInWithPassword(page, email);

  await page.goto("/account");
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page.getByText(/^Added /)).toBeVisible();

  await signOut(page);
  await page.goto("/signin");
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page).toHaveURL(/\/new-workspace$/);
});
```

- [ ] **Step 2: Run the browser tests**

Stop `bun run dev` first: the suite refuses a server that is already running.

Run: `bun run e2e`
Expected: `8 passed`, including "signs up with a password, then signs in with it" and "adds a passkey on the account page, then signs in with it".

- [ ] **Step 3: Commit**

```bash
git add e2e
git commit -m "test: browser tests sign up with a password and sign in with it, and add a passkey and sign in with it (local and CI only)"
```

---

### Task 13: The README, and the last checks

**Files:**
- Modify: `README.md`, `.dev.vars.example`

- [ ] **Step 1: Document the sign-in methods and GitHub's setup**

In `README.md`, replace:

```md
Turkish.

Live: <https://pano.olbios88.workers.dev>. "Try as team" and "Try as member"
open a demo workspace with your own guest account.

Design: [docs/superpowers/specs/2026-10-16-pano-design.md](docs/superpowers/specs/2026-10-16-pano-design.md)

```

with:

```md
Turkish.

Live: <https://pano.olbios88.workers.dev>. "Try as team" and "Try as member"
open a demo workspace with your own guest account. People sign in with an
emailed code, a password, a passkey or GitHub.

Design: [docs/superpowers/specs/2026-10-16-pano-design.md](docs/superpowers/specs/2026-10-16-pano-design.md)

```

In the same file, replace:

```md

  In local dev, `curl 'http://localhost:5173/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*'`
  (or `cron=0+1+*+*+*`) runs one, and emails print in the terminal.
- `worker/auth.ts`: Better Auth, with email-code sign-in and workspaces as
  organizations. Its routes under `/api/auth/*` answer in Better Auth's JSON,
  so the browser calls them through `authClient`. In local dev, sign-in codes
  print in the terminal running `bun run dev`.
- `worker/services/`: the queries behind the routes. `votes.ts` locks the
  post row and writes the state the person asked for, so the count moves
  only by the rows that changed. `comments.ts` takes the same lock and
```

with:

```md

  In local dev, `curl 'http://localhost:5173/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*'`
  (or `cron=0+1+*+*+*`) runs one, and emails print in the terminal.
- `worker/auth/`: Better Auth, with workspaces as organizations. Its routes
  under `/api/auth/*` answer in Better Auth's JSON, so the browser calls them
  through `authClient`. In local dev, codes print in the terminal running
  `bun run dev`.
  - `index.ts`: email codes; passwords, confirmed by a code before they work;
    GitHub, when its secrets are set; the rate limits.
  - `password.ts`: PBKDF2 hashing (Better Auth's scrypt costs more CPU than
    the free plan gives a request) and the leaked-password check.
  - `guards.ts`: Pano's rules around Better Auth's routes: email limits,
    unconfirmed sign-ups, the pause after ten wrong passwords, demo guests,
    and the recent sign-in that adding a way to sign in needs.
  - `passkeys.ts`: the passkey plugin, imported only for
    `/api/auth/passkey/*`, so other requests start without its 650 KB.
- `worker/services/`: the queries behind the routes. `votes.ts` locks the
  post row and writes the state the person asked for, so the count moves
  only by the rows that changed. `comments.ts` takes the same lock and
```

In the same file, replace:

```md

`E2E_BASE_URL=https://pano.olbios88.workers.dev bun run e2e` runs the same
tests against the live site, in its demo workspace; they delete what they
create.

## Deploying

```

with:

```md

`E2E_BASE_URL=https://pano.olbios88.workers.dev bun run e2e` runs the same
tests against the live site, in its demo workspace; they delete what they
create. The password and passkey tests make accounts, so they skip the live
site.

## Deploying

```

In the same file, replace:

```md

   In Brevo, also turn off blocking of unknown IP addresses for the key:
   Workers send from changing addresses.
5. Keep the direct connection string in `.env` as `NEON_DATABASE_URL`, then
   `bun run db:migrate:prod`. `DATABASE_URL` stays on your local database,
   so the everyday `bun run db:migrate` can't reach production.
```

with:

```md

   In Brevo, also turn off blocking of unknown IP addresses for the key:
   Workers send from changing addresses.

   For GitHub sign-in, create an OAuth app under GitHub → Settings →
   Developer settings → OAuth Apps, with the homepage
   `https://pano.olbios88.workers.dev` and the callback URL
   `https://pano.olbios88.workers.dev/api/auth/callback/github`, then set
   `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` the same way. Without both,
   GitHub sign-in stays off and its buttons are hidden. Passkeys need no
   setup: they belong to the host in `BETTER_AUTH_URL`.
5. Keep the direct connection string in `.env` as `NEON_DATABASE_URL`, then
   `bun run db:migrate:prod`. `DATABASE_URL` stays on your local database,
   so the everyday `bun run db:migrate` can't reach production.
```

In `.dev.vars.example`, replace:

```
BETTER_AUTH_SECRET=replace-me
BETTER_AUTH_URL=http://localhost:5173
ENVIRONMENT=development
```

with:

```
BETTER_AUTH_SECRET=replace-me
BETTER_AUTH_URL=http://localhost:5173
ENVIRONMENT=development
# GitHub sign-in, optional: an OAuth app whose callback URL is
# http://localhost:5173/api/auth/callback/github. Without both, it's off.
# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=
```

- [ ] **Step 2: Run everything**

Run: `bun run typecheck && bun run check && bun run test && bun run build && bunx wrangler deploy --dry-run -c dist/pano/wrangler.json && bun run e2e`
Expected:
- typecheck and Biome clean
- `Test Files  94 passed (94)`, `Tests  811 passed (811)`
- the dry run prints `Total Upload: 2507… KiB / gzip: 556… KiB`, then `--dry-run: exiting now.`
- `8 passed`

- [ ] **Step 3: Commit**

```bash
git add README.md .dev.vars.example
git commit -m "docs: the sign-in methods, and setting up GitHub sign-in"
```

---

## Part 2: Release (after the merge, with you)

Nothing here runs without you. Pushes are yours: `! git -C ~/repos/deploys/pano push origin main`.

### R1. GitHub's OAuth app and secrets (you; I guide)

1. Create the app under GitHub → Settings → Developer settings → OAuth Apps → New OAuth App:
   - **Homepage URL:** `https://pano.olbios88.workers.dev`
   - **Authorization callback URL:** `https://pano.olbios88.workers.dev/api/auth/callback/github`
2. Generate a client secret.
3. Run `bunx wrangler secret put GITHUB_CLIENT_ID`, then `bunx wrangler secret put GITHUB_CLIENT_SECRET`, pasting each value when asked. They never go in a file or in this chat.

Without them the deploy still works; GitHub's buttons just stay hidden.

### R2. Migrate production (you)

Run `bun run db:migrate:prod`.

Expected: drizzle-kit applies one migration, `0015_passkeys`, and reports success. It only adds a table, so the live Worker keeps working.

### R3. Push, and watch CI deploy (you push, I watch)

Push `main`. CI runs `verify` and `e2e`, then `deploy`. Its log shows `Production has every migration, up to 0015_passkeys.`, then wrangler's deploy.

### R4. Check it (me, then you)

1. **Browser tests against the live site:** `E2E_BASE_URL=https://pano.olbios88.workers.dev bun run e2e`.
   - Expected: the six demo specs pass, and the two account specs report skipped.
   - The demo signs in seven times a run, against a limit of 5 a minute. Run them in two halves a minute apart, or accept the known refusal: it's Phase 9's follow-up.
2. **CPU:** `bunx wrangler tail pano --format json` while you sign in each way: password, passkey, GitHub, and code. Then load some ordinary pages.
   - Expected: no `exceededCpu` outcome, and the ordinary-request median at or under 10 ms.
   - Each sign-in path's median is recorded.
3. **By hand:**
   - Sign up with a real address and confirm it.
   - Sign out, and sign in with the password.
   - Reset the password from "Forgot password?".
   - On the account page, add a passkey on your phone or laptop. Sign out, then sign in with it.
   - Sign in with GitHub, using the GitHub account whose verified email matches your Pano account. You land in your existing account.
   - Switch to Turkish and look at each new page and one of the new emails.

### R5. The authentication report (me)

A list in chat of every authentication file added or changed, and what each change does.

### R6. Follow-ups (with your consent)

File issues for:
- the Review Focus items that the R4 checks don't settle
- the live suite's demo sign-in budget
- demo sign-in's CPU (about 67 ms)
