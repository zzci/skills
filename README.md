# Skills

A collection of agent skills.

Most large skills use a thin `SKILL.md` entrypoint plus topic packs under `references/`. Load the entry file first, then only the relevant reference files for the current task.

## Install

### Global (all projects)

```bash
# Install all skills globally
npx skills add zzci/skills --global

# Install a specific skill globally
npx skills add zzci/skills --skill pma --global
npx skills add zzci/skills --skill pma-cr --global
npx skills add zzci/skills --skill pma-web --global
npx skills add zzci/skills --skill pma-rust --global
npx skills add zzci/skills --skill pma-go --global
npx skills add zzci/skills --skill pma-bun --global
npx skills add zzci/skills --skill pma-design --global
npx skills add zzci/skills --skill bkd --global
npx skills add zzci/skills --skill gitea --global
```

### Project (current project only)

```bash
# Install all skills to current project
npx skills add zzci/skills

# Install a specific skill to current project
npx skills add zzci/skills --skill pma
npx skills add zzci/skills --skill pma-cr
npx skills add zzci/skills --skill pma-web
npx skills add zzci/skills --skill pma-rust
npx skills add zzci/skills --skill pma-go
npx skills add zzci/skills --skill pma-bun
npx skills add zzci/skills --skill pma-design
npx skills add zzci/skills --skill bkd
npx skills add zzci/skills --skill gitea

# List available skills
npx skills add zzci/skills --list
```

## Add PMA

First-time PMA setup in a project:

1. Ensure `AGENTS.md` has a `## Project Development` section that references `/pma` and project-specific docs/paths. Use a Chinese heading only if the user explicitly requests it.
2. Create `CLAUDE.md` as a symlink to `AGENTS.md` so project instructions do not drift.
3. Ensure `docs/task/index.md` exists.
4. Ensure `docs/plan/index.md` exists.
5. Ensure core docs exist: `docs/architecture.md` and `docs/changelog.md`.

## Add PMA CR

For stack-aware review after implementation and before merge:

1. Use `/pma-cr` for local diff review.
2. Use `/pma-cr <PR-number-or-URL>` for pull request review.
3. Use `/pma-cr audit`, `/pma-cr repo`, or `/pma-cr --repo` for repository-wide audit.
4. The skill applies shared review policy plus only the relevant stack packs:
   - TypeScript frontend
   - TypeScript backend / Bun
   - Go
   - Rust
   - Python
5. Repository audit reports findings by `P0` to `P3`, plus coverage gaps and recommended next actions.
6. Repository audit explicitly checks isolated dead code such as orphan modules, dead handlers, stale feature-flag paths, and unreachable subsystems.
7. Dead-code output is split into `Dead Code Findings`, `Dead Code Removal Candidates`, and `Needs Runtime Verification`.
8. Keep findings focused on correctness, security, regressions, and operational risk.
9. Prefer repository-specific guidance from `CLAUDE.md` and `AGENTS.md` when present.

## Add PMA-Web

For frontend projects using the PMA-Web stack:

1. Use `/pma` for investigate -> proposal -> implement workflow.
2. Default to a single React 19 + TypeScript + Vite 8 SPA; promote to a Bun monorepo only when multiple apps or shared packages exist.
3. Standardize app structure around `src/app`, `src/features`, and `src/shared`.
4. Use TanStack Router, TanStack Query, Zustand, Tailwind CSS v4, and shadcn/ui `base-nova` with `@base-ui/react`.
5. Configure required quality gates: lint, typecheck, build, and test.
6. Do not introduce Radix UI or other UI component ecosystems.

## Add PMA-Rust

For Rust multi-crate workspace projects:

1. Use `/pma` for investigate -> proposal -> implement workflow.
2. Set up Cargo workspace defaults in `[workspace.dependencies]`.
3. Pin a stable toolchain via `rust-toolchain.toml` and reproducible rustflags.
4. Configure strict quality gates: fmt, cranky, deny, test, and release build.
5. Choose data access strategy: SQLx (Default), SeaORM (Alternative), or diesel-async when compile-time schema typing is paramount.
6. Standardize on figment + clap, Tokio, Axum, and rustls-based networking.
7. Set up OpenTelemetry observability when deploying production services.

## Add PMA-Go

For Go service and CLI projects:

1. Use `/pma` for investigate -> proposal -> implement workflow.
2. Use `cmd/` + `internal/` project layout; avoid `/pkg`.
3. Configure strict quality gates: goimports, golangci-lint v2, go vet, test, build, mod tidy.
4. Choose data access strategy: sqlc + pgx (Default) or GORM (Alternative).
5. Set up layered config with koanf: defaults -> file -> env -> flags.
6. Standardize on stdlib net/http + Chi (Default) or Gin (Alternative).
7. Set up OpenTelemetry observability when deploying production services.

## Add PMA-Bun

For Bun backend and full-stack projects:

