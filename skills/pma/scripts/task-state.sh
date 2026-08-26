#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage:
  task-state.sh claim <task-file> <owner>
  task-state.sh unclaim <task-file> <owner> <reason>
  task-state.sh complete <task-file> <owner> [note]
  task-state.sh close <task-file> <owner> <reason>

Owner must be a stable per-session identifier such as worker-a/session-123.
EOF
  exit 64
}

die() {
  printf 'task-state: %s\n' "$*" >&2
  exit 1
}

[ "$#" -ge 3 ] || usage
action=$1
task_file=$2
owner=$3
note=${4:-}

case "$action" in
  claim|unclaim|complete|close) ;;
  *) usage ;;
esac
[[ "$owner" =~ ^[A-Za-z0-9][A-Za-z0-9._:@/-]*$ ]] || die 'owner must be a stable identifier without spaces'
[ -f "$task_file" ] || die "task file not found: $task_file"

task_file=$(cd "$(dirname "$task_file")" && pwd)/$(basename "$task_file")
task_dir=$(dirname "$task_file")
task_id=$(basename "$task_file" .md)
index_file="$task_dir/index.md"
[ -f "$index_file" ] || die "task index not found: $index_file"

command -v flock >/dev/null 2>&1 || die 'flock is required for claim serialization'
# Lock the task directory inode itself so no lock file is left in the repository.
exec 9<"$task_dir"
flock -x 9

current_status=$(sed -n 's/^- \*\*status\*\*: //p' "$task_file")
current_owner=$(sed -n 's/^- \*\*owner\*\*: //p' "$task_file")
[ "$(printf '%s\n' "$current_status" | sed '/^$/d' | wc -l)" -eq 1 ] || die 'task must contain exactly one status field'
[ "$(printf '%s\n' "$current_owner" | sed '/^$/d' | wc -l)" -eq 1 ] || die 'task must contain exactly one owner field'

index_line=$(awk -v id="$task_id" 'index($0, "](" id ".md)") { print }' "$index_file")
[ "$(printf '%s\n' "$index_line" | sed '/^$/d' | wc -l)" -eq 1 ] || die "index must contain exactly one entry for $task_id"

case "$action" in
  claim)
    [ "$current_status" = pending ] || die "claim requires pending status, found $current_status"
    [ "$current_owner" = '(unassigned)' ] || die "claim requires an unassigned owner, found $current_owner"
    from_marker='[ ]'; to_marker='[-]'; next_status='in_progress'; next_owner=$owner
    ;;
  unclaim)
    [ -n "$note" ] || die 'unclaim requires a reason'
    [ "$current_status" = in_progress ] || die "unclaim requires in_progress status, found $current_status"
    [ "$current_owner" = "$owner" ] || die "only $current_owner may unclaim this task"
    from_marker='[-]'; to_marker='[ ]'; next_status='pending'; next_owner='(unassigned)'
    ;;
  complete)
    [ "$current_status" = in_progress ] || die "complete requires in_progress status, found $current_status"
    [ "$current_owner" = "$owner" ] || die "only $current_owner may complete this task"
    from_marker='[-]'; to_marker='[x]'; next_status='completed'; next_owner=$owner
    ;;
  close)
    [ -n "$note" ] || die 'close requires a reason'
    case "$current_status" in
      pending)
        [ "$current_owner" = '(unassigned)' ] || die "pending task has unexpected owner: $current_owner"
        from_marker='[ ]'
        ;;
      in_progress)
        [ "$current_owner" = "$owner" ] || die "only $current_owner may close this task"
        from_marker='[-]'
        ;;
      *) die "close requires pending or in_progress status, found $current_status" ;;
    esac
    to_marker='[~]'; next_status='closed'; next_owner=$owner
    ;;
esac

case "$index_line" in
  "- $from_marker "*) ;;
  *) die "index marker does not match task status for $task_id" ;;
esac

detail_tmp=$(mktemp "$task_dir/.task-state.detail.XXXXXX")
index_tmp=$(mktemp "$task_dir/.task-state.index.XXXXXX")
detail_backup=$(mktemp "$task_dir/.task-state.detail-backup.XXXXXX")
cleanup() {
  rm -f "$detail_tmp" "$index_tmp" "$detail_backup"
}
trap cleanup EXIT

awk -v status="$next_status" -v owner="$next_owner" '
  /^- \*\*status\*\*: / { print "- **status**: " status; next }
  /^- \*\*owner\*\*: /  { print "- **owner**: " owner; next }
  { print }
' "$task_file" > "$detail_tmp"

if [ -n "$note" ]; then
  printf '\n- %s: %s\n' "$action" "$note" >> "$detail_tmp"
fi

awk -v id="$task_id" -v from="$from_marker" -v to="$to_marker" '
  index($0, "](" id ".md)") {
    prefix = "- " from " "
    if (index($0, prefix) != 1) exit 42
    $0 = "- " to " " substr($0, length(prefix) + 1)
  }
  { print }
' "$index_file" > "$index_tmp" || die "failed to stage index transition for $task_id"

cp -p "$task_file" "$detail_backup"
if ! mv "$detail_tmp" "$task_file"; then
  die 'failed to commit task detail'
fi
if ! mv "$index_tmp" "$index_file"; then
  mv "$detail_backup" "$task_file" || true
  die 'failed to commit task index; task detail was rolled back'
fi

rm -f "$detail_backup"
printf '%s %s as %s\n' "$action" "$task_id" "$owner"
