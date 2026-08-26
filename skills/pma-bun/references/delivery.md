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

- build the frontend first when static assets are embedded
- generate asset maps and embedded migration modules as explicit steps
- restore stub files after compilation, including interrupted runs
- keep compile-time file rewriting confined to dedicated scripts
- write checksums or release metadata as part of the build output when distribution needs it

### `scripts/compile.ts` skeleton

```typescript
// scripts/compile.ts — standalone binary with embedded SPA assets and migrations
import { copyFileSync, writeFileSync } from "node:fs";
import { $ } from "bun";

const swaps = [
  { module: "src/shared/static-assets.ts", generate: generateAssetMap },
  { module: "src/db/embedded-migrations.ts", generate: generateMigrationMap },
];

function generateAssetMap(): string {
  // walk web/dist, emit a module exporting { "/index.html": <bytes/base64>, ... }
  return "/* generated */";
}

function generateMigrationMap(): string {
  // read drizzle/*.sql in order, emit a module exporting [{ name, sql }, ...]
  return "/* generated */";
}

await $`bun run --cwd web build`;                       // 1. build the SPA first
for (const s of swaps) copyFileSync(s.module, `${s.module}.stub`); // 2. back up stubs
try {
  for (const s of swaps) writeFileSync(s.module, s.generate());    // 3. swap in generated maps
  await $`bun build --compile src/index.ts --outfile dist/app`;    // 4. compile
}
finally {
  for (const s of swaps) copyFileSync(`${s.module}.stub`, s.module); // 5. ALWAYS restore stubs
}
```

The `finally` block is the load-bearing part: stubs must be restored even when the build fails or is interrupted, so the working tree never keeps generated content.

## Hooks And Tooling

- lint and typecheck must stay fast enough to run on every change (ESLint cache, incremental `tsc`); a gate slow enough that developers skip it locally is a bug
- add repo-local hooks (pre-commit, post-tool) only when they run the same commands as the CI gates — no hook-only logic
- hooks may apply deterministic formatting (`eslint --fix`) but must not otherwise rewrite code

## Security Patterns

Review these areas before merge:

- password hashing
- constant-time secret comparison
- rate limiting for public endpoints
- CSRF protection when serving browser-facing state-changing routes
- XSS avoidance by rejecting raw HTML injection paths
- secret redaction in logs
- safe handling of local encryption keys, bootstrap tokens, or lock files when the project uses them

Pre-commit checklist:

- no hardcoded secrets
- all user inputs validated
- SQL injection blocked through parameterized access
- auth and authorization checked
- rate limits applied where needed
- error messages do not leak internals

## Observability

Adopt only when the deployment context needs it.

Recommended shape:

- OpenTelemetry for traces and metrics
- pino logs with request correlation
- health endpoint for liveness
- human-readable local logs for developer workflows when the service is frequently run interactively

## CI Pipeline

Typical jobs:

- lint
- test
- coverage
- build
- compile when the repository distributes binaries

If the project needs security audit or DB bootstrap jobs, keep them explicit and reproducible.

## Docker

When containerizing:

- use reproducible Bun images
- copy only necessary build inputs
- set non-root execution where possible
- keep env injection external to the image
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
- no AI-assistant or agent mentions in commit messages, PR text, or other remote-visible content

## API Review Checklist

Before merge, verify:

- request and response schemas match behavior
- docs match runtime validation
- error mapping is consistent
- auth boundaries are explicit
- migration impact is understood
- compile-time embedded assets and migrations stay in sync with source behavior
