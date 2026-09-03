# PMA-Bun Baseline

## Table of Contents

- [Scope](#scope)
- [Tech Stack](#tech-stack)
- [Dependency Freshness (Bun)](#dependency-freshness-bun)
- [Required Quality Gates](#required-quality-gates)
- [Project Layout](#project-layout)
- [Required Conventions](#required-conventions)
- [Code Quality Standards](#code-quality-standards)
- [Baseline Scripts](#baseline-scripts)
- [Implementation Workflow](#implementation-workflow)


## Scope

Use this pack for PMA-managed Bun backends, API services, and Bun-based full-stack monorepos.

Goals:

- Bun-native runtime and workspace conventions
- strict TypeScript with zero `any`
- explicit module and bootstrap boundaries
- an OpenAPI contract generated from the same schemas that validate requests
- reproducible builds with lockfile and predictable scripts
- operational and security conventions that are easy to review

## Tech Stack

### Required

| Category | Technology | Notes |
|---|---|---|
| Runtime | Bun 1.4+ | latest stable; brings `bun build --compile --asset` (embed directories), `bun test --parallel`, `bun audit`, `bun dedupe` |
| Language | TypeScript 7.0+ | strict mode, `noUncheckedIndexedAccess`. TS 7 ships no programmatic compiler API before 7.1, so tooling that imports `typescript` (typescript-eslint and friends) runs on `@typescript/typescript6`; pin TypeScript 6 only with a recorded reason. Removed options and the tsconfig baseline: `runtime.md` *Formatting And TypeScript* |
| Package manager | bun | commit `bun.lock`; `bun install --frozen-lockfile` in CI |
| Lint / format | ESLint 10 + `@antfu/eslint-config` 9+ | flat config only; no Prettier |
| HTTP server | Hono 4.13+ via `OpenAPIHono` | from `@hono/zod-openapi` 1.x (peer `zod ^4`, `hono >=4.10`); **hard lock**, see *Routing Hard Lock* below |
| OpenAPI contract | `@hono/zod-openapi` | `createRoute` + `app.openapi()` for every contract endpoint; plain Hono routes only where OpenAPI does not apply; OpenAPI 3.1 document at `/openapi.json` via `app.doc31()` |
| API docs | `@scalar/hono-api-reference` 0.12+ | `Scalar({ url: '/openapi.json' })` mounted at `/docs`; the old `apiReference` export no longer exists |
| Validation | Zod 4 | API-boundary validation; the dependency-freshness procedure below applies |
| Errors | typed error classes | `AppError` hierarchy at transport boundaries |
| Test | bun:test | built-in runner; coverage threshold enforced in `bunfig.toml` |

### Default

| Category | Technology | Notes |
|---|---|---|
| Data access | Drizzle ORM 0.45 + drizzle-kit 0.31 | schema-as-code; 1.0 is still on the `rc` tag — adopt only with a recorded reason |
| Database | SQLite | default for local-first internal services |
| Driver | `bun:sqlite` via `drizzle-orm/bun-sqlite` | built into the runtime, zero dependencies, works unchanged inside a compiled binary; at-rest encryption is out of scope (encrypt the volume when required) |
| Config | environment variables + Zod | validate at startup |
| Logging | consola 3 + pino 10 | console plus structured file output |
| Hot reload | `bun --watch src/index.ts` | restarts on source change; backend runs as its own process |
| Dev URL routing | `@nsio/nsl` | named `.localhost` routes for API (and sibling SPA when same repo). Protocol details: `/pma references/dev-environment.md`. |

### Optional

| Category | Technology | When to adopt |
|---|---|---|
| Observability | OpenTelemetry via `@hono/otel` + `@opentelemetry/sdk-node` | production tracing and metrics |
| Queue | BullMQ 6 | background jobs |
| Cache | Redis via Bun's built-in `RedisClient` (`Bun.redis`) | shared cache |
| CLI | Commander 15 | richer command surface |
| E2E test | Playwright | browser-level flows |
| Process lock | PID lock file | prevent duplicate listeners |
| Single binary | `bun build --compile --asset ./drizzle [--asset ./web/dist]` | embed migrations and SPA assets |

### Alternative

| Replaces | Technology | Notes |
|---|---|---|
| SQLite | PostgreSQL via `postgres` (`drizzle-orm/postgres-js`) or Bun's built-in `Bun.sql` (`drizzle-orm/bun-sql`) | multi-instance writes or shared DB needs |
| Drizzle ORM | Prisma | heavier but broader ORM feature set |
| consola + pino | pino only | headless services |
| ESLint | Biome | faster, smaller ecosystem |

### Routing Hard Lock

Exactly two route styles are allowed on the API surface, both from the Hono ecosystem:

1. `@hono/zod-openapi` routes — `createRoute` + `app.openapi()` — for every endpoint that has a request/response contract. This is the default.
2. plain Hono routes — `app.get()`, `app.post()`, … — only where OpenAPI does not apply: `/health`, `/docs`, `/openapi.json`, static assets, SSE and WebSocket upgrades, inbound webhooks, internal ops endpoints. A plain route that reads a body validates it with Zod directly (`schema.safeParse`) and does not appear in `/openapi.json`.

Both styles live on one `OpenAPIHono` instance (`OpenAPIHono` extends `Hono`); a module with no contract routes may export a plain `Hono` sub-app.

Nothing else is allowed, even side by side: no `@hono/zod-validator` or `@hono/standard-validator`, no other OpenAPI generator, no Elysia or other framework for the API surface, no hand-maintained OpenAPI file. Deviating is a proposal-level decision with a recorded reason in `docs/decisions/`; it does not pass acceptance by default.

## Dependency Freshness (Bun)

See `/pma references/workflow.md` *Dependency Freshness* for the cross-stack rule. Bun-specific verification:

```bash
# Latest stable on npm. `bun info` needs a package.json in the cwd; `npm view` works anywhere.
bun info <pkg> version
npm view <pkg> version
npm view <pkg> dist-tags --json     # spot rc / beta / next tags before trusting "latest"
npm view <pkg> peerDependencies     # confirm the peer range (zod, hono) before bumping

# Current project
bun outdated                        # what is behind
bun audit                           # known vulnerabilities; `bun audit fix --dry-run` previews upgrades
bun dedupe --check                  # duplicate versions in the lockfile
```

### Verified snapshot (2026-09-03)

Registry values at the time this pack was last reviewed. They are a sanity check, not a substitute for the commands above — re-verify before every bump.

| Package | Latest stable | Note |
|---|---|---|
| `bun` | 1.4.0 | |
| `typescript` | 7.0.2 | `@typescript/typescript6` for tooling that needs the JS compiler API |
| `zod` | 4.5.4 | |
| `hono` | 4.13.5 | |
| `@hono/zod-openapi` | 1.6.2 | peer `zod ^4.0.0`, `hono >=4.10.0` |
| `@scalar/hono-api-reference` | 0.12.0 | peer `hono ^4.12.5` |
| `drizzle-orm` / `drizzle-kit` | 0.45.2 / 0.31.10 | `1.0.0-rc.x` on the `rc` tag |
| `consola` / `pino` | 3.4.2 / 10.3.1 | |
| `@nsio/nsl` | 0.1.7 | |
| `eslint` / `@antfu/eslint-config` | 10.9.1 / 9.5.1 | antfu peer `eslint ^9.10 \|\| ^10` |
| `@hono/otel` / `@opentelemetry/sdk-node` | 1.1.2 / 0.222.0 | optional |
| `bullmq` / `commander` | 6.3.4 / 15.0.0 | optional |

When pinning to a non-latest version, note the reason in `package.json` near the entry or in `docs/decisions/`:

```jsonc
{
  "dependencies": {
    // PINNED: <pkg>@3.x — 4.x requires Bun 1.5; revisit after runtime bump
    "<pkg>": "^3.8.0"
  }
}
```

Library docs check: when adopting or upgrading Hono, Drizzle, Zod, or any other core dependency, use official vendor documentation first. If a documentation connector such as Context7 is installed and available, it may help locate the relevant material; never assume an exact connector tool name exists.

## Required Quality Gates

Every PMA-Bun project should expose:

- `bun run lint`
- `bun run typecheck`
- `bun run build`
- `bun test`
- `bun test --coverage` (threshold enforced by `bunfig.toml`, see `data-and-testing.md`)
- `bun audit` clean, or findings triaged in the proposal
- security review for auth, secrets, outbound HTTP, and config changes

For monorepos, also expose a root `check` command that sequences the main gates.

## Project Layout

Pick exactly one of the three layouts and stay with it. Default to **Single API**; promote only when the trigger conditions are met.

### Single API (default)

For an API-only service or an internal tool. No workspaces, one `package.json` at the project root.

```text
package.json
bunfig.toml
tsconfig.json
drizzle.config.ts
src/
  app.ts
  index.ts
  config.ts
  root.ts
  pid-lock.ts
  db/
    index.ts
    schema.ts
  modules/
    health/
    docs/
    <domain>/
      <domain>.routes.ts
      <domain>.schemas.ts
      <domain>.service.ts
      <domain>.test.ts
  shared/
    errors.ts
    lib/
    middleware/
drizzle/
scripts/
  compile.ts
```

There are no generated stub modules for assets or migrations: a compiled binary embeds `drizzle/` (and `web/dist`) with `--asset`, and `root.ts` resolves them at runtime (see `runtime.md` *ROOT_DIR And Compiled Mode*).

A `dev.ts` is **not** required by default. Add one only if the dev startup truly needs different wiring than `index.ts` (e.g. seeding test fixtures, attaching dev-only middleware). Frontend integration is handled at the nsl layer, not via a Vite middleware bridge in `dev.ts`.

### API + Sibling SPA (same repo, no workspace)

When the project ships a SPA in the same repo. Keep the SPA as a plain sibling directory (`web/`); do **not** introduce Bun workspaces just to host it. Dev runs as two independent processes, glued by nsl (see `pma-web`).

```text
package.json                # API project (this skill)
bunfig.toml
src/
drizzle/
web/                        # SPA project (pma-web, single-app layout)
  package.json
  vite.config.ts
  src/
scripts/
  compile.ts
```

Production single-binary mode: the compile script builds the SPA first and embeds `web/dist` into the API binary with `--asset` (see `delivery.md`).

### Monorepo (only when justified)

Use Bun workspaces only when one or more of these are true:

- two or more deployable apps live in the same repo (e.g. API + worker + admin SPA)
- one or more `packages/*` are genuinely shared by multiple consumers
- shared TS / lint / drizzle config must be reused across apps

A single API plus a single SPA is **not** a sufficient reason — that case is *API + Sibling SPA*.

```text
package.json
bunfig.toml
apps/
  api/
    package.json
    tsconfig.json
    drizzle.config.ts
    src/
      app.ts
      index.ts
      config.ts
      root.ts
      pid-lock.ts
      db/
      modules/
      shared/
    drizzle/
  web/
    package.json
    vite.config.ts
packages/
  config/
  shared/
scripts/
  compile.ts
```

## Required Conventions

| Area | Convention |
|---|---|
| Workspace layout | only in *Monorepo*: `apps/*` for runnable apps, `packages/*` for shared config and code |
| Project layout | `src/modules/` for domain modules, `src/shared/` for cross-cutting concerns |
| Module structure | co-locate routes, schemas, service, and tests; keep transport thin |
| Bootstrap split | `app.ts` builds the app, `index.ts` runs startup; add `dev.ts` only when dev wiring genuinely diverges from prod |
| Routing | contract endpoints are declared with `createRoute` and mounted with `app.openapi()`; plain Hono routes only where OpenAPI does not apply; schemas live in `<domain>.schemas.ts` and use `z` from `@hono/zod-openapi` so `.openapi()` metadata is available; hard lock, see *Routing Hard Lock* |
| TypeScript config | TS 7 rules: no `baseUrl`, `paths` relative to the tsconfig, explicit `"types": ["bun"]` |
| Dev URL routing | invoke the backend through `bunx nsl run` so the API binds to `<name>.localhost:3355/api`; never embed Vite into the backend process |
| Errors | never throw raw strings |
| Validation | Zod at boundaries |
| Config | never read `Bun.env` directly in business logic |
| Database | parameterized queries only |
| Logging | no `console.log` in production paths |
| Imports | prefer `import type` for type-only imports |
| Aliases | use `@/*` only when it maps to the real `src/` tree |

## Code Quality Standards

- prefer immutable updates
- keep functions under 50 lines when possible
- keep files focused and usually under 800 lines
- avoid deep nesting
- avoid hardcoded values when config or constants fit better
- no `any` in application code

## Baseline Scripts

For a *Single API* or the API project in the *API + Sibling SPA* layout:

```json
{
  "scripts": {
    "dev": "bunx nsl run -n <name>:/api -s -- bun --watch src/index.ts",
    "dev:bare": "bun --watch src/index.ts",
    "build": "bun build src/index.ts --outdir dist --target bun --minify",
    "compile": "bun scripts/compile.ts",
    "start": "bun dist/index.js",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "test:coverage": "bun test --coverage",
    "check": "bun run lint && bun run typecheck && bun run test:coverage && bun run build",
    "db:generate": "drizzle-kit generate"
  },
  "devDependencies": {
    "@nsio/nsl": "^0.1.7"
  }
}
```

Notes:

- `<name>` matches the project's nsl host. In *API + Sibling SPA*, use the SPA's project name so the API mounts at `<name>.localhost:3355/api`. In *Single API*, drop `:/api` and `-s` and just expose the API at `<name>.localhost:3355`.
- `Bun.serve()` reads `PORT` natively, which `nsl run` exports automatically — no extra flags.
- `dev:bare` keeps a plain `bun --watch` invocation around for CI smoke tests, container builds, or environments where the nsl daemon cannot run.
- `compile` exists only when the repository ships a standalone binary (`delivery.md` *Compile Pipeline*).
- For protocol details (`--strip`, `NSL_PORT`, registration patterns, fallback), see `/pma references/dev-environment.md`. For multi-app workspace setup, see `/pma docs/monorepo-example.md`.

For the *Monorepo* layout, add a root `package.json` that fans out to per-app scripts:

```json
{
  "scripts": {
    "lint": "eslint apps/ packages/ --ext .ts,.tsx",
    "typecheck": "bun run --filter '*' typecheck",
    "test": "bun run --filter '*' test",
    "build": "bun run --filter '*' build",
    "check": "bun run lint && bun run typecheck && bun run test && bun run build"
  }
}
```

Run each app's `dev` script from inside the app directory (or via `bun run --filter <app> dev`) — there is no longer a single root `dev` because each app is launched independently and tied together by nsl.

## Implementation Workflow

Within approved implementation work:

1. Research and reuse existing libraries first; verify each version at the registry before adding it.
2. Plan interfaces and failure modes before coding; write the route contract (`createRoute`) before the handler.
3. Keep module boundaries explicit before adding new routes or services.
4. Run review passes focused on correctness, security, and missing tests.
