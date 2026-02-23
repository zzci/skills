---
name: ptask
description: Manage project execution through a compact `task.md` file in each project root. Use when users ask to plan work, track progress, update project status, or coordinate implementation tasks. Uses checkbox status markers with in-place updates and TaskCreate/TaskUpdate sync. Supports English and Chinese.
---

# Project Task

Use this skill to maintain one compact task list in `task.md`.

## Core Workflow

1. Identify project root.
2. Ensure `CLAUDE.md` contains the Project Task section; if missing, append it (see below).
3. Ensure `task.md` exists; if not, create from template below.
4. Confirm task list language with user preference: Chinese or English.
5. For every user message or modification request, add or update one task in the list.
6. Sync changes between `task.md` and `TaskCreate`/`TaskUpdate` tools.

## Claim-Before-Work (Multi-Agent Safety)

**CRITICAL: Before starting ANY task, you MUST claim it first.**

1. **Read `task.md`** and check the task's current status marker and `owner` field.
2. **Skip if already claimed**: If the task marker is `[-]` (in progress) and `owner` is set to another agent, do NOT work on it — pick the next available task.
3. **Claim the task atomically**: Update BOTH of the following before writing any implementation code:
   - Change marker from `[ ]` to `[-]` in `task.md`.
   - Set the `owner` field to your agent name (e.g. `owner: agent-1`).
   - Call `TaskUpdate` with `status: "in_progress"` and `owner: "<your-name>"`.
4. **Only then** begin implementation work on the task.
5. **On completion**: Change marker to `[x]`, call `TaskUpdate` with `status: "completed"`.

This prevents multiple agents from working on the same task simultaneously. If you find a task already marked `[-]` with an owner, treat it as taken and move on.

## Auto-update `CLAUDE.md`

On first invocation in a project, check `CLAUDE.md` in the project root. If it does not contain a `## Project Task` section, append the following block:

```markdown
## Project Task

Use the /ptask skill to manage all tasks.
- Read `task.md` before starting work; create one if it does not exist.
- Every change, new feature, or bug fix must have a corresponding entry in `task.md`.
- Task IDs use `PREFIX-NNN` format (e.g. `AUTH-001`); never skip or reuse IDs.
- **BEFORE starting any task**: immediately mark it `[-]` in `task.md` and set `owner` to your agent name. This is mandatory for multi-agent coordination.
- Update status markers in place after completing a task.
```

If `CLAUDE.md` does not exist, create it with this section.

## Language Mode

- Use one language per `task.md` file: Chinese or English.
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

Each task is a flat list item with sub-fields (maps to `TaskCreate` params):

```
- [ ] **PREFIX-001 Short imperative title** `P1`
  - description: What needs to be done, with context and acceptance criteria
  - activeForm: Present-continuous description for spinner display
  - createdAt: YYYY-MM-DD HH:mm
  - blocked by: Prerequisite tasks (optional)
  - blocks: Tasks blocked by this one (optional)
  - owner: Responsible person/agent (optional)
```

### Task ID Rules

- Format: `PREFIX-NNN` (uppercase category prefix + hyphen + zero-padded sequence number).
- Prefix should be a short abbreviation of the task category (e.g. `AUTH`, `UI`, `API`, `BUG`, `PERF`).
- Sequence numbers are per-prefix, starting from `001`.
- Keep IDs stable once assigned; never reuse or renumber.

## Initialize `task.md`

If `task.md` does not exist, create it in the project root using one of the templates below.

English template:

```markdown
# Project Name — Task List

> Updated: YYYY-MM-DD

## Usage

### Task Format

- [ ] **PREFIX-001 Short imperative title** `P1`
  - description: What to do, context, and acceptance criteria
  - activeForm: Present-continuous spinner text
  - createdAt: YYYY-MM-DD HH:mm
  - blocked by: Prerequisite tasks (optional)
  - blocks: Downstream tasks (optional)
  - owner: Assignee (optional)

### Task ID

- Format: `PREFIX-NNN` — uppercase category prefix + sequential number.
- Examples: `AUTH-001`, `UI-002`, `API-003`, `BUG-001`, `PERF-001`.
- IDs are stable once assigned; never reuse or renumber.

### Status Markers

| Marker | Meaning |
|--------|---------|
| `[ ]`  | Pending |
| `[-]`  | In progress |
| `[x]`  | Completed |
| `[~]`  | Closed / Won't do |

### Priority Levels

| Tag  | Meaning |
|------|---------|
| `P0` | Blocking issue, handle immediately |
| `P1` | High priority, current iteration |
| `P2` | Medium priority, next iteration |
| `P3` | Low priority, to be planned |

### Update Rules

- **Only update the checkbox marker** (e.g. `[ ]` → `[x]`); **never delete description, sub-fields, or any other information**.
- Update status markers in place; do not move tasks between sections.
- Completed tasks: change marker to `[x]`, keep all sub-fields intact.
- Closed tasks: change marker to `[~]`, add a one-line reason in description if needed, keep all existing sub-fields.
- New tasks append to the end of the list.

---

## Tasks

```

