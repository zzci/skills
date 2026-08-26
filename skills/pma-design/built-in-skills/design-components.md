---
name: "design-components"
description: "Design Components\nAuthor streamable .dc.html Design Components"
---
Enable Design Components authoring for this project.

## This project is a design system

You are authoring the design system itself, not consuming one. `_ds_bundle.js`, `_ds_manifest.json`, and `_adherence.oxlintrc.json` are **generated artifacts** — never hand-edit them. After you edit components or tokens, (re)generate them by running the portable compiler (a plain shell call on Claude Code / Codex):

```
node <skill>/scripts/compile-design-system.mjs designs/<project>
```

(`<skill>` is this skill's directory.) See [`design-system-authoring-guide.md`](design-system-authoring-guide.md) for the full authoring flow.

**What the compiler looks for** (global CSS entry, `<Name>.jsx` + `.d.ts` component pairs, `@dsCard` preview cards, `@startingPoint` tags, tokens, fonts) is documented once, in [`design-system-authoring-guide.md`](design-system-authoring-guide.md) → "What the compiler looks for" — read it there; don't rely on memory of the tag shapes.

Quick actions:
- "create a starting point <X>" → write an `.html` with `<!-- @startingPoint section="<Group>" subtitle="<one line>" viewport="<WxH>" -->` as line 1.
- "add <Component> as a starting point" → add the `@startingPoint …` JSDoc tag to the props interface in its `.d.ts`. Without a tag, the compiler ignores the file for starting points.

After any edit, recompile (above), then run the **read-only design-system checker** to confirm the project is usable by consuming projects — it reports what the compiler found (namespace, components, cards, starting points, tokens, fonts) and any issues, and writes nothing:

```
node <skill>/scripts/check-design-system.mjs designs/<project>
```

To run it as an isolated read-only subagent (recommended after a batch of edits), launch it with the prompt at [`../agents/design-system-checker.md`](../agents/design-system-checker.md) — see your harness reference (`references/<harness>.md`) for the exact launch tool. Fix what it reports and run again until clean.
