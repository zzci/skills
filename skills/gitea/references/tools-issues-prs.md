# gitea-mcp tools — Issues & pull requests

7 tools. Each heading is the exact MCP tool name. Annotation: read-only / write / **DESTRUCTIVE** (irreversible — confirm with the user first). `req` = required.

## `list_issues`  ·  read-only

List repository issues

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `state` | string | — | default `all` |  |
| `labels` | array | — | array of string | label name filter |
| `since` | string | — | — | updated after ISO 8601 |
| `before` | string | — | — | updated before ISO 8601 |
| `page` | number | — | default `1` | page |
| `per_page` | number | — | default `30` | results per page |

## `issue_read`  ·  read-only

Read issue details — Read issue: details, comments, or labels.

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `method` | string | yes | enum: `get` \| `get_comments` \| `get_labels` |  |
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `issue_number` | number | yes | — |  |

## `issue_write`  ·  write

Create or update issues, comments, and labels — Write issues: create, update, manage comments and labels.

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `method` | string | yes | enum: `create` \| `update` \| `add_comment` \| `edit_comment` \| `add_labels` \| `remove_label` \| `replace_labels` \| `clear_labels` |  |
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `issue_number` | number | — | — | required except for 'create' |
| `title` | string | — | — | required for 'create' |
| `body` | string | — | — | required for 'create'/'add_comment'/'edit_comment' |
| `assignees` | array | — | array of string |  |
| `milestone` | number | — | — |  |
| `state` | string | — | enum: `open` \| `closed` \| `all` |  |
| `commentID` | number | — | — | for 'edit_comment' |
| `labels` | array | — | array of number | label IDs |
| `label_id` | number | — | — | for 'remove_label' |
| `ref` | string | — | — | branch to associate |
| `deadline` | string | — | — | ISO 8601 |
| `remove_deadline` | boolean | — | — |  |

## `list_pull_requests`  ·  read-only

List pull requests

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `state` | string | — | enum: `open` \| `closed` \| `all`; default `all` |  |
| `sort` | string | — | enum: `oldest` \| `recentupdate` \| `leastupdate` \| `mostcomment` \| `leastcomment` \| `priority`; default `recentupdate` |  |
| `milestone` | number | — | — |  |
| `page` | number | — | default `1` | page |
| `per_page` | number | — | default `30` | results per page |

## `pull_request_read`  ·  read-only

Read pull request details — Read pull request: details, diff, changed files, head commit status, reviews.

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `method` | string | yes | enum: `get` \| `get_diff` \| `get_files` \| `get_status` \| `get_reviews` \| `get_review` \| `get_review_comments` |  |
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `pull_number` | number | yes | — |  |
| `review_id` | number | — | — | for 'get_review'/'get_review_comments' |
| `binary` | boolean | — | — | include binary diff |
| `page` | number | — | default `1` | page |
| `per_page` | number | — | default `30` | results per page |

## `pull_request_write`  ·  write

Create, update, close, reopen, or merge pull requests — Write pull requests: create, update, close, reopen, merge, update branch from base, manage reviewers.

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `method` | string | yes | enum: `create` \| `update` \| `close` \| `reopen` \| `merge` \| `update_branch` \| `add_reviewers` \| `remove_reviewers` |  |
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `pull_number` | number | — | — | required except for 'create' |
| `title` | string | — | — | required for 'create'; optional for 'update'/'merge' |
| `body` | string | — | — | required for 'create'; optional for 'update' |
| `head` | string | — | — | head branch (required for 'create') |
| `base` | string | — | — | base branch (required for 'create') |
| `assignee` | string | — | — | for 'update' |
| `assignees` | array | — | array of string | for 'update' |
| `milestone` | number | — | — | for 'update' |
| `state` | string | — | enum: `open` \| `closed` | for 'update' |
| `allow_maintainer_edit` | boolean | — | — | for 'update' |
| `labels` | array | — | array of number | label IDs |
| `deadline` | string | — | — | ISO 8601 |
| `remove_deadline` | boolean | — | — | for 'update' |
| `merge_style` | string | — | enum: `merge` \| `rebase` \| `rebase-merge` \| `squash` \| `fast-forward-only`; default `merge` | for 'merge' |
| `message` | string | — | — | merge commit message or dismissal reason |
| `delete_branch` | boolean | — | — | for 'merge' |
| `force_merge` | boolean | — | — | merge even if checks fail |
| `merge_when_checks_succeed` | boolean | — | — | for 'merge' |
| `head_commit_id` | string | — | — | expected head SHA for conflict detection |
| `reviewers` | array | — | array of string | for 'add_reviewers'/'remove_reviewers' |
| `team_reviewers` | array | — | array of string | for 'add_reviewers'/'remove_reviewers' |
| `draft` | boolean | — | — | uses 'WIP: ' title prefix |

## `pull_request_review_write`  ·  write

Submit a pull request review — Write PR reviews: create, submit, delete, dismiss.

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `method` | string | yes | enum: `create` \| `submit` \| `delete` \| `dismiss` |  |
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `pull_number` | number | yes | — |  |
| `review_id` | number | — | — | required except for 'create' |
| `state` | string | — | enum: `APPROVED` \| `REQUEST_CHANGES` \| `COMMENT` \| `PENDING` |  |
| `body` | string | — | — |  |
| `commit_id` | string | — | — | for 'create' |
| `message` | string | — | — | dismissal reason |
| `comments` | array | — | array of object | inline comments (for 'create') |
