# gitea-mcp tools — Labels, milestones, time tracking, wiki

8 tools. Each heading is the exact MCP tool name. Annotation: read-only / write / **DESTRUCTIVE** (irreversible — confirm with the user first). `req` = required.

## `label_read`  ·  read-only

Read labels — Read repo or org labels.

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `method` | string | yes | enum: `list_repo_labels` \| `get_repo_label` \| `list_org_labels` |  |
| `owner` | string | — | — | for repo methods |
| `repo` | string | — | — | for repo methods |
| `org` | string | — | — | for org methods |
| `id` | number | — | — | label ID (for 'get_repo_label') |
| `page` | number | — | default `1` | page |
| `per_page` | number | — | default `30` | results per page |

## `label_write`  ·  **DESTRUCTIVE**

Create, update, or delete labels — Write labels (repo or org): create, edit, delete.

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `method` | string | yes | enum: `create_repo_label` \| `edit_repo_label` \| `delete_repo_label` \| `create_org_label` \| `edit_org_label` \| `delete_org_label` |  |
| `owner` | string | — | — | for repo methods |
| `repo` | string | — | — | for repo methods |
| `org` | string | — | — | for org methods |
| `id` | number | — | — | for edit/delete |
| `name` | string | — | — | required for create |
| `color` | string | — | — | hex (#RRGGBB); required for create |
| `description` | string | — | — |  |
| `exclusive` | boolean | — | — | exclusive (org only) |
| `is_archived` | boolean | — | — | archived (repo only) |

## `milestone_read`  ·  read-only

Read milestones — Read milestones: get one or list.

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `method` | string | yes | enum: `get` \| `list` |  |
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `id` | number | — | — | for 'get' |
| `state` | string | — | default `all` |  |
| `name` | string | — | — | name filter (for 'list') |
| `page` | number | — | default `1` | page |
| `per_page` | number | — | default `30` | results per page |

## `milestone_write`  ·  **DESTRUCTIVE**

Create, update, or delete milestones — Write milestones: create, update, delete.

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `method` | string | yes | enum: `create` \| `update` \| `edit` \| `delete` |  |
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `id` | number | — | — | for 'update'/'delete' |
| `title` | string | — | — | for 'create' |
| `description` | string | — | — |  |
| `due_on` | string | — | — | due date |
| `state` | string | — | enum: `open` \| `closed` |  |

## `timetracking_read`  ·  read-only

Read tracked time — Read time tracking: issue times, repo times, active stopwatches, your tracked times.

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `method` | string | yes | enum: `list_issue_times` \| `list_repo_times` \| `get_my_stopwatches` \| `get_my_times` |  |
| `owner` | string | — | — | for list_* methods |
| `repo` | string | — | — | for list_* methods |
| `issue_number` | number | — | — | for 'list_issue_times' |
| `page` | number | — | default `1` | page |
| `per_page` | number | — | default `30` | results per page |

## `timetracking_write`  ·  write

Add or manage tracked time — Write time tracking: stopwatches and entries.

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `method` | string | yes | enum: `start_stopwatch` \| `stop_stopwatch` \| `delete_stopwatch` \| `add_time` \| `delete_time` |  |
| `owner` | string | — | — | repo owner |
| `repo` | string | — | — | repo name |
| `issue_number` | number | — | — |  |
| `time` | number | — | — | seconds (for 'add_time') |
| `id` | number | — | — | entry ID (for 'delete_time') |

## `wiki_read`  ·  read-only

Read wiki pages — Read wiki: list pages, get content, revision history.

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `method` | string | yes | enum: `list` \| `get` \| `get_revisions` |  |
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `pageName` | string | — | — | for 'get'/'get_revisions' |

## `wiki_write`  ·  **DESTRUCTIVE**

Create, update, or delete wiki pages — Write wiki pages: create, update, delete.

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `method` | string | yes | enum: `create` \| `update` \| `delete` |  |
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `pageName` | string | — | — | for 'update'/'delete' |
| `title` | string | — | — | for 'create' |
| `content` | string | — | — | for 'create'/'update' |
| `message` | string | — | — | commit message |
