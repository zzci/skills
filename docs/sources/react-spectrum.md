# React Spectrum Skills Source

The following directories are verbatim mirrors of skills published by Adobe:

- `skills/react-spectrum-s2/`
- `skills/spectrum-audit/`

## Upstream

- Website: <https://react-spectrum.adobe.com/>
- Skill manifest: <https://react-spectrum.adobe.com/.well-known/skills/index.json>
- File base URL: `https://react-spectrum.adobe.com/.well-known/skills/<skill-name>/<relative-path>`

The manifest is the source of truth for each skill's file set. Preserve upstream
content and frontmatter, including fields that local validators may not yet
recognize.

## Update

Run from the repository root with Bash, `curl`, and `jq` available:

```bash
set -euo pipefail

base_url='https://react-spectrum.adobe.com/.well-known/skills'
manifest_json=$(curl -fsSL --max-time 20 "$base_url/index.json")

for skill_name in react-spectrum-s2 spectrum-audit; do
  while IFS= read -r relative_path; do
    destination="skills/$skill_name/$relative_path"
    mkdir -p "$(dirname "$destination")"
    curl -fsSL --retry 3 --max-time 30 \
      "$base_url/$skill_name/$relative_path" \
      -o "$destination"
  done < <(
    printf '%s' "$manifest_json" \
      | jq -r --arg name "$skill_name" \
        '.skills[] | select(.name == $name) | .files[]'
  )
done
```

Check for local files that are no longer present in the upstream manifest before
removing them:

```bash
base_url='https://react-spectrum.adobe.com/.well-known/skills'
manifest_json=$(curl -fsSL --max-time 20 "$base_url/index.json")

for skill_name in react-spectrum-s2 spectrum-audit; do
  comm -23 \
    <(find "skills/$skill_name" -type f -printf '%P\n' | sort) \
    <(
      printf '%s' "$manifest_json" \
        | jq -r --arg name "$skill_name" \
          '.skills[] | select(.name == $name) | .files[]' \
        | sort
    )
done
```

Review the upstream diff before removing any listed files.

## Verify

Confirm the local file set matches the manifest, all files are non-empty, and
the repository exposes both skills:

```bash
base_url='https://react-spectrum.adobe.com/.well-known/skills'
manifest_json=$(curl -fsSL --max-time 20 "$base_url/index.json")

for skill_name in react-spectrum-s2 spectrum-audit; do
  diff -u \
    <(
      printf '%s' "$manifest_json" \
        | jq -r --arg name "$skill_name" \
          '.skills[] | select(.name == $name) | .files[]' \
        | sort
    ) \
    <(find "skills/$skill_name" -type f -printf '%P\n' | sort)

  test -z "$(find "skills/$skill_name" -type f -empty -print -quit)"
done

npx --yes skills add . --list
git diff --check -- README.md docs/sources/react-spectrum.md
```

Adobe currently includes a `compatibility` field in both `SKILL.md` files. The
local Codex `quick_validate.py` may reject that field even though the `skills`
CLI accepts and discovers both skills. Do not remove it solely to satisfy that
validator. Some upstream reference files also contain trailing whitespace, so a
repository-wide `git diff --check` may report those verbatim lines.
