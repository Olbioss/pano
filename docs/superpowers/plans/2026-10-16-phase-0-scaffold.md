# Phase 0 — Scaffold: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Pano repository where one Cloudflare Worker serves a React app and a typed Hono API, `/api/health` checks Postgres through Hyperdrive, and typecheck, lint, tests and build all pass locally and in CI.

**Architecture:**
- `worker/app.ts` is the whole API as one chained Hono app. It's typed end to end: the React app calls it only through `hc<AppType>`.
- The app is runtime-agnostic, so Vitest runs it under Node against a real local Postgres. Workers-only code stays in `worker/index.ts`.
- Each request gets its own postgres.js client from the Hyperdrive binding. In local dev, Hyperdrive points at Homebrew Postgres.
- Every `/api` response uses one JSON envelope (`shared/envelope.ts`), and the client's `unwrap` turns errors into a typed `ApiError`.

**Tech Stack:**
- Bun 1.3.1, TypeScript 6.0
- Vite 8 + `@cloudflare/vite-plugin`, wrangler 4
- Hono 4.13, Drizzle ORM 0.45 + drizzle-kit, postgres.js
- React 19, TanStack Router + Query
- Tailwind CSS 4 + shadcn/ui (Radix, Nova preset), use-intl 4
- Biome 2.5, Vitest 5, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-16-pano-design.md`. This plan covers its "Build order → 0. Scaffold". Phases 1–5 get their own plans.

**One deliberate gap against the spec:** TanStack Form and zod arrive in Phase 1, with the first form (sign-in and workspace creation), instead of sitting unused in Phase 0.

**Verified in a throwaway spike (2026-10-16):** the config and code below was built, typechecked, tested and run in `vite dev` before this plan was written. That run is the source of the exact commands, versions and the two gotchas in Global Constraints (Hyperdrive password, `.dev.vars`).

## Global Constraints

- **Repo and branch:** the repo is `~/repos/deploys/pano`; work on branch `feat/phase-0-scaffold`, created from `main`. Nothing is pushed, and no GitHub repo is created during this plan.
- **Package versions (floors):**
  - Bun 1.3.1 · TypeScript `~6.0.3` (not 7.x) · vite `^8.3.4` · `@cloudflare/vite-plugin` `^1.64.0` · wrangler `^4.151.0`
  - hono `^4.13.13` · drizzle-orm `^0.45.4` · drizzle-kit `^0.31.11` · postgres `^3.4.9`
  - react / react-dom `^19.3.1` · `@tanstack/react-router` `^1.170.44` · `@tanstack/router-plugin` `^1.168.46` · `@tanstack/react-query` `^5.104.3`
  - tailwindcss / `@tailwindcss/vite` `^4.3.3` · shadcn CLI `4.21.5` · use-intl `^4.14.9`
  - `@biomejs/biome` `^2.5.15` · vitest `^5.0.5`
- **Local Postgres:**
  - Homebrew Postgres 17 at `127.0.0.1:5432`, role `olbios`, trust auth.
  - Databases: `pano` (dev) and `pano_test` (tests).
  - Never point any command at a hosted database in this phase.
- **Hyperdrive locally:**
  - The local connection string must contain a password, because Miniflare rejects one without. Use `postgresql://olbios:local@127.0.0.1:5432/pano`; trust auth ignores the password.
  - The binding is named `HYPERDRIVE`, with the placeholder id `00000000000000000000000000000000` until Phase 5.
- **Env files:**
  - `.env` holds tool-only variables (`DATABASE_URL`, `TEST_DATABASE_URL`).
  - `.dev.vars` holds the Worker's local variables and must exist, even with only a comment. If it's missing, the Vite plugin loads `.env` into the Worker instead.
  - Both files are gitignored, with committed `.example` copies.
- **Worker config:** `compatibility_date` `2026-10-01`, `compatibility_flags` `["nodejs_compat"]`, assets `not_found_handling` `single-page-application`, `run_worker_first` `["/api/*"]`.
- **Architecture rules:**
  - `worker/app.ts`, and everything it imports, use no Workers globals and never import `cloudflare:workers`. Bindings are read only from `c.env`.
  - Hono routers stay chained, so `AppType` carries every route.
- **Import aliases:**
  - `@/shared/*` means `./shared/*` everywhere.
  - `@/*` means `./src/*` and appears only in `src/`.
  - Worker files import each other relatively.
- **Envelope:** every `/api` response uses the envelope in `shared/envelope.ts`, and browser code calls the API only through `unwrap`.
- **Style:**
  - Biome: 2-space indent, 80 columns, double quotes, semicolons, ES5 trailing commas.
  - Run `bun run check:fix` and then `bun run check` before every commit.
  - Comments explain *why*.
