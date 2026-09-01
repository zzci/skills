# PMA Workflow

## Table of Contents

- [Hard Rules](#hard-rules)
- [Task Tiers](#task-tiers)
- [Three-Phase Workflow](#three-phase-workflow)
- [Claim-Before-Work](#claim-before-work)
- [Sync Rules](#sync-rules)
- [Dependency Freshness](#dependency-freshness)
- [Session Checklist](#session-checklist)

## Hard Rules

1. Repository docs, task files, plan files, code comments, commit messages, PR text, and other remote-visible metadata stay in English by default.
2. Read before write: inspect call chains, config, tests, and changelog context before editing logic.
3. Make only the minimal requested change.
4. Do not use plan mode. Plans live only in `docs/plan/`.
5. Do not implement before explicit confirmation such as `proceed`, except on the trivial tier (see *Task Tiers*).
6. Use English filenames only.
7. When the goal is unclear, stop and ask.
8. Trace root causes instead of patching symptoms.
9. Output only what changes the next decision.
10. When introducing or upgrading a dependency, default to the latest stable version verified at the registry — see *Dependency Freshness* below.

## Task Tiers

Ceremony scales with complexity. Decide the tier before Phase 1, name it in the first reply, and never argue a task down a tier after the fact.

### Trivial (fast path)

All of the following must hold:

- The change touches one source file, or only non-executable files (docs, comments, formatting, typos, config with no semantic change).
- The intended result is unambiguous from the request; there is no design choice to make.
- No risk area is touched: auth/authz, secrets and env, DB schema or migrations, dependencies, CI/build config, public API contracts, concurrency, persistence semantics.
- It can be verified immediately with an existing gate (test, typecheck, lint) or by running the code.

What is skipped: the task entry, the plan file, and the Phase 2 stop. What still applies: read before write, RED -> GREEN for any behavior change in a repo with tests, the relevant quality gate, and a one-line statement of what changed and why the fast path applied.

### Standard

Everything else with fewer than 3 files and within one module: claim a task, give the Phase 2 items inline (compact), wait for approval, no plan file.

### Full

`>=3` files, cross-module, or the user asks for a plan: claim a task, write `PLAN-NNN.md`, wait for approval.

### Escalation and overrides

- A trivial change that grows past its criteria (a second source file with behavior change, a risk area, an unexpected design choice) stops immediately and re-enters at the standard tier: claim the task, propose, wait.
- The user can disable the fast path for a session, and a project can disable it in `AGENTS.md` (*Project-specific facts*, `Fast path: disabled`). Then every change is at least standard.
- Approval granted in the request itself (an explicit "just do it" with a fully specified change) satisfies the Phase 2 gate for a standard task, but the task entry and status sync still happen.
- When in doubt about the tier, it is not trivial.

## Three-Phase Workflow

Tier deviations are defined in *Task Tiers*; the steps below describe the standard and full tiers.

### Phase 1: Investigation

1. Trace upstream and downstream call chains, symbol references, and types.
2. Search related code, config, tests, migrations, and docs.
3. Read the tail of `docs/changelog.md`.
4. Find or create the matching task in `docs/task/index.md` and claim it through the *Claim-Before-Work* procedure below (`task-state.sh claim`); never flip the `[-]` marker by hand.

Non-trivial task rule:

- If the change touches `>=3` files or crosses modules, create `docs/plan/PLAN-NNN.md` and write findings into the context section.

### Phase 2: Proposal

Output these items, then stop:

- current state
- proposal
- risks
- scope
- alternatives when multiple approaches exist

For non-trivial tasks:

- complete the remaining sections in `PLAN-NNN.md`
- append one line to `docs/plan/index.md` with `[ ]`
- wait for approval and address annotations before implementation

### Phase 3: Test -> Implement -> Verify -> Record

Only after approval:

1. If a plan exists, set the plan index marker to `[-]`, detail status to `implementing`, and `approvedAt` to the current timestamp.
2. For a new feature or bug fix, write the smallest test that demonstrates the missing or broken behavior and run it to establish RED. Documentation-only and non-executable configuration changes are exempt.
3. Implement only the approved scope until the new test passes (GREEN), then simplify without changing behavior (IMPROVE). Problems discovered outside the approved scope become new `[ ]` entries in `docs/task/index.md`, not silent scope expansion.
4. Run the focused test, the relevant suite, and the stack quality gates. Target 80% or higher coverage unless the repository defines a stricter threshold; explain any material gap instead of hiding it.
5. Set the task index marker to `[x]` and task detail status to `completed`.
6. If a plan exists, set the plan index marker to `[x]` and plan detail status to `completed`.
7. Update changelog when needed.

## Claim-Before-Work

Claim when investigation starts (Phase 1), and never write implementation code on an unclaimed task:

1. Read `docs/task/index.md` and inspect `[-]` items.
2. If another agent owns the in-progress task, skip it.
3. Choose a stable, unique owner identifier for the work session, such as `worker-a/session-123`.
4. Claim through the bundled serializer:

   ```bash
   <pma-skill>/scripts/task-state.sh claim docs/task/PREFIX-NNN.md worker-a/session-123
   ```

   The script takes an exclusive lock, validates the index and detail preconditions, stages both updates, commits them with rollback, and rejects a competing owner.
5. Sync tool state if task tools exist.
6. Start implementation only after the claim is fully written.

All cooperating workers must use `task-state.sh`; direct multi-file edits bypass the lock and are forbidden. If the script rejects a claim, re-read task state and choose another task.

Unclaim (proposal rejected or work abandoned):

```bash
<pma-skill>/scripts/task-state.sh unclaim docs/task/PREFIX-NNN.md worker-a/session-123 "Proposal was rejected."
```

The reason is required; the script resets the marker, status, and owner together and appends the note.

Staleness heuristic: a `[-]` task whose owner session is gone and whose notes have not changed may be unclaimed by another agent after confirming with the user.

On completion:

```bash
<pma-skill>/scripts/task-state.sh complete docs/task/PREFIX-NNN.md worker-a/session-123 "Focused and relevant suites passed."
```

Then sync tool state if task tools exist.

On close:

```bash
<pma-skill>/scripts/task-state.sh close docs/task/PREFIX-NNN.md worker-a/session-123 "Superseded by PREFIX-002."
```

## Sync Rules

- Task status updates are immediate.
- Primary source of truth is `docs/task/` and `docs/plan/`.
- If task tools exist, keep tool state in sync with file state.
- If task tools are unavailable, continue with file-only sync and state that explicitly.

## Dependency Freshness

When introducing or upgrading a dependency, default to the **latest stable version**. Snippets copied from tutorials, blog posts, prior PRs, or LLM recall routinely carry outdated versions; that drift compounds across security audits, ecosystem compatibility, and breaking-change exposure.

### Rule

Before adding any new dependency or accepting any version number that came from somewhere other than the registry:

1. **Verify the latest stable at the registry** (commands per stack — see the stack skill's baseline):
   - crates.io / npmjs.com / pkg.go.dev / PyPI are the sources of truth; the LLM is not.
2. **Confirm current API and breaking changes via official docs.** Prefer the vendor's official documentation. If a documentation connector such as Context7 is installed and available, it may help locate the relevant official material; never assume a connector or exact tool name exists. Training-data recall lags real releases — treat it as a hint, not a fact.
3. **Pin to non-latest only with a recorded reason.** MSRV constraint, peer-dep incompatibility, blocked upstream — write the justification inline next to the dependency entry (`// PINNED: <reason> until <condition>`) or in `docs/decisions/`.
4. **Separate routine version bumps from feature work.** A `chore(deps): bump X to Y` commit or PR is reviewable; bundling it into a feature diff hides regressions.

### When to escalate

If the latest stable version conflicts with the project's runtime / MSRV / peer-dep constraints, surface the trade-off in the Phase 2 proposal — do not silently downgrade.

### Anti-patterns

- Copy-pasting `"some-lib": "^1.2.3"` from a tutorial without checking whether 1.x is still maintained.
- Reusing a version from another repo in the same org without re-verifying.
- Accepting a version the LLM "knows" without registry confirmation.
- Bumping a dependency inside an unrelated feature commit.

## Session Checklist

1. Session start: read `docs/task/index.md`, active task details, and `docs/plan/index.md`.
2. New task: create detail file first, then append the index line.
3. Before work: complete claim-before-work.
4. Session end: verify status files and update index header date.
