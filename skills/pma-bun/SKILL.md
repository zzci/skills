---
name: pma-bun
description: Bun implementation guide for PMA-managed backend and full-stack projects. Covers project layout (src/modules), strict linting with ESLint + @antfu/eslint-config, database access (Drizzle ORM + bun:sqlite or PostgreSQL), HTTP patterns (OpenAPIHono + Bun.serve), layered config with environment variables, dual logging (consola + pino), single-binary compilation with embedded assets, and CI quality gates.
---

# Bun Project Implementation Guide

Use this skill together with `/pma`. `/pma` controls workflow, approval, and task tracking; this guide defines the implementation baseline after approval.

Keep this entry file small. Load only the relevant reference packs.

## Scope

For PMA-managed Bun backends, API services, CLIs, and Bun-based full-stack projects.

Not for frontend-only SPAs, Node-specific runtime guides, or non-PMA workflows.

## Loading Order

1. Always load `references/baseline.md` first.
2. Load `references/runtime.md` for app bootstrap, config, HTTP server, docs, logging, and compiled-binary concerns.
3. Load `references/data-and-testing.md` for Drizzle, bun:sqlite, PostgreSQL, repository patterns, and testing.
4. Load `references/delivery.md` for lint, TypeScript, hooks, observability, CI, Docker, security, and Git workflow.

## Quick Routing

- New service setup or repo restructuring: `references/baseline.md`
- OpenAPIHono, config, startup, graceful shutdown, logging, compiled binaries: `references/runtime.md`
- Schema design, migrations, drivers, repositories, test setup: `references/data-and-testing.md`
- Quality gates, lint, TypeScript, security, observability, CI, Docker, PR readiness: `references/delivery.md`

## Reference Packs

- `references/baseline.md`
  Scope, stack defaults, required quality gates, project layout, conventions, code quality, and implementation workflow.
- `references/runtime.md`
  Formatting and TypeScript defaults, config loading, error handling, OpenAPIHono setup, logging, API docs, and single-binary delivery.
- `references/data-and-testing.md`
  Drizzle with bun:sqlite, PostgreSQL alternative, repository boundaries, and testing rules.
- `references/delivery.md`
  Hooks, security patterns, observability, CI pipeline, Docker, workspace rules, and Git conventions.

If the repository intentionally diverges, keep the deviation explicit in the proposal and consistent across scripts, docs, and CI.