- **Commits:** `git commit -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

## Review Focus

1. **The database is down or unreachable.** `/api/health` answers a 500 envelope with a generic message. No SQL, host, password or connection string appears in the body. (Task 1, health test.)
2. **A wrong `/api/...` path is called.** The answer is a JSON 404 envelope, never the React app's HTML or Hono's plain-text 404. (Task 1, app test.)
3. **An error response isn't JSON**, such as an HTML 502 page from a proxy or the edge. `unwrap` throws `ApiError` with `INTERNAL_ERROR`, never a `SyntaxError`. (Task 3, unwrap test.)
4. **A browser reports Turkish as `tr`, `tr-TR` or `TR`.** The interface is Turkish. Any other language, or none, gives English. (Task 4, locale test.)
5. **Someone adds a route without committing the regenerated `src/routeTree.gen.ts`.** CI fails instead of shipping a stale route tree. (Task 5, CI step, also run locally.)

---

### Task 1: Worker API skeleton with the error envelope

**Files:**
- Create: `package.json`, `bun.lock` (generated), `.gitignore`, `.env.example`, `.dev.vars.example`
- Create: `tsconfig.json`, `tsconfig.base.json`, `tsconfig.worker.json`, `tsconfig.node.json`
- Create: `wrangler.jsonc`, `worker-configuration.d.ts` (generated), `biome.json`, `vitest.config.ts`
- Create: `shared/envelope.ts`
- Create: `worker/env.ts`, `worker/app.ts`, `worker/index.ts`
- Create: `worker/lib/errors.ts`, `worker/db/schema/index.ts`, `worker/db/client.ts`, `worker/middleware/db.ts`, `worker/routes/health.ts`
- Test: `worker/test/env.ts` (helper), `worker/lib/errors.test.ts`, `worker/routes/health.test.ts`, `worker/app.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `shared/envelope.ts`: `type ApiErrorCode`, `type SuccessResponse<T> = { success: true; data: T }`, `type ErrorResponse = { success: false; code: ApiErrorCode; error: string; fields?: Record<string, string> }`, `isErrorResponse(value: unknown): value is ErrorResponse`
  - `worker/lib/errors.ts`: `class AppError(status: ContentfulStatusCode, code: ApiErrorCode, message: string, fields?: Record<string, string>)`, `codeForStatus(status: number): ApiErrorCode`, `handleError: ErrorHandler`, `handleNotFound: NotFoundHandler`
  - `worker/db/client.ts`: `createDb(connectionString: string): { db: Database; close(): Promise<void> }`, `type Database`
  - `worker/env.ts`: `type Bindings = { HYPERDRIVE: { connectionString: string } }`, `type AppEnv = { Bindings: Bindings; Variables: { db: Database } }`
  - `worker/middleware/db.ts`: `withDb` (sets `c.var.db`)
  - `worker/routes/health.ts`: `healthRoutes` (GET `/` → `SuccessResponse<{ db: "up" }>`)
  - `worker/app.ts`: `default app`, `type AppType`
  - `worker/test/env.ts`: `testEnv(connectionString?: string): { env: Bindings; ctx: ExecutionContext; settle(): Promise<unknown> }`

- [ ] **Step 1: Create the branch and the local databases**

```bash
cd ~/repos/deploys/pano
git switch -c feat/phase-0-scaffold
createdb -h 127.0.0.1 -U olbios pano
createdb -h 127.0.0.1 -U olbios pano_test
```

Expected: no output. If a database already exists, `createdb` says so; that's fine.

- [ ] **Step 2: Write `package.json` and install the server-side packages**

`package.json`:

```json
{
  "name": "pano",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite build && vite preview",
    "typecheck": "tsc -b",
    "check": "biome check .",
    "check:fix": "biome check --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "cf-typegen": "wrangler types"
  }
}
```

```bash
bun add hono@^4.13.13 drizzle-orm@^0.45.4 postgres@^3.4.9
bun add -d typescript@~6.0.3 wrangler@^4.151.0 vite@^8.3.4 vitest@^5.0.5 @types/node@^26.6.5 @biomejs/biome@^2.5.15
```

Expected: both commands end with `installed …` and `bun.lock` appears.

- [ ] **Step 3: Write the ignore and env files**

`.gitignore`:

```gitignore
node_modules
dist
.wrangler
*.log
.DS_Store

# Local env: tool-only (.env) and Worker (.dev.vars) variables
.env
.env.*
!.env.example
.dev.vars
.dev.vars.*
!.dev.vars.example
```

`.env.example`:

```sh
# Tool-only variables, read by drizzle-kit and Vitest. The Worker never sees
# this file because .dev.vars exists.
DATABASE_URL=postgresql://olbios@127.0.0.1:5432/pano
TEST_DATABASE_URL=postgresql://olbios@127.0.0.1:5432/pano_test
```

`.dev.vars.example`:

```sh
# Local Worker variables (none yet). Keep .dev.vars even when it's empty:
# without it, the Vite plugin loads .env into the Worker instead.
```

```bash
cp .env.example .env
cp .dev.vars.example .dev.vars
```

- [ ] **Step 4: Write the TypeScript, Wrangler, Biome and Vitest config**

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "es2023",
    "module": "esnext",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "erasableSyntaxOnly": true
  }
}
```

`tsconfig.worker.json`:

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.worker.tsbuildinfo",
    "lib": ["ES2023"],
    "types": ["./worker-configuration.d.ts", "node"],
    "paths": {
      "@/shared/*": ["./shared/*"]
    }
  },
  "include": ["worker", "shared", "worker-configuration.d.ts"]
}
```

`tsconfig.node.json`:

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "lib": ["ES2023"],
    "types": ["node"]
  },
  "include": ["vite.config.ts", "vitest.config.ts", "drizzle.config.ts", "test"]
}
```

`tsconfig.json` (Task 3 adds the app project):

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.worker.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

`wrangler.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "pano",
  "main": "worker/index.ts",
  "compatibility_date": "2026-10-01",
  // postgres.js (and Better Auth, from Phase 1) need Node's APIs in the Worker.
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  "observability": { "enabled": true },
  "upload_source_maps": true,
  "hyperdrive": [
    {
      "binding": "HYPERDRIVE",
      // Placeholder until Phase 5 creates the real config with
      // `wrangler hyperdrive create`. Local dev never uses the id.
      "id": "00000000000000000000000000000000",
      // Miniflare rejects a connection string without a password. Local
      // Postgres uses trust auth, so this one is ignored.
      "localConnectionString": "postgresql://olbios:local@127.0.0.1:5432/pano"
    }
  ]
}
```

`biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.15/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": {
    "ignoreUnknown": false,
    "includes": [
      "src/**/*",
      "worker/**/*",
      "shared/**/*",
      "test/**/*",
      "*.ts",
      "*.json",
      "*.jsonc",
      "!src/routeTree.gen.ts",
      "!worker-configuration.d.ts"
    ]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineEnding": "lf",
    "lineWidth": 80
  },
  "assist": {
    "enabled": true,
    "actions": { "source": { "organizeImports": "on" } }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "preset": "recommended",
      "correctness": { "noChildrenProp": "off" },
      "style": { "noNonNullAssertion": "off" }
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "trailingCommas": "es5",
      "semicolons": "always"
    }
  },
  "css": { "parser": { "cssModules": false, "tailwindDirectives": true } }
}
```

`vitest.config.ts`:

```ts
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      "@/shared": fileURLToPath(new URL("./shared", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Every variable from .env and the process, so TEST_DATABASE_URL reaches
    // the tests however they're started (bun run, bunx, the editor, CI).
    env: loadEnv(mode, process.cwd(), ""),
    environment: "node",
    include: ["worker/**/*.test.ts", "shared/**/*.test.ts", "src/**/*.test.ts"],
    // The integration tests share one Postgres. Running files in parallel
    // makes them contend for it and fail intermittently.
    fileParallelism: false,
  },
}));
```

- [ ] **Step 5: Write the failing tests**

`worker/test/env.ts`:

```ts
import type { ExecutionContext } from "hono";
import type { Bindings } from "../env";

