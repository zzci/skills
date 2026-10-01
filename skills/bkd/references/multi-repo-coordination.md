# BKD Multi-Repo Coordination

A **workspace** is one directory holding several independent git repos
(`/srv/ybo` → `docs/`, `hub/`, `studio/`). Coordination mode splits a request
that spans repos into **one lane issue per repo**, so every commit and rollback
stays inside a single repository, and keeps the cross-repo picture in a
PMA-format **ledger** owned by a **master coordinator issue**.

Everything happens in the **current BKD project** — the one whose `directory`
is the workspace. MR mode never creates a project: a lane is bound to its repo
by the **working directory stated in its prompt**, and it reaches that repo with
`git -C <repo>`. The master only coordinates: it dispatches, records, and
forwards. All code work and verification happen inside the lane's repo.

Activation: short phrases such as "start BKD multi-repo coordination",
"启动多仓库协调", or "multi-repo mode". Load `references/rest-api.md` first for
guarded transport; load this file for topology, ledger, and lane rules.

## Naming

This mode is **multi-repo coordination** (MR mode); one run of it is an **MR
campaign**. It has exactly **two tiers**, both living in the current project:

| Tier | Role in MR mode | Relation to three-tier |
|------|-----------------|------------------------|
| **L1** | workspace coordinator (the master): user-facing, event-driven, owns the ledger, coordinates and forwards only | same L1, scoped to the workspace instead of one repo |
| **L2** | repo lane: one per repo — works only inside the repo named in its prompt, implements, self-checks, commits there | an L2 whose workstream is exactly one repository |

There is no third tier and no separate integrator: the repo is the unit of
work, so one lane owns its repo end to end. The user talks to L1 for cross-repo
decisions and can also talk to a lane directly on the board — a lane that
agrees to anything with the user reports it to L1 so the ledger stays true.

Issue titles carry the tier and the repo: `[L2 lane:{repo}] ...`. Tag every MR
issue with `mr`, `l2`, and `campaign:{campaignId}`.

