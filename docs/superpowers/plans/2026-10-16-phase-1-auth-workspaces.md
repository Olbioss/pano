# Phase 1: Auth and workspaces — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People sign in with an emailed code, create one workspace with a default language, and manage its boards, in English or Turkish. The Phase 0 review's hardening comes first.

**Architecture:**
- **Better Auth** (email-OTP and organization plugins) runs inside the Hono app. It's built per request on the request's Hyperdrive client and mounted at `/api/auth/*`. Its routes answer in Better Auth's own JSON, and the browser calls them through Better Auth's client. Every other route keeps the envelope, `hc<AppType>` and `unwrap`.
- **Workspaces** are Better Auth organizations plus a `workspace_settings` row that holds the default language. **Boards** are Pano's own table. Team rights mean any membership, and `requireTeam` checks them on the server.
- **Validation:** shared zod 4 schemas validate requests and forms. `validate()` wraps `@hono/zod-validator` so failures come back in the envelope, and TanStack Form takes the same schemas through Standard Schema. Errors the UI must translate carry stable keys: `ApiErrorCode` and `FieldErrorKey`.
- **Language:** the person's choice comes first (the `pano-locale` cookie, which the server also reads for code emails), then the workspace default, then the browser.

**Tech Stack:**
- The Phase 0 stack.
- better-auth 1.7.10 (email-OTP and organization plugins), plus the `auth` CLI 1.7.10 for generating its schema.
- zod 4.6, @hono/zod-validator 0.9, @tanstack/react-form 1.33.

**Spec:** `docs/superpowers/specs/2026-10-16-pano-design.md`, amended 2026-10-16 to email-code sign-in. This plan covers its "Build order → 1. Auth and workspaces", plus:
- the Phase 0 reviewer's minors 1–3
- the carried ruling to refuse a non-local `TEST_DATABASE_URL`
- minor 4 (`unwrap` on a 2xx response that isn't JSON), which Task 8 needs for its types.

**Verified in a throwaway spike (2026-10-16):**
- **The CLI moved.** Better Auth 1.7's CLI is the npm package `auth`. `@better-auth/cli` stopped at 1.4 and bundles an old Better Auth. `auth generate --adapter drizzle --dialect postgresql` writes the Drizzle schema without a live database.
- **Email-code sign-in works** under Vitest (Node) and in `vite dev` (workerd):
  - Sending a code returns `200 {"success":true}`.
  - Signing in returns 200 and sets the cookies `better-auth.session_token` and `better-auth.session_data`.
- **New users get an empty name** unless a `databaseHooks.user.create.before` hook returns `{ data }` with one.
- **`createOrganization` errors** are `APIError`s whose `body.code` is:
  - `ORGANIZATION_ALREADY_EXISTS` for a duplicate slug (400)
  - `YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS` past the limit (403).
- **Rate limiting:** with `ENVIRONMENT=production`, the 4th code request from one IP within a minute gets 429. The counters live in the database.
- **Cost:** building Better Auth per request takes about 0.3 ms (in Node).
- **Generated types:** `wrangler types` copies `.dev.vars` keys into the generated `Env`.
- **Forms:** TanStack Form accepts zod 4 schemas with no type workarounds, and zod ships `z.locales.tr()`.

**Still deferred from the Phase 0 review:** README notes, CI Node pin, splitting Vitest projects, a test that the database client gets closed, and the 4xx fallback code (minors 5–9).

## Global Constraints

- **Repo and branch:** `~/repos/deploys/pano`, on branch `feat/phase-1-auth-workspaces` from `main`. Nothing is pushed.
- **Phase 0 still applies:** every Phase 0 Global Constraint holds — versions, local Postgres, env files, architecture rules, aliases, envelope, style and commits.
- **New package floors:** better-auth `^1.7.10`; auth (CLI) exactly `1.7.10`; zod `^4.6.7`; @hono/zod-validator `^0.9.1`; @tanstack/react-form `^1.33.5`.
- **Email codes only:**
  - Sign-in uses 6-digit codes, stored hashed, expiring after 5 minutes.
  - The first sign-in creates the account.
  - No passwords anywhere (the free plan's CPU limit rules them out).
- **Rate limits:** at most 3 code requests and 10 code sign-ins per minute per IP. They're enforced only when `ENVIRONMENT` is `production`, and stored in the database.
- **Workspaces:** one per account (organization limit 1). Any member (owner, admin or member) counts as team.
- **Slugs and names:**
  - A workspace slug is 3–40 characters of lowercase letters, digits and single hyphens, and not reserved.
  - A board name is 2–40 characters with at least two letters or digits.
  - A board's slug comes from its name and is fixed at creation.
- **Two response formats:**
  - Better Auth's routes answer in Better Auth's JSON; every other `/api` route uses the envelope.
  - The browser calls Better Auth through `authClient`, and everything else through `unwrap(await api…)`.
- **Translatable errors** use stable keys: `ApiErrorCode` (`shared/envelope.ts`) and `FieldErrorKey` (`shared/field-errors.ts`). Every key exists in both catalogs.
- **Language order:**
  - The chosen language (cookie `pano-locale`: 1 year, `SameSite=Lax`) comes first, then the workspace default, then the browser.
  - The server reads the same cookie, then `Accept-Language`, to pick the language of the code email.
- **Test database:** truncated at the start of every run, and only a local database is accepted. Tests use unique emails and slugs.

## Review Focus

1. **Repeated code requests** for one address, or for someone else's: the 4th within a minute gets 429, and the UI says to wait a minute. (Task 3's rate-limit test; Task 7 maps 429.)
2. **Two people claim the same workspace address at the same moment:** exactly one gets 201 and the other gets 409 `SLUG_TAKEN`, never a 500. (Task 5's concurrency test.)
3. **A sign-in link carries `?redirect=https://evil.example`** or `//evil.example`: after sign-in the person stays on Pano. (Task 7's `safeRedirect` test.)
4. **A signed-in non-member** calls a team route or opens `/acme/settings`: the API answers 403, and the settings page redirects to the workspace. (Task 5 and 6 tests; Task 8's route guard.)
5. **Turkish names** slug cleanly ("Özellik İstekleri" → `ozellik-istekleri`), and a name with no letters or digits is refused instead of becoming an empty slug. (Task 4's slug and schema tests; Task 6's route test.)

---

### Task 1: Hardening from the Phase 0 review

**Files:**
- Modify: `worker/db/client.ts` (connect timeout)
- Test: `worker/db/client.test.ts`
- Create: `worker/test/local-db.ts`; Test: `worker/test/local-db.test.ts`
- Modify: `worker/test/env.ts`, `test/global-setup.ts` (accept only a local database)
- Modify: `wrangler.jsonc` (`run_worker_first`)
- Modify: `worker/index.ts` (bindings drift guard)

**Interfaces:**
- Consumes: Phase 0's `createDb`, `testEnv`, `Bindings`.
- Produces:
  - `createDb(connectionString: string, options?: { connectTimeoutSeconds?: number })`
  - `assertLocalDatabaseUrl(url: string): void`
  - `type BindingsMatchWrangler` (compile time only).

- [ ] **Step 1: Create the branch**

```bash
cd ~/repos/deploys/pano
git switch -c feat/phase-1-auth-workspaces
```

- [ ] **Step 2: Write the failing tests**

`worker/db/client.test.ts`:

```ts
import { createServer, type Server, type Socket } from "node:net";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "./client";

// Accepts TCP connections and never answers: a database host that's up at the
// network level but stuck. postgres.js waits 30 s for it by default.
const sockets = new Set<Socket>();
let server: Server;
let port = 0;

beforeAll(async () => {
  server = createServer((socket) => {
    sockets.add(socket);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("the stub server has no port");
  }
  port = address.port;
});

afterAll(async () => {
  for (const socket of sockets) socket.destroy();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("createDb", () => {
  it("gives up on a database that never answers", async () => {
    const { db, close } = createDb(
      `postgresql://nobody:x@127.0.0.1:${port}/none`,
      { connectTimeoutSeconds: 1 }
    );
    const started = Date.now();
    await expect(db.execute(sql`select 1`)).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(3000);
    await close();
  });
});
```

`worker/test/local-db.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assertLocalDatabaseUrl } from "./local-db";

