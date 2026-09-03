---
name: pma-bun
description: Bun implementation and acceptance baseline for PMA-managed backend services and internal tools. Covers project layout and monorepo promotion, required quality gates, SQLite-first data access with Drizzle, Hono HTTP serving with a mandatory @hono/zod-openapi contract plus Scalar docs, validated env config, nsl-based dev URL routing, and standalone binary compilation with embedded assets. Use when implementing, scaffolding, upgrading, or validating acceptance of a Bun/Hono backend; use pma-cr for code-review workflow.
---

# Bun Project Implementation Guide

Use this skill together with `/pma`. `/pma` controls workflow, approval, and task tracking; this guide defines the implementation baseline after approval.

Keep this entry file small. Load only the relevant reference packs.

## Scope

For PMA-managed Bun backends, API services, and internal tools. A SPA shipped alongside the API (same repo) is supported via a sibling `web/` directory and `pma-web` — it does not require a Bun workspace.

Not for frontend-only SPAs, Node-specific runtime guides, or non-PMA workflows.

## Loading Order

1. Always load `references/baseline.md` first.
2. Load `references/runtime.md` for bootstrap flow, config, root resolution, HTTP server, OpenAPI contract and docs, logging, PID lock, and dev/prod split.
3. Load `references/data-and-testing.md` for Drizzle, SQLite-first storage, `bun:sqlite` driver setup, migrations in source and compiled mode, repository patterns, and testing.
4. Load `references/delivery.md` for compile flow, embedded assets, CI gates, observability, Docker, security, and Git workflow.

## Quick Routing

- New project setup or repo restructuring (single API / API + sibling SPA / monorepo) → `references/baseline.md`
- dependency versions (registry verification, verified snapshot, pinning rules) → `references/baseline.md` *Dependency Freshness*
- runtime (`app.ts` / `index.ts` / optional `dev.ts`, config, startup, graceful shutdown, logging, PID lock) → `references/runtime.md`
- routing and API docs (hard lock: plain Hono routes + `@hono/zod-openapi` only; `createRoute`, `/openapi.json`, Scalar at `/docs`) → `references/runtime.md`
- dev URL routing (nsl) → `references/runtime.md` (full protocol → `/pma references/dev-environment.md`; multi-app workspace setup → `/pma docs/monorepo-example.md`)
- data access (schema design, SQLite setup, migrations, repositories) → `references/data-and-testing.md`
- testing (bun:test, coverage threshold, OpenAPI contract test, compiled-mode smoke test) → `references/data-and-testing.md`
- CI and delivery (compile pipeline, embedded assets, binary delivery, Docker, PR readiness) → `references/delivery.md`

## Reference Packs

- `references/baseline.md`
  Scope, layout choice (single API vs monorepo vs API + sibling SPA), tech stack with verified versions, required quality gates, scripts, conventions, and implementation workflow.
- `references/runtime.md`
  TypeScript 7 defaults, config loading, bootstrap structure, OpenAPIHono routes and contract rules, middleware, logging, docs routes, and runtime lifecycle.
- `references/data-and-testing.md`
  Drizzle with SQLite-first storage, migration strategy for source and compiled mode, repository boundaries, coverage configuration, and testing rules.
- `references/delivery.md`
  Compile pipeline with `--asset` embedding, security patterns, observability, CI pipeline, Docker, workspace rules, and Git conventions.

## Acceptance Checklist

Before merge:

- [ ] `lint`, `typecheck`, `build` pass
- [ ] `bun test --coverage` passes; the threshold lives in `bunfig.toml` (`coverageThreshold`, 0.8 or higher)
- [ ] env config validated by Zod at startup; no `Bun.env` reads in business logic
- [ ] contract endpoints are declared through `createRoute` + `app.openapi()`; plain Hono routes only where OpenAPI does not apply; no other routing or validation layer; `/openapi.json` is served, matches runtime validation, and Scalar loads at `/docs`
- [ ] no Vite in the backend process (no `@hono/vite-dev-server`, no Vite middleware in `dev.ts`)
- [ ] nsl dev routing works (`bunx nsl run -n <name>:/api -s -- bun --watch src/index.ts`); production bootstrap does not depend on nsl
- [ ] migrations committed; when a binary ships, it embeds `drizzle/` (and `web/dist` for a sibling SPA) via `--asset` and passes the compiled-mode smoke test
- [ ] new or bumped dependencies verified at the registry; any non-latest pin carries a recorded reason

If the repository intentionally diverges, keep the deviation explicit in the proposal and consistent across scripts, docs, and CI.