/**
 * Bindings and an ExecutionContext for running the app under Node. `settle`
 * awaits what the app handed to waitUntil (closing its database client), so
 * no test leaves a connection open.
 */
export function testEnv(connectionString = process.env.TEST_DATABASE_URL) {
  if (!connectionString) {
    throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  }
  const pending: Promise<unknown>[] = [];
  const ctx: ExecutionContext = {
    waitUntil: (promise) => {
      pending.push(promise);
    },
    passThroughOnException: () => {},
    props: {},
  };
  const env: Bindings = { HYPERDRIVE: { connectionString } };
  return { env, ctx, settle: () => Promise.allSettled(pending) };
}
```

`worker/lib/errors.test.ts`:

```ts
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError, handleError, handleNotFound } from "./errors";

function appThatThrows(error: Error) {
  const app = new Hono().get("/boom", () => {
    throw error;
  });
  app.onError(handleError);
  app.notFound(handleNotFound);
  return app;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleError", () => {
  it("turns an AppError into its status, code, message and fields", async () => {
    const error = new AppError(409, "CONFLICT", "Slug taken", {
      slug: "Already used",
    });
    const res = await appThatThrows(error).request("/boom");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      success: false,
      code: "CONFLICT",
      error: "Slug taken",
      fields: { slug: "Already used" },
    });
  });

  it("leaves fields out when an AppError has none", async () => {
    const error = new AppError(403, "FORBIDDEN", "Team only");
    const res = await appThatThrows(error).request("/boom");
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body).toEqual({
      success: false,
      code: "FORBIDDEN",
      error: "Team only",
    });
    expect("fields" in body).toBe(false);
  });

  it("maps an HTTPException's status to a code", async () => {
    const error = new HTTPException(401, { message: "Sign in first" });
    const res = await appThatThrows(error).request("/boom");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      success: false,
      code: "UNAUTHORIZED",
      error: "Sign in first",
    });
  });

  it("falls back to INTERNAL_ERROR for a status without a code", async () => {
    const error = new HTTPException(418, { message: "Teapot" });
    const res = await appThatThrows(error).request("/boom");
    expect(await res.json()).toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("hides an unexpected error's details behind a generic 500", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("connect failed: password=hunter2");
    const res = await appThatThrows(error).request("/boom");
    const body = await res.text();
    expect(res.status).toBe(500);
    expect(JSON.parse(body)).toEqual({
      success: false,
      code: "INTERNAL_ERROR",
      error: "Internal Server Error",
    });
    expect(body).not.toContain("hunter2");
    expect(log).toHaveBeenCalledOnce();
  });
});

describe("handleNotFound", () => {
  it("answers 404 with the error envelope", async () => {
    const res = await appThatThrows(new Error("unused")).request("/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      success: false,
      code: "NOT_FOUND",
      error: "Not found",
    });
  });
});
```

`worker/routes/health.test.ts`:

```ts
import { testClient } from "hono/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../app";
import { testEnv } from "../test/env";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/health", () => {
  it("reports the database as up", async () => {
    const { env, ctx, settle } = testEnv();
    const res = await testClient(app, env, ctx).api.health.$get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { db: "up" } });
    await settle();
  });

  it("answers a generic 500 when the database is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { env, ctx, settle } = testEnv(
      "postgresql://nobody:secret@127.0.0.1:1/none"
    );
    const res = await testClient(app, env, ctx).api.health.$get();
    const body = await res.text();
    expect(res.status).toBe(500);
    expect(JSON.parse(body)).toEqual({
      success: false,
      code: "INTERNAL_ERROR",
      error: "Internal Server Error",
    });
    expect(body).not.toContain("127.0.0.1:1");
    expect(body).not.toContain("secret");
    await settle();
  });
});
```

`worker/app.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import app from "./app";
import { testEnv } from "./test/env";

