---
name: gitea
description: "Operate a Gitea instance via its REST API at /api/v1/... with curl. FORCED ROUTING — use this skill for any repository whose git remote host is not github.com: derive the candidate HTTPS base URL from the remote host, probe /api/v1/version, then call the REST endpoints directly."
---

# Gitea (REST API)

Operate Gitea by sending HTTP requests to `$GITEA_URL/api/v1/...` authenticated
by `$GITEA_TOKEN`. This skill does NOT depend on any MCP server — every
operation is a direct `curl` call.

Keep this entry file small. Load only the reference pack the current turn needs.

## Always-On Rules

0. **Forced forge routing.** Before any forge work, run `git remote get-url origin` and parse the host. If the host is `github.com`, this skill does not apply — use `gh`, including for internal GitHub organizations. For any other host, treat it as a Gitea candidate: derive `https://<host>` as the probe base URL, run `curl -fsS --max-time 5 "https://<host>/api/v1/version"`, and use this skill only if HTTP 200 returns JSON with a `version` field. If the probe fails or times out, ask the user; do not guess another forge.
1. **Resolve `$GITEA_URL` + `$GITEA_TOKEN` from named env pairs, not from the user.** Each instance is exported as `GITEA_<ALIAS>_URL` + `GITEA_<ALIAS>_TOKEN` (e.g. `GITEA_ORGA_URL` + `GITEA_ORGA_TOKEN`). Call `gitea_auto` (defined in [setup.md](references/setup.md#instance-selection-multi-gitea)) to auto-pick the pair whose URL host matches the current repo's `origin`; falls back to the unaliased `GITEA_URL`/`GITEA_TOKEN`, then to gitea-mcp legacy `GITEA_HOST`/`GITEA_ACCESS_TOKEN`, then asks the user. `$GITEA_URL` is always the base URL **without** the `/api` suffix.
2. Send `Authorization: token $GITEA_TOKEN` on every request. Never put the token in the query string (`?token=`) — it would be logged.
3. Prefer `curl -s` piped to `jq` so results are easy to inspect. Always include `-o /dev/null -w '%{http_code}\n'` (or `--fail-with-body`) when verifying success on write/delete calls — Gitea returns success bodies on 2xx and a `{ "message": "...", "url": "..." }` error envelope on 4xx/5xx.
4. **Respect destructiveness.** Any `DELETE` against `/branches`, `/contents`, `/releases`, `/tags`, labels, milestones, packages, secrets, variables, or wiki pages is **irreversible**. State exactly what will be removed and confirm with the user unless explicitly authorized.
5. **Pagination**: most list endpoints take `?page=N&limit=M` (default `page=1`, `limit=30`, server max usually 50). A few older endpoints accept `per_page=` as an alias. Loop pages until the response is empty or `Link: rel="next"` is absent.
6. `PUT /repos/{owner}/{repo}/contents/{path}` (create/update file): `content` must be **base64-encoded**. Omit `sha` to create; pass the current file `sha` to update.
7. Endpoint responses are the resource directly — Gitea does **not** wrap them in `{ success, data }`. Errors come back with HTTP 4xx/5xx plus `{ "message": "...", "url": "..." }`.

## Core Workflow

### Environment

Credentials live in **named pairs** — `GITEA_<ALIAS>_URL` + `GITEA_<ALIAS>_TOKEN` — one pair per Gitea instance. `gitea_auto` matches the current repo's `origin` host to one of the URLs and loads that pair into `$GITEA_URL` + `$GITEA_TOKEN`. Full discovery order and helper code: [setup.md](references/setup.md#instance-selection-multi-gitea).

```bash
# Example user-side ~/.bashrc:
#   export GITEA_ORGA_URL=https://git.orga.com    GITEA_ORGA_TOKEN=...
#   export GITEA_ORGB_URL=https://git.orgb.local  GITEA_ORGB_TOKEN=...
#   export GITEA_URL=https://gitea.com            GITEA_TOKEN=...

# Per-session bootstrap (helpers from setup.md, e.g. sourced via /tmp/gitea-helpers.sh):
gitea_auto || { echo "no Gitea credentials (set GITEA_<ALIAS>_URL + GITEA_<ALIAS>_TOKEN, or GITEA_URL + GITEA_TOKEN)" >&2; exit 1; }

AUTH=(-H "Authorization: token $GITEA_TOKEN")
JSON=(-H 'Content-Type: application/json')
```

Env-var contract:

- `GITEA_<ALIAS>_URL` + `GITEA_<ALIAS>_TOKEN` — one named pair per instance. `<ALIAS>` is uppercase letters/digits/underscores; `GITEA_<ALIAS>_TOKEN_FILE` is accepted when `_TOKEN` is not exported.
- `GITEA_URL` + `GITEA_TOKEN` — unaliased single-instance fallback. `$GITEA_URL` is the base URL **without** the `/api` suffix.
- `GITEA_HOST` + `GITEA_ACCESS_TOKEN` — gitea-mcp legacy fallback.

The helpers (`gitea_list_aliases`, `gitea_use`, `gitea_auto`) are defined **only** in [setup.md's "Instance selection" section](references/setup.md#instance-selection-multi-gitea) — copy them from there before use; do not re-derive them from memory. Host matching strips `:port`, so two aliases on the same host with different ports resolve arbitrarily — use `gitea_use <ALIAS>` explicitly in that case.

> **Fresh-shell warning.** In agent environments, each command block runs in a new non-sourced shell — function definitions do NOT persist between blocks. Write the helper definitions (from setup.md) once to a temp file, e.g. `/tmp/gitea-helpers.sh`, then start every command block with `source /tmp/gitea-helpers.sh && gitea_auto`. Alternatively, prepend the definitions to every block.

**Simple single-instance case** (only `GITEA_URL` + `GITEA_TOKEN` exported): skip the helpers entirely and call curl directly:

```bash
curl -s -H "Authorization: token $GITEA_TOKEN" "$GITEA_URL/api/v1/user" | jq
```

Two usage patterns:

- **Inside a repo**, no env set: `gitea_auto` parses `origin` and finds the alias whose `GITEA_<ALIAS>_URL` host matches.
- **Outside a repo, or targeting a different instance**: `export GITEA_URL=https://git.aaa.com` first, then `gitea_auto` will match `git.aaa.com` against the configured aliases and pull the right token. No need to remember which alias corresponds to which host.

Hard override: `gitea_use ORGA` activates the `ORGA` pair regardless of URL.

### `gitea` helper

After resolving env, source the `gitea` wrapper from
[setup.md](references/setup.md#gitea-helper-function). Every `api-*.md`
example assumes it is in scope:

```bash
gitea GET    /version                                          # health
gitea GET    /user                                             # token identity
gitea GET   '/repos/foo/bar/issues?state=closed&limit=50'      # list with query
gitea POST   /repos/foo/bar/issues   -d '{"title":"x"}'        # write
gitea DELETE /repos/foo/bar/releases/42                        # destructive
```

The helper auto-injects `$GITEA_URL/api/v1`, the auth header, and
`Content-Type: application/json`; surfaces curl transport failures and HTTP
4xx/5xx (with the `{message, url}` envelope) on stderr and returns 1;
pretty-prints success bodies via `jq`.

### Single issue create + comment (canonical write flow)

```bash
ISSUE=$(gitea POST /repos/{owner}/{repo}/issues \
          -d '{"title":"fix auth bug","body":"Steps to reproduce..."}') || exit 1
NUM=$(echo "$ISSUE" | jq -r '.number')

gitea POST "/repos/{owner}/{repo}/issues/$NUM/comments" \
  -d '{"body":"PR will land tomorrow"}'
```

## Reference Packs

Load only the pack that covers the task at hand. Each pack lists every
endpoint with method, path, key params, and a curl example.

- `references/setup.md`
  Env vars, auth, /api/v1/version probe, PAT scopes, pagination, error envelope, common gotchas.
- `references/api-repo.md` — **~23 operations**
  Repos & forks, branches, tags, commits, repo tree, file contents (read / create / update / delete), releases.
- `references/api-issues-prs.md` — **issue + PR endpoints**
  `list/get/create/update issues`, comments, labels-on-issue; PR `list/get/diff/files/status/reviews/create/update/close/merge/update-branch/add-reviewers`; review submit/dismiss.
- `references/api-project.md` — **labels, milestones, time tracking, wiki**
  Repo & org labels (CRUD), milestones (CRUD), stopwatches + tracked time entries, wiki pages + revisions.
- `references/api-discovery.md` — **users, orgs, search, notifications, version**
  `/user`, `/user/orgs`, `/users/search`, `/orgs/{org}/teams/search`, `/repos/search`, `/repos/issues/search`, notifications list/get/mark-read, `/version`.
- `references/api-cicd.md` — **actions & packages**
  Workflows + runs + jobs + logs, dispatch/cancel/rerun runs, repo/org Actions secrets + variables CRUD, packages list/versions/get/delete.

## Quick Routing

- Connection refused, 401, 403, missing token, PAT scopes: `references/setup.md`.
- Clone / fork / create repo, read or commit a file, branch / tag, release: `references/api-repo.md`.
- File issues, comment, manage PRs, request/submit reviews, merge: `references/api-issues-prs.md`.
- Labels, milestones, time tracking, wiki pages: `references/api-project.md`.
- "Who am I", search repos/users/issues, org list, notifications: `references/api-discovery.md`.
- CI runs/workflows, secrets/variables, packages: `references/api-cicd.md`.

Reminder (rule 0): `github.com` -> use `gh`; failed `/api/v1/version` probe -> ask the user, do not guess another forge.
