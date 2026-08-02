# Claude Code tools — reference

The harness-specific tools `system-prompt.md` relies on, for when you are running inside **Claude Code**. The main prompt only names capabilities ("ask the user", "preview", "screenshot", "debug"); this doc resolves each capability to a concrete Claude Code tool. Generic tools (`Bash`, `Read`/`Write`/`Edit`/`Glob`, `gh`) are the same everywhere and aren't covered here.

**Capability-first rule.** Claude Code sessions differ: optional tools (`AskUserQuestion`, `SendUserFile`, a preview MCP) may or may not be present. For every capability below, **check your actual tool list first — if the named tool is there, use it; otherwise use the stated fallback.** Never call a tool you can't see in your tool list, and never invent one.

## Web tool → Claude Code capability map

The upstream prompt references claude.ai web tools that do not exist in Claude Code. Substitute as follows everywhere — prose and code alike:

| Web tool | Claude Code equivalent |
|---|---|
| `questions_v2` | If `AskUserQuestion` is in your tool list, use it; otherwise a concise numbered list of questions in chat — see "Clarifying questions" below |
| `done`, `fork_verifier_agent` | Surface the deliverable (below) + an `Agent` subagent (prompt: [`../agents/fork-verifier-agent.md`](../agents/fork-verifier-agent.md)) for thorough checks — see "Verification & debug" |
| `write_file` (and its `asset:` param) | `Write` — drop the "asset review pane" concept entirely |
| `copy_files` | `Bash cp` |
| `read_file`, `list_files`, `view_image` | `Read` (it renders images too — but run the vision probe first, below), `Glob` / `Bash ls`, `Grep` |
| `show_to_user` | If `SendUserFile` is in your tool list, use it with the file path; otherwise give the **absolute file path** plus the served `http://<name>.localhost/...` URL so the user opens the live result themselves — see "Showing files & preview" |
| `eval_js`, `eval_js_user_view`, `run_script` | `Bash`; for in-page JS, your browser tooling's eval (preview MCP `preview_eval` if present, else the `agent-browser` skill) |
| `web_fetch`, `web_search` | `WebFetch`, `WebSearch` |
| hosted starter-component copy tool | `Bash cp <skill-dir>/starter-components/<file> designs/<project>/` (or `Read` + adapt) |
| `invoke_skill("X")` / `invoke the "X" skill` | `Read` the matching `built-in-skills/<file>.md` |
| hosted PPTX / video export tools | Local CLIs bundled with this skill — see "Exporting to PPTX" / "Exporting to video" below |
| `/projects/<projectId>/<path>` | ordinary filesystem paths (relative to cwd, or absolute) |

## Clarifying questions

If `AskUserQuestion` is available in your tool list, use it (it returns answers inline; batch a focused round, follow up if needed). If it is not — common in this environment — ask by posting a **concise numbered list of questions in chat**, with each question's options as short bullets, then end your turn and wait for the user's reply. For a large new project, ask a focused round and follow up with another round if you need more.

- A remembered preference may be offered as a *suggested* default inside a question, but the user still confirms.
- The project-setup prompts — **where to save** the project and **which design system(s)** to use (none / one / several; see [`use-design-system.md`](../built-in-skills/use-design-system.md)) — are asked the same way, as list items with options.

## Showing files & preview

Reading a file does NOT show it to the user. To surface a deliverable: if `SendUserFile` is in your tool list, call it with the file path (works for any file type); **otherwise give the user the absolute file path and the served URL** — that is the normal delivery in this environment.

**For final design/prototype deliverables, treat the preview as part of delivery, not only private validation.** Claude Code has no shared, user-visible browser to flip on, so make the result visible by handing it off: surface the file (as above), give the served `http://<name>.localhost/<project>/<file>.html` URL so the user can open and interact with the live prototype in their own browser, and — if the vision probe has passed (below) — surface a final screenshot inline. Do this after verification, unless the user asked you not to.

To open a prototype in a browser — whether for the user to interact with or for you to preview/screenshot it — **always serve it over HTTP and load the `http://<name>.localhost/<project>/<file>.html` URL; do not open the HTML directly from `file://`.** A multi-file prototype (an HTML entry that loads `<script type="text/babel" src="…jsx">` components) only works over HTTP — the browser blocks cross-origin local script reads — and self-contained single files go through the same served URL so preview and screenshots stay consistent.

Serve the whole `designs/` directory once (one route for all projects) and reuse it — `nsl serve` inside a tmux session, exactly as described in `system-prompt.md` → "Verification":

```bash
NAME="$(basename "$PWD" | tr '.' '-')-designs"
SESSION="$NAME-$(echo -n "$PWD" | md5sum | cut -c1-6)"
if ! tmux has-session -t "$SESSION" 2>/dev/null; then
  tmux new-session -d -s "$SESSION"
  tmux send-keys -t "$SESSION" "nsl serve --list --name $NAME designs" Enter
fi
nsl list   # confirm the route and URL
```

