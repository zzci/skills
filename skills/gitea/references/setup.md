# Gitea REST API — setup, auth, probing, pagination, errors

This skill calls the Gitea REST API directly with `curl`. There is **no MCP
server dependency**. Each operation is documented in the `api-*.md` reference
packs as `METHOD /api/v1/...` with a curl example.

## Table of Contents

- [Environment](#environment)
- [Instance selection (multi-Gitea)](#instance-selection-multi-gitea)
- [`gitea` helper function](#gitea-helper-function)
- [Authentication](#authentication)
- [Probing the instance](#probing-the-instance)
- [Personal access token (PAT) scopes](#personal-access-token-pat-scopes)
- [Response shapes](#response-shapes)
- [Pagination](#pagination)
- [Common gotchas](#common-gotchas)
- [TLS, proxies, and self-signed certs](#tls-proxies-and-self-signed-certs)

## Environment

Two values must end up in scope before any call: `$GITEA_URL` (base URL **without** the `/api` suffix, e.g. `https://git.example.com`) and `$GITEA_TOKEN` (PAT for that URL). The skill discovers them from the environment using **named pairs**, then constructs every endpoint as `$GITEA_URL/api/v1/...`.

```bash
# Single instance:
export GITEA_URL=https://git.example.com
export GITEA_TOKEN="$(pass show gitea/example)"

# Multiple instances (named pairs — see next section):
export GITEA_ORGA_URL=https://git.orga.com     GITEA_ORGA_TOKEN="..."
export GITEA_ORGB_URL=https://git.orgb.local   GITEA_ORGB_TOKEN="..."

# Activate (auto-pick by current repo's origin, else fall back to GITEA_URL/GITEA_TOKEN):
source <gitea-skill>/scripts/gitea.sh
gitea_auto || { echo "no Gitea credentials in env" >&2; exit 1; }

AUTH=(-H "Authorization: token $GITEA_TOKEN")
JSON=(-H 'Content-Type: application/json')
```

## Instance selection (multi-Gitea)

A single shell often needs credentials for several Gitea instances (one per org, one per environment, etc.). The skill models this as **named pairs**: each instance gets an alias `<X>`, exported as `GITEA_<X>_URL` + `GITEA_<X>_TOKEN`. At call time, the right pair is loaded into `$GITEA_URL` + `$GITEA_TOKEN`.

### Convention

The env-var template is **`GITEA_<ALIAS>_URL`** + **`GITEA_<ALIAS>_TOKEN`**. `<ALIAS>` is user-chosen (uppercase letters, digits, underscores; non-empty). The URL and TOKEN of one instance must share the exact same `<ALIAS>`. `GITEA_URL` + `GITEA_TOKEN` (no alias segment) is the single-instance fallback used when no named pair matches.

```bash
export GITEA_ORGA_URL=https://git.orga.com
export GITEA_ORGA_TOKEN="$(pass show gitea/orga)"
export GITEA_ORGB_URL=https://git.orgb.local:3000
export GITEA_ORGB_TOKEN_FILE=/run/secrets/gitea-orgb-token

export GITEA_URL=https://gitea.com
export GITEA_TOKEN="$(pass show gitea/public)"
```

- Discovery regex: `^GITEA_[A-Z0-9][A-Z0-9_]*_URL=` — the captured middle group is the alias.
- `_TOKEN_FILE` is accepted for any alias when `_TOKEN` is not exported directly.
- HTTP(S) targets match the full authority, including port. SSH remotes do not reveal the HTTPS port; if multiple aliases share the same host on different ports, `gitea_auto` fails and requires `gitea_use <ALIAS>`.

### Selection helpers

The canonical, tested definitions live in `../scripts/gitea.sh`. Source the file in every fresh shell rather than copying shell functions out of documentation:

```bash
source <gitea-skill>/scripts/gitea.sh
gitea_auto
```

### Selection order (resolved by `gitea_auto`)

`gitea_auto` first determines a **source URL**, then matches named pairs by full HTTP(S) authority or by a unique SSH host:

| Step | What happens | Example |
|---|---|---|
| 0 | Source URL = explicit `$GITEA_URL` if set, else `git remote get-url origin`. | `GITEA_URL=https://git.aaa.com` -> source = `git.aaa.com`. |
| 1 | Match an HTTP(S) target by full authority, or an SSH target by host when exactly one alias matches. Ambiguity fails safely. | `GITEA_ORGA_URL=https://git.aaa.com` -> alias `ORGA` matches -> `GITEA_TOKEN` set from `GITEA_ORGA_TOKEN`. |
| 2 | No host match? Use **unaliased default**: `GITEA_URL` + `GITEA_TOKEN` (both must be set explicitly by the user). | Single-instance shell with `GITEA_URL=...` + `GITEA_TOKEN=...`. |
| 3 | Still nothing? Use **gitea-mcp legacy** pair: `GITEA_HOST` + `GITEA_ACCESS_TOKEN`. | Migrating from an older gitea-mcp config without renaming env vars. |
| 4 | Nothing found -> ask the user; recommend they add a named pair so future sessions auto-resolve. | — |

Two ways to use it:

1. **No explicit URL — auto from repo origin.** Common case inside a checked-out repo. `gitea_auto` parses the remote URL and finds the matching alias.
2. **Explicit URL, lookup token.** User sets `GITEA_URL=https://git.aaa.com` and calls `gitea_auto`; the matching `GITEA_<ALIAS>_URL` is found by host comparison and its `_TOKEN` is loaded. No need to remember which alias maps to which host.

Manual override at any time: `gitea_use ORGA` (sets the active pair without auto-detect).

### Verifying resolution

After `gitea_auto`, confirm before any write — never echo the full token:

```bash
echo "host:  $(printf '%s' "$GITEA_URL" | sed -E 's#^https?://##; s#/.*##')"
echo "token: configured ($(printf '%s' "$GITEA_TOKEN" | wc -c) chars)"
gitea GET /user | jq '{login, full_name}'
```

## `gitea` helper function

The `api-*.md` reference packs use the `gitea` wrapper from `../scripts/gitea.sh` instead of repeating the full curl invocation:

```bash
source <gitea-skill>/scripts/gitea.sh
gitea_auto
```

### Usage

```bash
gitea GET    /repos/foo/bar/issues
gitea GET   '/repos/foo/bar/issues?state=closed&page=2&limit=50'
gitea POST   /repos/foo/bar/issues   -d '{"title":"x","body":"y"}'
gitea PATCH  /repos/foo/bar/issues/3 -d '{"state":"closed"}'
gitea DELETE /repos/foo/bar/releases/42
```

### Properties

- Method and path are positional; everything after is passed through to curl unchanged (`-d`, `-F`, `--data-binary`, extra `-H`, `--cacert`, etc.).
- For user-provided or free-form JSON values, build a temporary body with `jq -n` and pass it through `gitea_json METHOD PATH FILE`. Inline `-d` is only for fixed trusted literals.
- The helper always sends `Content-Type: application/json`. For multipart uploads, use raw `curl` with `-F` so curl can generate the multipart boundary.
- Success bodies are pretty-printed via `jq`; empty 204 bodies are silently fine.
- Failure: curl transport errors (connection refused, DNS failure — `%{http_code}` is `000`) and any HTTP status outside 200–399 write `HTTP <code> (curl exit <rc>) for <method> <path>` + the `{message, url}` envelope to **stderr** and return 1. Combine with `||` for failure handling, or capture stdout for the success payload.
- Body capture for multi-step flows:
  ```bash
  ISSUE=$(gitea POST /repos/foo/bar/issues -d '{"title":"new"}') || exit 1
  NUM=$(echo "$ISSUE" | jq -r '.number')
  ```
- For **raw bodies** (downloading job logs, PR diffs, file content), skip the helper and use raw `curl`; raw text isn't valid JSON:
  ```bash
  curl -sS "${AUTH[@]}" "$GITEA_URL/api/v1/repos/foo/bar/pulls/3.diff" > pr.diff
  ```

When an example in the `api-*.md` packs uses `gitea ...`, it requires `scripts/gitea.sh` and the resolved env to be in scope. Examples that drop to raw `curl` are doing so deliberately (multipart upload, base64-heavy payloads, HTTP-status capture, raw text response).

## Authentication

Send the token as a header on every request:

```bash
curl -s -H "Authorization: token $GITEA_TOKEN" "$GITEA_URL/api/v1/user" | jq
```

Accepted equivalents:

| Form | Example | Notes |
|---|---|---|
| `token <PAT>` (preferred) | `-H "Authorization: token abc..."` | Recommended; works on all Gitea versions. |
| `Bearer <PAT>` | `-H "Authorization: Bearer abc..."` | Works on recent Gitea; identical effect. |
| HTTP Basic with PAT as password | `-u "<username>:<PAT>"` | Works but unusual; reserve for tools that only speak Basic. |
| `?token=<PAT>` query param | `?token=abc...` | **Avoid.** Tokens leak into access logs and shell history. |

Never echo `$GITEA_TOKEN` to stdout. Mask in any logging.

## Probing the instance

Confirm an unknown non-`github.com` host is actually Gitea before driving any
operation. For git remotes, discard SSH ports and construct the probe URL as
`https://<host>/api/v1/version`; a custom web port cannot be inferred from an
SSH remote and must be known separately.

```bash
curl -fsS --max-time 5 "$GITEA_URL/api/v1/version" | jq
# -> { "version": "1.23.x" } on success
```

If the call returns non-2xx, times out, or returns JSON without a `version` field, the host is **not** a Gitea instance — stop and ask the user. Do not silently fall back to another forge.

After a successful probe, confirm the token resolves to the expected user:

```bash
curl -s "${AUTH[@]}" "$GITEA_URL/api/v1/user" | jq '{login, full_name, email}'
```

If this returns `401 Unauthorized`, the token is wrong/expired. If it returns `403 Forbidden` on subsequent writes, the token lacks the required scope (see below).

## Personal access token (PAT) scopes

Gitea PAT scopes are coarse. The most commonly needed:

| Scope | Covers |
|---|---|
| `read:user` | `/user`, `/users/{u}` |
| `read:repository` | Repo read, file read, branches/tags list, releases list |
| `write:repository` | Create/fork repo, push files, branches, tags, releases |
| `read:issue` | Issues read |
| `write:issue` | Create/update issues, comments, labels-on-issue, milestones-on-issue |
| `read:organization` | Org info, teams, org repos |
| `write:organization` | Create org labels, milestones, secrets/variables, team membership |
| `read:notification` | Notification list/thread |
| `write:notification` | Mark notifications read |
| `read:package` / `write:package` | Package registry read / delete |
| `read:admin` / `write:admin` | Site-admin only operations |

A scope/permission error from Gitea surfaces as `403` with `{"message":"...","url":"..."}`. **Report it; the fix is a wider-scoped token, not a retry.**

## Response shapes

Gitea returns the resource directly — there is **no** `{success, data}` wrapper.

- **Success (2xx)**: the resource JSON (or empty body for 204 No Content).
- **Failure (4xx/5xx)**: `{ "message": "...", "url": "..." }` plus the HTTP status. Some 422 responses also include `errors: [...]`.

When verifying a write, capture the HTTP status:

```bash
HTTP=$(curl -s -o /tmp/body.json -w '%{http_code}' "${AUTH[@]}" "${JSON[@]}" -X POST \
  -d '{...}' "$GITEA_URL/api/v1/...")
if [ "$HTTP" -ge 400 ]; then
  jq < /tmp/body.json   # show the {message, url} envelope
  exit 1
fi
jq < /tmp/body.json
```

Or use `--fail-with-body` so curl exits non-zero on 4xx/5xx but still prints the body.

## Pagination

Standard list endpoints accept:

| Param | Default | Notes |
|---|---|---|
| `page` | `1` | 1-indexed |
| `limit` | `30` (usually) | Capped server-side (commonly 50). A few older endpoints accept `per_page` as alias. |

To enumerate fully:

```bash
PAGE=1
while :; do
  RESP=$(curl -s "${AUTH[@]}" "$GITEA_URL/api/v1/repos/{owner}/{repo}/issues?state=all&page=$PAGE&limit=50")
  COUNT=$(echo "$RESP" | jq 'length')
  [ "$COUNT" -eq 0 ] && break
  echo "$RESP" | jq -c '.[]'
  PAGE=$((PAGE + 1))
done
```

Alternative: check the `Link` response header for `rel="next"`:

```bash
curl -s -I "${AUTH[@]}" "$GITEA_URL/api/v1/repos/{owner}/{repo}/issues?page=1&limit=50" | grep -i '^link:'
```

If absent, you are on the last page.

## Common gotchas

- **`/api` vs root.** `$GITEA_URL` is the bare host (`https://git.example.com`). Endpoints are `/api/v1/...`. Concatenating `https://git.example.com/api/api/v1/...` produces 404.
- **File contents are base64.** `PUT /repos/.../contents/{path}` requires `content` base64-encoded. Read-back via `GET` also returns `content` base64-encoded; decode with `jq -r .content | base64 -d`.
- **Create vs update file.** `PUT /repos/.../contents/{path}` creates when `sha` is omitted, updates when the current file `sha` is passed. Wrong `sha` -> 409 Conflict.
- **Branch name in URL** must be URL-encoded when it contains `/` (e.g. `feature%2Fnewui`).
- **Soft delete.** `DELETE /repos/{owner}/{repo}` moves the repo to trash for some configurations. Confirm with the user; recovery is admin-only.
- **Empty arrays vs missing.** Gitea returns `[]` for empty list endpoints (not 404). 404 means the resource path itself is wrong.
- **Time formats.** Date filters (`since`, `before`, `due_on`, `deadline`) use ISO 8601 with timezone, e.g. `2025-01-15T10:30:00Z`.
- **Issue numbers vs IDs.** Use the per-repo `number` (visible in the URL) for `/issues/{idx}` paths. Internal `id` is global and only relevant for cross-repo APIs.
- **Pull request endpoints reuse issue paths for comments.** Comments on a PR are posted via `/issues/{idx}/comments`, not `/pulls/{idx}/comments` (which is for review comments).

## TLS, proxies, and self-signed certs

For self-signed or internal CA hosts, the recommended approach is to install the CA into the system trust store. As a curl-local override:

```bash
curl --cacert /path/to/internal-ca.pem "${AUTH[@]}" "$GITEA_URL/api/v1/version"
```

Only as a last resort, `curl -k` (insecure, skip verification) — record why in any committed config.

Behind a corporate proxy, set `HTTPS_PROXY` / `NO_PROXY` in the shell environment; curl honors both.
