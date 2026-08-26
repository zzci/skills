#!/usr/bin/env bash

# Source this file. It intentionally does not change the caller's shell options.

gitea_list_aliases() {
  local name
  while IFS= read -r name; do
    case "$name" in
      GITEA_URL|GITEA_*_TOKEN|GITEA_*_TOKEN_FILE) continue ;;
      GITEA_[A-Z0-9]*_URL) printf '%s\n' "${name#GITEA_}" | sed 's/_URL$//' ;;
    esac
  done < <(compgen -A variable GITEA_)
}

gitea_use() {
  local alias=${1:-} url_var token_var token_file_var
  [ -n "$alias" ] || { printf 'gitea_use: alias is required\n' >&2; return 64; }
  url_var="GITEA_${alias}_URL"
  token_var="GITEA_${alias}_TOKEN"
  token_file_var="GITEA_${alias}_TOKEN_FILE"
  [ -n "${!url_var:-}" ] || { printf 'gitea_use: no %s in env\n' "$url_var" >&2; return 1; }
  if [ -n "${!token_var:-}" ]; then
    GITEA_TOKEN=${!token_var}
  elif [ -n "${!token_file_var:-}" ] && [ -r "${!token_file_var}" ]; then
    GITEA_TOKEN=$(<"${!token_file_var}")
  else
    printf 'gitea_use: no %s or %s in env\n' "$token_var" "$token_file_var" >&2
    return 1
  fi
  GITEA_URL=${!url_var%/}
  export GITEA_URL GITEA_TOKEN
}

_gitea_authority() {
  local value=$1 authority
  case "$value" in
    http://*|https://*)
      authority=${value#*://}; authority=${authority%%/*}; printf '%s\n' "$authority"
      ;;
    ssh://*)
      authority=${value#ssh://}; authority=${authority#*@}; authority=${authority%%/*}; authority=${authority%%:*}; printf '%s\n' "$authority"
      ;;
    git@*:*)
      authority=${value#git@}; printf '%s\n' "${authority%%:*}"
      ;;
    *) return 1 ;;
  esac
}

gitea_auto() {
  local source_url target_authority target_host alias alias_url alias_authority
  local -a exact_matches=() host_matches=()

  if [ -n "${GITEA_URL:-}" ]; then
    source_url=$GITEA_URL
  else
    source_url=$(git remote get-url origin 2>/dev/null) || source_url=''
  fi

  target_authority=$(_gitea_authority "$source_url" 2>/dev/null) || target_authority=''
  target_host=${target_authority%%:*}

  while IFS= read -r alias; do
    [ -n "$alias" ] || continue
    alias_url_var="GITEA_${alias}_URL"
    alias_url=${!alias_url_var:-}
    alias_authority=$(_gitea_authority "$alias_url" 2>/dev/null) || continue
    [ "$alias_authority" = "$target_authority" ] && exact_matches+=("$alias")
    [ "${alias_authority%%:*}" = "$target_host" ] && host_matches+=("$alias")
  done < <(gitea_list_aliases)

  if [ ${#exact_matches[@]} -eq 1 ]; then
    gitea_use "${exact_matches[0]}"
    return
  fi
  if [ ${#exact_matches[@]} -gt 1 ]; then
    printf 'gitea_auto: multiple aliases match %s; use gitea_use <ALIAS>\n' "$target_authority" >&2
    return 1
  fi

  # SSH/scp remotes do not reveal the HTTPS port. A unique host is safe; two
  # aliases on that host are ambiguous and require an explicit selection.
  case "$source_url" in
    ssh://*|git@*:*)
      if [ ${#host_matches[@]} -eq 1 ]; then
        gitea_use "${host_matches[0]}"
        return
      fi
      if [ ${#host_matches[@]} -gt 1 ]; then
        printf 'gitea_auto: SSH host %s maps to multiple web URLs; use gitea_use <ALIAS>\n' "$target_host" >&2
        return 1
      fi
      ;;
  esac

  if [ -n "${GITEA_URL:-}" ] && [ -n "${GITEA_TOKEN:-}" ]; then
    GITEA_URL=${GITEA_URL%/}
    export GITEA_URL GITEA_TOKEN
    return 0
  fi
  if [ -n "${GITEA_HOST:-}" ] && [ -n "${GITEA_ACCESS_TOKEN:-}" ]; then
    GITEA_URL=${GITEA_HOST%/}
    GITEA_TOKEN=$GITEA_ACCESS_TOKEN
    export GITEA_URL GITEA_TOKEN
    return 0
  fi
  printf 'gitea_auto: no unambiguous credential pair found\n' >&2
  return 1
}

gitea() {
  local method=${1:-} path=${2:-} tmp http rc
  [ -n "$method" ] && [ -n "$path" ] || { printf 'gitea: METHOD and PATH are required\n' >&2; return 64; }
  [ -n "${GITEA_URL:-}" ] && [ -n "${GITEA_TOKEN:-}" ] || { printf 'gitea: resolve GITEA_URL and GITEA_TOKEN first\n' >&2; return 1; }
  shift 2
  tmp=$(mktemp)
  if http=$(curl -sS -o "$tmp" -w '%{http_code}' \
    -H "Authorization: token $GITEA_TOKEN" \
    -H 'Content-Type: application/json' \
    -X "$method" "$@" "${GITEA_URL%/}/api/v1${path}"); then
    rc=0
  else
    rc=$?
  fi
  if [ "$rc" -ne 0 ] || ! [[ "$http" =~ ^[0-9]{3}$ ]] || [ "$http" -lt 200 ] || [ "$http" -ge 400 ]; then
    printf 'HTTP %s (curl exit %s) for %s %s\n' "${http:-000}" "$rc" "$method" "$path" >&2
    jq . "$tmp" >&2 2>/dev/null || cat "$tmp" >&2
    rm -f "$tmp"
    return 1
  fi
  if [ -s "$tmp" ]; then
    jq . "$tmp" 2>/dev/null || cat "$tmp"
  fi
  rm -f "$tmp"
}

gitea_json() {
  local method=${1:-} path=${2:-} body_file=${3:-}
  [ -n "$method" ] && [ -n "$path" ] && [ -n "$body_file" ] || {
    printf 'Usage: gitea_json METHOD PATH JSON_FILE\n' >&2
    return 64
  }
  [ -r "$body_file" ] || { printf 'gitea_json: body file is not readable: %s\n' "$body_file" >&2; return 1; }
  jq -e . "$body_file" >/dev/null || { printf 'gitea_json: invalid JSON body: %s\n' "$body_file" >&2; return 1; }
  gitea "$method" "$path" --data-binary "@$body_file"
}
