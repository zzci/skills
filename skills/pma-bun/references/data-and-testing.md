# PMA-Bun Data And Testing

## Table of Contents

- [Database Default: Drizzle Plus SQLite](#database-default-drizzle-plus-sqlite)
- [Driver Guidance](#driver-guidance)
- [Migrations](#migrations)
- [PostgreSQL Alternative](#postgresql-alternative)
- [Repository Pattern](#repository-pattern)
- [Testing](#testing)
- [Coverage Configuration](#coverage-configuration)
- [Test Boundaries](#test-boundaries)


## Database Default: Drizzle Plus SQLite

Prefer this for:

- single-instance services
- internal tools with local state
- local-first tools
- CLIs
- small internal APIs

Rules:

- keep schema in `src/db/schema.ts`
- keep DB initialization and migration wiring in `src/db/index.ts`
- keep generated migrations under the API package (`drizzle/`, or `apps/api/drizzle/` in a monorepo)
- use WAL mode when appropriate
- commit generated SQL migrations together with `drizzle/meta/`
- choose one driver story and document it clearly

Version note: Drizzle ORM 0.45 with drizzle-kit 0.31 is the stable line. 1.0 is published on the `rc` tag with API changes; do not adopt it without a recorded reason in the proposal.

## Driver Guidance

Default extracted pattern:

- use Drizzle for schema and query composition
- use Bun's built-in `bun:sqlite` through `drizzle-orm/bun-sqlite`: zero dependencies, synchronous API, works unchanged inside `bun build --compile` output
- at-rest encryption is out of scope for the driver; when it is required, encrypt the volume that holds `DATA_DIR` and record the decision in the proposal
- expose a single `createDb()` path that configures pragmas, schema binding, and migration execution

```typescript
// src/db/index.ts
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { root } from "@/root";
import * as schema from "./schema";

export function createDb() {
  const sqlite = new Database(root.data("app.db"), { create: true });
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: root.asset("drizzle") });
  return db;
}

export type Db = ReturnType<typeof createDb>;
```

```typescript
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: "./data/app.db" },
});
```

## Migrations

- generate with `drizzle-kit generate`; commit `drizzle/*.sql` and `drizzle/meta/`
- apply at startup through `migrate()` for single-instance services; run `drizzle-kit migrate` from a deploy step instead when several instances share one database
- never edit a committed migration — add a new one
- compiled mode: `--asset ./drizzle` embeds the folder and `migrate()` reads it from `root.asset("drizzle")` through `node:fs`; no generated module and no temp extraction. The compiled-mode smoke test proves it. Only if the migrator cannot read the embedded tree, copy it to a temp directory inside `createDb()` and keep that detail there.

## PostgreSQL Alternative

Use PostgreSQL when the service needs:

- multi-instance writes
- richer concurrent access patterns
- shared database infrastructure
- more advanced query characteristics than the default SQLite setup supports

Drivers: `postgres` with `drizzle-orm/postgres-js`, or Bun's built-in `Bun.sql` with `drizzle-orm/bun-sql`. Keep the swap explicit in docs, scripts, and CI.

## Repository Pattern

- repositories own persistence details
- services own business logic
- route handlers coordinate transport only
- keep DB-specific types from leaking through the application without intent
- if a module stays small, a combined `*.service.ts` file is acceptable; do not force extra layers without payoff

## Testing

Use:

- unit tests close to modules with `*.test.ts`
- route tests through `app.request()` against the `OpenAPIHono` app — no listening socket, no port
- integration tests under `tests/integration/` with a real SQLite file in a temp `DATA_DIR`
- an OpenAPI contract test: `GET /openapi.json` and `expect(json).toMatchSnapshot()`; a route change must update the snapshot on purpose (`bun test -u`)
- a compiled-mode smoke test when a binary ships: build, start the binary with a temp `DATA_DIR` and a free `PORT`, hit `/health` and `/openapi.json`, expect migrations applied
- Playwright only when browser-level coverage is required
- API package tests should run directly under Bun unless another runner is already justified

Rules:

- prefer real dependencies over fragile mocks when feasible
- restore mocks after each test
- keep tests independent; when files start sharing globals, run `bun test --parallel --isolate`
- run coverage in CI and target 80 percent or higher, enforced by `bunfig.toml`
- keep migration and schema behavior under test when database bootstrap changes
- `bun test --changed` is a local shortcut, never the CI command

## Coverage Configuration

```toml
# bunfig.toml
[test]
coverageThreshold = { lines = 0.8, functions = 0.8 }
coverageSkipTestFiles = true
coveragePathIgnorePatterns = ["drizzle/**", "scripts/**"]
coverageReporter = ["text", "lcov"]
```

- `bun test --coverage` exits non-zero when the threshold is missed; CI relies on that instead of parsing output
- keep `coverage` off by default so plain `bun test` stays fast; `test:coverage` turns it on
- the `lcov` report feeds code-review tooling; do not commit it

## Test Boundaries

- validate route input and error translation at the edge
- test repositories against real schema behavior where practical
- test service logic without coupling everything to HTTP transport
- test startup helpers when they encode non-trivial behavior such as lock recovery, path detection, or migration fallback
