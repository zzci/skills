# BKD Three-Tier Autonomous Coordination

Cron-driven L1/L2/L3 coordination that runs entirely inside BKD. L1, L2, and L3
are all BKD processes; all coordination, state, and loops are expressed through
BKD issues, follow-ups, and cron jobs. **Never** use subagents, external team
runners, or `sleep` waits.

Use this pattern when the user wants a long-running, self-driving pipeline where
the user-facing agent (L1) only talks to the user and reports progress, while
BKD itself owns task decomposition and dispatch (L2) and execution (L3).

**Engine-agnostic by design.** L1, L2, and L3 may each run on different agent
engines (Claude Code, Codex, or anything BKD supports). Prompts in this file
deliberately avoid slash-command shorthand (`/bkd`, `/pma-cr`, etc.) because not
every engine resolves them. State requirements as capabilities; if an engine has
a matching skill, mention it as a hint, never as the only path.

**Lightweight by design.** Cron fires often (every 30 min for L2, every hour for
L1). Each wake must do **scan + decide + act**, never re-investigate the
codebase: the plan is decomposed once at L2's first wake and snapshotted into
the issue log. See [Context Discipline](#context-discipline-lightweight-wake-ups).

**Only L1 writes to main.** L2 and L3 are fully isolated in their own worktrees
(`useWorktree: true`): L3 merges into L2's branch `bkd/{L2_ID}`, L2 never
touches main. L1 is the single integration point — it reviews `bkd/{L2_ID}`,
merges it into main, and resolves conflicts, but only after the user confirms.
Two user-confirmation gates are mandatory at L1 (dispatch and merge); see
[L1 Responsibilities](#l1-responsibilities).

## Table of Contents

- [When to Use This Pattern](#when-to-use-this-pattern)
- [Tier Map](#tier-map)
- [Campaign and DAG State](#campaign-and-dag-state)
- [Pre-Flight (every session)](#pre-flight-every-session)
- [L1 - Master Coordinator](#l1---master-coordinator-current-agent-session)
- [L2 - Scheduling Issue](#l2---scheduling-issue-one-per-task-own-worktree)
- [L3 - Subtask Issues](#l3---subtask-issues-short-lifecycle)
- [State Machine](#state-machine)
- [Loop Engine](#loop-engine)
- [Context Discipline (lightweight wake-ups)](#context-discipline-lightweight-wake-ups)
- [Idle Termination Countdown](#idle-termination-countdown)
- [Exceptions and Escalation](#exceptions-and-escalation)
- [Key Constraints](#key-constraints)

## When to Use This Pattern

Choose this over the two-tier flow in `orchestration.md` when: the work spans
multiple sessions or many hours and BKD must keep driving while the user-facing
agent is idle or offline; the user wants a single human-facing session that
only gathers context and reports progress, with all dispatch logic inside BKD;
the pipeline runs across heterogeneous engines without engine-specific slash
commands; subtasks need a real dependency DAG with capacity-aware scheduling
per wake; and you explicitly want `sleep`-free orchestration driven only by
`issue-follow-up` cron callbacks.

If the work fits in one session and a simple "create coordinator -> dispatch
subtasks -> wait -> merge" suffices, use `orchestration.md` instead.

## Tier Map

Compact overview; the per-tier Responsibilities sections below are canonical.

```
L1 (current agent session, any engine; main worktree)
  - talks to the user; gathers context; one L2 PER INDEPENDENT TASK
  - 60-min cron pings its own session issue for progress reports
  - gates: user must confirm every dispatch and every L2->main merge
  - integrates: reviews bkd/{L2_ID}, merges into main, resolves conflicts
      v  (after user confirms) follow-up: goal + acceptance + scope
         (reference paths, not file contents)
L2 (one dispatch issue per task; useWorktree: true; branch bkd/{L2_ID})
  - never writes source; decomposes goal into L3 BKD issues, dispatches,
    monitors, evaluates; 30-min self cron drives one decision round per wake
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

Every three-tier campaign needs a stable `campaignId`:

- Generate one at L1 bootstrap before creating L2, e.g.
  `CAMPAIGN_ID="l1-${L1_SESSION_ID}-$(date +%Y%m%d%H%M%S)"`.
- Put it in L2/L3 titles and tags; if a tagged create fails because tags are
  unsupported, retry without `tags` but keep it in the title.
- Include it in every L1/L2/L3 follow-up prompt. L1 finds owned issues by this
  `campaignId`, not by guessing from status or recent activity.

L2 owns the DAG state. At the end of every L2 turn, emit a compact state block
in the final assistant message so the next cron wake can resume without an
external store:

```text
[dag-state campaignId={campaignId}]
subtasks:
- id={issueId} title="{title}" mode=worktree|simple deps=[...] state=planned|dispatched|green|merged|blocked retries=0
pendingEscalations=[]
[/dag-state]
```

State meanings: `planned` = designed, not started; `dispatched` = moved to
`working`, awaiting completion; `green` = quality assessment passed, merge
pending; `merged` = L3 branch merged into `bkd/{L2_ID}` and verified;
`blocked` = cannot continue without L1/user input (keep the BKD issue in
`review` when possible; if still active, cancel or let it finish first).

## Pre-Flight (every session)

Do this every time L1 starts, before anything else:

1. Load BKD conventions: if your engine supports the `bkd` skill, load it;
   otherwise treat this file plus `references/rest-api.md` as authoritative and
   proceed via plain HTTP.
2. Auto-detect `$BKD_URL` and `projectId`. If either cannot be confirmed, ask
   the user. **Never guess.**
3. Run health and capacity checks; record `availableSlots`.
   ```bash
   curl -s "$BKD_URL/health" | jq
   curl -s "$BKD_URL/processes/capacity" | jq
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
- **Identify the session issue** at startup — it is the cron callback target
  for L1's own wake-ups. If it cannot be obtained, ask the user; if the user
  cannot provide one, fall back to "user manually triggers query each time"
  and **do not register the L1 cron**.
- **Gather requirements** from the user; read code and docs for context. Do
  not write code, do not split tasks. Capture findings as **file paths + line
  ranges + brief notes**, NOT pasted contents — keeps the L1→L2 follow-up small.
- **Classify the request: new task vs continuation** (ask when not obvious):
  - **New independent task** -> a **new** L2 with its own `campaignId` and
    worktree. One independent task = one L2.
  - **Continuation** of an in-flight L2 (same scope, added requirement, scope
    tweak, bug found in review) -> follow-up the existing L2; if it is
    mid-turn, use stop → follow-up → start (see [Loop Engine](#loop-engine))
    so L2 folds the change into its snapshot and DAG on a clean turn.
  - **Unsure** -> ask. Never silently fold unrelated work into an existing L2.
- **User confirmation gate (HARD RULE — no exceptions).** L1 may NOT create an
  L2, send a continuation follow-up, or otherwise hand work to L2 until the
  user explicitly confirms:
  1. Draft the dispatch package: classification (new vs continuation + target
     L2 id), `{ goal, acceptance criteria, impact scope (paths), out-of-scope }`,
     plus open questions.
  2. Present it in plain text; resolve every open question by asking.
  3. Wait for an **explicit affirmative** — `proceed`/`ok`/`go`/`confirm`.
     Silence, "thanks", or a partial answer is NOT confirmation.
  4. If the user pushes back, revise, re-present, and wait again.
  5. Only then create the L2 (new task) or send the follow-up (continuation).
  Applies to **every** dispatch — first L2, every continuation, every scope
  change. The hourly cron may report progress but never crosses this gate.
- For each confirmed new task, package `{ goal, acceptance criteria, impact
  scope (paths) }` and create one L2 issue **with `useWorktree: true`**
  (mandatory), delivering the package + `campaignId` via follow-up. L1 may own
  **multiple L2s concurrently** — one campaign per L2.
- **L2 branch review and merge (L1 owns this).** When L2 reports "campaign
  done, branch `bkd/{L2_ID}` ready":
  1. **Review** against the agreed goal/acceptance: inspect
     `git diff main...bkd/{L2_ID}`, confirm scope, run the project's checks on
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
- **Register a 60-minute cron** (`issue-follow-up` targeting the session
  issue). On each wake: query issues per owned `campaignId` and summarize
  progress; handle yellow/blocked escalations; run the review-and-merge flow
  for ready campaigns (still user-gated — never auto-merge); if the user is
  absent, log the snapshot and wait.
- **Termination conditions** (evaluated per campaign):
  - User explicitly stops -> delete the L1 cron and every owned L2 cron
    immediately; exit (no countdown).
  - One campaign steady-state idle (L2 in `review`; every L3 in `review` with
    DAG state `merged`/`blocked`; nothing in `todo`/`working`; no pending
    escalation) -> run the review-and-merge flow, then stop tracking it.
  - ALL campaigns idle -> L1 idle countdown (see
    [Idle Termination Countdown](#idle-termination-countdown)); on the 3rd
    consecutive idle wake, final report, delete the L1 cron, exit.

### Sending Prompts (the never-inline rule)

Never inline the prompt templates below into `-d '{...}'` — render each to a
temp file, wrap with `jq`, POST with `--data-binary @file` (see `rest-api.md` →
[Sending Request Bodies Safely](rest-api.md#sending-request-bodies-safely)).
For templated prompts, use a **quoted** heredoc (keeps `$`, backticks, and
quotes literal) and substitute only the real variables with `sed`, as in the
templates below. Cron-config prompts follow the same idea — build the whole
body with `jq --rawfile prompt ... '{name:..., config:{..., prompt:$prompt}}'`.

### Creating the L2 Dispatch Issue

```bash
L2=$(curl -s -X POST "$BKD_URL/projects/{projectId}/issues" \
  -H 'Content-Type: application/json' \
  -d '{"title":"[L2] dispatch: {short goal} [{campaignId}]","statusId":"todo","useWorktree":true,"tags":["l2","campaign:{campaignId}"]}')
# Guard the envelope before extracting the ID — see SKILL.md's error-envelope guard
echo "$L2" | jq -e '.success' >/dev/null || { echo "BKD error: $(echo "$L2" | jq -r '.error // "unknown"')" >&2; false; }
L2_ID=$(echo "$L2" | jq -r '.data.id')

cat > /tmp/bkd-prompt.txt <<'PROMPT'
## Role
You are the L2 dispatch issue (campaignId=__CAMPAIGN_ID__) in a three-tier BKD
pattern. Your branch is bkd/__L2_ID__. Follow the "L2 - Scheduling Issue"
section of the bkd skill's references/three-tier-coordination.md verbatim: its
Hard Rules (never write source, never touch main, every L3 useWorktree:true),
Bootstrap (run THIS turn: 30-min self cron `l2-dispatch-__L2_ID__`, create real
L3 issues, emit snapshot), one Steady-State round per cron wake, the Merge
phase for green L3s, and Termination. Stay in BKD statusId=working; never sleep.

## Goal
{full goal description}

## Acceptance Criteria
- {criterion 1}
- {criterion 2}

## Scope
- In: {paths/modules}
- Out: {paths/modules}

## End-of-Turn Markers (emit BOTH every turn)
[L2-plan-snapshot vN campaignId=__CAMPAIGN_ID__] and
[dag-state campaignId=__CAMPAIGN_ID__] — formats and rules in "Campaign and
DAG State" and "Context Discipline" of the same reference. DAG states are
L2-internal; BKD statusId stays in {todo|working|review|done}.

## Reports and Escalations (to L1)
POST __BKD_URL__/projects/{projectId}/issues/__L1_ID__/follow-up
Progress rollups after each batch; yellow = needs user decision; blocked =
retries exceeded; final "branch bkd/__L2_ID__ ready" on termination.

## References (engine permitting, load on demand)
Keep references/three-tier-coordination.md loaded. Load rest-api.md,
quality-review.md (logs-filter assessment only), or merge-strategy.md only
when the current round needs them. Do NOT preload all of them every wake.
PROMPT
sed -i "s|__CAMPAIGN_ID__|$CAMPAIGN_ID|g; s|__L2_ID__|$L2_ID|g; s|__BKD_URL__|$BKD_URL|g; s|__L1_ID__|$L1_SESSION_ID|g" /tmp/bkd-prompt.txt
jq -n --rawfile prompt /tmp/bkd-prompt.txt '{prompt: $prompt}' > /tmp/bkd-body.json
curl -s -X POST "$BKD_URL/projects/{projectId}/issues/$L2_ID/follow-up" \
  -H 'Content-Type: application/json' --data-binary @/tmp/bkd-body.json | jq

curl -s -X PATCH "$BKD_URL/projects/{projectId}/issues/$L2_ID" \
  -H 'Content-Type: application/json' \
  -d '{"statusId":"working"}' | jq
```

### Registering L1's 60-minute Cron

```bash
curl -s -X POST "$BKD_URL/cron" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "l1-progress-'"$L1_SESSION_ID"'",
    "cron": "0 * * * *",
    "action": "issue-follow-up",
    "config": {
      "projectId": "{projectId}",
      "issueId": "'"$L1_SESSION_ID"'",
      "prompt": "Hourly L1 wake. Report campaign progress per your L1 instructions, then end turn. Never auto-dispatch."
    }
  }' | jq
```

## L2 - Scheduling Issue (one per task, own worktree)

The L2 issue is the dispatcher for one independent task, running in its own
worktree on branch `bkd/{L2_ID}`. Its 30-minute self cron drives **one decision
round per wake**, then the turn ends. **No `sleep`, ever. Never touch main.**

### L2 Responsibilities

**Hard rules (no exceptions):**

- **No source edits.** Every implementation unit (even 1-line) becomes an L3 BKD issue. L2's only file writes are git operations on L3 branches (`merge`/`revert`/`commit -m`/`stash`) plus build/test commands. No `$EDITOR`, `sed -i`, `cat > file`, `echo >`, `tee`, or any source-editing tool.
- **Never touch main.** All work happens in worktree `<WORKTREE_BASE>/{projectId}/{L2_ID}/` on branch `bkd/{L2_ID}`. Never `cd` to main, `git checkout main`, or merge into main — that integration is L1's job.
- **L3 mode is always `useWorktree: true`** (`useWorktree: false` would write to main). The simple/worktree mode-selection table from `orchestration.md` does NOT apply here.

**Bootstrap (first wake, single turn):**

1. Register the 30-min self cron (`issue-follow-up` targeting self).
2. Read whatever source is needed for decomposition, then **create** each L3 as a real BKD issue (`POST /issues` with `useWorktree:true` + campaign tag) — mental decomposition is invalid; a snapshot with zero L3 ids fails validation.
3. Emit `[L2-plan-snapshot v1 campaignId={campaignId}]` (DAG + per-L3 self-contained spec referencing file paths only, including the project check command each L3 must pass) and `[dag-state ...]`. End turn.

**Steady-state wake (one decision round per cron fire):**

1. Pull latest snapshot via `logs/filter/types/assistant-message/turn/last5` and BKD issue states. DO NOT re-read source.
2. Check `/processes/capacity`; `availableSlots == 0` → skip this round.
3. Dispatch eligible L3s (upstream deps in DAG state `merged`); same-stage L3s parallel subject to capacity + file-overlap. **Upstream-sync for dependent L3s (mandatory):** BKD cuts `bkd/{L3_ID}` from the base branch (main), NOT from `bkd/{L2_ID}`, so a fresh dependent worktree does NOT contain upstream work already merged into `bkd/{L2_ID}`. The dependent L3's spec must open with an explicit step: `git fetch origin && git merge origin/bkd/{L2_ID}` into its worktree branch, resolving conflicts, **before** implementation (see the Upstream Sync section of the [L3 Dispatch Payload](#l3-dispatch-payload-sent-by-l2)).
4. Evaluate completions immediately (do not batch) via `logs/filter` — classify green/yellow/red using the logs-filter assessment in `quality-review.md` (skip its pma-cr self-review section; this pattern relies on the L3's project checks instead):
   - **green** → merge phase.
   - **red** → if the L3 is still running, stop → follow-up → start (see [Loop Engine](#loop-engine)). Retry ≤ `N=2`; on exceed, set DAG state `blocked` + follow-up L1.
   - **yellow** → follow-up L1 for a human decision; do not guess.
5. Emit fresh `[dag-state ...]`. End turn.

**Merge phase (into `bkd/{L2_ID}`, never main):**

1. Confirm `git branch --show-current` == `bkd/{L2_ID}`; if not, abort and escalate to L1.
2. Ensure clean tree (commit or stash L2-side state), record `MERGE_BASE=$(git rev-parse HEAD)`.
3. `git merge bkd/{L3_ID} --no-ff -m "L2 merge: {L3 title} (bkd/{L3_ID}) [{campaignId}]"`. On conflict → `git merge --abort` + escalate to L1.
4. Build/test after each merge. On failure → `git revert -m 1 HEAD --no-edit`, follow-up the L3 with the error, return BKD status to `working`.
5. On success, set the L3's DAG state to `merged`. Leave its BKD status in `review` — `done` is human-only and triggers worktree auto-cleanup.
6. After each batch, follow-up L1 with a progress rollup referencing `bkd/{L2_ID}`.

**Termination** — when every L3 has DAG state `merged` or `blocked`, nothing is in `todo`/`working`, and no evaluation/merge is pending, enter the idle countdown (see [Idle Termination Countdown](#idle-termination-countdown)). On the 3rd consecutive idle wake:

1. Follow-up L1: "campaign {campaignId} complete; branch `bkd/{L2_ID}` ready for L1 review and merge into main".
2. Delete the L2 self-cron (`l2-dispatch-{L2_ID}`).
3. Move L2 itself to `review`.
4. End turn. L2 will not wake again.

### L2 30-minute Self Cron (bootstrap)

```bash
curl -s -X POST "$BKD_URL/cron" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "l2-dispatch-'"$L2_ID"'",
    "cron": "*/30 * * * *",
    "action": "issue-follow-up",
    "config": {
      "projectId": "{projectId}",
      "issueId": "'"$L2_ID"'",
      "prompt": "L2 wake (campaignId={campaignId}). Run one Steady-State round per your dispatch prompt, then end turn."
    }
  }' | jq
```

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
  | curl -s -X POST "$BKD_URL/projects/{projectId}/issues" \
  -H 'Content-Type: application/json' \
  -d @-)
# Guard the envelope before extracting the ID — see SKILL.md's error-envelope guard
echo "$SUB" | jq -e '.success' >/dev/null || { echo "BKD error: $(echo "$SUB" | jq -r '.error // "unknown"')" >&2; false; }
SUB_ID=$(echo "$SUB" | jq -r '.data.id')

cat > /tmp/bkd-prompt.txt <<'PROMPT'
## Campaign
campaignId: __CAMPAIGN_ID__

## Worktree
You run in your own worktree on branch bkd/__SUB_ID__ (BKD-created, cut from
the base branch). All work happens here. Do NOT touch main. Do NOT cd
elsewhere. L2 will merge bkd/__SUB_ID__ into bkd/__L2_ID__ (NOT main) after
you report.

## Upstream Sync — REQUIRED FIRST STEP
(L2: include this section only for dependent L3s; delete it otherwise.)
Your branch does NOT contain upstream subtask work already merged into
bkd/__L2_ID__. Before implementing anything: `git fetch origin`, then
`git merge origin/bkd/__L2_ID__` into your worktree branch, resolve any
conflicts, and commit the merge.

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
curl -s -X POST "$BKD_URL/projects/{projectId}/issues/$SUB_ID/follow-up" \
  -H 'Content-Type: application/json' --data-binary @/tmp/bkd-body.json | jq

curl -s -X PATCH "$BKD_URL/projects/{projectId}/issues/$SUB_ID" \
  -H 'Content-Type: application/json' \
  -d '{"statusId":"working"}' | jq
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

- L2 stays `working` for the whole campaign (its 30-min cron keeps waking it).
- L3 subtasks land in `review` and stay there. While they sit in `review`, L1
  reviews `bkd/{L2_ID}` and merges it into main (git-level integration,
  orthogonal to BKD status). Issues move to `done` only when the user says so —
  `done` triggers worktree auto-cleanup, so it must happen after the main merge.

## Loop Engine

- **The only driver is the BKD `issue-follow-up` cron.** L1 cron: 60 min.
  L2 cron: 30 min.
- Every wake performs **one round of decisions** and then **ends the turn**.
  The next round waits for the next cron fire.
- **Never** use `sleep`. **Never** poll inside a turn.
- `follow-up` to a `working` + idle issue triggers its next turn immediately.
- If the process has exited, follow-up auto-restarts a new process.
- **Stop → follow-up → start for a changed requirement (HARD RULE).** If a
  target issue is still actively running (`working`, mid-turn) and you need to
  change what it is doing — rework, new requirement, scope change — do NOT just
  follow-up (that queues behind the in-flight, now-discarded turn). Instead:
  1. `POST /issues/{id}/cancel` — gracefully stop the running turn; wait. If it
     does not stop (hung), escalate to `POST /issues/{id}/terminate`.
  2. `POST /issues/{id}/follow-up` — send the new/changed requirement (queued
     while the issue is stopped).
  3. `PATCH /issues/{id} {statusId:"working"}` — start a fresh turn that picks
     up the queued follow-up.
  (A plain progress-neutral follow-up to an *idle* `working` issue needs none
  of this — that path triggers immediately.)

## Context Discipline (lightweight wake-ups)

Cron fires often; if each wake re-loads source and re-derives the DAG, token
cost grows linearly with campaign length. These rules keep wakes O(1):

1. **One-shot decomposition.** L2's **first** wake reads source as needed,
   builds the DAG, drafts each L3 spec, and emits a single tagged assistant
   message — the **only** authoritative plan; later wakes never re-decompose:
   ```
   [L2-plan-snapshot v1 campaignId={campaignId}]
   { dag: [...], modes: {...}, l3specs: [{ id, paths, acceptance, constraints }, ...] }
   [/L2-plan-snapshot]
   ```

2. **Snapshot retrieval.** Every later L2 wake opens with one filtered logs
   call to find the latest snapshot:
   ```bash
   curl -s "$BKD_URL/projects/{projectId}/issues/$L2_ID/logs/filter/types/assistant-message/turn/last5" \
     | jq '[.data[].content // "" | select(contains("[L2-plan-snapshot"))] | last'
   ```
   If the snapshot is older than `turn/last5`, widen the window once; if still
   missing, this is a bug — escalate to L1 (`yellow`).

3. **Snapshot supersedes, not appends.** A scope change arrives as a fresh
   turn (L1 uses stop → follow-up → start, so it is never queued behind stale
   work). L2 re-runs the read-source step **once**, emits
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

## Idle Termination Countdown

L1 and L2 cron loops self-terminate after **3 consecutive idle wakes**. No
external state store — the count lives in the tier's own assistant-message log.

### Idle definition

A wake is **idle** when, after the normal decision round, no actionable work
is left. **L2 idle**: no L3 in BKD `todo`/`working`; no pending evaluation,
merge, or escalation; every L3 has DAG state `merged` or `blocked`. **L1
idle**: every owned L2 is in `review` with all its L3s in `review` (DAG
`merged`/`blocked`); no escalation queued; no user input waiting; one in-flight
L2 → L1 not idle. Any actionable step this wake (dispatch / evaluate / merge /
escalate / progress report to user) resets the counter to 0 — do NOT emit
`[idle-tick]`; the next idle wake starts at 1.

### Counting

End each idle wake with `[idle-tick N/3]` as the FINAL assistant message (one
line, on its own). Compute `N` by counting the trailing consecutive
`[idle-tick` markers in the last 3 assistant turns — any non-idle turn in
between breaks the streak:

```bash
PRIOR=$(curl -s "$BKD_URL/projects/{projectId}/issues/{selfIssueId}/logs/filter/types/assistant-message/turn/last3" \
  | jq '[.data[].content] | reverse | reduce .[] as $c ({n:0,stop:false}; if .stop then . elif (($c // "") | contains("[idle-tick")) then .n += 1 else .stop = true end) | .n')
N=$((PRIOR + 1))
```

### Termination action (`N == 3`)

Both tiers follow the same 4-step pattern:

1. **Final outbound message.** L2 → follow-up L1 (template below). L1 → final
   user report (assistant message in this turn).
2. **Delete own cron.** L2 → `DELETE /cron/l2-dispatch-$L2_ID`. L1 →
   `DELETE /cron/l1-progress-$L1_SESSION_ID`, plus defensively any owned L2 crons.
3. **L2 only**: `PATCH` self issue to `review` (L1 leaves its session issue
   untouched).
4. Emit `[idle-tick 3/3 -> {L1|L2} terminated]` and end turn.

L2's final follow-up payload:

```text
[L2 terminating campaignId=$CAMPAIGN_ID] All subtasks done; nothing to dispatch for 3 rounds.
Branch bkd/$L2_ID ready for L1 review and merge into main.
```

### Rules

- Marker MUST be the **final** assistant message of the turn —
  `logs/filter/turn/lastN` keys on it.
- 3 wakes ≈ 90 min for L2, 3 h for L1. To change the window, adjust the **cron
  interval**, not the count (kept at 3 so termination logic stays uniform).
- User explicit stop bypasses the countdown — delete crons immediately.
- Restart-safe: a new process reads the same trailing markers and continues
  the streak; restart alone does not reset it.

## Exceptions and Escalation

- Subtask failure / timeout / red: retry up to `N` (default 2). On exceed: set
  DAG state `blocked` and follow-up L1.
- Changed requirement / rework / scope change for a still-running issue:
  stop → follow-up → start — never bare-follow-up a busy issue with a changed
  requirement. See [Loop Engine](#loop-engine).
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
5. **No `sleep`, ever** — all waiting is cron callbacks plus ending the turn.
6. **One L2 per independent task**; continuations follow-up the existing L2; when unsure, ask the user.
7. **L2 owns the DAG** (deps, capacity, evaluation, L3→`bkd/{L2_ID}` merges); L1 owns user-facing progress, yellow/blocked decisions, and the final L2→main integration.
8. **L3 never dispatches, never merges** — one task in, one report out, exit.
9. **Idle cron self-termination** after 3 consecutive idle wakes; actionable work resets the streak; user stop bypasses it (see [Idle Termination Countdown](#idle-termination-countdown)).
10. **Only L1 writes to main**; L2/L3 always run with `useWorktree: true` — `orchestration.md`'s simple/worktree mode table does not apply here.
11. **Two L1 user-confirmation gates** — dispatch and L2→main merge, both requiring an explicit `proceed`/`ok`/`go`; the hourly cron may report but never cross either gate (see [L1 Responsibilities](#l1-responsibilities)).
12. **L2 never implements** — every unit, however trivial, becomes an L3 issue; a plan snapshot with zero L3 ids is invalid (see [L2 Responsibilities](#l2-responsibilities)).
13. **Context discipline** — decompose once, snapshot, reference paths not contents (see [Context Discipline](#context-discipline-lightweight-wake-ups)).
14. **Stop → follow-up → start** for changing a still-running issue (see [Loop Engine](#loop-engine)); applies to L2→L3 rework and L1→L2 scope changes alike.
15. **Dependent L3 branches are cut from the base branch, not `bkd/{L2_ID}`** — the L3 spec must open with the upstream-sync merge of `origin/bkd/{L2_ID}` (see [L3 Dispatch Payload](#l3-dispatch-payload-sent-by-l2)).