describe("the API app", () => {
  it("answers an unknown /api path with a JSON 404 envelope", async () => {
    const { env, ctx, settle } = testEnv();
    const res = await app.request("/api/does-not-exist", {}, env, ctx);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({
      success: false,
      code: "NOT_FOUND",
      error: "Not found",
    });
    await settle();
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `bun run test`
Expected: FAIL. Every file fails to import (`Failed to resolve import "./errors"`, `"../app"`, `"../env"`).

- [ ] **Step 7: Write the envelope and the worker code**

`shared/envelope.ts`:

```ts
/**
 * The JSON shape every /api response uses. Success carries `data`. Failure
 * carries a stable `code` the UI translates, an English `error` for logs and
 * developers, and optional per-field messages for forms.
 */
export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export type SuccessResponse<T> = { success: true; data: T };

export type ErrorResponse = {
  success: false;
  code: ApiErrorCode;
  error: string;
  fields?: Record<string, string>;
};

export function isErrorResponse(value: unknown): value is ErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { success?: unknown }).success === false &&
    typeof (value as { code?: unknown }).code === "string" &&
    typeof (value as { error?: unknown }).error === "string"
  );
}
```

`worker/db/schema/index.ts`:

```ts
// Tables arrive with the features that need them, from Phase 1 on.
export {};
```

`worker/db/client.ts`:

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * One small client per request. Hyperdrive pools the real connections to
 * Postgres, and a Worker can't reuse a socket across requests anyway.
 * fetch_types skips a startup round trip for custom array types we don't use.
 */
export function createDb(connectionString: string) {
  const client = postgres(connectionString, { max: 5, fetch_types: false });
  return {
    db: drizzle({ client, schema }),
    close: () => client.end({ timeout: 5 }),
  };
}

export type Database = ReturnType<typeof createDb>["db"];
```

`worker/env.ts`:

```ts
import type { Database } from "./db/client";

/**
 * Bindings are typed structurally, not with the generated Workers types. That
 * way the app also typechecks inside the browser project, which imports
 * AppType, and runs under Node in tests.
 */
export type Bindings = {
  HYPERDRIVE: { connectionString: string };
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: { db: Database };
};
```

`worker/lib/errors.ts`:

```ts
import type { ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiErrorCode, ErrorResponse } from "@/shared/envelope";

/**
 * Throw from a route to answer with a specific status and a stable code the
 * UI can translate. `fields` carries per-field messages for forms.
 */
export class AppError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: ApiErrorCode;
  readonly fields?: Record<string, string>;

  constructor(
    status: ContentfulStatusCode,
    code: ApiErrorCode,
    message: string,
    fields?: Record<string, string>
  ) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function codeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case 400:
    case 422:
      return "BAD_REQUEST";
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 429:
      return "RATE_LIMITED";
    default:
      return "INTERNAL_ERROR";
  }
}

export const handleError: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    return c.json<ErrorResponse>(
      {
        success: false,
        code: err.code,
        error: err.message,
        ...(err.fields ? { fields: err.fields } : {}),
      },
      err.status
    );
  }
  if (err instanceof HTTPException) {
    return c.json<ErrorResponse>(
      {
        success: false,
        code: codeForStatus(err.status),
        error: err.message || "Request failed",
      },
      err.status
    );
  }
  // Anything else is a bug or an outage. Log it for Workers observability and
  // keep its details (SQL, hosts, connection strings) out of the response.
  console.error(err);
  return c.json<ErrorResponse>(
    { success: false, code: "INTERNAL_ERROR", error: "Internal Server Error" },
    500
  );
};

export const handleNotFound: NotFoundHandler = (c) =>
  c.json<ErrorResponse>(
    { success: false, code: "NOT_FOUND", error: "Not found" },
    404
  );
```

`worker/middleware/db.ts`:

```ts
import { createMiddleware } from "hono/factory";
import { createDb } from "../db/client";
import type { AppEnv } from "../env";

export const withDb = createMiddleware<AppEnv>(async (c, next) => {
  const { db, close } = createDb(c.env.HYPERDRIVE.connectionString);
  c.set("db", db);
  try {
    await next();
  } finally {
    // Close after the response is on its way rather than delaying it.
    c.executionCtx.waitUntil(close());
  }
});
```

`worker/routes/health.ts`:

```ts
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import type { SuccessResponse } from "@/shared/envelope";
import type { AppEnv } from "../env";

export const healthRoutes = new Hono<AppEnv>().get("/", async (c) => {
  await c.var.db.execute(sql`select 1`);
  return c.json<SuccessResponse<{ db: "up" }>>({
    success: true,
    data: { db: "up" },
  });
});
```

`worker/app.ts`:

```ts
import { Hono } from "hono";
import type { AppEnv } from "./env";
import { handleError, handleNotFound } from "./lib/errors";
import { withDb } from "./middleware/db";
import { healthRoutes } from "./routes/health";

/**
 * The whole API as one chained Hono app, so AppType carries every route.
 * Keep it runtime-agnostic: the browser project typechecks this file through
 * AppType, and tests run it under Node. Workers-only code (cron triggers,
 * HTMLRewriter) belongs in index.ts.
 */
const app = new Hono<AppEnv>()
  .basePath("/api")
  .use(withDb)
  .route("/health", healthRoutes);

app.onError(handleError);
app.notFound(handleNotFound);

export type AppType = typeof app;
export default app;
```

`worker/index.ts`:

```ts
import app from "./app";

// The Workers entry point. Cron triggers and link-preview rewriting join this
// file in later phases; the API itself lives in app.ts.
export default app;
```

- [ ] **Step 8: Generate the Worker types**

Run: `bun run cf-typegen`
Expected: `worker-configuration.d.ts` is created, and `grep -n "HYPERDRIVE: Hyperdrive" worker-configuration.d.ts` finds one line.

- [ ] **Step 9: Run the tests to verify they pass**

Run: `bun run test`
Expected: PASS. 3 test files, 9 tests.

- [ ] **Step 10: Typecheck and lint**

```bash
bun run typecheck
bun run check:fix
bun run check
```

Expected: `tsc -b` prints nothing (exit 0), and the final `biome check` reports no errors.

- [ ] **Step 11: Commit**

```bash
git add .gitignore .env.example .dev.vars.example package.json bun.lock \
  tsconfig.json tsconfig.base.json tsconfig.worker.json tsconfig.node.json \
  wrangler.jsonc worker-configuration.d.ts biome.json vitest.config.ts \
  shared worker
git commit -m "feat: Worker API skeleton with the error envelope" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Migrations and the test database

**Files:**
- Create: `drizzle.config.ts`, `drizzle/0000_extensions.sql`, `drizzle/meta/_journal.json` and `drizzle/meta/0000_snapshot.json` (both generated)
- Create: `test/global-setup.ts`
- Modify: `vitest.config.ts` (add `globalSetup`), `package.json` (add `db:*` scripts and drizzle-kit)
- Test: `worker/db/migrations.test.ts`

