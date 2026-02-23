# ptask

Manage project execution through a compact `task.md` file in each project root.

## Install

```bash
npx skills add <your-github-username>/ptask
```

## Features

- Maintains a single `task.md` file per project for task tracking
- Checkbox status markers: `[ ]` pending, `[-]` in progress, `[x]` completed, `[~]` closed
- Priority levels: P0 (blocking) through P3 (low)
- Task IDs with `PREFIX-NNN` format (e.g. `AUTH-001`, `UI-002`)
- Syncs with Claude Code's `TaskCreate`/`TaskUpdate` tools
- Supports English and Chinese

## Usage

Invoke via `/ptask` in Claude Code, or it activates automatically when you ask to plan work, track progress, or manage tasks.
