# PMA-Bun Baseline

## Scope

Use this pack for PMA-managed Bun backends, API services, CLIs, and full-stack projects.

Goals:

- Bun-native APIs preferred over Node polyfills
- strict TypeScript with zero `any`
- explicit error handling
- reproducible builds with lockfile
- operational and security conventions that are easy to review

## Tech Stack

### Required

| Category | Technology | Notes |
|---|---|---|
| Runtime | Bun 1.2+ | latest stable |
| Language | TypeScript 5.9+ | strict mode, `noUncheckedIndexedAccess` |
| Package manager | bun | commit `bun.lock` |
| Lint / format | ESLint + @antfu/eslint-config | no Prettier |
| Validation | Zod 3 | API-boundary validation |
| Errors | typed error classes | `AppError` hierarchy |
| Test | bun:test | built-in runner |

### Default

| Category | Technology | Notes |
|---|---|---|
| HTTP server | OpenAPIHono | from `@hono/zod-openapi` |
| API docs | `@scalar/hono-api-reference` | serve docs at `/docs` |
| Data access | Drizzle ORM + drizzle-kit | schema-as-code |
| Database | bun:sqlite | default for single-instance services and CLIs |
| Driver | `drizzle-orm/bun-sqlite` | Bun-native SQLite driver |
| Config | environment variables + Zod | validate at startup |
| Logging | consola + pino | console plus structured file output |
| Hot reload | `bun --watch` | development |

### Optional

| Category | Technology | When to adopt |
|---|---|---|
| Observability | OpenTelemetry | production tracing and metrics |
| Queue | BullMQ | background jobs |
| Cache | Redis | shared cache |
| CLI | Commander.js | richer command surface |
| E2E test | Playwright | browser-level flows |
| Process lock | PID lock file | prevent duplicate listeners |
| Single binary | `bun build --compile` | embed assets and migrations |

### Alternative

| Replaces | Technology | Notes |
|---|---|---|
| OpenAPIHono | plain Hono | lighter when OpenAPI generation is unnecessary |
| OpenAPIHono | Elysia | Bun-native alternative |
| bun:sqlite | PostgreSQL via `postgres` | multi-instance writes or shared DB needs |
| Drizzle ORM | Prisma | heavier but broader ORM feature set |
| consola + pino | pino only | headless services |
| ESLint | Biome | faster, smaller ecosystem |

## Required Quality Gates

Every PMA-Bun project should expose:

- `bun run lint`
- `bun run typecheck`
- `bun run build`
- `bun test`
- `bun test --coverage`
- security review for auth, secrets, outbound HTTP, and config changes

## Project Layout

```text
src/
  index.ts
  app.ts
  config.ts
  root.ts
  dev.ts
  pid-lock.ts
  db/
    index.ts
    schema.ts
    embedded-migrations.ts
  modules/
    health/
    docs/
    users/
  shared/
    middleware/
    static-assets.ts
    lib/
tests/
scripts/
drizzle/
drizzle.config.ts
```

For small services or CLIs, flatten where needed; do not keep empty structure for its own sake.

## Required Conventions

| Area | Convention |
|---|---|
| Project layout | `src/modules/` for domain modules, `src/shared/` for cross-cutting concerns |
| Module structure | co-locate routes, service, repository, schema, and tests |
| Errors | never throw raw strings |
| Validation | Zod at boundaries |
| Config | never read `Bun.env` directly in business logic |
| Database | parameterized queries only |
| Logging | no `console.log` in production paths |
| Imports | prefer `import type` for type-only imports |

## Code Quality Standards

- prefer immutable updates
- keep functions under 50 lines when possible
- keep files focused and usually under 800 lines
- avoid deep nesting
- avoid hardcoded values when config or constants fit better
- no `any` in application code

## Implementation Workflow

Within approved implementation work:

1. Research and reuse existing libraries first.
2. Plan interfaces and failure modes before coding.
3. Prefer test-first or behavior-first changes for new logic.
4. Run review passes focused on correctness, security, and missing tests.
