# Gitea REST API — Issues & pull requests

All examples use the `gitea` helper from [setup.md](setup.md#gitea-helper-function). Annotation column: `R` / `W` / `D` (= read-only / write / **DESTRUCTIVE**).

For titles, descriptions, comments, review text, or any other free-form value, create a temporary body with `jq -n` and call `gitea_json`; never interpolate text into inline JSON. The snippets below assume `BODY_FILE=$(mktemp)` with a cleanup trap.

> Gotcha: in Gitea, PRs and issues share the same `number` namespace per repo.
> PR conversation comments go to `/issues/{idx}/comments`. Code-review comments
> go through the review endpoints below.

## Endpoint reference

| Verb | Path | Operation | A |
|---|---|---|---|
| GET | `/repos/{owner}/{repo}/issues` | List issues | R |
| GET | `/repos/{owner}/{repo}/issues/{idx}` | Get issue | R |
| POST | `/repos/{owner}/{repo}/issues` | Create issue | W |
| PATCH | `/repos/{owner}/{repo}/issues/{idx}` | Edit issue | W |
| GET | `/repos/{owner}/{repo}/issues/{idx}/comments` | List issue comments | R |
| GET | `/repos/{owner}/{repo}/issues/comments` | List all repo comments | R |
| GET | `/repos/{owner}/{repo}/issues/comments/{id}` | Get one comment | R |
| POST | `/repos/{owner}/{repo}/issues/{idx}/comments` | Create comment | W |
| PATCH | `/repos/{owner}/{repo}/issues/comments/{id}` | Edit comment | W |
| DELETE | `/repos/{owner}/{repo}/issues/comments/{id}` | Delete comment | **D** |
| GET | `/repos/{owner}/{repo}/issues/{idx}/labels` | List labels on issue | R |
| POST | `/repos/{owner}/{repo}/issues/{idx}/labels` | Add labels | W |
| PUT | `/repos/{owner}/{repo}/issues/{idx}/labels` | Replace labels | W |
| DELETE | `/repos/{owner}/{repo}/issues/{idx}/labels/{label_id}` | Remove one label | W |
| DELETE | `/repos/{owner}/{repo}/issues/{idx}/labels` | Clear labels | W |
| GET | `/repos/{owner}/{repo}/pulls` | List PRs | R |
| GET | `/repos/{owner}/{repo}/pulls/{idx}` | Get PR | R |
| GET | `/repos/{owner}/{repo}/pulls/{idx}.diff` | PR diff (raw) | R |
| GET | `/repos/{owner}/{repo}/pulls/{idx}/files` | PR changed files | R |
| GET | `/repos/{owner}/{repo}/commits/{sha}/statuses` | PR head commit status | R |
| POST | `/repos/{owner}/{repo}/pulls` | Create PR | W |
| PATCH | `/repos/{owner}/{repo}/pulls/{idx}` | Edit PR | W |
| POST | `/repos/{owner}/{repo}/pulls/{idx}/update` | Update PR from base | W |
| POST | `/repos/{owner}/{repo}/pulls/{idx}/merge` | Merge PR | W |
| GET | `/repos/{owner}/{repo}/pulls/{idx}/reviews` | List reviews | R |
| GET | `/repos/{owner}/{repo}/pulls/{idx}/reviews/{rid}` | Get review | R |
| GET | `/repos/{owner}/{repo}/pulls/{idx}/reviews/{rid}/comments` | List review comments | R |
| POST | `/repos/{owner}/{repo}/pulls/{idx}/reviews` | Create review | W |
| POST | `/repos/{owner}/{repo}/pulls/{idx}/reviews/{rid}` | Submit pending review | W |
| POST | `/repos/{owner}/{repo}/pulls/{idx}/reviews/{rid}/dismissals` | Dismiss review | W |
| DELETE | `/repos/{owner}/{repo}/pulls/{idx}/reviews/{rid}` | Delete review | **D** |
| POST | `/repos/{owner}/{repo}/pulls/{idx}/requested_reviewers` | Request reviewers | W |
| DELETE | `/repos/{owner}/{repo}/pulls/{idx}/requested_reviewers` | Remove reviewers | W |

## Table of Contents

- [Issues](#issues)
- [Issue comments](#issue-comments)
- [Issue labels (assignment)](#issue-labels-assignment)
- [Pull requests](#pull-requests)
- [PR reviews](#pr-reviews)
- [PR reviewers](#pr-reviewers)

## Issues

### List repo issues · `GET /repos/{owner}/{repo}/issues` · read-only

Query: `state` (`open|closed|all`, default `open`), `labels` (comma-separated names), `type` (`issues|pulls|all`), `q` (title/body search), `assigned_by`, `created_by`, `mentioned_by`, `milestones`, `since` / `before` (ISO 8601), `page`, `limit`.

### Get issue · `GET /repos/{owner}/{repo}/issues/{idx}` · read-only

### Create issue · `POST /repos/{owner}/{repo}/issues` · write

```bash
jq -n --arg title "$TITLE" --arg body "$BODY" \
  --argjson assignees '["alice"]' --argjson labels '[3,7]' \
  '{title: $title, body: $body, assignees: $assignees, labels: $labels, milestone: 2, due_date: "2025-12-31T00:00:00Z"}' \
  > "$BODY_FILE"
gitea_json POST /repos/{owner}/{repo}/issues "$BODY_FILE"
```

Body: `title` (req), `body`, `assignees` (array of usernames), `labels` (array of label IDs), `milestone` (ID), `due_date` (ISO 8601), `ref` (branch).

### Edit issue · `PATCH /repos/{owner}/{repo}/issues/{idx}` · write

Body fields (any subset): `title`, `body`, `assignees`, `milestone`, `state` (`open|closed`), `due_date`, `unset_due_date` (boolean), `ref`.

## Issue comments

### List comments · `GET /repos/{owner}/{repo}/issues/{idx}/comments?since=&before=` · read-only

### List all repo comments · `GET /repos/{owner}/{repo}/issues/comments?since=&before=&page=1&limit=30` · read-only

### Get one comment · `GET /repos/{owner}/{repo}/issues/comments/{id}` · read-only

### Create comment · `POST /repos/{owner}/{repo}/issues/{idx}/comments` · write

```bash
jq -n --arg body "$COMMENT" '{body: $body}' > "$BODY_FILE"
gitea_json POST "/repos/{owner}/{repo}/issues/$NUM/comments" "$BODY_FILE"
```

### Edit comment · `PATCH /repos/{owner}/{repo}/issues/comments/{id}` · write

Body: `body` (req).

### Delete comment · `DELETE /repos/{owner}/{repo}/issues/comments/{id}` · **DESTRUCTIVE**

## Issue labels (assignment)

(For label CRUD itself — creating/editing/deleting label definitions — see `api-project.md`.)

### List labels on an issue · `GET /repos/{owner}/{repo}/issues/{idx}/labels` · read-only

### Add labels · `POST /repos/{owner}/{repo}/issues/{idx}/labels` · write

Body: `{"labels":[3,7]}` (array of label IDs).

### Replace labels · `PUT /repos/{owner}/{repo}/issues/{idx}/labels` · write

Body: `{"labels":[5]}`.

### Remove one label · `DELETE /repos/{owner}/{repo}/issues/{idx}/labels/{label_id}` · write

### Clear all labels · `DELETE /repos/{owner}/{repo}/issues/{idx}/labels` · write

## Pull requests

### List PRs · `GET /repos/{owner}/{repo}/pulls` · read-only

Query: `state` (`open|closed|all`, default `open`), `sort` (`oldest|recentupdate|leastupdate|mostcomment|leastcomment|priority`), `milestone` (ID), `labels` (comma-separated names), `poster` (username), `page`, `limit`.

### Get PR · `GET /repos/{owner}/{repo}/pulls/{idx}` · read-only

### Get PR diff · `GET /repos/{owner}/{repo}/pulls/{idx}.diff` · read-only

For patch format: `/pulls/{idx}.patch`. Append `?binary=true` to include binary file diffs.

### Get PR changed files · `GET /repos/{owner}/{repo}/pulls/{idx}/files?page=1&limit=30` · read-only

### Get PR head commit status · `GET /repos/{owner}/{repo}/commits/{pr.head.sha}/statuses` · read-only

(Resolve `pr.head.sha` from the PR object first.)

### Create PR · `POST /repos/{owner}/{repo}/pulls` · write

```bash
jq -n --arg title "$TITLE" --arg body "$BODY" --arg head "$HEAD_BRANCH" --arg base "$BASE_BRANCH" \
  '{title: $title, body: $body, head: $head, base: $base, assignees: ["alice"], labels: [3]}' \
  > "$BODY_FILE"
gitea_json POST /repos/{owner}/{repo}/pulls "$BODY_FILE"
```

Body: `title` (req), `body`, `head` (req — source branch; for cross-fork use `owner:branch`), `base` (req — target branch), `assignee`, `assignees`, `milestone`, `labels`, `due_date`. Prefix title with `WIP: ` (or `Draft: `) to create a draft PR.

### Edit PR · `PATCH /repos/{owner}/{repo}/pulls/{idx}` · write

Body fields (any subset): `title`, `body`, `assignee`, `assignees`, `milestone`, `labels`, `base` (re-target), `state` (`open|closed`), `allow_maintainer_edit`, `due_date`, `unset_due_date`.

### Update PR branch from base · `POST /repos/{owner}/{repo}/pulls/{idx}/update?style=merge|rebase` · write

Pulls the latest `base` into the PR's head branch.

### Merge PR · `POST /repos/{owner}/{repo}/pulls/{idx}/merge` · write

```bash
jq -n --arg title "$MERGE_TITLE" --arg message "$MERGE_MESSAGE" --arg head "$EXPECTED_HEAD_SHA" \
  '{Do: "squash", MergeTitleField: $title, MergeMessageField: $message, delete_branch_after_merge: true, head_commit_id: $head}' \
  > "$BODY_FILE"
gitea_json POST "/repos/{owner}/{repo}/pulls/$IDX/merge" "$BODY_FILE"
```

Body: `Do` (req: `merge|rebase|rebase-merge|squash|fast-forward-only`, **note the capital D**), `MergeTitleField`, `MergeMessageField`, `delete_branch_after_merge`, `force_merge` (bypass failing checks), `merge_when_checks_succeed` (queue until green), `head_commit_id` (expected head SHA — server returns 409 if it has moved).

A 405 typically means the PR is not mergeable (conflicts, failing required checks, missing approvals).

## PR reviews

### List reviews · `GET /repos/{owner}/{repo}/pulls/{idx}/reviews?page=1&limit=30` · read-only

### Get one review · `GET /repos/{owner}/{repo}/pulls/{idx}/reviews/{review_id}` · read-only

### List review comments · `GET /repos/{owner}/{repo}/pulls/{idx}/reviews/{review_id}/comments` · read-only

### Create review · `POST /repos/{owner}/{repo}/pulls/{idx}/reviews` · write

```bash
jq -n --arg body "$REVIEW_BODY" --arg commit "$PR_HEAD_SHA" --arg comment "$INLINE_COMMENT" \
  '{body: $body, event: "APPROVED", commit_id: $commit, comments: [{path: "src/foo.go", old_position: 0, new_position: 42, body: $comment}]}' \
  > "$BODY_FILE"
gitea_json POST "/repos/{owner}/{repo}/pulls/$IDX/reviews" "$BODY_FILE"
```

Body: `body` (overall comment), `event` (`APPROVED|REQUEST_CHANGES|COMMENT|PENDING`), `commit_id` (PR head SHA at time of review), `comments[]` (`{path, old_position, new_position, body}` — inline comments).

### Submit a pending review · `POST /repos/{owner}/{repo}/pulls/{idx}/reviews/{review_id}` · write

Body: `body`, `event` (final state).

### Dismiss review · `POST /repos/{owner}/{repo}/pulls/{idx}/reviews/{review_id}/dismissals` · write

Body: `{"message":"out of date"}`.

### Delete review · `DELETE /repos/{owner}/{repo}/pulls/{idx}/reviews/{review_id}` · **DESTRUCTIVE**

## PR reviewers

### Request reviewers · `POST /repos/{owner}/{repo}/pulls/{idx}/requested_reviewers` · write

Body: `{"reviewers":["alice","bob"],"team_reviewers":["frontend"]}`.

### Remove requested reviewers · `DELETE /repos/{owner}/{repo}/pulls/{idx}/requested_reviewers` · write

Body: same shape as add.
