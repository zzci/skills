---
name: pma-bun
description: Bun implementation and acceptance baseline for PMA-managed backend services and internal tools. Covers project layout and monorepo promotion, required quality gates, SQLite-first data access with Drizzle, Hono HTTP serving, validated env config, nsl-based dev URL routing, and standalone binary compilation. Use when implementing, scaffolding, upgrading, or validating acceptance of a Bun/Hono backend; use pma-cr for code-review workflow.
---

# Bun Project Implementation Guide

Use this skill together with `/pma`. `/pma` controls workflow, approval, and task tracking; this guide defines the implementation baseline after approval.

Keep this entry file small. Load only the relevant reference packs.

## Scope

For PMA-managed Bun backends, API services, and internal tools. A SPA shipped alongside the API (same repo) is supported via a sibling `web/` directory and `pma-web` — it does not require a Bun workspace.

Not for frontend-only SPAs, Node-specific runtime guides, or non-PMA workflows.

## Loading Order

1. Always load `references/baseline.md` first.
2. Load `references/runtime.md` for bootstrap flow, config, root resolution, HTTP server, docs, logging, PID lock, and dev/prod split.
3. Load `references/data-and-testing.md` for Drizzle, SQLite-first storage, libSQL driver setup, migration fallback, repository patterns, and testing.
4. Load `references/delivery.md` for compile flow, embedded assets, CI gates, observability, Docker, security, and Git workflow.

## Quick Routing

- New project setup or repo restructuring (single API / API + sibling SPA / monorepo) → `references/baseline.md`
- runtime (`app.ts` / `index.ts` / optional `dev.ts`, OpenAPIHono, config, startup, graceful shutdown, logging, PID lock) → `references/runtime.md`
- dev URL routing (nsl) → `references/runtime.md` (full protocol → `/pma references/dev-environment.md`; multi-app workspace setup → `/pma docs/monorepo-example.md`)
- data access (schema design, SQLite setup, migration embedding, repositories) → `references/data-and-testing.md`
- testing → `references/data-and-testing.md`
- CI and delivery (compile pipeline, binary delivery, static assets, Docker, PR readiness) → `references/delivery.md`

## Reference Packs

- `references/baseline.md`
  Scope, layout choice (single API vs monorepo vs API + sibling SPA), required quality gates, scripts, conventions, and implementation workflow.
- `references/runtime.md`
  Formatting and TypeScript defaults, config loading, bootstrap structure, OpenAPIHono setup, middleware, logging, docs routes, and runtime lifecycle.
- `references/data-and-testing.md`
  Drizzle with SQLite-first storage, migration strategy, repository boundaries, and testing rules.
- `references/delivery.md`
  Compile pipeline, security patterns, observability, CI pipeline, Docker, workspace rules, and Git conventions.

## Acceptance Checklist

Before merge:

- [ ] `lint`, `typecheck`, `build` pass
- [ ] `bun test` passes with coverage; target 80% or higher
- [ ] env config validated by Zod at startup; no `Bun.env` reads in business logic
- [ ] no Vite in the backend process (no `@hono/vite-dev-server`, no Vite middleware in `dev.ts`)
- [ ] nsl dev routing works (`bunx nsl run -n <name>:/api -s -- bun --watch src/index.ts`); production bootstrap does not depend on nsl
- [ ] migrations committed; embedded assets and migrations in sync with source behavior
- [ ] compile pipeline restores stub modules, including on failed or interrupted runs

If the repository intentionally diverges, keep the deviation explicit in the proposal and consistent across scripts, docs, and CI.
