---
name: "generate-images"
description: "Generate images\nDetect an image backend and generate raster art, icons, illustrations, and infographics"
---
# Generate images

Render original raster images — illustrations, icons, hero/section art, mascots and characters, textures, and genuine data infographics — when a design lands better with a real picture than a placeholder. This is the single source of truth for **how to detect and invoke an image backend**; every flow (decks, mobile prototypes, hi-fi mockups, docs, animations, "something cool") points here instead of repeating the rule. It does not decide *whether* a flow wants imagery — the calling flow already decided; this resolves the backend and runs it.

## Generate only when it helps

Imagery is opt-in, not reflexive.
- Generate when content earns a picture: a conceptual metaphor, a hero/section image, a mascot/character to thread through a design, an app icon, a texture, or a genuine infographic.
- **Always offer a "none / minimal" path.** Fold one question into the flow's opening clarifying round — whether to add imagery and in what style — recommending a direction from the source material + chosen aesthetic / brand. If the content clearly won't benefit (dense data UI, terse internal review, explicit "keep it minimal"), don't ask — just proceed without.
- A clean placeholder beats a bad generated attempt. Generate only when it genuinely helps.

## Divide the labor

Modern image backends render text reliably now — including Chinese / CJK. Don't avoid text or shrink labels out of fear: text-rich genuine infographics — headings, labels, callouts, Chinese copy — are a good use of generation. Route to clean HTML/CSS by editability and exactness, not because raster "can't do text": anything that must stay live-editable, selectable, pixel-exact, or data-bound — tables a user will edit, exact financial figures, charts bound to numbers, dense small print — belongs in HTML/CSS. An infographic's narrative text and labels don't need that kind of exactness — generate them. Otherwise reserve generation for what raster is good at: conceptual scenes, characters/mascots, hero and section art, textures, and genuine infographics. Keep one shared style/identity block across all generated images in a project so look and character stay consistent.

## Detect a backend

Resolve the backend once, in this order:

1. **Current-request override** — if the user names a backend in this message, use it.
2. **Saved preference** — if your harness config sets a preferred image backend that is available right now, use it. (Absent = `auto`; this skill ships no preference file of its own, so this branch applies only when the host provides one.)
3. **Auto-select** — inspect your available-skills / tool inventory, in order:
   - **Codex `imagegen`** — if a skill named `imagegen` is listed, you are in Codex; it is the official raster backend and outranks any non-native skill. Invoke via the `Skill` tool.
   - **Other runtime-native image tool** (e.g. a `GenerateImage` / `image_generate` tool in your tool list) — use it the same way; if it lacks an aspect-ratio parameter, state the target dimensions/ratio in the prompt text, and move the output file into the project afterward.
   - Otherwise, an installed **image-generation skill** in your available-skills list (e.g. `baoyu-image-gen`: general raster generation — illustration, scene, character, mascot, hero/section art) — use it.
4. **None available** — tell the user and ask how to proceed. Do not silently fall back.

Concrete tool names (`imagegen`, `GenerateImage`, `image_generate`, `baoyu-image-gen`) are examples — substitute the local equivalent under the same rule.

## Invoke the chosen backend

- **Codex `imagegen`** — `Skill(skill: "imagegen", args: { prompt: <prompt-file content>, output: <imgs/NN-….png>, aspect_ratio: <ratio> })`.
- **Other native image tool** — follow its parameter schema: put dimensions / aspect ratio where it accepts them (or in the prompt text), then move the file from any tool-managed location into the project.
- **Installed image-generation skill** — follow the skill's own invocation doc (e.g. `baoyu-image-gen`: `bun skills/baoyu-image-gen/scripts/main.ts --promptfiles <prompts/NN-….md> --image <imgs/NN-….png> --ar <ratio>`). General raster generation — illustration, scene, character, mascot, hero/section art.

## Hard rules

- **Prompt file first.** Before invoking any backend, write each image's full, final prompt to `prompts/NN-{type}-[slug].md`. The file is the reproducibility record and lets you switch backends without rewriting the prompt.
- **Never substitute SVG, HTML, or canvas** for a raster image you decided to generate. If you can't resolve a backend, fall through to step 4 and ask — do not emit `<svg>` or CSS/HTML art as a stand-in. This holds even for "diagram-like" content; the caller already decided it wants a raster.
- **Get text right, don't paint over it.** Text usually renders fine — including Chinese; to nail it, put the exact strings (the exact characters) in the prompt so the backend has them verbatim. Only if a label still comes out wrong, regenerate from a corrected, more-explicit prompt — don't patch the bitmap.

## Output & placement

- Save kept images inside the project (`designs/<project>/imgs/`), with prompt files in `designs/<project>/prompts/`, so deliverables stay self-contained. Some flows have their own convention (a mobile prototype's icon is `icon.png` in the project root) — follow the calling flow.
- Place images on white or contrasting areas; full-bleed art aspect-fills, screenshots / diagrams aspect-fit. **View each generated file and verify it loaded** before finishing.
- The HTML page that embeds the images is the recorded asset (`scripts/record-asset.mjs`); the raster files themselves are ordinary project files referenced by it — not separately recorded.

## Cross-harness

Resolve "ask the user", "preview / screenshot", and "show the result" via your harness reference (`references/claude.md` / `references/codex.md`). Backend availability is harness-specific — Codex → native `imagegen`; Claude Code / other → an installed image-generation skill or native tool from the detection step (else ask). The detection step resolves it; don't assume a tool exists.
