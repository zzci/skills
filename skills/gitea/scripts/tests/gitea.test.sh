#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SCRIPT="$SCRIPT_DIR/../gitea.sh"
TMP_ROOT=$(mktemp -d)
trap 'rm -rf "$TMP_ROOT"' EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

# shellcheck source=/dev/null
source "$SCRIPT"

test_alias_selection() {
  export GITEA_ALPHA_URL='https://git.alpha.test'
  export GITEA_ALPHA_TOKEN='alpha-token'
  export GITEA_BETA_URL='https://git.beta.test:3000'
  export GITEA_BETA_TOKEN='beta-token'

  local aliases
  aliases=$(gitea_list_aliases)
  [ "$aliases" = $'ALPHA\nBETA' ] || fail "unexpected aliases: $aliases"

  gitea_use BETA
  [ "$GITEA_URL" = 'https://git.beta.test:3000' ] || fail 'gitea_use selected the wrong URL'
  [ "$GITEA_TOKEN" = 'beta-token' ] || fail 'gitea_use selected the wrong token'
}

test_explicit_url_auto_selection() {
  unset GITEA_TOKEN
  export GITEA_URL='https://git.alpha.test'
  gitea_auto
  [ "$GITEA_TOKEN" = 'alpha-token' ] || fail 'gitea_auto did not resolve the matching token'
}

test_ambiguous_ssh_host_fails() {
  unset GITEA_URL GITEA_TOKEN
  export GITEA_ONE_URL='https://git.same.test:3000' GITEA_ONE_TOKEN='one'
  export GITEA_TWO_URL='https://git.same.test:4000' GITEA_TWO_TOKEN='two'
  export TEST_REMOTE_URL='git@git.same.test:owner/repo.git'

  git() {
    [ "$*" = 'remote get-url origin' ] || return 1
    printf '%s\n' "$TEST_REMOTE_URL"
  }
  export -f git

  if gitea_auto >/dev/null 2>&1; then
    fail 'ambiguous SSH host resolved arbitrarily'
  fi
  unset -f git
}

test_transport_failure_is_reported() {
  export GITEA_URL='https://git.alpha.test' GITEA_TOKEN='alpha-token'
  curl() { return 7; }
  export -f curl
  if gitea GET /version >/dev/null 2>&1; then
    fail 'curl transport failure was reported as success'
  fi
  unset -f curl
}

test_json_file_validation() {
  local body="$TMP_ROOT/body.json"
  printf '%s\n' '{"title":"line 1\nline 2","body":"quotes: \"safe\""}' > "$body"
  gitea() {
    printf '%s\n' "$*"
  }
  export -f gitea

  local args
  args=$(gitea_json POST /repos/acme/app/issues "$body")
  [ "$args" = "POST /repos/acme/app/issues --data-binary @$body" ] || fail "unexpected gitea_json args: $args"

  printf '%s\n' '{bad json' > "$body"
  if gitea_json POST /repos/acme/app/issues "$body" >/dev/null 2>&1; then
    fail 'invalid JSON body was accepted'
  fi
  unset -f gitea
}

test_alias_selection
test_explicit_url_auto_selection
test_ambiguous_ssh_host_fails
test_transport_failure_is_reported
test_json_file_validation
printf 'gitea helper tests passed\n'
