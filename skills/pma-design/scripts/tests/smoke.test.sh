#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SCRIPTS_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
TMP_ROOT=$(mktemp -d)
trap 'rm -rf "$TMP_ROOT"' EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

for script in \
  build-preview.mjs \
  check-design-system.mjs \
  compile-design-system.mjs \
  import-design-system.mjs \
  import-figma.mjs \
  record-asset.mjs
do
  [ -f "$SCRIPTS_DIR/$script" ] || fail "missing scripts/$script"
  node --check "$SCRIPTS_DIR/$script" >/dev/null
  set +e
  output=$(node "$SCRIPTS_DIR/$script" 2>&1)
  rc=$?
  set -e
  [ "$rc" -ne 0 ] || fail "$script accepted missing arguments"
  grep -Fqi 'usage' <<<"$output" || fail "$script did not print usage for missing arguments"
done

[ ! -e "$SCRIPTS_DIR/../agents/build-preview.mjs" ] || fail 'executable scripts still live under agents/'

DS_DIR="$TMP_ROOT/design-system"
PROJECT_DIR="$TMP_ROOT/project"
mkdir -p "$DS_DIR/tokens" "$DS_DIR/components" "$PROJECT_DIR"
printf '%s\n' '@import "./tokens/colors.css";' > "$DS_DIR/styles.css"
printf '%s\n' ':root { --color-primary: #2255aa; --space-2: 8px; }' > "$DS_DIR/tokens/colors.css"
printf '%s\n' \
  'export function Button({ children }) {' \
  '  return <button style={{ background: "var(--color-primary)" }}>{children}</button>;' \
  '}' \
  > "$DS_DIR/components/Button.jsx"
printf '%s\n' \
  'export interface ButtonProps { children?: React.ReactNode }' \
  'export declare function Button(props: ButtonProps): React.ReactElement;' \
  > "$DS_DIR/components/Button.d.ts"
printf '%s\n' \
  '<!-- @dsCard group="Components" viewport="700x180" name="Button" -->' \
  '<link rel="stylesheet" href="../styles.css">' \
  '<button style="background:var(--color-primary);color:white;padding:var(--space-2)">Fixture</button>' \
  > "$DS_DIR/components/button.card.html"
printf '%s\n' '# Fixture Design System' > "$DS_DIR/readme.md"

node "$SCRIPTS_DIR/compile-design-system.mjs" "$DS_DIR" >/dev/null
node "$SCRIPTS_DIR/check-design-system.mjs" "$DS_DIR" | grep -Fq 'No issues'
node "$SCRIPTS_DIR/build-preview.mjs" "$DS_DIR" --offline >/dev/null
[ -s "$DS_DIR/_ds_manifest.json" ] || fail 'compiler did not write a manifest'
[ -s "$DS_DIR/preview.html" ] || fail 'preview builder did not write preview.html'
jq -e '.cards | length == 1' "$DS_DIR/_ds_manifest.json" >/dev/null || fail 'fixture card was not indexed'

node "$SCRIPTS_DIR/import-design-system.mjs" "$DS_DIR" "$PROJECT_DIR" --primary >/dev/null
printf '%s\n' '<!doctype html><title>Fixture</title>' > "$PROJECT_DIR/index.html"
node "$SCRIPTS_DIR/record-asset.mjs" "$PROJECT_DIR" index.html --status needs-review >/dev/null
jq -e '.designSystems | length == 1' "$PROJECT_DIR/_d_meta.json" >/dev/null || fail 'design-system binding was not recorded'
jq -e '.assets | length == 1' "$PROJECT_DIR/_d_meta.json" >/dev/null || fail 'deliverable asset was not recorded'

printf 'pma-design script smoke tests passed\n'
