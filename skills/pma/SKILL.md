---
name: pma
description: Project development lifecycle management with a strict three-phase workflow (investigate -> proposal -> implement), file-based plan tracking in docs/plan/, task tracking in docs/task/, and claim-before-work multi-agent coordination. Use when handling feature development, bug fixes, refactors, planning, progress tracking, or multi-agent execution in an existing codebase. English-first for repository docs and remote-visible metadata; use Chinese docs only when the user explicitly requests a specific document in Chinese.
---

# PMA - Project Management Assistant

Run delivery work with clear gates, minimal diffs, and explicit task/plan tracking.

## Hard Rules

1. Communication with the user may follow the user's preferred language. Repository docs, task files, plan files, code comments/docs, commit messages, PR text, and other remote-visible metadata must be in English by default. Use Chinese only when the user explicitly requests a specific document in Chinese.
2. Read before write: inspect call chains, related config/tests, and recent changelog context before editing logic.
3. Make only the minimal requested changes; do not add unrequested refactors or features.
4. Never use plan mode (`EnterPlanMode`, `mode: "plan"`). Manage plans in `docs/plan/` files only.
5. Do not implement before explicit confirmation (`proceed`).
6. Use English filenames only, even when project content is Chinese (for example: `architecture.md`, `changelog.md`).
7. Do not assume the user knows what they want. When motivation or goal is unclear, stop and ask — do not speculate or discuss possibilities.
8. When the goal is clear but the path is not the shortest, say so directly and suggest the better approach.
9. Trace root causes; do not patch symptoms. Every decision must be able to answer "why".
10. Output only what changes a decision. Cut all filler, context recaps, and information that does not affect the next action.

## Three-Phase Workflow

### Phase 1: Investigation

1. Trace upstream/downstream call chains, symbol references, and types.
2. Search related code, config, tests, migrations, and docs.
3. Read the tail of `docs/changelog.md` for recent context.
4. Find or create the matching task in `docs/task/index.md` and claim it (`[-]`).

Non-trivial task rule:
- If the change touches `>=3` files or crosses modules, create `docs/plan/PLAN-NNN.md` and write findings to the context section.

### Phase 2: Proposal

Output these items, then stop for approval:
- Current state
- Proposal
- Risks
- Scope
- Alternatives (if multiple approaches exist)

For non-trivial tasks:
- Complete remaining sections in `PLAN-NNN.md`.
- Append one line to `docs/plan/index.md` with `[ ]`.
- Wait for user annotations and address all of them before implementation.

### Phase 3: Implement -> Verify -> Record

Only after approval:

1. If a plan exists, set plan index marker to `[-]` and detail `status` to `implementing`.
2. Implement step by step according to the approved proposal.
3. Run focused self-verification.
4. Set task index marker to `[x]` and task detail `status` to `completed`.
5. If a plan exists, set plan index marker to `[x]` and plan detail `status` to `completed`.
6. Update changelog as needed.

## Task and Plan Files

Use these canonical references instead of redefining formats in-place:

- Task format: [docs/task-format.md](docs/task-format.md)
- Plan format: [docs/plan-format.md](docs/plan-format.md)

Required structure:

- `docs/task/index.md`: one-line task entries
- `docs/task/PREFIX-NNN.md`: task detail files
- `docs/plan/index.md`: one-line plan entries
- `docs/plan/PLAN-NNN.md`: plan detail files

## Claim-Before-Work (Multi-Agent Safety)

Before writing any implementation code:

1. Read `docs/task/index.md`; for `[-]` items, read detail `owner`.
2. If another agent owns the in-progress task, skip it.
3. Claim atomically:
   - Update task index `[ ] -> [-]`
   - Update task detail `status -> in_progress`, set `owner`
   - Call `TaskUpdate(status: "in_progress", owner: "<agent>")` if task tools are available
4. Start implementation only after the claim is fully written.

On completion:
- Set task index `[-] -> [x]`
- Set task detail `status -> completed`
- Call `TaskUpdate(status: "completed")` if task tools are available

On close/won't do:
- Set task index to `[~]`
- Set task detail `status -> closed` and record reason
- Call `TaskUpdate(status: "deleted")` if task tools are available

## Sync Rules

Task status updates are immediate, never deferred.

- Primary source is files in `docs/task/` and `docs/plan/`.
- If `TaskCreate`/`TaskUpdate` tools are available, keep tool state in sync with file state.
- If task tools are unavailable, continue with file-only sync and state this in the progress update.

Session checklist:
1. Session start: read `docs/task/index.md`, active task details, and `docs/plan/index.md`.
2. New task: create detail file first, then append index line.
3. Before work: complete Claim-Before-Work.
4. Session end: verify statuses are written and update index header date.

## Documentation System

Canonical structure:

```text
docs/
├── task/
│   ├── index.md
│   └── PREFIX-NNN.md
├── plan/
│   ├── index.md
│   └── PLAN-NNN.md
├── architecture.md
└── changelog.md
```

- Use English for repository docs and section headings by default.
- Use Chinese templates only when the user explicitly requests a specific document in Chinese, while keeping filenames in English.
- Write investigation findings into the plan context section.
- Do not create extra report files; temporary files go to `./tmp/`.

## Changelog Conventions

Entry format:

```markdown
## YYYY-MM-DD HH:MM [tag]

[content]
```

Recommended tags:
- `[progress]`, `[BUG-P0]`, `[BUG-P1]`, `[pitfall]`, `[decision]`

