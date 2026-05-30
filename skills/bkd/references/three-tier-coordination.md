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
deliberately avoid slash-command shorthand (`/bkd`, `/pma-cr`, etc.) because
not every engine resolves them. State requirements as capabilities; if an
engine has a matching skill, mention it as a hint, never as the only path.

**Lightweight by design.** Cron fires often (every 15 min for L2, every hour
for L1). Each wake must do **scan + decide + act**, never **re-investigate the
codebase**. The plan is decomposed once at L2's first wake and snapshotted into
the issue log; subsequent wakes read the snapshot, not the source. See
[Context Discipline](#context-discipline-lightweight-wake-ups).

**Main tree is read-only.** L1 observes git state but writes nothing on the
main worktree. Every L2 runs in its **own** worktree (`useWorktree: true`,
branch `bkd/{L2_ID}`) and merges its L3 subtasks into its **own** branch — not
main. Whether the L2 branch eventually merges into main is a **human**
decision.

**Human-in-the-loop is mandatory at the L1→L2 boundary.** L1's job is to
understand the user's intent and reach explicit agreement before any L2 is
created or a continuation follow-up is sent. L1 may NOT auto-dispatch, even
when the requirement looks obvious. The user's explicit confirmation (e.g.
`proceed`, `ok`, `go`) is the gate. Without it: clarify, iterate, ask again.
After L2 finishes, L1 also brings results back to the user for acceptance —
nothing closes silently.

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

Choose this over the two-tier flow in `orchestration.md` when:

- The work spans multiple sessions or many hours and you want BKD to keep
  driving while the user-facing agent is idle or offline.
- The user wants a single human-facing "coordinator" session that only does
  context gathering and progress reporting, with all dispatch logic inside BKD.
- The pipeline must run across heterogeneous engines (e.g., L1 on Claude Code,
  L2 on Codex, L3 on whatever engine BKD assigns) without depending on
  engine-specific slash commands.
- Subtasks need a real dependency DAG (not all parallel, not all serial), with
  capacity-aware scheduling on every wake.
- You explicitly want `sleep`-free orchestration driven only by `issue-follow-up`
  cron callbacks.

If the work fits in one session and a simple "create coordinator -> dispatch
subtasks -> wait -> merge" suffices, use `orchestration.md` instead.

## Tier Map

```
L1 (current agent session, any engine)
  - lives on main worktree, READ-ONLY (observes git, never writes)
  - talks to user, gathers context, defines goal + acceptance + scope
  - owns one L2 PER INDEPENDENT TASK (not "one ever")
  - on new user request: ask "continuation of which L2?" vs "new task"
  - 60min cron pings L1's own session issue to report progress
  - BEFORE dispatching to L2: present understood goal/acceptance/scope to
    user and WAIT for explicit confirmation (proceed/ok/go). No auto-dispatch.

  v   (only after user confirms) follow-up: goal + acceptance + scope
      (reference paths, not file contents)

L2 (one dispatch issue per independent task; useWorktree: true)
  - runs in its own worktree on branch bkd/{L2_ID}
  - first wake: decompose goal into L3 DAG, write a plan snapshot to its own log
  - subsequent wakes: read snapshot + BKD state; no source re-reads
  - 15min self cron drives the dispatch loop
  - merges L3 branches into bkd/{L2_ID} (NOT main); main is human-only
  - reports rollups + escalations back to L1
  - on done: bkd/{L2_ID} ready for user review/merge into main

  v   create + follow-up (self-contained spec + acceptance + report URL)

L3 (one issue per subtask; useWorktree: true; short-lived)
  - branch bkd/{L3_ID}, merge target is bkd/{L2_ID} (L2's branch)
  - implements one assigned task using ONLY the spec it was given
  - mandatory diff self-review (engine's review skill if available, else manual; fix P0/P1)
  - auto-moves to review via autoMoveToReview, then follow-ups report to L2
  - never dispatches, never merges, never re-investigates the project
```

## Campaign and DAG State

BKD issue status is limited to `todo`, `working`, `review`, and `done`. The
words `planned`, `dispatched`, `green`, `merged`, and `blocked` in this file are
**L2-internal DAG states**, not BKD `statusId` values. Never PATCH an issue to
`merged` or `blocked`.

Every three-tier campaign needs a stable `campaignId`.

- Generate one at L1 bootstrap before creating L2, e.g.
  `CAMPAIGN_ID="l1-${L1_SESSION_ID}-$(date +%Y%m%d%H%M%S)"`.
