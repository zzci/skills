# BKD Three-Tier Autonomous Coordination

Event-driven L1, cron-driven L2, and short-lived L3 coordination that runs
entirely inside BKD. L1, L2, and L3 are all BKD processes; all coordination
and state are expressed through BKD issues and follow-ups, while only L2
scheduling loops use cron jobs. **L1 never creates a cron.** User messages and
L2 follow-ups wake L1.
**Never** use subagents, external team runners, or `sleep` waits.

Use this pattern when the user wants a long-running, self-driving pipeline where
the user-facing agent (L1) partitions a campaign across multiple L2 workstreams,
talks to the user, and reports progress, while BKD owns per-workstream DAG
decomposition and dispatch (L2) and execution (L3).

**Multiple-L2 invariant.** A three-tier campaign has at least two L2 issues,
each with a bounded, explicit, preferably non-overlapping responsibility. Never
create one catch-all L2 to handle every concern. If the request cannot be split
into at least two meaningful L2 workstreams, use `orchestration.md` or the
single-issue workflow instead of this pattern.

**Engine-agnostic by design.** L1, L2, and L3 may each run on different agent
engines (Claude Code, Codex, or anything BKD supports). Prompts in this file
deliberately avoid slash-command shorthand (`/bkd`, `/pma-cr`, etc.) because not
every engine resolves them. State requirements as capabilities; if an engine has
a matching skill, mention it as a hint, never as the only path.

