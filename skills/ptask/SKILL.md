---
name: ptask
description: Manage project execution through `docs/task/index.md` (status index) and `docs/task/PREFIX-NNN.md` (task detail files). Use when users ask to plan work, track progress, update project status, or coordinate implementation tasks. Uses checkbox status markers with in-place updates and TaskCreate/TaskUpdate sync. Supports English and Chinese.
---

# Project Task

Use this skill to maintain one compact task list in `docs/task/index.md`.

## Core Workflow

1. Identify project root.
2. Ensure `CLAUDE.md` and `AGENTS.md` contain the Project Task section; if missing, append it (see below).
3. Ensure `docs/task/index.md` exists; if not, create from template below.
4. Confirm task list language with user preference: Chinese or English.
5. For every user message or modification request, add or update one task in the list.
6. Sync changes between `docs/task/index.md` and `TaskCreate`/`TaskUpdate` tools.

## Claim-Before-Work (Multi-Agent Safety)

**CRITICAL: Before starting ANY task, you MUST claim it first.**

1. **Read `docs/task/index.md`** and check the task's current status marker. For `[-]` tasks, read the detail file `docs/task/PREFIX-NNN.md` to check the `owner` field.
2. **Skip if already claimed**: If the task marker is `[-]` (in progress) and `owner` in the detail file is set to another agent, do NOT work on it — pick the next available task.
3. **Claim the task atomically**: Update ALL of the following before writing any implementation code:
   - Change marker from `[ ]` to `[-]` in `docs/task/index.md`.
   - In the detail file `docs/task/PREFIX-NNN.md`, set `status` → `in progress` and `owner` to your agent name.
   - Call `TaskUpdate` with `status: "in_progress"` and `owner: "<your-name>"`.
4. **Only then** begin implementation work on the task.
5. **On completion**: Change marker to `[x]`, call `TaskUpdate` with `status: "completed"`.

This prevents multiple agents from working on the same task simultaneously. If you find a task already marked `[-]` with an owner in `docs/task/index.md`, treat it as taken and move on.

## Auto-update `CLAUDE.md`

On first invocation in a project, check `CLAUDE.md` in the project root. If it does not contain a `## Project Task` section, append the following block:

```markdown
## Project Task

Use the /ptask skill to manage all tasks.
- Read `docs/task/index.md` before starting work; create one if it does not exist.
- Every change, new feature, or bug fix must have a corresponding entry in `docs/task/index.md`.
- Task IDs use `PREFIX-NNN` format (e.g. `AUTH-001`); never skip or reuse IDs.
- Each task has a detail file at `docs/task/PREFIX-NNN.md` with full description, owner, dependencies, and notes.
- **BEFORE starting any task**: immediately mark it `[-]` in `docs/task/index.md`, update the detail file status and owner. This is mandatory for multi-agent coordination.
- Update status markers in place after completing a task.
```

If `CLAUDE.md` does not exist, create it with this section.

## Auto-update `AGENTS.md`

On first invocation in a project, check `AGENTS.md` in the project root (or the agents configuration file used by the project). If it does not contain a `## Project Task` section, append the following block:

```markdown
## Project Task

Use the /ptask skill to manage all tasks.
- Read `docs/task/index.md` before starting work; create one if it does not exist.
- Every change, new feature, or bug fix must have a corresponding entry in `docs/task/index.md`.
- Task IDs use `PREFIX-NNN` format (e.g. `AUTH-001`); never skip or reuse IDs.
- Each task has a detail file at `docs/task/PREFIX-NNN.md` with full description, owner, dependencies, and notes.
- **BEFORE starting any task**: immediately mark it `[-]` in `docs/task/index.md`, update the detail file status and owner. This is mandatory for multi-agent coordination.
- Update status markers in place after completing a task.
```

If `AGENTS.md` does not exist, create it with this section.

## Language Mode

- Use one language per `docs/task/index.md` file: Chinese or English.
- If user specifies language, follow it.
- If not specified, keep existing language in the file.

## Status Markers

| Marker | Meaning | TaskUpdate status |
|--------|---------|-------------------|
| `[ ]`  | Pending | `pending`         |
| `[-]`  | In progress | `in_progress` |
| `[x]`  | Completed | `completed`     |
| `[~]`  | Closed / Won't do | `deleted`  |

## Priority Levels

| Tag  | Meaning |
|------|---------|
| `P0` | Blocking issue, handle immediately |
| `P1` | High priority, current iteration |
| `P2` | Medium priority, next iteration |
| `P3` | Low priority, to be planned |

## Task Template

### Index Entry (`docs/task/index.md`)

Each task in `index.md` is a **single line** — title, priority, and status only. Link to the detail file:

```
- [ ] [**PREFIX-001 Short imperative title**](PREFIX-001.md) `P1`
```

No sub-fields in `index.md`. All details go in the separate task file.

### Detail File (`docs/task/PREFIX-NNN.md`)

When creating a task, also create `docs/task/PREFIX-NNN.md` with the full detail (maps to `TaskCreate` params):

