---
name: "create-design-system"
description: "Create design system\nSkill to use if user asks you to create a design system or UI kit"
---
The user wants you to **create a design system or UI kit**. Design systems are folders on the file system containing typography guidelines, colors, assets, brand style and tone guides, CSS styles, and React recreations of UIs, decks, etc. They give design agents the ability to create designs against a company's existing products and brand.

**The canonical instructions live in [`design-system-authoring-guide.md`](design-system-authoring-guide.md)** — the compiler/checker contract ("what the compiler looks for"), the full build flow (readme, tokens, foundation cards, components, UI kits, starting points, SKILL.md, preview), and source-import mechanics. Read it and follow it; this file only adds the rules below.

Rules that gate the component work:

- **When a concrete source defines the inventory** (a mounted `.fig` file, a component library in an attached codebase), that inventory IS the component list — build exactly the families the source defines, nothing more. Do not add primitives a design system "usually" has (Toast, Avatar, Tabs, …) when the source doesn't define them; an invented component is one consumers will trust and designers won't recognize. If an addition is genuinely needed (e.g. an Icon wrapper for a glyph set), list it in `readme.md` under "Intentional additions" with a one-line reason. Only when NO source defines components (brand-guidelines-only or from-scratch runs) author a standard set sized to the brand's needs.
- **Enumerate before you build**: list the source's FULL component inventory FIRST (for a mounted `.fig`, read `/METADATA.md`'s "Component families" section), put every family on your todo list, and build ALL of them, tracking progress against that list. Do NOT stop at a "core subset". If you cannot finish, end your turn by reporting exactly which families remain unbuilt and ask the user whether to continue — never end silently incomplete.
- **The attached kit is the ground truth.** When its values differ from the published conventions of a component library it resembles (shadcn, MUI, etc.), the kit wins. Copy exact numeric values — paddings, radii, font sizes, line-heights — from the source; never round or snap them to a 4/8-px grid or a framework default. If the kit says 5px, write 5px, not 4px.
- Cover every component family the source defines — coverage means the full enumerated inventory, not a hand-picked subset. Within a UI kit screen you may abbreviate repeated content (3 rows standing in for 30 identical ones), but never skip a component family.
- If reads start failing partway through (a source becomes inaccessible), stop and report exactly what you did and did not read — never infer or invent component names, structures, or values for content you could not read.

When done, finish exactly as the authoring guide says: compile + checker clean, `preview.html` built, then no summary — just CAVEATS and a clear, bold ask for the user to help you iterate.