describe("assertLocalDatabaseUrl", () => {
  it.each([
    "postgresql://olbios@127.0.0.1:5432/pano_test",
    "postgresql://postgres:postgres@localhost:5432/pano_test",
    "postgres://someone@[::1]:5432/pano_test",
  ])("accepts %s", (url) => {
    expect(() => assertLocalDatabaseUrl(url)).not.toThrow();
  });

  it.each([
    "postgresql://u:p@ep-quiet-sky-123456.eu-central-1.aws.neon.tech/neondb",
    "postgresql://u:p@10.0.0.5:5432/pano",
  ])("refuses %s", (url) => {
    expect(() => assertLocalDatabaseUrl(url)).toThrow(/not a local database/);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `bun run test worker/db/client.test.ts worker/test/local-db.test.ts`

Expected: FAIL.
- `local-db.test.ts` fails to import (`Cannot find module './local-db'`).
- The `createDb` test fails with `Test timed out in 5000ms`. The unknown option is ignored, so postgres.js waits its default 30 s.

- [ ] **Step 4: Add the connect timeout and the local-only check**

`worker/db/client.ts` (full replacement):

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DbOptions = {
  /**
   * How long to wait for the server to accept the connection and log in.
   * postgres.js waits 30 s by default, which left the page spinning for a
   * minute when the database host stopped answering.
   */
  connectTimeoutSeconds?: number;
};

/**
 * One small client per request. Hyperdrive pools the real connections to
 * Postgres, and a Worker can't reuse a socket across requests anyway.
 * fetch_types skips a startup round trip for custom array types we don't use.
 */
export function createDb(
  connectionString: string,
  { connectTimeoutSeconds = 10 }: DbOptions = {}
) {
  const client = postgres(connectionString, {
    max: 5,
    fetch_types: false,
    connect_timeout: connectTimeoutSeconds,
  });
  return {
    db: drizzle({ client, schema }),
    close: () => client.end({ timeout: 5 }),
  };
}

export type Database = ReturnType<typeof createDb>["db"];
```

`worker/test/local-db.ts`:

```ts
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The test run truncates tables. Refuse any database that isn't on this
 * machine, so a TEST_DATABASE_URL pasted from the wrong place can't wipe a
 * real one.
 */
export function assertLocalDatabaseUrl(url: string) {
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `TEST_DATABASE_URL points at ${host}, which is not a local database`
    );
  }
}
```

In `worker/test/env.ts`, import the check and call it right after the missing-variable check:

```ts
import { assertLocalDatabaseUrl } from "./local-db";
```

```ts
  if (!connectionString)
    throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  assertLocalDatabaseUrl(connectionString);
```

In `test/global-setup.ts`, do the same after the `if (!url) throw …` line:

```ts
import { assertLocalDatabaseUrl } from "../worker/test/local-db";
```

```ts
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  assertLocalDatabaseUrl(url);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test`
Expected: PASS. 9 test files, 32 tests.

- [ ] **Step 6: Watch a bare `/api` fall through to the app shell, then route it to the Worker**

Stop any `bun run dev` you have running first, then:

```bash
(bun run dev --port 5199 --strictPort > "${TMPDIR:-/tmp}/pano-dev.log" 2>&1 &)
curl -s -o /dev/null --retry 40 --retry-connrefused --retry-delay 1 --max-time 60 -w '%{http_code} %{content_type}\n' http://localhost:5199/api
pkill -f "vite --port 5199"
```

Expected: `200 text/html`. This is the bug: the app shell answers instead of the API.

In `wrangler.jsonc`, change the `run_worker_first` line to:

```jsonc
    "run_worker_first": ["/api", "/api/*"]
```

Rerun the three commands above. Expected: `404 application/json`.

- [ ] **Step 7: Add the bindings drift guard and watch it bite**

`worker/index.ts` (full replacement):

```ts
import app from "./app";
import type { Bindings } from "./env";

// The app types its bindings structurally (see env.ts), so tests can build
// them by hand. This line ties them back to what wrangler.jsonc and .dev.vars
// actually provide: rename or drop a binding there and the typecheck fails,
// instead of every test passing and production answering 500.
type Assert<T extends true> = T;
export type BindingsMatchWrangler = Assert<
  Env extends Bindings ? true : false
>;

// The Workers entry point. Cron triggers and link-preview rewriting join this
// file in later phases; the API itself lives in app.ts.
export default app;
```

Prove the guard works: rename the binding, regenerate the types and typecheck, then rename it back.

```bash
sed -i '' 's/"binding": "HYPERDRIVE"/"binding": "HYPERDRIVE_DB"/' wrangler.jsonc
bun run cf-typegen > /dev/null && bun run typecheck; echo "exit: $?"
sed -i '' 's/"binding": "HYPERDRIVE_DB"/"binding": "HYPERDRIVE"/' wrangler.jsonc
bun run cf-typegen > /dev/null && bun run typecheck; echo "exit: $?"
git diff --stat worker-configuration.d.ts
```

Expected:
- The first typecheck fails with `error TS2344: Type 'false' does not satisfy the constraint 'true'`, and the first `exit:` is non-zero.
- The second `exit:` is `0`.
- `git diff --stat worker-configuration.d.ts` prints nothing: the regenerated file is identical to the committed one.

- [ ] **Step 8: Lint and commit**

```bash
bun run typecheck
bun run check:fix
bun run check
bun run test
git add worker/db/client.ts worker/db/client.test.ts worker/test/local-db.ts worker/test/local-db.test.ts worker/test/env.ts test/global-setup.ts wrangler.jsonc worker/index.ts
git commit -m "fix: harden the scaffold from the Phase 0 review" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: everything passes. 9 test files, 32 tests.

---
### Task 2: Shared locale, code emails and the Brevo mailer

**Files:**
- Move: `src/i18n/locale.ts` → `shared/locale.ts`, and `src/i18n/locale.test.ts` → `shared/locale.test.ts`
- Modify: `shared/locale.ts`, `shared/locale.test.ts`, `src/i18n/provider.tsx` (import path)
- Create: `worker/lib/request-locale.ts`; Test: `worker/lib/request-locale.test.ts`
- Create: `worker/mail/templates.ts`, `worker/mail/mailer.ts`; Test: `worker/mail/mailer.test.ts`
- Modify: `worker/env.ts` (optional mail and environment bindings)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `shared/locale.ts`:
    - `LOCALES`, `type Locale`, `LOCALE_COOKIE = "pano-locale"`
    - `isLocale(value: unknown): value is Locale`
    - `localeFromLanguageTag(tag: string | undefined): Locale`
    - `localeFromCookie(cookie: string | null | undefined): Locale | null`
  - `worker/lib/request-locale.ts`: `localeFromHeaders(headers: Headers): Locale`
  - `worker/mail/templates.ts`: `signInCodeEmail(code: string, locale: Locale): { subject; text; html }`
  - `worker/mail/mailer.ts`:
    - `type SignInCode = { to: string; code: string; locale: Locale }`
    - `interface Mailer { sendSignInCode(message: SignInCode): Promise<void> }`
    - `consoleMailer`
    - `type SendFn = (url: string, init: RequestInit) => Promise<Response>`
    - `brevoMailer(apiKey: string, from: string, send?: SendFn): Mailer`
    - `type MailEnv`, `mailerFor(env: MailEnv): Mailer`
  - `Bindings` gains `ENVIRONMENT?`, `BREVO_API_KEY?` and `MAIL_FROM?` (all optional strings).

- [ ] **Step 1: Move the locale module to `shared/`**

Both sides need it now: the Worker picks the language of the code email.

```bash
git mv src/i18n/locale.ts shared/locale.ts
git mv src/i18n/locale.test.ts shared/locale.test.ts
```

In `src/i18n/provider.tsx`, change `from "./locale"` to `from "@/shared/locale"`.

Run: `bun run test shared/locale.test.ts`
Expected: PASS, 10 tests. Only the location changed.

- [ ] **Step 2: Write the failing tests**

Append to `shared/locale.test.ts`. Also change its import line to:

`import { isLocale, localeFromCookie, localeFromLanguageTag } from "./locale";`

```ts
describe("isLocale", () => {
  it.each(["en", "tr"])("accepts %s", (value) => {
    expect(isLocale(value)).toBe(true);
  });

  it.each(["de", "TR", "", undefined, 1])("refuses %s", (value) => {
    expect(isLocale(value)).toBe(false);
  });
});

describe("localeFromCookie", () => {
  it("reads the language cookie among others", () => {
    expect(localeFromCookie("theme=dark; pano-locale=tr; other=1")).toBe("tr");
  });

  it("ignores an unsupported value", () => {
    expect(localeFromCookie("pano-locale=de")).toBeNull();
  });

  it("ignores a cookie whose name only ends the same way", () => {
    expect(localeFromCookie("xpano-locale=tr")).toBeNull();
  });

  it("returns null when there's no cookie", () => {
    expect(localeFromCookie(undefined)).toBeNull();
    expect(localeFromCookie("")).toBeNull();
  });
});
```

`worker/lib/request-locale.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { localeFromHeaders } from "./request-locale";

describe("localeFromHeaders", () => {
  it("prefers the language the person chose", () => {
    const headers = new Headers({
      cookie: "pano-locale=tr",
      "accept-language": "en-GB,en;q=0.9",
    });
    expect(localeFromHeaders(headers)).toBe("tr");
  });

  it("falls back to the browser's first language", () => {
    const headers = new Headers({
      "accept-language": "tr-TR,tr;q=0.9,en;q=0.8",
    });
    expect(localeFromHeaders(headers)).toBe("tr");
  });

  it("ignores an unsupported cookie value", () => {
    const headers = new Headers({
      cookie: "pano-locale=de",
      "accept-language": "tr",
    });
    expect(localeFromHeaders(headers)).toBe("tr");
  });

  it("defaults to English", () => {
    expect(localeFromHeaders(new Headers())).toBe("en");
  });
});
```

`worker/mail/mailer.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { brevoMailer, consoleMailer, mailerFor, type SendFn } from "./mailer";

const accepted = async () => new Response("{}", { status: 201 });

describe("brevoMailer", () => {
  it("sends the code email through Brevo in the person's language", async () => {
    const send = vi.fn<SendFn>(accepted);
    await brevoMailer("key-123", "hello@pano.example", send).sendSignInCode({
      to: "ayse@example.com",
      code: "482913",
      locale: "tr",
    });

    expect(send).toHaveBeenCalledOnce();
    const [url, init] = send.mock.calls[0]!;
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("api-key")).toBe("key-123");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      sender: { name: "Pano", email: "hello@pano.example" },
      to: [{ email: "ayse@example.com" }],
      subject: "Pano giriş kodunuz: 482913",
    });
    expect(body.textContent).toContain("482913");
    expect(body.htmlContent).toContain("482913");
  });

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

  it("fails when Brevo refuses the email", async () => {
    const send: SendFn = async () =>
      new Response('{"message":"unauthorized"}', { status: 401 });
    const mailer = brevoMailer("bad", "hello@pano.example", send);
    await expect(
      mailer.sendSignInCode({ to: "a@example.com", code: "123456", locale: "en" })
    ).rejects.toThrow(/401/);
  });
});

describe("mailerFor", () => {
  it("prints codes locally when there's no Brevo key", () => {
    expect(mailerFor({})).toBe(consoleMailer);
  });

  it("refuses to run production without a Brevo key", () => {
    expect(() => mailerFor({ ENVIRONMENT: "production" })).toThrow(
      /BREVO_API_KEY/
    );
  });

  it("uses Brevo when a key is set", () => {
    const mailer = mailerFor({
      BREVO_API_KEY: "k",
      MAIL_FROM: "hello@pano.example",
    });
    expect(mailer).not.toBe(consoleMailer);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `bun run test shared worker/lib/request-locale.test.ts worker/mail`

Expected: FAIL.
- `shared/locale.test.ts` fails because `isLocale` and `localeFromCookie` aren't exported.
- The other two files fail to import `./request-locale` and `./mailer`.

- [ ] **Step 4: Write the locale helpers, the email copy and the mailer**

`shared/locale.ts` (full replacement):

```ts
export const LOCALES = ["en", "tr"] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * Remembers the language a person picked. The server reads it too, to write
 * code emails in that language.
 */
export const LOCALE_COOKIE = "pano-locale";

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "tr";
}

/**
 * The interface language from a browser language tag: Turkish for any `tr`
 * variant, English for everything else.
 */
export function localeFromLanguageTag(tag: string | undefined): Locale {
  return tag?.toLowerCase().split("-")[0] === "tr" ? "tr" : "en";
}

/** The chosen language from a Cookie header or `document.cookie`, if any. */
export function localeFromCookie(
  cookie: string | null | undefined
): Locale | null {
  for (const part of (cookie ?? "").split(";")) {
    const [name, value] = part.trim().split("=");
    if (name === LOCALE_COOKIE) return isLocale(value) ? value : null;
  }
  return null;
}
```

`worker/lib/request-locale.ts`:

```ts
import {
  type Locale,
  localeFromCookie,
  localeFromLanguageTag,
} from "@/shared/locale";

/**
 * The language for a message the server writes: the person's choice, then
 * their browser's first language, then English.
 */
export function localeFromHeaders(headers: Headers): Locale {
  const firstLanguage = headers.get("accept-language")?.split(",")[0]?.trim();
  return (
    localeFromCookie(headers.get("cookie")) ??
    localeFromLanguageTag(firstLanguage)
  );
}
```

`worker/mail/templates.ts`:

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
    html: `<p>${c.intro}</p><p style="font-size:28px;font-weight:600;letter-spacing:4px">${code}</p><p>${c.expiry}</p>`,
  };
}
```

`worker/mail/mailer.ts`:

```ts
import type { Locale } from "@/shared/locale";
import type { Bindings } from "../env";
import { signInCodeEmail } from "./templates";

export type SignInCode = { to: string; code: string; locale: Locale };

export interface Mailer {
  sendSignInCode(message: SignInCode): Promise<void>;
}

/** Local dev: the code goes to the terminal instead of an inbox. */
export const consoleMailer: Mailer = {
  async sendSignInCode({ to, code }) {
    console.log(`[mail] sign-in code for ${to}: ${code}`);
  },
};

export type SendFn = (url: string, init: RequestInit) => Promise<Response>;

/** Brevo's transactional email API (its free tier allows 300 emails a day). */
export function brevoMailer(
  apiKey: string,
  from: string,
  send: SendFn = (url, init) => fetch(url, init)
): Mailer {
  return {
    async sendSignInCode({ to, code, locale }) {
      const { subject, text, html } = signInCodeEmail(code, locale);
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
    },
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

`worker/env.ts`: add three optional bindings after `HYPERDRIVE`. Leave the doc comment and `AppEnv` as they are.

```ts
export type Bindings = {
  HYPERDRIVE: { connectionString: string };
  /** "production" on Cloudflare: turns on rate limits and requires Brevo. */
  ENVIRONMENT?: string;
  BREVO_API_KEY?: string;
  /** The sender address Brevo has verified. */
  MAIL_FROM?: string;
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test`
Expected: PASS. 11 test files, 53 tests.

- [ ] **Step 6: Typecheck, lint and commit**

```bash
bun run typecheck
bun run check:fix
bun run check
git add shared src/i18n worker/lib/request-locale.ts worker/lib/request-locale.test.ts worker/mail worker/env.ts
git commit -m "feat: code emails in English and Turkish, sent through Brevo in production" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `tsc -b` exits 0 and Biome passes.

---

### Task 3: Email-code sign-in with Better Auth, and `/api/me`

**Files:**
- Modify: `package.json` (better-auth, the `auth` CLI, an `auth:generate` script)
- Create: `worker/auth.ts`, `auth.config.ts`, `worker/middleware/auth.ts`, `worker/routes/me.ts`, `worker/test/app.ts`
- Create (generated): `worker/db/schema/auth.ts`, `drizzle/0001_auth.sql` and `drizzle/meta/*`
- Modify: `worker/env.ts`, `worker/db/schema/index.ts`, `worker/app.ts`, `worker/test/env.ts`, `test/global-setup.ts`, `tsconfig.node.json`, `.dev.vars.example`, `README.md`, `worker-configuration.d.ts` (regenerated)
- Test: `worker/routes/me.test.ts`

**Interfaces:**
- Consumes: `Mailer`, `mailerFor` and `localeFromHeaders` (Task 2); `createDb` (Task 1); `handleError` and `handleNotFound` (Phase 0).
- Produces:
  - `worker/auth.ts`: `createAuth({ db, env, mailer }: AuthDeps)`, `type Auth`
  - `worker/app.ts`: `createApp(deps?: { mailer?: Mailer })`, plus the default `app` and `type AppType`
  - `Bindings` gains the required `BETTER_AUTH_SECRET: string` and `BETTER_AUTH_URL: string`. `AppEnv["Variables"]` gains `auth: Auth`.
  - `GET /api/me` → `SuccessResponse<{ user: { id; name; email } | null; workspaces: { id; slug; name; role }[] }>`
  - `worker/test/app.ts`:
    - `testApp(overrides?: Partial<Bindings>)`, which returns `{ app, env, client, request, post, sendCode, lastCode, signIn, mail, settle }`
    - `capturingMailer()`, `cookieFrom(res)`, `uniqueEmail(prefix?)`, `ORIGIN`

- [ ] **Step 1: Write the failing tests**

`worker/test/app.ts`:

```ts
import { testClient } from "hono/testing";
import { createApp } from "../app";
import type { Bindings } from "../env";
import type { Mailer, SignInCode } from "../mail/mailer";
import { testEnv } from "./env";

/** Matches BETTER_AUTH_URL in testEnv, so Better Auth trusts the requests. */
export const ORIGIN = "http://localhost";

/** A mailer that keeps what it would have sent, so tests can read the codes. */
export function capturingMailer() {
  const sent: SignInCode[] = [];
  const mailer: Mailer = {
    async sendSignInCode(message) {
      sent.push(message);
    },
  };
  return { mailer, sent };
}

/** The Cookie header a browser would send after this response. */
export function cookieFrom(res: Response) {
  return res.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

export const uniqueEmail = (prefix = "user") =>
  `${prefix}-${crypto.randomUUID().slice(0, 8)}@example.com`;

/**
 * The real app with a capturing mailer, bound to the test database. `signIn`
 * runs the actual email-code flow and returns the session cookie.
 */
export function testApp(overrides: Partial<Bindings> = {}) {
  const mail = capturingMailer();
  const app = createApp({ mailer: mail.mailer });
  const base = testEnv();
  const env: Bindings = { ...base.env, ...overrides };
  const client = testClient(app, env, base.ctx);
  const request = (path: string, init: RequestInit = {}) =>
    app.request(path, init, env, base.ctx);
  const post = (
    path: string,
    body: unknown,
    headers: Record<string, string> = {}
  ) =>
    request(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        ...headers,
      },
      body: JSON.stringify(body),
    });

  const sendCode = (email: string, headers: Record<string, string> = {}) =>
    post(
      "/api/auth/email-otp/send-verification-otp",
      { email, type: "sign-in" },
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

  return {
    app,
    env,
    client,
    request,
    post,
    sendCode,
    lastCode,
    signIn,
    mail,
    settle: base.settle,
  };
}
```

`worker/routes/me.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cookieFrom, testApp, uniqueEmail } from "../test/app";

describe("email-code sign-in", () => {
  it("signs a new user in with the emailed code", async () => {
    const t = testApp();
    const email = uniqueEmail("ayse");

    const sent = await t.sendCode(email);
    expect(sent.status).toBe(200);
    expect(t.mail.sent).toEqual([
      expect.objectContaining({ to: email, locale: "en" }),
    ]);

    const res = await t.post("/api/auth/sign-in/email-otp", {
      email,
      otp: t.lastCode(email),
    });
    expect(res.status).toBe(200);

    const me = await t.client.api.me.$get(undefined, {
      headers: { cookie: cookieFrom(res) },
    });
    expect(await me.json()).toEqual({
      success: true,
      data: {
        user: { id: expect.any(String), email, name: email.split("@")[0] },
        workspaces: [],
      },
    });
    await t.settle();
  });

  it("refuses a wrong code and creates no session", async () => {
    const t = testApp();
    const email = uniqueEmail();
    await t.sendCode(email);
    const wrong = t.lastCode(email) === "000000" ? "111111" : "000000";

    const res = await t.post("/api/auth/sign-in/email-otp", {
      email,
      otp: wrong,
    });
    expect(res.ok).toBe(false);

    const me = await t.client.api.me.$get(undefined, {
      headers: { cookie: cookieFrom(res) },
    });
    expect(await me.json()).toMatchObject({ data: { user: null } });
    await t.settle();
  });

  it("answers /api/me with no user when signed out", async () => {
    const t = testApp();
    const me = await t.client.api.me.$get();
    expect(await me.json()).toEqual({
      success: true,
      data: { user: null, workspaces: [] },
    });
    await t.settle();
  });

  it("writes the code email in the browser's language", async () => {
    const t = testApp();
    const email = uniqueEmail();
    await t.sendCode(email, { "accept-language": "tr-TR,tr;q=0.9,en;q=0.8" });
    expect(t.mail.sent.at(-1)).toMatchObject({ to: email, locale: "tr" });
    await t.settle();
  });

  it("limits code requests from one address in production", async () => {
    const t = testApp({ ENVIRONMENT: "production" });
    const ip = {
      "cf-connecting-ip": `203.0.113.${Math.floor(Math.random() * 250) + 1}`,
    };
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      statuses.push((await t.sendCode(uniqueEmail(), ip)).status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
    await t.settle();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test worker/routes/me.test.ts`
Expected: FAIL. `createApp` isn't exported from `../app`.

- [ ] **Step 3: Install Better Auth and its CLI**

```bash
bun add better-auth@^1.7.10
bun add -d auth@1.7.10
```

Add this script to `package.json`. The CLI writes its own formatting, so the script runs Biome on the output.

```json
    "auth:generate": "auth generate --config auth.config.ts --adapter drizzle --dialect postgresql --output worker/db/schema/auth.ts -y && biome format --write worker/db/schema/auth.ts"
```

- [ ] **Step 4: Write the bindings, the auth factory and the CLI config**

`worker/env.ts` (full replacement):

```ts
import type { Auth } from "./auth";
import type { Database } from "./db/client";

/**
 * Bindings are typed structurally, not with the generated Workers types. That
 * way the app also typechecks inside the browser project, which imports
 * AppType, and runs under Node in tests. worker/index.ts checks them against
 * the generated Env.
 */
export type Bindings = {
  HYPERDRIVE: { connectionString: string };
  /** Signs session cookies: `openssl rand -base64 32`. A Worker secret in production. */
  BETTER_AUTH_SECRET: string;
  /** The app's own origin, e.g. http://localhost:5173. Better Auth trusts requests from it. */
  BETTER_AUTH_URL: string;
  /** "production" on Cloudflare: turns on rate limits and requires Brevo. */
  ENVIRONMENT?: string;
  BREVO_API_KEY?: string;
  /** The sender address Brevo has verified. */
  MAIL_FROM?: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: { db: Database; auth: Auth };
};
```

`worker/auth.ts`:

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP, organization } from "better-auth/plugins";
import type { Database } from "./db/client";
import * as schema from "./db/schema";
import type { Bindings } from "./env";
import { localeFromHeaders } from "./lib/request-locale";
import type { Mailer } from "./mail/mailer";

export type AuthDeps = { db: Database; env: Bindings; mailer: Mailer };

/**
 * Better Auth for one request. It's built per request because it needs the
 * request's own database client (a Worker can't share sockets across
 * requests); building it costs about 0.3 ms.
 *
 * Sign-in is email codes only. Password hashing doesn't fit the Workers free
 * plan's 10 ms of CPU per request; a code is cheap to create and check.
 */
export function createAuth({ db, env, mailer }: AuthDeps) {
  return betterAuth({
    appName: "Pano",
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL],
    database: drizzleAdapter(db, { provider: "pg", schema }),
    databaseHooks: {
      user: {
        create: {
          // Code sign-in creates accounts with an empty name. Posts and
          // comments need something to show, so start from the email.
          async before(user) {
            const local = user.email.split("@")[0] ?? user.email;
            return { data: { ...user, name: user.name || local } };
          },
        },
      },
    },
    session: {
      // A signed copy of the session in a cookie keeps most requests off the
      // database, and off the Hyperdrive query budget, for five minutes.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    rateLimit: {
      enabled: env.ENVIRONMENT === "production",
      // Per-isolate memory would multiply the limits across Workers; the
      // database is the one place a shared counter can live.
      storage: "database",
      customRules: {
        "/email-otp/send-verification-otp": { window: 60, max: 3 },
        "/sign-in/email-otp": { window: 60, max: 10 },
      },
    },
    advanced: {
      // Cloudflare puts the client's address in this header.
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    plugins: [
      emailOTP({
        storeOTP: "hashed",
        async sendVerificationOTP({ email, otp, type }, ctx) {
          if (type !== "sign-in") return;
          await mailer.sendSignInCode({
            to: email,
            code: otp,
            locale: localeFromHeaders(new Headers(ctx?.headers)),
          });
        },
      }),
      organization({ organizationLimit: 1 }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
```

`auth.config.ts`:

```ts
// Read only by the Better Auth CLI (`bun run auth:generate`) to learn which
// plugins are on, so it can write worker/db/schema/auth.ts. The app never
// imports this file.
import { drizzle } from "drizzle-orm/postgres-js";
import { createAuth } from "./worker/auth";
import type { Database } from "./worker/db/client";
import { consoleMailer } from "./worker/mail/mailer";

export const auth = createAuth({
  db: drizzle.mock() as unknown as Database,
  env: {
    HYPERDRIVE: { connectionString: "" },
    BETTER_AUTH_SECRET: "schema-generation-only-not-a-real-secret",
    BETTER_AUTH_URL: "http://localhost:5173",
  },
  mailer: consoleMailer,
});
```

In `tsconfig.node.json`, add `"auth.config.ts"` to `include`:

```json
  "include": [
    "vite.config.ts",
    "vitest.config.ts",
    "drizzle.config.ts",
    "auth.config.ts",
    "test"
  ]
```

- [ ] **Step 5: Generate the schema and its migration**

Run: `bun run auth:generate`

Expected: `🚀 Schema was generated successfully!`. Then `grep -c "^export const" worker/db/schema/auth.ts` counts 14: eight tables (`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`, `rateLimit`) and six relation sets.

`worker/db/schema/index.ts` (full replacement):

```ts
// Better Auth's tables are generated: after changing its plugins in
// worker/auth.ts, run `bun run auth:generate`, then `bun run db:generate`.
export * from "./auth";
```

Run: `bun run db:generate --name=auth`
Expected: `8 tables` and `[✓] Your SQL migration file ➜ drizzle/0001_auth.sql`.

- [ ] **Step 6: Wire Better Auth into the app**

`worker/middleware/auth.ts`:

```ts
import { createMiddleware } from "hono/factory";
import { createAuth } from "../auth";
import type { AppEnv } from "../env";
import { type Mailer, mailerFor } from "../mail/mailer";

/**
 * Builds Better Auth for this request. The mailer is picked only when a code
 * is actually sent, so a missing Brevo key can't break unrelated routes.
 */
export const withAuth = (mailer?: Mailer) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const lazyMailer: Mailer = {
      sendSignInCode: (message) =>
        (mailer ?? mailerFor(c.env)).sendSignInCode(message),
    };
    c.set("auth", createAuth({ db: c.var.db, env: c.env, mailer: lazyMailer }));
    await next();
  });
```

`worker/routes/me.ts`:

```ts
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { SuccessResponse } from "@/shared/envelope";
import { member, organization } from "../db/schema";
import type { AppEnv } from "../env";

type Me = {
  user: { id: string; name: string; email: string } | null;
  workspaces: { id: string; slug: string; name: string; role: string }[];
};

/** Who's signed in, and the workspaces where they're on the team. */
export const meRoutes = new Hono<AppEnv>().get("/", async (c) => {
  const session = await c.var.auth.api.getSession({
    headers: c.req.raw.headers,
  });
  if (!session) {
    return c.json<SuccessResponse<Me>>({
      success: true,
      data: { user: null, workspaces: [] },
    });
  }
  const { id, name, email } = session.user;
  const workspaces = await c.var.db
    .select({
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, id))
    .orderBy(asc(organization.createdAt));
  return c.json<SuccessResponse<Me>>({
    success: true,
    data: { user: { id, name, email }, workspaces },
  });
});
```

`worker/app.ts` (full replacement):

```ts
import { Hono } from "hono";
import type { AppEnv } from "./env";
import { handleError, handleNotFound } from "./lib/errors";
import type { Mailer } from "./mail/mailer";
import { withAuth } from "./middleware/auth";
import { withDb } from "./middleware/db";
import { healthRoutes } from "./routes/health";
import { meRoutes } from "./routes/me";

export type AppDeps = { mailer?: Mailer };

/**
 * The whole API as one chained Hono app, so AppType carries every route.
 * Keep it runtime-agnostic: the browser project typechecks this file through
 * AppType, and tests run it under Node with a capturing mailer. Workers-only
 * code (cron triggers, HTMLRewriter) belongs in index.ts.
 */
export function createApp(deps: AppDeps = {}) {
  const app = new Hono<AppEnv>()
    .basePath("/api")
    .use(withDb)
    .use(withAuth(deps.mailer))
    // Better Auth answers its own routes in its own JSON. The browser calls
    // them through Better Auth's client, not through `unwrap`.
    .on(["GET", "POST"], "/auth/*", (c) => c.var.auth.handler(c.req.raw))
    .route("/health", healthRoutes)
    .route("/me", meRoutes);

  app.onError(handleError);
  app.notFound(handleNotFound);
  return app;
}

const app = createApp();

export type AppType = typeof app;
export default app;
```

In `worker/test/env.ts`, give the test bindings the two auth values:

```ts
  const env: Bindings = {
    HYPERDRIVE: { connectionString },
    BETTER_AUTH_SECRET: "test-only-secret-test-only-secret-0123",
    BETTER_AUTH_URL: "http://localhost",
  };
```

In `test/global-setup.ts`, truncate after migrating, inside the `try`:

```ts
    await migrate(drizzle({ client }), { migrationsFolder: "./drizzle" });
    // Every run starts from empty tables. Tests use unique emails and slugs,
    // so files within a run don't collide either.
    await client.unsafe(
      'TRUNCATE TABLE "user", "organization", "verification", "rate_limit" RESTART IDENTITY CASCADE'
    );
```

- [ ] **Step 7: Give the Worker its auth variables, and let the drift guard catch the gap first**

Run `bun run typecheck` before touching `.dev.vars`.

Expected: FAIL with `error TS2344: Type 'false' does not satisfy the constraint 'true'` in `worker/index.ts`. `Bindings` now requires `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`, but the generated `Env` doesn't have them yet. This is Task 1's guard working.

`.dev.vars.example` (full replacement):

```sh
# Local Worker variables. Copy this file to .dev.vars and set
# BETTER_AUTH_SECRET to the output of `openssl rand -base64 32`.
# Keep .dev.vars even if you empty it: without it, the Vite plugin loads .env
# into the Worker instead.
BETTER_AUTH_SECRET=replace-me
BETTER_AUTH_URL=http://localhost:5173
ENVIRONMENT=development
```

```bash
printf 'BETTER_AUTH_SECRET=%s\nBETTER_AUTH_URL=http://localhost:5173\nENVIRONMENT=development\n' "$(openssl rand -base64 32)" > .dev.vars
bun run cf-typegen
bun run typecheck
```

Expected:
- `worker-configuration.d.ts` now lists `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and `ENVIRONMENT`.
- `tsc -b` exits 0.

In `README.md`, replace the line

```
cp .dev.vars.example .dev.vars  # Worker variables; the file must exist
```

with

```
cp .dev.vars.example .dev.vars  # Worker variables; the file must exist
# then set BETTER_AUTH_SECRET in .dev.vars to: openssl rand -base64 32
```

Then add this bullet to the README's "Layout and rules" list, after the `worker/index.ts` bullet:

```markdown
- `worker/auth.ts`: Better Auth, with email-code sign-in and workspaces as
  organizations. Its routes under `/api/auth/*` answer in Better Auth's JSON,
  so the browser calls them through `authClient`. In local dev, sign-in codes
  print in the terminal running `bun run dev`.
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `bun run test`
Expected: PASS. 12 test files, 58 tests. The Phase 0 tests run through `createApp` now and still pass.

- [ ] **Step 9: Sign in through the real dev server**

This checks the same flow in workerd, through Hyperdrive. Stop any `bun run dev` you have running: Better Auth trusts only `BETTER_AUTH_URL`, so the server must be on port 5173.

```bash
bun run db:migrate
(bun run dev --port 5173 --strictPort > "${TMPDIR:-/tmp}/pano-dev.log" 2>&1 &)
E="dev-$(date +%s)@example.com"; JAR="${TMPDIR:-/tmp}/pano-cookies"
curl -s --retry 40 --retry-connrefused --retry-delay 1 --max-time 60 -o /dev/null http://localhost:5173/api/health
curl -s -w ' [%{http_code}]\n' -H 'content-type: application/json' -H 'origin: http://localhost:5173' -d "{\"email\":\"$E\",\"type\":\"sign-in\"}" http://localhost:5173/api/auth/email-otp/send-verification-otp
CODE=$(grep -o "sign-in code for $E: [0-9]*" "${TMPDIR:-/tmp}/pano-dev.log" | awk '{print $NF}'); echo "code: $CODE"
curl -s -c "$JAR" -o /dev/null -w 'sign-in %{http_code}\n' -H 'content-type: application/json' -H 'origin: http://localhost:5173' -d "{\"email\":\"$E\",\"otp\":\"$CODE\"}" http://localhost:5173/api/auth/sign-in/email-otp
curl -s -b "$JAR" http://localhost:5173/api/me; echo
pkill -f "vite --port 5173"
```

Expected, in order:
- `{"success":true} [200]`
- `code: ` followed by six digits
- `sign-in 200`
- `{"success":true,"data":{"user":{"id":"…","name":"dev-…","email":"dev-…@example.com"},"workspaces":[]}}`

Then run `bun run build` and note the size it prints for `dist/pano/index.js`. It must stay well under the Workers free plan's 3 MB compressed limit; record the number in the ledger.

- [ ] **Step 10: Lint and commit**

```bash
bun run typecheck
bun run check:fix
bun run check
bun run test
git add package.json bun.lock auth.config.ts tsconfig.node.json .dev.vars.example README.md worker-configuration.d.ts drizzle worker/auth.ts worker/env.ts worker/app.ts worker/db/schema worker/middleware/auth.ts worker/routes/me.ts worker/routes/me.test.ts worker/test/app.ts worker/test/env.ts test/global-setup.ts
git commit -m "feat: email-code sign-in with Better Auth, and /api/me" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: everything passes. 12 test files, 58 tests.

---

### Task 4: Shared validation (slugs, field-error keys, request schemas, `validate()`, database error codes)

**Files:**
- Modify: `package.json` (zod, @hono/zod-validator)
- Create: `shared/field-errors.ts`
- Create: `shared/slug.ts`; Test: `shared/slug.test.ts`
- Create: `shared/schemas.ts`; Test: `shared/schemas.test.ts`
- Create: `worker/lib/validate.ts`; Test: `worker/lib/validate.test.ts`
- Create: `worker/db/errors.ts`; Test: `worker/db/errors.test.ts`

**Interfaces:**
- Consumes: `LOCALES` (Task 2); `handleError` (Phase 0).
- Produces:
  - `shared/field-errors.ts`: `FIELD_ERROR_KEYS`, `type FieldErrorKey`, `isFieldErrorKey(value: string): value is FieldErrorKey`
  - `shared/slug.ts`: `slugify(input: string): string`, `RESERVED_SLUGS: ReadonlySet<string>`, `isReservedSlug(slug: string): boolean`
  - `shared/schemas.ts`:
    - `workspaceSlugSchema`, `workspaceNameSchema`, `localeSchema`
    - `createWorkspaceSchema`, `updateWorkspaceSchema`
    - `boardNameSchema`, `createBoardSchema`, `renameBoardSchema`, `reorderBoardsSchema`
    - `emailFormSchema`, `codeFormSchema`
  - `worker/lib/validate.ts`: `validate(target, schema)`. Bad input gets `400 { success: false, code: "BAD_REQUEST", error: "Invalid input", fields }`, with one message per dotted path; form-level problems use the key `_`.
  - `worker/db/errors.ts`: `UNIQUE_VIOLATION = "23505"`, `pgErrorCode(err: unknown): string | undefined`

- [ ] **Step 1: Install zod and the validator**

```bash
bun add zod@^4.6.7 @hono/zod-validator@^0.9.1
```

- [ ] **Step 2: Write the failing tests**

`shared/slug.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isReservedSlug, slugify } from "./slug";

describe("slugify", () => {
  it.each([
    ["Özellik İstekleri", "ozellik-istekleri"],
    ["Çağrı Merkezi Şubesi", "cagri-merkezi-subesi"],
    ["Dark mode!!", "dark-mode"],
    ["  Café  au lait ", "cafe-au-lait"],
    ["Bugs & Problems", "bugs-problems"],
    ["--Hello--World--", "hello-world"],
    ["!!!", ""],
  ])("turns %j into %j", (input, slug) => {
    expect(slugify(input)).toBe(slug);
  });

  it("stops at 40 characters without a trailing hyphen", () => {
    expect(slugify(`${"a".repeat(39)} bcdef`)).toBe("a".repeat(39));
  });
});

describe("isReservedSlug", () => {
  it.each(["api", "signin", "new-workspace", "p"])("reserves %s", (slug) => {
    expect(isReservedSlug(slug)).toBe(true);
  });

  it("leaves ordinary names free", () => {
    expect(isReservedSlug("acme")).toBe(false);
  });
});
```

`shared/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  boardNameSchema,
  codeFormSchema,
  createWorkspaceSchema,
  updateWorkspaceSchema,
  workspaceSlugSchema,
} from "./schemas";

type Parsed = {
  success: boolean;
  error?: { issues: { message: string }[] };
};
const messages = (result: Parsed) =>
  result.error?.issues.map((issue) => issue.message) ?? [];

describe("workspaceSlugSchema", () => {
  it("accepts a plain slug", () => {
    expect(workspaceSlugSchema.safeParse("acme-corp").success).toBe(true);
  });

  it.each(["Acme", "acme_corp", "-acme", "acme--corp", "acme-"])(
    "flags %s as badly formed",
    (slug) => {
      expect(messages(workspaceSlugSchema.safeParse(slug))).toContain(
        "SLUG_FORMAT"
      );
    }
  );

  it("flags a reserved slug", () => {
    expect(messages(workspaceSlugSchema.safeParse("settings"))).toEqual([
      "SLUG_RESERVED",
    ]);
  });
});

describe("createWorkspaceSchema", () => {
  it("accepts a Turkish workspace", () => {
    const input = { name: "Rezerve", slug: "rezerve", defaultLocale: "tr" };
    expect(createWorkspaceSchema.safeParse(input).success).toBe(true);
  });

  it("refuses an unsupported language", () => {
    const input = { name: "Rezerve", slug: "rezerve", defaultLocale: "de" };
    expect(createWorkspaceSchema.safeParse(input).success).toBe(false);
  });
});

describe("updateWorkspaceSchema", () => {
  it("needs at least one change", () => {
    expect(messages(updateWorkspaceSchema.safeParse({}))).toEqual([
      "NOTHING_TO_UPDATE",
    ]);
  });
});

describe("boardNameSchema", () => {
  it("accepts a Turkish name", () => {
    expect(boardNameSchema.safeParse("Özellik istekleri").success).toBe(true);
  });

  it("refuses a name with no letters or digits", () => {
    expect(messages(boardNameSchema.safeParse("!!!"))).toEqual([
      "NAME_NEEDS_LETTERS",
    ]);
  });
});

describe("codeFormSchema", () => {
  it.each(["12345", "1234567", "12a456"])("refuses %s", (code) => {
    expect(messages(codeFormSchema.safeParse({ code }))).toEqual([
      "CODE_FORMAT",
    ]);
  });

  it("accepts six digits", () => {
    expect(codeFormSchema.safeParse({ code: "048213" }).success).toBe(true);
  });
});
```

`worker/lib/validate.test.ts`:

```ts
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { handleError } from "./errors";
import { validate } from "./validate";

const thing = z.object({
  name: z.string().min(2),
  tags: z.array(z.string()).max(1),
});
const app = new Hono().post("/things", validate("json", thing), (c) =>
  c.json({ ok: true, name: c.req.valid("json").name })
);
app.onError(handleError);

const post = (body: string) =>
  app.request("/things", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });

describe("validate", () => {
  it("passes valid input to the handler", async () => {
    const res = await post(JSON.stringify({ name: "ok", tags: [] }));
    expect(await res.json()).toEqual({ ok: true, name: "ok" });
  });

  it("answers invalid input with one message per field", async () => {
    const res = await post(JSON.stringify({ name: "x", tags: ["a", "b"] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      success: false,
      code: "BAD_REQUEST",
      error: "Invalid input",
      fields: { name: expect.any(String), tags: expect.any(String) },
    });
  });

  it("answers malformed JSON with the envelope too", async () => {
    const res = await post("{not json");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      success: false,
      code: "BAD_REQUEST",
    });
  });
});
```

`worker/db/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pgErrorCode } from "./errors";

describe("pgErrorCode", () => {
  it("reads the code from the error itself", () => {
    expect(pgErrorCode({ code: "23505" })).toBe("23505");
  });

  it("finds it further down the cause chain", () => {
    const wrapped = new Error("insert failed", {
      cause: new Error("query failed", { cause: { code: "23505" } }),
    });
    expect(pgErrorCode(wrapped)).toBe("23505");
  });

  it("ignores codes that aren't Postgres codes", () => {
    expect(pgErrorCode({ code: "ORGANIZATION_ALREADY_EXISTS" })).toBeUndefined();
  });

  it("returns undefined for things that aren't errors", () => {
    expect(pgErrorCode("boom")).toBeUndefined();
    expect(pgErrorCode(null)).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `bun run test shared/slug.test.ts shared/schemas.test.ts worker/lib/validate.test.ts worker/db/errors.test.ts`
Expected: FAIL. All four files fail to import their modules.

- [ ] **Step 4: Write the shared validation and the server helpers**

`shared/field-errors.ts`:

```ts
/**
 * Stable keys that the API and the forms use instead of English messages, so
 * the UI can translate them. Zod's own messages (too short, not an email)
 * already come translated from its locale, so they need no keys.
 */
export const FIELD_ERROR_KEYS = [
  "SLUG_FORMAT",
  "SLUG_RESERVED",
  "SLUG_TAKEN",
  "NAME_NEEDS_LETTERS",
  "BOARD_EXISTS",
  "ORDER_MISMATCH",
  "NOTHING_TO_UPDATE",
  "CODE_FORMAT",
] as const;

export type FieldErrorKey = (typeof FIELD_ERROR_KEYS)[number];

export function isFieldErrorKey(value: string): value is FieldErrorKey {
  return (FIELD_ERROR_KEYS as readonly string[]).includes(value);
}
```

`shared/slug.ts`:

```ts
// Turkish letters that NFKD can't fold: ı has no decomposition, and İ
// lowercases to "i̇" (i plus a combining dot). Map them first.
const TURKISH: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  İ: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  Ç: "c",
  Ğ: "g",
  Ö: "o",
  Ş: "s",
  Ü: "u",
};

/**
 * A URL-safe slug: Turkish-aware, lowercase ASCII letters and digits joined by
 * single hyphens, at most 40 characters.
 */
export function slugify(input: string): string {
  return input
    .replace(/[çğıİöşüÇĞÖŞÜ]/g, (ch) => TURKISH[ch] ?? ch)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

/**
 * Top-level paths the app uses, plus names that would read as Pano's own. A
 * workspace can't take them.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "about",
  "admin",
  "api",
  "app",
  "assets",
  "auth",
  "blog",
  "cdn-cgi",
  "docs",
  "help",
  "login",
  "logout",
  "me",
  "new",
  "new-workspace",
  "p",
  "pricing",
  "settings",
  "sign-in",
  "sign-up",
  "signin",
  "signup",
  "static",
  "www",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}
```

`shared/schemas.ts`:

```ts
import { z } from "zod";
import type { FieldErrorKey } from "./field-errors";
import { LOCALES } from "./locale";
import { isReservedSlug, slugify } from "./slug";

/** A field-error key as a zod issue message, checked at compile time. */
const key = (error: FieldErrorKey) => ({ error });

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const workspaceSlugSchema = z
  .string()
  .trim()
  .min(3)
  .max(40)
  .regex(SLUG_PATTERN, key("SLUG_FORMAT"))
  .refine((slug) => !isReservedSlug(slug), key("SLUG_RESERVED"));

export const workspaceNameSchema = z.string().trim().min(2).max(60);
export const localeSchema = z.enum(LOCALES);

export const createWorkspaceSchema = z.object({
  name: workspaceNameSchema,
  slug: workspaceSlugSchema,
  defaultLocale: localeSchema,
});

export const updateWorkspaceSchema = z
  .object({
    name: workspaceNameSchema.optional(),
    defaultLocale: localeSchema.optional(),
  })
  .refine(
    (update) => update.name !== undefined || update.defaultLocale !== undefined,
    key("NOTHING_TO_UPDATE")
  );

export const boardNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .refine((name) => slugify(name).length >= 2, key("NAME_NEEDS_LETTERS"));

export const createBoardSchema = z.object({ name: boardNameSchema });
export const renameBoardSchema = z.object({ name: boardNameSchema });
export const reorderBoardsSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(50),
});

export const emailFormSchema = z.object({ email: z.email() });
export const codeFormSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, key("CODE_FORMAT")),
});
```

`worker/lib/validate.ts`:

```ts
import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";
import type { ErrorResponse } from "@/shared/envelope";

