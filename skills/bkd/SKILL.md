---
name: bkd
description: Operate a BKD kanban board over its REST API. Use when the user wants to manage BKD projects, issue execution workflows, cron jobs, or execution capacity, including three-tier coordination with an event-driven L1, multiple cron-driven L2 workstreams, and L3 execution, plus multi-subtask orchestration (trigger phrases like "use bkd to start coordination", "start BKD L1"). Requires a reachable BKD server ($BKD_URL).
---

# BKD

Operate BKD by sending HTTP requests to `$BKD_URL`, which must point at the BKD
API root such as `http://host:port/api`.

Keep this entry file small. Load only the references needed for the current turn.

## Always-On Rules

1. Confirm `$BKD_URL` before making any request. If it is missing, ask for it.
2. Use `curl -sS --fail-with-body` and check its exit status before parsing.
   For mutations, also assert `.success == true`; never rely on `curl -s | jq`
   because HTTP errors and failure envelopes can otherwise pass silently.
3. Route by `statusId`: `todo` -> POST the complete follow-up, then PATCH to
   `working`; `done` -> PATCH to `review`, then POST the follow-up;
   `review`/`working` -> POST the follow-up directly. A follow-up auto-moves
   `review` to `working`. PATCHing an already-`working` issue does nothing.
   `/restart` is limited to failed/cancelled sessions and replays the stored
   prompt. For a required immediate wake, `{success:true}` is not enough:
   `queued:true` means no wake is proven; check `executionId`, the issue's
   `sessionStatus` (`pending`/`running`), or `/processes`. The `todo` ->
   `working` PATCH is fire-and-forget: re-read the issue and, if
   `sessionStatus` is `failed`, POST a follow-up to flush the pending input.
4. Check `/processes/capacity` before starting any execution.
5. Move finished work to `review`, not `done`. Use `done` only after human
   confirmation. The `done` transition cancels a running session and makes any
   cron that targets the issue fail (auto-paused after 3 failures): delete
   owned crons first.
6. Use follow-up for all inter-issue communication.
7. Treat project and issue deletions as soft-delete unless the API says otherwise.
8. Successful API calls normally use `{ success, data }` and application
   failures normally use `{ success, error }`, but some HTTP validation errors
   have no JSON envelope. Check transport/HTTP success first, then the envelope;
   fail closed if either check fails.
