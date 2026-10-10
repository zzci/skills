---
name: pma-cr
description: "Evidence-based code review for local diffs, pull requests, and repository audits. Checks design, correctness, tests, compatibility, and operation using a shared engineering baseline plus TypeScript frontend/backend, Go, Rust, and Python packs. Use after implementation, before merge, or when auditing an existing codebase."
---

# PMA Code Review

Use this skill to review code and engineering quality with a high-signal, low-noise process. It works independently of the PMA development workflow.

This skill is designed for:

- local diff review before commit or merge
- pull request review for changed lines and surrounding context
- repository-wide audit of an existing codebase
- repositories that need stack-aware review grounded in project requirements

## Scope

The skill has one entry point and multiple internal review packs:

- shared review policy and engineering baseline
- TypeScript frontend review
- TypeScript backend / Bun review
- Go review
- Rust review
- Python review

Keep the entry skill lean. Load only the reference files needed for the detected stack.

## Quick Start

Local review:

```text
/pma-cr
```

PR review:

```text
/pma-cr <PR-number-or-URL>
```

Repository audit:

```text
/pma-cr audit
/pma-cr repo
/pma-cr --repo
```

## Workflow

Honor explicit review intent in natural-language requests, including staged-only review or a specified comparison base. The argument rules below disambiguate shorthand invocations.

1. Detect review mode, in this order:
   - PR reference first: a bare PR number, or a URL containing `/pull/` or `/pulls/` -> PR review
   - else `audit`, `repo`, or `--repo` as an exact standalone argument (never a substring of a word, path, or URL — `.../audit-service/pull/12` is a PR, not an audit) -> repository audit
   - else an argument naming an existing local or `origin/` branch -> branch review; resolve its exact branch ref to a commit and use the local-mode base procedure
   - else an argument naming an existing file or directory -> local diff review restricted to that path
   - any other argument -> ask what was meant; never guess a mode
   - no argument -> local diff review
2. Gather applicable repository instructions and acceptance criteria. Read `references/core-review-policy.md` and `references/engineering-baseline.md`.
3. Establish the snapshot, scope, expected behavior, and affected consumers. For repository audit, also read `references/repository-audit.md`.
4. Detect stacks and supported versions from the reviewed files and manifests. In audit mode, use the repository inventory. Record relevant quality gates and their actual results for this snapshot; do not discard failures merely because tooling catches them.
5. Read only the matching stack packs:
   - `references/typescript-frontend.md`
   - `references/typescript-backend.md`
   - `references/go.md`
   - `references/rust.md`
   - `references/python.md`
6. Review intent and design, then trace behavior across affected boundaries and inspect test effectiveness. Apply compatibility and operational checks where relevant; expand context enough to validate the claim.
7. Falsify and deduplicate findings. Report evidence, check results, coverage, and the appropriate verdict or audit priorities. Review alone does not authorize fixes or remote writes.

## Stack Selection

Use these heuristics:

- **TypeScript frontend**: `tsx`, React, Next.js, Vite, routing, UI components, browser state, client forms
- **TypeScript backend / Bun**: Hono, Express, Fastify, Nest, Bun server code, API routes, DB access, workers
- **Go**: `go.mod`, `*.go`
- **Rust**: `Cargo.toml`, `*.rs`
- **Python**: `pyproject.toml`, `setup.py`, `requirements.txt`, `*.py`

Next.js Route Handlers / Server Actions -> load both the TS frontend and TS backend packs.

If the change spans multiple stacks, load all relevant packs and review each changed area against the correct pack.

Stack-pack examples are inspection prompts; the shared policy determines whether their evidence and impact justify a finding.

For unlisted languages or config-only changes, apply the shared baseline and relevant project rules; disclose any expertise or tool limitations rather than claiming a language-specific pass.

`pma-cr` owns review workflow and findings. PMA stack skills provide implementation acceptance baselines; load one as supporting policy only when the project adopts it. Do not activate its development ceremony or treat another organization's recommendations as mandatory project rules.

## Review Priorities

Review sequence, evidence requirements, and confidence filtering: see `references/core-review-policy.md`.

## Local Review Mode

Use local mode for a deterministic snapshot. An explicit staged, branch, base, or path request takes precedence over defaults.