/**
 * @hono/zod-validator, answering bad input with the error envelope: one
 * message per field (the first issue wins), keyed by its dotted path, with
 * form-level problems under "_". Where the schema sets a field-error key,
 * that key is the message.
 */
export const validate = <
  Target extends keyof ValidationTargets,
  Schema extends ZodType,
>(
  target: Target,
  schema: Schema
) =>
  zValidator(target, schema, (result, c) => {
    if (result.success) return;
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.map(String).join(".") || "_";
      fields[path] ??= issue.message;
    }
    return c.json<ErrorResponse>(
      { success: false, code: "BAD_REQUEST", error: "Invalid input", fields },
      400
    );
  });
```

`worker/db/errors.ts`:

```ts
/** Postgres error codes the app reacts to by name rather than by message. */
export const UNIQUE_VIOLATION = "23505";

const SQLSTATE = /^[0-9A-Z]{5}$/;

/**
 * The Postgres error code on an error or anywhere down its `cause` chain:
 * postgres.js puts it on its own error, Drizzle wraps that in a
 * DrizzleQueryError, and Better Auth may wrap it again.
 */
export function pgErrorCode(err: unknown): string | undefined {
  let current = err;
  for (let depth = 0; depth < 5; depth++) {
    if (typeof current !== "object" || current === null) return undefined;
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && SQLSTATE.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test`
Expected: PASS. 16 test files, 94 tests.

- [ ] **Step 6: Typecheck, lint and commit**

```bash
bun run typecheck
bun run check:fix
bun run check
git add package.json bun.lock shared/field-errors.ts shared/slug.ts shared/slug.test.ts shared/schemas.ts shared/schemas.test.ts worker/lib/validate.ts worker/lib/validate.test.ts worker/db/errors.ts worker/db/errors.test.ts
git commit -m "feat: shared validation with Turkish-aware slugs and field-error keys" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `tsc -b` exits 0 and Biome passes.

---

### Task 5: Workspaces API

**Files:**
- Modify: `shared/envelope.ts` (add `WORKSPACE_LIMIT`)
- Create: `worker/db/schema/workspaces.ts`; Modify: `worker/db/schema/index.ts`; Create (generated): `drizzle/0002_workspaces.sql`
- Create: `worker/middleware/session.ts`, `worker/middleware/team.ts`
- Create: `worker/routes/workspaces.ts`
- Modify: `worker/app.ts` (add `csrf()` and the route)
- Test: `worker/routes/workspaces.test.ts`

**Interfaces:**
- Consumes:
  - `Auth` and the `/api/me` shape (Task 3)
  - `validate`, `createWorkspaceSchema`, `updateWorkspaceSchema`, `pgErrorCode` and `UNIQUE_VIOLATION` (Task 4)
  - `testApp` (Task 3)
- Produces:
  - `ApiErrorCode` gains `"WORKSPACE_LIMIT"`.
  - `worker/middleware/session.ts`: `requireUser`, which answers 401 or sets `c.var.user`. Also `type SessionUser = { id; name; email }`.
  - `worker/middleware/team.ts`: `requireTeam`. It runs after `requireUser` and reads `:slug`. It answers 404 if the workspace doesn't exist and 403 if the person isn't on its team; otherwise it sets `c.var.workspace`. Also `type TeamWorkspace = { id; slug; name; role }`.
  - `workspaceSettings` table: `organization_id` PK, `default_locale`, `created_at`.
  - `type WorkspaceSummary = { id: string; slug: string; name: string; defaultLocale: Locale }`, exported from `worker/routes/workspaces.ts`.
  - Routes:
    - `POST /api/workspaces` → 201 `SuccessResponse<WorkspaceSummary>`
    - `GET /api/workspaces/:slug` → 200 `SuccessResponse<WorkspaceSummary>` (Task 6 adds `boards`)
    - `PATCH /api/workspaces/:slug` → 200 `SuccessResponse<WorkspaceSummary>`

- [ ] **Step 1: Write the failing tests**

`worker/routes/workspaces.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { testApp } from "../test/app";

const uniqueSlug = () => `ws-${crypto.randomUUID().slice(0, 8)}`;

async function createWorkspace(
  t: ReturnType<typeof testApp>,
  cookie: string,
  slug = uniqueSlug(),
  name = "Acme"
) {
  return t.client.api.workspaces.$post(
    { json: { name, slug, defaultLocale: "en" } },
    { headers: { cookie } }
  );
}

describe("POST /api/workspaces", () => {
  it("creates a workspace and makes its creator the owner", async () => {
    const t = testApp();
    const { cookie } = await t.signIn();
    const slug = uniqueSlug();

    const res = await t.client.api.workspaces.$post(
      { json: { name: "Rezerve", slug, defaultLocale: "tr" } },
      { headers: { cookie } }
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      success: true,
      data: { id: expect.any(String), slug, name: "Rezerve", defaultLocale: "tr" },
    });

    const me = await t.client.api.me.$get(undefined, { headers: { cookie } });
    expect(await me.json()).toMatchObject({
      data: { workspaces: [{ slug, name: "Rezerve", role: "owner" }] },
    });
    await t.settle();
  });

  it("needs a signed-in user", async () => {
    const t = testApp();
    const res = await t.client.api.workspaces.$post({
      json: { name: "Acme", slug: uniqueSlug(), defaultLocale: "en" },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      success: false,
      code: "UNAUTHORIZED",
    });
    await t.settle();
  });

  it.each([
    ["settings", "SLUG_RESERVED"],
    ["Bad Slug", "SLUG_FORMAT"],
  ])("refuses the address %j with %s", async (slug, error) => {
    const t = testApp();
    const { cookie } = await t.signIn();
    const res = await createWorkspace(t, cookie, slug);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "BAD_REQUEST",
      fields: { slug: error },
    });
    await t.settle();
  });

  it("refuses an address another workspace has", async () => {
    const t = testApp();
    const slug = uniqueSlug();
    const first = await t.signIn();
    await createWorkspace(t, first.cookie, slug, "One");
    const second = await t.signIn();

    const res = await createWorkspace(t, second.cookie, slug, "Two");
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      code: "CONFLICT",
      fields: { slug: "SLUG_TAKEN" },
    });
    await t.settle();
  });

  it("gives each account one workspace", async () => {
    const t = testApp();
    const { cookie } = await t.signIn();
    await createWorkspace(t, cookie);
    const res = await createWorkspace(t, cookie);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "WORKSPACE_LIMIT" });
    await t.settle();
  });

  it("lets exactly one of two simultaneous claims on an address win", async () => {
    const t = testApp();
    const slug = uniqueSlug();
    const users = await Promise.all([t.signIn(), t.signIn()]);
    const responses = await Promise.all(
      users.map((user) => createWorkspace(t, user.cookie, slug, "Race"))
    );
    expect(responses.map((res) => res.status).sort()).toEqual([201, 409]);
    await t.settle();
  });

  it("turns away a cross-site form post", async () => {
    const t = testApp();
    const { cookie } = await t.signIn();
    const res = await t.request("/api/workspaces", {
      method: "POST",
      headers: {
        cookie,
        origin: "https://evil.example",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "name=Evil&slug=evil-co&defaultLocale=en",
    });
    expect(res.status).toBe(403);
    await t.settle();
  });
});

describe("GET /api/workspaces/:slug", () => {
  it("shows a workspace to anyone", async () => {
    const t = testApp();
    const { cookie } = await t.signIn();
    const slug = uniqueSlug();
    await createWorkspace(t, cookie, slug);

    const res = await t.client.api.workspaces[":slug"].$get({ param: { slug } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: { slug, name: "Acme", defaultLocale: "en" },
    });
    await t.settle();
  });

  it("answers 404 for an unknown address", async () => {
    const t = testApp();
    const res = await t.client.api.workspaces[":slug"].$get({
      param: { slug: uniqueSlug() },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
    await t.settle();
  });
});

describe("PATCH /api/workspaces/:slug", () => {
  it("lets the team rename it and change its language", async () => {
    const t = testApp();
    const { cookie } = await t.signIn();
    const slug = uniqueSlug();
    await createWorkspace(t, cookie, slug);

    const res = await t.client.api.workspaces[":slug"].$patch(
      { param: { slug }, json: { name: "Acme Türkiye", defaultLocale: "tr" } },
      { headers: { cookie } }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: { slug, name: "Acme Türkiye", defaultLocale: "tr" },
    });
    await t.settle();
  });

  it("refuses someone outside the team", async () => {
    const t = testApp();
    const owner = await t.signIn();
    const slug = uniqueSlug();
    await createWorkspace(t, owner.cookie, slug);
    const outsider = await t.signIn();

    const res = await t.client.api.workspaces[":slug"].$patch(
      { param: { slug }, json: { name: "Taken over" } },
      { headers: { cookie: outsider.cookie } }
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    await t.settle();
  });

  it("needs a signed-in user", async () => {
    const t = testApp();
    const res = await t.client.api.workspaces[":slug"].$patch({
      param: { slug: uniqueSlug() },
      json: { name: "Nope" },
    });
    expect(res.status).toBe(401);
    await t.settle();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test worker/routes/workspaces.test.ts`
Expected: FAIL. The route doesn't exist yet, so every request gets the 404 envelope and each status assertion fails, e.g. `expected 404 to be 201`. One test is the exception: "answers 404 for an unknown address" already passes, through the app's not-found handler. It stays to pin that the new route keeps that answer.

- [ ] **Step 3: Add the error code, the settings table and its migration**

In `shared/envelope.ts`, add `| "WORKSPACE_LIMIT"` as the last member of `ApiErrorCode`, right after `"INTERNAL_ERROR"`.

`worker/db/schema/workspaces.ts`:

```ts
import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization } from "./auth";

/**
 * What Pano adds to a Better Auth organization. One row per workspace; a
 * missing row reads as the defaults.
 */
export const workspaceSettings = pgTable(
  "workspace_settings",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organization.id, { onDelete: "cascade" }),
    defaultLocale: text("default_locale", { enum: ["en", "tr"] })
      .notNull()
      .default("en"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "workspace_settings_default_locale_check",
      sql`${table.defaultLocale} in ('en', 'tr')`
    ),
  ]
);
```

Add `export * from "./workspaces";` to `worker/db/schema/index.ts`, below the `./auth` line.

Run: `bun run db:generate --name=workspaces`
Expected: `[✓] Your SQL migration file ➜ drizzle/0002_workspaces.sql`, containing one `CREATE TABLE "workspace_settings"`.

- [ ] **Step 4: Write the session and team middleware**

`worker/middleware/session.ts`:

```ts
import { createMiddleware } from "hono/factory";
import type { AppEnv, Bindings } from "../env";
import { AppError } from "../lib/errors";

export type SessionUser = { id: string; name: string; email: string };

export type UserEnv = {
  Bindings: Bindings;
  Variables: AppEnv["Variables"] & { user: SessionUser };
};

/** Answers 401 unless the request carries a valid session; sets c.var.user. */
export const requireUser = createMiddleware<UserEnv>(async (c, next) => {
  const session = await c.var.auth.api.getSession({
    headers: c.req.raw.headers,
  });
  if (!session) throw new AppError(401, "UNAUTHORIZED", "Sign in first");
  const { id, name, email } = session.user;
  c.set("user", { id, name, email });
  await next();
});
```

`worker/middleware/team.ts`:

```ts
import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { member, organization } from "../db/schema";
import type { AppEnv, Bindings } from "../env";
import { AppError } from "../lib/errors";
import type { SessionUser } from "./session";

export type TeamWorkspace = {
  id: string;
  slug: string;
  name: string;
  role: string;
};

type TeamEnv = {
  Bindings: Bindings;
  Variables: AppEnv["Variables"] & {
    user: SessionUser;
    workspace: TeamWorkspace;
  };
};

/**
 * For routes under /workspaces/:slug that only the workspace's team may use;
 * runs after requireUser. Any membership counts: owner, admin or member.
 * Unknown workspace → 404. Signed in but not on the team → 403.
 */
export const requireTeam = createMiddleware<TeamEnv>(async (c, next) => {
  const slug = c.req.param("slug") ?? "";
  const [row] = await c.var.db
    .select({
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      role: member.role,
    })
    .from(organization)
    .leftJoin(
      member,
      and(
        eq(member.organizationId, organization.id),
        eq(member.userId, c.var.user.id)
      )
    )
    .where(eq(organization.slug, slug))
    .limit(1);
  if (!row) throw new AppError(404, "NOT_FOUND", "Workspace not found");
  if (!row.role) {
    throw new AppError(403, "FORBIDDEN", "Only the workspace team can do that");
  }
  c.set("workspace", {
    id: row.id,
    slug: row.slug,
    name: row.name,
    role: row.role,
  });
  await next();
});
```

- [ ] **Step 5: Write the workspace routes and mount them**

`worker/routes/workspaces.ts`:

```ts
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { SuccessResponse } from "@/shared/envelope";
import type { Locale } from "@/shared/locale";
import { createWorkspaceSchema, updateWorkspaceSchema } from "@/shared/schemas";
import type { Auth } from "../auth";
import type { Database } from "../db/client";
import { pgErrorCode, UNIQUE_VIOLATION } from "../db/errors";
import { organization, workspaceSettings } from "../db/schema";
import type { AppEnv } from "../env";
import { AppError } from "../lib/errors";
import { validate } from "../lib/validate";
import { requireUser } from "../middleware/session";
import { requireTeam } from "../middleware/team";

export type WorkspaceSummary = {
  id: string;
  slug: string;
  name: string;
  defaultLocale: Locale;
};

const slugTaken = () =>
  new AppError(409, "CONFLICT", "That address is taken", {
    slug: "SLUG_TAKEN",
  });

/** Better Auth's createOrganization, with its refusals turned into ours. */
async function createOrganization(
  auth: Auth,
  headers: Headers,
  name: string,
  slug: string
) {
  try {
    const org = await auth.api.createOrganization({
      body: { name, slug },
      headers,
    });
    if (!org) throw new Error("Better Auth returned no organization");
    return org;
  } catch (err) {
    if (err instanceof APIError) {
      const code = (err.body as { code?: string } | undefined)?.code;
      if (code === "ORGANIZATION_ALREADY_EXISTS") throw slugTaken();
      if (code === "YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS") {
        throw new AppError(409, "WORKSPACE_LIMIT", "One workspace per account");
      }
    }
    // Two people claiming one address at once can both pass Better Auth's
    // own check; the unique index on organization.slug settles it.
    if (pgErrorCode(err) === UNIQUE_VIOLATION) throw slugTaken();
    throw err;
  }
}

async function findWorkspace(
  db: Database,
  slug: string
): Promise<WorkspaceSummary> {
  const [row] = await db
    .select({
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      defaultLocale: workspaceSettings.defaultLocale,
    })
    .from(organization)
    .leftJoin(
      workspaceSettings,
      eq(workspaceSettings.organizationId, organization.id)
    )
    .where(eq(organization.slug, slug))
    .limit(1);
  if (!row) throw new AppError(404, "NOT_FOUND", "Workspace not found");
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    defaultLocale: row.defaultLocale ?? "en",
  };
}

export const workspaceRoutes = new Hono<AppEnv>()
  .post("/", requireUser, validate("json", createWorkspaceSchema), async (c) => {
    const { name, slug, defaultLocale } = c.req.valid("json");
    const org = await createOrganization(
      c.var.auth,
      c.req.raw.headers,
      name,
      slug
    );
    // Not in one transaction with Better Auth's insert: if this fails, the
    // workspace reads as the defaults and PATCH writes the row later.
    await c.var.db
      .insert(workspaceSettings)
      .values({ organizationId: org.id, defaultLocale })
      .onConflictDoNothing();
    return c.json<SuccessResponse<WorkspaceSummary>>(
      {
        success: true,
        data: { id: org.id, slug: org.slug, name: org.name, defaultLocale },
      },
      201
    );
  })
  .get("/:slug", async (c) => {
    const workspace = await findWorkspace(c.var.db, c.req.param("slug"));
    return c.json<SuccessResponse<WorkspaceSummary>>({
      success: true,
      data: workspace,
    });
  })
  .patch(
    "/:slug",
    requireUser,
    requireTeam,
    validate("json", updateWorkspaceSchema),
    async (c) => {
      const { name, defaultLocale } = c.req.valid("json");
      const { id, slug } = c.var.workspace;
      if (name !== undefined) {
        await c.var.db
          .update(organization)
          .set({ name })
          .where(eq(organization.id, id));
      }
      if (defaultLocale !== undefined) {
        await c.var.db
          .insert(workspaceSettings)
          .values({ organizationId: id, defaultLocale })
          .onConflictDoUpdate({
            target: workspaceSettings.organizationId,
            set: { defaultLocale },
          });
      }
      return c.json<SuccessResponse<WorkspaceSummary>>({
        success: true,
        data: await findWorkspace(c.var.db, slug),
      });
    }
  );
```

In `worker/app.ts`, import `csrf` and the routes:

```ts
import { csrf } from "hono/csrf";
```

```ts
import { workspaceRoutes } from "./routes/workspaces";
```

Then change the chain so that `csrf()` runs first and the workspaces routes are mounted last:

```ts
  const app = new Hono<AppEnv>()
    .basePath("/api")
    // Refuses cross-site form posts. JSON requests already need a CORS
    // preflight, which a foreign site can't pass.
    .use(csrf())
    .use(withDb)
    .use(withAuth(deps.mailer))
    // Better Auth answers its own routes in its own JSON. The browser calls
    // them through Better Auth's client, not through `unwrap`.
    .on(["GET", "POST"], "/auth/*", (c) => c.var.auth.handler(c.req.raw))
    .route("/health", healthRoutes)
    .route("/me", meRoutes)
    .route("/workspaces", workspaceRoutes);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun run test`
Expected: PASS. 17 test files, 107 tests.

- [ ] **Step 7: Typecheck, lint and commit**

```bash
bun run typecheck
bun run check:fix
bun run check
git add shared/envelope.ts worker/db/schema drizzle worker/middleware/session.ts worker/middleware/team.ts worker/routes/workspaces.ts worker/routes/workspaces.test.ts worker/app.ts
git commit -m "feat: workspaces API with reserved and race-safe addresses" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `tsc -b` exits 0 and Biome passes.

---

### Task 6: Boards API

**Files:**
- Create: `worker/db/schema/boards.ts`; Modify: `worker/db/schema/index.ts`; Create (generated): `drizzle/0003_boards.sql`
- Modify: `worker/routes/workspaces.ts` (board routes; GET includes boards)
- Test: `worker/routes/boards.test.ts`

**Interfaces:**
- Consumes:
  - `requireUser`, `requireTeam`, `findWorkspace` and `workspaceRoutes` (Task 5)
  - `slugify`, `createBoardSchema`, `renameBoardSchema`, `reorderBoardsSchema`, `pgErrorCode` (Task 4)
- Produces:
  - The `boards` table.
  - `type Board = { id: string; slug: string; name: string; position: number }`
  - `type WorkspaceView = WorkspaceSummary & { boards: Board[] }`
  - Routes:
    - `GET /api/workspaces/:slug` → `SuccessResponse<WorkspaceView>`, with boards ordered by position
    - `POST /api/workspaces/:slug/boards {name}` → 201 `SuccessResponse<Board>`
    - `PATCH /api/workspaces/:slug/boards/:boardId {name}` → `SuccessResponse<Board>`
    - `DELETE /api/workspaces/:slug/boards/:boardId` → `SuccessResponse<{ id: string }>`
    - `PUT /api/workspaces/:slug/boards/order {ids}` → `SuccessResponse<Board[]>`

- [ ] **Step 1: Write the failing tests**

`worker/routes/boards.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { testApp } from "../test/app";

type T = ReturnType<typeof testApp>;

async function workspaceWithOwner(t: T) {
  const owner = await t.signIn();
  const slug = `ws-${crypto.randomUUID().slice(0, 8)}`;
  const res = await t.client.api.workspaces.$post(
    { json: { name: "Acme", slug, defaultLocale: "en" } },
    { headers: { cookie: owner.cookie } }
  );
  if (res.status !== 201) throw new Error(`setup failed: ${res.status}`);
  return { slug, cookie: owner.cookie };
}

async function addBoard(t: T, slug: string, cookie: string, name: string) {
  const res = await t.client.api.workspaces[":slug"].boards.$post(
    { param: { slug }, json: { name } },
    { headers: { cookie } }
  );
  if (res.status !== 201) throw new Error(`board setup failed: ${res.status}`);
  const body = (await res.json()) as { data: { id: string } };
  return body.data.id;
}

async function boardNames(t: T, slug: string) {
  const res = await t.client.api.workspaces[":slug"].$get({ param: { slug } });
  const body = (await res.json()) as { data: { boards: { name: string }[] } };
  return body.data.boards.map((board) => board.name);
}

describe("boards", () => {
  it("lets the team add a board, slugged from its Turkish name", async () => {
    const t = testApp();
    const { slug, cookie } = await workspaceWithOwner(t);

    const res = await t.client.api.workspaces[":slug"].boards.$post(
      { param: { slug }, json: { name: "Özellik İstekleri" } },
      { headers: { cookie } }
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      success: true,
      data: {
        id: expect.any(String),
        slug: "ozellik-istekleri",
        name: "Özellik İstekleri",
        position: 0,
      },
    });
    expect(await boardNames(t, slug)).toEqual(["Özellik İstekleri"]);
    await t.settle();
  });

  it("refuses a second board with the same name", async () => {
    const t = testApp();
    const { slug, cookie } = await workspaceWithOwner(t);
    await addBoard(t, slug, cookie, "Bugs");

    const res = await t.client.api.workspaces[":slug"].boards.$post(
      { param: { slug }, json: { name: "bugs" } },
      { headers: { cookie } }
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      code: "CONFLICT",
      fields: { name: "BOARD_EXISTS" },
    });
    await t.settle();
  });

  it("keeps board changes to the team", async () => {
    const t = testApp();
    const { slug } = await workspaceWithOwner(t);
    const outsider = await t.signIn();
    const add = (cookie?: string) =>
      t.client.api.workspaces[":slug"].boards.$post(
        { param: { slug }, json: { name: "Ideas" } },
        cookie ? { headers: { cookie } } : undefined
      );

    expect((await add(outsider.cookie)).status).toBe(403);
    expect((await add()).status).toBe(401);
    const unknown = await t.client.api.workspaces[":slug"].boards.$post(
      { param: { slug: "no-such-workspace" }, json: { name: "Ideas" } },
      { headers: { cookie: outsider.cookie } }
    );
    expect(unknown.status).toBe(404);
    await t.settle();
  });

  it("renames a board but keeps its address", async () => {
    const t = testApp();
    const { slug, cookie } = await workspaceWithOwner(t);
    const boardId = await addBoard(t, slug, cookie, "Ideas");

    const res = await t.client.api.workspaces[":slug"].boards[":boardId"].$patch(
      { param: { slug, boardId }, json: { name: "Feature ideas" } },
      { headers: { cookie } }
    );
    expect(await res.json()).toMatchObject({
      data: { id: boardId, slug: "ideas", name: "Feature ideas" },
    });
    await t.settle();
  });

  it("deletes a board, but only from its own workspace", async () => {
    const t = testApp();
    const first = await workspaceWithOwner(t);
    const second = await workspaceWithOwner(t);
    const boardId = await addBoard(t, first.slug, first.cookie, "Ideas");

    const sneaky = await t.client.api.workspaces[":slug"].boards[
      ":boardId"
    ].$delete(
      { param: { slug: second.slug, boardId } },
      { headers: { cookie: second.cookie } }
    );
    expect(sneaky.status).toBe(404);

    const res = await t.client.api.workspaces[":slug"].boards[
      ":boardId"
    ].$delete(
      { param: { slug: first.slug, boardId } },
      { headers: { cookie: first.cookie } }
    );
    expect(res.status).toBe(200);
    expect(await boardNames(t, first.slug)).toEqual([]);
    await t.settle();
  });

  it("reorders boards", async () => {
    const t = testApp();
    const { slug, cookie } = await workspaceWithOwner(t);
    const a = await addBoard(t, slug, cookie, "Alpha");
    const b = await addBoard(t, slug, cookie, "Beta");
    const c = await addBoard(t, slug, cookie, "Gamma");

    const res = await t.client.api.workspaces[":slug"].boards.order.$put(
      { param: { slug }, json: { ids: [c, a, b] } },
      { headers: { cookie } }
    );
    expect(res.status).toBe(200);
    expect(await boardNames(t, slug)).toEqual(["Gamma", "Alpha", "Beta"]);
    await t.settle();
  });

  it("refuses an order that doesn't list every board once", async () => {
    const t = testApp();
    const { slug, cookie } = await workspaceWithOwner(t);
    const a = await addBoard(t, slug, cookie, "Alpha");
    const b = await addBoard(t, slug, cookie, "Beta");
    await addBoard(t, slug, cookie, "Gamma");

    for (const ids of [
      [a, b],
      [a, a, b],
    ]) {
      const res = await t.client.api.workspaces[":slug"].boards.order.$put(
        { param: { slug }, json: { ids } },
        { headers: { cookie } }
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({
        fields: { ids: "ORDER_MISMATCH" },
      });
    }
    await t.settle();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test worker/routes/boards.test.ts`
Expected: FAIL. The board routes don't exist yet, so the first board setup throws `board setup failed: 404`, and the first test gets 404 where it expects 201.

- [ ] **Step 3: Add the boards table and its migration**

`worker/db/schema/boards.ts`:

```ts
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";

export const boards = pgTable(
  "boards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // From the name at creation, then fixed, so ?board= links keep working
    // after a rename.
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("boards_organization_slug_unique").on(
      table.organizationId,
      table.slug
    ),
    index("boards_organization_position_idx").on(
      table.organizationId,
      table.position
    ),
  ]
);
```

Add `export * from "./boards";` to `worker/db/schema/index.ts`.

Run: `bun run db:generate --name=boards`
Expected: `[✓] Your SQL migration file ➜ drizzle/0003_boards.sql`, with `CREATE TABLE "boards"`, the unique constraint and the index.

- [ ] **Step 4: Add the board routes**

In `worker/routes/workspaces.ts`:

1. Replace the `drizzle-orm` import with:
   ```ts
   import { and, asc, eq, sql } from "drizzle-orm";
   ```
   and add these imports:
   ```ts
   import { z } from "zod";
   import { slugify } from "@/shared/slug";
   ```
2. Add `createBoardSchema`, `renameBoardSchema` and `reorderBoardsSchema` to the `@/shared/schemas` import.
3. Change the schema import to `import { boards, organization, workspaceSettings } from "../db/schema";`.

Below the `WorkspaceSummary` type, add:

```ts
export type Board = { id: string; slug: string; name: string; position: number };
export type WorkspaceView = WorkspaceSummary & { boards: Board[] };

const boardColumns = {
  id: boards.id,
  slug: boards.slug,
  name: boards.name,
  position: boards.position,
};

const boardParamSchema = z.object({ slug: z.string(), boardId: z.uuid() });

const boardNotFound = () =>
  new AppError(404, "NOT_FOUND", "Board not found");

async function listBoards(
  db: Pick<Database, "select">,
  workspaceId: string
): Promise<Board[]> {
  return db
    .select(boardColumns)
    .from(boards)
    .where(eq(boards.organizationId, workspaceId))
    .orderBy(asc(boards.position), asc(boards.createdAt));
}
```

Replace the `.get("/:slug", …)` handler so it includes the boards:

```ts
  .get("/:slug", async (c) => {
    const workspace = await findWorkspace(c.var.db, c.req.param("slug"));
    const list = await listBoards(c.var.db, workspace.id);
    return c.json<SuccessResponse<WorkspaceView>>({
      success: true,
      data: { ...workspace, boards: list },
    });
  })
```

Append these four routes to the end of the `workspaceRoutes` chain, after `.patch("/:slug", …)`:

```ts
  .post(
    "/:slug/boards",
    requireUser,
    requireTeam,
    validate("json", createBoardSchema),
    async (c) => {
      const { name } = c.req.valid("json");
      const workspaceId = c.var.workspace.id;
      try {
        const [board] = await c.var.db
          .insert(boards)
          .values({
            organizationId: workspaceId,
            slug: slugify(name),
            name,
            // New boards go last.
            position: sql`(select coalesce(max(${boards.position}), -1) + 1 from ${boards} where ${boards.organizationId} = ${workspaceId})`,
          })
          .returning(boardColumns);
        return c.json<SuccessResponse<Board>>(
          { success: true, data: board! },
          201
        );
      } catch (err) {
        if (pgErrorCode(err) === UNIQUE_VIOLATION) {
          throw new AppError(409, "CONFLICT", "A board with that name exists", {
            name: "BOARD_EXISTS",
          });
        }
        throw err;
      }
    }
  )
  .patch(
    "/:slug/boards/:boardId",
    requireUser,
    requireTeam,
    validate("param", boardParamSchema),
    validate("json", renameBoardSchema),
    async (c) => {
      const { boardId } = c.req.valid("param");
      const { name } = c.req.valid("json");
      const [board] = await c.var.db
        .update(boards)
        .set({ name })
        .where(
          and(
            eq(boards.id, boardId),
            eq(boards.organizationId, c.var.workspace.id)
          )
        )
        .returning(boardColumns);
      if (!board) throw boardNotFound();
      return c.json<SuccessResponse<Board>>({ success: true, data: board });
    }
  )
  .delete(
    "/:slug/boards/:boardId",
    requireUser,
    requireTeam,
    validate("param", boardParamSchema),
    async (c) => {
      const { boardId } = c.req.valid("param");
      const [deleted] = await c.var.db
        .delete(boards)
        .where(
          and(
            eq(boards.id, boardId),
            eq(boards.organizationId, c.var.workspace.id)
          )
        )
        .returning({ id: boards.id });
      if (!deleted) throw boardNotFound();
      return c.json<SuccessResponse<{ id: string }>>({
        success: true,
        data: deleted,
      });
    }
  )
  .put(
    "/:slug/boards/order",
    requireUser,
    requireTeam,
    validate("json", reorderBoardsSchema),
    async (c) => {
      const { ids } = c.req.valid("json");
      const workspaceId = c.var.workspace.id;
      const ordered = await c.var.db.transaction(async (tx) => {
        // Lock the workspace's boards so two reorders can't interleave.
        const current = await tx
          .select({ id: boards.id })
          .from(boards)
          .where(eq(boards.organizationId, workspaceId))
          .for("update");
        const known = new Set(current.map((board) => board.id));
        const listsEachOnce =
          ids.length === known.size &&
          new Set(ids).size === ids.length &&
          ids.every((id) => known.has(id));
        if (!listsEachOnce) {
          throw new AppError(
            400,
            "BAD_REQUEST",
            "The order must list every board once",
            { ids: "ORDER_MISMATCH" }
          );
        }
        for (const [position, id] of ids.entries()) {
          await tx.update(boards).set({ position }).where(eq(boards.id, id));
        }
        return listBoards(tx, workspaceId);
      });
      return c.json<SuccessResponse<Board[]>>({ success: true, data: ordered });
    }
  );
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run test`
Expected: PASS. 18 test files, 114 tests.

- [ ] **Step 6: Typecheck, lint and commit**

```bash
bun run typecheck
bun run check:fix
bun run check
git add worker/db/schema drizzle worker/routes/workspaces.ts worker/routes/boards.test.ts
git commit -m "feat: boards API with Turkish-aware slugs and reordering" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `tsc -b` exits 0 and Biome passes.

---

### Task 7: Sign-in page, header and language switching

**Files:**
- Modify: `package.json` (@tanstack/react-form)
- Create (generated by shadcn): `src/components/ui/input.tsx`, `src/components/ui/label.tsx`
- Create: `src/lib/auth-client.ts`, `src/lib/session.ts`, `src/i18n/cookie.ts`
- Create: `src/lib/redirect.ts`, `src/lib/error-text.ts`, `src/i18n/resolve.ts`
- Test: `src/lib/redirect.test.ts`, `src/lib/error-text.test.ts`, `src/i18n/resolve.test.ts`
- Modify: `src/i18n/provider.tsx` (language controls), `src/i18n/messages/en.json`, `src/i18n/messages/tr.json`
- Create: `src/components/field-error.tsx`, `src/components/language-switcher.tsx`, `src/components/site-header.tsx`
- Modify: `src/routes/__root.tsx` (layout), `src/routes/index.tsx` (landing)
- Create: `src/routes/signin.tsx`; regenerated: `src/routeTree.gen.ts`

**Interfaces:**
- Consumes:
  - `api`, `unwrap` and `ApiError` (Phase 0)
  - `emailFormSchema`, `codeFormSchema`, `isFieldErrorKey` and `FieldErrorKey` (Task 4)
  - the locale helpers (Task 2)
  - `GET /api/me` (Task 3)
- Produces:
  - `authClient` (Better Auth's vanilla client with `emailOTPClient`)
  - `meQueryOptions` (query key `["me"]`)
  - `safeRedirect(value: unknown): string | undefined`
  - `apiErrorKey(error: unknown): ApiErrorCode | "NETWORK"` and `fieldErrorKey(message: string): FieldErrorKey | null`
  - `resolveLocale({ chosen, workspaceDefault, browser }): Locale`
  - `useLocaleControls(): { locale; setLocale(locale); setWorkspaceDefault(locale | null) }`
  - Components `<FieldError errors />`, `<LanguageSwitcher />` and `<SiteHeader />`
  - The `/signin` route, with an optional `redirect` search param.

- [ ] **Step 1: Write the failing tests**

`src/lib/redirect.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { safeRedirect } from "./redirect";

describe("safeRedirect", () => {
  it.each(["/acme/settings", "/acme?board=bugs"])("keeps %s", (path) => {
    expect(safeRedirect(path)).toBe(path);
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
  ])("drops %s", (value) => {
    expect(safeRedirect(value)).toBeUndefined();
  });

  it("drops anything that isn't a string", () => {
    expect(safeRedirect(42)).toBeUndefined();
  });
});
```

`src/lib/error-text.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { apiErrorKey, fieldErrorKey } from "./error-text";

describe("apiErrorKey", () => {
  it("uses the API's code", () => {
    const error = new ApiError(409, "WORKSPACE_LIMIT", "One per account");
    expect(apiErrorKey(error)).toBe("WORKSPACE_LIMIT");
  });

  it("treats anything else as a network problem", () => {
    expect(apiErrorKey(new TypeError("Failed to fetch"))).toBe("NETWORK");
  });
});

describe("fieldErrorKey", () => {
  it("recognises our keys", () => {
    expect(fieldErrorKey("SLUG_TAKEN")).toBe("SLUG_TAKEN");
  });

  it("leaves zod's already-translated messages alone", () => {
    expect(fieldErrorKey("En az 2 karakter olmalı")).toBeNull();
  });
});
```

`src/i18n/resolve.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveLocale } from "./resolve";

describe("resolveLocale", () => {
  it("lets the person's choice win", () => {
    const locale = resolveLocale({
      chosen: "tr",
      workspaceDefault: "en",
      browser: "en",
    });
    expect(locale).toBe("tr");
  });

  it("uses the workspace's default when nothing was chosen", () => {
    const locale = resolveLocale({
      chosen: null,
      workspaceDefault: "tr",
      browser: "en",
    });
    expect(locale).toBe("tr");
  });

  it("falls back to the browser", () => {
    const locale = resolveLocale({
      chosen: null,
      workspaceDefault: null,
      browser: "tr",
    });
    expect(locale).toBe("tr");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test src/lib/redirect.test.ts src/lib/error-text.test.ts src/i18n/resolve.test.ts`
Expected: FAIL. `./redirect`, `./error-text` and `./resolve` don't exist.

- [ ] **Step 3: Write the three helpers**

`src/lib/redirect.ts`:

```ts
/**
 * Where to send someone after sign-in. Only paths on this site survive;
 * another origin, a protocol-relative URL or a script URL falls back.
 */
export function safeRedirect(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/")) return undefined;
  if (value.startsWith("//") || value.startsWith("/\\")) return undefined;
  return value;
}
```

`src/lib/error-text.ts`:

```ts
import type { ApiErrorCode } from "@/shared/envelope";
import { type FieldErrorKey, isFieldErrorKey } from "@/shared/field-errors";
import { ApiError } from "./api";

/** The `errors.*` message for a failed request. */
export function apiErrorKey(error: unknown): ApiErrorCode | "NETWORK" {
  return error instanceof ApiError ? error.code : "NETWORK";
}

/** The `fieldErrors.*` key behind a field message, if it's one of ours. */
export function fieldErrorKey(message: string): FieldErrorKey | null {
  return isFieldErrorKey(message) ? message : null;
}
```

`src/i18n/resolve.ts`:

```ts
import type { Locale } from "@/shared/locale";

/**
 * Which language the interface uses: what the person chose wins, then the
 * workspace's default (on its pages), then the browser's.
 */
export function resolveLocale(input: {
  chosen: Locale | null;
  workspaceDefault: Locale | null;
  browser: Locale;
}): Locale {
  return input.chosen ?? input.workspaceDefault ?? input.browser;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test src`
Expected: PASS. 5 files and 20 tests: the three new files plus `api` and `messages`.

- [ ] **Step 5: Add the form library, the input components and the client plumbing**

```bash
bun add @tanstack/react-form@^1.33.5
bunx --bun shadcn@4.21.5 add input label --yes
```

Expected: shadcn reports creating `src/components/ui/input.tsx` and `src/components/ui/label.tsx`.

`src/lib/auth-client.ts`:

```ts
import { createAuthClient } from "better-auth/client";
import { emailOTPClient } from "better-auth/client/plugins";

/**
 * Better Auth's own routes (send code, sign in, sign out). They answer in
 * Better Auth's JSON, so they go through this client, not `unwrap`.
 */
export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [emailOTPClient()],
});
```

`src/lib/session.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "./api";

/** Who's signed in, and their workspaces. Invalidate after sign-in or out. */
export const meQueryOptions = queryOptions({
  queryKey: ["me"],
  queryFn: async () => unwrap(await api.me.$get()),
  staleTime: 60_000,
});
```

`src/i18n/cookie.ts`:

```ts
import { LOCALE_COOKIE, type Locale } from "@/shared/locale";

/** Remembers the person's choice for a year. The server reads it too. */
export function writeLocaleCookie(locale: Locale) {
  // biome-ignore lint/suspicious/noDocumentCookie: one first-party preference cookie; the Cookie Store API isn't in every browser yet
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
```

- [ ] **Step 6: Give the provider language controls**

`src/i18n/provider.tsx` (full replacement):

```tsx
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { IntlProvider } from "use-intl";
import { z } from "zod";
import {
  type Locale,
  localeFromCookie,
  localeFromLanguageTag,
} from "@/shared/locale";
import { writeLocaleCookie } from "./cookie";
import en from "./messages/en.json";
import tr from "./messages/tr.json";
import { resolveLocale } from "./resolve";

// `satisfies` makes a key missing from tr.json a compile error too.
const messages = { en, tr } satisfies Record<Locale, typeof en>;

type LocaleControls = {
  locale: Locale;
  /** The person's explicit choice, remembered in a cookie. */
  setLocale(locale: Locale): void;
  /** Workspace pages set their default language here; null elsewhere. */
  setWorkspaceDefault(locale: Locale | null): void;
};

const LocaleContext = createContext<LocaleControls | null>(null);

export function useLocaleControls() {
  const controls = useContext(LocaleContext);
  if (!controls) {
    throw new Error("useLocaleControls must be used inside I18nProvider");
  }
  return controls;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [chosen, setChosen] = useState(() => localeFromCookie(document.cookie));
  const [workspaceDefault, setWorkspaceDefault] = useState<Locale | null>(
    null
  );
  const locale = resolveLocale({
    chosen,
    workspaceDefault,
    browser: localeFromLanguageTag(navigator.language),
  });

  useEffect(() => {
    document.documentElement.lang = locale;
    // Zod's own validation messages follow the interface language.
    z.config(locale === "tr" ? z.locales.tr() : z.locales.en());
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    writeLocaleCookie(next);
    setChosen(next);
  }, []);

  const controls = useMemo(
    () => ({ locale, setLocale, setWorkspaceDefault }),
    [locale, setLocale]
  );

  return (
    <LocaleContext value={controls}>
      <IntlProvider
        locale={locale}
        messages={messages[locale]}
        timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
      >
        {children}
      </IntlProvider>
    </LocaleContext>
  );
}
```

- [ ] **Step 7: Write the field error, the language switcher and the header**

`src/components/field-error.tsx`:

```tsx
import { useTranslations } from "use-intl";
import { fieldErrorKey } from "@/lib/error-text";

/** A field's first problem, translated when it's one of our keys. */
export function FieldError({ errors }: { errors: unknown[] }) {
  const t = useTranslations("fieldErrors");
  const first = errors[0];
  if (!first) return null;
  const message =
    typeof first === "string"
      ? first
      : ((first as { message?: string }).message ?? "");
  const key = fieldErrorKey(message);
  return (
    <p className="text-destructive text-sm" role="alert">
      {key ? t(key) : message}
    </p>
  );
}
```

`src/components/language-switcher.tsx`:

```tsx
import { useTranslations } from "use-intl";
import { useLocaleControls } from "@/i18n/provider";
import { LOCALES } from "@/shared/locale";
import { Button } from "./ui/button";

export function LanguageSwitcher() {
  const t = useTranslations("header");
  const { locale, setLocale } = useLocaleControls();
  return (
    <fieldset className="flex items-center gap-1">
      <legend className="sr-only">{t("language")}</legend>
      {LOCALES.map((option) => (
        <Button
          key={option}
          size="sm"
          variant={option === locale ? "secondary" : "ghost"}
          aria-pressed={option === locale}
          onClick={() => setLocale(option)}
        >
          {option.toUpperCase()}
        </Button>
      ))}
    </fieldset>
  );
}
```

`src/components/site-header.tsx`:

```tsx
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslations } from "use-intl";
import { authClient } from "@/lib/auth-client";
import { meQueryOptions } from "@/lib/session";
import { LanguageSwitcher } from "./language-switcher";
import { Button } from "./ui/button";

export function SiteHeader() {
  const t = useTranslations("header");
  const me = useQuery(meQueryOptions);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const user = me.data?.user;

  async function signOut() {
    await authClient.signOut();
    await queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey });
    await navigate({ to: "/" });
  }

  return (
    <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
      <Link to="/" className="font-semibold text-lg">
        Pano
      </Link>
      <div className="flex items-center gap-3">
        <LanguageSwitcher />
        {user ? (
          <>
            <span className="hidden text-muted-foreground text-sm sm:inline">
              {user.email}
            </span>
            <Button size="sm" variant="outline" onClick={signOut}>
              {t("signOut")}
            </Button>
          </>
        ) : (
          <Button asChild size="sm">
            <Link to="/signin">{t("signIn")}</Link>
          </Button>
        )}
      </div>
    </header>
  );
}
```

- [ ] **Step 8: Write the layout, the landing page and the sign-in page**

`src/routes/__root.tsx` (full replacement):

```tsx
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: () => (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  ),
});
```

`src/routes/index.tsx` (full replacement; Task 8 points the signed-in branch at the workspace):

```tsx
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { meQueryOptions } from "@/lib/session";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const t = useTranslations("home");
  const me = useQuery(meQueryOptions);
  const user = me.data?.user;
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-24">
      <h1 className="font-semibold text-4xl tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground">{t("tagline")}</p>
      {me.isPending ? null : user ? (
        <p>{t("signedInAs", { email: user.email })}</p>
      ) : (
        <div>
          <Button asChild>
            <Link to="/signin">{t("signInCta")}</Link>
          </Button>
        </div>
      )}
    </main>
  );
}
```

`src/routes/signin.tsx` (Task 8 changes where a successful sign-in lands):

```tsx
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { z } from "zod";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { safeRedirect } from "@/lib/redirect";
import { meQueryOptions } from "@/lib/session";
import { codeFormSchema, emailFormSchema } from "@/shared/schemas";

export const Route = createFileRoute("/signin")({
  validateSearch: z.object({
    redirect: z.string().optional().catch(undefined),
  }),
  component: SignIn,
});

function SignIn() {
  const t = useTranslations("signin");
  const [email, setEmail] = useState<string | null>(null);
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-6 py-16">
      <h1 className="font-semibold text-2xl">{t("title")}</h1>
      {email === null ? (
        <EmailStep onSent={setEmail} />
      ) : (
        <CodeStep email={email} onBack={() => setEmail(null)} />
      )}
    </main>
  );
}

function EmailStep({ onSent }: { onSent: (email: string) => void }) {
  const t = useTranslations("signin");
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { email: "" },
    validators: { onSubmit: emailFormSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      const { error: failure } = await authClient.emailOtp.sendVerificationOtp(
        { email: value.email, type: "sign-in" }
      );
      if (failure) {
        setError(failure.status === 429 ? t("tooManyCodes") : t("sendFailed"));
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

function CodeStep({ email, onBack }: { email: string; onBack: () => void }) {
  const t = useTranslations("signin");
  const search = Route.useSearch();
  const router = useRouter();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
      await queryClient.invalidateQueries({
        queryKey: meQueryOptions.queryKey,
      });
      const redirect = safeRedirect(search.redirect);
      if (redirect) router.history.push(redirect);
      else await navigate({ to: "/" });
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

- [ ] **Step 9: Replace the message catalogs**

The Phase 0 health-check strings go; the sign-in, header and error strings come in. Every `ApiErrorCode` and `FieldErrorKey` needs an entry, or the typed `errors.*` and `fieldErrors.*` lookups stop compiling.

`src/i18n/messages/en.json` (full replacement):

```json
{
  "home": {
    "title": "Pano",
    "tagline": "Feedback boards and a public roadmap.",
    "signInCta": "Sign in to get started",
    "signedInAs": "You're signed in as {email}."
  },
  "header": {
    "signIn": "Sign in",
    "signOut": "Sign out",
    "language": "Language"
  },
  "signin": {
    "title": "Sign in to Pano",
    "emailIntro": "Enter your email and we'll send you a 6-digit code. New here? The same code creates your account.",
    "emailLabel": "Email",
    "sendCode": "Send code",
    "sendFailed": "We couldn't send a code. Try again in a moment.",
    "tooManyCodes": "Too many codes requested. Wait a minute and try again.",
    "codeSentTo": "We sent a code to {email}. It expires in 5 minutes.",
    "codeLabel": "6-digit code",
    "verify": "Sign in",
    "codeInvalid": "That code didn't work. Check it, or request a new one.",
    "tooManyAttempts": "Too many attempts. Wait a minute, then request a new code.",
    "useAnotherEmail": "Use a different email"
  },
  "errors": {
    "BAD_REQUEST": "Something in the form needs fixing.",
    "UNAUTHORIZED": "Please sign in first.",
    "FORBIDDEN": "Only the workspace team can do that.",
    "NOT_FOUND": "We couldn't find that.",
    "CONFLICT": "That's already taken.",
    "RATE_LIMITED": "Too many requests. Wait a minute and try again.",
    "INTERNAL_ERROR": "Something went wrong on our side. Try again.",
    "WORKSPACE_LIMIT": "Each account can have one workspace for now.",
    "NETWORK": "Couldn't reach Pano. Check your connection and try again."
  },
  "fieldErrors": {
    "SLUG_FORMAT": "Use lowercase letters, numbers and single hyphens.",
    "SLUG_RESERVED": "That address is reserved. Pick another.",
    "SLUG_TAKEN": "That address is taken. Pick another.",
    "NAME_NEEDS_LETTERS": "Use at least two letters or numbers.",
    "BOARD_EXISTS": "This workspace already has a board with that name.",
    "ORDER_MISMATCH": "The board list changed. Reload and try again.",
    "NOTHING_TO_UPDATE": "Change something before saving.",
    "CODE_FORMAT": "Enter the 6 digits from the email."
  }
}
```

`src/i18n/messages/tr.json` (full replacement):

```json
{
  "home": {
    "title": "Pano",
    "tagline": "Geri bildirim panoları ve herkese açık yol haritası.",
    "signInCta": "Başlamak için giriş yapın",
    "signedInAs": "{email} olarak giriş yaptınız."
  },
  "header": {
    "signIn": "Giriş yap",
    "signOut": "Çıkış yap",
    "language": "Dil"
  },
  "signin": {
    "title": "Pano'ya giriş yapın",
    "emailIntro": "E-posta adresinizi girin, size 6 haneli bir kod gönderelim. İlk kez mi geliyorsunuz? Aynı kod hesabınızı da oluşturur.",
    "emailLabel": "E-posta",
    "sendCode": "Kod gönder",
    "sendFailed": "Kod gönderilemedi. Birazdan tekrar deneyin.",
    "tooManyCodes": "Çok fazla kod istendi. Bir dakika bekleyip tekrar deneyin.",
    "codeSentTo": "{email} adresine bir kod gönderdik. Kod 5 dakika geçerli.",
    "codeLabel": "6 haneli kod",
    "verify": "Giriş yap",
    "codeInvalid": "Bu kod çalışmadı. Kodu kontrol edin ya da yeni bir kod isteyin.",
    "tooManyAttempts": "Çok fazla deneme yapıldı. Bir dakika bekleyip yeni bir kod isteyin.",
    "useAnotherEmail": "Başka bir e-posta kullan"
  },
  "errors": {
    "BAD_REQUEST": "Formda düzeltilmesi gereken bir şey var.",
    "UNAUTHORIZED": "Önce giriş yapın.",
    "FORBIDDEN": "Bunu yalnızca çalışma alanının ekibi yapabilir.",
    "NOT_FOUND": "Aradığınız şey bulunamadı.",
    "CONFLICT": "Bu zaten kullanılıyor.",
    "RATE_LIMITED": "Çok fazla istek gönderildi. Bir dakika bekleyip tekrar deneyin.",
    "INTERNAL_ERROR": "Bizim tarafımızda bir sorun oluştu. Tekrar deneyin.",
    "WORKSPACE_LIMIT": "Şimdilik her hesap bir çalışma alanı açabilir.",
    "NETWORK": "Pano'ya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin."
  },
  "fieldErrors": {
    "SLUG_FORMAT": "Küçük harf, rakam ve tek tire kullanın.",
    "SLUG_RESERVED": "Bu adres ayrılmış. Başka bir adres seçin.",
    "SLUG_TAKEN": "Bu adres kullanılıyor. Başka bir adres seçin.",
    "NAME_NEEDS_LETTERS": "En az iki harf ya da rakam kullanın.",
    "BOARD_EXISTS": "Bu çalışma alanında bu adla bir pano zaten var.",
    "ORDER_MISMATCH": "Pano listesi değişti. Sayfayı yenileyip tekrar deneyin.",
    "NOTHING_TO_UPDATE": "Kaydetmeden önce bir şeyi değiştirin.",
    "CODE_FORMAT": "E-postadaki 6 haneyi girin."
  }
}
```

- [ ] **Step 10: Build, typecheck, lint and test**

```bash
bun run build
bun run typecheck
bun run check:fix
bun run check
bun run test
```

Expected:
- The build regenerates `src/routeTree.gen.ts` with `/signin`.
- `tsc -b` exits 0.
- Biome passes; `check:fix` reformats the shadcn files.
- 21 test files, 128 tests pass.

- [ ] **Step 11: Click through it**

Stop any running dev server, then run `bun run dev` (http://localhost:5173). In the browser:
1. Use the header's **Sign in** to send a code. The code prints in the terminal; enter it, and you land on the home page, which says you're signed in as your email.
2. Press **TR**. Every string switches to Turkish, the choice survives a reload, and `document.cookie` contains `pano-locale=tr`.
3. Use **Çıkış yap** to sign out.
4. Open `/signin?redirect=https://evil.example` and sign in. You stay on Pano.

If you can't drive a browser, hand these four checks to your human partner, and record in the ledger that they confirmed them.

- [ ] **Step 12: Commit**

```bash
git add package.json bun.lock src
git commit -m "feat: email-code sign-in page, header and language switching" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Workspace pages (create, view, settings with boards)

**Files:**
- Modify: `src/lib/api.ts` (`unwrap` accepts validated routes' error responses and refuses non-JSON successes)
- Test: `src/lib/api.test.ts` (one new case)
- Create: `src/lib/move.ts`; Test: `src/lib/move.test.ts`
- Create: `src/lib/workspaces.ts`
- Create: `src/routes/new-workspace.tsx`, `src/routes/$ws.tsx`, `src/routes/$ws/index.tsx`, `src/routes/$ws/settings.tsx`
- Create: `src/components/settings/workspace-form.tsx`, `src/components/settings/boards-editor.tsx`
- Modify: `src/routes/signin.tsx` (where sign-in lands), `src/routes/index.tsx` (call to action), `src/i18n/messages/en.json`, `src/i18n/messages/tr.json`
- Regenerated: `src/routeTree.gen.ts`

Shell note: quote paths containing `$ws` (for example `'src/routes/$ws.tsx'`), or the shell expands them.

**Interfaces:**
- Consumes: everything from Tasks 3–7.
- Produces:
  - `move<T>(items: readonly T[], from: number, to: number): T[]`
  - `src/lib/workspaces.ts`: `workspaceQueryOptions(slug)`, plus `createWorkspace`, `updateWorkspace`, `createBoard`, `renameBoard`, `deleteBoard` and `reorderBoards`
  - Routes:
    - `/new-workspace` (signed in, without a workspace yet)
    - `/$ws` (the layout: loads the workspace and applies its default language)
    - `/$ws/` (lists boards; the `?board=` search param picks one)
    - `/$ws/settings` (team only)

- [ ] **Step 1: Write the failing tests**

Add this case to `src/lib/api.test.ts`, inside `describe("unwrap", …)`:

```ts
  it("throws INTERNAL_ERROR when a successful response isn't JSON", async () => {
    const res = new Response("<html>Wi-Fi login</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
    const error = await unwrap(res).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 200, code: "INTERNAL_ERROR" });
  });
```

`src/lib/move.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { move } from "./move";

describe("move", () => {
  it("moves an item up to the front", () => {
    expect(move(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("moves an item down one place", () => {
    expect(move(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("returns an unchanged copy for positions out of range", () => {
    const items = ["a", "b"];
    const moved = move(items, 0, 5);
    expect(moved).toEqual(["a", "b"]);
    expect(moved).not.toBe(items);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test src/lib`

Expected: FAIL.
- The new `unwrap` case gets a `SyntaxError` (the current code parses the 200 body as JSON) instead of `ApiError`.
- `move.test.ts` fails to import `./move`.

- [ ] **Step 3: Make `unwrap` accept error responses in its types, and write `move`**

`src/lib/api.ts`: replace `JsonResponse` and `unwrap` with the code below, and add `type ErrorResponse` to the `@/shared/envelope` import.

Routes guarded by `validate()` can also answer the 400 envelope. That puts `ErrorResponse` in their response types, so `unwrap` has to accept it.

```ts
type JsonResponse<T> = {
  ok: boolean;
  status: number;
  json(): Promise<SuccessResponse<T> | ErrorResponse>;
};

function isSuccess<T>(value: unknown): value is SuccessResponse<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { success?: unknown }).success === true &&
    "data" in value
  );
}

/**
 * Returns `data` from a successful response and throws ApiError otherwise, so
 * a failed request always reaches TanStack Query's onError. A body that isn't
 * the envelope (a proxy's HTML page, a captive portal's 200) still becomes
 * ApiError rather than a SyntaxError.
 */
export async function unwrap<T>(res: JsonResponse<T>): Promise<T> {
  const body: unknown = await res.json().catch(() => null);
  if (res.ok && isSuccess<T>(body)) return body.data;
  if (isErrorResponse(body)) {
    throw new ApiError(res.status, body.code, body.error, body.fields);
  }
  throw new ApiError(
    res.status,
    "INTERNAL_ERROR",
    `Request failed with status ${res.status}`
  );
}
```

`src/lib/move.ts`:

```ts
/**
 * A copy of `items` with the item at `from` moved to `to`. Out-of-range
 * positions return an unchanged copy.
 */
export function move<T>(items: readonly T[], from: number, to: number): T[] {
  const copy = [...items];
  const inRange = (i: number) => i >= 0 && i < copy.length;
  if (!inRange(from) || !inRange(to)) return copy;
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item as T);
  return copy;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test src/lib`
Expected: PASS. 4 files, 19 tests (`api` 5, `move` 3, `redirect` 7, `error-text` 4).

- [ ] **Step 5: Write the workspace data layer**

`src/lib/workspaces.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";
import type { Locale } from "@/shared/locale";
import { api, unwrap } from "./api";

export const workspaceQueryOptions = (slug: string) =>
  queryOptions({
    queryKey: ["workspace", slug],
    queryFn: async () =>
      unwrap(await api.workspaces[":slug"].$get({ param: { slug } })),
  });

export async function createWorkspace(json: {
  name: string;
  slug: string;
  defaultLocale: Locale;
}) {
  return unwrap(await api.workspaces.$post({ json }));
}

export async function updateWorkspace(
  slug: string,
  json: { name?: string; defaultLocale?: Locale }
) {
  return unwrap(
    await api.workspaces[":slug"].$patch({ param: { slug }, json })
  );
}

export async function createBoard(slug: string, name: string) {
  return unwrap(
    await api.workspaces[":slug"].boards.$post({
      param: { slug },
      json: { name },
    })
  );
}

export async function renameBoard(slug: string, boardId: string, name: string) {
  return unwrap(
    await api.workspaces[":slug"].boards[":boardId"].$patch({
      param: { slug, boardId },
      json: { name },
    })
  );
}

export async function deleteBoard(slug: string, boardId: string) {
  return unwrap(
    await api.workspaces[":slug"].boards[":boardId"].$delete({
      param: { slug, boardId },
    })
  );
}

export async function reorderBoards(slug: string, ids: string[]) {
  return unwrap(
    await api.workspaces[":slug"].boards.order.$put({
      param: { slug },
      json: { ids },
    })
  );
}
```

- [ ] **Step 6: Write the create-workspace page**

`src/routes/new-workspace.tsx`:

```tsx
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocaleControls } from "@/i18n/provider";
import { ApiError } from "@/lib/api";
import { apiErrorKey } from "@/lib/error-text";
import { meQueryOptions } from "@/lib/session";
import { createWorkspace } from "@/lib/workspaces";
import { LOCALES, type Locale } from "@/shared/locale";
import { createWorkspaceSchema } from "@/shared/schemas";
import { slugify } from "@/shared/slug";

export const Route = createFileRoute("/new-workspace")({
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    if (!me.user) {
      throw redirect({ to: "/signin", search: { redirect: location.href } });
    }
    // One workspace per account: send its owner there instead.
    const existing = me.workspaces[0];
    if (existing) {
      throw redirect({ to: "/$ws", params: { ws: existing.slug } });
    }
  },
  component: NewWorkspace,
});

const FIELDS = ["name", "slug", "defaultLocale"] as const;
type FieldName = (typeof FIELDS)[number];
const isFieldName = (value: string): value is FieldName =>
  (FIELDS as readonly string[]).includes(value);

function NewWorkspace() {
  const t = useTranslations("newWorkspace");
  const tErrors = useTranslations("errors");
  const tLanguages = useTranslations("languages");
  const { locale } = useLocaleControls();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [slugEdited, setSlugEdited] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { name: "", slug: "", defaultLocale: locale },
    validators: { onSubmit: createWorkspaceSchema },
    onSubmit: async ({ value, formApi }) => {
      setFormError(null);
      try {
        const workspace = await createWorkspace(value);
        await queryClient.invalidateQueries({
          queryKey: meQueryOptions.queryKey,
        });
        await navigate({ to: "/$ws", params: { ws: workspace.slug } });
      } catch (error) {
        const fields = error instanceof ApiError ? error.fields : undefined;
        if (fields) {
          for (const [name, message] of Object.entries(fields)) {
            if (!isFieldName(name)) continue;
            formApi.setFieldMeta(name, (meta) => ({
              ...meta,
              errorMap: { ...meta.errorMap, onSubmit: message },
            }));
          }
          return;
        }
        setFormError(tErrors(apiErrorKey(error)));
      }
    },
  });

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="font-semibold text-2xl">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("intro")}</p>
      </div>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="name">
          {(field) => (
            <div className="flex flex-col gap-2">
              <Label htmlFor={field.name}>{t("nameLabel")}</Label>
              <Input
                id={field.name}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  field.handleChange(event.target.value);
                  // Suggest an address from the name until it's edited.
                  if (!slugEdited) {
                    form.setFieldValue("slug", slugify(event.target.value));
                  }
                }}
              />
              <FieldError errors={field.state.meta.errors} />
            </div>
          )}
        </form.Field>
        <form.Field name="slug">
          {(field) => (
            <div className="flex flex-col gap-2">
              <Label htmlFor={field.name}>{t("slugLabel")}</Label>
              <Input
                id={field.name}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  setSlugEdited(true);
                  field.handleChange(event.target.value);
                }}
              />
              <p className="text-muted-foreground text-xs">
                {t("slugHint", {
                  url: `${window.location.host}/${field.state.value || "…"}`,
                })}
              </p>
              <FieldError errors={field.state.meta.errors} />
            </div>
          )}
        </form.Field>
        <form.Field name="defaultLocale">
          {(field) => (
            <div className="flex flex-col gap-2">
              <Label htmlFor={field.name}>{t("localeLabel")}</Label>
              <select
                id={field.name}
                name={field.name}
                className="h-9 rounded-md border bg-transparent px-3 text-sm"
                value={field.state.value}
                onChange={(event) =>
                  field.handleChange(event.target.value as Locale)
                }
              >
                {LOCALES.map((option) => (
                  <option key={option} value={option}>
                    {tLanguages(option)}
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground text-xs">
                {t("localeHint")}
              </p>
            </div>
          )}
        </form.Field>
        {formError && (
          <p className="text-destructive text-sm" role="alert">
            {formError}
          </p>
        )}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting}>
              {t("submit")}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </main>
  );
}
```

- [ ] **Step 7: Write the workspace layout and its board view**

`src/routes/$ws.tsx`:

```tsx
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  notFound,
  Outlet,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslations } from "use-intl";
import { useLocaleControls } from "@/i18n/provider";
import { ApiError } from "@/lib/api";
import { meQueryOptions } from "@/lib/session";
import { workspaceQueryOptions } from "@/lib/workspaces";

export const Route = createFileRoute("/$ws")({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(
        workspaceQueryOptions(params.ws)
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) throw notFound();
      throw error;
    }
  },
  component: WorkspaceLayout,
  notFoundComponent: WorkspaceNotFound,
});

function WorkspaceLayout() {
  const { ws } = Route.useParams();
  const { data: workspace } = useSuspenseQuery(workspaceQueryOptions(ws));
  const me = useQuery(meQueryOptions);
  const { setWorkspaceDefault } = useLocaleControls();
  const t = useTranslations("workspace");
  const onTeam = me.data?.workspaces.some((w) => w.slug === ws) ?? false;

  // Visitors who haven't picked a language see the workspace's default.
  useEffect(() => {
    setWorkspaceDefault(workspace.defaultLocale);
    return () => setWorkspaceDefault(null);
  }, [workspace.defaultLocale, setWorkspaceDefault]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-semibold text-2xl">{workspace.name}</h1>
        <nav className="flex gap-4 text-sm">
          <Link
            to="/$ws"
            params={{ ws }}
            activeOptions={{ exact: true, includeSearch: false }}
            activeProps={{ className: "font-semibold" }}
          >
            {t("requests")}
          </Link>
          {onTeam && (
            <Link
              to="/$ws/settings"
              params={{ ws }}
              activeProps={{ className: "font-semibold" }}
            >
              {t("settings")}
            </Link>
          )}
        </nav>
      </header>
      <Outlet />
    </div>
  );
}

function WorkspaceNotFound() {
  const t = useTranslations("workspace");
  return (
    <p className="mx-auto max-w-3xl px-6 py-16 text-muted-foreground">
      {t("notFound")}
    </p>
  );
}
```

`src/routes/$ws/index.tsx`:

```tsx
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslations } from "use-intl";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { workspaceQueryOptions } from "@/lib/workspaces";

export const Route = createFileRoute("/$ws/")({
  validateSearch: z.object({ board: z.string().optional().catch(undefined) }),
  component: WorkspaceHome,
});

function WorkspaceHome() {
  const { ws } = Route.useParams();
  const { board } = Route.useSearch();
  const { data: workspace } = useSuspenseQuery(workspaceQueryOptions(ws));
  const t = useTranslations("workspace");

  if (workspace.boards.length === 0) {
    return <p className="text-muted-foreground">{t("noBoards")}</p>;
  }
  const active =
    workspace.boards.find((b) => b.slug === board) ?? workspace.boards[0];

  return (
    <section className="flex flex-col gap-4">
      <nav className="flex flex-wrap gap-2" aria-label={t("boards")}>
        {workspace.boards.map((b) => (
          <Button
            key={b.id}
            asChild
            size="sm"
            variant={b.id === active?.id ? "secondary" : "ghost"}
          >
            <Link to="/$ws" params={{ ws }} search={{ board: b.slug }}>
              {b.name}
            </Link>
          </Button>
        ))}
      </nav>
      {/* Requests and the feed arrive in Phase 2. */}
      <p className="text-muted-foreground">
        {t("noRequestsYet", { board: active?.name ?? "" })}
      </p>
    </section>
  );
}
```

- [ ] **Step 8: Write the settings page**

`src/routes/$ws/settings.tsx`:

```tsx
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslations } from "use-intl";
import { BoardsEditor } from "@/components/settings/boards-editor";
import { WorkspaceForm } from "@/components/settings/workspace-form";
import { meQueryOptions } from "@/lib/session";
import { workspaceQueryOptions } from "@/lib/workspaces";