**Lightweight by design.** Each L2 cron fires every 15 min. Every L2 wake must
do **scan + decide + act**, never re-investigate the codebase: the plan is
decomposed once at L2's first wake and snapshotted into the issue log. L1 wakes
only for a user message or L2 follow-up and queries only the affected campaign
state. See [Context Discipline](#context-discipline-lightweight-wake-ups).

**Only L1 writes to main.** L2 and L3 are fully isolated in their own worktrees
(`useWorktree: true`): L3 merges into L2's branch `bkd/{L2_ID}`, L2 never
touches main. L1 is the single integration point — it reviews `bkd/{L2_ID}`,
merges it into main, and resolves conflicts, but only after the user confirms.
Two user-confirmation gates are mandatory at L1 (dispatch and merge); see
[L1 Responsibilities](#l1-responsibilities).

In this document, "main" means the integration branch recorded by L1 as
`baseBranch` at campaign creation; it may be named `main`, `master`, or another
repository-defined branch. Worktrees share local Git refs, so cross-tier sync
uses local `baseBranch` and `bkd/{issueId}` refs unless a separate push step was
explicitly performed and verified.

## Table of Contents

- [When to Use This Pattern](#when-to-use-this-pattern)
- [Tier Map](#tier-map)
- [Campaign and DAG State](#campaign-and-dag-state)
- [Pre-Flight (every session)](#pre-flight-every-session)
- [L1 - Master Coordinator](#l1---master-coordinator-current-agent-session)
- [L2 - Scheduling Issue](#l2---scheduling-issue-one-per-workstream-own-worktree)
- [L3 - Subtask Issues](#l3---subtask-issues-short-lifecycle)
- [State Machine](#state-machine)
- [Loop Engine](#loop-engine)
- [Context Discipline (lightweight wake-ups)](#context-discipline-lightweight-wake-ups)
- [Long-running Gates and Killed Turns](#long-running-gates-and-killed-turns)
- [Idle Termination Countdown](#idle-termination-countdown)
- [Exceptions and Escalation](#exceptions-and-escalation)
- [Key Constraints](#key-constraints)

## When to Use This Pattern

Choose this over the two-tier flow in `orchestration.md` when: the work spans
multiple sessions or many hours and BKD must keep driving while the user-facing
agent is idle or offline; the user wants a single human-facing session that
owns top-level workstream boundaries and reports progress, with per-workstream
dispatch logic inside BKD; the pipeline runs across heterogeneous engines
without engine-specific slash commands; subtasks need real dependency DAGs
with capacity-aware scheduling per wake; and you explicitly want `sleep`-free
orchestration driven by L2 `issue-follow-up` cron callbacks.

If the work fits in one session and a simple "create coordinator -> dispatch
subtasks -> wait -> merge" suffices, use `orchestration.md` instead.
If the work has only one meaningful coordination workstream, also use that
two-tier flow: three tiers must not add a ceremonial single L2.

## Tier Map

Compact overview; the per-tier Responsibilities sections below are canonical.

```
L1 (current agent session, any engine; main worktree; no cron)
  - talks to the user; gathers context; partitions each campaign into 2+ L2s
  - wakes only on user messages or L2 follow-ups
  - owns cross-L2 scope, dependencies, progress aggregation, and merge order
  - gates: user must confirm the L2 dispatch set and every L2->main merge
  - integrates: reviews each bkd/{L2_ID}, merges into main, resolves conflicts
      v  (after user confirms) one follow-up per L2: bounded workstream goal,
         acceptance, scope, dependencies (reference paths, not file contents)
L2 x N, N >= 2 (one issue per workstream; useWorktree: true)
  - never writes source; decomposes only its workstream into L3 BKD issues,
    dispatches, monitors, evaluates; 15-min self cron drives one round per wake
  - merges L3 branches into bkd/{L2_ID} (never main); reports/escalates to L1
      v  create + follow-up: self-contained spec + acceptance + report URL
L3 (one issue per subtask; useWorktree: true; branch bkd/{L3_ID}; short-lived)
  - implements only its spec; passes the project's own checks; auto-moves to
    review; follow-up reports to L2; exits
  - never dispatches, never merges, never re-investigates the project
```

## Campaign and DAG State

BKD issue status is limited to `todo`, `working`, `review`, and `done`. The
words `planned`, `dispatched`, `green`, `merged`, and `blocked` in this file are
**L2-internal DAG states**, not BKD `statusId` values. Never PATCH an issue to
`merged` or `blocked`.

Every three-tier campaign needs one stable `campaignId` shared by all of its
L2 and L3 issues:

- Generate one at L1 bootstrap before creating the L2 set, e.g.
  `CAMPAIGN_ID="l1-${L1_SESSION_ID}-$(date +%Y%m%d%H%M%S)"`.
- Record the current L1 integration branch once as `baseBranch`, and include it
  in every L2/L3 prompt and state snapshot.
- Put it in all L2/L3 titles and tags; if a tagged create fails because tags are
  unsupported, retry without `tags` but keep it in the title.
- Include it in every L1/L2/L3 follow-up prompt. L1 finds the complete L2 set
  by this `campaignId`, not by guessing from status or recent activity.

Each L2 owns only its workstream's DAG state. At the end of every L2 turn, emit
a compact state block in the final assistant message so that L2's next cron
wake can resume without an external store:

```text
[dag-state campaignId={campaignId} l2Id={L2_ID}]
cronId={cronId}
baseBranch={baseBranch}
gate=none|pending(pid={pid},log={absoluteLogPath},commit={commit})
subtasks:
- id={issueId} title="{title}" mode=worktree deps=[...] state=planned|dispatched|green|merged|blocked retries=0
pendingEscalations=[]
[/dag-state]
```

State meanings: `planned` = designed, not started; `dispatched` = moved to
`working`, awaiting completion; `green` = quality assessment passed, merge
pending; `merged` = L3 branch merged into `bkd/{L2_ID}` and verified;
`blocked` = cannot continue without L1/user input (keep the BKD issue in
`review` when possible; if still active, cancel or let it finish first).
`gate=pending` means a detached verification command still needs collection;
it is actionable work and prevents idle termination.

## Pre-Flight (every session)

Do this every time L1 starts, before anything else:

1. Load BKD conventions: if your engine supports the `bkd` skill, load it;
   otherwise treat this file plus `references/rest-api.md` as authoritative and
   proceed via plain HTTP.
2. Auto-detect `$BKD_URL` and `projectId`. If either cannot be confirmed, ask
   the user. **Never guess.**
3. Run health and capacity checks; record `availableSlots`.
   ```bash
   set -o pipefail
   curl -sS --fail-with-body "$BKD_URL/health" | jq
   curl -sS --fail-with-body "$BKD_URL/processes/capacity" | jq
   ```
4. If the scope of work is unclear, ask the user. **Never broaden scope on
   your own.**

## L1 - Master Coordinator (current agent session)

L1 **is** the current agent session, whichever engine runs it. It is itself a
BKD process under some `issueId` (the session issue). Engine identity does not
matter; only BKD HTTP semantics do.

### L1 Responsibilities

- **L1 owns main integration.** L1 is the only tier that writes to the main
  worktree, and only to integrate a completed L2 branch. It never authors
  features by hand — implementation always goes through L2/L3. Outside the
  review-and-merge step, treat main as read-only (`git status`/`log`/`diff`).
- **Identify the session issue** at startup — it is the follow-up target used
  by every L2 to wake L1 with progress, decisions, and completion reports. L1
  never registers a cron. If the session issue id cannot be obtained, ask the
  user and do not dispatch L2s until it is known; otherwise L2 cannot report.
- **Gather requirements** from the user; read code and docs for context. Do
  not write code and do not perform L3-level decomposition. Capture findings
  as **file paths + line ranges + brief notes**, NOT pasted contents — keeps
  each L1→L2 follow-up small.
- **Partition every new campaign at L2 level (HARD RULE).** Define at least two
  bounded workstreams before dispatch. Give each workstream its own L2 issue,
  write scope, acceptance criteria, and dependency list. Prefer disjoint write
  scopes. Never assign all concerns to one catch-all L2. L1 owns cross-L2
  dependencies and merge order; each L2 owns only its internal L3 DAG.
- **Classify the request: new campaign vs continuation** (ask when not obvious):
  - **New campaign** -> one shared `campaignId` and **multiple new L2 issues**,
    one per workstream, each in its own worktree.
  - **Continuation** -> route each changed requirement only to the affected
    existing L2 or L2s. If a target is mid-turn, use stop → verify review →
    follow-up
    (see [Loop Engine](#loop-engine)) so it folds the change into its snapshot
    and DAG on a clean turn.
  - **Unsure** -> ask. Never silently fold unrelated work into one existing L2.
- **User confirmation gate (HARD RULE — no exceptions).** L1 may NOT create any
  L2, send a continuation follow-up, or otherwise hand work to L2 until the
  user explicitly confirms:
  1. Draft the dispatch package: classification (new vs continuation), shared
     `campaignId`, the complete L2 set or affected L2 ids, and for each L2
     `{ workstream goal, acceptance criteria, impact scope (paths),
     out-of-scope, cross-L2 dependencies }`, plus open questions.
  2. Present it in plain text; resolve every open question by asking.
  3. Wait for an **explicit affirmative** — `proceed`/`ok`/`go`/`confirm`.
     Silence, "thanks", or a partial answer is NOT confirmation.
  4. If the user pushes back, revise, re-present, and wait again.
  5. Only then create the complete L2 set (new campaign) or send the targeted
     follow-ups (continuation).
  Applies to **every** dispatch batch, continuation, and scope change. Neither
  an L2 follow-up nor a user progress query may silently cross this gate.
- For each confirmed new campaign, create at least two L2 issues **with
  `useWorktree: true`** (mandatory), delivering each bounded package plus the
  shared `campaignId` via follow-up. Check capacity before waking them; L2s
  whose workstreams are independent may run concurrently. If two L2s have a
  dependency or overlapping write scope, L1 records the order and delays the
  downstream L2 until its prerequisite branch has been merged into main.
- **L2 branch review and merge (L1 owns this).** When an L2 reports "workstream
  done, branch `bkd/{L2_ID}` ready":
  1. **Review** against the agreed goal/acceptance: inspect
     `git diff {baseBranch}...bkd/{L2_ID}`, confirm scope, run the project's checks on
     the branch. If review fails, follow-up L2 with the gap and let it dispatch
     a fix L3; do not hand-fix.
  2. **Confirm with the user** — present review summary + merge plan; wait for
     explicit `proceed`/`ok`/`go` (HARD RULE; merging main is hard to reverse).
  3. **Merge**: record the pre-merge HEAD (easy `git reset` escape), then
     `git merge --no-ff bkd/{L2_ID}`; resolve conflicts; rerun project checks.
  4. If unsalvageable, `git merge --abort`, report to the user, follow-up L2
     for a rebase/fix. Never leave main broken or half-merged.
  5. Report the outcome. Issues move to `done` only on the user's say-so (it
     triggers worktree auto-cleanup).
- **Event-driven progress only.** L1 creates no cron. A user message wakes L1
  for an on-demand aggregate report. Every L2 progress, yellow/blocked, and
  completion follow-up also wakes L1 immediately; L1 queries the sibling L2
  issues sharing that `campaignId`, updates the user when appropriate, handles
  decisions, and ends the turn.
- **Termination conditions** (evaluated per campaign on an event-driven wake):
  - User explicitly stops -> delete every owned L2 cron by ID, assert each
    response succeeds, and verify `isDeleted:true`; obtain IDs from each L2's
    latest DAG state, falling back to a unique active-name lookup; exit.
  - All L2s are in `review`, every L3 is in `review` with DAG state
    `merged`/`blocked`, and nothing is in `todo`/`working` -> run the ordered,
    user-gated review-and-merge flow, report completion, and stop tracking the
    campaign. L1 has no idle countdown because it has no periodic wake loop.

### Sending Prompts (the never-inline rule)

Never inline the prompt templates below into `-d '{...}'` — render each to a
temp file, wrap with `jq`, POST with `--data-binary @file` (see `rest-api.md` →
[Sending Request Bodies Safely](rest-api.md#sending-request-bodies-safely)).
For templated prompts, use a **quoted** heredoc (keeps `$`, backticks, and
quotes literal) and substitute only the real variables with `sed`, as in the
templates below. Cron-config prompts follow the same idea — build the whole
body with `jq --rawfile prompt ... '{name:..., config:{..., prompt:$prompt}}'`.
The `prompt` field on `POST .../follow-up` is limited to 32768 characters. A
larger payload returns a bare HTTP 400. Keep the target in `todo` or explicitly
stopped, queue all ordered and numbered chunks within the limit, including a
final "all parts sent" chunk, then move a `todo` target to `working` to consume
the full batch. Never send the first chunk to a `working` + idle target because
it may start before the remaining chunks arrive.

### Creating Each L2 Dispatch Issue

Repeat this flow for every confirmed workstream in the campaign. Reuse one
`campaignId`; never stop after creating a single catch-all L2.

Create and verify the complete L2 issue set before waking eligible L2s. Keep
capacity-blocked or dependency-blocked L2s in `todo`. Before waking a delayed
L2 after its prerequisite was merged to main, add an explicit first step to its
follow-up: `git merge {baseBranch}` into `bkd/{L2_ID}` before
reading source or decomposing its L3 DAG.

```bash
L2_TITLE="[L2] {workstream}: {short goal} [{campaignId}]"
L2=$(jq -n \
  --arg title "$L2_TITLE" \
  --arg campaign "campaign:{campaignId}" \
  '{title:$title,statusId:"todo",useWorktree:true,tags:["l2",$campaign]}' \
  | curl -sS --fail-with-body -X POST "$BKD_URL/projects/{projectId}/issues" \
  -H 'Content-Type: application/json' \
  -d @-) || exit 1
# Guard the envelope before extracting the ID — see SKILL.md's error-envelope guard
if ! printf '%s\n' "$L2" | jq -e '.success == true and (.data.id | type == "string")' >/dev/null; then
  printf 'BKD error: %s\n' "$(printf '%s\n' "$L2" | jq -r '.error // "invalid response"')" >&2
  exit 1
fi
L2_ID=$(printf '%s\n' "$L2" | jq -er '.data.id')

cat > /tmp/bkd-prompt.txt <<'PROMPT'
## Role
You are the L2 dispatch issue (campaignId=__CAMPAIGN_ID__) in a three-tier BKD
pattern and one member of a multiple-L2 campaign. Your branch is
bkd/__L2_ID__. Follow the "L2 - Scheduling Issue"
section of the bkd skill's references/three-tier-coordination.md verbatim: its
Hard Rules (never write source, never touch main, every L3 useWorktree:true),
Bootstrap (run THIS turn: 15-min self cron `l2-dispatch-__L2_ID__`, create real
L3 issues, emit snapshot), one Steady-State round per cron wake, the Merge
phase for green L3s, and Termination. Remain campaign-active; never sleep.
If BKD places the issue in review between turns, the live cron and final state
marker still make it campaign-active; only the verified termination sequence
means completion.

## Workstream Boundary
Name: {workstream name}
Goal: {bounded workstream goal}
Integration branch: {baseBranch}
Sibling L2s: {ids and one-line responsibilities}
Cross-L2 dependencies: {none, or prerequisite L2 ids}
Do not absorb sibling workstreams or redefine the campaign boundary.

## Cross-L2 Upstream Sync
(L1: include this section only when this L2 was delayed for a prerequisite;
delete it otherwise.) Before reading source or decomposing L3s, run
`git merge {baseBranch}` in this worktree so the branch
contains the prerequisite L2 work already merged by L1.

## Acceptance Criteria
- {criterion 1}
- {criterion 2}

## Scope
- In: {paths/modules}
- Out: {paths/modules}

## End-of-Turn Markers
Emit `[dag-state campaignId=__CAMPAIGN_ID__ l2Id=__L2_ID__]` every turn. Emit
`[L2-plan-snapshot vN campaignId=__CAMPAIGN_ID__ l2Id=__L2_ID__]` only during
bootstrap or an accepted scope change; never duplicate an unchanged snapshot.
Formats and rules are in "Campaign and DAG State" and "Context Discipline" of
the same reference. DAG states are L2-internal; BKD statusId stays in
{todo|working|review|done}.

## Reports and Escalations (to L1)
POST __BKD_URL__/projects/{projectId}/issues/__L1_ID__/follow-up
Progress rollups after each batch; yellow = needs user decision; blocked =
retries exceeded; final "branch bkd/__L2_ID__ ready" on termination.

## References (engine permitting, load on demand)
Keep references/three-tier-coordination.md loaded. Load rest-api.md,
quality-review.md (logs-filter assessment only), or merge-strategy.md only
when the current round needs them; load rest-api.md first whenever executing
examples from either companion reference. From merge-strategy.md, reuse only conflict,
rollback, and verification guidance; its coordinator/main-worktree steps are
for two-tier orchestration and are forbidden to L2. Do NOT preload all of them
every wake.
PROMPT
sed -i "s|__CAMPAIGN_ID__|$CAMPAIGN_ID|g; s|__L2_ID__|$L2_ID|g; s|__BKD_URL__|$BKD_URL|g; s|__L1_ID__|$L1_SESSION_ID|g" /tmp/bkd-prompt.txt
jq -n --rawfile prompt /tmp/bkd-prompt.txt '{prompt: $prompt}' > /tmp/bkd-body.json
# Queue the complete dispatch package while the new L2 is still todo.
L2_FOLLOWUP=$(curl -sS --fail-with-body -X POST "$BKD_URL/projects/{projectId}/issues/$L2_ID/follow-up" \
  -H 'Content-Type: application/json' --data-binary @/tmp/bkd-body.json) || exit 1
printf '%s\n' "$L2_FOLLOWUP" | jq -e '.success == true' >/dev/null || exit 1

# Start the first execution and consume the queued dispatch package.
L2_START=$(curl -sS --fail-with-body -X PATCH "$BKD_URL/projects/{projectId}/issues/$L2_ID" \
  -H 'Content-Type: application/json' \
  -d '{"statusId":"working"}') || exit 1
printf '%s\n' "$L2_START" | jq -e '.success == true' >/dev/null || exit 1
```

## L2 - Scheduling Issue (one per workstream, own worktree)

Each L2 issue dispatches one bounded campaign workstream, running in its own
worktree on branch `bkd/{L2_ID}`. A campaign always has multiple L2s. An L2
must reject scope that belongs to a sibling L2 and report the boundary issue to
L1. Its 15-minute self cron drives **one decision round per wake**, then the
turn ends. **No `sleep`, ever. Never touch main.**

### L2 Responsibilities

**Hard rules (no exceptions):**

- **No source edits.** Every implementation unit (even 1-line) becomes an L3 BKD issue. L2 may perform Git merge/revert operations, run checks, and create request bodies or detached-gate logs under `/tmp`; it must not use `$EDITOR`, `sed -i`, `cat`, `echo`, `tee`, or any editing tool on repository source files.
- **Never touch main.** All work happens in worktree `<WORKTREE_BASE>/{projectId}/{L2_ID}/` on branch `bkd/{L2_ID}`. Never `cd` to main, `git checkout main`, or merge into main — that integration is L1's job.
- **L3 mode is always `useWorktree: true`** (`useWorktree: false` would write to main). The simple/worktree mode-selection table from `orchestration.md` does NOT apply here.
- **Stay inside the assigned workstream.** Do not absorb sibling L2 scope or
  coordinate another L2's L3 issues. Cross-L2 questions go to L1 by follow-up.

**Bootstrap (first wake, single turn):**

1. Make bootstrap idempotent: query `GET /cron?deleted=false` for
   `l2-dispatch-{L2_ID}` and the project issue list for existing campaign L3s,
   following all cursor pages. Reuse exactly one active cron and all matching
   L3 IDs; more than one active cron is an error to escalate, not permission to
   create another.
2. If no active cron exists, register the 15-min self cron (`issue-follow-up`
   targeting self). Read source only for missing decomposition state, then
   create only missing L3 issues (`POST /issues` with `useWorktree:true` +
   campaign tag). Mental decomposition is invalid; a snapshot with zero L3 IDs
   fails validation.
3. Emit `[L2-plan-snapshot v1 campaignId={campaignId} l2Id={L2_ID}]` (cron ID + DAG + per-L3 self-contained spec referencing file paths only, including the project check command each L3 must pass) and `[dag-state ...]`. End turn.

**Steady-state wake (one decision round per cron fire):**

1. Pull latest snapshot via `logs/filter/types/assistant-message/turn/last5` and BKD issue states. DO NOT re-read source.
2. Check `/processes/capacity`; `availableSlots == 0` → skip this round.
3. Dispatch eligible L3s (upstream deps in DAG state `merged`); same-stage L3s parallel subject to capacity + file-overlap. **Upstream-sync for dependent L3s (mandatory):** BKD cuts `bkd/{L3_ID}` from the base branch, NOT from `bkd/{L2_ID}`, so a fresh dependent worktree does NOT contain upstream work already merged into `bkd/{L2_ID}`. Worktrees share local refs; the dependent L3's spec must open with `git merge --no-ff bkd/{L2_ID}` into its worktree branch, resolving conflicts, **before** implementation. Never use `origin/bkd/{L2_ID}` unless that remote ref was explicitly pushed and verified (see the Upstream Sync section of the [L3 Dispatch Payload](#l3-dispatch-payload-sent-by-l2)).
4. Evaluate completions immediately (do not batch) via `logs/filter` — classify green/yellow/red using only the logs-filter assessment in `quality-review.md`; this pattern relies on the L3's project checks rather than any specific external review skill:
   - **green** → merge phase.
   - **red** → if the L3 is still running, stop → verify review → follow-up
     (see [Loop Engine](#loop-engine)). Retry ≤ `N=2`; on exceed, set DAG
     state `blocked` + follow-up L1.
   - **yellow** → follow-up L1 for a human decision; do not guess.
5. Emit fresh `[dag-state ...]`. End turn.

**Merge phase (into `bkd/{L2_ID}`, never main):**

1. Confirm `git branch --show-current` == `bkd/{L2_ID}`; if not, abort and escalate to L1.
2. Require a clean tree and record `MERGE_BASE=$(git rev-parse HEAD)`. If
   unexpected source changes exist, stop and escalate; L2 must not commit or
   stash changes it did not author.
3. `git merge bkd/{L3_ID} --no-ff -m "L2 merge: {L3 title} (bkd/{L3_ID}) [{campaignId}]"`. On conflict → `git merge --abort` + escalate to L1.
4. Build/test after each merge. On failure → `git revert -m 1 HEAD --no-edit`,
   then follow-up the L3 with the error. Its `review` status is eligible: the
   follow-up moves it to `working` and wakes rework.
5. On success, set the L3's DAG state to `merged`. Leave its BKD status in `review` — `done` is human-only and triggers worktree auto-cleanup.
6. After each batch, follow-up L1 with a progress rollup referencing `bkd/{L2_ID}`.

**Termination** — when every L3 has DAG state `merged` or `blocked`, nothing is in `todo`/`working`, and no evaluation/merge is pending, enter the idle countdown (see [Idle Termination Countdown](#idle-termination-countdown)). On the 3rd consecutive idle wake:

1. Follow-up L1: "workstream {workstream} in campaign {campaignId} complete;
   branch `bkd/{L2_ID}` ready for L1 review and ordered merge into main".
2. Delete the L2 self-cron by its captured ID, assert success, and verify
   `isDeleted:true` on a re-read.
3. Move L2 itself to `review`.
4. End turn. L2 will not wake again.

### L2 15-minute Self Cron (bootstrap)

```bash
cat > /tmp/bkd-cron-prompt.txt <<'PROMPT'
L2 wake (campaignId={campaignId}). Run one Steady-State round per your dispatch prompt, then end turn.
PROMPT

L2_CRON=$(jq -n \
  --arg name "l2-dispatch-$L2_ID" \
  --arg issueId "$L2_ID" \
  --rawfile prompt /tmp/bkd-cron-prompt.txt \
  '{name:$name, cron:"*/15 * * * *", action:"issue-follow-up",
    config:{projectId:"{projectId}", issueId:$issueId, prompt:$prompt}}' \
  | curl -sS --fail-with-body -X POST "$BKD_URL/cron" \
      -H 'Content-Type: application/json' -d @-) || exit 1
if ! printf '%s\n' "$L2_CRON" | jq -e '.success == true and (.data.id | type == "string")' >/dev/null; then
  printf 'BKD error: %s\n' "$(printf '%s\n' "$L2_CRON" | jq -r '.error // "invalid response"')" >&2
  exit 1
fi
L2_CRON_ID=$(printf '%s\n' "$L2_CRON" | jq -er '.data.id')
```

Capture `.data.id` from the create response and persist it as `cronId` in the
L2 plan snapshot and DAG state. Deletion and any schedule change need the ID,
not the name. To change the schedule, delete by ID, assert success, and recreate
under the same name; no update route exists. If the stored ID is lost, recover
it with `GET /cron?deleted=false`, match `.name`, and require exactly one active
result across all cursor pages before acting.

## L3 - Subtask Issues (short lifecycle)

Each L3 issue is one short-lived process: one assigned task in, one report out,
exit. The dispatch payload below is the canonical statement of L3's rules;
in summary an L3:

- works only inside its worktree on branch `bkd/{L3_ID}` — never touches main,
  never switches branches; L2 merges the branch into `bkd/{L2_ID}` afterwards;
- runs the Upstream Sync step first when its spec includes one (dependent
  tasks — the branch is cut from the base branch, not `bkd/{L2_ID}`);
- executes **spec-bounded**: no codebase re-investigation, no reads outside the
  listed paths; missing info → report `status=blocked`, reason `spec
  incomplete`, never improvise;
- must make the project's own quality gate pass (lint/typecheck/test/build or
  the repo-defined subset — the payload names the exact command) before
  reporting; no external code-review skill is required;
- is auto-moved `working` -> `review` by BKD `autoMoveToReview` on completion —
  never changes status manually;
- reports completion to L2 via the exact follow-up URL in its payload
  (`status / changed files / key decisions / checks run + result / remaining
  issues`), then exits.

### L3 Dispatch Payload (sent by L2)

```bash
SUB_TITLE="[L3] {subtask title} [{campaignId}]"

SUB=$(jq -n \
  --arg title "$SUB_TITLE" \
  --arg campaign "campaign:{campaignId}" \
  '{title:$title,statusId:"todo",useWorktree:true,tags:["l3",$campaign]}' \
  | curl -sS --fail-with-body -X POST "$BKD_URL/projects/{projectId}/issues" \
  -H 'Content-Type: application/json' \
  -d @-) || exit 1
# Guard the envelope before extracting the ID — see SKILL.md's error-envelope guard
if ! printf '%s\n' "$SUB" | jq -e '.success == true and (.data.id | type == "string")' >/dev/null; then
  printf 'BKD error: %s\n' "$(printf '%s\n' "$SUB" | jq -r '.error // "invalid response"')" >&2
  exit 1
fi
SUB_ID=$(printf '%s\n' "$SUB" | jq -er '.data.id')

cat > /tmp/bkd-prompt.txt <<'PROMPT'
## Campaign
campaignId: __CAMPAIGN_ID__
baseBranch: {baseBranch}

## Worktree
You run in your own worktree on branch bkd/__SUB_ID__ (BKD-created, cut from
the base branch). All work happens here. Do NOT touch main. Do NOT cd
elsewhere. L2 will merge bkd/__SUB_ID__ into bkd/__L2_ID__ (NOT main) after
you report.

## Upstream Sync — REQUIRED FIRST STEP
(L2: include this section only for dependent L3s; delete it otherwise.)
Your branch does NOT contain upstream subtask work already merged into
bkd/__L2_ID__. Before implementing anything, run
`git merge --no-ff bkd/__L2_ID__` in your worktree branch and resolve any
conflicts. Use this shared local ref; do not assume a corresponding
`origin/bkd/__L2_ID__` ref exists.

## Self-Contained Spec — do NOT re-investigate the project
Everything you need is in this prompt. Do NOT search the codebase, read files
outside the paths listed below, or re-derive the goal — L2 already did that.
If a path or constraint is missing, REPORT BACK to L2 with status=blocked and
reason="spec incomplete"; do not improvise.

## Files In Scope (only these may be edited)
- {path/to/file/1} {line-range if narrow}
- {path/to/file/2}

## Files To Read For Context (read-only)
- {path/to/file/3}

## Requirements
{detailed implementation spec}

## Acceptance Criteria
- {criterion 1}
- {criterion 2}

## Design Constraints (inherited from L2 plan)
- {constraint 1}

## Mandatory Project Checks (before reporting)
Check command: {e.g. `npm run lint && npm run typecheck && npm test && npm run build`, or the repo-defined equivalent}
Implement against the acceptance criteria, then run the check command. If it
fails, fix and re-run until it passes. If it cannot pass for a reason outside
this spec, report status=blocked with the failing command and its output.
No external code-review skill is required.

If the check will run longer than a few minutes, follow "Long-running Gates and
Killed Turns": commit first, launch it detached with PID/log/commit metadata,
follow-up L2 with `[gate-pending ...]`, and end. L2 will wake this issue after
the detached command exits so it can collect and report the final result.

## Report Endpoint (use exactly this URL)
POST __BKD_URL__/projects/{projectId}/issues/__L2_ID__/follow-up
Report JSON shape:
{"prompt": "campaignId: __CAMPAIGN_ID__\nSubtask __SUB_ID__ ({title}) complete\nStatus: success|failure|partial|blocked\nChanged files: ...\nKey decisions: ...\nChecks: {command run} -> passed | {failing output}\nRemaining issues: ..."}

## Strict Rules
- Use ONLY the /follow-up HTTP endpoint above for inter-issue communication.
  Do not assume any engine-local slash command is available.
- Do not merge, do not create other issues, do not dispatch, do not touch
  main. After reporting, exit.
PROMPT
sed -i "s|__CAMPAIGN_ID__|$CAMPAIGN_ID|g; s|__SUB_ID__|$SUB_ID|g; s|__L2_ID__|$L2_ID|g; s|__BKD_URL__|$BKD_URL|g" /tmp/bkd-prompt.txt
jq -n --rawfile prompt /tmp/bkd-prompt.txt '{prompt: $prompt}' > /tmp/bkd-body.json
# Queue the complete spec while the new L3 is still todo.
SUB_FOLLOWUP=$(curl -sS --fail-with-body -X POST "$BKD_URL/projects/{projectId}/issues/$SUB_ID/follow-up" \
  -H 'Content-Type: application/json' --data-binary @/tmp/bkd-body.json) || exit 1
printf '%s\n' "$SUB_FOLLOWUP" | jq -e '.success == true' >/dev/null || exit 1

# Start the first execution and consume the queued spec.
SUB_START=$(curl -sS --fail-with-body -X PATCH "$BKD_URL/projects/{projectId}/issues/$SUB_ID" \
  -H 'Content-Type: application/json' \
  -d '{"statusId":"working"}') || exit 1
printf '%s\n' "$SUB_START" | jq -e '.success == true' >/dev/null || exit 1
```

## State Machine

Aligned with BKD's built-in flow:

```
todo -> working -> (autoMoveToReview) review -> done   <- done is human-only
                                              ^
                                              |
                          L2 red evaluation pulls back:
                          review/working -> working (rework)
```

- Each L2 remains campaign-active while its cron is live. It is `working`
  during execution but may appear in `review` between wakes depending on BKD
  lifecycle settings; only the verified termination sequence marks completion.
- BKD status and process state are related but not equivalent. Only an actual
  transition to `working` invokes the fire-and-forget auto-execute/flush hook;
  PATCHing an already-`working` issue does nothing. `/restart` directly spawns
  only for failed/cancelled sessions and replays the stored prompt. Use
  follow-up as the deterministic wake for new instructions.
- L3 subtasks land in `review` and stay there. While they sit in `review`, L1
  reviews `bkd/{L2_ID}` and merges it into main (git-level integration,
  orthogonal to BKD status). Issues move to `done` only when the user says so —
  `done` triggers worktree auto-cleanup, so it must happen after the main merge.

## Loop Engine

- **L1 is event-driven and has no cron.** A user message or an L2 follow-up
  wakes it. After handling that event and any affected campaign state, it ends
  the turn.
- **Every L2 owns one BKD `issue-follow-up` cron** at a 15-min interval. Each
  L2 wake performs **one round of decisions** and ends the turn; its next
  periodic round waits for its own cron fire.
- **Never** use `sleep`. **Never** poll inside a turn.
- `follow-up` to a `working` + idle issue triggers its next turn immediately.
- If the process has exited, follow-up auto-restarts a new process.
- A follow-up to `todo` or `done` only queues and cannot wake a process. For
  `todo`, POST the complete follow-up first, then PATCH to `working` so the
  transition consumes it. For `done`, PATCH to `review` first, then POST the
  follow-up; that request auto-moves it to `working`.
- A follow-up to `review` auto-moves the issue to `working` and wakes it; do not
  PATCH first.
- PATCHing an already-`working` issue does not wake it. `/restart` is only for
  failed/cancelled sessions and is not a general wake with a new instruction.
- **Stop → verify review → follow-up for a changed requirement (HARD RULE).** If a
  target issue is still actively running (`working`, mid-turn) and you need to
  change what it is doing — rework, new requirement, scope change — do NOT just
  follow-up (that queues behind the in-flight, now-discarded turn). Instead:
  1. `POST /issues/{id}/cancel` — request a soft interrupt. BKD clears the
     process's pending inputs and schedules retry/escalation in the background.
  2. Re-read once and require `statusId:review`. If it is still `working` and
     the correction cannot wait, call `POST /issues/{id}/terminate`; it clears
     inputs, force-kills the process, marks the session cancelled, and moves
     the issue to `review`.
  3. Verify `review`, then `POST /issues/{id}/follow-up` with the replacement
     requirement. That follow-up auto-moves the issue to `working` and starts
     the replacement turn.
  For an immediate hard stop, skip cancel and call `terminate` directly, then
  verify `review` before following up.
  (A plain progress-neutral follow-up to an *idle* `working` issue needs none
  of this — that path triggers immediately.)

## Context Discipline (lightweight wake-ups)

Cron fires often; if each wake re-loads source and re-derives the DAG, token
cost grows linearly with campaign length. These rules keep wakes O(1):

1. **One-shot decomposition.** L2's **first** wake reads source as needed,
   builds the DAG, drafts each L3 spec, and emits a single tagged assistant
   message — the **only** authoritative plan; later wakes never re-decompose:
   ```
   [L2-plan-snapshot v1 campaignId={campaignId} l2Id={L2_ID}]
   { cronId: "...", baseBranch: "...", gate: null, dag: [...], l3specs: [{ id, paths, acceptance, constraints }, ...] }
   [/L2-plan-snapshot]
   ```

2. **Snapshot retrieval.** Every later L2 wake opens with one filtered logs
   call to find the latest snapshot:
   ```bash
   SNAPSHOT_LOGS=$(curl -sS --fail-with-body \
     "$BKD_URL/projects/{projectId}/issues/$L2_ID/logs/filter/types/assistant-message/turn/last5") || exit 1
   printf '%s\n' "$SNAPSHOT_LOGS" | jq -e '.success == true and (.data.logs | type == "array")' >/dev/null || exit 1
   SNAPSHOT=$(printf '%s\n' "$SNAPSHOT_LOGS" \
     | jq '[.data.logs[].content // "" | select(contains("[L2-plan-snapshot"))] | last')
   ```
   If the snapshot is older than `turn/last5`, widen the window once; if still
   missing, this is a bug — escalate to L1 (`yellow`).

3. **Snapshot supersedes, not appends.** A scope change arrives as a fresh
   turn (L1 uses stop → verify review → follow-up, so the replacement is not
   queued behind stale work). L2 re-runs the read-source step **once**, emits
   `[L2-plan-snapshot v2 ...]` superseding v1, and returns to snapshot-only
   wakes. Each superseding emission is a "non-idle action" that resets the
   idle counter.

4. **Reference, never inline.** All cross-tier payloads (L1→L2, L2→L3, L3→L2
   reports) reference **file paths + line ranges**, never paste file contents —
   pasted contents would duplicate into every wake's context.

5. **L3 spec is self-contained.** The dispatch follow-up includes every file
   path L3 may touch, every constraint, the full report URL, and the
   campaignId. If L3 needs to re-investigate, the spec is incomplete; L3
   reports `blocked: spec incomplete` and L2 amends the snapshot.

6. **Logs filter, never bulk logs.** Always use
   `/logs/filter/types/.../turn/...` with the narrowest slice that answers the
   question. Never fetch `/logs` without filters.

7. **No re-discovery per wake.** If a wake feels like it needs to re-read
   source, the snapshot is incomplete: stop, amend it once (emit v(N+1)), then
   return to scan-only wakes.

**Wake budget heuristic** — a healthy L2 wake makes on the order of: 1
logs/filter call (snapshot), 1 `GET /issues` call (campaign state), 1
`/processes/capacity` call, 0–K issue mutations and 0–K evaluation logs/filter
calls (K = L3s changing state this round). No source-tree reads, no
`find`/`grep`, no test runs (unless verifying a merge this round). Exceeding
the budget usually means a missing snapshot field — fix the snapshot, not the
wake.

## Long-running Gates and Killed Turns

Never wait in-turn on a command longer than a few minutes (test suites, image
builds). Commit branch work first, then run the command detached with
`setsid`/`nohup` or the tool's background mode. Use a unique absolute log path
outside the repository and capture `{ pid, log, commit, command, startedAt }`.
The detached wrapper must append an unambiguous `exitCode=N` line after the
command finishes.

- **L2 gate:** persist those fields as `gate=pending(...)` in both the plan
  snapshot and DAG state, emit `[gate-pending ...]` as the final message, and
  end the turn. On each cron wake, first check whether the PID is still alive.
  If alive, retain the marker and end; if exited, read the complete log and
  `exitCode`, clear the gate, then continue success/failure handling.
- **L3 gate:** before ending, follow-up L2 with `[gate-pending l3Id=... pid=...
  log=... commit=...]`. L3 has no cron, so L2 owns collection: while the PID is
  alive it keeps the DAG actionable; after exit it follow-ups the same L3 to
  collect and report the result. That follow-up is the wake operation; do not
  substitute a status PATCH or `/restart`. Never assume an L3 has an
  independent next wake.

A detached run survives its parent turn being killed; an in-turn wait does not.
A killed turn may move the issue to `review` with no report. Before believing
completion, check commit count, `turnInFlight`, and the last assistant turn.
`review` + live cron + no valid final `[dag-state]`, `[gate-pending]`, or
`[idle-tick]` marker is a killed turn, not completion: resume it with a
follow-up rather than re-dispatching. A clean L2 wake may also sit in `review`
between turns depending on server lifecycle settings, so status alone is never
a completion signal. Per-batch commits bound the loss to one batch. To distinguish an
account-limit kill from a turn-duration or inactivity kill, search dead turns
for the literal `You've hit your session limit`.

## Idle Termination Countdown

Each L2 cron loop self-terminates after **3 consecutive idle wakes**. L1 has no
cron and therefore no idle countdown. No external state store is needed: the
count lives in the L2 issue's own assistant-message log.

### Idle definition

An L2 wake is **idle** when, after the normal decision round, no actionable work
is left: no owned L3 is in BKD `todo`/`working`; no evaluation, merge, or
escalation or detached gate is pending; and every owned L3 has DAG state
`merged` or `blocked`.
Any actionable step this wake (dispatch / evaluate / merge / escalate / report
to L1) resets the counter to 0 — do NOT emit `[idle-tick]`; the next idle wake
starts at 1.

### Counting

End each idle wake with `[idle-tick N/3]` as the FINAL assistant message (one
line, on its own). Compute `N` by counting the trailing consecutive
`[idle-tick` markers in the last 3 assistant turns — any non-idle turn in
between breaks the streak:

```bash
IDLE_LOGS=$(curl -sS --fail-with-body \
  "$BKD_URL/projects/{projectId}/issues/{selfIssueId}/logs/filter/types/assistant-message/turn/last3") || exit 1
PRIOR=$(printf '%s\n' "$IDLE_LOGS" \
  | jq -er 'if .success != true or (.data.logs | type != "array") then error(.error // "invalid logs response") else [.data.logs[].content] | reverse | reduce .[] as $c ({n:0,stop:false}; if .stop then . elif (($c // "") | contains("[idle-tick")) then .n += 1 else .stop = true end) | .n end') || exit 1
N=$((PRIOR + 1))
```

The marker also appears quoted in prose (including this counting turn's own
report), so only trailing consecutive matches count; never grep-count the
window. If the query disagrees with your own memory of the previous turn,
distrust the query and re-derive before acting on it.

### Termination action (`N == 3`)

The terminating L2 follows this 4-step pattern:

1. **Final outbound message.** Follow-up L1 with the payload below. This wakes
   L1, which aggregates the full multi-L2 campaign state.
2. **Delete own cron by ID** (captured at creation; if lost, recover via
   `GET /cron?deleted=false` by matching `.name` across all cursor pages and
   requiring one active result): `DELETE /cron/{cronId}`. Assert `.success` in the response; a
   by-name delete fails with `Job not found` and leaves the cron alive. Re-read
   it through `GET /cron?deleted=only` and verify `isDeleted:true`, the only
   truthful deletion field; `enabled`, `status`, and `nextExecution` remain
   misleading after deletion.
3. `PATCH` the L2 issue to `review`.
4. Emit `[idle-tick 3/3 -> L2 terminated]` and end the turn.

L2's final follow-up payload:

```text
[L2 terminating campaignId=$CAMPAIGN_ID l2Id=$L2_ID] This workstream's subtasks are done; nothing to dispatch for 3 rounds.
Branch bkd/$L2_ID is ready for L1 review and ordered merge into main. Check sibling L2s before declaring the campaign complete.
```

### Rules

- Marker MUST be the **final** assistant message of the turn —
  `logs/filter/turn/lastN` keys on it.
- 3 wakes ≈ 45 min. To change the window, adjust the **L2 cron interval**, not
  the count.
- User explicit stop bypasses the countdown — delete all campaign L2 crons by
  ID, assert success, and verify `isDeleted:true` immediately.
- Process-replacement-safe: a newly woken process reads the same trailing
  markers and continues the streak. Do not use `/restart` as a generic wake;
  it is limited to failed/cancelled sessions and replays the stored prompt.

## Exceptions and Escalation

- Subtask failure / timeout / red: retry up to `N` (default 2). On exceed: set
  DAG state `blocked` and follow-up L1.
- Changed requirement / rework / scope change for a still-running issue:
  stop → verify review → follow-up — never bare-follow-up a busy issue with a
  changed requirement. See [Loop Engine](#loop-engine).
- Merge conflict, ambiguous acceptance criteria, or scope changes: L2 does not
  guess — set DAG state `blocked` or classify `yellow` and escalate to L1,
  which aggregates and asks the user.
- BKD unreachable / capacity exhausted long term: pause dispatch; L1 notifies
  the user.

## Key Constraints

Compact checklist — the full rules live in the sections referenced.

1. **Follow-up only** for inter-issue communication: `POST /projects/{pid}/issues/{iid}/follow-up`.
2. **Capacity before every dispatch** — `/processes/capacity`.
3. **`review` != `done`** — `done` is human-only and triggers worktree auto-cleanup.
4. **Soft delete** — project and issue deletions are soft-delete by default.
5. **No `sleep`, ever** — L1 waits by ending its turn until a user/L2 event;
   each L2 waits by ending its turn until its own cron callback.
6. **Multiple L2s per campaign** — at least two bounded workstreams, never one
   catch-all L2. Continuations go only to the affected L2 or L2s; when unsure,
   ask the user.
7. **Each L2 owns only its internal DAG** (deps, capacity, evaluation,
   L3→`bkd/{L2_ID}` merges); L1 owns cross-L2 boundaries and dependencies,
   user-facing progress, yellow/blocked decisions, and ordered L2→main merges.
8. **L3 never dispatches, never merges** — one task in, one report out, exit.
9. **L2 idle cron self-termination** after 3 consecutive idle wakes;
   actionable work resets the streak; user stop bypasses it. Delete crons by
   captured ID, assert success, and verify `isDeleted:true`. L1 has no cron
   (see [Idle Termination Countdown](#idle-termination-countdown)).
10. **Only L1 writes to main**; L2/L3 always run with `useWorktree: true` — `orchestration.md`'s simple/worktree mode table does not apply here.
11. **Two L1 user-confirmation gates** — dispatch of the complete L2 set and
    each ordered L2→main merge, both requiring an explicit
    `proceed`/`ok`/`go`. Event-driven wakes may report but never cross either
    gate (see [L1 Responsibilities](#l1-responsibilities)).
12. **L2 never implements** — every unit, however trivial, becomes an L3 issue; a plan snapshot with zero L3 ids is invalid (see [L2 Responsibilities](#l2-responsibilities)).
13. **Context discipline** — decompose once, snapshot, reference paths not contents (see [Context Discipline](#context-discipline-lightweight-wake-ups)).
14. **Stop → verify review → follow-up** for changing a still-running issue.
    Try `cancel`, or use `terminate` directly for an immediate force-kill; never
    send the correction until `statusId:review` is confirmed (see [Loop
    Engine](#loop-engine)).
15. **Dependent L3 branches are cut from the base branch, not `bkd/{L2_ID}`** — the L3 spec must open with the upstream-sync merge of the shared local `bkd/{L2_ID}` ref; do not assume a remote ref exists (see [L3 Dispatch Payload](#l3-dispatch-payload-sent-by-l2)).
