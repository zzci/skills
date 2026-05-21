# Skills

A collection of Claude Code skills.

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

# List available skills
npx skills add zzci/skills --list
```

## Add PMA

First-time PMA setup in a project:

1. Ensure `CLAUDE.md` has a `## Project Development` section that references `/pma` and the three-phase workflow. Use a Chinese heading only if the user explicitly requests it.
2. Ensure `AGENTS.md` has the same section.
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
5. Repository audit reports findings by `P0` to `P3`, plus coverage gaps and recommended next actions.
6. Repository audit explicitly checks isolated dead code such as orphan modules, dead handlers, stale feature-flag paths, and unreachable subsystems.
7. Dead-code output is split into `Dead Code Findings`, `Dead Code Removal Candidates`, and `Needs Runtime Verification`.
8. Keep findings focused on correctness, security, regressions, and operational risk.
9. Prefer repository-specific guidance from `CLAUDE.md` and `AGENTS.md` when present.

## Add PMA-Web

For frontend projects using the PMA-Web stack:

1. Use `/pma` for investigate -> proposal -> implement workflow.
2. Set up the monorepo baseline: bun workspaces, shared tsconfig, shared package exports.
3. Standardize app structure around `src/app`, `src/features`, and `src/shared`.
4. Configure Vite, ESLint, and the required quality gates: lint, typecheck, build, and test.
5. Initialize shadcn/ui with aliases that match the real folder layout.

## Add PMA-Rust

For Rust multi-crate workspace projects:

1. Use `/pma` for investigate -> proposal -> implement workflow.
2. Set up Cargo workspace defaults in `[workspace.dependencies]`.
3. Pin a stable toolchain via `rust-toolchain.toml` and reproducible rustflags.
4. Configure strict quality gates: fmt, cranky, deny, test, and release build.
5. Choose data access strategy: Diesel-async + deadpool (Default) or SQLx (Alternative).
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
2. Standardize the monorepo around `apps/*` and `packages/*`, with backend modules under `src/modules` and shared code under `src/shared`.
3. Configure strict quality gates: lint, typecheck, build, test, coverage, and security review.
4. Choose data access strategy: Drizzle + SQLite-first storage (Default) or PostgreSQL/libSQL for multi-instance requirements.
5. Validate environment configuration with Zod at startup and centralize runtime path resolution.
6. Standardize on OpenAPIHono on top of `Bun.serve()`, with `app.ts` / `index.ts` / `dev.ts` split by runtime role.
7. Use a dedicated compile pipeline when shipping standalone binaries with embedded assets or migrations.

## Add BKD

For operating BKD kanban boards via REST API:

1. Use `/bkd` for single issue CRUD, cron jobs, and basic operations.
2. For multi-subtask orchestration, the skill supports two modes:
   - **Worktree mode**: subtasks work in isolated branches (`bkd/{issueId}`), suitable for multi-file changes or overlapping subtasks.
   - **Simple mode**: subtasks work directly on the main branch, suitable for small independent changes.
3. Pipeline-style quality assessment: each subtask is evaluated immediately on completion via logs filter, then pma-cr code review.
4. Worktree mode includes branch merge strategies with post-merge build/test verification.
5. Reference packs are loaded on demand: `rest-api.md`, `orchestration.md`, `quality-review.md`, `merge-strategy.md`.

## Available Skills

| Skill | Description |
|-------|-------------|
| [pma](skills/pma/) | Project development lifecycle — three-phase workflow + task tracking + docs + multi-agent |
| [pma-cr](skills/pma-cr/) | Stack-aware code review — shared policy plus TypeScript frontend, TypeScript backend/Bun, Go, and Rust review packs for local diffs and PRs |
| [pma-web](skills/pma-web/) | Frontend implementation guide — PMA-managed React/Vite monorepo conventions, quality gates, and shadcn/Tailwind patterns |
| [pma-rust](skills/pma-rust/) | Rust implementation guide — PMA-managed workspace conventions, strict quality gates, async Diesel/SQLx, Axum/Tokio patterns, OpenTelemetry, and rustls-only security defaults |
| [pma-go](skills/pma-go/) | Go implementation guide — PMA-managed service/CLI conventions, strict quality gates, sqlc + pgx/GORM, Chi/Gin HTTP patterns, koanf config, OpenTelemetry, and slog logging |
| [pma-bun](skills/pma-bun/) | Bun implementation guide — PMA-managed backend/full-stack monorepo conventions, `src/modules` API layout, SQLite-first Drizzle patterns, OpenAPIHono/Bun.serve runtime split, compile-time embedded assets, and validated env config |
| [bkd](skills/bkd/) | BKD kanban board operator — REST API workflows for projects, issues, cron jobs, multi-subtask orchestration with worktree/simple modes, logs filter quality assessment, and branch merge strategies |
| [gitea](skills/gitea/) | gitea-mcp operator — full parameter/payload reference for all 53 gitea-mcp MCP tools (repos, files, issues, PRs, releases, labels, milestones, actions, packages, wiki, search) plus server setup and forced non-GitHub→Gitea routing |