Shell examples assume `set -o pipefail` and the `bkd_check` helper from
`rest-api.md`, so HTTP and application failures abort instead of passing
silently. The never-inline rule applies to every prompt here: render to a temp
file, wrap with `jq`, POST with `--data-binary @file` (see `rest-api.md` →
[Sending Request Bodies Safely](rest-api.md#sending-request-bodies-safely)).

## Table of Contents

- [Naming](#naming)
- [When to Use This Mode](#when-to-use-this-mode)
- [Verified BKD Facts](#verified-bkd-facts)
- [Topology](#topology)
- [Hard Rules](#hard-rules)
- [Pre-Flight](#pre-flight)
- [Workspace Ledger (PMA reuse)](#workspace-ledger-pma-reuse)
- [Master Responsibilities](#master-responsibilities)
- [Lane Dispatch Payload](#lane-dispatch-payload)
- [Lane Responsibilities](#lane-responsibilities)
- [Auto Mode](#auto-mode)
- [Cross-Repo Dependencies and Ordering](#cross-repo-dependencies-and-ordering)
- [Boundary Checks](#boundary-checks)
- [Commit Record and Rollback](#commit-record-and-rollback)
- [Composing With the Other Patterns](#composing-with-the-other-patterns)
- [Key Constraints](#key-constraints)

## When to Use This Mode

Use it when the current project's directory is a workspace containing 2+ git
repos and the request touches more than one of them, or when a single-repo
change must honour a contract owned by a sibling repo.

Do not use it for a monorepo (one repo, many packages) — that is a single
repository and `orchestration.md` or `three-tier-coordination.md` already
isolate work with per-issue worktrees. Do not use it when the request touches
exactly one repo and no cross-repo contract: one ordinary issue is enough.

## Verified BKD Facts

Checked against BKD 0.2.2. Re-verify if the server changes. Together these are
why MR mode stays in one project and binds repos through the prompt.

1. An issue's working directory is its project's `directory` (or its worktree).
   There is **no per-issue directory** field, so the only in-project way to aim
   an issue at one repo is to name that repo in the prompt and require
   `git -C <repo>` for every git call.
2. `useWorktree: true` requires the **project directory itself** to be a git
   repo (`Cannot create worktree: <dir> is not a git repository`). A workspace
   holding sibling repos is not one, so MR lanes always use
   `useWorktree: false`.
3. **A failed worktree is silent.** BKD logs
   `worktree_creation_failed_fallback_to_base` and runs the issue in the project
   directory anyway. A `useWorktree: true` lane in a workspace project therefore
   does not fail loudly — it just runs in the workspace root with no branch
   isolation. Never set the flag here.
4. Issues carry `tags` and `parentIssueId`, so the whole campaign is findable
   inside one project without extra projects or board columns.
5. Follow-up is project-scoped (`POST /projects/{pid}/issues/{iid}/follow-up`).
   In MR mode every issue shares the **current** `projectId`, so all reports and
   dispatches use that one id.
6. `GET /projects/{projectId}` returns `directory` and `isGitRepo` — use it to
   confirm the workspace path instead of assuming it.

## Topology

```
Current project (directory = workspace root, usually not a git repo)
  L1 master coordinator issue  (useWorktree:false, no cron, event-driven)
    - talks to the user; owns the workspace ledger in <workspace>/docs/
    - coordination and forwarding only: no diffs, no builds, no code judgement
    - one lane per repo; records contracts, lane order, commits, rollback plan
        |  follow-up inside the same project (one projectId everywhere)
        v            ^ user may also talk to a lane directly on the board
  L2 lane issue A   workdir: <workspace>/repo-a   (useWorktree:false)
    - every file change and git call inside repo-a, via git -C <workspace>/repo-a
    - implements, self-checks, commits in repo-a, reports commits to the master
  L2 lane issue B   workdir: <workspace>/repo-b
  ...
```

Isolation comes from the repo boundary, not from a worktree: at most one lane
per repo is active at a time, and lanes in different repos never share files.

## Hard Rules

1. **One issue, one repo.** A lane may create, edit, or delete files only under
   the repo named in its prompt. Work it discovers in another repo is reported,
   never done.
2. **No new projects, no new board columns.** Every MR issue is created in the
   current project. The repo binding is the prompt's working directory plus
   `git -C`; never `POST /projects` to "give a repo its own project".
3. **`useWorktree: false` for every MR issue** (fact 2 and 3). Branch isolation
   is unavailable here, so correctness comes from one-lane-per-repo and the
   boundary checks.
4. **One active lane per repo.** Two lanes in the same repo would share one
   working tree. Keep the second one in `todo` until the first reports.
5. **Only the master writes the ledger.** Lanes report by follow-up. The ledger
   lives in the workspace, outside every repo, and is never committed into a
   repo.
6. **The master never verifies code.** No diff reading, no lint/test/build, no
   green/yellow/red quality classification, no hand-fixing. It dispatches,
   records reports in the ledger, forwards them (to the user, to another lane),
   and asks when a decision is needed. Anything that requires looking at code is
   dispatched to the lane that owns that repo.
7. **A lane commits only in its own repo**, on the branch its prompt names
   (default: the branch the repo is already on). It never switches branches,
   never commits in a sibling repo, and never pushes unless the payload says so.
8. **Two master confirmation gates**, as in `three-tier-coordination.md`: the
   lane set (which repos, what each does, in what order) and each lane's
   finished work before the campaign moves on. [Auto Mode](#auto-mode) is the
   only way to waive them.

## Pre-Flight

```bash
set -o pipefail

# 1. Confirm the current project and its directory — never assume the path
WORKSPACE=$(curl -sS --fail-with-body "$BKD_URL/projects/$PROJECT_ID" \
  | bkd_check | jq -er '.data.directory') || exit 1

curl -sS --fail-with-body "$BKD_URL/health" | bkd_check
curl -sS --fail-with-body "$BKD_URL/processes/capacity" | bkd_check

# 2. Discover the repos in the workspace (confirm the list with the user)
find "$WORKSPACE" -mindepth 2 -maxdepth 4 -name .git -prune | sed 's|/\.git$||'

# 3. Each repo that will get a lane must be a git repo with a clean tree
for repo in $(find "$WORKSPACE" -mindepth 2 -maxdepth 4 -name .git -prune | sed 's|/\.git$||'); do
  printf '%s\t%s\t%s\n' "$repo" \
    "$(git -C "$repo" branch --show-current)" \
    "$(git -C "$repo" status --porcelain | wc -l)"
done
```

A repo that is dirty before dispatch is pre-existing user work: record its
state in the ledger and ask the user before putting a lane into it. Do not
stash, commit, or revert anything to make room.

## Workspace Ledger (PMA reuse)

The ledger is the authoritative campaign state — it survives process kills,
context loss, and master restarts, so the master does not depend on log
snapshots. It reuses the PMA formats verbatim
(`<pma-skill>/docs/task-format.md`, `docs/plan-format.md`) at the **workspace
root**, which is not a git repo, so nothing here lands in a repository:

```text
<workspace>/docs/
├── plan/index.md + <timestamp>-<slug>.md   # one plan per multi-repo campaign
├── task/index.md + <timestamp>-<slug>.md   # one task per repo lane
└── changelog.md                            # history, decisions, rollbacks
```

**Campaign plan file** — the standard PMA plan sections (Context, Proposal,
Risks, Scope, Alternatives, Annotations) plus these multi-repo sections:

```markdown
## Repo Map

| repo | workdir | lane task | lane issue | branch | order | state |
|------|---------|-----------|------------|--------|-------|-------|
| hub | /srv/ybo/hub | 20260913-1830-hub-api | k3x9... | main | 1 | dispatched |
| studio | /srv/ybo/studio | 20260913-1830-studio-client | p7a2... | main | 2 | planned |

## Cross-Repo Contracts

- `POST /v1/orders` request/response shape owned by hub; consumed by studio.
  The hub lane must report its commits before the studio lane is dispatched.

## Commit Log

- hub: base `a1b2c3d` -> commits `e4f5g6h`, `i7j8k9l` (checks: `bun test` pass) 2026-09-13 18:40

## Rollback Plan

- Revert in reverse dispatch order; per repo `git -C <workdir> revert <sha>...`.
```

Lane `state` values are ledger-internal (`planned`, `dispatched`, `reported`,
`accepted`, `blocked`) and unrelated to BKD `statusId`, which stays in
`todo|working|review|done`.

**Lane task file** — the standard PMA task detail file, one per repo lane, with
`owner` set to `bkd:{laneIssueId}` once dispatched. Claim it through the PMA
script so index marker, status, and owner move under one lock, and a second
coordinator (or an interactive agent in the same workspace) cannot take the
same repo lane:

`$PMA_SKILL` below is the pma skill directory as the running engine exposes it
(for example `~/.claude/skills/pma`); resolve it once and fall back to the
manual transition if the engine has no pma skill.

```bash
"$PMA_SKILL/scripts/task-state.sh" claim "$WORKSPACE/docs/task/20260913-1830-hub-api.md" "bkd:$LANE_ID"
# once the lane's work is accepted
"$PMA_SKILL/scripts/task-state.sh" complete "$WORKSPACE/docs/task/20260913-1830-hub-api.md" "bkd:$LANE_ID" "commits e4f5g6h..i7j8k9l"
```

`task-state.sh` needs `flock` and a `docs/task/index.md` beside the detail file;
it is repo-agnostic. If the engine cannot reach the PMA skill, perform the same
transition by hand under `flock` on the task directory, and keep the index
markers (`[ ] [-] [x] [~] [d]`) exactly as PMA defines them.

Ledger updates are immediate, never deferred: claim before dispatch, record
each report as it arrives, record commit SHAs as soon as a lane reports them,
and append decisions and rollbacks to `changelog.md`.

## Master Responsibilities

- **Own the ledger.** Create the campaign plan file and one lane task file per
  repo during investigation; update them on every event. Never let a lane write
  them.
- **Partition by repo.** Split the request so each lane is one repo with its own
  goal, acceptance criteria, in/out paths, and dependencies. A requirement that
  cannot be expressed per repo is a contract to record, not a lane that spans
  repos.
- **Gate 1 — dispatch.** Present the repo map, contracts, lane order, and open
  questions; wait for an explicit `proceed`/`ok`/`go`. Only then claim the lane
  tasks and create the lane issues.
- **Dispatch lanes in the current project** (`useWorktree:false`, repo path in
  the prompt), respecting capacity, order, and one-active-lane-per-repo: lanes
  in different repos with no dependency may run concurrently; a consumer lane
  stays in `todo` until its producer lane's commits are recorded.
- **Record and forward, do not assess.** Write each lane report into the lane
  task notes and the plan's Repo Map, run the cheap record-level checks in
  [Boundary Checks](#boundary-checks), and forward the outcome: a lane's own
  `Status` and check result decide the next step, not the master's opinion of
  the code. Contract facts a lane delivered are forwarded into the dependent
  lanes' payloads unchanged.
- **Gate 2 — accept the lane's work.** For a lane reporting success with passing
  checks, present the report and the recorded commits to the user and wait for
  explicit confirmation before dependent lanes go out. Record the commits in the
  Commit Log, then set the lane state `accepted`.
- **Route failures instead of fixing them.** `failure`/`partial`/`blocked`, a
  failed check, or a boundary violation goes back to the owning lane as a rework
  follow-up (quoting the reported error), or to the user when it needs a
  decision. Rework is bounded (default 2 attempts per lane); on exceed, set the
  lane state `blocked` and ask the user.
- **Terminate** when every lane is `accepted` or `blocked`: delete each lane's
  cron by captured ID if it registered one (assert success, verify
  `isDeleted:true`), set the plan status to `completed`, complete or close each
  lane task, append a changelog entry, and move the master to `review`. `done`
  stays human-only.

The master is woken by user messages and lane follow-ups; outside
[Auto Mode](#auto-mode) it creates **no cron** and never uses `sleep`.

## Lane Dispatch Payload

```bash
LANE_TITLE="[L2 lane:repo-a] {goal} [{campaignId}]"
LANE=$(jq -n --arg title "$LANE_TITLE" --arg campaign "campaign:{campaignId}" \
  '{title:$title,statusId:"todo",useWorktree:false,tags:["mr","l2",$campaign]}' \
  | curl -sS --fail-with-body -X POST "$BKD_URL/projects/$PROJECT_ID/issues" \
      -H 'Content-Type: application/json' -d @-) || exit 1
if ! printf '%s\n' "$LANE" | jq -e '.success == true and (.data.id | type == "string")' >/dev/null; then
  printf 'BKD error: %s\n' "$(printf '%s\n' "$LANE" | jq -r '.error // "invalid response"')" >&2
  exit 1
fi
LANE_ID=$(printf '%s\n' "$LANE" | jq -er '.data.id')

cat > /tmp/bkd-prompt.txt <<'PROMPT'
## Role
You are the L2 repo lane for __REPO_NAME__ in multi-repo campaign
__CAMPAIGN_ID__. The master coordinator owns the workspace ledger and the
cross-repo decisions; you own this one repository.

## Working Directory (your whole world)
__REPO_PATH__

Your process starts in the workspace root __WORKSPACE__, which holds several
sibling repos. It is NOT your working directory. Before anything else, confirm
`git -C __REPO_PATH__ rev-parse --show-toplevel` equals __REPO_PATH__ and
`git -C __REPO_PATH__ status --porcelain` is empty; if the tree is dirty with
work you did not author, report status=blocked and stop. Do not stash or commit
someone else's changes.

## Repo Boundary (hard)
- Create, edit, or delete files ONLY under __REPO_PATH__. Never write to a
  sibling repo or to the workspace root (including its docs/ ledger).
- Run every git command as `git -C __REPO_PATH__ ...`. Stay on the branch the
  repo is already on; do not create, switch, or delete branches, and do not
  push, tag, or publish unless this payload tells you to.
- Sibling repos are read-only context, by absolute path only, and only the ones
  listed below. If something you need is missing, report status=blocked with
  reason="spec incomplete" instead of guessing.

## Goal
{bounded goal for this repo}

## Cross-Repo Contract (authoritative, do not re-derive)
{inline the exact shapes/versions this lane must produce or consume}

## Files In Scope (only these may be edited; paths relative to your repo)
- {path}

## Read-Only Context (absolute paths)
- {absolute path in a sibling repo, if genuinely needed}

## Acceptance Criteria
- {criterion}

## Mandatory Project Checks (before reporting)
Check command: {repo-defined lint/typecheck/test/build}
Fix and re-run until it passes. If it cannot pass for a reason outside this
spec, report status=blocked with the failing command and its output.

## Commit
Commit your work in __REPO_PATH__ with a conventional-commit subject, in one or
a few focused commits. Before reporting, confirm every sibling repo under
__WORKSPACE__ is still clean — if one is dirty, you crossed the boundary: move
or revert that work inside your own repo and say so in the report.

## Report To The Master (same project, exact URL)
POST __BKD_URL__/projects/__PROJECT_ID__/issues/__MASTER_ID__/follow-up
Body JSON shape:
{"prompt": "campaignId: __CAMPAIGN_ID__\nlane __LANE_ID__ repo __REPO_NAME__\nStatus: success|failure|partial|blocked\nBranch: {branch}\nCommits: {sha}..{sha} ({n} commits)\nChanged files: ...\nContract delivered: {what the sibling repos can now rely on}\nChecks: {command} -> passed | {failing output}\nCross-repo needs: {work that belongs to another repo, or none}\nRemaining issues: ..."}

Report again after any rework turn, and report anything the user agrees with
you directly on the board, so the master's ledger stays accurate.

## Strict Rules
- Use ONLY that HTTP endpoint to talk to the master; do not assume any
  engine-local slash command exists.
- Do not create other issues, do not dispatch, do not touch the workspace
  ledger. After reporting, exit.
PROMPT
sed -i "s|__CAMPAIGN_ID__|$CAMPAIGN_ID|g; s|__LANE_ID__|$LANE_ID|g; s|__REPO_NAME__|$REPO_NAME|g; s|__REPO_PATH__|$REPO_PATH|g; s|__WORKSPACE__|$WORKSPACE|g; s|__BKD_URL__|$BKD_URL|g; s|__PROJECT_ID__|$PROJECT_ID|g; s|__MASTER_ID__|$MASTER_ID|g" /tmp/bkd-prompt.txt
jq -n --rawfile prompt /tmp/bkd-prompt.txt '{prompt:$prompt}' > /tmp/bkd-body.json

curl -sS --fail-with-body -X POST "$BKD_URL/projects/$PROJECT_ID/issues/$LANE_ID/follow-up" \
  -H 'Content-Type: application/json' --data-binary @/tmp/bkd-body.json | bkd_check

curl -sS --fail-with-body "$BKD_URL/processes/capacity" \
  | bkd_check | jq -e '.data.canStartNewExecution == true' >/dev/null || exit 1
curl -sS --fail-with-body -X PATCH "$BKD_URL/projects/$PROJECT_ID/issues/$LANE_ID" \
  -H 'Content-Type: application/json' -d '{"statusId":"working"}' | bkd_check
```

The `working` PATCH is fire-and-forget: re-read `sessionStatus` and, if it is
`failed`, POST any follow-up to flush the queued spec (see
`orchestration.md` § 4.2).

## Lane Responsibilities

- Verify its working directory and a clean tree first, implement only its own
  repo's spec, pass that repo's own checks, commit in that repo, then follow-up
  the master and exit. BKD auto-moves it to `review`; it never changes status by
  hand.
- Stay on the repo's existing branch and inside its own repo for every git
  call (`git -C <repo>`), including `status`, `log`, and `diff`.
- Report cross-repo needs instead of acting on them: a missing endpoint, a
  schema the sibling repo must change, a version bump elsewhere. The master
  turns those into new lanes.
- Answer the user directly when the user opens the lane on the board, and
  report any agreement reached there to the master — the ledger must not drift
  from what the lane actually does.
- If the repo is PMA-managed, follow its local PMA flow for repo-internal
  tracking (`<repo>/docs/task/`); that is separate from the workspace ledger.

## Auto Mode

The user can activate auto mode for an MR campaign the same way as in
`three-tier-coordination.md` → [Auto
Mode](three-tier-coordination.md#auto-mode-unattended-l1): one up-front
approval replaces the per-batch dispatch gate and every acceptance gate, and
the master keeps driving until every lane is accepted or blocked.

MR specifics:

- **The master still never verifies code.** Auto mode removes the *user* from
  the acceptance gate, not the division of labour: a lane report that passes the
  record-level [Boundary Checks](#boundary-checks) and carries passing checks is
  accepted by the master itself, recorded, and the dependent lanes go out. The
  lane's own checks remain the gate.
- **Cross-repo ordering is unchanged**: a consumer lane still waits until its
  producer lane's commits are recorded.
- **Lane questions are settled with the lane** (the decision protocol from the
  same section), recorded in the plan file, and forwarded into any dependent
  lane's payload.
- **The master registers the one watchdog cron** described there, since no user
  is watching for a stalled lane, and deletes it at campaign completion.
- **Hard stops still apply**, plus the MR-specific ones: a boundary violation, a
  repo dirty with work no lane owns, and any push, publish, or tag step (the
  master asks before putting one in a lane payload).

## Cross-Repo Dependencies and Ordering

- **Contract first.** The master writes the contract (endpoint shape, schema,
  package version, config key) into the plan file and inlines it in both the
  producer and the consumer lane payload. Lanes never negotiate contracts with
  each other.
- **Producer before consumer.** The consumer lane is created in `todo` and left
  there until the producer lane has reported and its commits are recorded; only
  then queue its payload and PATCH it to `working`.
- **Version-coupled repos.** When the consumer depends on a published artifact
  (npm/crate/module tag), the publish or tag step is its own instruction to the
  producer lane — and needs the user's say-so, since it leaves the machine — and
  the consumer payload names the exact version once the producer reports it.
- **If a contract changes mid-campaign**, the master updates the plan file, then
  uses stop → verify `review` → follow-up on each affected lane (see
  `three-tier-coordination.md` → Loop Engine). Never bare-follow-up a lane
  that is mid-turn with a changed contract.

## Boundary Checks

Without worktrees the repo boundary is the only isolation there is, so it is
checked on both sides. The master stays at record level (BKD API reads and
string comparison); the git-level check belongs to the lane, which is already
inside the repository.

**Master, on every lane report** — no repo access needed:

```bash
# 1. The lane's uncommitted-change root is the project directory, as expected
#    for useWorktree:false — a worktree path here means the issue was created
#    with the wrong flag.
curl -sS --fail-with-body "$BKD_URL/projects/$PROJECT_ID/issues/$LANE_ID/changes" \
  | bkd_check | jq -r '.data.root'

# 2. Every path in the report's "Changed files" line is inside this lane's
#    repo. Any other prefix, or an absolute path outside it, is a violation.
```

A foreign path prefix means the lane escaped its boundary: the master does not
accept the work, records the violation in the ledger, and follows up the lane to
move or revert the stray work inside its own repo — it never cleans up the repos
itself.

**Lane, at start and before reporting** — the git-level confirmation:

- at start: `git -C <repo> rev-parse --show-toplevel` is its repo and
  `git status --porcelain` is empty;
- before reporting: its own repo contains exactly its intended changes, and
  every sibling repo under the workspace is still clean.

## Commit Record and Rollback

A lane commits directly in its repo, on the branch the repo already had, so
there is no merge step and no cross-repo merge order — only a commit order. The
master records, per repo, the pre-dispatch HEAD and the SHAs the lane reports;
that list is the rollback script:

```bash
# master, before dispatch (record only, no mutation)
git -C "$REPO_PATH" rev-parse HEAD
git -C "$REPO_PATH" branch --show-current
```

Rollback is dispatched work, never done by the master: it follows up the owning
lane to `git -C <repo> revert <sha>...` (reverse order within the repo), repo by
repo in reverse dispatch order, and records the outcome in `changelog.md`.
There is no cross-repo atomicity — say so to the user rather than implying it.

**Review-branch variant (only when the user asks).** If the base branch must
not move until the work is reviewed, the dispatch payload names a branch
(`mr/{campaignId}-{repo}`) and tells the lane to create it, commit there, and
stop. The lane merges it into the base branch — never the master — in a later
turn, after the master forwards the user's approval, and reports the merge SHA.
Only one lane per repo may do this at a time, since all of them share the single
checkout.

## Composing With the Other Patterns

| Situation | Pattern |
|-----------|---------|
| Request touches 2+ repos in a workspace | this file: master + one lane per repo, all in the current project |
| One repo, several subtasks, one session | `orchestration.md` |
| One repo, long-running campaign, many workstreams | `three-tier-coordination.md` |

A repo whose share of the campaign is too big for one lane is not an MR
problem: give that repository its own BKD project (the user's call, since it
adds a board column) and run `three-tier-coordination.md` there with real
worktrees, while the MR lane for that repo waits on the result.

`quality-review.md` still describes how a lane report is judged, but in this
mode the judging is not the master's: the lane self-reviews and its check run is
the gate. The master reads the reported `Status` and `Checks` lines and routes.

## Key Constraints

1. **One issue, one repo** — lanes never write across repo boundaries, and
   never write the workspace ledger.
2. **No new projects** — every MR issue lives in the current project; the repo
   binding is the prompt's working directory plus `git -C <repo>`.
3. **`useWorktree:false` always** — worktree mode needs the project directory to
   be a git repo and fails silently into the project directory otherwise.
4. **One active lane per repo** — concurrent lanes share one working tree.
5. **The master coordinates only** — no diff reading, no lint/test/build, no
   quality classification, no hand-fixing; every code-facing step is dispatched
   to the lane that owns the repo.
6. **Boundary checks on both sides** — master: reported paths inside the lane's
   repo; lane: own repo verified and clean at start, siblings clean before
   reporting.
7. **Lanes stay on the repo's branch** and never push, tag, or publish unless
   the payload says so.
8. **Contract first, producer before consumer** — never dispatch both sides of
   a contract concurrently.
9. **Ledger is authoritative and updated immediately** — PMA formats, claimed
   through `task-state.sh` (or the same transition under `flock`), history in
   `changelog.md`.
10. **No cross-repo atomicity** — the Commit Log plus reverse-order revert is
    the rollback plan.
11. **No `sleep`, `review` != `done`, capacity before every dispatch** — the
    shared BKD rules in `SKILL.md` still apply.