**Interfaces:**
- Consumes: `createDb(connectionString)` from `worker/db/client.ts` (Task 1).
- Produces:
  - `bun run db:generate` and `bun run db:migrate` (drizzle-kit, reading `DATABASE_URL`).
  - Vitest's global setup migrates `TEST_DATABASE_URL` before any test runs.
  - The `pg_trgm` extension, enabled for Phase 2's similar-request search.

- [ ] **Step 1: Write the failing test**

`worker/db/migrations.test.ts`:

```ts
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "./client";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
const { db, close } = createDb(url);

afterAll(() => close());

describe("migrations", () => {
  it("enable pg_trgm for typo-tolerant search", async () => {
    const rows = await db.execute<{ extname: string }>(
      sql`select extname from pg_extension where extname = 'pg_trgm'`
    );
    expect(rows.map((row) => row.extname)).toEqual(["pg_trgm"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test worker/db/migrations.test.ts`
Expected: FAIL with `expected [] to deeply equal [ 'pg_trgm' ]`, because the fresh `pano_test` has no extensions.

- [ ] **Step 3: Install drizzle-kit, add the scripts and the config**

```bash
bun add -d drizzle-kit@^0.31.11
```

Add these two entries to the `"scripts"` block of `package.json`:

```json
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
```

`drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

// Bun loads .env for `bun run`, so this is the local dev database by default.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");

export default defineConfig({
  dialect: "postgresql",
  schema: "./worker/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
```

- [ ] **Step 4: Generate an empty custom migration and fill it in**

Run: `bun run db:generate --custom --name=extensions`
Expected: `[✓] Your SQL migration file ➜ drizzle/0000_extensions.sql`, plus `drizzle/meta/_journal.json` and `drizzle/meta/0000_snapshot.json`.

Replace the contents of `drizzle/0000_extensions.sql` with:

```sql
-- pg_trgm powers typo-tolerant "similar requests" matching (Phase 2).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

- [ ] **Step 5: Migrate the test database before the tests run**

`test/global-setup.ts`:

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { loadEnv } from "vite";

/**
 * Brings the test database up to the latest migration once per run, so every
 * test sees the same schema production will.
 */
export default async function setup() {
  const url =
    process.env.TEST_DATABASE_URL ??
    loadEnv("test", process.cwd(), "").TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle({ client }), { migrationsFolder: "./drizzle" });
  } finally {
    await client.end();
  }
}
```

In `vitest.config.ts`, add the `globalSetup` line just above `fileParallelism`:

```ts
    globalSetup: ["./test/global-setup.ts"],
    // The integration tests share one Postgres. Running files in parallel
    // makes them contend for it and fail intermittently.
    fileParallelism: false,
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun run test`
Expected: PASS. 4 test files, 10 tests.

- [ ] **Step 7: Migrate the dev database**

Run: `bun run db:migrate`
Expected: ends with `[✓] migrations applied successfully!`

- [ ] **Step 8: Typecheck and lint**

```bash
bun run typecheck
bun run check:fix
bun run check
```

Expected: both pass.

- [ ] **Step 9: Commit**

