# Claude Code tools — reference

The harness-specific tools `system-prompt.md` relies on, for when you are running inside **Claude Code**. The main prompt only names capabilities ("ask the user", "preview", "screenshot", "debug"); this doc gives the exact Claude Code tool, signature, and call pattern. Generic tools (`Bash`, `Read`/`Write`/`Edit`/`Glob`, `gh`) are the same everywhere and aren't covered here.

## Web tool → Claude Code tool map

The upstream prompt references Claude.ai web tools that do not exist in Claude Code. Substitute as follows everywhere — prose and code alike:

| Web tool | Claude Code equivalent |
|---|---|
| `questions_v2` | A concise numbered list of questions in chat (`AskUserQuestion` is disabled in this environment) — see "Clarifying questions" below |
| `done`, `fork_verifier_agent` | `SendUserFile` + the Claude Preview MCP; an `Agent` subagent (prompt: [`../agents/fork-verifier-agent.md`](../agents/fork-verifier-agent.md)) for thorough checks — see "Verification & debug" below |
| `write_file` (and its `asset:` param) | `Write` — drop the "asset review pane" concept entirely |
| `copy_files` | `Bash cp` |
| `read_file`, `list_files`, `view_image` | `Read` (it renders images too), `Glob` / `Bash ls`, `Grep` |
| `show_to_user` | `SendUserFile` (or `open <path>` for a self-contained file); for final deliverables also surface a screenshot and give the served `http://<name>.localhost/...` URL so the user can open and interact with the live result — Claude Code has no user-visible agent browser, so delivery is file + screenshot + URL (see "Showing files & preview") |
| `eval_js`, `eval_js_user_view`, `run_script` | `Bash`; the Claude Preview MCP `preview_eval` for in-page JS |
| `web_fetch`, `web_search` | `WebFetch`, `WebSearch` |
| `copy_starter_component` | `Bash cp starter-components/<file> designs/<project>/` (or `Read` + adapt) |
| `invoke_skill("X")` / `invoke the "X" skill` | `Read` the matching `built-in-skills/<file>.md` |
| `/projects/<projectId>/<path>` | ordinary filesystem paths (relative to cwd, or absolute) |

## Clarifying questions (chat list)

`AskUserQuestion` is **disabled** in this environment — never call it. Ask by posting a **concise numbered list of questions in chat**, with each question's options as short bullets, then end your turn and wait for the user's reply. For a large new project, ask a focused round and follow up with another round if you need more.

- A remembered preference may be offered as a *suggested* default inside a question, but the user still confirms.
- The project-setup prompts — **where to save** the project and **which design system(s)** to use (none / one / several; see [`use-design-system.md`](../built-in-skills/use-design-system.md)) — are asked the same way, as list items with options.

## Showing files & preview

To surface a deliverable, use `SendUserFile` with the file path (works for any file type — HTML, images, text). Reading a file does NOT show it to the user.

**For final design/prototype deliverables, treat the preview as part of delivery, not only private validation.** Claude Code has no shared, user-visible browser to flip on, so make the result visible by handing it off: `SendUserFile` the deliverable, surface a final screenshot (it renders inline in the transcript), and give the user the served `http://<name>.localhost/<project>/<file>.html` URL so they can open and interact with the live prototype in their own browser. Do this after verification, unless the user asked you not to.

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

## Verification & debug

When the deliverable is ready, surface it (`SendUserFile`), preview it over the served URL, confirm it loads cleanly, and fix any errors before finishing. The user should always land on a view that doesn't crash.

Preview flow (the nsl server from "Showing files & preview" is already running in tmux):

1. Open `http://<NAME>.localhost/<project>/<file>.html` with your browser tooling — the Claude Preview MCP (`preview_*` tools) when available, otherwise the `agent-browser` skill.
2. Check the browser console for JS errors (`preview_console_logs`, or the agent-browser console command).
3. Screenshot to inspect layout (`preview_screenshot`, or the agent-browser screenshot command). Fix any errors and surface it again.
4. When the deliverable is ready, hand off the result: `SendUserFile` the file, surface the final screenshot, and give the user the served URL so they can open and interact with it directly.

For thorough or directed checks ("screenshot and check the spacing"), spawn an `Agent` subagent to load the file, take screenshots, probe the JS, and report back — useful when you don't want to clutter your own context. Use the prompt in [`../agents/fork-verifier-agent.md`](../agents/fork-verifier-agent.md) (pass the project dir, the file path(s), and the served URL).

**Preview-harness gotchas (React + Babel prototypes)** — quirks of the Claude Preview MCP, not your code:

- `preview_click` does not reach React's delegated `onClick` (React 18 `createRoot` delegates from the root container). To fire a handler, use `preview_eval`: find the node, read its `__reactProps$*` key, and call `el[propKey].onClick({stopPropagation(){},preventDefault(){}})`. Real browser clicks are fine; this is harness-only.
- Global `keydown` listeners DO fire via `window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true,bubbles:true}))` — use this to test ⌘K / Esc / shortcuts.
- The screenshot surface desyncs after an in-page `location.reload()` or repeated custom resizes (the window renders tiny in a corner). Resync via `preview_resize` to a preset then back to your size; prefer `location.href = …` over `reload()`.

**If no browser tooling is available at all,** fall back by file type. A fully self-contained single file can be opened with `open <path>` (`file://`); a multi-file prototype (`<script src="…jsx">`) will NOT load over `file://` and needs HTTP — make sure the nsl designs server is running (see "Showing files & preview") and give the user the URL, or spawn an `Agent` to verify. Never leave the user on a view that silently failed to load its components.

## Design-system checker subagent

Only when **authoring a design system** — the compiler (`compile-design-system.mjs`) and checker (`check-design-system.mjs`) commands and the full flow live in [`design-system-authoring-guide.md`](../built-in-skills/design-system-authoring-guide.md). Both are plain `Bash` `node <skill>/agents/…` calls and run inline. Harness-specific bit: to run the read-only checker as an **isolated subagent**, spawn an **`Agent`** (any read-capable type, e.g. `Explore` or `general-purpose`) with the prompt in [`../agents/design-system-checker.md`](../agents/design-system-checker.md), passing the project directory and this skill's `agents/` path — it only runs `check-design-system.mjs` and relays output; it must not edit files or compile.

When **consuming a design system** in a regular project, the importer (`import-design-system.mjs`) is likewise a plain `Bash` `node <skill>/agents/import-design-system.mjs <dsDir> <projectDir> [--primary]` call that runs inline — full flow in [`use-design-system.md`](../built-in-skills/use-design-system.md). No subagent is needed.