9. Never use `sleep` to wait for subtasks or long-running operations. In the three-tier pattern, L1 never creates a cron: user messages and L2 follow-ups wake it. Each L2 owns its own `issue-follow-up` cron and ends the current turn between rounds. For non-three-tier orchestration, use the coordinator cron described in `references/orchestration.md`.
10. **The never-inline rule**: never inline free-form text (prompts, descriptions) into `-d '{...}'` — quotes, `$`, backticks, and newlines get mangled by shell + JSON escaping. Write the text to a temp file outside the repository, build the body with `jq`, and POST it with `--data-binary @file`. See `references/rest-api.md` → [Sending Request Bodies Safely](references/rest-api.md#sending-request-bodies-safely). Fixed-value bodies (e.g. `{"statusId":"working"}`) are safe to inline.
11. To urgently correct a `working` issue, stop the current turn before sending
    the correction. Try `cancel` for a soft interrupt (it settles to `review`
    in roughly 3–20 s), or use `terminate` for an immediate force-kill.
    Re-read the issue and require `statusId:review`; never send the correction
    while it is still `working`. If a cancel has not reached `review` within
    that window and the correction cannot wait, terminate it. Once it is
    in `review`, send the follow-up; BKD moves it to `working` and starts the
    replacement turn. A `done` issue follows the same final path: move it to
    `review`, then follow up.

## Core Workflow

### Three-Tier Coordination Shortcut

When the user says a short phrase such as "use bkd to start coordination" or
"start BKD L1", treat the current agent session as L1 and load
`references/three-tier-coordination.md`. The user does not need to repeat the
full L1/L2/L3 rules in the prompt.

### Single Issue Execution

```bash
set -o pipefail

# 1. Create issue
ISSUE=$(jq -n --arg title "short title" '{title:$title,statusId:"todo"}' \
  | curl -sS --fail-with-body -X POST "$BKD_URL/projects/{projectId}/issues" \
      -H 'Content-Type: application/json' -d @-) || exit 1
if ! printf '%s\n' "$ISSUE" | jq -e '.success == true and (.data.id | type == "string")' >/dev/null; then
  printf 'BKD error: %s\n' "$(printf '%s\n' "$ISSUE" | jq -r '.error // "invalid response"')" >&2
  exit 1
fi
ISSUE_ID=$(printf '%s\n' "$ISSUE" | jq -er '.data.id')

# 2. Queue the complete instruction while the issue is still todo
cat > /tmp/bkd-prompt.txt <<'PROMPT'
full implementation details
PROMPT
jq -n --rawfile prompt /tmp/bkd-prompt.txt '{prompt: $prompt}' > /tmp/bkd-body.json
FOLLOWUP=$(curl -sS --fail-with-body -X POST "$BKD_URL/projects/{projectId}/issues/$ISSUE_ID/follow-up" \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/bkd-body.json) || exit 1
printf '%s\n' "$FOLLOWUP" | jq -e '.success == true' >/dev/null || exit 1

# 3. Start the first execution; this transition consumes the queued instruction
START=$(curl -sS --fail-with-body -X PATCH "$BKD_URL/projects/{projectId}/issues/$ISSUE_ID" \
  -H 'Content-Type: application/json' \
  -d '{"statusId":"working"}') || exit 1
printf '%s\n' "$START" | jq -e '.success == true' >/dev/null || exit 1
```

Apply both guards after every BKD mutation: `curl --fail-with-body` must succeed,
then `.success` must be true. Use `jq -er` for required `.data` values. A bare
`false` inside an `||` block does not abort a shell that lacks `set -e`.

### Quick Operations

```bash
set -o pipefail

# Health check
curl -sS --fail-with-body "$BKD_URL/health" | jq

# Execution capacity
curl -sS --fail-with-body "$BKD_URL/processes/capacity" | jq

# Monitor logs (last 3 turns, assistant messages only)
curl -sS --fail-with-body "$BKD_URL/projects/{projectId}/issues/{issueId}/logs/filter/types/assistant-message/turn/last3" | jq

# Cron jobs (always filter: a bare /cron also returns soft-deleted jobs)
curl -sS --fail-with-body "$BKD_URL/cron/actions" | jq
curl -sS --fail-with-body "$BKD_URL/cron?deleted=false" | jq
```

## Reference Packs

Load only what the current task needs:

- `references/rest-api.md`
  Use for exact BKD routes, payload shapes, query params, and field lists.
- `references/orchestration.md`
  Use for multi-subtask dispatch workflows, mode selection (worktree vs simple), subtask creation and monitoring, and follow-up communication patterns.
- `references/quality-review.md`
  Use for subtask self-review responsibilities, coordinator logs filter assessment, and signal classification.
- `references/merge-strategy.md`
  Use for worktree branch merging, conflict resolution, post-merge verification, and cleanup after subtasks complete in worktree mode.
- `references/three-tier-coordination.md`
  Use for event-driven L1, cron-driven L2, and short-lived L3 autonomous coordination: the user-facing L1 is woken only by the user or L2 follow-ups, every campaign is partitioned across multiple bounded L2 coordinators, each L2 owns its own DAG and 15-min self cron, and L3 issues execute short-lived subtasks. Engine-agnostic — L1/L2/L3 may each run on different engines (Claude Code, Codex, etc.). Pick over `orchestration.md` when the campaign spans sessions/hours, needs capacity-aware DAG scheduling, and must run sleep-free.

## Quick Routing

Choose references by intent:

- Single issue CRUD, cron jobs, or API details: load `references/rest-api.md`.
- Short activation phrases like "use bkd to start coordination" or "start BKD L1": load `references/three-tier-coordination.md`.
- Multi-subtask dispatch or orchestration: load `references/rest-api.md` once
  for guarded transport, then `references/orchestration.md`.
- Subtask quality assessment or code review: load `references/rest-api.md` once
  for guarded transport, then `references/quality-review.md`.
- Branch merging after worktree subtasks: load `references/rest-api.md` once
  for guarded transport, then `references/merge-strategy.md`.
- Long-running three-tier coordination across heterogeneous engines: load `references/three-tier-coordination.md` (use instead of `orchestration.md` when L1 must remain user-facing and event-driven, multiple L2 coordinators must own separate workstreams and self-drive via cron, and L2/L3 may run on different engines than L1).
- Full orchestration pipeline: load `references/rest-api.md` once, then
  `references/orchestration.md`, `references/quality-review.md`, and
  `references/merge-strategy.md` as each phase is reached.