`--list` gives `http://<NAME>.localhost/` a browsable directory index of all projects. Check server output with `tmux capture-pane -t "$SESSION" -p`; stop it with `tmux send-keys -t "$SESSION" C-c` (never kill by port).

## Vision input probe (before reading any image)

Some Claude Code sessions run on models/providers that reject image input. Probe **once per session**, before the first action that would put image bytes into the conversation (`Read` on a PNG/JPG/WebP, a screenshot inspection, or a subagent asked to judge a screenshot):

1. Resolve the committed probe image: `<skill-dir>/agents/assets/vision-probe.png`.
2. Spawn an `Agent` subagent with the prompt in [`../agents/vision-probe-agent.md`](../agents/vision-probe-agent.md), passing only that absolute path (same model/provider as this session — the default). The probe is intentionally isolated: a provider that rejects images should fail inside the disposable subtask.
3. Treat only an exact final response of `VISION_OK` as image support. Anything else means **non-visual mode** for the rest of the session: don't `Read` raster images or pull screenshots into the model; still write screenshot files to disk and report their paths, and verify with the text/DOM checks below. Tell the user visual review was skipped.

## Verification & debug

When the deliverable is ready, surface it (see "Showing files & preview"), preview it over the served URL, confirm it loads cleanly, and fix any errors before finishing. The user should always land on a view that doesn't crash.

Preview flow (the nsl server from above is already running in tmux):

