---
name: pma-cr
description: "Code review: stack-aware review for local diffs, pull requests, and repository-wide audits. Routes review across shared policy plus language packs for TypeScript frontend, TypeScript backend/Bun, Go, Rust, and Python. Use after implementation, before merge, or when auditing an existing codebase."
---

# PMA Code Review

Use this skill to review changed code with a high-signal, low-noise process.

This skill is designed for:

- local diff review before commit or merge
- pull request review for changed lines and surrounding context
- repository-wide audit of an existing codebase
- PMA-managed repositories that want stack-aware review, not generic checklist spam

## Scope

The skill has one entry point and multiple internal review packs:

- shared review policy
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

1. Detect review mode, in this order:
   - PR reference first: a bare PR number, or a URL containing `/pull/` or `/pulls/` -> PR review
   - else `audit`, `repo`, or `--repo` as an exact standalone argument (never a substring of a word, path, or URL — `.../audit-service/pull/12` is a PR, not an audit) -> repository audit
   - else an argument naming an existing branch (`git rev-parse --verify <arg>` on a local or `origin/` ref) -> local review of `git diff $(git merge-base <base> <arg>)...<arg>`, with `<base>` resolved by the local-mode base procedure
   - else an argument naming an existing file or directory -> local diff review restricted to that path
   - any other argument -> ask what was meant; never guess a mode
   - no argument -> local diff review
2. Read `references/core-review-policy.md`.
3. For repository audit, also read `references/repository-audit.md`.
4. Detect stack from changed files and project manifests.
   Also note which quality gates are actually enforced (CI workflows, lint/typecheck/test scripts, pre-commit hooks): the confidence filter skips findings a mandatory gate already guarantees, and that skip is only valid for gates that verifiably run.
5. Read only the matching stack packs:
   - `references/typescript-frontend.md`
   - `references/typescript-backend.md`
   - `references/go.md`
   - `references/rust.md`
   - `references/python.md`
6. Review changed code plus the minimal surrounding context required to verify behavior.
7. Report only issues that are likely real and introduced by the change, or for repository audit, issues that are evidenced by current repository code.

## Stack Selection

Use these heuristics:

- **TypeScript frontend**: `tsx`, React, Next.js, Vite, routing, UI components, browser state, client forms
- **TypeScript backend / Bun**: Hono, Express, Fastify, Nest, Bun server code, API routes, DB access, workers
- **Go**: `go.mod`, `*.go`
- **Rust**: `Cargo.toml`, `*.rs`
- **Python**: `pyproject.toml`, `setup.py`, `requirements.txt`, `*.py`

Next.js Route Handlers / Server Actions -> load both the TS frontend and TS backend packs.

If the change spans multiple stacks, load all relevant packs and review each changed area against the correct pack.

`pma-cr` owns review workflow and findings. PMA stack skills provide implementation acceptance baselines; load a relevant stack baseline as supporting project policy when the repository uses it, but do not delegate review mode or output rules to that skill.

## Review Priorities

Review order and confidence filtering: see `references/core-review-policy.md`.

## Local Review Mode

Use local mode for a deterministic working-tree or branch scope.

- inspect `git status --short`, `git diff --staged`, and `git diff`; if either diff is non-empty, review their union and read relevant untracked source files in full because Git has no diff base for them
- if both diffs are empty, resolve the comparison base in order: `@{upstream}`, the remote default branch (`refs/remotes/origin/HEAD`), then an existing `origin/main` or `origin/master`
- review `git diff $(git merge-base HEAD <base>)...HEAD`; if no trustworthy base can be resolved, or multiple remotes/bases make intent ambiguous, ask the user
- never substitute an arbitrary recent-commit window such as `git log -5`
- read enough surrounding code to validate behavior
- for very large diffs, triage by risk (trust boundaries, data writes, concurrency first) and state explicitly which areas were not reviewed
- produce a findings-first report ordered by severity
- close with the verdict per the severity-to-verdict mapping in `references/core-review-policy.md`

## PR Review Mode

Use PR mode for GitHub or a verified Gitea instance.

- derive the forge from `origin`: `github.com` uses `gh`; any other host must return HTTP 200 JSON with a `version` field from `https://<host>/api/v1/version` before using the `gitea` skill and REST endpoints
- if the non-GitHub probe fails, stop and ask; do not guess the forge or API
- inspect PR metadata, head SHA, changed files, and diff with the selected forge client
- merged or closed PR -> report its state and stop unless the user explicitly asks for a retrospective review
- draft PR -> review normally, note the draft state in the report, and never post to the forge (posting requires the PR to be open for review and the user's confirmation)
- gather relevant `CLAUDE.md` / `AGENTS.md` guidance
- review only changed behavior and nearby context, not unrelated legacy code
- when useful, split the audit by concern or stack, then merge only high-confidence findings
- present findings to the user first; post to the forge only after the user confirms
- on GitHub, default to `gh pr review --comment`; use `--approve` or `--request-changes` only when explicitly requested (note: `--approve` fails on your own PR)
- on Gitea, use the verified base URL and the `gitea` skill's PR review or issue-comment endpoints; send free-form review text through a temporary `jq` body and `gitea_json`

## Repository Audit Mode

Use repository audit mode when the goal is to assess the current repository, not a diff.

- inventory manifests, entry points, CI, tests, and stack markers
- identify hotspot areas such as auth, API edges, DB access, jobs, filesystem, external calls, config loading, and isolated dead code
- inspect the highest-risk modules first
- deduplicate findings by root cause, not by file count
- separate confirmed findings from coverage gaps and suggested next actions

## Output Rules

- What to report and what to skip (confidence filter): see `references/core-review-policy.md`.
- Local diff and PR output templates: see the "Output Format" section of `references/core-review-policy.md`.
- Repository audit report template: see the "Report Skeleton" section of `references/repository-audit.md`.

## Reference Packs

- `references/core-review-policy.md`: confidence filter, severity policy, output formats, shared review heuristics
- `references/repository-audit.md`: repository-wide audit workflow, hotspot selection, and report skeleton
- `references/typescript-frontend.md`: React / Next.js / Vite / browser UI review rules
- `references/typescript-backend.md`: Node / Bun / API / validation / DB / async review rules
- `references/go.md`: Go review rules around context, errors, concurrency, HTTP, and resource safety
- `references/rust.md`: Rust review rules around panic boundaries, async blocking, unsafe, docs, and API contracts
- `references/python.md`: Python review rules around validation, deserialization, async, type safety, and command injection
- `agents/code-reviewer.md`: optional subagent prompt, used when the user has asked for a parallel or isolated review pass

These packs intentionally hold the detailed rules so this file stays small and cheap to load.
