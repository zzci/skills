# PMA Docs And Tracking

## Canonical Structure

```text
docs/
├── task/
│   ├── index.md
│   └── <timestamp>-<feature-slug>.md
├── plan/
│   ├── index.md
│   └── <timestamp>-<feature-slug>.md
├── decisions/        # when applicable — recorded decisions, pinned-version justifications
├── architecture.md
└── changelog.md
```

## Required Files

- `docs/task/index.md`: one-line task entries
- `docs/task/<timestamp>-<feature-slug>.md`: task detail files
- `docs/plan/index.md`: one-line plan entries
- `docs/plan/<timestamp>-<feature-slug>.md`: plan detail files
- `docs/architecture.md`
- `docs/changelog.md`

Use these format references:

- [task-format.md](../docs/task-format.md)
- [plan-format.md](../docs/plan-format.md)

## Documentation Rules

- Use English for repository docs and headings by default.
- Use Chinese docs only when the user explicitly requests a specific document in Chinese.
- Keep filenames in English even when content is Chinese.
- Write investigation findings into the relevant plan context section.
- Do not create extra report files; temporary files belong in `./tmp/`.

## Tracking History

- Task and plan files describe current work and may be revised or deleted as requirements change; keeping closed or rejected records is optional.
- Preserve history in `docs/changelog.md`. Before deleting a record or replacing historical content, record the affected ID/title, what changed, why, and any replacement task or plan ID. A concise summary is enough; copying the entire old record is not required.
- When deleting a task or plan, remove its index entry and detail file together. Update or remove affected dependency references, `relatedTask` values, and links so retained records do not point to deleted files.
- Coordinate changes to actively owned records with the owner so cleanup does not race with ongoing work or status updates.

## Changelog Conventions

Entry format:

```markdown
## YYYY-MM-DD HH:MM [tag]

[content]
```

Recommended tags:

- `[progress]`
- `[BUG-P0]`
- `[BUG-P1]`
- `[pitfall]`
- `[decision]`

## Project Initialization

The project's `AGENTS.md` (with `CLAUDE.md` symlinked to it) only carries **project-personalized** facts — which stack skills apply, language/runtime choice, quality-gate command, link to local divergences. Skill rules are not duplicated into the project file; they are loaded from `/pma` and the stack skills on demand.

See [project-injection.md](../docs/project-injection.md) for the canonical template, the anti-patterns to avoid, and the full initialization checklist.

Minimum on first use in a project:

1. Create `AGENTS.md` with the *Project Development* template from [project-injection.md](../docs/project-injection.md), then `ln -s AGENTS.md CLAUDE.md` so the two cannot drift.
2. Initialize `docs/task/index.md` and `docs/plan/index.md` per the canonical formats.
3. Initialize `docs/architecture.md` and `docs/changelog.md` in English unless the user explicitly requests Chinese.
4. Apply *Repository Hygiene* (`/pma references/delivery.md`) — `.gitignore`, `.gitattributes`, `.editorconfig`, `LICENSE`, `README.md`, `.env.example`, plus the stack-pinned toolchain file.
