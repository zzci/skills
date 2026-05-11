# Project Injection Reference

This document defines what each PMA-managed repository's `CLAUDE.md` (and the parallel `AGENTS.md`) should contain to wire the project into the PMA workflow. The actual rules live in the `/pma` skill — project files only declare **what is project-specific**, never duplicate skill content.

## Table of Contents

- [Why this matters](#why-this-matters)
- [Canonical template](#canonical-template)
- [What the template intentionally omits](#what-the-template-intentionally-omits)
- [AGENTS.md parity](#agentsmd-parity)
- [When to update the project injection](#when-to-update-the-project-injection)
- [Common anti-patterns](#common-anti-patterns)
- [Initialization checklist](#initialization-checklist)

## Why this matters

`/pma` and its stack skills (`/pma-rust`, `/pma-go`, `/pma-bun`, `/pma-web`) hold the canonical rules. Inlining them into every repo's `CLAUDE.md` causes two failures:

- Skill upgrades (new Hard Locks, new quality gates, new dependency policies) do not reach existing repos until someone manually re-syncs `CLAUDE.md`.
- Conflicting wording in `CLAUDE.md` overrides the skill silently — agents follow the older, narrower text and miss new requirements.

The `CLAUDE.md` injection therefore carries only the **project-personalized** facts (which stack skills apply, which divergences are accepted) and points to `/pma` for everything else.

## Canonical template

Paste the block below into the repository's `CLAUDE.md` under a top-level `## Project Development` heading (and the same block into `AGENTS.md`). Replace `<placeholder>` tokens with project-specific values. Keep the block short — anything that grows past ~30 lines belongs in `docs/decisions/` instead.

```markdown
## Project Development

This repository follows the PMA workflow. The actual rules live in the `/pma`
skill and the stack skills below — do not duplicate them here. If a rule in
this file ever conflicts with `/pma`, treat `/pma` as the source of truth and
update this file.

### Skill stack

- `/pma` — workflow control, three-phase gate, task and plan tracking
- `/pma-<stack>` — implementation baseline for <language/runtime>
- `/pma-<stack>` — (additional stack skill, if multi-language repo)

### Triggers

Any feature, bug fix, refactor, planning, progress tracking, or multi-agent
execution goes through `/pma` (investigate → proposal → implement). Do not
skip phases. Do not implement before explicit approval such as `proceed`.

### Project-specific facts

- Primary language / runtime: <e.g. Rust 1.85, Bun 1.2, Go 1.26>
- Database / storage: <e.g. SQLite via SQLx, Postgres via pgx>
- Dev URL routing: <e.g. nsl on, host `<name>.localhost`, see /pma references/dev-environment.md>
- Deployment target: <e.g. distroless container, static musl binary>
- Quality-gate command: `<one-line command that runs lint + typecheck + test + build>`

### Local divergences

Any deliberate deviation from a skill rule (Hard Lock relaxation, alternative
library, non-default layout) is recorded in `docs/decisions/<YYYY-MM-DD>-<slug>.md`
with a sunset date. Do not silently override skill rules in this file.

### Documentation entry points

- Tasks: `docs/task/index.md`
- Plans: `docs/plan/index.md`
- Decisions: `docs/decisions/`
- Architecture: `docs/architecture.md`
- Changelog: `docs/changelog.md`
```

## What the template intentionally omits

The following are **owned by `/pma` and stack skills** — do not restate them in `CLAUDE.md`. Listing them creates drift the moment a skill is upgraded.

- Three-phase workflow details (investigate / proposal / implement)
- Coding Principles (think before coding, simplicity first, surgical changes, goal-driven execution)
- Repository hygiene baseline (`.gitignore`, `.editorconfig`, `LICENSE`, etc. — see `/pma references/delivery.md` *Repository Hygiene*)
- Dependency freshness rules (see `/pma references/workflow.md` *Dependency Freshness*)
- Stack-specific tech stacks, lint policies, test runners (live in the stack skill's baseline)
- Git conventions, PR workflow, CI structure (see `/pma references/delivery.md`)

## AGENTS.md parity

`AGENTS.md` exists for non-Claude coding agents (Cursor, Codex, Aider, etc.). Keep it identical to the `CLAUDE.md` *Project Development* section so any agent entering the repo gets the same instructions. The two files may diverge only on agent-specific tool affordances (e.g. an MCP server hint relevant to one platform).

## When to update the project injection

Update the `CLAUDE.md` / `AGENTS.md` injection when **project-specific facts** change:

- Adding or removing a stack skill (e.g. introducing a frontend → add `/pma-web`)
- Switching primary database or runtime
- Changing the quality-gate command
- Recording a new long-lived divergence (link to the `docs/decisions/` entry)

Do **not** update it when a `/pma` or stack skill rule changes — those propagate automatically because the project file does not restate them.

## Common anti-patterns

- **Copying rule text from `/pma` into `CLAUDE.md`.** Causes drift on the next skill upgrade. The fix: replace the copy with a pointer (`see /pma references/...`).
- **Listing the full tech stack in `CLAUDE.md`.** The stack skill's baseline already lists Required / Default / Optional / Alternative — `CLAUDE.md` only states which stack skill applies plus the genuinely project-specific values (e.g. concrete DB choice when both Postgres and SQLite are skill defaults).
- **Putting Hard Lock exceptions inline in `CLAUDE.md`.** Exceptions must live in `docs/decisions/<adr>.md` with a sunset date. `CLAUDE.md` may link to them; it must not embed the rationale.
- **Letting `CLAUDE.md` and `AGENTS.md` drift apart.** Update both in the same commit.
- **Skipping the "Skill stack" section.** Without it the agent cannot tell whether `/pma-rust` or `/pma-go` (or both) applies, and falls back to guessing from file extensions.

## Initialization checklist

For a brand-new PMA-managed repository:

1. Create `CLAUDE.md` and `AGENTS.md` with the template above filled in.
2. Initialize `docs/task/index.md` and `docs/plan/index.md` per [task-format.md](task-format.md) and [plan-format.md](plan-format.md).
3. Initialize `docs/architecture.md` and `docs/changelog.md` (empty headings are fine).
4. Apply *Repository Hygiene* (`/pma references/delivery.md`) to create `.gitignore`, `.gitattributes`, `.editorconfig`, `LICENSE`, `README.md`, `.env.example`, and the stack-pinned toolchain file.
5. Pin the toolchain version in the stack-native location (Cargo.toml `rust-version`, package.json `engines`, go.mod `toolchain`).
6. Commit the bootstrap as a single `chore(repo): bootstrap pma project` commit before any feature work.
