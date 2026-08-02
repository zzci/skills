---
name: "save-as-standalone-html"
description: "Save as standalone HTML\nSingle self-contained file that works offline"
---
Export the current design as a single self-contained HTML file that works completely offline — no external dependencies, opens by double-click from `file://`.

## How it works

There is **no hosted bundler tool in this environment**. You do the inlining yourself with your normal file tools: read every resource the page references and embed it into one output file. A small Node one-liner per asset (base64 → data URI) keeps this mechanical.

## Step 1: Inventory every dependency

Copy the source HTML to the delivery name (a friendly human name, e.g. `My Deck.html`, in the project folder). Then read it — and every file it pulls in — and list ALL external references:

- `<script src=…>` — including the `_vendor/` React/ReactDOM/Babel runtime and any `<script type="text/babel" src="…jsx">` component files
- `<link rel="stylesheet" href=…>` and CSS `@import`
- `<img src>`/`srcset`, `<source>`, `<video>`/`<audio>`/`<track>` src, video `poster`, SVG `<image href>`/`<use href>`, favicons
- CSS `url(…)` in stylesheets and inline `style` attributes
- Resources referenced only as **strings in code**: `<img src={"./hero.png"} />`, `style={{ backgroundImage: … }}`, CSS-in-JS, `fetch()`/XHR of local data files, programmatically set audio/video sources
- Web-font `<link>`s to font CDNs (either inline the font files as data URIs, or swap to a system stack and say so)

Be thorough — missing even one resource means a broken image or missing asset in the final file.

Note: if the page calls a network API at runtime (e.g. a model API — see [claude-api-in-prototypes](claude-api-in-prototypes.md)), it cannot work fully offline. If that's core to the project, STOP and tell the user.

## Step 2: Inline everything

Work through the inventory:

1. **Scripts**: replace each `<script src="…">` with an inline `<script>…</script>` containing the file's contents, **in the original load order** (React → ReactDOM → Babel → your `.jsx` files as inline `<script type="text/babel">` blocks). Escape any `</script>` sequence inside the embedded code.
2. **Stylesheets**: replace each `<link rel="stylesheet">` / `@import` with an inline `<style>` block; then inline the `url(…)` references inside it.
3. **Binary assets** (images, fonts, audio, video): replace each reference with a `data:<mime>;base64,…` URI. Generate with e.g.
   ```bash
   node -e 'const f=process.argv[1];console.log(`data:image/png;base64,${require("fs").readFileSync(f).toString("base64")}`)' hero.png
   ```
   For code-referenced assets, update the string in the code the same way.
4. **Fetched data files**: embed the data as an inline `<script>` global (e.g. `window.__DATA = {…}`) and make the fetch fall back to it, or replace the fetch outright.

Keep large media in mind: a data-URI bundle grows ~33%; for video-heavy pages, warn the user about size before embedding.

## Step 3: Verify offline

Open the bundled file **from `file://`** (this is the one flow where `file://` is the point) with your harness's browser tooling — Claude Code: the `agent-browser` skill; Codex: the Browser plugin — and check:

- The console shows no errors and no network requests to missing local paths.
- All images/fonts render (no broken-image icons, no fallback fonts where brand fonts were inlined).

If anything is missing, fix the reference in the bundled file and re-check.

## Step 4: Deliver

Give the user the absolute path of the bundled file (and surface it with your harness's show-file capability if one is available). Say explicitly that it is fully self-contained and can be double-clicked, mailed, or dropped anywhere. Keep the original multi-file working version in the project — the bundle is a delivery artifact, not the editing source; re-run this export after further edits.