- Put it in L2 and L3 titles and tags when the API supports tags.
- If a tagged create request fails because tags are unsupported, retry without
  `tags` but keep the `campaignId` in the title and all follow-up prompts.
- Include it in every L1/L2/L3 follow-up prompt.
- L1 finds owned issues by this `campaignId`, not by guessing from status or
  recent activity.

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

State meanings:

- `planned`: L2 has designed the subtask but has not started it.
- `dispatched`: BKD issue was moved to `working`; L2 is waiting for completion.
- `green`: coordinator quality assessment passed; merge/integration is pending.
- `merged`: work is integrated into main. In simple mode this means the subtask
  passed assessment because it already worked on main; in worktree mode this
  means the branch merged and verification passed.
- `blocked`: L2 cannot continue this subtask without L1/user input. Keep the BKD
  issue in `review` when possible; if it is still active, cancel or let it
  finish before marking the internal state blocked.

## Pre-Flight (every session)

Do this every time L1 starts, before anything else:

1. Load BKD conventions: if your engine supports the `bkd` skill, load it;
   otherwise, treat this file plus `references/rest-api.md` as the authoritative
   reference and proceed via plain HTTP.
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

L1 **is** the current agent session, whichever engine is running it. It is
itself a BKD process running under some `issueId` (the session issue). The
engine identity does not matter; only BKD HTTP semantics do.

### L1 Responsibilities

- **Main tree is read-only for L1.** L1 may `git status`, `git log`,
  `git diff` to observe state, but **must not** edit, stage, commit, branch,
  switch, merge, or otherwise modify files on the main worktree. All write
  work happens inside L2 / L3 worktrees. If L1 finds itself wanting to edit
  a file, the work belongs in an L2/L3, not in L1.
- **Identify the session issue** at startup: confirm or obtain the `issueId`
  that backs this session, because that is the cron callback target for L1's
  own wake-ups. If it cannot be obtained, ask the user; if the user cannot
  provide one, fall back to "user manually triggers query each time" and **do
  not register the L1 cron**.
- **Gather requirements** from the user; read code and docs for context.
  Do not write code, do not split tasks. Capture findings as **file paths +
  line ranges + brief notes**, NOT pasted file contents — the L1→L2 follow-up
  stays small that way.
