# BKD Multi-Repo Coordination

A **workspace** is one directory holding several independent git repos
(`/srv/ybo` → `docs/`, `hub/`, `studio/`). Coordination mode splits a request
that spans repos into **one lane issue per repo**, so every branch, commit,
merge, and rollback stays inside a single repository, and keeps the cross-repo
picture in a PMA-format **ledger** owned by a **master coordinator issue**.
The master only coordinates: it dispatches, records, and forwards. All code
work and all verification happen inside a repo — the lane implements,
self-checks, and, once the merge is confirmed, merges its own branch into its
repo's base branch and re-runs that repo's checks.

Activation: short phrases such as "start BKD multi-repo coordination",
"启动多仓库协调", or "multi-repo mode". Load `references/rest-api.md` first for
guarded transport; load this file for topology, ledger, and lane rules.

## Naming

This mode is **multi-repo coordination** (MR mode); one run of it is an **MR
campaign**. It has exactly **two tiers**:

| Tier | Role in MR mode | Relation to three-tier |
|------|-----------------|------------------------|
| **L1** | workspace coordinator (the master): user-facing, event-driven, owns the ledger, coordinates and forwards only | same L1, scoped to the workspace instead of one repo |
| **L2** | repo lane: one per repo — implements, self-checks, and merges its own branch into that repo's base branch once the merge is confirmed | an L2 whose workstream is exactly one repository, plus the merge duty L1 holds in three-tier |

There is no third tier and no separate integrator: the repo is the unit of
work, so one lane owns its repo end to end. The user talks to L1 for
cross-repo decisions and can also talk to a lane directly on the board — a lane
that agrees to anything with the user reports it to L1 so the ledger stays
true.

