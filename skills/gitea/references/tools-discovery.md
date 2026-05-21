# gitea-mcp tools — Users, search, notifications, version

9 tools. Each heading is the exact MCP tool name. Annotation: read-only / write / **DESTRUCTIVE** (irreversible — confirm with the user first). `req` = required.

## `get_me`  ·  read-only

Get current user information — Get current user

_No parameters._

## `get_user_orgs`  ·  read-only

Get user organizations — List current user's organizations

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `page` | number | — | default `defaultPage` | page |
| `per_page` | number | — | default `defaultPageSize` | results per page |

## `search_users`  ·  read-only

Search users

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `query` | string | yes | — |  |
| `page` | number | — | default `1` | page |
| `per_page` | number | — | default `30` | results per page |

## `search_org_teams`  ·  read-only

Search organization teams

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `org` | string | yes | — |  |
| `query` | string | yes | — |  |
| `includeDescription` | boolean | — | — |  |
| `page` | number | — | default `1` | page |
| `per_page` | number | — | default `30` | results per page |

## `search_repos`  ·  read-only

Search repositories

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `query` | string | yes | — |  |
| `keywordIsTopic` | boolean | — | — |  |
| `keywordInDescription` | boolean | — | — |  |
| `ownerID` | number | — | — |  |
| `isPrivate` | boolean | — | — |  |
| `isArchived` | boolean | — | — |  |
| `sort` | string | — | — |  |
| `order` | string | — | — |  |
| `page` | number | — | default `1` | page |
| `per_page` | number | — | default `30` | results per page |

## `search_issues`  ·  read-only

Search issues — Search issues and PRs across repositories

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `query` | string | yes | — |  |
| `state` | string | — | enum: `open` \| `closed` \| `all` |  |
| `type` | string | — | enum: `issues` \| `pulls` |  |
| `labels` | string | — | — | comma-separated |
| `owner` | string | — | — | filter by owner |
| `page` | number | — | default `1` | page |
| `per_page` | number | — | default `30` | results per page |

## `notification_read`  ·  read-only

Read notifications — Read notifications: list (optionally scoped to a repo) or get a thread by ID.

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `method` | string | yes | enum: `list` \| `get` |  |
| `owner` | string | — | — | scope 'list' to a repo |
| `repo` | string | — | — | scope 'list' to a repo |
| `id` | number | — | — | thread ID (for 'get') |
| `status` | string | — | enum: `unread` \| `read` \| `pinned` |  |
| `subject_type` | string | — | enum: `Issue` \| `Pull` \| `Commit` \| `Repository` |  |
| `since` | string | — | — | updated after ISO 8601 |
| `before` | string | — | — | updated before ISO 8601 |
| `page` | number | — | default `1` | page |
| `per_page` | number | — | default `30` | results per page |

## `notification_write`  ·  write

Manage notifications — Mark a notification or all notifications as read.

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `method` | string | yes | enum: `mark_read` \| `mark_all_read` |  |
| `id` | number | — | — | thread ID (for 'mark_read') |
| `owner` | string | — | — | scope 'mark_all_read' to a repo |
| `repo` | string | — | — | scope 'mark_all_read' to a repo |
| `last_read_at` | string | — | — | ISO 8601; defaults to now |

## `get_gitea_mcp_server_version`  ·  read-only

Get server version

_No parameters._
