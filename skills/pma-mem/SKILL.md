---
name: pma-mem
description: Knowledge management skill for capturing, classifying, searching, and syncing project knowledge. Use when storing learnings, syncing BKD issue outcomes, or retrieving past decisions and patterns. Memos is the storage backend.
---

# Knowledge Palace

Capture and retrieve project knowledge. Storage backend: Memos (`$MEMOS_URL`, `$MEMOS_TOKEN`).

## Always-On Rules

1. Confirm `$MEMOS_URL` and `$MEMOS_TOKEN` before any operation. If missing, ask the user.
2. Every knowledge entry must have a **type tag**.
3. Before writing, **always check for duplicates** by topicHash.
4. One memo = one knowledge point. Never bundle multiple topics into a single memo.
5. Related knowledge points must be linked via memo relations (`REFERENCE`).
6. **Before implementing**: query relevant knowledge first. Check for existing decisions, discoveries, and patterns that may apply to the current task.

## When to Query

Agents should query the knowledge base in these situations:

- **Starting work on a project**: `query tag:#projectname` — load context
- **Hitting an error or unexpected behavior**: `query tag:#discovery` + keyword — someone may have seen this before
- **Making a technical choice**: `query tag:#decision` + topic — check if a decision was already made and why
- **Implementing a pattern**: `query tag:#pattern` + topic — reuse proven approaches
- **Before proposing architecture**: `query tag:#fact` + relevant tech — verify assumptions

## Knowledge Taxonomy

### Types

| Tag | When to use |
|-----|-------------|
| `#fact` | Confirmed technical truth |
| `#event` | Something that happened |
| `#discovery` | Unexpected finding, gotcha |
| `#decision` | Why A over B, with rationale |
| `#pattern` | Reusable approach or template |

### Other Tags

- **Project**: `#access`, `#bkd`, `#gino`, etc.
- **Topic**: `#auth`, `#i18n`, `#deploy`, `#database`, etc.
- **Source**: `#bkd-sync`, `#session`, `#manual` (optional, for filtering origin)

## Memo Format

```markdown
## {title}

{content — preserve key context, not just a summary}

---
source: {topicHash}

#fact #access #auth
```

`source:` line is the **dedup key**. `topicHash` = first 8 chars of md5(title).

## Operations

### Write

```bash
AUTH="Authorization: Bearer $MEMOS_TOKEN"
API="$MEMOS_URL/api/v1"

# 1. Check duplicate by topicHash
HASH=$(echo -n "Title here" | md5sum | cut -c1-8)
EXISTS=$(curl -s -H "$AUTH" \
  "$API/memos?filter=content.contains(\"source:+$HASH\")" \
  | jq '.memos | length')

# 2. Create (if not exists)
curl -s -X POST -H "$AUTH" -H 'Content-Type: application/json' \
  "$API/memos" \
  -d '{"content":"## Title\n\nContent\n\n---\nsource: '"$HASH"'\n\n#fact #access #auth","visibility":"PRIVATE"}' | jq

# 3. Update (if exists and changed)
curl -s -X PATCH -H "$AUTH" -H 'Content-Type: application/json' \
  "$API/memos/{uid}?updateMask=content" \
  -d '{"content":"...updated..."}' | jq

# 4. Link related memos
curl -s -X PATCH -H "$AUTH" -H 'Content-Type: application/json' \
  "$API/memos/{uid}/relations" \
  -d '{"relations":[{"relatedMemo":"memos/{otherUid}","type":"REFERENCE"}]}' | jq
```

### Query

Use queries to retrieve knowledge before acting. Return content to the agent context.

```bash
# Load project context before starting work
curl -s -H "$AUTH" "$API/memos?filter=tag+in+[\"access\"]&pageSize=20" \
  | jq '.memos[]|{uid,snippet,tags}'

# Check prior decisions on a topic
curl -s -H "$AUTH" "$API/memos?filter=tag+in+[\"decision\"]&pageSize=20" \
  | jq '.memos[]|{snippet,content}' | grep -i "database\|orm\|drizzle"

# Find gotchas before touching a component
curl -s -H "$AUTH" \
  "$API/memos?filter=tag+in+[\"discovery\"]" \
  | jq '.memos[]|.content' | grep -i "traefik\|cors"

# Reuse a known pattern
curl -s -H "$AUTH" \
  "$API/memos?filter=tag+in+[\"pattern\"]" \
  | jq '.memos[]|{snippet,content}' | grep -i "merge\|worktree"

# Full-text search
curl -s -H "$AUTH" \
  "$API/memos?filter=content.contains(\"keyword\")" \
  | jq '.memos[]|{uid,snippet}'

# Get full content of a specific memo
curl -s -H "$AUTH" "$API/memos/{uid}" | jq '.content'

# Get related knowledge (follow links)
curl -s -H "$AUTH" "$API/memos/{uid}/relations" \
  | jq '.relations[].relatedMemo'
```

## Reference Packs

- `references/storage-api.md`
  Memos REST API reference (CRUD, filters, relations, pagination, attachments).
- `references/knowledge-sync.md`
  BKD → Knowledge sync workflow: scanning, extraction, dedup, incremental update.

## Quick Routing

- Store or retrieve knowledge: use operations above directly.
- Need API details (updateMask, filters, error codes): load `references/storage-api.md`.
- Sync from BKD issues: load `references/knowledge-sync.md`.