export const Route = createFileRoute("/$ws/settings")({
  beforeLoad: async ({ context, params, location }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    if (!me.user) {
      throw redirect({ to: "/signin", search: { redirect: location.href } });
    }
    // Only the team sees settings; the API refuses everyone else anyway.
    if (!me.workspaces.some((w) => w.slug === params.ws)) {
      throw redirect({ to: "/$ws", params: { ws: params.ws } });
    }
  },
  component: Settings,
});

function Settings() {
  const { ws } = Route.useParams();
  const { data: workspace } = useSuspenseQuery(workspaceQueryOptions(ws));
  const t = useTranslations("settings");
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-lg">{t("workspaceSection")}</h2>
        <WorkspaceForm workspace={workspace} />
      </section>
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-lg">{t("boardsSection")}</h2>
          <p className="text-muted-foreground text-sm">{t("boardsHint")}</p>
        </div>
        <BoardsEditor slug={workspace.slug} boards={workspace.boards} />
      </section>
    </div>
  );
}
```

`src/components/settings/workspace-form.tsx`:

```tsx
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { apiErrorKey } from "@/lib/error-text";
import { meQueryOptions } from "@/lib/session";
import { updateWorkspace, workspaceQueryOptions } from "@/lib/workspaces";
import { LOCALES, type Locale } from "@/shared/locale";
import { updateWorkspaceSchema } from "@/shared/schemas";