```bash
git add package.json bun.lock drizzle.config.ts drizzle test vitest.config.ts worker/db/migrations.test.ts
git commit -m "feat: migrations with pg_trgm, applied to the test database on every run" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: React shell that calls the typed API

**Files:**
- Create: `tsconfig.app.json`, `vite.config.ts`, `index.html`
- Create: `src/main.tsx`, `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/lib/api.ts`, `src/routeTree.gen.ts` (generated)
- Modify: `tsconfig.json` (add the app project and root `paths`), `package.json` (frontend packages)
- Test: `src/lib/api.test.ts`

**Interfaces:**
- Consumes: `type AppType` and `default app` from `worker/app.ts`; `SuccessResponse`, `ApiErrorCode`, `isErrorResponse` from `shared/envelope.ts`.
- Produces:
  - `src/lib/api.ts`: `api` (the `hc<AppType>` client rooted at `/api`), `class ApiError(status: number, code: ApiErrorCode, message: string, fields?: Record<string, string>)`, `unwrap<T>(res): Promise<T>`
  - The router context is `{ queryClient: QueryClient }`.

- [ ] **Step 1: Write the failing test**

`src/lib/api.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ApiError, unwrap } from "./api";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("unwrap", () => {
  it("returns data from a success envelope", async () => {
    const res = json(200, { success: true, data: { db: "up" } });
    await expect(unwrap(res)).resolves.toEqual({ db: "up" });
  });

  it("throws ApiError with the envelope's status, code, message and fields", async () => {
    const res = json(409, {
      success: false,
      code: "CONFLICT",
      error: "Slug taken",
      fields: { slug: "Already used" },
    });
    const error = await unwrap(res).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: "CONFLICT",
      message: "Slug taken",
      fields: { slug: "Already used" },
    });
  });

  it("throws INTERNAL_ERROR when an error body isn't JSON", async () => {
    const res = new Response("<html>502 Bad Gateway</html>", {
      status: 502,
      headers: { "content-type": "text/html" },
    });
    const error = await unwrap(res).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 502, code: "INTERNAL_ERROR" });
  });

  it("throws INTERNAL_ERROR when JSON isn't the error envelope", async () => {
    const error = await unwrap(json(500, { message: "boom" })).catch(
      (e: unknown) => e
    );
    expect(error).toMatchObject({ status: 500, code: "INTERNAL_ERROR" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test src/lib/api.test.ts`
Expected: FAIL with `Failed to resolve import "./api"`.

- [ ] **Step 3: Install the frontend packages**

```bash
bun add react@^19.3.1 react-dom@^19.3.1 @tanstack/react-router@^1.170.44 @tanstack/react-query@^5.104.3
bun add -d @vitejs/plugin-react@^6.1.2 @cloudflare/vite-plugin@^1.64.0 @tanstack/router-plugin@^1.168.46 @types/react@^19.3.0 @types/react-dom@^19.3.0
```

- [ ] **Step 4: Write the API client**

`src/lib/api.ts`:

```ts
import { hc } from "hono/client";
import {
  type ApiErrorCode,
  isErrorResponse,
  type SuccessResponse,
} from "@/shared/envelope";
import type { AppType } from "../../worker/app";

/** The typed client. Every route and payload comes from the Worker's AppType. */
export const api = hc<AppType>("/").api;

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly fields?: Record<string, string>;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    fields?: Record<string, string>
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

type JsonResponse<T> = {
  ok: boolean;
  status: number;
  json(): Promise<SuccessResponse<T>>;
};

/**
 * Returns `data` from a successful response and throws ApiError otherwise, so
 * a failed request always reaches TanStack Query's onError. An error body
 * that isn't the envelope (a proxy's HTML page, say) still becomes ApiError.
 */
export async function unwrap<T>(res: JsonResponse<T>): Promise<T> {
  if (res.ok) return (await res.json()).data;
  const body: unknown = await res.json().catch(() => null);
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

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun run test src/lib/api.test.ts`
Expected: PASS. 4 tests.

- [ ] **Step 6: Write the Vite config, the HTML shell, the app tsconfig and the routes**

`vite.config.ts`:

```ts
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    // Must come before react(): it generates src/routeTree.gen.ts.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    cloudflare(),
  ],
  resolve: {
    alias: {
      "@/shared": fileURLToPath(new URL("./shared", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Feedback boards and a public roadmap." />
    <title>Pano</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`tsconfig.app.json`:

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client"],
    "paths": {
      "@/shared/*": ["./shared/*"],
      "@/*": ["./src/*"]
    }
  },
  "include": ["src", "shared"]
}
```

Replace `tsconfig.json` with the version below. The root `paths` don't affect compilation; they're where the shadcn CLI (Task 4) looks up aliases.

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.worker.json" },
    { "path": "./tsconfig.node.json" }
  ],
  "compilerOptions": {
    "paths": {
      "@/shared/*": ["./shared/*"],
      "@/*": ["./src/*"]
    }
  }
}
```

`src/main.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { routeTree } from "./routeTree.gen";

const queryClient = new QueryClient();
const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
);
```

`src/routes/__root.tsx`:

```tsx
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: () => <Outlet />,
});
```

`src/routes/index.tsx` (Task 4 adds styling and translations):

```tsx
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { api, unwrap } from "@/lib/api";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => unwrap(await api.health.$get()),
    retry: 1,
  });
  if (health.isPending) return <main>Checking the API…</main>;
  if (health.isError) return <main>API unreachable</main>;
  // health.data.db is typed "up": the type comes from the Worker's route.
  return <main>API {health.data.db}</main>;
}
```

- [ ] **Step 7: Build (this generates the route tree), then typecheck**

```bash
bun run build
bun run typecheck
```

Expected:
- The build ends with two `✓ built in` lines: the `pano` Worker environment and then the client.
- `src/routeTree.gen.ts` now exists.
- `tsc -b` exits 0.

- [ ] **Step 8: See it run**

```bash
(bun run dev --port 5199 --strictPort > "${TMPDIR:-/tmp}/pano-dev.log" 2>&1 &)
curl -s --retry 40 --retry-connrefused --retry-delay 1 --max-time 60 http://localhost:5199/api/health; echo
curl -s -w ' [%{http_code}]\n' http://localhost:5199/api/does-not-exist
curl -s -o /dev/null -w '%{http_code}\n' -H 'Sec-Fetch-Mode: navigate' -H 'Accept: text/html' http://localhost:5199/acme/roadmap
pkill -f "vite --port 5199"
```

Expected, in order:
- `{"success":true,"data":{"db":"up"}}`
- `{"success":false,"code":"NOT_FOUND","error":"Not found"} [404]`
- `200`: the React app answers deep links.

The dev log's first line reads `Using secrets defined in .dev.vars`. Opening http://localhost:5199 in a browser while the server runs shows "API up".

- [ ] **Step 9: Lint and run all tests**

```bash
bun run check:fix
bun run check
bun run test
```

Expected: Biome passes. 5 test files, 14 tests pass.

- [ ] **Step 10: Commit**

```bash
git add package.json bun.lock tsconfig.json tsconfig.app.json vite.config.ts index.html src
git commit -m "feat: React shell calling the typed API through unwrap" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Styling and translations

**Files:**
- Create: `src/styles.css` (rewritten by shadcn init), `components.json` (generated), `src/components/ui/button.tsx` (generated), `src/lib/utils.ts` (generated)
- Create: `src/i18n/locale.ts`, `src/i18n/messages/en.json`, `src/i18n/messages/tr.json`, `src/i18n/provider.tsx`, `src/i18n/types.d.ts`
- Modify: `vite.config.ts` (Tailwind plugin), `src/main.tsx` (stylesheet and provider), `src/routes/index.tsx` (translated, styled), `package.json`
- Test: `src/i18n/locale.test.ts`, `src/i18n/messages.test.ts`

**Interfaces:**
- Consumes: `api` and `unwrap` from `src/lib/api.ts` (Task 3).
- Produces:
  - `src/i18n/locale.ts`: `LOCALES`, `type Locale = "en" | "tr"`, `localeFromLanguageTag(tag: string | undefined): Locale`
  - `src/i18n/provider.tsx`: `I18nProvider`
  - Typed message keys: `useTranslations("home")` only accepts keys that exist in `en.json`.
  - `Button` from `@/components/ui/button`.
  - shadcn components import `cn` from the `cn` package, which is shadcn's own replacement for clsx + tailwind-merge.

- [ ] **Step 1: Write the failing tests**

`src/i18n/locale.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { localeFromLanguageTag } from "./locale";

describe("localeFromLanguageTag", () => {
  it.each(["tr", "tr-TR", "TR", "tr-CY"])("picks Turkish for %s", (tag) => {
    expect(localeFromLanguageTag(tag)).toBe("tr");
  });

  it.each(["en", "en-GB", "de-DE", "az-AZ", ""])(
    "picks English for %s",
    (tag) => {
      expect(localeFromLanguageTag(tag)).toBe("en");
    }
  );

  it("picks English when the browser reports nothing", () => {
    expect(localeFromLanguageTag(undefined)).toBe("en");
  });
});
```

`src/i18n/messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import en from "./messages/en.json";
import tr from "./messages/tr.json";

// The catalogs must stay structurally identical: a key in one language but not
// the other shows up at runtime as a missing-message error.
function keyTree(obj: unknown, prefix = ""): string[] {
  if (Array.isArray(obj)) return [`${prefix}[]`];
  if (obj !== null && typeof obj === "object") {
    return Object.entries(obj).flatMap(([key, value]) =>
      keyTree(value, prefix ? `${prefix}.${key}` : key)
    );
  }
  return [prefix];
}

function flatten(
  obj: Record<string, unknown>,
  prefix = ""
): Record<string, string> {
  return Object.entries(obj).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "string") acc[path] = value;
      else if (value && typeof value === "object" && !Array.isArray(value)) {
        Object.assign(acc, flatten(value as Record<string, unknown>, path));
      }
      return acc;
    },
    {}
  );
}

// Argument names per message, ignoring ICU plural/select clause bodies.
function placeholders(obj: Record<string, unknown>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(flatten(obj))) {
    const cleaned = value.replace(
      /(zero|one|two|few|many|other|=\d+)\s*\{[^}]*\}/g,
      ""
    );
    const names = [...new Set([...cleaned.matchAll(/\{(\w+)/g)].map((m) => m[1]))]
      .sort()
      .join(",");
    map.set(key, names);
  }
  return map;
}

describe("message catalogs", () => {
  it("en and tr have identical key trees", () => {
    expect(keyTree(en).sort()).toEqual(keyTree(tr).sort());
  });

  it("placeholders match between locales", () => {
    expect(placeholders(en)).toEqual(placeholders(tr));
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test src/i18n`
Expected: FAIL with `Failed to resolve import "./locale"` and `"./messages/en.json"`.

- [ ] **Step 3: Write the locale rule and the catalogs**

`src/i18n/locale.ts`:

```ts
export const LOCALES = ["en", "tr"] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * The interface language from a browser language tag: Turkish for any `tr`
 * variant, English for everything else. Phase 1 puts the user's saved choice
 * and the workspace default in front of this.
 */
export function localeFromLanguageTag(tag: string | undefined): Locale {
  return tag?.toLowerCase().split("-")[0] === "tr" ? "tr" : "en";
}
```

`src/i18n/messages/en.json`:

```json
{
  "home": {
    "title": "Pano",
    "tagline": "Feedback boards and a public roadmap.",
    "apiChecking": "Checking the API…",
    "apiUp": "API is up",
    "apiDown": "API unreachable",
    "retry": "Check again"
  }
}
```

`src/i18n/messages/tr.json`:

```json
{
  "home": {
    "title": "Pano",
    "tagline": "Geri bildirim panoları ve herkese açık yol haritası.",
    "apiChecking": "API kontrol ediliyor…",
    "apiUp": "API çalışıyor",
    "apiDown": "API'ye ulaşılamıyor",
    "retry": "Tekrar kontrol et"
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test src/i18n`
Expected: PASS. 2 files, 12 tests.

- [ ] **Step 5: Add Tailwind and initialize shadcn**

```bash
bun add tailwindcss@^4.3.3 @tailwindcss/vite@^4.3.3 use-intl@^4.14.9
```

In `vite.config.ts`, import the plugin and add it after `react()`:

```ts
import tailwindcss from "@tailwindcss/vite";
```

```ts
  plugins: [
    // Must come before react(): it generates src/routeTree.gen.ts.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    cloudflare(),
  ],
```

`src/styles.css`. shadcn init expands this file with the theme tokens:

```css
@import "tailwindcss";
```

```bash
bunx --bun shadcn@4.21.5 init -t vite -b radix -p nova --no-monorepo -y --no-rtl --no-pointer
```

Expected output ends with:

```
✔ Created 2 files:
  - src/components/ui/button.tsx
  - src/lib/utils.ts
✔ Updating src/styles.css
Project initialization completed.
```

The command also:
- writes `components.json` with `"style": "radix-nova"`
- adds the dependencies `cn`, `radix-ui`, `class-variance-authority`, `lucide-react`, `tw-animate-css`, `shadcn` and `@fontsource-variable/geist`.

Phase 5's identity pass replaces the Geist font.

- [ ] **Step 6: Wire up the translations and the stylesheet**

`src/i18n/types.d.ts`:

```ts
import type en from "./messages/en.json";

// Makes message keys type-checked: t("typo") fails to compile.
declare module "use-intl" {
  interface AppConfig {
    Locale: "en" | "tr";
    Messages: typeof en;
  }
}
```

`src/i18n/provider.tsx`:

```tsx
import { type ReactNode, useEffect } from "react";
import { IntlProvider } from "use-intl";
import { type Locale, localeFromLanguageTag } from "./locale";
import en from "./messages/en.json";
import tr from "./messages/tr.json";

// `satisfies` makes a key missing from tr.json a compile error too.
const messages = { en, tr } satisfies Record<Locale, typeof en>;

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = localeFromLanguageTag(navigator.language);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <IntlProvider
      locale={locale}
      messages={messages[locale]}
      timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
    >
      {children}
    </IntlProvider>
  );
}
```

`src/main.tsx`: add the two imports below the existing ones, then wrap the tree in `I18nProvider`:

```tsx
import { I18nProvider } from "./i18n/provider";
import "./styles.css";
```

```tsx
createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nProvider>
  </StrictMode>
);
```

`src/routes/index.tsx` (full replacement):

```tsx
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslations } from "use-intl";
import { Button } from "@/components/ui/button";
import { api, unwrap } from "@/lib/api";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const t = useTranslations("home");
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => unwrap(await api.health.$get()),
    retry: 1,
  });

  const status = health.isPending
    ? t("apiChecking")
    : health.isError
      ? t("apiDown")
      : t("apiUp");

  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-4 p-6">
      <h1 className="text-4xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground">{t("tagline")}</p>
      <div className="flex items-center gap-3">
        <output aria-live="polite">{status}</output>
        <Button
          variant="outline"
          size="sm"
          onClick={() => health.refetch()}
          disabled={health.isFetching}
        >
          {t("retry")}
        </Button>
      </div>
    </main>
  );
}
```

- [ ] **Step 7: Build, typecheck, lint, test**

```bash
bun run build
bun run typecheck
bun run check:fix
bun run check
bun run test
```

Expected:
- The build writes a CSS asset of about 24 kB.
- `tsc -b` exits 0.
- Biome passes. `check:fix` reformats the shadcn-generated files to the house style.
- 7 test files, 26 tests pass.

- [ ] **Step 8: Prove the message keys are typed**

Temporarily change `t("retry")` in `src/routes/index.tsx` to `t("retryy")`, then run `bun run typecheck`.

Expected: FAIL with `Argument of type '"retryy"' is not assignable`. Revert the change and run `bun run typecheck` again; it passes.

- [ ] **Step 9: Commit**

```bash
git add package.json bun.lock vite.config.ts components.json src
git commit -m "feat: Tailwind + shadcn and English/Turkish translations with typed keys" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: CI and README

