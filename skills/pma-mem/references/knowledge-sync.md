# BKD → Knowledge Sync

Workflow for extracting knowledge from BKD issue logs and storing in Memos.

## Prerequisites

```bash
AUTH="Authorization: Bearer $MEMOS_TOKEN"
API="$MEMOS_URL/api/v1"
BKD="$BKD_URL"
```

## Scan Flow

```
1. List projects       GET $BKD/projects
2. List issues         GET $BKD/projects/{id}/issues
3. Filter targets      status=review|done AND no memo-scanned tag (or outdated)
4. Extract logs        GET $BKD/projects/{id}/issues/{issueId}/logs/filter/...
5. Analyze & split     Agent classifies into N knowledge points
6. Dedup & write       Check → create/update → link relations
7. Mark scanned        PATCH issue tag: memo-scanned:{updateTime}
```

## Step 1: Discover Target Issues

```bash
for PID in $(curl -s "$BKD/projects" | jq -r '.data[].id'); do
  PROJECT_NAME=$(curl -s "$BKD/projects/$PID" | jq -r '.data.name')
  
  curl -s "$BKD/projects/$PID/issues" | jq -r '
    [.data[] | select(
      (.statusId == "review" or .statusId == "done") and
      ((.tags // []) | map(select(startswith("memo-scanned:"))) | length == 0
       or
       ((.tags // []) | map(select(startswith("memo-scanned:"))) | .[0] | split(":")[1]) as $scanned |
       .updatedAt > $scanned)
    )] | .[] | "\(.id)\t\(.title)\t\(.updatedAt)"
  '
done
```

## Step 2: Extract Logs

Pull three log types — each carries different knowledge signals:

```bash
# Core: user messages (requirements, context, corrections) +
#        thinking (reasoning, trade-offs) +
#        assistant messages (conclusions, solutions)
curl -s "$BKD/projects/$PID/issues/$ISSUE_ID/logs/filter/types/user-message,thinking,assistant-message" | jq
```

| Log type | Knowledge signal |
|----------|-----------------|
| `user-message` | Requirements, constraints, corrections, preferences |
| `thinking` | Reasoning process, trade-offs, alternatives considered |
| `assistant-message` | Conclusions, solutions, explanations |

Pull **all turns**, not just the last few — knowledge points can appear at any stage
(early requirements, mid-stage decisions, late discoveries).

If logs are too large, paginate with `?limit=100&cursor=...` rather than truncating by turn.

Only add `tool-use` when specific operations matter (e.g. for `#pattern` extraction):

```bash
curl -s "$BKD/projects/$PID/issues/$ISSUE_ID/logs/filter/types/user-message,thinking,assistant-message,tool-use" | jq
```

## Step 3: Classify Knowledge Points

Agent analyzes logs and produces a list of knowledge points. Each point:

```yaml
- title: "Short descriptive title"
  type: fact | event | discovery | decision | pattern
  topic: auth | deploy | database | ...    # free-form domain
  content: |
    Preserved context and reasoning.
    Not just a summary — include the WHY.
  topicHash: first 8 chars of md5(title)
```

Classification guidelines:
- **fact**: verified technical truth, API behavior, config requirement
- **event**: something that happened with a timestamp
- **discovery**: unexpected finding, gotcha, pitfall
- **decision**: choice made with rationale (always include alternatives considered)
- **pattern**: reusable approach, template, workflow

Skip trivial operations (routine CRUD, obvious fixes). Only capture knowledge worth retrieving later.

## Step 4: Dedup & Write

For each knowledge point:

```bash
TOPIC_HASH=$(echo -n "$TITLE" | md5sum | cut -c1-8)

# Check existing by topicHash
EXISTING=$(curl -s -H "$AUTH" \
  "$API/memos?filter=content.contains(\"source:+$TOPIC_HASH\")" | jq)
COUNT=$(echo "$EXISTING" | jq '.memos | length')

CONTENT=$(cat <<MEMO
## $TITLE

$BODY

---
source: $TOPIC_HASH

#$TYPE #$PROJECT_NAME #$TOPIC
MEMO
)

if [ "$COUNT" -eq 0 ]; then
  # Create new memo
  NEW_UID=$(curl -s -X POST -H "$AUTH" -H 'Content-Type: application/json' \
    "$API/memos" \
    -d "{\"content\":$(echo "$CONTENT" | jq -Rs .),\"visibility\":\"PRIVATE\"}" \
    | jq -r '.uid')
  
elif [ "$COUNT" -eq 1 ]; then
  # Update if content changed
  EXISTING_UID=$(echo "$EXISTING" | jq -r '.memos[0].uid')
  curl -s -X PATCH -H "$AUTH" -H 'Content-Type: application/json' \
    "$API/memos/$EXISTING_UID?updateMask=content" \
    -d "{\"content\":$(echo "$CONTENT" | jq -Rs .)}" | jq
fi
```

## Step 5: Link Related Memos

All knowledge points from the same issue should be linked:

```bash
# Collect UIDs of memos created/updated for this issue
MEMO_UIDS=("uid1" "uid2" "uid3")

for UID in "${MEMO_UIDS[@]}"; do
  RELATIONS=$(printf '{"relatedMemo":"memos/%s","type":"REFERENCE"},' \
    $(printf '%s\n' "${MEMO_UIDS[@]}" | grep -v "$UID"))
  RELATIONS="[${RELATIONS%,}]"
  
  curl -s -X PATCH -H "$AUTH" -H 'Content-Type: application/json' \
    "$API/memos/$UID/relations" \
    -d "{\"relations\":$RELATIONS}" | jq
done
```

## Step 6: Mark Issue as Scanned

```bash
# Get current tags
CURRENT_TAGS=$(curl -s "$BKD/projects/$PID/issues/$ISSUE_ID" \
  | jq '[.data.tags // [] | .[] | select(startswith("memo-scanned:") | not)]')

# Add new scanned tag with timestamp
UPDATE_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
NEW_TAGS=$(echo "$CURRENT_TAGS" | jq --arg t "memo-scanned:$UPDATE_TIME" '. + [$t]')

curl -s -X PATCH "$BKD/projects/$PID/issues/$ISSUE_ID" \
  -H 'Content-Type: application/json' \
  -d "{\"tags\":$NEW_TAGS}" | jq
```

## Incremental Update Logic

```
issue.updatedAt vs memo-scanned:{time} tag:

  no tag           → first scan: extract all, create memos
  tag < updatedAt  → re-scan: extract all, dedup by topicHash
                     existing memos (same hash): update content if changed
                     new knowledge (new hash): create new memos
                     old memos not in scan: leave as-is (don't delete)
  tag >= updatedAt → skip, no changes since last scan
```

The topicHash (md5 of title, first 8 chars) is the sole dedup key.
BKD projectId/issueId are only used for scanning and traceability tags,
not for memo identity.

## Knowledge Consolidation

Over time, duplicate or overlapping memos accumulate. Run consolidation periodically (weekly or on-demand).

### Process

```
1. Load all memos by tag group (e.g. all #discovery, or all #auth)
2. Agent reviews for:
   a. Near-duplicates  — same insight from different issues
   b. Superseded facts — early memo contradicted by later one
   c. Fragments        — multiple small memos that form one coherent topic
3. For each group:
   - Merge into one memo: combine content, keep best context, preserve all source: hashes
   - Archive originals (state=ARCHIVED), don't delete — keeps audit trail
   - Link merged memo to archived originals via REFERENCE relation
```

### Merge Format

```markdown
## {consolidated title}

{merged content — best explanation, all relevant context}

---
source: {newTopicHash}
merged-from: {hash1}, {hash2}, {hash3}

#fact #auth
```

The `merged-from:` line preserves traceability to original memos.

### Operations

```bash
# 1. Find candidates — load a tag group
curl -s -H "$AUTH" "$API/memos?filter=tag+in+[\"auth\"]&pageSize=100" \
  | jq '.memos[]|{uid,snippet,content}'

# 2. Create merged memo
curl -s -X POST -H "$AUTH" -H 'Content-Type: application/json' \
  "$API/memos" \
  -d "{\"content\":$(echo "$MERGED_CONTENT" | jq -Rs .),\"visibility\":\"PRIVATE\"}" | jq

# 3. Archive originals
for UID in $OLD_UIDS; do
  curl -s -X PATCH -H "$AUTH" -H 'Content-Type: application/json' \
    "$API/memos/$UID?updateMask=state" \
    -d '{"state":"ARCHIVED"}' | jq
done

# 4. Link merged → originals
RELATIONS=$(printf '{"relatedMemo":"memos/%s","type":"REFERENCE"},' $OLD_UIDS)
curl -s -X PATCH -H "$AUTH" -H 'Content-Type: application/json' \
  "$API/memos/$MERGED_UID/relations" \
  -d "{\"relations\":[${RELATIONS%,}]}" | jq
```

### Consolidation Triggers

- **Tag group > 10 memos**: likely has overlaps
- **Same topic across 3+ projects**: good candidate for a unified pattern
- **Fact contradicts another fact**: one should supersede the other
- **User request**: `/consolidate #tag` — on-demand cleanup

## BKD Cron Setup

```bash
# Constant issue for the sync agent (keepAlive)
ISSUE_ID="..."

# Daily sync cron
curl -s -X POST "$BKD/cron" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "knowledge-sync",
    "cron": "@daily",
    "action": "issue-follow-up",
    "config": {
      "projectId": "...",
      "issueId": "'"$ISSUE_ID"'",
      "prompt": "Run knowledge sync: scan all BKD projects for review/done issues that need syncing. Use the pma-mem skill. Extract knowledge points, classify, dedup, and store in Memos."
    }
  }' | jq
```

## Retrieval Examples

```bash
# All discoveries
curl -s -H "$AUTH" "$API/memos?filter=tag+in+[\"discovery\"]" | jq '.memos[]|{uid,snippet}'

# Decisions in a project
curl -s -H "$AUTH" "$API/memos?filter=tag+in+[\"decision\",\"access\"]" | jq

# Everything about a topic
curl -s -H "$AUTH" "$API/memos?filter=tag+in+[\"auth\"]" | jq

# Recent synced
curl -s -H "$AUTH" "$API/memos?filter=tag+in+[\"bkd-sync\"]&order_by=create_time+desc&pageSize=10" | jq
```