Issue titles carry the tier: `[L2 lane:{repo}] ...`. Tag every MR issue with
`mr`, `l2`, and `campaign:{campaignId}`.

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
- [Lane Merge and Rollback](#lane-merge-and-rollback)
- [Composing With the Other Patterns](#composing-with-the-other-patterns)
- [Key Constraints](#key-constraints)

## When to Use This Mode

Use it when the BKD project directory is a workspace containing 2+ git repos
and the request touches more than one of them, or when a single-repo change
must honour a contract owned by a sibling repo.

Do not use it for a monorepo (one repo, many packages) — that is a single
repository and `orchestration.md` or `three-tier-coordination.md` already
isolate work with per-issue worktrees. Do not use it when the request touches
exactly one repo and no cross-repo contract: dispatch in that repo's own
project instead.

## Verified BKD Facts

Checked against BKD 0.2.2. Re-verify if the server changes.

1. An issue's working directory is its project's `directory` (or its worktree).
   There is **no per-issue directory** field. Binding an issue to one repo
   checkout is therefore done by putting the issue in a **project whose
   `directory` is that repo root**.
2. `useWorktree: true` requires the **project directory itself** to be a git
   repo (`Cannot create worktree: <dir> is not a git repository`). A workspace
   directory with sibling repos is not a git repo, so worktree mode is
   unavailable there.
3. **Worktree failure is silent and dangerous.** When worktree creation fails,
   BKD logs `worktree_creation_failed_fallback_to_base` and runs the issue
   **in the project directory** instead. A `useWorktree: true` issue created in
   a workspace project does not fail — it ends up writing across the whole
   workspace. Never trust the flag; verify per [Boundary
   Checks](#boundary-checks).
4. Worktrees live under BKD's own root (`<bkd-root>/worktrees/{projectId}/{issueId}`),
   not beside the repos. Relative sibling paths (`../other-repo`) do **not**
   resolve inside a lane worktree; only absolute workspace paths do.
5. Lane branch is `bkd/{issueId}`, cut from the first existing of `main`,
   `master`, `origin/main`, `origin/master` **in that repo**.
6. `GET /projects` returns `directory`, `isGitRepo`, and `isArchived`, so the
   repo → project mapping is discoverable; `POST /projects` creates a missing
   per-repo project (it only needs the directory to exist).
7. Follow-up is project-scoped (`POST /projects/{pid}/issues/{iid}/follow-up`).
   Cross-project reporting works, but the URL must carry the **target's**
   `projectId`; a lane that posts to its own project id loses the report.

## Topology

```
Workspace project (directory = workspace root, NOT a git repo)
  L1 master coordinator issue  (useWorktree:false, no cron, event-driven)
    - talks to the user; owns the workspace ledger in <workspace>/docs/
    - coordination and forwarding only: no diffs, no builds, no code judgement
    - one lane per repo; records contracts, lane order, merge order, SHAs
        |  cross-project follow-up (URL carries the repo project id)
        v            ^ user may also talk to a lane directly on the board
Repo project A (directory = <workspace>/repo-a, isGitRepo:true)
  L2 lane issue A (useWorktree:true -> branch bkd/{laneA})
    - implements and self-checks inside repo-a only; reports to the master
    - on a confirmed merge: git -C <repo-a> merge bkd/{laneA}, re-run checks,
      revert on failure, report the SHAs to the master
Repo project B (directory = <workspace>/repo-b)
  L2 lane issue B ...
```

The master is L1 in the sense of `three-tier-coordination.md` (event-driven, no
cron, two user-confirmation gates) minus the review-and-merge duties, which move
into the lane. A lane is an L2 whose entire workstream is one repository, from
first commit to merged base branch.

## Hard Rules

1. **One issue, one repo.** A lane issue may create, edit, or delete files only
   under its own repo root. Work that a lane discovers in another repo is
   reported, never done.
2. **No cross-repo commits.** Every commit, branch, and merge happens inside
   one repo. There is no cross-repo atomic commit; the ledger records order and
   per-repo SHAs so the change set can be replayed or reverted repo by repo.
3. **Lane issues live in per-repo projects with `useWorktree: true`.** Never
   create a lane in the workspace project with `useWorktree: true` — it
   silently falls back to the workspace root (fact 3).
4. **Only the master writes the ledger.** Lanes report by follow-up. The ledger
   lives in the workspace, outside every repo, and is never committed into a
   repo.
5. **The master never verifies code.** No diff reading, no lint/test/build, no
   green/yellow/red quality classification, no hand-fixing. It dispatches,
   records reports in the ledger, forwards them (to the user, to another lane),
   and asks when a decision is needed. Anything that
   requires looking at code is dispatched to an issue inside the owning repo.
6. **A lane merges only its own branch, only into its own repo, and only after
   an explicit merge confirmation.** It merges with `git -C <repoRoot>` from
   its worktree, never checks out the base branch, never merges another lane's
   branch, and never pushes unless the payload says so.
7. **Lanes never read sibling repos through relative paths** (fact 4). A lane
   needs either an absolute read-only path supplied by the master, or — better —
   the contract excerpt inlined in its dispatch payload.
8. **Two master confirmation gates**, as in `three-tier-coordination.md`: the
   lane set (which repos, what each does, in what order) and each per-repo
   merge.

## Pre-Flight

```bash
set -o pipefail

WORKSPACE=/srv/ybo                      # the workspace project's directory
curl -sS --fail-with-body "$BKD_URL/health" | bkd_check
curl -sS --fail-with-body "$BKD_URL/processes/capacity" | bkd_check

# 1. Discover repos in the workspace (confirm the list with the user)
find "$WORKSPACE" -mindepth 2 -maxdepth 4 -name .git -prune | sed 's|/\.git$||'

# 2. Map each repo to a BKD project
curl -sS --fail-with-body "$BKD_URL/projects" \
  | bkd_check | jq -r '.data[] | select(.isArchived != true)
      | [.id, .directory, (.isGitRepo | tostring)] | @tsv'
```

Match on the resolved absolute `directory`. For a repo with no project, ask the
user before creating one — it adds a board column:

```bash
jq -n --arg name "repo-a" --arg dir "$WORKSPACE/repo-a" \
  '{name:$name, directory:$dir}' > /tmp/bkd-body.json
REPO_PROJ=$(curl -sS --fail-with-body -X POST "$BKD_URL/projects" \
  -H 'Content-Type: application/json' --data-binary @/tmp/bkd-body.json) || exit 1
printf '%s\n' "$REPO_PROJ" | jq -e '.success == true and (.data.id | type == "string")' >/dev/null || exit 1
REPO_PROJ_ID=$(printf '%s\n' "$REPO_PROJ" | jq -er '.data.id')
```

A repo whose project reports `isGitRepo:false`, or which has none of the four
base refs, cannot host a worktree lane: stop and report it instead of
dispatching a lane that would fall back to the repo root.

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

| repo | projectId | lane task | lane issue | branch | order | state |
|------|-----------|-----------|------------|--------|-------|-------|
| hub  | c27m0e69  | 20260913-1830-hub-api | k3x9... | bkd/k3x9... | 1 | dispatched |
| studio | kmbvhxnl | 20260913-1830-studio-client | p7a2... | bkd/p7a2... | 2 | planned |

## Cross-Repo Contracts

- `POST /v1/orders` request/response shape owned by hub; consumed by studio.
  Producer lane must merge before the consumer lane is dispatched.

## Merge Log

- hub: base `a1b2c3d` -> merge `e4f5g6h` (checks: `bun test` pass) 2026-09-13 18:40

## Rollback Plan

- Revert in reverse merge order; per repo `git revert -m 1 <merge-sha>`.
```

Lane `state` values are ledger-internal (`planned`, `dispatched`, `reported`,
`verified`, `merged`, `blocked`) and unrelated to BKD `statusId`, which stays in
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
# on a verified, merged lane
"$PMA_SKILL/scripts/task-state.sh" complete "$WORKSPACE/docs/task/20260913-1830-hub-api.md" "bkd:$LANE_ID" "merged e4f5g6h"
```

`task-state.sh` needs `flock` and a `docs/task/index.md` beside the detail file;
it is repo-agnostic. If the engine cannot reach the PMA skill, perform the same
transition by hand under `flock` on the task directory, and keep the index
markers (`[ ] [-] [x] [~] [d]`) exactly as PMA defines them.

Ledger updates are immediate, never deferred: claim before dispatch, record
each report as it arrives, record each merge SHA as soon as the integration
issue reports it, and append decisions and rollbacks to `changelog.md`.

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
- **Dispatch lanes** in the repo projects (`useWorktree:true`), respecting
  capacity and order: lanes with no dependency may run concurrently; a consumer
  lane stays in `todo` until its producer lane is merged.
- **Record and forward, do not assess.** Write each lane report into the lane
  task notes and the plan's Repo Map verbatim enough to be actionable, run the
  cheap record-level checks in [Boundary Checks](#boundary-checks), and forward
  the outcome: a lane's own `Status` and check result decide the next step, not
  the master's opinion of the code. Contract facts a lane delivered are
  forwarded into the dependent lanes' payloads unchanged.
- **Gate 2 — merge.** For a lane that reports success with passing checks,
  present to the user: the lane's report, the branch name, and the merge plan
  for that one repo; wait for explicit confirmation. Then forward the merge
  approval to that lane (see [Lane Merge and
  Rollback](#lane-merge-and-rollback)) and record the SHAs it reports back. The
  master never merges, never reads the diff, and never runs the checks itself.
- **Route failures instead of fixing them.** `failure`/`partial`/`blocked`, a
  failed check, a boundary violation, a merge conflict, or a post-merge revert
  goes back to the owning lane as a rework follow-up (quoting the reported
  error), or to the user when it needs a decision. Rework is bounded (default 2
  attempts per lane); on exceed, set the lane state `blocked` and ask the user.
- **Terminate** when every lane is `merged` or `blocked`: delete each lane's
  cron by captured ID if it registered one (assert success, verify
  `isDeleted:true`), set the plan status to `completed`, complete or close each
  lane task, append a changelog entry, and move the master to `review`. `done`
  stays human-only.

The master is woken by user messages and lane follow-ups; it creates **no
cron** and never uses `sleep`.

## Lane Dispatch Payload

```bash
LANE_TITLE="[L2 lane:repo-a] {goal} [{campaignId}]"
LANE=$(jq -n --arg title "$LANE_TITLE" --arg campaign "campaign:{campaignId}" \
  '{title:$title,statusId:"todo",useWorktree:true,tags:["mr","l2",$campaign]}' \
  | curl -sS --fail-with-body -X POST "$BKD_URL/projects/$REPO_PROJ_ID/issues" \
      -H 'Content-Type: application/json' -d @-) || exit 1
if ! printf '%s\n' "$LANE" | jq -e '.success == true and (.data.id | type == "string")' >/dev/null; then
  printf 'BKD error: %s\n' "$(printf '%s\n' "$LANE" | jq -r '.error // "invalid response"')" >&2
  exit 1
fi
LANE_ID=$(printf '%s\n' "$LANE" | jq -er '.data.id')

cat > /tmp/bkd-prompt.txt <<'PROMPT'
## Role
You are the L2 repo lane for __REPO_NAME__ in multi-repo campaign __CAMPAIGN_ID__.
Your repo is __REPO_PATH__ and you run in your own worktree on branch
bkd/__LANE_ID__. You own this repo end to end: implementation, checks, and —
after the master forwards the user's merge approval — the merge into this
repo's base branch. The master owns the workspace ledger and the cross-repo
decisions.

## Repo Boundary (hard)
- Create, edit, or delete files ONLY under this repo. Never write to a sibling
  repo or to the workspace root (__WORKSPACE__), including its docs/ ledger.
- Never `cd` out of your worktree and never switch branches.
- Sibling repos are NOT reachable by relative path from this worktree. If you
  need something from another repo, use the read-only absolute paths listed
  below; if it is missing, report status=blocked instead of guessing.
- Commit only your own repo's work, and merge only your own branch, only into
  this repo. Never `git checkout` the base branch: run merge and status through
  `git -C __REPO_PATH__` from here.

## Goal
{bounded goal for this repo}

## Cross-Repo Contract (authoritative, do not re-derive)
{inline the exact shapes/versions this lane must produce or consume}

## Files In Scope (only these may be edited)
- {path inside this repo}

## Read-Only Context (absolute paths)
- {absolute path in a sibling repo, if genuinely needed}

## Acceptance Criteria
- {criterion}

## Mandatory Project Checks (before reporting)
Check command: {repo-defined lint/typecheck/test/build}
Fix and re-run until it passes. If it cannot pass for a reason outside this
spec, report status=blocked with the failing command and its output.

## Merge Sequence — only after the master approves the merge
Do NOT merge when you first report; wait for the master's merge approval
follow-up. Then, in one turn:
1. `git -C __REPO_PATH__ status --porcelain` must be empty, and the repo root
   must be on its base branch. Never stash or commit work you did not author —
   report and stop instead.
2. Confirm `git -C __REPO_PATH__ diff --name-only <base>...bkd/__LANE_ID__`
   stays inside this repo, and that every sibling repo under __WORKSPACE__ is
   clean.
3. `MERGE_BASE=$(git -C __REPO_PATH__ rev-parse HEAD)`, then
   `git -C __REPO_PATH__ merge --no-ff bkd/__LANE_ID__ -m "merge: {goal} (bkd/__LANE_ID__) [__CAMPAIGN_ID__]"`.
   On conflict: `git -C __REPO_PATH__ merge --abort`, report status=conflict
   with the conflicting paths, stop.
4. Re-run the check command on the base branch. On failure:
   `git -C __REPO_PATH__ revert -m 1 HEAD --no-edit`, report status=reverted
   with the failing output, then fix on your branch and wait for a new
   approval.
5. Report status=merged with MergeBase and MergeSha. Do not push unless this
   payload says to.

## Report To The Master (exact URL — note the workspace project id)
POST __BKD_URL__/projects/__MASTER_PROJECT_ID__/issues/__MASTER_ID__/follow-up
Body JSON shape:
{"prompt": "campaignId: __CAMPAIGN_ID__\nlane __LANE_ID__ repo __REPO_NAME__\nStatus: success|failure|partial|blocked|merged|conflict|reverted\nBranch: bkd/__LANE_ID__ (commits: N)\nChanged files: ...\nContract delivered: {what the sibling repos can now rely on}\nChecks: {command} -> passed | {failing output}\nMergeBase/MergeSha: {only in a merge report}\nCross-repo needs: {work that belongs to another repo, or none}\nRemaining issues: ..."}

Report again after the merge turn, and report anything the user agrees with you
directly on the board, so the master's ledger stays accurate.

## Strict Rules
- Use ONLY that HTTP endpoint to talk to the master; do not assume any
  engine-local slash command exists.
- Do not create issues in other projects, do not merge another lane's branch,
  do not touch the workspace ledger. After reporting, exit.
PROMPT
sed -i "s|__CAMPAIGN_ID__|$CAMPAIGN_ID|g; s|__LANE_ID__|$LANE_ID|g; s|__REPO_NAME__|$REPO_NAME|g; s|__REPO_PATH__|$REPO_PATH|g; s|__WORKSPACE__|$WORKSPACE|g; s|__BKD_URL__|$BKD_URL|g; s|__MASTER_PROJECT_ID__|$MASTER_PROJECT_ID|g; s|__MASTER_ID__|$MASTER_ID|g" /tmp/bkd-prompt.txt
jq -n --rawfile prompt /tmp/bkd-prompt.txt '{prompt:$prompt}' > /tmp/bkd-body.json

curl -sS --fail-with-body -X POST "$BKD_URL/projects/$REPO_PROJ_ID/issues/$LANE_ID/follow-up" \
  -H 'Content-Type: application/json' --data-binary @/tmp/bkd-body.json | bkd_check

curl -sS --fail-with-body "$BKD_URL/processes/capacity" \
  | bkd_check | jq -e '.data.canStartNewExecution == true' >/dev/null || exit 1
curl -sS --fail-with-body -X PATCH "$BKD_URL/projects/$REPO_PROJ_ID/issues/$LANE_ID" \
  -H 'Content-Type: application/json' -d '{"statusId":"working"}' | bkd_check
```

The `working` PATCH is fire-and-forget: re-read `sessionStatus` and, if it is
`failed`, POST any follow-up to flush the queued spec (see
`orchestration.md` § 4.2).

## Lane Responsibilities

- Implement only its own repo's spec, pass that repo's own checks, commit on
  `bkd/{laneId}`, then follow-up the master and exit. BKD auto-moves it to
  `review`; it never changes status by hand.
- Merge its own branch when the master forwards the merge approval, following
  [Lane Merge and Rollback](#lane-merge-and-rollback), and report the SHAs.
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
approval replaces the per-batch dispatch gate and every merge gate, and the
master keeps driving until every lane is merged or blocked.

MR specifics:

- **The master still never verifies code.** Auto mode removes the *user* from
  the merge gate, not the division of labour: on a lane report that passes the
  record-level [Boundary Checks](#boundary-checks) and carries passing checks,
  the master forwards the merge approval to that lane itself instead of asking
  the user. The lane's own pre-merge checks and post-merge check run remain the
  gate.
- **Cross-repo ordering is unchanged**: a consumer lane still waits for its
  producer lane's merge report.
- **Lane questions are settled with the lane** (the decision protocol from the
  same section), recorded in the plan file, and forwarded into any dependent
  lane's payload.
- **The master registers the one watchdog cron** described there, since no user
  is watching for a stalled lane, and deletes it at campaign completion.
- **Hard stops still apply**, plus the MR-specific ones: a boundary violation,
  a repo whose root checkout is dirty with work no lane owns, and any push,
  publish, or tag step (the master asks before approving a merge whose payload
  includes one).

## Cross-Repo Dependencies and Ordering

- **Contract first.** The master writes the contract (endpoint shape, schema,
  package version, config key) into the plan file and inlines it in both the
  producer and the consumer lane payload. Lanes never negotiate contracts with
  each other.
- **Producer before consumer.** The consumer lane is created in `todo` and left
  there until the producer lane's branch is merged into its repo's base branch;
  only then queue its payload and PATCH it to `working`. Dispatching both at
  once is how a "works on my branch" pair reaches the base branches broken.
- **Version-coupled repos.** When the consumer depends on a published artifact
  (npm/crate/module tag), the master puts the publish or tag step in the
  producer lane's merge-approval follow-up, and names the exact version in the
  consumer payload once that lane reports it.
- **If a contract changes mid-campaign**, the master updates the plan file, then
  uses stop → verify `review` → follow-up on each affected lane (see
  `three-tier-coordination.md` → Loop Engine). Never bare-follow-up a lane
  that is mid-turn with a changed contract.

## Boundary Checks

Boundary enforcement is split so the master stays out of the code: the master
runs only record-level checks (BKD API reads and string comparison), and the
git-level check belongs to the lane, which is already inside the repository.

**Master, on every lane report** — no repo access needed:

```bash
# 1. The lane really ran in a worktree, not in the repo root
curl -sS --fail-with-body "$BKD_URL/projects/$REPO_PROJ_ID/issues/$LANE_ID/changes" \
  | bkd_check | jq -r '.data.root'   # must be <bkd-root>/worktrees/..., not $REPO_PATH

# 2. Every path in the report's "Changed files" line starts with this lane's
#    repo. Any other prefix, or an absolute path outside it, is a violation.
```

Both checks are mechanical: a wrong `root` or a foreign path prefix means the
lane escaped its boundary. The master does not approve such a merge, records the
violation in the ledger, and follows up the lane to move or revert the stray
work inside its own repo — it never cleans up the repos itself.

**Lane, before it merges** — the git-level confirmation, reported to the master
rather than fixed silently:

- the repo root checkout is on the base branch and clean
  (`git -C <repoRoot> status --porcelain` empty) — never merge into someone
  else's uncommitted work, and never stash or commit work the lane did not
  author;
- its own branch diff `git -C <repoRoot> diff --name-only <base>...bkd/{laneId}`
  stays inside the repo;
- every sibling repo in the workspace is still clean, which catches work that
  escaped the boundary before it was committed.

## Lane Merge and Rollback

The lane owns the merge of its own branch. It happens only after the master
forwards the user's merge confirmation, as a follow-up to the lane (which sits
in `review` after reporting, so the follow-up alone wakes it):

```bash
cat > /tmp/bkd-prompt.txt <<'PROMPT'
Merge approved for bkd/__LANE_ID__ into __REPO_NAME__'s base branch
(campaignId __CAMPAIGN_ID__). Run the merge sequence from your dispatch
prompt, then report MergeBase/MergeSha/Checks to the master. Do not start any
new implementation work in this turn.
PROMPT
sed -i "s|__LANE_ID__|$LANE_ID|g; s|__REPO_NAME__|$REPO_NAME|g; s|__CAMPAIGN_ID__|$CAMPAIGN_ID|g" /tmp/bkd-prompt.txt
jq -n --rawfile prompt /tmp/bkd-prompt.txt '{prompt:$prompt}' > /tmp/bkd-body.json
curl -sS --fail-with-body -X POST "$BKD_URL/projects/$REPO_PROJ_ID/issues/$LANE_ID/follow-up" \
  -H 'Content-Type: application/json' --data-binary @/tmp/bkd-body.json | bkd_check
```

The sequence the lane runs, entirely with `git -C "$REPO_PATH"` so it never
leaves its worktree and never checks out the base branch (git forbids checking
out a branch that another worktree holds, and the lane holds `bkd/{laneId}`):

```bash
git -C "$REPO_PATH" status --porcelain          # must be empty
BASE_REF=$(git -C "$REPO_PATH" branch --show-current)
MERGE_BASE=$(git -C "$REPO_PATH" rev-parse HEAD)

git -C "$REPO_PATH" merge --no-ff "bkd/$LANE_ID" \
  -m "merge: {lane goal} (bkd/$LANE_ID) [{campaignId}]"
# conflict    -> git -C "$REPO_PATH" merge --abort, report status=conflict with
#                the conflicting paths; ask the master before retrying
# checks fail -> git -C "$REPO_PATH" revert -m 1 HEAD --no-edit, report
#                status=reverted with the failing output, then fix on the branch
```

After a successful merge the lane re-runs the repo's check command on the base
branch and reports `Status: merged`, `MergeBase`, `MergeSha`, and the check
result. The master writes those into the plan's Merge Log immediately; that log
is the rollback script. Rollback is also the lane's work: the master asks each
affected lane for `git revert -m 1 <merge-sha>` in reverse merge order, and
records the outcome in `changelog.md`. Conflict handling and post-merge
verification detail: `merge-strategy.md` (for the lane, never for the master).

## Composing With the Other Patterns

| Situation | Pattern |
|-----------|---------|
| Request touches 2+ repos in a workspace | this file: master + one lane per repo (two tiers) |
| One repo, several subtasks, one session | `orchestration.md` |
| One repo, long-running campaign, many workstreams | `three-tier-coordination.md` |

A repo whose share of the campaign is too big for one lane is not an MR
problem: run `three-tier-coordination.md` inside that repo's own project as a
separate campaign, and let the MR lane for that repo wait on its result.

`quality-review.md` still describes how a lane report is judged, but in this
mode the judging is not the master's: the lane self-reviews before reporting
and its check runs — before reporting and again after the merge — are the gate.
The master reads the reported `Status` and `Checks` lines and routes.

## Key Constraints

1. **One issue, one repo** — lanes never write across repo boundaries, and
   never write the workspace ledger.
2. **Lane = per-repo project + `useWorktree:true`**; a `useWorktree:true` issue
   in a non-git workspace project silently runs in the workspace root.
3. **The master coordinates only** — no diff reading, no lint/test/build, no
   quality classification, no hand-fixing; it dispatches, records, forwards,
   and asks. Every code-facing step is an issue inside the owning repo.
4. **Boundary checks are split** — master: `.data.root` is a worktree path and
   every reported path starts with the lane's repo; lane before merging: repo
   root clean and on its base branch, branch diff inside the repo, all sibling
   repos clean.
5. **Cross-project follow-up URLs carry the target project id** — a lane
   reporting to its own project id loses the report.
6. **No relative sibling paths from a lane worktree** — worktrees live outside
   the workspace.
7. **Contract first, producer before consumer** — never dispatch both sides of
   a contract concurrently.
8. **Ledger is authoritative and updated immediately** — PMA formats, claimed
   through `task-state.sh` (or the same transition under `flock`), history in
   `changelog.md`.
9. **A lane merges only its own branch into its own repo**, via
   `git -C <repoRoot>` without checking out the base branch, only after the
   master forwards the user's approval; two gates total (lane set, each merge).
10. **No cross-repo atomicity** — the Merge Log plus reverse-order revert is
    the rollback plan; say so to the user rather than implying atomic behaviour.
11. **No `sleep`, `review` != `done`, capacity before every dispatch** — the
    shared BKD rules in `SKILL.md` still apply.