**Files:**
- Create: `.github/workflows/ci.yml`, `README.md`

**Interfaces:**
- Consumes: the `typecheck`, `check`, `test` and `build` scripts, and `TEST_DATABASE_URL` (Tasks 1–4).
- Produces: a CI job named `typecheck · lint · test · build`, plus local-setup docs.

- [ ] **Step 1: Write the workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main, "feat/**"]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    name: typecheck · lint · test · build
    runs-on: ubuntu-latest

    # The integration tests talk to a real Postgres. The official image ships
    # pg_trgm, which the first migration enables; Vitest's global setup
    # applies the migrations.
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: pano_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      TEST_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/pano_test

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          # Pinned to the local version, so CI and dev resolve the same.
          bun-version: 1.3.1

      - name: Install
        run: bun install --frozen-lockfile

      - name: Typecheck
        run: bun run typecheck

      - name: Lint
        run: bun run check

      - name: Test
        run: bun run test

      - name: Build
        run: bun run build

      # The router plugin regenerates the route tree during the build. A diff
      # here means a route was added without committing the regenerated file.
      - name: Route tree is committed
        run: git diff --exit-code src/routeTree.gen.ts
```

- [ ] **Step 2: Write the README**

`README.md`:

````markdown
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

## Layout and rules

- `worker/app.ts`: the whole API as one chained Hono app. It stays
  runtime-agnostic (no Workers globals, bindings only from `c.env`), because
  the browser project typechecks it through `AppType` and tests run it under
  Node.
- `worker/index.ts`: the Workers entry. Workers-only code goes here.
- `shared/`: code both sides use, including the response envelope in
  `shared/envelope.ts`.
- `src/`: the React app. It calls the API only through
  `unwrap(await api.….$get())` from `src/lib/api.ts`.
- **Aliases:** `@/shared/*` works everywhere. `@/*` means `src/` and is used
  only there. Worker files import each other relatively.
````

- [ ] **Step 3: Run the CI steps locally against a fresh database**

```bash
dropdb -h 127.0.0.1 -U olbios --if-exists pano_ci_check
createdb -h 127.0.0.1 -U olbios pano_ci_check
export TEST_DATABASE_URL=postgresql://olbios@127.0.0.1:5432/pano_ci_check
bun install --frozen-lockfile && bun run typecheck && bun run check \
  && bun run test && bun run build && git diff --exit-code src/routeTree.gen.ts
echo "exit: $?"
unset TEST_DATABASE_URL
dropdb -h 127.0.0.1 -U olbios pano_ci_check
```

Expected:
- Every step passes and the last line is `exit: 0`.
- The test run migrates the brand-new `pano_ci_check` database itself. This proves CI needs no separate migrate step.

- [ ] **Step 4: Prove the route-tree check bites**

```bash
cat > src/routes/probe.tsx <<'EOF'
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/probe")({ component: () => null });
EOF
bun run build >/dev/null && git diff --exit-code --stat src/routeTree.gen.ts; echo "exit: $?"
rm src/routes/probe.tsx && bun run build >/dev/null && git diff --exit-code src/routeTree.gen.ts; echo "exit: $?"
```

Expected: the first `exit:` is `1`, with `src/routeTree.gen.ts` listed as changed. After removing the probe and rebuilding, the second is `0`.

- [ ] **Step 5: Lint and commit**

```bash
bun run check:fix
bun run check
git add .github README.md
git commit -m "ci: typecheck, lint, test and build on every push; README with local setup" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase 0 done when

- [ ] `bun run dev` serves the page, and the page reports the API's status through the typed client: "API is up", or "API çalışıyor" with a Turkish browser.
- [ ] `bun run typecheck`, `bun run check`, `bun run test` and `bun run build` pass on a fresh clone, with the CI steps run locally (Task 5, Step 3).
- [ ] Real CI runs once the GitHub repo exists. Creating and pushing it is your call; this plan doesn't do it.