## Project Initialization

On first use in a project:

1. Ensure `CLAUDE.md` contains a `## Project Development` section that references `/pma` and the three-phase workflow.
2. Ensure `AGENTS.md` contains the same section.
3. Ensure `docs/task/index.md` exists (initialize from [docs/task-format.md](docs/task-format.md)).
4. Ensure `docs/plan/index.md` exists (initialize from [docs/plan-format.md](docs/plan-format.md)).
5. Ensure core docs exist (`architecture.md` + `changelog.md`) and initialize them in English unless the user explicitly requests a specific document in Chinese.

## Shell and Process Management

- Prefer `bash` for all command execution; do not use `zsh` unless explicitly requested.
- **ALWAYS** use tmux to run dev servers, test servers, and long-running processes.
- Tmux session name: `{project_dir_basename}-{path_hash}` — generate with:
  ```bash
  echo $(basename "$PWD" | tr '.' '-')-$(echo -n "$PWD" | md5sum | cut -c1-6)
  ```
- **Before starting a server**: check `tmux has-session -t NAME` first — reuse or restart existing sessions.
- **NEVER** use `kill $(lsof -ti:PORT)` without filtering — use `kill $(lsof -ti:PORT -sTCP:LISTEN)` or `fuser -k PORT/tcp` instead.
- **NEVER** kill ports as the first approach — manage process lifecycle through tmux.

## Git Conventions

- Use English for commit messages, PR titles, PR descriptions, and all remote-visible metadata.
- Do not mention AI assistants, agents, or collaborator model names (`Codex`, `Claude`, `ChatGPT`, `OpenAI`, `Anthropic`, etc.) in any remote-visible content.
- Follow conventional commits format: `<type>: <description>` (feat, fix, refactor, docs, test, chore, perf, ci).

## Pull Request Workflow

### Creating a PR

1. Analyze **full** commit history from branch point, not just the latest commit.
2. Use `git diff [base-branch]...HEAD` to review all changes.
3. Title: under 70 characters, imperative mood.
4. Body format:
   ```
   ## Summary
   <1-3 bullet points>

   ## Test plan
   - [ ] <checklist items>
   ```
5. Push with `-u` flag if new branch.

### Auto-Review Before PR

Run these checks automatically before creating or updating a PR:

1. **Code review** — run a review pass on all changed files. If a dedicated review agent/tool is available, use it; otherwise perform a manual review focused on correctness, regressions, and missing tests.
2. **Security scan** — run a security review pass. If a dedicated security-review agent/tool is available, use it; otherwise review manually for:
   - No hardcoded secrets (API keys, passwords, tokens)
   - All user inputs validated
   - No SQL injection, XSS, or CSRF vulnerabilities
   - Error messages do not leak sensitive data
3. **Build verification** — ensure `build` passes with no errors.
4. **Lint** — ensure `lint` passes with no errors.
5. **Tests** — run full test suite; verify no regressions.

If any check fails, fix the issue before creating the PR. Do not skip checks with `--no-verify`.

### PR Review Checklist

Before marking a PR ready for review:

- [ ] All auto-review checks pass (code review, security, build, lint, tests)
- [ ] Commit history is clean (no WIP, fixup, or merge commits)
- [ ] PR description accurately reflects all changes
- [ ] Task status updated in `docs/task/index.md`
- [ ] Plan status updated in `docs/plan/index.md` (if applicable)
- [ ] Changelog updated (if user-facing change)

## CI Pipeline

### Standard Stages

```text
format/lint → static checks → build → test → security review
```

All stages must pass before a PR can be merged. Stages run in parallel where possible. The exact commands come from the active stack skill (for example `/pma-web`, `/pma-go`, `/pma-rust`, `/pma-bun`) or the existing project scripts if the repository already defines them.

### GitHub Actions Conventions

- Workflow files in `.github/workflows/`.
- Use the package manager, toolchain, and cache strategy that match the active project stack.
- Pin action versions to full SHA, not tags (for example, `actions/checkout@<sha>`).
- Run on: `pull_request` (target: main) and `push` (branch: main).

### CI Jobs

| Job | Command | Gate |
|---|---|---|
| Format / Lint | project-specific formatting and lint commands | Must pass, zero warnings where enforced |
| Static checks | project-specific static analysis (`typecheck`, `vet`, `clippy`, etc.) | Must pass |
| Build | project-specific build command | Must succeed |
| Test | project-specific test command | Must pass and meet the project's coverage policy |
| Security | project-specific audit command or dedicated review | No unresolved critical/high issues |

### CI Rules

- **Never** skip CI checks to unblock a merge.
- **Never** add `[skip ci]` to commit messages unless explicitly requested.
- If CI fails, fix the root cause locally before pushing again — do not iterate by pushing repeated fix attempts.
- Keep CI fast: target under 5 minutes for the full pipeline.
- Secrets in CI use GitHub Actions secrets (`${{ secrets.XXX }}`), never hardcoded.
- Use `gh run view` or `gh run watch` to check CI status from the terminal.

## Tools and Security

- Prefer semantic code navigation tools for architecture understanding.
- Check official docs (e.g., Context7) before using third-party APIs.
- Use code/web search tools for examples and troubleshooting when needed.
- Verify UI behavior after UI edits.
- Keep secrets in `.env`; never hardcode or log secrets.
- Mark risky commands with an explicit warning comment.
