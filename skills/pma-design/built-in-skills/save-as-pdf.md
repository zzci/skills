---
name: "save-as-pdf"
description: "Save as PDF\nPrint-ready PDF export"
---
# Save as PDF

Export the current HTML design as a print-friendly HTML file optimized for PDF export.

## Steps

1. **Read the current HTML design file** to understand its structure and content.

2. **Create a print-ready HTML file**. The print file path is the source path with `-print` inserted before the extension — same directory, same basename. If the source is `slides/deck.html`, write `slides/deck-print.html`; if the source is `web/index.html`, write `web/index-print.html`. **Do NOT** use the deck title or project name as the filename, and **do NOT** write to the project root if the source is in a subdirectory — any change in directory depth breaks every relative URL (`@font-face` `src: url(...)`, `<img src>`, `<link href>`, CSS `background: url(...)`) and the print tab shows missing images and system-font fallbacks.

   - If the source already uses `<doc-page>` or `<deck-stage>`, preserve that
     component and its print ownership. Do not add a competing `@page` rule;
     copy the component beside the print file and let its built-in print
     geometry produce the pages.
   - Otherwise add `@media print` styles with appropriate rules:
     - `@page { size: landscape; margin: 0.5cm; }` for 16:9 slide-like proportions
     - Remove background colors that won't print by default (or use `-webkit-print-color-adjust: exact` to force them)
   - Use CSS page break properties:
     - `break-before: page` to start new pages
     - `break-inside: avoid` to prevent splitting elements across pages
     - `break-after: page` where appropriate
   - Convert scroll-based or interactive layouts to static paged layouts
   - Remove hover states and `overflow: hidden` clipping; freeze animations/transitions at their end state (recipe below)
   - Remove any JavaScript interactivity that doesn't make sense in print
   - Preserve all visual content — images, SVGs, colors, typography

   **Jump animations to their end state.** Do NOT use `animation: none` (that reverts fade-ins to the hidden base). Instead add to `@media print`:
   ```css
   *, *::before, *::after {
     animation-delay: -99s !important; animation-duration: .001s !important;
     animation-iteration-count: 1 !important; animation-fill-mode: both !important;
     animation-play-state: running !important; transition-duration: 0s !important;
   }
   ```
   For `<deck-stage>` decks, also set `data-deck-active` on **every** direct-child slide (not just the current one) so `[data-deck-active]`-keyed entrance styles resolve on every page. deck-stage.js already lays out one slide per page at print, so with the CSS above and the attribute set, the copy is print-ready. `data-anim` builds need nothing extra, but be clear about what that means: **animations do not play in a PDF** — every page shows the slide's finished (fully-built) layout. Their runtime hiding is `@media screen`-scoped, so print/PDF lands on that finished state automatically; animations only play in the live HTML deck, so point the user at the served deck URL when motion matters.

   For `.dc.html` Design Component files, keep the `<script src="support.js">` reference and the `<x-dc>` template intact — do NOT flatten the rendered output into static HTML. The runtime mounts React at load time, so layer your `@media print` CSS on top of the existing document and let the component render itself in the print tab.

3. **Test the file** by previewing it per your selected harness reference, then make sure there are no JS errors. No need to screenshot unless asked.

4. **Print it to PDF with a headless browser.** There is no hosted print tool in this environment — render the PDF yourself from the served URL (the shared nsl `designs` server; never `file://`):
   - **Preferred:** your harness's browser tooling (Claude Code: the `agent-browser` skill; Codex: the Browser plugin's Playwright API) — navigate to `http://<name>.localhost/<project>/<file>-print.html`, wait for fonts/JS to settle (`document.fonts.ready` plus a ~500ms buffer; Babel JSX must be parsed first), then use its print/PDF command to write `designs/<project>/<name>.pdf`.
   - **Fallback:** a locally installed headless Chromium, e.g. `chromium --headless --print-to-pdf="designs/<project>/<name>.pdf" --no-pdf-header-footer "http://<name>.localhost/<project>/<file>-print.html"` (add `--virtual-time-budget=5000` so fonts and scripts finish before capture).
   - **Last resort (no browser tooling at all):** tell the user to open the served print URL in their own browser and save as PDF from the print dialog. In that case do NOT add an auto-`window.print()` call unless the user wants it — it fires on every open.

5. **Verify and deliver.** Open the generated PDF's first pages (or check its page count/size) to confirm pagination and backgrounds survived, then give the user the absolute path of the `.pdf` (and surface it with your harness's show-file capability if one is available).

## Important Notes

- The goal is a PDF that matches the browser's print rendering of the design
- Maintain visual fidelity — the PDF should look as close to the original design as possible
- For slide decks or multi-section designs, each slide/section should be on its own page
- The `-print.html` is plumbing for the print capture, not a deliverable — the `.pdf` is what you hand over. Don't present the `-print.html` file itself; its relative asset paths only resolve via the served `designs/` URL and break when opened standalone.
