# Task Format Reference

This document defines the task management format for the `docs/task/` directory, including ID rules and initialization templates.

## Table of Contents

- [Directory Structure](#directory-structure)
- [Index Entry Format](#index-entry-format)
- [Detail File Format](#detail-file-format)
- [Task ID Rules](#task-id-rules)
- [Status Markers](#status-markers)
- [Priority Levels](#priority-levels)
- [Update Rules](#update-rules)
- [Index Templates](#index-templates)

## Directory Structure

```text
docs/task/
├── index.md                         # Task index (one line per task)
└── <timestamp>-<feature-slug>.md     # Task detail files (one per task)
```

## Index Entry Format

Each task in `index.md` is a single-line link with no sub-fields.

```markdown
- [ ] [**20260907-1428-add-endpoint Add endpoint**](20260907-1428-add-endpoint.md) `P1`
```

All detailed information goes in the corresponding detail file. `index.md` must not contain description, owner, or other sub-fields.

## Detail File Format

Create the detail file atomically when adding a new task line to `index.md`. This maps cleanly to `TaskCreate` parameters.

### English Template

```markdown
# 20260907-1428-add-endpoint Add endpoint

- **status**: pending
- **priority**: P1
- **owner**: (unassigned)
- **createdAt**: YYYY-MM-DD HH:mm

## Description

What needs to be done, with context and acceptance criteria.

## ActiveForm

Present-continuous description for spinner display.

## Dependencies

- **blocked by**: (none)
- **blocks**: (none)

## Notes

(Implementation notes, progress logs, or related links.)
```

### Detail File Update Rules

- Allowed detail `status` values: `pending`, `in_progress`, `completed`, `closed`
- Claiming: use `<pma-skill>/scripts/task-state.sh claim <task-file> <owner>` so index, status, and owner change under one lock
- Unclaiming: use `task-state.sh unclaim <task-file> <owner> <reason>`
- Completing: use `task-state.sh complete <task-file> <owner> [note]`
- Closing: use `task-state.sh close <task-file> <owner> <reason>`
- Owner convention: use a stable, unique per-session identifier such as `worker-a/session-123`; all cooperating workers must use the script rather than editing claim fields directly
- In progress: append progress notes to the notes section

## Task ID Rules

- Filename format: `<timestamp>-<feature-slug>.md`; the ID is the filename without `.md`.
- Use a concise English feature slug in lowercase kebab-case, such as `add-endpoint` or `fix-login-redirect`.
- Use the creation time in UTC with minute precision: `YYYYMMDD-HHmm` (`HH` is the 24-hour clock, `mm` is minutes), for example `20260907-1428`. Do not include seconds, milliseconds, or `T`/`Z` separators.
- Example: `docs/task/20260907-1428-add-endpoint.md`.
- Do not allocate category or global sequence numbers, or scan existing IDs to choose the next number.
- Create the detail file exclusively (fail if it exists). If the name collides, wait until the next UTC minute and retry with its timestamp; never overwrite an existing task. Append its index entry only after successful creation.
- Once created, keep the ID and filename stable. Existing numbered files remain valid; do not rename them unless explicitly requested.
- Use the full ID in dependency references and links, never the feature slug alone.

## Status Markers

| Marker | Meaning | TaskUpdate status |
|------|------|-------------------|
| `[ ]` | Pending | `pending` |
| `[-]` | In progress | `in_progress` |
| `[x]` | Completed | `completed` |
| `[~]` | Closed / Won't do | `deleted` |
| `[d]` | Deleted detail file; index entry retained | `deleted` |

The `TaskCreate` / `TaskUpdate` / `ActiveForm` references apply only in harnesses that expose Claude Code task tools; there, file-status `closed` maps to tool-status `deleted`.

## Priority Levels

| Tag | Meaning |
|-----|------|
| `P0` | Blocking issue, handle immediately |
| `P1` | High priority, current iteration |
| `P2` | Medium priority, next iteration |
| `P3` | Low priority, to be planned |

## Update Rules

- **`index.md`**: Only update the checkbox marker on existing entries; never delete a line or change its other content. When a detail file is deleted, change its marker to `[d]` and retain the original entry.
- **Detail files**: Revise content or remove obsolete fields while keeping required fields on retained tasks. Task detail files may be deleted; retain their index entries with the `[d]` marker.
- Record changes and deletions in `docs/changelog.md` and update affected references per [Tracking History](../references/docs-and-tracking.md#tracking-history).
- New tasks append to the end of `index.md`.
- Keep IDs and index entries permanently; deleted details do not need placeholder files.

## Index Templates

### English Template

```markdown
# Project Name - Task List

> Updated: YYYY-MM-DD

## Usage

Each task is a single line linking to its detail file. All detailed information lives in `docs/task/<timestamp>-<feature-slug>.md`.

### Format

- [ ] [**20260907-1428-add-endpoint Add endpoint**](20260907-1428-add-endpoint.md) `P1`

### Status Markers

| Marker | Meaning |
|--------|---------|
| `[ ]`  | Pending |
| `[-]`  | In progress |
| `[x]`  | Completed |
| `[~]`  | Closed / Won't do |
| `[d]`  | Deleted detail file; index entry retained |

### Priority: P0 (blocking) > P1 (high) > P2 (medium) > P3 (low)

### Rules

- Only update the checkbox marker; never delete the line or change its other content. If the detail file is deleted, mark the entry `[d]`.
- Record change history and deletion reasons in `docs/changelog.md`; update affected dependency and plan references.
- New tasks append to the end.
- See each `<timestamp>-<feature-slug>.md` for full details, except `[d]` entries whose files have been deleted; consult `docs/changelog.md` for their history.

---

## Tasks

```
