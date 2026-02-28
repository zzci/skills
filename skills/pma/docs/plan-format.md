# Plan Format Reference / 方案格式参考

> This document defines the plan management format for the `docs/plan/` directory, including ID rules and initialization templates in both English and Chinese.
> 本文档定义 `docs/plan/` 目录的方案管理格式、编号规则和初始化模板（中英文）。

## Table of Contents / 目录

- [Directory Structure / 目录结构](#directory-structure--目录结构)
- [Index Entry Format / 索引条目格式](#index-entry-format--索引条目格式)
- [Detail File Format / 详情文件格式](#detail-file-format--详情文件格式)
- [Plan ID Rules / 方案编号规则](#plan-id-rules--方案编号规则)
- [Status Markers / 状态标记](#status-markers--状态标记)
- [Update Rules / 更新规则](#update-rules--更新规则)
- [Index Templates / 索引模板](#index-templates--索引模板)

## Directory Structure / 目录结构

```
docs/plan/
├── index.md          # Plan index (one line per plan) / 方案索引（每方案一行）
└── PLAN-NNN.md       # Plan detail files (one per plan) / 方案详情文件（每方案一个）
```

## Index Entry Format / 索引条目格式

Each plan in `index.md` is a **single-line link** with creation date — no sub-fields.
每个方案在 `index.md` 中为**单行链接**，附创建日期，不含子字段。

```
- [ ] [**PLAN-001 Short plan title**](PLAN-001.md) `YYYY-MM-DD`
```

All detailed information goes in the corresponding detail file.
所有详细信息写入对应的详情文件。

## Detail File Format / 详情文件格式

Create the detail file atomically when adding a new plan line to `index.md`.
创建方案时同时创建详情文件（原子操作）。

### English Template

```markdown
# PLAN-001 Short plan title

- **status**: draft
- **createdAt**: YYYY-MM-DD HH:mm
- **approvedAt**: (pending)
- **relatedTask**: PREFIX-NNN

## Context

Investigation findings and current state: which files/modules are involved, call chains, existing logic.

## Proposal

Specific changes — what to modify, how to modify it. Include code snippets.

## Risks

Side effects, potential bugs, migration needs.

## Scope

Estimated scope of changes.

## Alternatives

(If multiple approaches exist, list comparisons here.)

## Annotations

(User annotations and responses. Keep all history.)
```

### 中文模板

```markdown
# PLAN-001 简短方案标题

- **status**: draft
- **createdAt**: YYYY-MM-DD HH:mm
- **approvedAt**: (待审批)
- **relatedTask**: PREFIX-NNN

## 现状

调查发现及现状：涉及哪些文件/模块，调用链，现有逻辑。

## 方案

具体改哪些文件、怎么改，含代码片段。

## 风险

副作用、可能的 Bug、是否需要迁移。

## 工作量

改动范围评估。

## 备选方案

（有多种方案时列出对比。）

## 批注

（用户批注和回复。保留所有历史记录。）
```

### Detail File Update Rules / 详情文件更新规则

- Allowed detail status values / 详情文件允许状态值: `draft`, `implementing`, `completed`, `rejected`
- Approved / 已批准: `status` → `implementing`, set `approvedAt` to current timestamp
- Completed / 已完成: `status` → `completed`
- Rejected / 否决: `status` → `rejected`, add reason to `## Annotations` / `## 批注`
- User annotations / 用户批注: append to `## Annotations` / `## 批注`, keep all history

## Plan ID Rules / 方案编号规则

- Format: `PLAN-NNN` — fixed prefix `PLAN` + zero-padded 3-digit sequence.
  格式：固定前缀 `PLAN` + 三位补零序号。
- Sequence starts from `001`, incrementing globally. / 序号从 `001` 开始，全局递增。
- Once assigned, never reuse or renumber. / 编号一旦分配不可复用或重编。
- Each ID maps to exactly one file: `docs/plan/PLAN-NNN.md`.

## Status Markers / 状态标记

| Marker / 标记 | EN | 中文 | Detail file `status` |
|------|------|------|------|
| `[ ]` | Draft / Pending review | 草稿/待审批 | `draft` |
| `[-]` | Approved / Implementing | 已批准/实现中 | `implementing` |
| `[x]` | Completed | 已完成 | `completed` |
| `[~]` | Rejected / Abandoned | 否决/废弃 | `rejected` |

## Update Rules / 更新规则

- **`index.md`**: Only update checkbox markers (e.g. `[ ]` → `[-]`). Never delete plan lines (minimize git diff).
  仅更新复选框标记，禁止删除方案行（最小化 git diff）。
- **Detail files**: Update status, approvedAt, and annotations in place. Never delete existing sections.
  原地更新 status、approvedAt 和批注，禁止删除已有部分。
- New plans append to the end of `index.md`. / 新方案追加到末尾。
- Plan IDs are permanent. / 编号保持稳定，不可复用或重编。

## Index Templates / 索引模板

### English Template

```markdown
# Project Name — Plan Index

> Updated: YYYY-MM-DD

## Usage

Each plan is a single line linking to its detail file. All detailed information lives in `docs/plan/PLAN-NNN.md`.

### Format

- [ ] [**PLAN-001 Short plan title**](PLAN-001.md) `YYYY-MM-DD`

### Status Markers

| Marker | Meaning |
|--------|---------|
| `[ ]`  | Draft / Pending review |
| `[-]`  | Approved / Implementing |
| `[x]`  | Completed |
| `[~]`  | Rejected / Abandoned |

### Rules

- Only update the checkbox marker; never delete the line.
- New plans append to the end.
- See each `PLAN-NNN.md` for full details.

---

## Plans

```

### 中文模板

```markdown
# 项目名 — 方案索引

> 更新日期: YYYY-MM-DD

## 使用规范

每个方案为单行链接，指向对应的详情文件 `docs/plan/PLAN-NNN.md`。

### 格式

- [ ] [**PLAN-001 简短方案标题**](PLAN-001.md) `YYYY-MM-DD`

### 状态标记

| 标记 | 含义 |
|------|------|
| `[ ]` | 草稿/待审批 |
| `[-]` | 已批准/实现中 |
| `[x]` | 已完成 |
| `[~]` | 否决/废弃 |

### 规则

- 仅更新复选框标记，禁止删除方案行。
- 新方案追加到列表末尾。
- 详细信息见各 `PLAN-NNN.md` 文件。

---

## 方案

```