type Props = {
  workspace: { slug: string; name: string; defaultLocale: Locale };
};

type Status = { kind: "saved" } | { kind: "error"; message: string } | null;

export function WorkspaceForm({ workspace }: Props) {
  const t = useTranslations("settings");
  const tNew = useTranslations("newWorkspace");
  const tErrors = useTranslations("errors");
  const tLanguages = useTranslations("languages");
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>(null);

  const form = useForm({
    defaultValues: {
      name: workspace.name,
      defaultLocale: workspace.defaultLocale,
    },
    validators: { onSubmit: updateWorkspaceSchema },
    onSubmit: async ({ value, formApi }) => {
      setStatus(null);
      try {
        await updateWorkspace(workspace.slug, value);
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: workspaceQueryOptions(workspace.slug).queryKey,
          }),
          queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey }),
        ]);
        setStatus({ kind: "saved" });
      } catch (error) {
        const nameError =
          error instanceof ApiError ? error.fields?.name : undefined;
        if (nameError) {
          formApi.setFieldMeta("name", (meta) => ({
            ...meta,
            errorMap: { ...meta.errorMap, onSubmit: nameError },
          }));
          return;
        }
        setStatus({ kind: "error", message: tErrors(apiErrorKey(error)) });
      }
    },
  });

  return (
    <form
      className="flex max-w-md flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="name">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor="workspace-name">{tNew("nameLabel")}</Label>
            <Input
              id="workspace-name"
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
            <FieldError errors={field.state.meta.errors} />
          </div>
        )}
      </form.Field>
      <form.Field name="defaultLocale">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor="workspace-locale">{tNew("localeLabel")}</Label>
            <select
              id="workspace-locale"
              name={field.name}
              className="h-9 rounded-md border bg-transparent px-3 text-sm"
              value={field.state.value}
              onChange={(event) =>
                field.handleChange(event.target.value as Locale)
              }
            >
              {LOCALES.map((option) => (
                <option key={option} value={option}>
                  {tLanguages(option)}
                </option>
              ))}
            </select>
          </div>
        )}
      </form.Field>
      <div className="flex items-center gap-3">
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting}>
              {t("save")}
            </Button>
          )}
        </form.Subscribe>
        {status?.kind === "saved" && (
          <output className="text-muted-foreground text-sm">
            {t("saved")}
          </output>
        )}
        {status?.kind === "error" && (
          <p className="text-destructive text-sm" role="alert">
            {status.message}
          </p>
        )}
      </div>
    </form>
  );
}
```

`src/components/settings/boards-editor.tsx`:

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { apiErrorKey, fieldErrorKey } from "@/lib/error-text";
import { move } from "@/lib/move";
import {
  createBoard,
  deleteBoard,
  renameBoard,
  reorderBoards,
  workspaceQueryOptions,
} from "@/lib/workspaces";
import { boardNameSchema } from "@/shared/schemas";

type Board = { id: string; slug: string; name: string; position: number };
type Callbacks = {
  onSuccess: () => Promise<void>;
  onError: (error: unknown) => void;
};

/** One translated line for a failed board request. */
function useBoardErrorText() {
  const tErrors = useTranslations("errors");
  const tFields = useTranslations("fieldErrors");
  return (error: unknown) => {
    const field =
      error instanceof ApiError && error.fields
        ? Object.values(error.fields)[0]
        : undefined;
    const key = field ? fieldErrorKey(field) : null;
    if (key) return tFields(key);
    return field ?? tErrors(apiErrorKey(error));
  };
}

export function BoardsEditor({
  slug,
  boards,
}: {
  slug: string;
  boards: Board[];
}) {
  const queryClient = useQueryClient();
  const errorText = useBoardErrorText();
  const [error, setError] = useState<string | null>(null);
  const callbacks: Callbacks = {
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({
        queryKey: workspaceQueryOptions(slug).queryKey,
      });
    },
    onError: (err) => setError(errorText(err)),
  };
  const reorder = useMutation({
    mutationFn: (ids: string[]) => reorderBoards(slug, ids),
    ...callbacks,
  });
  const ids = boards.map((board) => board.id);

  return (
    <div className="flex max-w-md flex-col gap-4">
      {boards.length > 0 && (
        <ul className="flex flex-col divide-y rounded-md border">
          {boards.map((board, index) => (
            <BoardRow
              key={board.id}
              slug={slug}
              board={board}
              canMoveUp={index > 0}
              canMoveDown={index < boards.length - 1}
              onMove={(offset) =>
                reorder.mutate(move(ids, index, index + offset))
              }
              {...callbacks}
            />
          ))}
        </ul>
      )}
      <AddBoardForm slug={slug} {...callbacks} />
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type RowProps = Callbacks & {
  slug: string;
  board: Board;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (offset: -1 | 1) => void;
};

function BoardRow({
  slug,
  board,
  canMoveUp,
  canMoveDown,
  onMove,
  onSuccess,
  onError,
}: RowProps) {
  const t = useTranslations("settings");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(board.name);
  const [confirming, setConfirming] = useState(false);
  const rename = useMutation({
    mutationFn: () => renameBoard(slug, board.id, name),
    onSuccess: async () => {
      setEditing(false);
      await onSuccess();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: () => deleteBoard(slug, board.id),
    onSuccess,
    onError,
  });

  if (editing) {
    return (
      <li className="flex items-center gap-2 p-2">
        <Label htmlFor={`rename-${board.id}`} className="sr-only">
          {t("renameLabel", { board: board.name })}
        </Label>
        <Input
          id={`rename-${board.id}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button
          size="sm"
          disabled={rename.isPending || !boardNameSchema.safeParse(name).success}
          onClick={() => rename.mutate()}
        >
          {t("save")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setEditing(false);
            setName(board.name);
          }}
        >
          {t("cancel")}
        </Button>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 p-2">
      <span className="flex-1">{board.name}</span>
      <Button
        size="sm"
        variant="ghost"
        aria-label={t("moveUp", { board: board.name })}
        disabled={!canMoveUp}
        onClick={() => onMove(-1)}
      >
        ↑
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label={t("moveDown", { board: board.name })}
        disabled={!canMoveDown}
        onClick={() => onMove(1)}
      >
        ↓
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
        {t("rename")}
      </Button>
      {confirming ? (
        <Button
          size="sm"
          variant="destructive"
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
        >
          {t("confirmDelete")}
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
          {t("delete")}
        </Button>
      )}
    </li>
  );
}

