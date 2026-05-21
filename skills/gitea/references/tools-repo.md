# gitea-mcp tools — Repository, files, branches, tags, commits, releases

23 tools. Each heading is the exact MCP tool name. Annotation: read-only / write / **DESTRUCTIVE** (irreversible — confirm with the user first). `req` = required.

## `create_branch`  ·  write

Create a new branch

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `branch` | string | yes | — |  |
| `old_branch` | string | — | — | source branch (default: repo default) |

## `delete_branch`  ·  **DESTRUCTIVE**

Delete a branch

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `branch` | string | yes | — |  |

## `list_branches`  ·  read-only

List repository branches

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `page` | number | — | default `1` | page |
| `per_page` | number | — | default `30` | results per page |

## `list_commits`  ·  read-only

List repository commits

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `sha` | string | — | — | starting SHA or branch |
| `path` | string | — | — | only commits touching this path |
| `page` | number | — | default `1`; min 1 | page |
| `per_page` | number | — | default `30`; min 1 | results per page |

## `get_commit`  ·  read-only

Get commit details

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `sha` | string | yes | — |  |

## `get_file_contents`  ·  read-only

Get file content — Get file content and metadata

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `ref` | string | yes | — | branch, tag, or commit SHA |
| `path` | string | yes | — |  |
| `withLines` | boolean | — | — | return numbered lines |

## `get_dir_contents`  ·  read-only

Get directory contents

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `ref` | string | yes | — | branch, tag, or commit SHA |
| `path` | string | yes | — |  |

## `create_or_update_file`  ·  write

Create or update a file — Create or update a file (provide sha to update an existing file).

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `path` | string | yes | — |  |
| `content` | string | yes | — |  |
| `message` | string | yes | — | commit message |
| `branch_name` | string | yes | — |  |
| `sha` | string | — | — | existing file SHA (omit to create) |
| `new_branch_name` | string | — | — | new branch (create only) |

## `delete_file`  ·  **DESTRUCTIVE**

Delete a file

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `path` | string | yes | — |  |
| `message` | string | yes | — | commit message |
| `branch_name` | string | yes | — |  |
| `sha` | string | yes | — |  |

## `create_release`  ·  write

Create a release

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `tag_name` | string | yes | — |  |
| `target` | string | yes | — | commitish |
| `title` | string | yes | — |  |
| `is_draft` | boolean | — | — |  |
| `is_pre_release` | boolean | — | — |  |
| `body` | string | — | — |  |

## `delete_release`  ·  **DESTRUCTIVE**

Delete a release

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `id` | number | yes | — |  |

## `get_release`  ·  read-only

Get release details — Get a release by ID

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `id` | number | yes | — |  |

## `get_latest_release`  ·  read-only

Get latest release

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |

## `list_releases`  ·  read-only

List releases

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `is_draft` | boolean | — | — |  |
| `is_pre_release` | boolean | — | — |  |
| `page` | number | — | default `1`; min 1 | page |
| `per_page` | number | — | default `20`; min 1 | results per page |

## `create_repo`  ·  write

Create a new repository

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `name` | string | yes | — |  |
| `description` | string | — | — |  |
| `private` | boolean | — | — |  |
| `issue_labels` | string | — | — |  |
| `auto_init` | boolean | — | — |  |
| `template` | boolean | — | — |  |
| `gitignores` | string | — | — |  |
| `license` | string | — | — |  |
| `readme` | string | — | — |  |
| `default_branch` | string | — | — |  |
| `trust_model` | string | — | enum: `default` \| `collaborator` \| `committer` \| `collaboratorcommitter` |  |
| `object_format_name` | string | — | enum: `sha1` \| `sha256` |  |
| `organization` | string | — | — | defaults to personal account |

## `fork_repo`  ·  write

Fork a repository

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `user` | string | yes | — | owner of source repo |
| `repo` | string | yes | — |  |
| `organization` | string | — | — | target org |
| `name` | string | — | — | fork name |

## `list_my_repos`  ·  read-only

List my repositories

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `page` | number | — | default `1`; min 1 | page |
| `per_page` | number | — | default `30`; min 1 | results per page |

## `list_org_repos`  ·  read-only

List organization repositories

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `org` | string | yes | — |  |
| `page` | number | — | default `1`; min 1 | page |
| `per_page` | number | — | default `100`; min 1 | results per page |

## `create_tag`  ·  write

Create a tag

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `tag_name` | string | yes | — |  |
| `target` | string | — | — | commitish |
| `message` | string | — | — | tag message |

## `delete_tag`  ·  **DESTRUCTIVE**

Delete a tag

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `tag_name` | string | yes | — |  |

## `get_tag`  ·  read-only

Get tag details

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `tag_name` | string | yes | — |  |

## `list_tags`  ·  read-only

List tags

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `page` | number | — | default `1`; min 1 | page |
| `per_page` | number | — | default `20`; min 1 | results per page |

## `get_repository_tree`  ·  read-only

Get repository file tree

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `tree_sha` | string | yes | — | SHA, branch, or tag |
| `recursive` | boolean | — | — |  |
| `page` | number | — | default `1` | page |
| `per_page` | number | — | default `30` | results per page |
