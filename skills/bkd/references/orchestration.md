# BKD Orchestration Workflow

Multi-subtask dispatch through a coordinator issue that manages subtask lifecycle,
follow-up communication, and completion tracking.

Shell examples assume `set -o pipefail` and the `bkd_check` helper from
`rest-api.md`, so HTTP and application failures abort instead of passing
silently.

## Table of Contents

- [Flow Overview](#flow-overview)
- [1. Pre-Flight](#1-pre-flight)
- [2. Create Coordinator Issue](#2-create-coordinator-issue)
- [3. Mode Selection](#3-mode-selection)
- [4. Subtask Creation and Execution](#4-subtask-creation-and-execution)
- [5. Subtask Self-Review, Fix, and Reporting](#5-subtask-self-review-fix-and-reporting)
- [6. Final Confirmation](#6-final-confirmation)
- [Status Flow](#status-flow)
- [Key Constraints](#key-constraints)


## Flow Overview

```
Check capacity -> Create coordinator issue -> Split subtasks -> Subtask execution
                                                                     |
                                                              Subtask self-review + first fix
                                                                     |
                                                              Subtask auto-enters review
                                                              + follow-up report to coordinator
                                                              (includes review results)
                                                                     |
                                                        Coordinator quality assessment (logs filter)
                                                                     |
                                                        [Worktree mode] Branch merge
                                                                     |
                                                              Build/test verification
                                                                     |
                                                        Coordinator -> review -> done (human)
```

## 1. Pre-Flight

```bash
curl -sS --fail-with-body "$BKD_URL/health" | bkd_check
curl -sS --fail-with-body "$BKD_URL/processes/capacity" | bkd_check
```

- `$BKD_URL` missing: ask the user for it
- `availableSlots` is 0: do not create or start tasks; end the turn and wait
  for a later user/system event to retry pre-flight
- Re-check capacity before each new subtask

> **The never-inline rule.** Send every free-form prompt via a temp file + `jq`
> + `--data-binary @file`. See `rest-api.md` →
> [Sending Request Bodies Safely](rest-api.md#sending-request-bodies-safely).

## 2. Create Coordinator Issue

```bash
ORCH=$(jq -n --arg title "[dispatch] task title" \
  '{title:$title,statusId:"todo"}' \
  | curl -sS --fail-with-body -X POST "$BKD_URL/projects/{projectId}/issues" \
      -H 'Content-Type: application/json' -d @-) || exit 1
if ! printf '%s\n' "$ORCH" | jq -e '.success == true and (.data.id | type == "string")' >/dev/null; then
  printf 'BKD error: %s\n' "$(printf '%s\n' "$ORCH" | jq -r '.error // "invalid response"')" >&2
  exit 1
fi
ORCH_ID=$(printf '%s\n' "$ORCH" | jq -er '.data.id')
```

Send task details and subtask breakdown:

```bash
cat > /tmp/bkd-prompt.txt <<'PROMPT'
## Goal
{full description}

## Subtasks
1. {subtask A title} - {acceptance criteria}
2. {subtask B title} - {acceptance criteria}

## Mode
{Worktree mode | Simple mode}

## Rules
- Each subtask must follow-up report to this issue after completion
- Report includes: status, changed files, key decisions, issues encountered
PROMPT
jq -n --rawfile prompt /tmp/bkd-prompt.txt '{prompt:$prompt}' > /tmp/bkd-body.json
FOLLOWUP=$(curl -sS --fail-with-body -X POST "$BKD_URL/projects/{projectId}/issues/$ORCH_ID/follow-up" \
  -H 'Content-Type: application/json' --data-binary @/tmp/bkd-body.json) || exit 1
printf '%s\n' "$FOLLOWUP" | jq -e '.success == true' >/dev/null || exit 1
```

Start the coordinator:

```bash
curl -sS --fail-with-body -X PATCH "$BKD_URL/projects/{projectId}/issues/$ORCH_ID" \
  -H 'Content-Type: application/json' \
  -d '{"statusId":"working"}' | bkd_check
```

## 3. Mode Selection

Choose before creating subtasks based on task characteristics:

| Condition | Mode | `useWorktree` |
|-----------|------|---------------|
| Many files changed, or subtasks may overlap | Worktree | `true` |
| Few files changed (<=3), no file overlap | Simple | `false` |
| Parallel development on same module | Worktree | `true` |
| Independent small fixes, config, or docs | Simple | `false` |

**Simple mode constraints:**

- Subtasks must not modify the same files
- Run subtasks serially, or ensure no file overlap when parallel
- If file conflict is discovered during execution, abort and switch to worktree mode

## 4. Subtask Creation and Execution

### 4.1 Create

**Worktree mode:**

```bash
SUB=$(jq -n --arg title "{subtask title}" \
  '{title:$title,statusId:"todo",useWorktree:true}' \
  | curl -sS --fail-with-body -X POST "$BKD_URL/projects/{projectId}/issues" \
      -H 'Content-Type: application/json' -d @-) || exit 1
printf '%s\n' "$SUB" | jq -e '.success == true and (.data.id | type == "string")' >/dev/null || exit 1
SUB_ID=$(printf '%s\n' "$SUB" | jq -er '.data.id')
```

**Simple mode:**

```bash
SUB=$(jq -n --arg title "{subtask title}" \
  '{title:$title,statusId:"todo"}' \
  | curl -sS --fail-with-body -X POST "$BKD_URL/projects/{projectId}/issues" \
      -H 'Content-Type: application/json' -d @-) || exit 1
printf '%s\n' "$SUB" | jq -e '.success == true and (.data.id | type == "string")' >/dev/null || exit 1
SUB_ID=$(printf '%s\n' "$SUB" | jq -er '.data.id')
```

### 4.2 Send Implementation Details

The follow-up **must** include:
- Implementation requirements and acceptance criteria
- Self-review instruction: subtask must review its own code and fix issues before reporting
- Completion report instruction with the full API path

Build the prompt with the heredoc `__VAR__` + `sed` pattern (never nest curl
commands or escaped JSON inside an inline `-d` string — that is exactly what
the never-inline rule forbids):

```bash
cat > /tmp/bkd-prompt.txt <<'PROMPT'
## Requirements
{detailed implementation spec}

## Acceptance Criteria
- {criterion 1}
- {criterion 2}

## Before Reporting: Self-Review (mandatory)

After implementation is complete, you MUST:
1. Review your own code changes against the acceptance criteria
2. Run a code review over your changes (if your engine has a code-review
   skill such as /pma-cr, use it)
3. Fix all P0 and P1 issues found in the first round
4. Only report to the coordinator after self-review and first-round fixes are done

Include the review summary in your completion report.

## After Self-Review: Report to Coordinator

Send a follow-up report over the BKD HTTP API (if your engine has the bkd
skill, it documents these endpoints):

POST __BKD_URL__/projects/{projectId}/issues/__ORCH_ID__/follow-up
Body JSON shape:
{"prompt": "Subtask {id} ({title}) complete\nStatus: success|failure|partial\nChanged files: file1, file2, ...\nKey decisions: {description}\nSelf-review: passed|{issues found and fixed}\nRemaining issues: {if any}"}

Strict requirements:
- Must complete self-review and first-round fixes before reporting
- Must use the /follow-up endpoint for all inter-issue communication
PROMPT
sed -i "s|__BKD_URL__|$BKD_URL|g; s|__ORCH_ID__|$ORCH_ID|g" /tmp/bkd-prompt.txt
jq -n --rawfile prompt /tmp/bkd-prompt.txt '{prompt: $prompt}' > /tmp/bkd-body.json
curl -sS --fail-with-body -X POST "$BKD_URL/projects/{projectId}/issues/$SUB_ID/follow-up" \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/bkd-body.json | bkd_check
```

### 4.3 Start Execution

```bash
# Re-check capacity
curl -sS --fail-with-body "$BKD_URL/processes/capacity" | bkd_check | jq -er '.data.availableSlots'

curl -sS --fail-with-body -X PATCH "$BKD_URL/projects/{projectId}/issues/$SUB_ID" \
  -H 'Content-Type: application/json' \
  -d '{"statusId":"working"}' | bkd_check
```

### 4.4 Monitor

```bash
# Last 3 turns, assistant messages only
curl -sS --fail-with-body "$BKD_URL/projects/{projectId}/issues/$SUB_ID/logs/filter/types/assistant-message/turn/last3" | bkd_check

# Or check for errors
curl -sS --fail-with-body "$BKD_URL/projects/{projectId}/issues/$SUB_ID/logs/filter/types/error-message" | bkd_check
```

If monitoring must span turns, create one `issue-follow-up` cron for the
coordinator using the ID-capturing pattern in `rest-api.md`. Persist
`coordinatorCronId` in the coordinator's final state. Bootstrap is idempotent:
reuse exactly one active same-name cron and treat duplicates as an error. On
completion or user stop, delete by ID, assert `.success`, and verify
`isDeleted:true` before leaving `working`.

## 5. Subtask Self-Review, Fix, and Reporting

After a subtask finishes implementation:

### 5.1 Self-Review and First-Round Fix (done by the subtask)

The subtask must:

1. Run an incremental code review over its own changes, using an available
   review capability such as `pma-cr` when supported
2. Fix all P0 and P1 issues found
3. Only then report to the coordinator

This is mandatory. The coordinator should not need to send back obvious issues.

### 5.2 Report to Coordinator

- **Status change**: BKD automatically moves completed subtasks from `working` to `review` (built-in `autoMoveToReview`). Do not manually change status.
- **Report to coordinator**: the subtask sends a follow-up including self-review results.

```bash
cat > /tmp/bkd-prompt.txt <<'PROMPT'
Subtask __SUB_ID__ ({title}) complete.
Status: success
Changed files: src/foo.ts, src/bar.ts
Key decisions: used XX approach
Self-review: passed (fixed 1 P1: missing error handling in api.ts)
Remaining issues: none
PROMPT
sed -i "s|__SUB_ID__|$SUB_ID|g" /tmp/bkd-prompt.txt
jq -n --rawfile prompt /tmp/bkd-prompt.txt '{prompt:$prompt}' > /tmp/bkd-body.json
REPORT=$(curl -sS --fail-with-body -X POST "$BKD_URL/projects/{projectId}/issues/$ORCH_ID/follow-up" \
  -H 'Content-Type: application/json' --data-binary @/tmp/bkd-body.json) || exit 1
printf '%s\n' "$REPORT" | jq -e '.success == true' >/dev/null || exit 1
```

### Follow-up Queue Behavior

| Coordinator status | Follow-up behavior |
|--------------------|--------------------|
| `working` and idle (between turns) | **Immediate**: triggers coordinator's next turn |
| `working` and busy (turn in progress) | **Queued**: processed after current turn ends |
| `review` | **Immediate**: the issue is auto-moved to `working` and a turn starts |
| `todo` or `done` | **Queued**: waits for status change |

Key behaviors:

- Follow-up **actively triggers** the coordinator to continue, not a passive log
- Multiple queued follow-ups are **merged** and delivered together
- If the coordinator process has exited, follow-up **auto-starts a new process**
- A bare follow-up to a `review` issue is enough to begin rework; no separate
  `PATCH {statusId:"working"}` is needed (see `rest-api.md` → Follow-up issue)

## 6. Final Confirmation

After all subtasks pass self-review + coordinator quality assessment (+ merge in worktree mode):

```bash
# Move coordinator to review
curl -sS --fail-with-body -X PATCH "$BKD_URL/projects/{projectId}/issues/$ORCH_ID" \
  -H 'Content-Type: application/json' \
  -d '{"statusId":"review"}' | bkd_check
```

After human confirmation, close everything:

```bash
# Move coordinator and all subtasks to done
curl -sS --fail-with-body -X PATCH "$BKD_URL/projects/{projectId}/issues/$ORCH_ID" \
  -H 'Content-Type: application/json' \
  -d '{"statusId":"done"}' | bkd_check

curl -sS --fail-with-body -X PATCH "$BKD_URL/projects/{projectId}/issues/$SUB_ID" \
  -H 'Content-Type: application/json' \
  -d '{"statusId":"done"}' | bkd_check
```

## Status Flow

### Worktree Mode

```
Coordinator:  todo -> working -> (await subtasks) -> merge branches -> review -> done (human)

Subtask:      todo -> working -> self-review + fix -> review (auto) + report to coordinator
                                                        |
                                              Coordinator: logs filter assessment
                                               /       |        \
                                          red:reject  yellow:   green:pass
                                          -> working  human       |
                                                      decision  merge bkd/{issueId}
                                                                /        \
                                                            conflict    success
                                                              |           |
                                                        merge --abort   build/test verify
                                                        + escalate       /        \
                                                                      fail      pass
                                                                       |          |
                                                                revert + reject  -> done (with coordinator)
                                                                   -> working
```

### Simple Mode

```
Coordinator:  todo -> working -> (await subtasks) -> review -> done (human)

Subtask:      todo -> working -> self-review + fix -> review (auto) + report to coordinator
                                                        |
                                              Coordinator: logs filter assessment
                                               /       |        \
                                          red:reject  yellow:   green:pass
                                          -> working  human       |
                                                      decision  -> done (with coordinator)
```

## Key Constraints

1. **Follow-up only** - use `POST /projects/{pid}/issues/{iid}/follow-up` for all inter-issue communication
2. **Follow-up queue** - messages to `todo`/`done` issues are queued; `working` + idle = immediate; `review` = immediate (auto-moves to `working`); multiple queued messages are merged
3. **Report instructions are mandatory** - subtask follow-up details must include the full report API path to prevent agents from using wrong endpoints
4. **Capacity first** - check `/processes/capacity` before every new subtask
5. **autoMoveToReview** - BKD auto-moves completed subtasks to `review`; do not manually change status
6. **Subtask self-review is mandatory** - each subtask must review its incremental changes and fix P0/P1 issues before reporting; use an available review capability when helpful, without requiring one specific skill
7. **Pipeline assessment** - coordinator assesses each subtask immediately on completion; do not wait for all subtasks
8. **review != done** - `review` awaits human confirmation; only move to `done` after human approval
9. **Soft delete** - project and issue deletions are soft-delete by default
10. **No sleep** - never use `sleep` to wait for subtasks or long-running operations; create a cron job (`issue-follow-up`) to callback the coordinator issue on a schedule, capture `.data.id`, and let the current turn end. Persist that cron ID in the coordinator's final state. On completion or user stop, delete the cron by ID, assert `.success`, and verify `isDeleted:true` before moving the coordinator to `review`.