- Inspect `git status --short`, staged and unstaged diffs, and relevant untracked files, including tests and configuration. Untracked-only changes are a working-tree review; inspect their full contents without reading unrelated secrets or dependency output.
- With local changes and no explicit snapshot request, review the resulting working tree against HEAD (`git diff HEAD --` plus relevant untracked files). Do not concatenate staged and unstaged patches into contradictory findings. If index and working-tree content differ, state which was reviewed.
- For a staged-only request, use `git diff --cached` and read context/manifests from the index (`git show :path`), not a later working-tree version. For branch review, use files from the resolved head commit; do not mix in local edits.
- In a repository with no HEAD, review the relevant added content as a new snapshot instead of inventing a base.
- For a clean tree or an explicit branch review, resolve the base in order: explicit user base, known PR target, remote default branch (`refs/remotes/origin/HEAD`), then an unambiguous existing `origin/main` or `origin/master`. Use upstream only if established as the intended integration base, not merely a tracking copy of the feature branch.
- Resolve head/base to commit IDs and compare the merge base to head (`git diff <merge-base-sha> <head-sha> --`). Quote ref/path arguments and separate pathspecs with `--`. If no trustworthy base exists or candidates are ambiguous, ask for the missing base while completing independent inspection.
- A resolved empty comparison means no changes in that scope. Never replace it with an arbitrary recent-commit window or an unrequested repository audit.
- Track renames/deletions and their consumers. For path-restricted reviews, use outside context as evidence without silently broadening the requested findings scope.
- Read the requested human-written changes. If size or missing context prevents completion, report partial coverage and the unreviewed areas.
- If local contents change during the review, refresh affected findings or state which earlier snapshot the report covers.
- Produce findings first, followed by scope, checks, coverage, and the decision defined in `references/core-review-policy.md`.

## PR Review Mode

Use PR mode for GitHub or an established Gitea instance.

- derive the forge from `origin` and verify that a supplied PR URL identifies that repository; do not send credentials to a host inferred only from user-supplied PR text
- `github.com` uses `gh`; a host already declared as Gitea by applicable user/project instructions uses the `gitea` skill without rediscovery
- for an unknown non-GitHub host, resolve SSH host aliases and use the HTTPS host without the SSH port; probe `https://<host>/api/v1/version`: HTTP 200 JSON with a `version` field establishes Gitea; 401/403 is auth-gated, so retry with credentials configured for that host when available; unresolved responses require forge clarification rather than guessing
- inspect PR state, target branch, base/head SHAs, changed files, diff, and relevant check results using the selected forge client; read context from that head and disclose any API truncation or missing files
- merged or closed PR -> report its state and stop unless the user explicitly asks for a retrospective review
- draft PR -> review normally and note its state; do not treat a draft review as approval for merge
- review only changed behavior and nearby context, not unrelated legacy code
- use `agents/code-reviewer.md` only when the user explicitly requests delegation; otherwise perform the review in the current session
- present findings locally by default; post only when explicitly authorized by the user, honoring authorization already given in the session
- on GitHub, default to `gh pr review --comment`; use `--approve` or `--request-changes` only when explicitly requested (note: `--approve` fails on your own PR)
- on Gitea, use the established base URL and the `gitea` skill's PR review or issue-comment endpoints; send free-form review text through a structured body or safely written temporary file

## Repository Audit Mode

Use repository audit mode when the goal is to assess the current repository, not a diff.

- inventory manifests, entry points, CI, tests, and stack markers
- map important contracts, module boundaries, state ownership, critical tests, and operational paths as well as security hotspots
- inspect the highest-risk modules first
- deduplicate findings by root cause, not by file count
- separate confirmed findings from coverage gaps and suggested next actions; report priorities and audited areas rather than a merge verdict

## Output Rules

- What to report and what to skip (confidence filter): see `references/core-review-policy.md`.
- Local diff and PR output templates: see the "Output Format" section of `references/core-review-policy.md`.
- Repository audit report template: see the "Report Skeleton" section of `references/repository-audit.md`.

## Reference Packs

- `references/core-review-policy.md`: evidence, severity, decisions, check results, and output formats
- `references/engineering-baseline.md`: intent, design, correctness, test quality, compatibility, and operational checks for all stacks
- `references/repository-audit.md`: repository-wide audit workflow, hotspot selection, and report skeleton
- `references/typescript-frontend.md`: React / Next.js / Vite / browser UI review rules
- `references/typescript-backend.md`: Node / Bun / API / validation / DB / async review rules
- `references/go.md`: Go review rules around context, errors, concurrency, HTTP, and resource safety
- `references/rust.md`: Rust review rules around panic boundaries, async blocking, unsafe, docs, and API contracts
- `references/python.md`: Python review rules around validation, deserialization, async, type safety, and command injection
- `agents/code-reviewer.md`: optional subagent prompt, used when the user has asked for a parallel or isolated review pass
- `evals/review-cases.md`: behavioral regression scenarios; read when maintaining this skill, not on ordinary reviews

These packs intentionally hold the detailed rules so this file stays small and cheap to load.