function AddBoardForm({
  slug,
  onSuccess,
  onError,
}: Callbacks & { slug: string }) {
  const t = useTranslations("settings");
  const [name, setName] = useState("");
  const add = useMutation({
    mutationFn: () => createBoard(slug, name),
    onSuccess: async () => {
      setName("");
      await onSuccess();
    },
    onError,
  });
  const valid = boardNameSchema.safeParse(name).success;

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) add.mutate();
      }}
    >
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor="new-board">{t("newBoardLabel")}</Label>
        <Input
          id="new-board"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={!valid || add.isPending}>
        {t("addBoard")}
      </Button>
    </form>
  );
}
```

- [ ] **Step 9: Send people to their workspace after sign-in, and from the home page**

In `src/routes/signin.tsx`, replace the end of `CodeStep`'s `onSubmit` (from `await queryClient.invalidateQueries(…)` to the end of the function) with:

```ts
      const me = await queryClient.fetchQuery({
        ...meQueryOptions,
        staleTime: 0,
      });
      const redirect = safeRedirect(search.redirect);
      const workspace = me.workspaces[0];
      if (redirect) router.history.push(redirect);
      else if (workspace) {
        await navigate({ to: "/$ws", params: { ws: workspace.slug } });
      } else await navigate({ to: "/new-workspace" });
