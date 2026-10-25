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

Every entry uses its latest stable release, verified at the registry (see *Dependency Freshness (Bun)*). This pack names no versions.

| Category | Technology | Notes |
|---|---|---|
| Runtime | Bun | latest stable; relies on `bun build --compile --asset` (embed directories), `bun test --parallel`, `bun audit`, `bun dedupe` |
| Language | TypeScript | strict mode, `noUncheckedIndexedAccess`. When tooling that imports `typescript` (typescript-eslint and friends) needs a programmatic compiler API the latest major lacks, use the official compatibility package; pin an older major only with a recorded reason. tsconfig baseline: `runtime.md` *Formatting And TypeScript* |
| Package manager | bun | commit `bun.lock`; `bun install --frozen-lockfile` in CI |
| Lint / format | ESLint + `@antfu/eslint-config` | flat config only; no Prettier |
| HTTP server | Hono | plain `Hono` route factories, one per module; **hard lock**, see *Routing Hard Lock* |
| OpenAPI contract | `hono-openapi` | `describeRoute()` + wrapped `validator()` per route, helpers in `src/shared/lib/openapi.ts`; spec at `/openapi.json` (3.1.0) via `openAPIRouteHandler()` |
| API docs | Scalar web viewer | no bundled UI: `/docs` redirects to `https://client.scalar.com/?url=<spec URL>`; the spec sends CORS `*` |
| Validation | Zod | API-boundary validation; the dependency-freshness procedure below applies |
| Errors | typed error classes | `AppError` hierarchy at transport boundaries |
| Test | bun:test | built-in runner; coverage threshold enforced in `bunfig.toml` |

### Default

| Category | Technology | Notes |
|---|---|---|
| Data access | Drizzle ORM + drizzle-kit | schema-as-code; latest stable (`latest` dist-tag), never an `rc` / `beta` tag without a recorded reason |
| Database | SQLite | default for local-first internal services |
| Driver | `bun:sqlite` via `drizzle-orm/bun-sqlite` | built into the runtime, zero dependencies, works unchanged inside a compiled binary; at-rest encryption is out of scope (encrypt the volume when required) |
| Config | environment variables + Zod | validate at startup |
| Logging | consola + pino | console plus structured file output |
| Hot reload | `bun --watch src/index.ts` | restarts on source change; backend runs as its own process |
| Dev URL routing | `@nsio/nsl` | named `.localhost` routes for API (and sibling SPA when same repo). Protocol details: `/pma references/dev-environment.md`. |

### Optional

| Category | Technology | When to adopt |
|---|---|---|
| Observability | OpenTelemetry via `@hono/otel` + `@opentelemetry/sdk-node` | production tracing and metrics |
| Queue | BullMQ | background jobs |
| Cache | Redis via Bun's built-in `RedisClient` (`Bun.redis`) | shared cache |
| CLI | Commander | richer command surface |
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

- Every route is a plain Hono route with `describeRoute()` as its first middleware; a route without it is missing from `/openapi.json` and fails review. Only `/openapi.json`, `/docs`, static assets, and WebSocket upgrades are exempt.
- Zod-validated input goes through the wrapped `validator()` from `src/shared/lib/openapi.ts`, read with `c.req.valid(target)`. Routes that hand-parse on purpose (constant-time login, signed webhooks, raw uploads) keep their parsing.
- Not allowed: `@hono/zod-openapi` in new projects, `@hono/zod-validator`, direct `@hono/standard-validator` or unwrapped `hono-openapi` `validator` imports, other OpenAPI generators or frameworks, hand-written specs. Existing `@hono/zod-openapi` projects keep it until a proposal migrates them, never mixed. Any deviation needs a recorded reason in `docs/decisions/`.

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

When pinning to a non-latest version (user request or a concrete compatibility problem), note the reason in `package.json` near the entry or in `docs/decisions/`:

```jsonc
{
  "dependencies": {
    // PINNED: <pkg>@<major> — <compatibility reason>; revisit when <condition>
    "<pkg>": "<version>"
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
    docs/                 # mountDocs: /openapi.json + /docs redirect
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
| Routing | `describeRoute()` + wrapped `validator()` from `src/shared/lib/openapi.ts`; see *Routing Hard Lock* |
| TypeScript config | current TypeScript rules: no `baseUrl`, `paths` relative to the tsconfig, explicit `"types": ["bun"]` |
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
  }
}
```

Notes:

- Install `@nsio/nsl` as a devDependency (`bun add -D @nsio/nsl`); it ships the `nsl` binary.
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
2. Plan interfaces and failure modes before coding; write the route contract (`describeRoute` + `validator`) before the handler.
3. Keep module boundaries explicit before adding new routes or services.
4. Run review passes focused on correctness, security, and missing tests.
