# PMA-Bun Delivery

## Table of Contents

- [Compile Pipeline](#compile-pipeline)
- [Hooks And Tooling](#hooks-and-tooling)
- [Security Patterns](#security-patterns)
- [Observability](#observability)
- [CI Pipeline](#ci-pipeline)
- [Docker](#docker)
- [Workspaces](#workspaces)
- [Git Conventions](#git-conventions)
- [API Review Checklist](#api-review-checklist)

## Compile Pipeline

When the repository ships a standalone binary:

- build the frontend first when the SPA is embedded
- embed directories with `--asset` (Bun 1.4+): `--asset ./drizzle` for migrations, `--asset ./web/dist` for the SPA; the runtime resolves them through `root.asset()` (`runtime.md` *ROOT_DIR And Compiled Mode*)
- do not rewrite source modules at build time. The older stub-swap pattern (generated asset and migration modules restored in a `finally`) only exists for Bun < 1.4; remove it when upgrading
- keep compile flags in `scripts/compile.ts`, not in shell history or CI YAML
- write checksums or release metadata as part of the build output when distribution needs it
- run the compiled-mode smoke test on the produced binary before publishing it

### `scripts/compile.ts` skeleton

```typescript
// scripts/compile.ts — standalone binary with embedded migrations and, optionally, SPA assets
import { $ } from "bun";

const withSpa = await Bun.file("web/package.json").exists();
if (withSpa) await $`bun run --cwd web build`; // 1. build the SPA first

const result = await Bun.build({
  entrypoints: ["src/index.ts"],
  minify: true,
  compile: {
    outfile: "dist/app",
    assets: ["drizzle", ...(withSpa ? ["web/dist"] : [])], // 2. embed directories under their relative paths
  },
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// 3. smoke test: start dist/app with a temp DATA_DIR and a free PORT, hit /health and /openapi.json
```

Cross-compile for release matrices with the CLI form, one target per job: `bun build --compile --target=bun-linux-x64 --asset ./drizzle src/index.ts --outfile dist/app-linux-x64`.

## Hooks And Tooling

- lint and typecheck must stay fast enough to run on every change (ESLint cache, `tsc --noEmit`); a gate slow enough that developers skip it locally is a bug
- add repo-local hooks (pre-commit, post-tool) only when they run the same commands as the CI gates — no hook-only logic
- hooks may apply deterministic formatting (`eslint --fix`) but must not otherwise rewrite code

## Security Patterns

Review these areas before merge:

- password hashing (`Bun.password`)
- constant-time secret comparison
- rate limiting for public endpoints
- CSRF protection when serving browser-facing state-changing routes
- XSS avoidance by rejecting raw HTML injection paths
- secret redaction in logs
- safe handling of local encryption keys, bootstrap tokens, or lock files when the project uses them
- `/docs` gated in production; `/openapi.json` never leaks internal-only routes (exclude them)

Pre-commit checklist:

- no hardcoded secrets
- all user inputs validated through the route contract
- SQL injection blocked through parameterized access
- auth and authorization checked
- rate limits applied where needed
- error messages do not leak internals
- `bun audit` clean or triaged

## Observability

Adopt only when the deployment context needs it.

Recommended shape:

- OpenTelemetry: start `@opentelemetry/sdk-node` in `index.ts` before `createApp()`, then `app.use(httpInstrumentationMiddleware({ serviceName, serviceVersion }))` from `@hono/otel`
- pino logs with request correlation
- health endpoint for liveness
- human-readable local logs for developer workflows when the service is frequently run interactively

## CI Pipeline

Typical jobs, in order:

1. `bun install --frozen-lockfile`
2. `bun run lint` and `bun run typecheck`
3. `bun test --coverage` (threshold from `bunfig.toml`; add `--parallel` when the suite is large)
4. `bun run build`
5. `bun audit`
6. `bun run compile` plus the compiled-mode smoke test when the repository distributes binaries; one job per `--target` for cross-platform releases

If the project needs security audit or DB bootstrap jobs beyond this, keep them explicit and reproducible.

## Docker

When containerizing:

- use the official image pinned to the baseline minor (`oven/bun:1.4-slim` for source mode; a distroless or scratch-like base for a compiled binary)
- copy only necessary build inputs; `bun install --frozen-lockfile --production` for source mode
- set non-root execution where possible
- keep env injection external to the image; mount `DATA_DIR` as a volume
- document whether the container runs source mode or precompiled binary mode

## Workspaces

Only relevant in the *Monorepo* layout (see `baseline.md`).

- keep workspace boundaries explicit
- centralize shared configs
- avoid hidden cross-package imports
- make package exports intentional; the API package should not be imported by the frontend at runtime — dev integration runs through nsl, not via cross-package middleware mounting

## Git Conventions

- English for commit messages and all remote-visible metadata
- conventional commits format
- dependency bumps ship as their own `chore(deps)` commit, never inside a feature diff
- no AI-assistant or agent mentions in commit messages, PR text, or other remote-visible content

## API Review Checklist

Before merge, verify:

- every contract endpoint is declared through `createRoute`; plain Hono routes only where OpenAPI does not apply (*Routing Hard Lock*), never as a shortcut around the contract
- the `/openapi.json` snapshot changed on purpose and the diff matches the handler change (status codes, envelope, named schemas, `operationId`)
- error mapping is consistent (`defaultHook` for validation, `onError` for everything else)
- auth boundaries are explicit; `/docs` gated in production
- migration impact is understood; migrations are added, never edited
- embedded assets and migrations stay in sync with source behavior — the compiled-mode smoke test passed
- added or bumped dependencies were verified at the registry; pins carry a reason
