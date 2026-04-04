---
name: pma
description: Project development lifecycle management with a strict three-phase workflow (investigate -> proposal -> implement), file-based plan tracking in docs/plan/, task tracking in docs/task/, and claim-before-work multi-agent coordination. Use when handling feature development, bug fixes, refactors, planning, progress tracking, or multi-agent execution in an existing codebase. English-first for repository docs and remote-visible metadata; use Chinese docs only when the user explicitly requests a specific document in Chinese.
---

# PMA - Project Management Assistant

Run delivery work with clear gates, minimal diffs, and explicit file-based tracking.

Keep this entry file small. Load only the references needed for the current turn.

## Always-On Rules

1. Follow the three-phase workflow strictly: investigate -> proposal -> implement.
2. Do not implement before explicit approval such as `proceed`.
3. Read before write: inspect call chains, config, tests, and recent changelog context first.
4. Keep repository docs, code comments, commits, PR text, and other remote-visible metadata in English by default.
5. Make the minimal requested change; avoid unrequested refactors.
6. Do not use plan mode. Track plans only in `docs/plan/`.
7. When the goal is unclear, stop and ask instead of guessing.
8. Update task and plan files immediately; do not defer state sync.

## Core Workflow

### Phase 1: Investigation

- trace upstream and downstream impact
- inspect related code, tests, config, docs, and recent changelog entries
- find or create the matching task in `docs/task/index.md`
- claim the task before implementation
- create a plan file for non-trivial work

### Phase 2: Proposal

Output these items, then stop for approval:

- current state
- proposal
- risks
- scope
- alternatives when they matter

### Phase 3: Implement -> Verify -> Record

After approval:

- set task and plan status to in progress
- implement the approved scope
- run focused verification
- mark task and plan completed
- update changelog when needed

## Reference Packs

Load only what the current task needs:

- `references/workflow.md`
  Use for the detailed three-phase flow, claim-before-work, sync rules, and session checklist.
- `references/docs-and-tracking.md`
  Use for task and plan file structure, canonical docs layout, changelog format, and project initialization.
- `references/delivery.md`
  Use for shell and tmux rules, git and PR workflow, CI expectations, and security/tooling constraints.

## Canonical Format References

Use these format files instead of redefining schemas inline:

- [docs/task-format.md](docs/task-format.md)
- [docs/plan-format.md](docs/plan-format.md)

## Quick Routing

Choose references by intent:

- New feature, bug fix, or refactor: load `references/workflow.md` and `references/docs-and-tracking.md`.
- Task claiming, ownership, or status sync: load `references/workflow.md`.
- Task or plan file creation: load `references/docs-and-tracking.md`.
- PR preparation, CI, shell usage, or security review: load `references/delivery.md`.

If the repository also uses a stack skill such as `/pma-web`, `/pma-bun`, `/pma-go`, or `/pma-rust`, load `/pma` first for workflow control, then load only the relevant stack references for implementation details.
