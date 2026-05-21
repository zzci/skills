# gitea-mcp — server setup, transport, and config

gitea-mcp (v1.3.0) is a Go MCP server that talks to **one** Gitea instance. The
target host and token are fixed when the server process starts — tool calls
never carry a host or token. To change instance/identity, reconfigure and
restart the server, then reconnect the MCP client.

## Binary & invocation

```
gitea-mcp [flags]
```

| Flag | Alias | Default | Meaning |
|---|---|---|---|
| `-transport` | `-t` | `stdio` | Transport: `stdio` or `http` |
| `-port` | `-p` | `8080` | HTTP server port (when `-transport http`) |
| `-host` | `-H` | `https://gitea.com` | Gitea instance URL |
| `-token` | | (env) | Access token |
| `-insecure` | `-k` | `false` | Ignore TLS certificate errors |

If `-host` is empty it falls back to `https://gitea.com` — always set it
explicitly to the real instance.

## Environment variables

| Var | Effect |
|---|---|
| `GITEA_HOST` | Gitea instance URL (overrides default; `-host` flag also sets it) |
| `GITEA_ACCESS_TOKEN` | Access token |
| `GITEA_ACCESS_TOKEN_FILE` | Path to a file holding the token (e.g. a Docker secret) |
| `GITEA_INSECURE` | `true` → ignore TLS errors |
| `GITEA_READONLY` | `true` → only read-only tools are registered |
| `GITEA_TOOLS` | Comma-separated allow-list of tool names to expose |
| `GITEA_DEBUG` | `true` → debug logging |
| `MCP_MODE` | Override transport mode |

Token must be a valid Gitea access token with scopes covering the intended
operations (e.g. `write:repository`, `write:issue`, `write:organization`,
`read:user`). A scope/permission error surfaces as a tool error from Gitea —
report it; the fix is a wider-scoped token, not a retry.

## Transport modes

- **stdio** (default, recommended): the MCP client launches the binary; simplest and most stable. Used by most desktop/CLI MCP clients.
- **http**: server listens on `-port` (default 8080); suitable for shared/remote deployment. Newer builds read the token per request from the auth header in http mode, allowing multi-user fronting.

## Client wiring (stdio example)

```json
{
  "mcpServers": {
    "gitea": {
      "command": "gitea-mcp",
      "args": ["-transport", "stdio", "-host", "https://git.internal.example"],
      "env": { "GITEA_ACCESS_TOKEN": "<token>" }
    }
  }
}
```

For http transport, run the binary separately
(`gitea-mcp -transport http -port 8080 -host https://git.internal.example`) and
point the client at the HTTP endpoint.

## Tool annotations (safety contract)

Each tool carries one annotation; honor it:

- **read-only** — no state change. Safe to call freely.
- **write** — creates/updates state. Reversible in principle; still confirm intent for bulk changes.
- **DESTRUCTIVE** — irreversible removal (delete branch/file/release/tag, label/milestone/package/wiki/actions-config writes that delete). State exactly what will be removed and get user confirmation before calling, unless explicitly authorized.

## Read-only mode & allow-list

- `GITEA_READONLY=true`: the server registers only read-only tools. Write/destructive tool names will be **absent** — a call returns "unknown tool". Report this; do not retry.
- `GITEA_TOOLS=create_repo,list_my_repos,...`: only the named tools are exposed. Same handling for missing tools.

## Sanity check

Call `get_gitea_mcp_server_version` (always read-only) to confirm the server is
reachable and which build is running, then `get_me` to confirm token identity
and that writes will be attributed correctly.