1. Open `http://<NAME>.localhost/<project>/<file>.html` with your browser tooling — **if preview MCP tools (`preview_*`) are in your tool list use them; otherwise use the `agent-browser` skill** (it is the standard path here).
2. Check the browser console for JS errors (`preview_console_logs`, or agent-browser's console command).
3. If the vision probe passed, screenshot to inspect layout (`preview_screenshot`, or agent-browser's screenshot command); fix errors and surface again. In non-visual mode, verify with text/DOM evidence instead: the URL loads, console has no blocking errors, expected root elements exist, the main container has non-zero size (`document.body.innerText.trim()`, `document.querySelectorAll('*').length`, key `getBoundingClientRect()` values via the browser tooling's eval).
4. Hand off: surface the file, the final screenshot (visual mode only), and the served URL.

For thorough or directed checks ("screenshot and check the spacing"), spawn an `Agent` subagent to load the file, take screenshots, probe the JS, and report back — useful when you don't want to clutter your own context. Use the prompt in [`../agents/fork-verifier-agent.md`](../agents/fork-verifier-agent.md) (pass the project dir, the file path(s), the served URL, and the image-input status from the vision probe).

**Preview-harness gotchas (React + Babel prototypes)** — quirks of agent-driven browsers, not your code:

- Synthetic clicks may not reach React's delegated `onClick` (React 18 `createRoot` delegates from the root container). If a click tool doesn't fire the handler, use in-page eval: find the node, read its `__reactProps$*` key, and call `el[propKey].onClick({stopPropagation(){},preventDefault(){}})`. Real browser clicks are fine; this is harness-only.
- Global `keydown` listeners DO fire via `window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true,bubbles:true}))` — use this to test ⌘K / Esc / shortcuts.
- Screenshot surfaces can desync after an in-page `location.reload()` or repeated custom resizes. Re-set the viewport size (e.g. `preview_resize` to a preset then back, or agent-browser's viewport command) and prefer `location.href = …` over `reload()`.

**If no browser tooling is available at all,** fall back by file type. A fully self-contained single file can be opened with `open <path>` (`file://`); a multi-file prototype (`<script src="…jsx">`) will NOT load over `file://` and needs HTTP — make sure the nsl designs server is running and give the user the URL, or spawn an `Agent` to verify. Never leave the user on a view that silently failed to load its components.

## Design-system checker subagent

Only when **authoring a design system** — the compiler (`compile-design-system.mjs`) and checker (`check-design-system.mjs`) commands and the full flow live in [`design-system-authoring-guide.md`](../built-in-skills/design-system-authoring-guide.md). Both are plain `Bash` `node <skill>/agents/…` calls and run inline. Harness-specific bit: to run the read-only checker as an **isolated subagent**, spawn an **`Agent`** (any read-capable type, e.g. `Explore` or `general-purpose`) with the prompt in [`../agents/design-system-checker.md`](../agents/design-system-checker.md), passing the project directory and this skill's `agents/` path — it only runs `check-design-system.mjs` and relays output; it must not edit files or compile.

When **consuming a design system** in a regular project, the importer (`import-design-system.mjs`) is likewise a plain `Bash` `node <skill>/agents/import-design-system.mjs <dsDir> <projectDir> [--primary]` call that runs inline — full flow in [`use-design-system.md`](../built-in-skills/use-design-system.md). No subagent is needed.

## Exporting to PPTX (the gen-pptx CLI)

There is no hosted PPTX tool here — both export docs ([`export-as-pptx-editable.md`](../built-in-skills/export-as-pptx-editable.md), [`export-as-pptx-screenshots.md`](../built-in-skills/export-as-pptx-screenshots.md)) run a local CLI under this skill that drives a headless Chromium (Playwright) and writes the `.pptx` to disk. The input JSON is **exactly** the object those docs define (`mode`/`width`/`height`/`slides`/`hideSelectors`/`resetTransformSelector`/`googleFontImports`/`fontSwaps`/`filename`); this section only covers how to invoke it. **Default to the editable export** (omit `mode`, or set `"mode":"editable"`); pass `"mode":"screenshots"` only when the user explicitly wants pixel-perfect, non-editable image slides. Decks using the `data-anim` convention ([make-a-deck](../built-in-skills/make-a-deck.md) → *Animations*) export their builds as native PowerPoint animations automatically — no extra config.

**One-time setup** (skip if `agents/gen-pptx/node_modules` and `dist/` already exist):

```bash
cd <skill-dir>/agents/gen-pptx && npm install && npx playwright install chromium && npm run build
```

**Each export:**

1. **Serve the deck over HTTP** — the CLI needs an `http(s)` URL, not `file://`. Reuse the nsl `designs` server; the deck is then at `http://<name>.localhost/<project>/<file>.html`.
2. **Write the input object to a JSON file** (e.g. `/tmp/<project>-pptx.json`) — same schema as the export docs.
3. **Run the CLI:**

   ```bash
   node <skill-dir>/agents/gen-pptx/dist/cli.mjs --url <servedDeckUrl> --config <jsonPath> --out designs/<project>
   ```

   `--config -` reads the JSON from stdin. `--out` defaults to the cwd; pass the project dir so the `.pptx` lands beside the deck. The final path is `<out>/<filename>.pptx`.
4. **Read the printed JSON** (one line on stdout): `{ ok, file, slides, animations, bytes, flags: [{code, message}], warnings, speakerNotes }` — `animations` counts the `data-anim` builds written into the file. The `flags[].code` values are the diagnostics the export docs describe (`duplicate_adjacent`, `slide_size_mismatch`, `no_speaker_notes`, …) — interpret them per those docs and **do not relay the codes verbatim** to the user. `warnings` is a (usually empty) list of build-time strings — surface them in plain language only if non-empty. On failure the line is `{ ok: false, error }`. Exit code `0` = success (even with warning flags), `64` = usage/config error, `1` = runtime failure (a friendly setup hint prints to stderr if Playwright/Chromium is missing).

Then surface the `.pptx` (path; `SendUserFile` if available).

## Exporting to video (the gen-video CLI)

[`export-as-video.md`](../built-in-skills/export-as-video.md) runs a local CLI under this skill that drives a headless Chromium (Playwright), seeks the animation's timeline bridge frame-by-frame, and pipes PNG frames to **ffmpeg**. The input JSON is **exactly** the object that doc defines (`width`/`height`/`duration`/`fps`/`format`/`bridgeGlobal`/…); this section only covers how to invoke it.

**One-time setup** (skip if `agents/gen-video/node_modules` and `dist/` already exist):

```bash
cd <skill-dir>/agents/gen-video && npm install && npx playwright install chromium && npm run build
```

ffmpeg must also be on `PATH` (`apt install ffmpeg` on Debian/Ubuntu, `brew install ffmpeg` on macOS). The CLI preflights for it and prints a setup hint if it's missing.

**Each export:**

1. **Serve the animation over HTTP** — reuse the nsl `designs` server; the page is at `http://<name>.localhost/<project>/<file>.html`. The CLI appends the capture-mode query param itself.
2. **Write the input object to a JSON file** (e.g. `/tmp/<project>-video.json`). For a current `animations.jsx`/`animations-v3.jsx` Stage, `{ "width": 1920, "height": 1080, "filename": "…" }` is enough; for an older/hand-rolled timeline set `bridgeGlobal` (e.g. `"__ahe"`) and pass `hideSelectors` + `resetTransformSelector`.
3. **Run the CLI:**

   ```bash
   node <skill-dir>/agents/gen-video/dist/cli.mjs --url <servedUrl> --config <jsonPath> --out designs/<project>
   ```

   The final path is `<out>/<filename>.<mp4|webm|gif>`. Long high-fps exports take minutes (every frame is a real screenshot) — run a `startMs`/`endMs` sub-range to iterate, then the full range.
4. **Read the printed JSON**: `{ ok, file, frames, fps, duration, width, height, bytes, flags, warnings }`. Interpret `flags[].code` (`capture_mode_off`, `duplicate_frames`, `fonts_timeout`, `zero_duration`) per the export doc and **do not relay codes verbatim**. On failure: `{ ok: false, error }`. Exit codes as with gen-pptx.

Then surface the video (path; `SendUserFile` if available).
