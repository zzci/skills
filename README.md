# Skills

A collection of Claude Code skills.

## Install

```bash
# Install all skills
npx skills add zzci/skills

# Install a specific skill
npx skills add zzci/skills --skill ptask

# List available skills
npx skills add zzci/skills --list
```

## Add PMA / 添加 PMA 说明

```bash
# Install PMA only
npx skills add zzci/skills --skill pma
```

First-time PMA setup in a project:

1. Ensure `CLAUDE.md` has a `## Project Development` / `## 项目开发管理` section that references `/pma` and the three-phase workflow.
2. Ensure `AGENTS.md` has the same section.
3. Ensure `docs/task/index.md` exists.
4. Ensure `docs/plan/index.md` exists.
5. Ensure core docs exist: `docs/architecture.md` and `docs/changelog.md`.

## Available Skills

| Skill | Description |
|-------|-------------|
| [pma](skills/pma/) | Project development lifecycle — three-phase workflow + task tracking + docs + multi-agent / 项目开发全流程管理 |
| [ptask](skills/ptask/) | Manage project tasks through `docs/task/index.md` + `docs/task/PREFIX-NNN.md` with claim-before-work multi-agent coordination |
