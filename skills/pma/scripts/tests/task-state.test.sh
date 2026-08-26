#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SCRIPT="$SCRIPT_DIR/../task-state.sh"
TMP_ROOT=$(mktemp -d)
trap 'rm -rf "$TMP_ROOT"' EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

assert_contains() {
  local file=$1 expected=$2
  grep -Fq -- "$expected" "$file" || fail "$file does not contain: $expected"
}

new_fixture() {
  local root=$1
  mkdir -p "$root/docs/task"
  printf '%s\n' \
    '# Tasks' \
    '' \
    '- [ ] [**API-001 Add endpoint**](API-001.md) `P1`' \
    > "$root/docs/task/index.md"
  printf '%s\n' \
    '# API-001 Add endpoint' \
    '' \
    '- **status**: pending' \
    '- **priority**: P1' \
    '- **owner**: (unassigned)' \
    '' \
    '## Notes' \
    '' \
    '(none)' \
    > "$root/docs/task/API-001.md"
}

test_claim_and_transitions() {
  local root="$TMP_ROOT/transitions"
  new_fixture "$root"

  "$SCRIPT" claim "$root/docs/task/API-001.md" 'worker-a/session-1'
  assert_contains "$root/docs/task/index.md" '- [-] [**API-001 Add endpoint**](API-001.md) `P1`'
  assert_contains "$root/docs/task/API-001.md" '- **status**: in_progress'
  assert_contains "$root/docs/task/API-001.md" '- **owner**: worker-a/session-1'

  if "$SCRIPT" claim "$root/docs/task/API-001.md" 'worker-b/session-2' >/dev/null 2>&1; then
    fail 'a second owner claimed an in-progress task'
  fi
  assert_contains "$root/docs/task/API-001.md" '- **owner**: worker-a/session-1'

  if "$SCRIPT" unclaim "$root/docs/task/API-001.md" 'worker-b/session-2' 'wrong owner' >/dev/null 2>&1; then
    fail 'a non-owner unclaimed the task'
  fi

  "$SCRIPT" unclaim "$root/docs/task/API-001.md" 'worker-a/session-1' 'Proposal was rejected.'
  assert_contains "$root/docs/task/index.md" '- [ ] [**API-001 Add endpoint**](API-001.md) `P1`'
  assert_contains "$root/docs/task/API-001.md" '- **status**: pending'
  assert_contains "$root/docs/task/API-001.md" '- **owner**: (unassigned)'
  assert_contains "$root/docs/task/API-001.md" 'Proposal was rejected.'

  "$SCRIPT" claim "$root/docs/task/API-001.md" 'worker-b/session-2'
  "$SCRIPT" complete "$root/docs/task/API-001.md" 'worker-b/session-2' 'Verified focused tests.'
  assert_contains "$root/docs/task/index.md" '- [x] [**API-001 Add endpoint**](API-001.md) `P1`'
  assert_contains "$root/docs/task/API-001.md" '- **status**: completed'
  assert_contains "$root/docs/task/API-001.md" 'Verified focused tests.'
  [ -z "$(find "$root/docs/task" -maxdepth 1 -name '.task-state.*' -print -quit)" ] || fail 'transaction left temporary files in docs/task'
}

test_concurrent_claim_is_serialized() {
  local root="$TMP_ROOT/concurrent" rc_a rc_b
  new_fixture "$root"

  set +e
  "$SCRIPT" claim "$root/docs/task/API-001.md" 'worker-a/session-1' >/dev/null 2>&1 &
  local pid_a=$!
  "$SCRIPT" claim "$root/docs/task/API-001.md" 'worker-b/session-2' >/dev/null 2>&1 &
  local pid_b=$!
  wait "$pid_a"; rc_a=$?
  wait "$pid_b"; rc_b=$?
  set -e

  [ $((rc_a + rc_b)) -ne 0 ] || fail 'both concurrent claims succeeded'
  [ "$rc_a" -eq 0 ] || [ "$rc_b" -eq 0 ] || fail 'both concurrent claims failed'
  [ "$(grep -Ec '^- \[-\] ' "$root/docs/task/index.md")" -eq 1 ] || fail 'index does not contain exactly one active claim'
  [ "$(grep -Ec '^- \*\*owner\*\*: worker-[ab]/session-[12]$' "$root/docs/task/API-001.md")" -eq 1 ] || fail 'detail does not contain exactly one owner'
  [ -z "$(find "$root/docs/task" -maxdepth 1 -name '.task-state.*' -print -quit)" ] || fail 'concurrent claim left temporary files in docs/task'
}

test_claim_and_transitions
test_concurrent_claim_is_serialized
printf 'task-state tests passed\n'
