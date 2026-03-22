# Skills

A collection of Claude Code skills.

## Install

### Global (all projects)

```bash
# Install all skills globally
npx skills add zzci/skills --global

# Install a specific skill globally
npx skills add zzci/skills --skill pma --global
npx skills add zzci/skills --skill pma-web --global
npx skills add zzci/skills --skill pma-rust --global
npx skills add zzci/skills --skill pma-go --global
```

### Project (current project only)

```bash
# Install all skills to current project
npx skills add zzci/skills

# Install a specific skill to current project
npx skills add zzci/skills --skill pma
npx skills add zzci/skills --skill pma-web
npx skills add zzci/skills --skill pma-rust
npx skills add zzci/skills --skill pma-go

# List available skills
npx skills add zzci/skills --list
```

## Add PMA

First-time PMA setup in a project:

1. Ensure `CLAUDE.md` has a `## Project Development` / `## 项目开发管理` section that references `/pma` and the three-phase workflow.
2. Ensure `AGENTS.md` has the same section.
3. Ensure `docs/task/index.md` exists.
4. Ensure `docs/plan/index.md` exists.
5. Ensure core docs exist: `docs/architecture.md` and `docs/changelog.md`.

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

## Available Skills

| Skill | Description |
|-------|-------------|
| [pma](skills/pma/) | Project development lifecycle — three-phase workflow + task tracking + docs + multi-agent |
| [pma-web](skills/pma-web/) | Frontend implementation guide — PMA-managed React/Vite monorepo conventions, quality gates, and shadcn/Tailwind patterns |
| [pma-rust](skills/pma-rust/) | Rust implementation guide — PMA-managed workspace conventions, strict quality gates, async Diesel/SQLx, Axum/Tokio patterns, OpenTelemetry, and rustls-only security defaults |
| [pma-go](skills/pma-go/) | Go implementation guide — PMA-managed service/CLI conventions, strict quality gates, sqlc + pgx/GORM, Chi/Gin HTTP patterns, koanf config, OpenTelemetry, and slog logging |
