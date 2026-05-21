# gitea-mcp tools — Actions (CI) & packages

6 tools. Each heading is the exact MCP tool name. Annotation: read-only / write / **DESTRUCTIVE** (irreversible — confirm with the user first). `req` = required.

## `package_read`  ·  read-only

Read package registry — Read package registry: list packages (one entry per version, filter via 'q'/'type'), list versions, or get a version.

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `method` | string | yes | enum: `list` \| `list_versions` \| `get` |  |
| `owner` | string | yes | — | user or org |
| `type` | string | — | — | container/npm/maven/pypi/cargo/generic; required except 'list' |
| `name` | string | — | — | slashes auto-encoded; required except 'list' |
| `version` | string | — | — | for 'get' |
| `q` | string | — | — | search query |
| `page` | number | — | default `1`; min 1 | page |
| `per_page` | number | — | default `30`; min 1 | results per page |

## `package_write`  ·  **DESTRUCTIVE**

Delete a package version — Delete a package version (irreversible).

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `method` | string | yes | enum: `delete` |  |
| `owner` | string | yes | — | user or org |
| `type` | string | yes | — | container/npm/maven/pypi/cargo/generic |
| `name` | string | yes | — | slashes auto-encoded |
| `version` | string | yes | — |  |

## `actions_config_read`  ·  read-only

Read Actions secrets and variables — Read Actions secrets and variables.

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `method` | string | yes | enum: `list_repo_secrets` \| `list_org_secrets` \| `list_repo_variables` \| `get_repo_variable` \| `list_org_variables` \| `get_org_variable` |  |
| `owner` | string | — | — | for repo methods |
| `repo` | string | — | — | for repo methods |
| `org` | string | — | — | for org methods |
| `name` | string | — | — | for get methods |
| `page` | number | — | default `1`; min 1 | page |
| `per_page` | number | — | default `30`; min 1 | results per page |

## `actions_config_write`  ·  **DESTRUCTIVE**

Manage Actions secrets and variables — Write Actions secrets and variables: upsert, create, update, delete.

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `method` | string | yes | enum: `upsert_repo_secret` \| `delete_repo_secret` \| `upsert_org_secret` \| `delete_org_secret` \| `create_repo_variable` \| `update_repo_variable` \| `delete_repo_variable` \| `create_org_variable` \| `update_org_variable` \| `delete_org_variable` |  |
| `owner` | string | — | — | for repo methods |
| `repo` | string | — | — | for repo methods |
| `org` | string | — | — | for org methods |
| `name` | string | — | — | secret or variable name |
| `data` | string | — | — | secret value (upsert) |
| `value` | string | — | — | variable value |
| `description` | string | — | — |  |

## `actions_run_read`  ·  read-only

Read Actions workflow, run, and job data — Read Actions workflows, runs, jobs, and logs.

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `method` | string | yes | enum: `list_workflows` \| `get_workflow` \| `list_runs` \| `get_run` \| `list_jobs` \| `list_run_jobs` \| `get_job_log_preview` \| `download_job_log` |  |
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `workflow_id` | string | — | — | ID or filename (for 'get_workflow') |
| `run_id` | number | — | — | for 'get_run'/'list_run_jobs' |
| `job_id` | number | — | — | for log methods |
| `status` | string | — | — | filter for 'list_runs'/'list_jobs' |
| `tail_lines` | number | — | default `200`; min 1 | log tail lines |
| `max_bytes` | number | — | default `65536`; min 1024 | max log bytes |
| `output_path` | string | — | — | for 'download_job_log' |
| `page` | number | — | default `1`; min 1 | page |
| `per_page` | number | — | default `30`; min 1 | results per page |

## `actions_run_write`  ·  write

Trigger, cancel, or rerun Actions workflows — Write Actions runs: dispatch, cancel, rerun.

| Param | Type | Req | Constraints | Description |
|---|---|---|---|---|
| `method` | string | yes | enum: `dispatch_workflow` \| `cancel_run` \| `rerun_run` |  |
| `owner` | string | yes | — | repo owner |
| `repo` | string | yes | — | repo name |
| `workflow_id` | string | — | — | ID or filename (for 'dispatch_workflow') |
| `ref` | string | — | — | branch or tag (for 'dispatch_workflow') |
| `inputs` | object | — | — | for 'dispatch_workflow' |
| `run_id` | number | — | — | for 'cancel_run'/'rerun_run' |
