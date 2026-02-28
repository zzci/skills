# Task Format Reference / 任务格式参考

> This document defines the task management format for the `docs/task/` directory, including ID rules and initialization templates in both English and Chinese.
> 本文档定义 `docs/task/` 目录的任务管理格式、编号规则和初始化模板（中英文）。

## Table of Contents / 目录

- [Directory Structure / 目录结构](#directory-structure--目录结构)
- [Index Entry Format / 索引条目格式](#index-entry-format--索引条目格式)
- [Detail File Format / 详情文件格式](#detail-file-format--详情文件格式)
- [Task ID Rules / 任务编号规则](#task-id-rules--任务编号规则)
- [Status Markers / 状态标记](#status-markers--状态标记)
- [Priority Levels / 优先级](#priority-levels--优先级)
- [Update Rules / 更新规则](#update-rules--更新规则)
- [Index Templates / 索引模板](#index-templates--索引模板)

## Directory Structure / 目录结构

```
docs/task/
├── index.md          # Task index (one line per task) / 任务索引（每任务一行）
└── PREFIX-NNN.md     # Task detail files (one per task) / 任务详情文件（每任务一个）
```

## Index Entry Format / 索引条目格式

Each task in `index.md` is a **single-line link** — no sub-fields.
每个任务在 `index.md` 中为**单行链接**，不含子字段。

```
- [ ] [**PREFIX-001 Short imperative title**](PREFIX-001.md) `P1`
```

All detailed information goes in the corresponding detail file. `index.md` must NOT contain description, owner, or other sub-fields.
所有详细信息写入对应的详情文件。`index.md` 中禁止放置 description、owner 等子字段。

## Detail File Format / 详情文件格式

Create the detail file atomically when adding a new task line to `index.md`. Maps to `TaskCreate` parameters.
创建任务时同时创建详情文件（原子操作），映射到 `TaskCreate` 参数。

### English Template

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

### 中文模板

```markdown
# PREFIX-001 简短祈使句标题

- **status**: pending
- **priority**: P1
- **owner**: (未分配)
- **createdAt**: YYYY-MM-DD HH:mm

## 描述

需要做什么，包含上下文和验收标准。

## 进行时描述

进行中的现在进行时描述（用于 spinner 显示）。

## 依赖

- **blocked by**: (无)
- **blocks**: (无)

## 笔记

（实现笔记、进度日志或相关链接。）
```

### Detail File Update Rules / 详情文件更新规则

- Allowed detail status values / 详情文件允许状态值: `pending`, `in_progress`, `completed`, `closed`
- Claiming / 认领: `status` → `in_progress`, set `owner`
- Completing / 完成: `status` → `completed`, add completion notes if needed
- Closing / 关闭: `status` → `closed`, add reason
- In progress / 工作中: append progress notes to `## Notes` / `## 笔记`

## Task ID Rules / 任务编号规则

- Format: `PREFIX-NNN` — uppercase category prefix + hyphen + zero-padded 3-digit sequence.
  格式：大写类别前缀 + 连字符 + 三位补零序号。
- Prefix is a short category abbreviation. / 前缀为任务类别的短缩写。
  Examples: `AUTH`, `UI`, `API`, `BUG`, `PERF`, `FEAT`, `REFACTOR`.
- Sequence numbers are per-prefix, starting from `001`. / 序号按前缀独立递增，从 `001` 开始。
- Once assigned, never reuse or renumber. / 编号一旦分配不可复用或重编。
- Each ID maps to exactly one file: `docs/task/PREFIX-NNN.md`.

## Status Markers / 状态标记

| Marker / 标记 | EN | 中文 | TaskUpdate status |
|------|------|------|-------------------|
| `[ ]` | Pending | 待办 | `pending` |
| `[-]` | In progress | 进行中 | `in_progress` |
| `[x]` | Completed | 已完成 | `completed` |
| `[~]` | Closed / Won't do | 关闭/不做 | `deleted` |

## Priority Levels / 优先级

| Tag | EN | 中文 |
|-----|------|------|
| `P0` | Blocking issue, handle immediately | 阻塞性问题，立即处理 |
| `P1` | High priority, current iteration | 高优先级，当前迭代 |
| `P2` | Medium priority, next iteration | 中优先级，下次迭代 |
| `P3` | Low priority, to be planned | 低优先级，待规划 |

## Update Rules / 更新规则

- **`index.md`**: Only update checkbox markers (e.g. `[ ]` → `[x]`). Never delete task lines (minimize git diff).
  仅更新复选框标记，禁止删除任务行（最小化 git diff）。
- **Detail files**: Update status, owner, and notes in place. Never delete existing fields.
  原地更新 status、owner 和 notes，禁止删除已有字段。
- New tasks append to the end of `index.md`. / 新任务追加到末尾。
- Task IDs are permanent. / 编号保持稳定，不可复用或重编。

## Index Templates / 索引模板

### English Template

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

### 中文模板

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