- **Classify the request: new task vs continuation.** Before creating any
  L2, decide (asking the user when not obvious):
  - **New independent task** -> create a **new** L2 with its own
    `campaignId` and its own worktree. One independent task = one L2.
  - **Continuation** of an in-flight L2 (same scope, additional requirement,
    scope tweak, bug found during review) -> send a follow-up to that L2;
    do not create a new one. L2 will fold the addition into its existing
    plan snapshot and DAG.
  - **Unsure** -> ask the user. Never silently fold unrelated work into an
    existing L2 (it breaks the worktree's scope and the DAG).
- **User confirmation gate (HARD RULE — no exceptions).** L1 may NOT create an
  L2 issue, send a continuation follow-up, or otherwise hand work off to L2
  until the user has explicitly confirmed the dispatch. Steps:
  1. Draft the dispatch package: classification (new vs continuation +
     target L2 id), `{ goal, acceptance criteria, impact scope (paths),
     out-of-scope }`, and any open questions surfaced during gathering.
  2. Present the draft to the user in plain text. Resolve every open
     question by asking, not by guessing.
  3. Wait for an **explicit affirmative reply** — `proceed`, `ok`, `go`,
     `confirm`, or equivalent. Silence, an acknowledgement like "thanks",
     or a partial answer is NOT confirmation.
  4. If the user pushes back, iterate (revise the draft, re-present, wait
     again). Loop until the user explicitly confirms.
  5. Only after explicit confirmation: create the L2 issue (new task) or
     send the follow-up (continuation), passing the agreed package.
  This applies to **every** dispatch: the first L2 of a campaign, every
  continuation follow-up, and every scope-change follow-up. The cron hourly
  wake-up may report progress freely, but must not itself trigger a new
  dispatch without going through this gate first.
- For each confirmed new task, package `{ goal, acceptance criteria, impact
  scope (paths) }` and create one L2 dispatch issue **with `useWorktree: true`**
  (mandatory). Deliver the package via follow-up. Include the generated
  `campaignId`.
- L1 may own **multiple L2s concurrently** when the user has multiple
  independent tasks in flight — one campaign per L2.
- **Final acceptance handoff.** When an L2 follows up with "campaign done,
  branch `bkd/{L2_ID}` ready", L1 must bring the result back to the user
  (summary + branch name + suggested next step: review/merge into main),
  and wait for the user's acceptance decision. L1 must NOT itself merge the
  L2 branch into main, mark issues `done`, or otherwise close the loop
  without the user.
- **Register a 60-minute cron** of action `issue-follow-up` targeting L1's own
  session issue. On each wake:
  - Query BKD for issues matching **each** owned campaignId (every L2 plus
    their subtasks) and summarize progress to the user.
  - Handle yellow / blocked decisions escalated from any L2.
  - If the user is absent, log the snapshot and wait for the next wake.
- L1 **does not** create subtasks, build the DAG, write code, or perform merges.
- **Termination conditions:** evaluated per campaign (each L2 has its own
  idle countdown).
  - User explicitly stops -> **delete the L1 cron and every owned L2 cron**
    immediately and exit (no countdown).
  - Steady-state idle for a single campaign: that L2 is in `review`, every L3
    is in `review` with L2-internal state `merged` or `blocked`, no
    `todo`/`working` left, no pending yellow/blocked escalation. L1 reports
    "campaign {campaignId} ready for user review/merge of branch
    `bkd/{L2_ID}`" and stops tracking it.
  - Steady-state idle for ALL campaigns: enter the L1 idle countdown (see
    [Idle Termination Countdown](#idle-termination-countdown)). On the 3rd
    consecutive idle wake, produce the final report to the user, delete the
    L1 cron, and exit. L2 crons should already be gone.

### Creating the L2 Dispatch Issue

```bash
L2=$(curl -s -X POST "$BKD_URL/projects/{projectId}/issues" \
  -H 'Content-Type: application/json' \
  -d '{"title":"[L2] dispatch: {short goal} [{campaignId}]","statusId":"todo","useWorktree":true,"tags":["l2","campaign:{campaignId}"]}')
L2_ID=$(echo "$L2" | jq -r '.data.id')

curl -s -X POST "$BKD_URL/projects/{projectId}/issues/$L2_ID/follow-up" \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "## Role\nYou are the L2 dispatch issue in a three-tier BKD coordination pattern. Your job is to decompose, dispatch, monitor, evaluate, and merge L3 subtasks INTO YOUR OWN WORKTREE BRANCH (bkd/'"$L2_ID"'). Stay in BKD statusId=working. Drive yourself via a 15-minute issue-follow-up cron. Never use sleep.\n\n## Worktree Discipline (HARD RULE)\nYou run in your own worktree on branch bkd/'"$L2_ID"' (created by BKD because useWorktree=true). All file edits, merges, build/test runs happen here. NEVER cd, switch, or write to the main worktree. NEVER `git checkout main` or `git merge` into main. The main tree is read-only across the whole three-tier pattern; whether bkd/'"$L2_ID"' eventually merges into main is a human decision made AFTER you terminate.\n\n## Required BKD References\nIf your engine can load repository skills or files, load bkd plus references/three-tier-coordination.md, references/rest-api.md, references/quality-review.md, and references/merge-strategy.md before decomposing. If it cannot, follow the HTTP API and the rules in this prompt.\n\n## Campaign\ncampaignId: {campaignId}\nUse this campaignId in every L3 title, tag, and follow-up.\n\n## DAG State Rules\nBKD statusId values are only todo|working|review|done. Treat planned/dispatched/green/merged/blocked as your own DAG states only; never PATCH an issue to merged or blocked. Emit a [dag-state campaignId={campaignId}] block at the end of every turn with id/title/mode/deps/state/retries for every subtask.\n\n## Context Discipline\nThe first wake does the full decomposition and writes a one-shot [L2-plan-snapshot v1 campaignId={campaignId}] block as a tagged assistant message. EVERY subsequent wake reads that snapshot (via logs/filter/types/assistant-message) plus BKD issue states — DO NOT re-read source files. If scope genuinely changes (L1 follow-up brings new requirements), emit a [L2-plan-snapshot v2 ...] block superseding the previous one, then resume snapshot-only wakes.\n\n## Goal\n{full goal description}\n\n## Acceptance Criteria\n- {criterion 1}\n- {criterion 2}\n\n## Scope\n- In scope: {paths/modules}\n- Out of scope: {paths/modules}\n\n## L1 Report API\nWhen you need to escalate (yellow/blocked/done), use:\nPOST '"$BKD_URL"'/projects/{projectId}/issues/'"$L1_SESSION_ID"'/follow-up\n\n## Bootstrap\n1. Register a 15-minute cron of action issue-follow-up targeting yourself ('"$L2_ID"').\n2. Decompose the goal into L3 subtasks. Build a dependency DAG using subtask issue ids. Do not parallelize everything. Every L3 will use useWorktree=true because main is read-only.\n3. Write the [L2-plan-snapshot v1 campaignId={campaignId}] block (DAG + per-L3 self-contained spec referencing file paths only).\n4. End this turn with an initial [dag-state campaignId={campaignId}] block. The cron will wake you to start dispatching."
  }' | jq

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
      "prompt": "Hourly L1 wake-up. For each campaignId you own, query progress of its L2 and L3 subtasks (via campaign-tag filter), summarize for the user, and surface any pending yellow/blocked escalations. Do NOT auto-dispatch: if an escalation needs a re-dispatch or scope tweak, present the proposed action to the user and wait for explicit confirmation before sending the follow-up to L2. Main tree is read-only — do not edit any files. End the turn; the next cron will wake you in 60 minutes."
    }
  }' | jq
```

## L2 - Scheduling Issue (one per task, own worktree)

The L2 issue is the dispatcher for one independent task. It runs in its own
worktree on branch `bkd/{L2_ID}` (BKD-created from `useWorktree: true`). Every
wake of L2 is driven by its 15-minute self cron. Each wake performs **one
decision round**, then ends the turn. **No `sleep`, ever. Never touch main.**

### L2 Responsibilities

- **Operate inside the L2 worktree only.** All git commands (`status`, `merge`,
  `revert`, `commit`, `stash`) run from `<WORKTREE_BASE>/{projectId}/{L2_ID}/`.
  **Never** `cd` to the main worktree, `git checkout main`, or `git merge`
  anything into main. Main is human-territory; the user merges `bkd/{L2_ID}`
  into main themselves after termination.
- On bootstrap, register the 15-minute self cron (`issue-follow-up` targeting
  itself) as the loop engine, then perform the **one-shot decomposition**:
  read the source files needed to decompose, build the DAG, draft each L3
  spec, and write a `[L2-plan-snapshot vN campaignId={campaignId}]`
  assistant-message block. **All subsequent wakes read this snapshot instead
  of re-reading source.**
- **On subsequent wakes**: pull the latest plan snapshot via `logs/filter
  /types/assistant-message/turn/lastN` (small N — usually 5 is enough to find
  the snapshot), pull current BKD issue states, decide, act, end turn.
- **Before every dispatch**: check `/processes/capacity`. If
  `availableSlots == 0`, skip this round; wait for the next cron.
- **Dispatch eligibility**: a subtask may be dispatched only when **all its
  upstream dependencies have L2-internal DAG state `merged`**. Same-stage
  subtasks may run in parallel subject to capacity and file-overlap constraints.
- **L3 mode is always `useWorktree: true`** under this pattern, because main
  is read-only — `useWorktree: false` would write to main and violate the
  hard rule. The simple/worktree mode-selection table from `orchestration.md`
  does NOT apply here.
- **Create L3**: `todo` (with `useWorktree: true`) -> follow-up (self-contained
  spec referencing file paths only, acceptance criteria, mandatory self-review
  block, full report API path, campaignId) -> move to `working`.
- **Monitoring per subtask** (do not batch — evaluate each completion immediately):
  - Use `logs/filter` to read `error-message`, `assistant-message/turn/last`,
    `tool-use/turn/last3`, and execution scale.
  - Classify result as green / yellow / red (see `quality-review.md`).
  - **green** -> proceed to merge phase.
  - **red** -> follow-up the subtask with the issue, move it back to `working`
    for rework. Retry limit: `N = 2` by default; on exceeding, set the
    L2-internal DAG state to `blocked` and follow-up L1. Do not PATCH BKD
    `statusId` to `blocked`.
  - **yellow** -> follow-up L1 for a human decision. Do not guess.
- **Merge phase (into `bkd/{L2_ID}`, not main):**
  1. `cd <WORKTREE_BASE>/{projectId}/{L2_ID}/` and confirm
     `git branch --show-current` == `bkd/{L2_ID}`. If not, abort and escalate
     to L1 — something has shoved the L2 worktree into the wrong branch.
  2. Ensure `git status` is clean (commit or stash L2-side work).
  3. Record `MERGE_BASE=$(git rev-parse HEAD)` for post-merge diffing.
  4. Merge in dependency order: `git merge bkd/{L3_ID} --no-ff -m "L2 merge:
     {L3 title} (bkd/{L3_ID}) [{campaignId}]"`. On conflict: `git merge
     --abort` and escalate to L1.
  5. Run build/test after each merge. On failure: `git revert -m 1 HEAD
     --no-edit`, follow-up the L3 with the error, set L3 BKD status back to
     `working` with the rework prompt.
  6. On success, set L2-internal DAG state of that L3 to `merged`. Leave the
     L3 BKD issue in `review` (do NOT move to `done` — `done` triggers
     worktree auto-cleanup and is human-only).
- After each batch, follow-up L1 with a progress rollup that includes
  `bkd/{L2_ID}` as the branch the user will eventually review.
- **Termination**: when every subtask has L2-internal DAG state `merged` or
  `blocked`, nothing is `todo`/`working`, and no pending evaluations/merges
  remain, enter the idle countdown (see [Idle Termination Countdown](#idle-termination-countdown)).
  On the 3rd consecutive idle wake:
  1. Follow-up L1 with "campaign {campaignId} complete; branch `bkd/{L2_ID}`
     ready for user review and merge into main. Please verify per docs and
     move issues to `done` to trigger worktree auto-cleanup".
  2. Delete the L2 self-cron (`l2-dispatch-{L2_ID}`).
  3. Move L2 itself to `review`.
  4. End turn. L2 will not wake again.

### L2 15-minute Self Cron (bootstrap)

```bash
curl -s -X POST "$BKD_URL/cron" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "l2-dispatch-'"$L2_ID"'",
    "cron": "*/15 * * * *",
    "action": "issue-follow-up",
    "config": {
      "projectId": "{projectId}",
      "issueId": "'"$L2_ID"'",
      "prompt": "L2 dispatch wake-up for campaignId={campaignId}. Run one round: (0) confirm you are in worktree '"$L2_ID"' on branch bkd/'"$L2_ID"' (NEVER touch main), (1) read latest [L2-plan-snapshot] via logs/filter — do NOT re-read source, (2) check capacity, (3) dispatch eligible subtasks (always useWorktree=true), (4) evaluate any completed subtasks (green/yellow/red), (5) merge greens into bkd/'"$L2_ID"' in dependency order (NOT main), (6) escalate yellows/blocks to L1, (7) end with an updated [dag-state campaignId={campaignId}] block. End the turn; the next cron fires in 15 minutes."
    }
  }' | jq
```

## L3 - Subtask Issues (short lifecycle)

Each L3 issue is one short-lived process. It does exactly one assigned task and
exits.

### L3 Responsibilities

- **Work only inside the L3 worktree** on branch `bkd/{L3_ID}`. Do not touch
  main. Do not switch branches. L2 merges your branch into `bkd/{L2_ID}` (NOT
  main) after you report.
- **Spec-bounded execution.** The dispatch follow-up is **self-contained** —
  do NOT search the codebase to figure out what to do, do NOT read files
  outside the "Files In Scope" / "Files To Read For Context" lists, do NOT
  re-derive the goal. If something is missing, report back with
  `status=blocked` + reason `spec incomplete`; do not improvise.
- Implement only the assigned task; respect the acceptance criteria.
- **Mandatory self-review** after implementation. The dispatch payload from L2
  describes the required review dimensions; perform the review using whatever
  capability your engine provides:
  - If your engine exposes a code-review skill (for example a `pma-cr`
    equivalent, a Codex review action, or any other registered reviewer),
    invoke it.
  - Otherwise, perform the review manually: walk the diff and check correctness,
    regressions, security/trust boundaries, error handling, concurrency,
    performance, and tests.
  - Either way, fix **all P0 and P1** findings before reporting.
- On completion, BKD `autoMoveToReview` moves the issue `working` -> `review`
  automatically. **Do not manually change status.**
- Send a completion follow-up to L2 using the **full HTTP endpoint provided in
  the dispatch follow-up** (do not invent endpoints, do not rely on
  engine-local shorthands). Include:
  `status / changed files / key decisions / self-review tool used / self-review
  result / remaining issues`.
- L3 **must not** merge, create other issues, dispatch further work, or write
  to main. After reporting, exit.

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
SUB_ID=$(echo "$SUB" | jq -r '.data.id')

curl -s -X POST "$BKD_URL/projects/{projectId}/issues/$SUB_ID/follow-up" \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "## Campaign\ncampaignId: {campaignId}\n\n## Worktree\nYou run in your own worktree on branch bkd/'"$SUB_ID"' (BKD-created). All work happens here. Do NOT touch main. Do NOT cd elsewhere. L2 will merge bkd/'"$SUB_ID"' into bkd/'"$L2_ID"' (NOT main) after you report.\n\n## Self-Contained Spec — do NOT re-investigate the project\nEverything you need to implement this task is in this prompt. Do NOT search the codebase to figure out what to do, do NOT read files outside the paths listed below, do NOT re-derive the goal — L2 has already done that. If a path or constraint is missing, REPORT BACK to L2 with status=blocked and reason='spec incomplete'; do not improvise.\n\n## Files In Scope (only these may be edited)\n- {path/to/file/1} {line-range if narrow}\n- {path/to/file/2}\n\n## Files To Read For Context (read-only)\n- {path/to/file/3}\n\n## Requirements\n{detailed implementation spec}\n\n## Acceptance Criteria\n- {criterion 1}\n- {criterion 2}\n\n## Design Constraints (inherited from L2 plan)\n- {constraint 1}\n- {constraint 2}\n\n## Mandatory Self-Review (before reporting)\nAfter implementation:\n1. Review your diff against the acceptance criteria.\n2. Run a code-review pass over the diff. If your engine has a registered review skill (for example a pma-cr-equivalent, a Codex review action, or any other reviewer), invoke it; otherwise perform the review manually.\n3. Review dimensions (priority order): correctness/regressions, security/trust boundaries, data integrity/error handling, concurrency/cancellation/resource lifecycle, performance, maintainability/tests.\n4. Fix ALL P0 and P1 findings.\n5. Only then report.\n\n## Report Endpoint (use exactly this URL)\nPOST '"$BKD_URL"'/projects/{projectId}/issues/'"$L2_ID"'/follow-up\n\nReport JSON shape:\n{\n  \"prompt\": \"campaignId: {campaignId}\\nSubtask '"$SUB_ID"' ({title}) complete\\nStatus: success|failure|partial|blocked\\nChanged files: ...\\nKey decisions: ...\\nSelf-review tool: {skill name | manual}\\nSelf-review result: passed | {P0/P1 fixes made}\\nRemaining issues: ...\"\n}\n\n## Strict Rules\n- Self-review and first-round fixes MUST complete before reporting.\n- Use ONLY the /follow-up HTTP endpoint above for inter-issue communication. Do not assume any engine-local slash command is available.\n- Do not merge, do not create other issues, do not dispatch.\n- Do not touch main.\n- After reporting, exit."
  }' | jq

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

- L2 stays `working` for the whole campaign (its 15-min cron keeps waking it).
- L3 subtasks land in `review` and stay there until the user verifies and
  moves them to `done`. `done` triggers BKD worktree auto-cleanup.

## Loop Engine

- **The only driver is the BKD `issue-follow-up` cron.** L1 cron: 60 min.
  L2 cron: 15 min.
- Every wake performs **one round of decisions** and then **ends the turn**.
  The next round waits for the next cron fire.
- **Never** use `sleep`. **Never** poll inside a turn.
- `follow-up` to a `working` + idle issue triggers its next turn immediately.
- If the process has exited, follow-up auto-restarts a new process.

## Context Discipline (lightweight wake-ups)

Cron fires often. If each wake re-loads source files, re-reads the goal, and
re-derives the DAG, token cost grows linearly with campaign length. These
rules keep wakes O(1) in cost regardless of campaign size.

### Rules

1. **One-shot decomposition.** L2's **first** wake reads source as needed,
   builds the DAG, drafts each L3 spec, and emits a single tagged assistant
   message:
   ```
   [L2-plan-snapshot v1 campaignId={campaignId}]
   { dag: [...], modes: {...}, l3specs: [{ id, paths, acceptance, constraints }, ...] }
   [/L2-plan-snapshot]
   ```
   This block is the **only** authoritative plan. Subsequent wakes do not
   re-decompose.

2. **Snapshot retrieval.** Every L2 wake after the first opens with one
   filtered logs call to find the latest snapshot:
   ```bash
   curl -s "$BKD_URL/projects/{projectId}/issues/$L2_ID/logs/filter/types/assistant-message/turn/last5" \
     | jq '[.data[].content // "" | select(contains("[L2-plan-snapshot"))] | last'
   ```
   If the snapshot is older than `turn/last5`, widen the window once; if still
   missing, this is a bug — escalate to L1 (`yellow`).

3. **Snapshot supersedes, not appends.** If L1 sends a scope change, L2
   re-runs the read-source step **once**, emits `[L2-plan-snapshot v2 ...]`
   superseding v1, and goes back to snapshot-only wakes. Each
   superseding-snapshot emission is itself a "non-idle action" that resets
   the idle counter.

4. **Reference, never inline.** All cross-tier payloads (L1→L2, L2→L3,
   L3→L2 reports) reference **file paths + line ranges**, never paste file
   contents. The receiving tier reads the file once if needed; pasted
   contents would duplicate into every wake's context.

5. **L3 spec is self-contained.** The L3 dispatch follow-up must include
   every file path L3 may touch, every constraint, the full report URL,
   and the campaignId. L3 must NOT need to re-investigate the project — if
   it does, the spec is incomplete; L3 reports `blocked: spec incomplete`
   and L2 amends the snapshot.

6. **Logs filter, never bulk logs.** Always use
   `/logs/filter/types/.../turn/...` with the narrowest slice that answers
   the question. Never fetch `/logs` without filters.

7. **No re-discovery per wake.** If a wake feels like it needs to re-read
   source, the snapshot is incomplete. Stop, amend the snapshot once
   (emit v(N+1)), then return to scan-only wakes.

### Wake Budget Heuristic

A healthy L2 wake should make on the order of:

- 1 logs/filter call (snapshot retrieval)
- 1 `GET /issues` call (campaign state)
- 1 `/processes/capacity` call
- 0–K issue mutations (PATCH / follow-up) where K = number of L3s changing
  state this round
- 0–K logs/filter calls to evaluate completed L3s (one per completion)

No source-tree reads, no `find`/`grep`, no test runs (unless verifying a merge
this round). If a wake exceeds this budget, the cause is usually a missing
snapshot field — fix the snapshot, not the wake.

## Idle Termination Countdown

Both L1 and L2 cron loops self-terminate after **3 consecutive idle wakes**.
No external state store is required — the count lives in the issue's own log.

### Idle Definition

A wake is **idle** when, after running its normal decision round, the tier
finds nothing actionable:

- **L2 idle**: zero subtasks in BKD `todo` or `working`, no pending
  green/yellow/red evaluation, no pending merges, no pending escalations, and
  every subtask has L2-internal DAG state `merged` or `blocked`.
- **L1 idle**: **every** owned L2 is in `review`, every campaign subtask
  across all owned campaigns is in BKD `review` with L2-internal DAG state
  `merged` or `blocked`, no yellow/blocked escalation queued from any L2, no
  user input waiting. If L1 owns even one in-flight L2, L1 is NOT idle.

Any non-idle action (dispatch, evaluate, merge, escalate, report progress to
user) **resets the counter to 0** for that tier.

### Counting Mechanism

At the end of each idle wake, emit a final assistant message containing a
recognizable marker on its own line:

```
[idle-tick N/3]
```

Where `N` is the count produced by this wake. To compute `N`, the tier reads
its own last 3 assistant-message turns via `logs/filter` and counts only the
consecutive idle markers at the end of that turn list. Non-idle assistant
messages break the streak.

```bash
# Count the trailing consecutive idle-tick markers in the last 3 assistant
# turns (run by L1 or L2 against its own issue id). Assumes the API returns the
# last3 turn slice in chronological order.
PRIOR=$(curl -s "$BKD_URL/projects/{projectId}/issues/{selfIssueId}/logs/filter/types/assistant-message/turn/last3" \
  | jq '[.data[].content] | reverse | reduce .[] as $content ({n:0, stop:false}; if .stop then . elif (($content // "") | contains("[idle-tick")) then .n += 1 else .stop = true end) | .n')
N=$((PRIOR + 1))
```

If the immediately previous assistant turn lacks `[idle-tick`, the streak is
broken; treat this wake as `N=1` and start over. Do not count older idle markers
that are separated from the latest turn by non-idle activity.

### Termination Action (N == 3)

When this wake would be the 3rd consecutive idle tick:

**L2 (idle for 3 rounds):**

```bash
# 1. Final escalation to L1
curl -s -X POST "$BKD_URL/projects/{projectId}/issues/$L1_SESSION_ID/follow-up" \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "[L2 terminating campaignId='"$CAMPAIGN_ID"'] All subtasks done; nothing to dispatch for 3 consecutive rounds. Branch bkd/'"$L2_ID"' ready for user review/merge into main. Please verify per docs and move issues to done to trigger worktree auto-cleanup."}' | jq

# 2. Delete L2 self-cron
curl -s -X DELETE "$BKD_URL/cron/l2-dispatch-$L2_ID" | jq

# 3. Move L2 to review
curl -s -X PATCH "$BKD_URL/projects/{projectId}/issues/$L2_ID" \
  -H 'Content-Type: application/json' \
  -d '{"statusId":"review"}' | jq

# 4. Emit the terminal marker, then end turn
echo "[idle-tick 3/3 -> L2 terminated]"
```

**L1 (idle for 3 rounds):**

```bash
# 1. Produce final report to user (assistant message in this turn)

# 2. Delete L1 cron
curl -s -X DELETE "$BKD_URL/cron/l1-progress-$L1_SESSION_ID" | jq

# 3. (Defensive) Ensure L2 cron is also gone; safe to call even if already deleted
curl -s -X DELETE "$BKD_URL/cron/l2-dispatch-$L2_ID" | jq

# 4. Emit the terminal marker, then end turn
echo "[idle-tick 3/3 -> L1 terminated]"
```

### Rules

- **Reset on activity**: any non-idle action this wake (even a single subtask
  dispatched or evaluated) makes the wake non-idle. Do NOT emit `[idle-tick]`;
  the next idle wake will start counting from 1.
- **Marker must be the last assistant message of the turn** so `logs/filter
  /turn/lastN` reliably picks it up.
- **3 wakes ~= 45 min for L2, 3 hours for L1.** If you need a different window,
  adjust the cron interval, not the countdown — keep the countdown at 3 so the
  termination logic stays uniform.
- **User explicit stop overrides countdown** — delete crons immediately, do not
  wait for 3 idle ticks.
- **Restart safety**: if L1/L2 is restarted (new process), the new run reads
  the same last-3 turns and continues the count — restarts do not reset the
  streak, only new actionable work does.

## Exceptions and Escalation

- Subtask failure / timeout / red: retry up to `N` (default 2). On exceed:
  set L2-internal DAG state `blocked` and follow-up L1.
- Merge conflict, ambiguous acceptance criteria, or scope changes: L2 does not
  guess. Set L2-internal DAG state `blocked` or classify the result as `yellow`
  and escalate to L1. L1 aggregates and asks the user.
- BKD unreachable / capacity exhausted long term: pause dispatch; L1 notifies
  the user.

## Key Constraints

1. **Inter-issue communication is follow-up only** -
   `POST /projects/{pid}/issues/{iid}/follow-up`.
2. **Check capacity before every dispatch** - `/processes/capacity`.
3. **`review` != `done`** - `done` is human-only and triggers worktree
   auto-cleanup.
4. **Soft delete** - project and issue deletions are soft-delete by default.
5. **No `sleep`, ever** - all waiting is expressed as cron callbacks plus
   ending the current turn.
6. **One L2 per independent task** - L1 creates a new L2 for each independent
   task and may own multiple L2s concurrently. For continuations of an
   in-flight task, follow-up the existing L2 instead of creating a new one.
   When unsure, ask the user.
7. **L2 owns the DAG** - dependencies, capacity, monitoring, evaluation, and
   merging all live in L2. L1 only handles user-facing progress and
   yellow/blocked decisions.
8. **L3 never dispatches, never merges** - one task in, one report out, exit.
9. **Idle cron self-termination** - L1 and L2 cron loops self-terminate after
   3 consecutive idle wakes; any actionable work resets the streak. See
   [Idle Termination Countdown](#idle-termination-countdown). User explicit
   stop bypasses the countdown.
10. **Main tree is read-only** - L1 only observes main; L2 and L3 each get
    their own worktree (`useWorktree: true` mandatory). L2 merges L3 branches
    into `bkd/{L2_ID}`, NOT into main. The user decides whether and when to
    merge `bkd/{L2_ID}` into main; the three-tier pattern never does it.
11. **L3 mode is always worktree** - the simple/worktree mode-selection table
    from `orchestration.md` does not apply here, because simple mode would
    write to main and break rule 10.
12. **Context discipline (lightweight wake-ups)** - L2 decomposes once and
    snapshots the plan; subsequent wakes read the snapshot, not the source.
    All cross-tier payloads reference file paths, never inline contents. See
    [Context Discipline](#context-discipline-lightweight-wake-ups).
13. **User confirmation gate at L1→L2** - L1 must present the draft dispatch
    package to the user and wait for an explicit affirmative (`proceed`/`ok`/
    `go`) before creating any L2 or sending any continuation follow-up. No
    auto-dispatch under any circumstance. Applies equally to the cron hourly
    wake-up: it may report, never dispatch. After L2 finishes, L1 hands the
    result back to the user for acceptance — L1 does not close the loop
    silently.
