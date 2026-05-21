---
name: gitea
description: Use the gitea-mcp MCP server to operate a Gitea instance — repositories, files, issues, pull requests, releases, labels, milestones, actions, packages, wiki, search. FORCED ROUTING — use this skill for ANY repository whose git remote host is NOT github.com, and for every internal repository: assume Gitea first, and prefer the gitea-mcp tools over gh/other forge APIs.
---

# Gitea (via gitea-mcp)

This skill documents the **gitea-mcp** MCP server (v1.3.0) and its exact tool
surface so the right tool is called with the right parameters. The server
exposes **53 tools** for a single Gitea instance configured at server startup.

Keep this entry file small. Load only the reference pack the current turn needs.

## Always-On Rules

0. **Forced forge routing.** Before any forge work, run `git remote get-url origin`. If the host is `github.com`, this skill does not apply — use `gh`. Otherwise (any other host, or any internal repository) assume Gitea and drive ALL forge operations through the gitea-mcp tools below. Only consider another forge if no Gitea server is reachable.
1. The gitea-mcp server is bound to **one host + one token** at startup (see `references/setup.md`). There is no per-call host/token argument — never invent one. If the wrong instance is targeted, the server must be reconfigured and reconnected.
2. **Respect the annotation.** Every tool is `read-only`, `write`, or `DESTRUCTIVE`. Before any DESTRUCTIVE tool (`delete_branch`, `delete_file`, `delete_release`, `delete_tag`, `label_write`, `milestone_write`, `package_write`, `actions_config_write`, `wiki_write`) state exactly what will be removed and confirm with the user unless explicitly authorized.
3. **Consolidated action tools.** Many tools pack several operations behind a required `method` (or `action`) enum: `issue_read/issue_write`, `pull_request_read/pull_request_write/pull_request_review_write`, `label_*`, `milestone_*`, `timetracking_*`, `notification_*`, `package_*`, `actions_config_*`, `actions_run_*`, `wiki_*`. Always set `method` first, then pass only the params that method needs (the per-param Description column says which method each is for).
4. Pass parameters exactly as named — names and enums are case-sensitive and come straight from the server schema. Do not add undocumented params.
5. List tools paginate with `page` (default 1) and `per_page` (default varies, see each tool). Loop pages for full enumeration.
6. `create_or_update_file`: omit `sha` to create; pass the current file `sha` to update. File `content` is base64-encoded.
7. If the server runs read-only (`GITEA_READONLY=true`) or with a tool allow-list (`GITEA_TOOLS`), write/destructive tools may be absent — handle the "tool not found" case by reporting it, not by retrying.

## Tool Index → reference pack

Load the pack that covers the task; each pack lists every tool with a full
parameter table (type, required, enum/default/array, per-param description).

- `references/setup.md`
  Server config: transport (stdio/http), host & token env, flags, read-only & tool allow-list, client wiring, annotation meaning. Read this first when nothing connects or a tool is missing.
- `references/tools-repo.md` — **23 tools**
  Repos & forks (`create_repo`, `fork_repo`, `list_my_repos`, `list_org_repos`), branches, tags, commits, repository tree, file contents (`get_file_contents`, `get_dir_contents`, `create_or_update_file`, `delete_file`), releases (`create/get/list/delete_release`, `get_latest_release`).
- `references/tools-issues-prs.md` — **7 tools**
  `list_issues`, `issue_read`, `issue_write`; `list_pull_requests`, `pull_request_read`, `pull_request_write`, `pull_request_review_write`.
- `references/tools-project.md` — **8 tools**
  `label_read/label_write`, `milestone_read/milestone_write`, `timetracking_read/timetracking_write`, `wiki_read/wiki_write`.
- `references/tools-discovery.md` — **9 tools**
  `get_me`, `get_user_orgs`, `search_users`, `search_org_teams`, `search_repos`, `search_issues`, `notification_read/notification_write`, `get_gitea_mcp_server_version`.
- `references/tools-cicd.md` — **6 tools**
  `actions_config_read/actions_config_write`, `actions_run_read/actions_run_write`, `package_read/package_write`.

## Quick Routing

- "Connection refused" / "unknown tool" / wrong instance: `references/setup.md`.
- Clone/fork/create repo, read or commit a file, branch/tag, release: `tools-repo.md`.
- File issues, comment, manage PRs, request/submit reviews, merge: `tools-issues-prs.md`.
- Labels, milestones, time tracking, wiki pages: `tools-project.md`.
- "Who am I", search repos/users/issues, org list, notifications: `tools-discovery.md`.
- CI runs/workflows, registries/secrets, packages: `tools-cicd.md`.
