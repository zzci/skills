# Plan Format Reference

This document defines the plan management format for the `docs/plan/` directory, including ID rules and initialization templates.

## Table of Contents

- [Directory Structure](#directory-structure)
- [Index Entry Format](#index-entry-format)
- [Detail File Format](#detail-file-format)
- [Plan ID Rules](#plan-id-rules)
- [Status Markers](#status-markers)
- [Update Rules](#update-rules)
- [Index Templates](#index-templates)

## Directory Structure

```text
docs/plan/
├── index.md                         # Plan index (one line per plan)
└── <timestamp>-<feature-slug>.md     # Plan detail files (one per plan)
```

## Index Entry Format

Each plan in `index.md` is a single-line link with creation date and no sub-fields.

```markdown
- [ ] [**20260907-1440-add-endpoint Add endpoint**](20260907-1440-add-endpoint.md) `YYYY-MM-DD`
```

All detailed information goes in the corresponding detail file.

## Detail File Format

Create the detail file atomically when adding a new plan line to `index.md`.

### English Template

```markdown
# 20260907-1440-add-endpoint Add endpoint

- **status**: draft
- **createdAt**: YYYY-MM-DD HH:mm
- **approvedAt**: (pending)
- **relatedTask**: 20260907-1428-add-endpoint

## Context

Investigation findings and current state: which files/modules are involved, call chains, existing logic.

## Proposal

Specific changes: what to modify and how to modify it. Include code snippets.

## Risks

Side effects, potential bugs, migration needs.

## Scope

Estimated scope of changes.

## Alternatives

(If multiple approaches exist, list comparisons here.)

## Annotations

(Current user annotations and responses. Record historical decisions in `docs/changelog.md`.)
```

The Phase 2 output items map directly onto these sections: `current state` -> Context (holding the Phase 1/2 investigation findings), and `proposal` / `risks` / `scope` / `alternatives` -> the sections of the same name.

### Detail File Update Rules

- Allowed detail `status` values: `draft`, `implementing`, `completed`, `rejected`
- Approved: set `status` to `implementing`, set `approvedAt` to current timestamp
- Completed: set `status` to `completed`
- Rejected: set `status` to `rejected`, add reason to annotations
- User annotations: revise as the plan changes; preserve historical decisions and reasons in `docs/changelog.md`

## Plan ID Rules

- Filename format: `<timestamp>-<feature-slug>.md`; the ID is the filename without `.md`.
- Follow the slug, UTC minute-precision timestamp, exclusive creation, collision retry, and stable ID rules in [Task ID Rules](task-format.md#task-id-rules), using `docs/plan/` as the destination.
- Generate the timestamp when the plan is created; it need not match the related task's timestamp. Do not allocate a plan sequence number.
- Example: `docs/plan/20260907-1440-add-endpoint.md`.
- Set `relatedTask` to the existing task's full ID (its filename without `.md`), not the plan ID or the feature slug alone.
- Existing numbered plan files remain valid; do not rename them unless explicitly requested.

## Status Markers

| Marker | Meaning | Detail file `status` |
|------|------|------|
| `[ ]` | Draft / Pending review | `draft` |
| `[-]` | Approved / Implementing | `implementing` |
| `[x]` | Completed | `completed` |
| `[~]` | Rejected / Abandoned | `rejected` |
| `[d]` | Deleted detail file; index entry retained | (no detail file) |

## Update Rules

- **`index.md`**: Only update the checkbox marker on existing entries; never delete a line or change its other content. When a detail file is deleted, change its marker to `[d]` and retain the original entry.
- **Detail files**: Revise content or remove obsolete sections while keeping required fields and applicable sections on retained plans. Plan detail files may be deleted; retain their index entries with the `[d]` marker.
- Record changes and deletions in `docs/changelog.md` and update affected references per [Tracking History](../references/docs-and-tracking.md#tracking-history).
- New plans append to the end of `index.md`.
- Keep IDs and index entries permanently; deleted details do not need placeholder files.

## Index Templates

### English Template

```markdown
# Project Name - Plan Index

> Updated: YYYY-MM-DD

## Usage

Each plan is a single line linking to its detail file. All detailed information lives in `docs/plan/<timestamp>-<feature-slug>.md`.

### Format

- [ ] [**20260907-1440-add-endpoint Add endpoint**](20260907-1440-add-endpoint.md) `YYYY-MM-DD`

### Status Markers

| Marker | Meaning |
|--------|---------|
| `[ ]`  | Draft / Pending review |
| `[-]`  | Approved / Implementing |
| `[x]`  | Completed |
| `[~]`  | Rejected / Abandoned |
| `[d]`  | Deleted detail file; index entry retained |

### Rules

- Only update the checkbox marker; never delete the line or change its other content. If the detail file is deleted, mark the entry `[d]`.
- Record change history and deletion reasons in `docs/changelog.md`; update affected task and plan references.
- New plans append to the end.
- See each `<timestamp>-<feature-slug>.md` for full details, except `[d]` entries whose files have been deleted; consult `docs/changelog.md` for their history.

---

## Plans

```
