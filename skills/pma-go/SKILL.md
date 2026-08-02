---
name: pma-go
description: Go implementation guide for PMA-managed service and CLI projects. Covers project layout (cmd/internal), strict linting with golangci-lint v2, database access (sqlc + pgx or GORM), HTTP patterns (stdlib + Chi or Gin), layered config with koanf, structured logging with slog, OpenTelemetry observability, and CI quality gates. Use when implementing, scaffolding, or reviewing a Go service or CLI in a PMA repo.
---

# Go Project Implementation Guide

Use this skill together with `/pma`. `/pma` controls workflow, approval, and task tracking; this guide defines the implementation baseline after approval.

Keep this entry file lean. Load only the reference packs needed for the task.

## Scope

For PMA-managed Go backends, API services, and CLI applications.

Not for embedded targets, library-only modules without binaries, or non-PMA projects.

## Loading Order

1. Always load `references/baseline.md` first.
2. Load `references/config-and-data.md` for config layering, validation, sqlc, pgx, GORM, and migrations.
3. Load `references/http-and-runtime.md` for handlers, middleware, logging, observability, and shutdown.
4. Load `references/delivery.md` for lint, tests, task runners, security review, CI, and Git workflow.

## Quick Routing

- New service or CLI setup → `references/baseline.md`
- config (koanf layering, env mapping, validation) → `references/config-and-data.md`
- data access (sqlc + pgx, GORM, migrations, repository boundaries) → `references/config-and-data.md`
- runtime (HTTP server, middleware, slog, tracing, shutdown) → `references/http-and-runtime.md`
- dev URL routing (nsl) → `references/http-and-runtime.md` (full protocol → `/pma references/dev-environment.md`)
- testing → `references/delivery.md`
- CI and delivery (quality gates, lint, Taskfile, security checklist, PR readiness) → `references/delivery.md`

## Reference Packs

- `references/baseline.md`
  Stack defaults, quality gates, layout, conventions, error model, and code quality standards.
- `references/config-and-data.md`
  Config layering with koanf, validation, sqlc plus pgx, GORM alternative, and migration rules.
- `references/http-and-runtime.md`
  Router structure, handler patterns, middleware, logging, observability, and graceful shutdown.
- `references/delivery.md`
  Lint config, testing, task runner expectations, security checks, CI, and Git conventions.

## Acceptance Checklist

Before merge:

- [ ] `goimports -l .` reports nothing; `golangci-lint run` and `go vet ./...` pass
- [ ] `go test -cover ./...` passes; coverage target 80% or higher
- [ ] `go build ./...` succeeds; `go mod tidy` leaves no diff
- [ ] `gosec ./...` passes for changed code
- [ ] config layered via koanf (defaults -> file -> env -> flags) and validated after load
- [ ] graceful shutdown wired (`signal.NotifyContext` + `http.Server.Shutdown` with timeout)
- [ ] nsl dev routing works when the service ships a UI (see `references/http-and-runtime.md`)

If the repo already diverges from these defaults, make the divergence explicit and apply it consistently across code, docs, and CI.
