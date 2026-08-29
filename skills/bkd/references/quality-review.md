# BKD Quality Assessment and Code Review

Two-tier review: subtasks self-review before reporting, then the coordinator
runs logs filter assessment. Assess immediately on each subtask completion;
do not wait for all subtasks to finish.

Shell mutation examples assume `set -o pipefail` and the `bkd_check` helper
from `rest-api.md`.

## Table of Contents

- [Pipeline Order](#pipeline-order)
- [1. Logs Filter Assessment](#1-logs-filter-assessment)
- [2. Subtask Self-Review (done by the subtask, not the coordinator)](#2-subtask-self-review-done-by-the-subtask-not-the-coordinator)
- [Key Rules](#key-rules)


## Pipeline Order

```
Subtask: implementation -> incremental self-review -> first-round fix -> report to coordinator
Coordinator: receive report -> Logs Filter assessment -> next phase (merge or done)
```

Subtasks own their code review. The coordinator only validates execution quality
via logs filter.

## 1. Logs Filter Assessment

Use the filter API to pull specific log slices. Do not fetch full logs.

```
GET /projects/{projectId}/issues/{issueId}/logs/filter/{filter_path}
```

See `references/rest-api.md` for filter path syntax and available entry types.

### 1.1 Check Error Signals

The filter API accepts only `user-message`, `assistant-message`, `tool-use`,
`system-message`, and `thinking`; `types/error-message` returns HTTP 400. Read
the session outcome from the issue itself, then look for BKD diagnostics:

```bash
# sessionStatus: completed | failed | cancelled (running/pending = not finished)
curl -sS --fail-with-body "$BKD_URL/projects/{pid}/issues/{iid}" \
  | bkd_check | jq -r '.data | "\(.statusId) \(.sessionStatus)"'

# BKD diagnostics ("[BKD] ..." lines: stalls, kills, settle events) in the last turn
curl -sS --fail-with-body "$BKD_URL/projects/{pid}/issues/{iid}/logs/filter/types/system-message/turn/last" \
  | bkd_check | jq -r '.data.logs[].content | select(startswith("[BKD]"))'
```

- `sessionStatus:"failed"` or `"cancelled"` with no completion report = red
  (killed or failed turn; do not treat `review` as success)
- `[BKD]` stall/kill diagnostics present but the turn recovered = yellow;
  check subsequent steps for recovery

### 1.2 Check Final Output

```bash
curl -sS --fail-with-body "$BKD_URL/projects/{pid}/issues/{iid}/logs/filter/types/assistant-message/turn/last" | bkd_check
```

- Output does not match task goal = red
- Reports an unresolved final failure such as "unable to complete" or "gave
  up" = red. Do not classify on the word "failed" alone when the same final
  output shows recovery and passing checks.

### 1.3 Check Tool Call Patterns

```bash
curl -sS --fail-with-body "$BKD_URL/projects/{pid}/issues/{iid}/logs/filter/types/tool-use/turn/last3" | bkd_check
```

- Same tool + similar args >= 3 consecutive times = red (blind retry)
- `rm -rf`, `--force`, `git reset --hard` without reasonable context = red
- `file-edit` kind touching out-of-scope files = yellow

### 1.4 Check Execution Scale

```bash
curl -sS --fail-with-body "$BKD_URL/projects/{pid}/issues/{iid}/logs/filter/types/user-message" \
  | bkd_check | jq '.data | {count:(.logs | length), nextCursor, hasMore}'
```

- Each turn starts with one `user-message`, so the entry count is a proxy for
  total turn count
- Follow `nextCursor` while `hasMore` is true and sum page counts; one page is
  not necessarily the total
- Total turns exceeding 2x estimated complexity = yellow

### 1.5 Signal Classification

| Signal | Condition | Action |
|--------|-----------|--------|
| Red | Final output misses goal / blind retry / dangerous operations | Follow-up subtask with issue details; the follow-up auto-moves the `review` issue back to `working` for rework |
| Yellow | Errors recovered / excessive turns / out-of-scope file changes | Follow-up coordinator with report, wait for human decision |
| Green | No red or yellow signals | Proceed to next phase (merge or done) |

### 1.6 Result Handling

**Green (pass):** Proceed directly to next phase (merge or done). Do not follow-up the coordinator issue — the coordinator is already running this assessment inline, so sending a follow-up to itself would cause self-activation loops.

**Red (rework):** Send the prompt with the never-inline pattern from
`rest-api.md`:

```bash
cat > /tmp/bkd-prompt.txt <<'PROMPT'
Quality assessment failed.
Red signal: turn/last output is "unable to install dependencies", task incomplete.
Required: investigate root cause and re-execute. Do not blindly retry.
PROMPT
jq -n --rawfile prompt /tmp/bkd-prompt.txt '{prompt:$prompt}' > /tmp/bkd-body.json
curl -sS --fail-with-body -X POST "$BKD_URL/projects/{pid}/issues/$SUB_ID/follow-up" \
  -H 'Content-Type: application/json' --data-binary @/tmp/bkd-body.json \
  | bkd_check
```

The subtask sits in `review` (autoMoveToReview), so this follow-up alone
auto-moves it to `working` and starts the rework turn — do not send a separate
`PATCH {statusId:"working"}`.

## 2. Subtask Self-Review (done by the subtask, not the coordinator)

Each subtask is responsible for reviewing and fixing its own code before reporting.

### 2.1 Subtask Responsibilities

1. Run an incremental code review over its own changes after implementation;
   use an engine-provided review capability such as `pma-cr` when available,
   but never require one specific skill
2. Fix all P0 and P1 issues found
3. Include self-review summary in the completion report to the coordinator

### 2.2 Review Dimensions (by priority)

1. Correctness and regressions
2. Security and trust boundaries
3. Data integrity and error handling
4. Concurrency, cancellation, and resource lifecycle
5. Performance and scalability
6. Maintainability and testing

### 2.3 Coordinator Escalation

If the coordinator's logs filter assessment finds issues that the subtask's self-review missed,
send the subtask back for rework:

```bash
cat > /tmp/bkd-prompt.txt <<'PROMPT'
Logs filter found issues missed by self-review.
- Red signal: blind retry pattern in turn/last3
- Out-of-scope file changes detected
Required: fix issues, re-run self-review, and report again.
PROMPT
jq -n --rawfile prompt /tmp/bkd-prompt.txt '{prompt:$prompt}' > /tmp/bkd-body.json
curl -sS --fail-with-body -X POST "$BKD_URL/projects/{pid}/issues/$SUB_ID/follow-up" \
  -H 'Content-Type: application/json' --data-binary @/tmp/bkd-body.json \
  | bkd_check
```

The follow-up auto-moves the `review` issue back to `working`; no `PATCH` is
needed. After rework, the subtask re-enters the pipeline: self-review -> report
-> coordinator assessment.

## Key Rules

- **Subtasks own their code review** - each subtask reviews its incremental changes and fixes P0/P1 before reporting
- **Coordinator only runs logs filter** - the coordinator validates execution quality, not code quality
- **Incremental scope only** - use an available review capability when helpful; do not require a specific skill or chase historical debt
- **Pipeline processing** - assess each subtask as soon as it completes; do not batch
- **Both tiers must pass before merge** - subtask self-review + coordinator logs filter assessment