```

`src/routes/index.tsx` (full replacement):

```tsx
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { meQueryOptions } from "@/lib/session";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const t = useTranslations("home");
  const me = useQuery(meQueryOptions);
  const user = me.data?.user;
  const workspace = me.data?.workspaces[0];

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-24">
      <h1 className="font-semibold text-4xl tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground">{t("tagline")}</p>
      {me.isPending ? null : (
        <div>
          <Button asChild>
            {!user ? (
              <Link to="/signin">{t("signInCta")}</Link>
            ) : workspace ? (
              <Link to="/$ws" params={{ ws: workspace.slug }}>
                {t("openWorkspace", { name: workspace.name })}
              </Link>
            ) : (
              <Link to="/new-workspace">{t("createWorkspace")}</Link>
            )}
          </Button>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 10: Add the workspace strings to both catalogs**

In `src/i18n/messages/en.json`:
- Replace the `"home"` object with the one below.
- Add the `"newWorkspace"`, `"languages"`, `"workspace"` and `"settings"` objects after `"signin"`.
- Leave `"header"`, `"signin"`, `"errors"` and `"fieldErrors"` as Task 7 wrote them.

```json
  "home": {
    "title": "Pano",
    "tagline": "Feedback boards and a public roadmap.",
    "signInCta": "Sign in to get started",
    "createWorkspace": "Create your workspace",
    "openWorkspace": "Open {name}"
  },
```

```json
  "newWorkspace": {
    "title": "Create your workspace",
    "intro": "A workspace holds your boards and roadmap. You can rename it later; the address stays.",
    "nameLabel": "Name",
    "slugLabel": "Address",
    "slugHint": "Your workspace's address: {url}",
    "localeLabel": "Default language",
    "localeHint": "Visitors see this language unless they pick another.",
    "submit": "Create workspace"
  },
  "languages": {
    "en": "English",
    "tr": "Türkçe"
  },
  "workspace": {
    "requests": "Requests",
    "settings": "Settings",
    "boards": "Boards",
    "noBoards": "No boards yet.",
    "noRequestsYet": "No requests on {board} yet.",
    "notFound": "There's no workspace at this address."
  },
  "settings": {
    "workspaceSection": "Workspace",
    "save": "Save",
    "saved": "Saved",
    "boardsSection": "Boards",
    "boardsHint": "Boards group requests, for example features and bugs.",
    "addBoard": "Add board",
    "newBoardLabel": "New board name",
    "rename": "Rename",
    "renameLabel": "New name for {board}",
    "delete": "Delete",
    "confirmDelete": "Confirm delete",
    "moveUp": "Move {board} up",
    "moveDown": "Move {board} down",
    "cancel": "Cancel"
  },
```

Make the same changes in `src/i18n/messages/tr.json`:

```json
  "home": {
    "title": "Pano",
    "tagline": "Geri bildirim panoları ve herkese açık yol haritası.",
    "signInCta": "Başlamak için giriş yapın",
    "createWorkspace": "Çalışma alanınızı oluşturun",
    "openWorkspace": "{name} çalışma alanını aç"
  },
```

```json
  "newWorkspace": {
    "title": "Çalışma alanınızı oluşturun",
    "intro": "Çalışma alanı panolarınızı ve yol haritanızı bir arada tutar. Adını sonra değiştirebilirsiniz; adresi aynı kalır.",
    "nameLabel": "Ad",
    "slugLabel": "Adres",
    "slugHint": "Çalışma alanınızın adresi: {url}",
    "localeLabel": "Varsayılan dil",
    "localeHint": "Ziyaretçiler başka bir dil seçmedikçe bu dili görür.",
    "submit": "Çalışma alanı oluştur"
  },
  "languages": {
    "en": "English",
    "tr": "Türkçe"
  },
  "workspace": {
    "requests": "İstekler",
    "settings": "Ayarlar",
    "boards": "Panolar",
    "noBoards": "Henüz pano yok.",
    "noRequestsYet": "{board} panosunda henüz istek yok.",
    "notFound": "Bu adreste bir çalışma alanı yok."
  },
  "settings": {
    "workspaceSection": "Çalışma alanı",
    "save": "Kaydet",
    "saved": "Kaydedildi",
    "boardsSection": "Panolar",
    "boardsHint": "Panolar istekleri gruplar; örneğin özellikler ve hatalar.",
    "addBoard": "Pano ekle",
    "newBoardLabel": "Yeni pano adı",
    "rename": "Yeniden adlandır",
    "renameLabel": "{board} için yeni ad",
    "delete": "Sil",
    "confirmDelete": "Silmeyi onayla",
    "moveUp": "{board} panosunu yukarı taşı",
    "moveDown": "{board} panosunu aşağı taşı",
    "cancel": "Vazgeç"
  },
```

- [ ] **Step 11: Build, typecheck, lint and test**

```bash
bun run build
bun run typecheck
bun run check:fix
bun run check
bun run test
```

Expected:
- The build regenerates `src/routeTree.gen.ts` with `/new-workspace`, `/$ws`, `/$ws/` and `/$ws/settings`.
- `tsc -b` exits 0.
- Biome passes.
- 22 test files, 132 tests pass.

- [ ] **Step 12: Run the whole flow through the dev server**

This exercises workerd and Hyperdrive end to end, the way the browser calls the API. Stop any `bun run dev` you have running first.

```bash
(bun run dev --port 5173 --strictPort > "${TMPDIR:-/tmp}/pano-dev.log" 2>&1 &)
E="owner-$(date +%s)@example.com"; S="smoke-$(date +%s)"; JAR="${TMPDIR:-/tmp}/pano-cookies"; H='content-type: application/json'
curl -s --retry 40 --retry-connrefused --retry-delay 1 --max-time 60 -o /dev/null http://localhost:5173/api/health
curl -s -o /dev/null -H "$H" -H 'origin: http://localhost:5173' -d "{\"email\":\"$E\",\"type\":\"sign-in\"}" http://localhost:5173/api/auth/email-otp/send-verification-otp
CODE=$(grep -o "sign-in code for $E: [0-9]*" "${TMPDIR:-/tmp}/pano-dev.log" | awk '{print $NF}')
curl -s -c "$JAR" -o /dev/null -H "$H" -H 'origin: http://localhost:5173' -d "{\"email\":\"$E\",\"otp\":\"$CODE\"}" http://localhost:5173/api/auth/sign-in/email-otp
curl -s -b "$JAR" -w ' [%{http_code}]\n' -H "$H" -d "{\"name\":\"Duman Kafe\",\"slug\":\"$S\",\"defaultLocale\":\"tr\"}" http://localhost:5173/api/workspaces
curl -s -b "$JAR" -w ' [%{http_code}]\n' -H "$H" -d '{"name":"Özellik İstekleri"}' "http://localhost:5173/api/workspaces/$S/boards"
curl -s "http://localhost:5173/api/workspaces/$S"; echo
pkill -f "vite --port 5173"
```

Expected, in order:
- the new workspace with `"defaultLocale":"tr"` and ` [201]`
- the new board with `"slug":"ozellik-istekleri"` and ` [201]`
- the workspace JSON, its `boards` holding that one board.

- [ ] **Step 13: Click through it in both languages**

Run `bun run dev`, open http://localhost:5173, then:
1. Sign in with a new email; the code prints in the terminal. You land on **Create your workspace**.
2. Type a Turkish name. The address fills in by itself (`Duman Kafe` → `duman-kafe`). Choose **Türkçe**, then create the workspace. You land on it with **Ayarlar** in its menu, and the interface is Turkish because that's the workspace default and you haven't picked a language.
3. In **Ayarlar**, add the boards "Özellik istekleri" and "Hatalar". Rename one, move it up, then delete it with the two-step confirm.
4. Press **EN**. The interface switches to English and stays English after a reload: your choice beats the workspace default.
5. Sign out and open `/<your slug>/settings`. You're sent to the sign-in page, and signing back in returns you to settings.
6. Sign in as a second email and open `/<your slug>/settings`. You're sent to the workspace page with no **Settings** link.

If you can't drive a browser, hand these six checks to your human partner, and record in the ledger that they confirmed them.

- [ ] **Step 14: Commit**

```bash
git add src
git commit -m "feat: create a workspace, view its boards, and manage them in settings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase 1 done when

- [ ] A new person signs in with an emailed code, creates a workspace with Turkish as its default, and adds a board, all from the browser (Task 8, Step 13). Doing it in English works the same way.
- [ ] `bun run typecheck`, `bun run check`, `bun run test` (22 files, 132 tests) and `bun run build` all pass, and the CI sequence passes locally against a fresh database (Phase 0's Task 5, Step 3).
- [ ] Production sign-in still needs your Brevo key and a verified sender (`BREVO_API_KEY`, `MAIL_FROM`). Phase 5 sets those up with the deploy.