1. Use `/pma` for investigate -> proposal -> implement workflow.
2. Default to a single API project; promote to a Bun monorepo only when multiple deployable apps or shared packages exist.
3. Use backend modules under `src/modules` and shared code under `src/shared`.
4. Configure strict quality gates: lint, typecheck, build, test, coverage, and security review.
5. Choose data access strategy: Drizzle + SQLite-first storage (Default) or PostgreSQL/libSQL for multi-instance requirements.
6. Validate environment configuration with Zod at startup and centralize runtime path resolution.
7. Standardize on OpenAPIHono on top of `Bun.serve()`, with `app.ts` / `index.ts` / `dev.ts` split by runtime role.
8. Use a dedicated compile pipeline when shipping standalone binaries with embedded assets or migrations.

## Add PMA-Design

For HTML design artifacts (mockups, prototypes, wireframes, decks, design systems):

1. Use `/pma-design` as a standalone skill — it does not require the `/pma` workflow.
2. Output lives under `designs/<project>/` as self-contained HTML (React 18 + Babel multi-file prototypes), with React/Babel referenced locally from `designs/_vendor/`.
3. Clarifying questions are asked as numbered lists in chat (structured ask tools are disabled).
4. Preview is served with `nsl serve --list --name <project>-designs designs` inside a tmux session; deliverables are reviewed over `http://<name>.localhost/...`, never `file://`.
5. Design systems are authored or consumed via the bundled compiler/importer scripts (`agents/*.mjs`), bound per project through `_ds/<slug>/` and `_d_meta.json`.
6. Harness-specific preview/screenshot/verification tools are resolved from `references/claude.md` (Claude Code) or `references/codex.md` (Codex Agent).

## Add BKD

For operating BKD kanban boards via REST API:

1. Use `/bkd` for single issue CRUD, cron jobs, and basic operations.
2. Use short activation phrases such as `use bkd to start coordination` or `start BKD L1` to start the three-tier L1/L2/L3 coordination pattern.
3. For long-running autonomous coordination, L1 has no cron and wakes only on user messages or L2 follow-ups. Every campaign is split across multiple bounded L2 coordinators; each L2 owns its workstream DAG and self-cron, while L3 issues execute short-lived subtasks.
4. For multi-subtask orchestration, the skill supports two modes:
   - **Worktree mode**: subtasks work in isolated branches (`bkd/{issueId}`), suitable for multi-file changes or overlapping subtasks.
   - **Simple mode**: subtasks work directly on the main branch, suitable for small independent changes.
5. Pipeline-style quality assessment: each subtask is evaluated immediately on completion via logs filter, then self-review and coordinator assessment.
6. Worktree mode includes branch merge strategies with post-merge build/test verification.
7. Reference packs are loaded on demand: `rest-api.md`, `orchestration.md`, `quality-review.md`, `merge-strategy.md`, `three-tier-coordination.md`.

## Available Skills

| Skill | Description |
|-------|-------------|
| [pma](skills/pma/) | Project development lifecycle — three-phase workflow + task tracking + docs + multi-agent |
| [pma-cr](skills/pma-cr/) | Stack-aware code review — shared policy plus TypeScript frontend, TypeScript backend/Bun, Go, Rust, and Python review packs for local diffs, PRs, and repository audits |
| [pma-web](skills/pma-web/) | Frontend implementation guide — PMA-managed React 19 + TypeScript + Vite 8 SPA conventions, TanStack Router/Query, Tailwind CSS v4, shadcn/ui base-nova, and quality gates |
| [pma-rust](skills/pma-rust/) | Rust implementation guide — PMA-managed workspace conventions, strict quality gates, SQLx/SeaORM/diesel-async data access, Axum/Tokio patterns, OpenTelemetry, and rustls-only security defaults |
| [pma-go](skills/pma-go/) | Go implementation guide — PMA-managed service/CLI conventions, strict quality gates, sqlc + pgx/GORM, Chi/Gin HTTP patterns, koanf config, OpenTelemetry, and slog logging |
| [pma-bun](skills/pma-bun/) | Bun implementation guide — PMA-managed backend service conventions, optional monorepo promotion, `src/modules` API layout, SQLite-first Drizzle patterns, OpenAPIHono/Bun.serve runtime split, compile-time embedded assets, and validated env config |
| [pma-design](skills/pma-design/) | Design artifact creator — self-contained HTML mockups, interactive prototypes, wireframes, decks, and design-system authoring/consumption with nsl-served tmux previews and local vendor React/Babel runtime |
| [bkd](skills/bkd/) | BKD kanban board operator — REST API workflows for projects, issues, cron jobs, event-driven L1 plus multiple cron-driven L2 workstreams and L3 execution, multi-subtask orchestration with worktree/simple modes, logs filter quality assessment, and branch merge strategies |
| [gitea](skills/gitea/) | Gitea REST API operator — curl-based `/api/v1` reference for repos, files, issues, PRs, releases, labels, milestones, actions, packages, wiki, search, server setup, and forced non-GitHub to Gitea routing |
