# BKD REST API Reference

Use this file when the `bkd` skill needs exact BKD routes, payload shapes, or
operational examples.

The original edge-case behavior documented here was verified against BKD
v0.0.90. Process control, status transitions, follow-up guards, logs-filter
entry types, `/changes` and `/processes/capacity` response shapes, and cron
listing/auto-pause behavior were re-verified against BKD v0.1.0 source at
commit `93df96a` and a live v0.1.0 server. Read `/health` first and re-verify
version-sensitive behavior after a server upgrade.

## Table of Contents

- [Setup](#setup)
- [Sending Request Bodies Safely](#sending-request-bodies-safely)
- [Health and Status](#health-and-status)
- [Engines](#engines)
- [Processes and Capacity](#processes-and-capacity)
- [Projects](#projects)
- [Issues](#issues)
- [Issue Execution](#issue-execution)
- [Issue Changes](#issue-changes)
- [Issue Logs](#issue-logs)
- [Worktrees](#worktrees)
- [Cron Jobs](#cron-jobs)
- [Other Endpoint Groups](#other-endpoint-groups)


## Setup

```bash
BKD_URL="http://your-host:port/api"
set -o pipefail

bkd_check() {
  jq -e 'if type == "object" and has("success") then
    if .success == true then . else error(.error // "BKD request failed") end
  else . end'
}
```

Successful BKD API calls normally use one of these envelopes:

- Success: `{ "success": true, "data": ... }`
- Failure: `{ "success": false, "error": "..." }`

Some HTTP validation failures return no JSON envelope. Always use
`curl -sS --fail-with-body`, check its exit status, then assert
`.success == true` before consuming `.data`. Never depend on `curl -s | jq` as
an error check. The examples use `set -o pipefail` plus `bkd_check` when piping
responses; together they fail on both HTTP errors and `{success:false}` while
still accepting successful endpoints whose payload has no envelope.

## Sending Request Bodies Safely

Issue prompts and other free-form text contain quotes, `$`, backticks, and
newlines that get mangled when inlined into `-d '{...}'` (shell quoting and JSON
escaping fight each other). **Never inline free-form text** — this is referred
to throughout the skill as **the never-inline rule**. Write the text to a
temp file verbatim, build the JSON body with `jq` (it escapes correctly), and
POST the file with `--data-binary @file`:

```bash
# 1. Write the prompt as plain text — no escaping needed
cat > /tmp/bkd-prompt.txt <<'PROMPT'
Implement the change described above.
"Quotes", $vars, `backticks`, and multiple lines are all safe here.
PROMPT

# 2. Assemble a valid JSON body from the text file
jq -n --rawfile prompt /tmp/bkd-prompt.txt '{prompt: $prompt}' > /tmp/bkd-body.json

# 3. POST the file — never an inline -d string
RESPONSE=$(curl -sS --fail-with-body -X POST "$BKD_URL/projects/{projectId}/issues/{issueId}/follow-up" \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/bkd-body.json) || exit 1
printf '%s\n' "$RESPONSE" | jq -e '.success == true' >/dev/null || exit 1
```

Add more fields with extra `jq` args (`--rawfile` for file-sourced text, `--arg`
for short strings, `--argjson` for booleans/objects):

```bash
jq -n --rawfile prompt /tmp/bkd-prompt.txt \
      --arg engine "claude-code" --arg model "claude-sonnet-4-6" \
  '{engineType: $engine, prompt: $prompt, model: $model}' > /tmp/bkd-body.json
```

Fixed-value bodies with no free-form text (e.g. `{"statusId":"working"}`,
`{"id":"abc","sortOrder":"a5"}`) are safe to inline with `-d`. The examples below
use inline `-d` only for such fixed payloads; apply the file pattern above
whenever a body carries a prompt, title, description, or any user-supplied text.

## Health and Status

```bash
curl -sS --fail-with-body "$BKD_URL/health" | bkd_check    # { status, version, commit, db, timestamp }
curl -sS --fail-with-body "$BKD_URL/status" | bkd_check    # detailed server status
```

## Engines

An engine (`claude-code`, `codex`, `gemini`, ...) is the CLI that executes an
issue. `POST .../execute` requires an `engineType`, so use these to discover what
is installed and which models are available before dispatching.

```bash
# Detected engines + their models (installed, version, authStatus)
curl -sS --fail-with-body "$BKD_URL/engines/available" | bkd_check

# Per-engine model list, profiles, and current engine settings
curl -sS --fail-with-body "$BKD_URL/engines/{engineType}/models" | bkd_check
curl -sS --fail-with-body "$BKD_URL/engines/profiles" | bkd_check
curl -sS --fail-with-body "$BKD_URL/engines/settings" | bkd_check
```

## Processes and Capacity

Check capacity before starting more issue executions.

```bash
curl -sS --fail-with-body "$BKD_URL/processes/capacity" | bkd_check   # capacity summary (below)
curl -sS --fail-with-body "$BKD_URL/processes" | bkd_check            # list active engine processes
```

Response fields:

- `summary.totalActive`
- `summary.byState`
- `summary.byEngine`
- `summary.byProject`
- `maxConcurrent` — `0` means unlimited
- `availableSlots` — integer, or `null` when `maxConcurrent` is `0`
- `canStartNewExecution` — boolean; the only field safe to gate on

Gate on `canStartNewExecution`, not `availableSlots`: `jq -e '.data.availableSlots'`
exits non-zero on `null` and aborts a pipefail script on an unlimited server.
The limit is enforced server-side (`engine:maxConcurrentExecutions`); a spawn
over the limit fails with `Concurrency limit reached` (see
[Update issue](#update-issue) for the recovery path).

Force-terminate the engine process for one issue:

```bash
curl -sS --fail-with-body -X POST "$BKD_URL/processes/{issueId}/terminate" | bkd_check
```

This is the process-monitor (project-agnostic) route. It is **equivalent** to the
project-scoped [`POST .../issues/{issueId}/terminate`](#restart-cancel-terminate-or-clear-session)
— both force-kill the same process and return `{ issueId, status: "terminated" }`.
In orchestration, prefer the project-scoped command since you already hold the
`projectId`; reach for this one from a global "what's running" view.

## Projects

### List projects

```bash
curl -sS --fail-with-body "$BKD_URL/projects" | bkd_check
```

### Get project

```bash
curl -sS --fail-with-body "$BKD_URL/projects/{projectId}" | bkd_check
```

### Create project

```bash
jq -n --arg name "my-project" --arg desc "Optional description" \
      --arg dir "/path/to/workspace" --arg repo "https://github.com/example/repo" \
  '{name: $name, description: $desc, directory: $dir, repositoryUrl: $repo}' > /tmp/bkd-body.json
curl -sS --fail-with-body -X POST "$BKD_URL/projects" \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/bkd-body.json | bkd_check
```

Useful fields (only `name` is required):

- `name`
- `alias`
- `description`
- `directory`
- `repositoryUrl`
- `systemPrompt`
- `envVars`
- `defaultEngine`
- `defaultModel`

### Lifecycle

```bash
curl -sS --fail-with-body -X POST "$BKD_URL/projects/{projectId}/archive" | bkd_check
curl -sS --fail-with-body -X POST "$BKD_URL/projects/{projectId}/unarchive" | bkd_check
curl -sS --fail-with-body -X DELETE "$BKD_URL/projects/{projectId}" | bkd_check   # soft-delete

# Reorder a project in the board
curl -sS --fail-with-body -X PATCH "$BKD_URL/projects/sort" \
  -H 'Content-Type: application/json' \
  -d '{"id":"{projectId}","sortOrder":"a5"}' | bkd_check
```

## Issues

All issue routes are project-scoped:

`/api/projects/{projectId}/issues/...`

### Create issue

Prefer the safe first-execution flow: create in `todo`, queue the full
instruction with a follow-up, then move it to `working`. That actual transition
consumes the queued instruction and starts the initial execution.

```bash
jq -n --arg title "fix auth bug" --argjson useWorktree true \
  '{title: $title, statusId: "todo", useWorktree: $useWorktree}' > /tmp/bkd-body.json
curl -sS --fail-with-body -X POST "$BKD_URL/projects/{projectId}/issues" \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/bkd-body.json | bkd_check
```

Useful fields:

- `title` — also stored as the issue `prompt`; the first execution sends
  `systemPrompt + title + queued follow-ups`, so keep it a meaningful one-liner
- `statusId`: `todo|working|review|done` (`working`/`review` auto-execute at
  create time with only the title as prompt; `review` is downgraded to `working`)
- `engineType`
- `model`
- `useWorktree`
- `keepAlive` — exempts an idle process from the 30-minute idle kill
- `tags`
- `permissionMode`

### List or get issues

```bash
curl -sS --fail-with-body "$BKD_URL/projects/{projectId}/issues" | bkd_check
curl -sS --fail-with-body "$BKD_URL/projects/{projectId}/issues/{issueId}" | bkd_check
```

Before treating an issue as completed, inspect its `sessionStatus`
(`pending|running|completed|failed|cancelled|null`) together with `statusId`,
commits, and the last assistant turn. `statusId` alone cannot distinguish a
clean completion from a killed turn. The issue object has no `turnInFlight`
field; that flag lives on `/processes` entries.

### Update issue

```bash
curl -sS --fail-with-body -X PATCH "$BKD_URL/projects/{projectId}/issues/{issueId}" \
  -H 'Content-Type: application/json' \
  -d '{"statusId":"working"}' | bkd_check
```

`statusId` is lifecycle metadata with two transition side effects in v0.1.0:

- An actual non-`working` -> `working` transition asynchronously starts the
  initial execution (when `sessionStatus` is `null`/`pending`) or flushes queued
  messages as a follow-up (when it is `completed`/`failed`/`cancelled`). It does
  nothing when `sessionStatus` is `running`. PATCHing an issue that is already
  `working` does not wake it. For an eligible existing issue with no queued
  input, send a follow-up instead of depending on the fire-and-forget hook. For
  a new `todo` issue, queue the full input before the transition as described
  above.
- An actual transition to `done` cancels any active session for that issue.
  Delete any cron that targets the issue first; a later `issue-follow-up` run
  against a `done` issue fails and eventually auto-pauses the job.

The `working` hook is fire-and-forget: the PATCH returns `success:true` even if
the spawn later fails (concurrency limit, workspace check, engine spawn error).
On failure the issue stays `working` with `sessionStatus:"failed"` and the
queued message is restored to pending. Recovery: re-read the issue after the
PATCH and require `sessionStatus` in `pending|running`; if it is `failed`, POST
any follow-up — a `working` issue with pending messages flushes them all
immediately (merged) into a fresh process. Do not PATCH `working` again (no-op)
and do not `/restart` (it replays only the title prompt).

Common fields:

- `title`
- `statusId`
- `tags` with `null` to clear tags
- `keepAlive`
- `isPinned`
- `sortOrder`

### Bulk update

Update many issues in one call — handy for moving a batch of subtasks at once.
Each entry needs `id`; `statusId` and `sortOrder` are optional (max 1000).

```bash
curl -sS --fail-with-body -X PATCH "$BKD_URL/projects/{projectId}/issues/bulk" \
  -H 'Content-Type: application/json' \
  -d '{"updates":[{"id":"abc12345","statusId":"working"},
                  {"id":"def67890","statusId":"review"}]}' | bkd_check
```

### Duplicate issue

```bash
curl -sS --fail-with-body -X POST "$BKD_URL/projects/{projectId}/issues/{issueId}/duplicate" | bkd_check
```

### Delete issue

```bash
curl -sS --fail-with-body -X DELETE "$BKD_URL/projects/{projectId}/issues/{issueId}" | bkd_check
```

## Issue Execution

For an existing eligible issue, the normal BKD session wake is a follow-up.
Moving an issue to `working` is not a general process-control command: only an
actual transition invokes the asynchronous auto-execute/queued-message flush
hook:

```bash
curl -sS --fail-with-body -X PATCH "$BKD_URL/projects/{projectId}/issues/{issueId}" \
  -H 'Content-Type: application/json' \
  -d '{"statusId":"working"}' | bkd_check
```

Keep board state and process state separate:

| Signal or action | Meaning | Starts or wakes a process? |
|------------------|---------|----------------------------|
| `statusId: todo` | Planned or queued work | No |
| `statusId: working` | Board says the issue is active | Only as an actual transition; not when already `working` |
| `statusId: review` | Work awaits evaluation or rework | No |
| `statusId: done` | Human-confirmed completion; the transition cancels an active session | No (stops one) |
| `POST .../restart` | Replay the stored prompt for a `failed`/`cancelled` session | Conditionally; rejects other session states |
| `POST .../follow-up` | Deliver input and ask BKD to resume the issue session | Yes, when the issue is eligible |

Use the issue's `sessionStatus` and `/processes` (whose entries carry
`turnInFlight`), not `statusId`, to determine whether an engine process
actually exists.

Recommended sequence:

1. Create the issue in `todo`
2. Queue the complete task details with `follow-up`
3. Move the issue to `working`; the transition hook consumes the queued details
   for the initial execution

**Do not use a status transition or `/restart` as a general-purpose wake.** Use
`follow-up` to continue or resume an eligible existing issue. The initial
`todo` -> `working` transition above is the lifecycle exception. `/restart`
only accepts `failed`/`cancelled` session state and replays the stored prompt;
it rejects `completed`, `running`, and `pending`.
`execute` is a lower-level primitive that starts a turn in one call,
pinning the engine/model/prompt at start time; reach for it only when you
specifically need that. It rejects `todo` and `done` issues (HTTP 400),
auto-moves `review` to `working`, and fails if the issue already has an active
process. Unlike `follow-up`, `execute` **requires** `engineType` and `prompt`:

```bash
cat > /tmp/bkd-prompt.txt <<'PROMPT'
Implement the change described above.
PROMPT
jq -n --rawfile prompt /tmp/bkd-prompt.txt \
      --arg engine "claude-code" --arg model "claude-sonnet-4-6" \
  '{engineType: $engine, prompt: $prompt, model: $model}' > /tmp/bkd-body.json
curl -sS --fail-with-body -X POST "$BKD_URL/projects/{projectId}/issues/{issueId}/execute" \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/bkd-body.json | bkd_check
# -> { executionId, issueId, messageId, queued }
```

Discover valid `engineType`/`model` values via [`/engines/available`](#engines).

### Follow-up issue

```bash
cat > /tmp/bkd-prompt.txt <<'PROMPT'
Also fix the logout flow and add tests.
PROMPT
jq -n --rawfile prompt /tmp/bkd-prompt.txt '{prompt: $prompt}' > /tmp/bkd-body.json
curl -sS --fail-with-body -X POST "$BKD_URL/projects/{projectId}/issues/{issueId}/follow-up" \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/bkd-body.json | bkd_check
```

Fields:

- `prompt` (required)
- `model`
- `permissionMode`: `auto | supervised | plan`
- `busyAction`: `queue | cancel`
- `displayPrompt`

Behavior (by current `statusId`):

- `todo`: returns `queued:true` before the wake path. POST the complete
  follow-up first, then PATCH the issue to `working`; the transition consumes
  the queued input
- `done`: returns `queued:true` before the wake path and must not receive the
  new follow-up yet. PATCH the issue to `review`, then POST the follow-up;
  `review` is auto-moved to `working` by that request
- `working` during an active turn: queued (`queued:true`), merged with any
  other queued input and delivered after the current turn ends
- `working` when idle but with messages already pending: returns `queued:true`,
  yet BKD immediately flushes all pending messages (merged) as one follow-up
- `working` when idle: immediate, triggers the next turn
- Any status: a `model` that differs from the issue's current model is rejected
  with HTTP 409 while `sessionStatus` is `running`/`pending`
- `review`: immediate — the issue is auto-moved to `working` and a turn starts.
  A bare follow-up to a `review` issue is therefore enough to begin rework; no
  separate `PATCH {statusId:"working"}` is needed.

Operational routing for ordinary follow-ups:

| Current status | Action order |
|----------------|--------------|
| `todo` | POST `follow-up` -> PATCH `working` |
| `done` | PATCH `review` -> POST `follow-up` |
| `review` | POST `follow-up` directly |
| `working` | POST `follow-up` directly |

Do not interpret HTTP 200 plus `.success:true` as proof that a process started.
An immediate wake normally returns `.data.executionId`; `.data.queued:true`
means only that the message was persisted or queued. In particular, `done`
returns `queued:true` and remains non-executable. When execution is required,
verify `executionId`, the issue's `sessionStatus` (`pending`/`running`), or the
issue in `/processes`.

The `prompt` field is limited to 32768 characters. A larger payload returns a
bare HTTP 400. Keep the target in `todo` or explicitly stopped while sending
ordered, numbered chunks. Queue a final numbered chunk such as "All parts sent;
begin", then move a `todo` issue to `working` to consume the full batch. Never
send chunk 1 to a `working` + idle issue: it can start before later chunks
arrive.

### Pending (queued) messages

Follow-ups that could not start a turn are stored as pending user messages.
Use these to verify a queued batch before the `todo` -> `working` transition,
or to recall a wrongly queued chunk:

```bash
# List queued messages: [{ messageId, content, metadata, createdAt }]
curl -sS --fail-with-body "$BKD_URL/projects/{projectId}/issues/{issueId}/pending" | bkd_check

# Recall one queued message by its ULID (hard-deletes the pending row)
curl -sS --fail-with-body -X DELETE "$BKD_URL/projects/{projectId}/issues/{issueId}/pending?messageId={messageId}" | bkd_check
```

### Restart, cancel, terminate, or clear session

```bash
curl -sS --fail-with-body -X POST "$BKD_URL/projects/{projectId}/issues/{issueId}/restart" | bkd_check
curl -sS --fail-with-body -X POST "$BKD_URL/projects/{projectId}/issues/{issueId}/cancel" | bkd_check
curl -sS --fail-with-body -X POST "$BKD_URL/projects/{projectId}/issues/{issueId}/terminate" | bkd_check
curl -sS --fail-with-body -X POST "$BKD_URL/projects/{projectId}/issues/{issueId}/clear-session" | bkd_check
```

- `restart`: directly spawns only when `sessionStatus` is `failed` or
  `cancelled`, using the stored original prompt. It is not the normal way to
  deliver changed requirements, and it rejects completed/running/pending
  sessions. Side effect: the route moves a `review` issue to `working` *before*
  that check, so a rejected restart strands the issue in `working` with no
  process. Read `sessionStatus` first; never probe with `/restart`.
- `cancel`: soft-interrupt the current turn, clear its in-memory pending
  inputs, and schedule background escalation (up to 3 interrupts 5 s apart,
  then hard kill). Settlement then waits a 3 s grace period before the issue
  moves to `review`, so expect roughly 3–20 s between the request and
  `statusId:"review"`; a re-read immediately after `cancel` will still show
  `working`. The response status is `interrupted` when an active process
  received the soft interrupt, or `cancelled` when no active process existed
  (that path does not move the issue to `review`).
- `terminate`: force-kill immediately. Use it directly when an immediate stop
  is required, or after a graceful cancel did not settle. It clears in-memory
  inputs, records the session as cancelled, and moves the issue to `review`.
- `clear-session`: drop the engine's external session id so the next run starts
  a fresh conversation instead of resuming. Use when the prior context is stale
  or corrupted.

To urgently correct a `working` issue, use **stop -> verify review ->
follow-up**. Choose the stop up front: `cancel` is graceful but needs 3–20 s
to settle into `review`, so it only fits when you can end the turn and
continue on a later wake (an L2 cron round, a user reply). When the correction
must go out in the same turn, call `terminate` directly. After either stop,
re-read the issue and require `statusId:"review"` before sending the
correction; a re-read immediately after `cancel` will still show `working`,
and if it does and you cannot wait, `terminate`. Never send the changed
requirement while the issue is still `working`, because it can queue behind
the turn being discarded. Do not use `/restart` for this workflow:

```bash
# 1. Stop the in-flight turn (graceful; settles in 3-20 s)
curl -sS --fail-with-body -X POST "$BKD_URL/projects/{projectId}/issues/{issueId}/cancel" | bkd_check
# 2. Re-read. If it is not review yet and the correction cannot wait, force-kill.
ISSUE=$(curl -sS --fail-with-body "$BKD_URL/projects/{projectId}/issues/{issueId}") || exit 1
if ! printf '%s\n' "$ISSUE" | jq -e '.success == true and .data.statusId == "review"' >/dev/null; then
  curl -sS --fail-with-body -X POST "$BKD_URL/projects/{projectId}/issues/{issueId}/terminate" | bkd_check
fi
# 3. Assert review before sending the replacement requirement.
curl -sS --fail-with-body "$BKD_URL/projects/{projectId}/issues/{issueId}" \
  | jq -e '.success == true and .data.statusId == "review"' >/dev/null || exit 1
cat > /tmp/bkd-prompt.txt <<'PROMPT'
<new requirement>
PROMPT
jq -n --rawfile prompt /tmp/bkd-prompt.txt '{prompt:$prompt}' > /tmp/bkd-body.json
FOLLOWUP=$(curl -sS --fail-with-body -X POST "$BKD_URL/projects/{projectId}/issues/{issueId}/follow-up" \
  -H 'Content-Type: application/json' --data-binary @/tmp/bkd-body.json) || exit 1
printf '%s\n' "$FOLLOWUP" | jq -e '.success == true' >/dev/null || exit 1
```

For an immediate hard stop, call `terminate` directly. It force-kills active
processes, clears their in-memory inputs, records `sessionStatus:cancelled`, and
moves the issue to `review`. Verify that status, then send a follow-up only when
a replacement turn is wanted; the follow-up moves `review` to `working`. If the
issue is `done`, PATCH it to `review`, verify, then send the new follow-up.

## Issue Changes

Get the **uncommitted** working-tree changes in an issue's directory (its
worktree when `useWorktree`, else the project directory). This is
`git status --porcelain`, not a branch diff:

```bash
curl -sS --fail-with-body "$BKD_URL/projects/{projectId}/issues/{issueId}/changes" \
  | bkd_check | jq -r '.data.files[].path'
```

Response `.data` is an object: `{ root, gitRepo, files: [{ path, status, type,
staged, unstaged, additions, deletions }], additions, deletions }` (plus
`timedOut:true` when git took longer than 15 s). `.data` is **not** an array.

Once a subtask has committed, `files` is empty. To see what a worktree branch
will merge, use git directly from the project directory:

```bash
git diff --name-only "$MERGE_BASE"...bkd/{issueId}
```

## Issue Logs

### Get logs

```bash
curl -sS --fail-with-body "$BKD_URL/projects/{projectId}/issues/{issueId}/logs?limit=50" | bkd_check
```

Useful query params:

- `cursor`
- `before`
- `limit`

### Filtered logs

Use the filter API to pull specific log slices without fetching full logs.

```
GET /projects/{projectId}/issues/{issueId}/logs/filter/{filter_path}
```

The response `.data` is an object with `{ issue, logs, nextCursor, hasMore }`;
log entries are in the `.data.logs` array. Read message text with
`.data.logs[].content`, never `.data[].content`.
When `hasMore` is true, repeat the same filter request with the returned
`nextCursor`; do not treat one page's log count as the total.

#### Filter path syntax

| Dimension | Format | Example |
|-----------|--------|---------|
| Entry types | `types/{type1,type2}` | `types/tool-use` |
| Single turn | `turn/{n}` | `turn/3` |
| Turn range | `turn/{start-end}` | `turn/2-5` |
| Last turn | `turn/last` | `turn/last` |
| Last N turns | `turn/last{N}` | `turn/last3` |
| Combined | concatenate | `types/tool-use/turn/last3` |

Available entry types: `user-message` `assistant-message` `tool-use`
`system-message` `thinking`. Other stored types (`error-message`,
`token-usage`) are **not** accepted by the filter and return HTTP 400
`Invalid types`; detect failures via the issue's `sessionStatus:"failed"`, the
`[BKD]` diagnostic lines in `system-message` entries, or the last
`assistant-message`.

Any `turn/...` filter on an issue that has no turns yet returns HTTP 400
`No turns exist for this issue`; treat that as "empty", not as a transport
failure, when probing a freshly created issue.

## Worktrees

### List worktrees

```bash
curl -sS --fail-with-body "$BKD_URL/projects/{projectId}/worktrees" | bkd_check
```

### Delete worktree

Force-deletes the worktree for an issue (does not wait for the auto-clean cycle):

```bash
curl -sS --fail-with-body -X DELETE "$BKD_URL/projects/{projectId}/worktrees/{issueId}" | bkd_check
```

BKD auto-cleans worktrees 1 day after an issue enters `done`. The cleanup cycle runs every 30 minutes and is controlled by the `worktree:autoCleanup` application setting.

## Cron Jobs

Use `GET /cron/actions` when you need the current server help text.

### List cron jobs

```bash
curl -sS --fail-with-body "$BKD_URL/cron?deleted=false" | bkd_check
```

Useful query params:

- `deleted=false|true|only` — **always pass it**: a bare `GET /cron` with no
  params returns every row including soft-deleted ones (hundreds on a busy
  server)
- `limit` (1–100) and `cursor`

The response shape depends on pagination: without `limit`/`cursor`, `.data` is
a plain array of jobs; with either, `.data` is `{ jobs, hasMore, nextCursor }`.
A cursor is only issued in the paginated form, so "follow all pages" means
`?deleted=false&limit=100` and then `&cursor=<nextCursor>` until `hasMore` is
false.

Job fields worth checking: `enabled`, `status`, `nextExecution`, `isDeleted`,
and `lastRun: { status, error }`.

### List cron actions

```bash
curl -sS --fail-with-body "$BKD_URL/cron/actions" | bkd_check
```

Builtin maintenance actions (no per-issue config):

- `upload-cleanup` — remove uploaded files older than 7 days
- `worktree-cleanup` — remove git worktrees for `done` issues older than 1 day
- `log-cleanup` — trim cron job logs to the last 1000 per job
- `issue-log-retention` — delete issue logs for `done` issues past the retention
  period (default 30 days, configurable in app settings)

Issue actions (`issue-execute`, `issue-follow-up`, `issue-close`,
`issue-check-status`) are documented below.

### Create cron job

```bash
CRON=$(curl -sS --fail-with-body -X POST "$BKD_URL/cron" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "daily-cleanup",
    "cron": "@daily",
    "action": "upload-cleanup",
    "config": {}
  }') || exit 1
if ! printf '%s\n' "$CRON" | jq -e '.success == true and (.data.id | type == "string")' >/dev/null; then
  printf 'BKD error: %s\n' "$(printf '%s\n' "$CRON" | jq -r '.error // "invalid response"')" >&2
  exit 1
fi
CRON_ID=$(printf '%s\n' "$CRON" | jq -er '.data.id')
```

Generic fields:

- `name`
- `cron`
- `action`
- `config`

Keep `.data.id`; deletion and schedule replacement require the cron ID. If it
is lost, query `GET /cron?deleted=false&limit=100`, match `.name`, and require
exactly one active result across all cursor pages before acting. Names are
unique among non-deleted jobs: creating a duplicate active name returns HTTP
409, so "recreate under the same name" only works after the old job is
soft-deleted.

**Auto-pause.** After 3 consecutive failed runs BKD sets `enabled:false`
(`status:"stopped"`) and the job never fires again until `POST /cron/{id}/resume`.
`issue-follow-up` and `issue-execute` fail whenever the target issue is `todo`
or `done` (`Cannot execute a done issue`), so a coordinator cron whose issue was
closed dies silently within three ticks. When a cron-driven loop stops waking,
check `enabled` and `lastRun.error` before assuming the issue is idle, and
delete the cron before any transition to `done`.

### Issue cron actions

#### `issue-execute`

Required config: `projectId`, `issueId`, `prompt`
Optional config: `engineType`, `model`

```bash
cat > /tmp/bkd-prompt.txt <<'PROMPT'
Run the nightly maintenance task and report the result.
PROMPT
jq -n --rawfile prompt /tmp/bkd-prompt.txt \
  '{name: "nightly-issue-execute", cron: "@daily", action: "issue-execute",
    config: {projectId: "my-project", issueId: "abc12345", prompt: $prompt, engineType: "claude-code"}}' \
  > /tmp/bkd-body.json
CRON=$(curl -sS --fail-with-body -X POST "$BKD_URL/cron" \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/bkd-body.json) || exit 1
printf '%s\n' "$CRON" | bkd_check >/dev/null || exit 1
CRON_ID=$(printf '%s\n' "$CRON" | jq -er '.data.id')
```

#### `issue-follow-up`

Required config: `projectId`, `issueId`, `prompt`
Optional config: `model`

Each run behaves like `POST .../follow-up` on a `working`/`review` issue
(`review` is auto-moved to `working`; a busy turn queues the input). Unlike the
HTTP route it does **not** queue for `todo`/`done` targets — it throws, the run
is logged as `failed`, and three such runs auto-pause the job.

```bash
cat > /tmp/bkd-prompt.txt <<'PROMPT'
Post a status check-in and ask for the next step.
PROMPT
jq -n --rawfile prompt /tmp/bkd-prompt.txt \
  '{name: "morning-follow-up", cron: "@hourly", action: "issue-follow-up",
    config: {projectId: "my-project", issueId: "abc12345", prompt: $prompt}}' \
  > /tmp/bkd-body.json
CRON=$(curl -sS --fail-with-body -X POST "$BKD_URL/cron" \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/bkd-body.json) || exit 1
printf '%s\n' "$CRON" | bkd_check >/dev/null || exit 1
CRON_ID=$(printf '%s\n' "$CRON" | jq -er '.data.id')
```

#### `issue-close`

Required config: `projectId`, `issueId`
Optional config: `targetStatus` (default `done`)

```bash
CRON=$(curl -sS --fail-with-body -X POST "$BKD_URL/cron" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "close-stale-review-item",
    "cron": "@weekly",
    "action": "issue-close",
    "config": {
      "projectId": "my-project",
      "issueId": "abc12345",
      "targetStatus": "done"
    }
  }') || exit 1
printf '%s\n' "$CRON" | bkd_check >/dev/null || exit 1
CRON_ID=$(printf '%s\n' "$CRON" | jq -er '.data.id')
```

#### `issue-check-status`

Required config: `projectId`, `issueId`

```bash
CRON=$(curl -sS --fail-with-body -X POST "$BKD_URL/cron" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "check-issue-status",
    "cron": "@every_minute",
    "action": "issue-check-status",
    "config": {
      "projectId": "my-project",
      "issueId": "abc12345"
    }
  }') || exit 1
printf '%s\n' "$CRON" | bkd_check >/dev/null || exit 1
CRON_ID=$(printf '%s\n' "$CRON" | jq -er '.data.id')
```

### Trigger, pause, resume, delete

Use the cron ID for these operations. In particular, `DELETE` does not accept a
name: a by-name request returns `Job not found` and leaves the cron active.

```bash
curl -sS --fail-with-body -X POST "$BKD_URL/cron/{jobId}/trigger" | bkd_check
curl -sS --fail-with-body -X POST "$BKD_URL/cron/{jobId}/pause" | bkd_check
curl -sS --fail-with-body -X POST "$BKD_URL/cron/{jobId}/resume" | bkd_check
curl -sS --fail-with-body -X DELETE "$BKD_URL/cron/{jobId}" | bkd_check
```

Assert `.success` on deletion, then re-read the job through
`GET /cron?deleted=only` and verify `isDeleted:true`. That is the only truthful
deletion field: `enabled` stays `true` and `status` becomes `not_loaded` after
soft deletion. There is no cron update route; change a schedule by deleting
the job by ID, verifying the deletion, and recreating it under the same name.
`resume` re-enables a job that was paused manually or auto-paused after
consecutive failures.

### Get cron job logs

```bash
curl -sS --fail-with-body "$BKD_URL/cron/{jobId}/logs?limit=20" | bkd_check
```

Supported query params:

- `status=success|failed|running`
- `cursor`
- `limit`

## Other Endpoint Groups

Additional built-in endpoint groups outside the orchestration core:

- **Notes** — scratch notes: `GET/POST /notes`, `PATCH/DELETE /notes/{noteId}`
- **Settings** — `server-info`, `max-concurrent-executions`, `log-page-size`,
  `workspace-path`, `write-filter-rules` under `/settings/...`
- **Webhooks** — `/settings/webhooks` CRUD, `/test`, and `/deliveries`
- **Slash commands** — `GET /projects/{projectId}/issues/{issueId}/slash-commands`,
  `GET /settings/slash-commands`
- **Events (SSE)** — server-sent event stream for real-time board updates