```markdown
# PREFIX-001 Short imperative title

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

### Task ID Rules

- Format: `PREFIX-NNN` (uppercase category prefix + hyphen + zero-padded sequence number).
- Prefix should be a short abbreviation of the task category (e.g. `AUTH`, `UI`, `API`, `BUG`, `PERF`).
- Sequence numbers are per-prefix, starting from `001`.
- Keep IDs stable once assigned; never reuse or renumber.
- Each ID corresponds to exactly one file: `docs/task/PREFIX-NNN.md`.

## Initialize `docs/task/index.md`

If `docs/task/index.md` does not exist, create it (including the `docs/task/` directory) using one of the templates below.

English template:

```markdown
# Project Name — Task List

> Updated: YYYY-MM-DD

## Usage

Each task is a single line linking to its detail file. All detailed information lives in `docs/task/PREFIX-NNN.md`.

### Format

- [ ] [**PREFIX-001 Short imperative title**](PREFIX-001.md) `P1`

### Status Markers

| Marker | Meaning |
|--------|---------|
| `[ ]`  | Pending |
| `[-]`  | In progress |
| `[x]`  | Completed |
| `[~]`  | Closed / Won't do |

### Priority: P0 (blocking) > P1 (high) > P2 (medium) > P3 (low)

### Rules

- Only update the checkbox marker; never delete the line.
- New tasks append to the end.
- See each `PREFIX-NNN.md` for full details.

---

## Tasks

```

Chinese template:

```markdown
# 项目名 — 任务清单

> 更新日期: YYYY-MM-DD

## 使用规范

每个任务为单行链接，指向对应的详情文件 `docs/task/PREFIX-NNN.md`。

### 格式

- [ ] [**PREFIX-001 简短祈使句标题**](PREFIX-001.md) `P1`

### 状态标记

| 标记 | 含义 |
|------|------|
| `[ ]` | 待办 |
| `[-]` | 进行中 |
| `[x]` | 已完成 |
| `[~]` | 关闭/不做 |

### 优先级: P0 (阻塞) > P1 (高) > P2 (中) > P3 (低)

### 规则

- 仅更新复选框标记，禁止删除任务行。
- 新任务追加到列表末尾。
- 详细信息见各 `PREFIX-NNN.md` 文件。

---

## 任务

```

## Task Detail File Rules

Each task has a dedicated detail file at `docs/task/PREFIX-NNN.md`.

### When to create

- **Always** create the detail file when adding a new task line to `index.md`.
- Both writes (index line + detail file) must happen atomically in the same step.

### What goes in the detail file

All information that does NOT belong in `index.md`:
- Description and acceptance criteria
- ActiveForm (spinner text)
- Owner, creation date
- Dependencies (blocked by / blocks)
- Implementation notes and progress logs

### What stays in `index.md`

Only the checkbox line: `- [ ] [**PREFIX-001 Title**](PREFIX-001.md) \`P1\``

### Updating the detail file

- When claiming a task: update `status` → `in progress` and `owner` field in the detail file.
- When completing: update `status` → `completed`, add completion notes if needed.
- When closing: update `status` → `closed`, add reason.
- Append progress notes to the `## Notes` section as work progresses.

## Sync Rules

Keep `docs/task/index.md`, detail files, and Claude's task tools in sync. **Write status IMMEDIATELY — never defer updates.**

- **Session start**: Read `docs/task/index.md` → for each active task, read its detail file → `TaskCreate` (subject + description + activeForm required). Respect existing `[-]` tasks owned by other agents.
- **New task**:
  1. Create `docs/task/PREFIX-NNN.md` with full detail.
  2. Append one-line entry to `docs/task/index.md`.
  3. Call `TaskCreate`.
- **Before work begins (MUST do first)**:
  1. Update `docs/task/index.md`: change marker `[ ]` → `[-]`.
  2. Update detail file: set `status` → `in progress`, set `owner` to your agent name.
  3. Call `TaskUpdate` with `status: "in_progress"` and `owner: "<your-name>"`.
  4. Only after ALL writes succeed, start implementation.
- **Task done**: Immediately change marker to `[x]` in `docs/task/index.md` + update detail file `status` → `completed` + `TaskUpdate` set `completed`.
- **Task closed**: Immediately change marker to `[~]` in `docs/task/index.md` + update detail file `status` → `closed` + `TaskUpdate` set `deleted`.
- **Session end**: Verify all status changes are already written to both files, update the date at top of `index.md`.

**Why immediate writes matter**: In multi-agent setups, other agents read `docs/task/index.md` to decide which tasks are available. Deferred writes cause race conditions where two agents start the same task.

## Update Rules

- **`index.md`**: Only update the checkbox marker (e.g. `[ ]` → `[x]`); never delete task lines (minimize git diff).
- **Detail files**: Update status, owner, and notes in place; never delete existing fields.
- New tasks append to the end of `index.md`.
- Keep task IDs stable; never reuse or renumber.
- Auto-log each user conversation turn as a task item when relevant.

## Output Behavior

When reporting progress to the user:

1. Summarize `docs/task/index.md` updates.
2. List in-progress (`[-]`) and pending (`[ ]`) tasks.
3. List newly completed (`[x]`) task titles.

Keep updates concise and aligned with real repository changes.
