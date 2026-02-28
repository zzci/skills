---
name: pma
description: Project development lifecycle management with a strict three-phase workflow (investigate to proposal to implement), file-based plan tracking in docs/plan/, task tracking in docs/task/, and claim-before-work multi-agent coordination. Use when handling feature development, bug fixes, refactors, planning, progress tracking, or multi-agent execution in an existing codebase. Supports English and Chinese.
---

# PMA — Project Management Assistant / 项目开发助手

Run delivery work with clear gates, minimal diffs, and explicit task/plan tracking.
通过清晰门禁、最小改动、显式任务/方案跟踪推进交付。

## Hard Rules / 硬性规则

1. Use one project language for docs, task files, and commit messages (follow user preference, otherwise follow existing project language).
   全项目仅使用一种语言；用户指定优先，否则沿用项目现有语言。
2. Read before write: inspect call chains, related config/tests, and recent changelog context before editing logic.
   先读后改：修改逻辑前先梳理调用链、配置/测试与最近日志。
3. Make minimal requested changes only; do not add unrequested refactors or features.
   只做被要求的最小改动，不扩展需求。
4. Never use plan mode (`EnterPlanMode`, `mode: "plan"`). Manage plans in `docs/plan/` files only.
   禁止 plan 模式；方案仅用 `docs/plan/` 文件管理。
5. Do not implement before explicit confirmation (`proceed` / `开始实现`).
   收到明确“开始实现”前，不进入实现阶段。
6. Use English filenames only, even for Chinese content (for example: `architecture.md`, `changelog.md`).
   文件名必须使用英文，即使内容是中文（例如固定使用 `architecture.md`、`changelog.md`）。

## Three-Phase Workflow / 三阶段工作流

### Phase 1: Investigation / 第一阶段：调查

1. Trace upstream/downstream call chains, symbol references, and types.
2. Search related code, config, tests, migrations, and docs.
3. Read the tail of `docs/changelog.md` for recent context.
4. Find or create the matching task in `docs/task/index.md` and claim it (`[-]`).

Non-trivial task rule / 非平凡任务判定：
- If the change touches `>=3` files or crosses modules, create `docs/plan/PLAN-NNN.md` and write findings to `## Context` / `## 现状`.
- 若改动涉及 `>=3` 文件或跨模块，创建方案文件并先写“现状”。

### Phase 2: Proposal / 第二阶段：方案

Output these items, then stop for approval:
输出以下内容后必须等待审批：

- Current state / 现状
- Proposal / 方案
- Risks / 风险
- Scope / 工作量
- Alternatives (if multiple approaches exist) / 备选方案（如有）

For non-trivial tasks:
- Complete remaining sections in `PLAN-NNN.md`.
- Append one line to `docs/plan/index.md` with `[ ]`.
- Wait for user annotations and address all of them before implementation.

### Phase 3: Implement -> Verify -> Record / 第三阶段：实现 -> 验证 -> 记录

Only after approval:
仅在审批通过后执行：

1. If a plan exists, set plan index marker to `[-]` and detail `status` to `implementing`.
2. Implement step by step according to proposal.
3. Run focused self-verification.
4. Set task index marker to `[x]` and task detail `status` to `completed`.
5. If a plan exists, set plan index marker to `[x]` and plan detail `status` to `completed`.
6. Update changelog as needed.

## Task and Plan Files / 任务与方案文件

Use these canonical references instead of redefining formats in-place:
统一格式以下列文档为准，不在本文件重复定义：

- Task format: [docs/task-format.md](docs/task-format.md)
- Plan format: [docs/plan-format.md](docs/plan-format.md)

Required structure:

- `docs/task/index.md`: one-line task entries
- `docs/task/PREFIX-NNN.md`: task detail files
- `docs/plan/index.md`: one-line plan entries
- `docs/plan/PLAN-NNN.md`: plan detail files

## Claim-Before-Work (Multi-Agent Safety) / 认领机制（多 Agent 安全）

Before writing any implementation code:
写任何实现代码前必须完成：

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

## Sync Rules / 同步规则

Task status updates are immediate, never deferred.
任务状态必须即时写入，不可延迟。

- Primary source is files in `docs/task/` and `docs/plan/`.
- If `TaskCreate`/`TaskUpdate` tools are available, keep tool state in sync with file state.
- If task tools are unavailable, continue with file-only sync and state this in the progress update.

Session checklist / 会话检查清单：
1. Session start: read `docs/task/index.md`, active task details, and `docs/plan/index.md`.
2. New task: create detail file first, then append index line.
3. Before work: complete Claim-Before-Work.
4. Session end: verify statuses are written and update index header date.

## Documentation System / 文档系统

English project:

```
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

中文项目（仅内容中文，文件名保持英文）：

```
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

Write investigation findings into plan `## Context` / `## 现状`.
Do not create extra report files; temporary files go to `./tmp/`.

## Changelog Conventions / 开发日志约定

Entry format:

```markdown
## YYYY-MM-DD HH:MM [tag]

[content]
```

Recommended tags:
- EN: `[progress]`, `[BUG-P0]`, `[BUG-P1]`, `[pitfall]`, `[decision]`
- 中文: `[进度]`, `[BUG-P0]`, `[BUG-P1]`, `[踩坑]`, `[决策]`

## Project Initialization / 项目初始化

On first use in a project:
首次接入项目时执行：

1. Ensure `CLAUDE.md` contains a `## Project Development` / `## 项目开发管理` section that references `/pma` and the three-phase workflow.
2. Ensure `AGENTS.md` contains the same section.
3. Ensure `docs/task/index.md` exists (initialize from [docs/task-format.md](docs/task-format.md)).
4. Ensure `docs/plan/index.md` exists (initialize from [docs/plan-format.md](docs/plan-format.md)).
5. Ensure core docs exist (`architecture.md` + `changelog.md`), and keep content language aligned with the project.

## Tools and Security / 工具与安全

- Prefer semantic code navigation tools for architecture understanding.
- Check official docs (e.g., Context7) before using third-party APIs.
- Use code/web search tools for examples and troubleshooting when needed.
- Verify UI behavior after UI edits.
- Keep secrets in `.env`; never hardcode or log secrets.
- Mark risky commands with an explicit warning comment.