Chinese template:

```markdown
# 项目名 — 任务清单

> 更新日期: YYYY-MM-DD

## 使用规范

### 任务格式

- [ ] **PREFIX-001 简短祈使句标题** `P1`
  - description: 需要做什么，包含上下文和验收标准
  - activeForm: 进行中时的现在进行时描述（用于 spinner 显示）
  - createdAt: YYYY-MM-DD HH:mm
  - blocked by: 依赖的前置任务（可选）
  - blocks: 被本任务阻塞的后续任务（可选）
  - owner: 负责人/agent 名称（可选）

### 任务编号

- 格式：`前缀-序号`，前缀为大写类别缩写，序号三位补零。
- 示例：`AUTH-001`、`UI-002`、`API-003`、`BUG-001`、`PERF-001`。
- 编号一旦分配不可复用或重编。

### 状态标记

| 标记 | 含义 |
|------|------|
| `[ ]` | 待办 |
| `[-]` | 进行中 |
| `[x]` | 已完成 |
| `[~]` | 关闭/不做 |

### 优先级

| 标签 | 含义 |
|------|------|
| `P0` | 阻塞性问题，立即处理 |
| `P1` | 高优先级，当前迭代 |
| `P2` | 中优先级，下次迭代 |
| `P3` | 低优先级，待规划 |

### 更新规则

- **仅更新复选框标记**（如 `[ ]` → `[x]`）；**禁止删除描述、子字段或任何其他信息**。
- 原地更新状态标记，不在分区之间移动任务。
- 已完成任务：标记改为 `[x]`，保留所有子字段不变。
- 关闭任务：标记改为 `[~]`，如需要可在 description 中添加一行关闭原因，保留所有现有子字段。
- 新任务追加到列表末尾。

---

## 任务

```

## Sync Rules

Keep `task.md` and Claude's task tools in sync. **Write status to `task.md` IMMEDIATELY — never defer updates.**

- **Session start**: Read `task.md` → `TaskCreate` for active tasks (subject + description + activeForm required). Respect existing `[-]` tasks owned by other agents.
- **Before work begins (MUST do first)**:
  1. Update `task.md`: change marker `[ ]` → `[-]`, set `owner` field to your agent name.
  2. Call `TaskUpdate` with `status: "in_progress"` and `owner: "<your-name>"`.
  3. Only after BOTH writes succeed, start implementation.
- **Task done**: Immediately change marker to `[x]` in `task.md` + `TaskUpdate` set `completed`.
- **Task closed**: Immediately change marker to `[~]` in `task.md` + `TaskUpdate` set `deleted`.
- **Session end**: Verify all status changes are already written to file, update the date at top.

**Why immediate writes matter**: In multi-agent setups, other agents read `task.md` to decide which tasks are available. Deferred writes cause race conditions where two agents start the same task.

## Update Rules

- **Only update the checkbox marker** (e.g. `[ ]` → `[x]`); **never delete description, sub-fields, or any other information** (minimize git diff).
- Update status marker in place; do not move tasks between sections.
- Completed tasks: change marker to `[x]`, keep all sub-fields intact.
- Closed tasks: change marker to `[~]`, add a one-line reason in description if needed, keep all existing sub-fields.
- New tasks append to the end of the list.
- Keep task IDs stable if used (e.g. `TASK-001`, `CRASH-001`).
- Auto-log each user conversation turn as a task item when relevant.

## Output Behavior

When reporting progress to the user:

1. Summarize `task.md` updates.
2. List in-progress (`[-]`) and pending (`[ ]`) tasks.
3. List newly completed (`[x]`) task titles.

Keep updates concise and aligned with real repository changes.
