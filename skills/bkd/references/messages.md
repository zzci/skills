# BKD Messages System

BKD's messages module is how an agent working on a BKD issue reaches the human
outside its own conversation. A message lands in BKD's global `/messages`
inbox and fans out to every webhook / Telegram channel the user subscribed.
There are two kinds:

- **Decision** — one question with options that only the user may decide. The
  agent's unaffected work keeps moving; the user's answer wakes the agent's
  issue, which takes its next step from it.
- **Notification** — a headline with a Markdown body. One-way
  (`expects: "none"`) for news the user wants without being asked anything, or
  asking for a free-text reply (`expects: "reply"`), which wakes the issue the
  same way a decision does.

It is independent of any coordination pattern. A single issue, a two-tier
coordinator (`orchestration.md`), a three-tier L1, and an MR master all use the
same flow; those references only add who the sender is in their hierarchy.

The module is served by BKD itself under `$BKD_URL/messages` (contract v2), so
it needs no URL or credential of its own. It is newer than BKD 0.3.20.
Servers from 0.3.16 to 0.3.20 only have the decision-only contract v1 under
`$BKD_URL/decisions`, and earlier ones have neither — see [Probing](#probing). Routes and fields below were checked against
the BKD source and its route tests; treat a mismatch on a live server as a
finding to report, not something to work around. BKD only stores, shows,
delivers, and wakes: it never sends a message itself.

Shell examples assume `set -o pipefail` and the `bkd_check` helper from
`rest-api.md`. The never-inline rule applies to every body here.

## Table of Contents

- [Enabling](#enabling)
- [Roles](#roles)
- [Choosing the Kind](#choosing-the-kind)
- [Probing](#probing)
- [Lifecycle](#lifecycle)
- [Message Record](#message-record)
- [REST API](#rest-api)
- [Sending a Decision](#sending-a-decision)
- [Sending a Notification](#sending-a-notification)
- [Tracking Your Messages](#tracking-your-messages)
- [Applying an Answer](#applying-an-answer)
- [Answered in the Conversation](#answered-in-the-conversation)
- [When the Matter Goes Away](#when-the-matter-goes-away)
- [Closed by the User](#closed-by-the-user)
- [What Receivers Get](#what-receivers-get)
- [Contract v1 (`/decisions`)](#contract-v1-decisions)
- [Without the Messages Module](#without-the-messages-module)
- [Key Constraints](#key-constraints)

## Enabling

The messages system is on when any of these holds:

- **The user asks for it**, in any BKD session and in any wording: "启用消息
  系统", "启用决策系统", "需要我决定的发到收件箱", "enable the messages system",
  "use decision events". It then stays on for that issue until the user turns
  it off.
- **The user asks to be told about something** — "完成了通知我", "发消息给我",
  "notify me when …": that turns on notifications for that request.
- **The session is a three-tier L1 or an MR master**: those patterns use it by
  default whenever the server supports it.

Turning it on is a request to *route* through the inbox, never permission to
decide more on your own, and never a reason to ask or report more often. What
needs the human is unchanged; only the channel changes.

On enabling, [probe](#probing) and confirm your own issue id and project id —
messages need them as `source`. Then tell the user in one line whether it is
active (and which contract), or that this server has no messages module and
everything stays in the conversation.

**A sender that expects an answer must be a BKD issue.** BKD wakes the sender
by following up its issue, and a decision or reply-notification is rejected
without a valid one. An agent that is not running as a BKD issue can still send
one-way notifications, but must keep questions in the conversation unless the
user names an issue that should receive the answer.

## Roles

- **Sender** — the issue that sends the message and owns the next step. It
  sends, tracks, applies, acks, and withdraws its own messages.
  - A single issue sends for itself.
  - In a hierarchy, the top coordinator is the sender (two-tier coordinator,
    three-tier L1, MR master). Subtasks, L2s, L3s, and lanes keep escalating
    and reporting to it by follow-up and never call the messages API — one
    sender per campaign — unless the user enabled the system on that issue
    directly.
- **BKD** — stores messages, shows them in the inbox, delivers them to
  channels, and wakes the sender. It makes no decisions and runs no work.
- **User** — answers or closes messages in the inbox (or an interactive
  Telegram chat) and marks notifications read. Answering in the sender's own
  conversation stays valid; the sender then closes the message itself.

## Choosing the Kind

| Situation | Kind |
|-----------|------|
| A choice between options only the user may make | decision |
| A free-form question with no fixed options ("which region?", "release name?") | notification, `expects: "reply"` |
| News the user wants without being asked anything | notification, `expects: "none"` |

**Decisions** — raise one per question whenever the sender would otherwise
stop and wait for the user:

- a requirement with two readings that lead to materially different work;
- an escalation that needs a human choice (a `yellow` or `blocked` subtask
  after exhausted retries, an unresolvable merge conflict, ambiguous
  acceptance criteria);
- a confirmation gate the user has not answered in the conversation (merge or
  acceptance of finished work, a continuation or scope change);
- every auto-mode hard stop;
- an outward-facing or irreversible step (push, publish, tag, deletion).

**One-way notifications** — only for:

- a milestone or completion the user is waiting for (campaign done, release
  published, a long migration finished) — `level: "success"`;
- a blocker or failure that needs attention but no choice (CI red on main, a
  credential expired, a service down) — `level: "warning"` or `"error"`;
- anything the user explicitly asked to be told about.

Never send a message for routine progress (every turn, subtask, or commit), for
a question the user is answering live in the conversation (including the
initial dispatch package of a new campaign), for anything the sender is allowed
to decide itself, or for something already said in the conversation the user
is reading. Messages reach phones and chat channels; a noisy agent gets muted.

Before sending a question, list your open messages; if one already covers it,
`PATCH` it with the new facts instead of sending a second.

**Grouping.** `campaignId` groups a campaign's messages. A campaign uses its
`campaignId`; an issue outside any campaign uses `issue-{issueId}`. It is
required for decisions and optional for notifications.

## Probing

Probe once per session, during pre-flight or on enabling, and keep the result
for as long as the session lasts. Prefer v2, fall back to v1:

```bash
probe() {  # prints the response body on 200 + supported:true
  local out; out=$(curl -sS --max-time 10 -w '\n%{http_code}' "$1") || return 1
  [ "${out##*$'\n'}" = 200 ] || { [ "${out##*$'\n'}" = 404 ] || printf 'probe %s: HTTP %s\n' "$1" "${out##*$'\n'}" >&2; return 1; }
  printf '%s\n' "${out%$'\n'*}" | jq -e '.success == true and .data.supported == true' >/dev/null || return 1
  printf '%s\n' "${out%$'\n'*}"
}
if BODY=$(probe "$BKD_URL/messages"); then
  MESSAGES_CONTRACT=$(printf '%s\n' "$BODY" | jq -r '.data.contractVersion')   # 2
elif probe "$BKD_URL/decisions" >/dev/null; then
  MESSAGES_CONTRACT=1     # decisions only, under /decisions/events
else
  MESSAGES_CONTRACT=0     # no module: everything stays in the conversation
fi
```

- **2** (`kinds: ["decision","notification"]`) → this file as written.
- **1** → decisions only, through [Contract v1](#contract-v1-decisions); no
  notifications — say in the conversation what you would have sent, once.
- **0** → [Without the Messages Module](#without-the-messages-module).
- A `contractVersion` above 2 → tell the user once that the server's contract
  is newer than this skill, and check the routes you use against
  `$BKD_URL/docs/openapi.json` before the first call.

A 404 is an expected answer, so the probe does not use `--fail-with-body`; any
other non-2xx status is reported once and treated as unavailable. Re-probe only
when a call that used to work starts failing, or when the server version
changes. `GET $BKD_URL/events` is BKD's SSE stream and is unrelated.

## Lifecycle

```
decision / reply-notification:
sender: send                                         -> open
user:   answers in the inbox or Telegram             -> decided | replied
BKD:    follows up the source issue (wake signal)
sender: woken -> re-read -> apply -> ack             -> applied

user answers in the sender's conversation instead:
sender: apply -> close with the answer as the reason -> closed
the matter went away:
sender: withdraw with a reason                       -> withdrawn
user ends it in the inbox without answering          -> closed

one-way notification:
sender: send -> unread;  user reads it               -> read
```

| Status | Kind | Meaning | Reached by |
|--------|------|---------|------------|
| `open` | awaiting an answer | waiting on the human | send |
| `decided` | decision | answered; not yet acted on | `decision` (user) |
| `replied` | reply-notification | answered; not yet acted on | `reply` (user) |
| `applied` | awaiting an answer | the sender acted on the answer | `ack` (sender) |
| `withdrawn` | awaiting an answer | no longer needed; never answered | `withdraw` (sender) |
| `closed` | awaiting an answer | ended without the flow completing | `close` (user or sender) |
| `unread` / `read` | one-way | delivered / seen | send / `read` (user) |

`applied`, `withdrawn`, and `closed` are terminal. A call the current kind or
status does not allow returns HTTP 409, so a terminal message can no longer be
answered and can never trigger a follow-up. Ending a message promptly is what
keeps a stray answer from waking the sender for nothing.

A question is **non-blocking**: only the work that depends on the answer waits
(keep the affected subtask or lane `blocked`, with the message id noted beside
it). Everything independent keeps running.

**Retention.** BKD soft-deletes a message awaiting an answer once it is no
longer `open` and has been untouched for a day — that includes `decided` and
`replied`, not just terminal states — and a read notification after a week.
Apply and ack an answer on the wake that delivers it; one left for a day can
vanish from the API.

## Message Record

| Field | Set by | Content |
|-------|--------|---------|
| `id`, `createdAt`, `updatedAt` | BKD | |
| `kind` | sender | `decision` / `notification` |
| `expects` | sender | `reply` (always for decisions) / `none` |
| `status` | BKD | see [Lifecycle](#lifecycle) |
| `level` | sender | notifications: `info` (default) / `success` / `warning` / `error` |
| `campaignId` | sender | ≤ 200; required for decisions |
| `source` | sender | `{ projectId, issueId }` — your own issue; required for decisions and `expects: "reply"`, recommended always |
| `ref` | sender | issue id the message concerns (a subtask, L2, lane; yourself when none) |
| `title` | sender | required, one line, ≤ 2000 — the question, or a headline readable on a lock screen |
| `body` | sender | Markdown, ≤ 20 000 — paths + line ranges and links, never pasted logs or file contents |
| `options[]` | sender | decisions: `{ id, label, impact }`, unique ids, ≤ 20 — impact = scope / time / risk |
| `recommendation` | sender | decisions: `{ optionId, reason }`, `optionId` must be an option |
| `blocks` / `continues` | sender | decisions: what waits on the answer / what keeps running (≤ 2000 each) |
| `decision` | user | `{ optionId \| null, instruction, decidedBy, decidedAt }` |
| `reply` | user | `{ text, repliedBy, repliedAt }` |
| `outcome` | sender (ack) | one line: what was done with the answer |
| `withdrawReason` / `closeReason` | sender / whoever closed | free text |
| `notifiedAt` | BKD | when the wake was delivered; null if it was not |
| `links` | BKD | `{ projectName, ref, source }` resolved issue titles, read-only |

A decision answer carries an `optionId`, a free-form `instruction`, or both.
The `source` issue must exist in `source.projectId`, or the send fails with 400.

## REST API

Probe at `GET $BKD_URL/messages`; everything else is under
`$BKD_URL/messages/items`, with the BKD envelope.

| Operation | Route | Body | Allowed when | Caller |
|-----------|-------|------|--------------|--------|
| Send | `POST /` → 201 | kind-specific, see below | — | sender |
| List | `GET /?kind=&expects=&status=a,b&campaignId=&issueId=` | — | — | sender, inbox |
| Get | `GET /{id}` | — | — | sender |
| Update facts | `PATCH /{id}` | any card field | `expects: reply`, `open` | sender |
| Decide | `POST /{id}/decision` | `{optionId?, instruction?, decidedBy?}` | decision, `open` | user |
| Reply | `POST /{id}/reply` | `{text, repliedBy?}` | reply-notification, `open` | user |
| Resend wake | `POST /{id}/notify` | — | `decided` / `replied` | user |
| Ack | `POST /{id}/ack` | `{outcome}` (required) | `decided` / `replied` | sender |
| Withdraw | `POST /{id}/withdraw` | `{reason}` (required) | `open` | sender |
| Close | `POST /{id}/close` | `{reason?}` | `open`, `decided` / `replied` | user, sender |
| Read | `POST /{id}/read`, `POST /read` `{ids?}` | — | `expects: none` | user |

`issueId` filters by `source.issueId`. `List` returns the newest 500,
unpaginated. Unknown id → 404, wrong kind or status → 409, invalid body → 400.
More than 30 notifications a minute from one source issue → 429.

**Wake signal.** When the user answers, BKD sends one follow-up to the source
issue:

```text
[event-decision eventId={id} campaignId={campaignId}]       decision
[message-reply messageId={id} campaignId={campaignId}]      reply-notification (campaignId only when set)
```

It is only a wake signal; the message record is the single source of truth and
is always re-read. It uses normal BKD follow-up routing: it wakes an issue
resting in `review` or idle in `working`, arrives after the current turn if the
sender is mid-turn, and is only queued — waking nothing — if the issue is
`todo` or `done`. Keep the sender out of `done` while it has messages awaiting
an answer. A failed delivery leaves the message `decided`/`replied` with
`notifiedAt` null; the sender's scan still picks it up. `withdraw`, `close`,
and one-way notifications never wake anyone.

## Sending a Decision

```bash
cat > /tmp/bkd-message-body.md <<'TEXT'
{3-6 lines of context; paths + line ranges}
TEXT

jq -n --rawfile body /tmp/bkd-message-body.md \
  --arg campaignId "$CAMPAIGN_ID" --arg ref "$SUBJECT_ID" \
  --arg projectId "$PROJECT_ID" --arg issueId "$SENDER_ID" \
  '{kind:"decision", campaignId:$campaignId, ref:$ref,
    title:"{one-sentence question}", body:$body,
    options:[{id:"A",label:"{option}",impact:"{scope/time/risk}"},
             {id:"B",label:"{option}",impact:"{scope/time/risk}"}],
    recommendation:{optionId:"A",reason:"{reason}"},
    blocks:"{what waits on this}", continues:"{what keeps running}",
    source:{projectId:$projectId, issueId:$issueId}}' > /tmp/bkd-message.json

MESSAGE=$(curl -sS --fail-with-body -X POST "$BKD_URL/messages/items" \
  -H 'Content-Type: application/json' --data-binary @/tmp/bkd-message.json) || exit 1
MESSAGE_ID=$(printf '%s\n' "$MESSAGE" | bkd_check | jq -er '.data.id') || exit 1
```

Write in the language the user speaks with you. Tell the user about it once,
in your next message: message id, the question, what is waiting on it, and
that it can be answered in the `/messages` inbox. Note the message id beside
the blocked item in your state (campaign state or ledger; for a single issue,
the turn's final message). Then end the turn when nothing unblocked is left —
never wait in-turn for the answer. The issue settles into `review`, and the
wake follow-up wakes it from there.

## Sending a Notification

```bash
cat > /tmp/bkd-message-body.md <<'TEXT'
{Markdown body: what happened, where to look}
TEXT

jq -n --rawfile body /tmp/bkd-message-body.md \
  --arg projectId "$PROJECT_ID" --arg issueId "$SENDER_ID" --arg campaignId "$CAMPAIGN_ID" \
  '{kind:"notification", level:"success", expects:"none",
    title:"{headline}", body:$body, campaignId:$campaignId,
    source:{projectId:$projectId, issueId:$issueId}}' > /tmp/bkd-message.json

curl -sS --fail-with-body -X POST "$BKD_URL/messages/items" \
  -H 'Content-Type: application/json' --data-binary @/tmp/bkd-message.json | bkd_check >/dev/null
```

- Pass `source` whenever you are a BKD issue, even one-way: receivers use it
  to show and route where the message came from.
- For a free-form question set `expects:"reply"` (requires `source`); it then
  follows the same tracking, apply, ack, close, and withdraw rules as a
  decision, with `replied` in place of `decided` and `reply.text` as the answer.
- A one-way notification needs no tracking: send it and move on. Do not repeat
  it in the conversation beyond one line.
- A 429 means you are sending far too much; stop, and fold what is left into
  one message later.

## Tracking Your Messages

The wake follow-up is the primary signal. The scan below is the safety net for
a lost wake, the only way to notice a message the user closed, and the source
of the "open questions" line in every progress report. Run it at the start of
every wake (auto mode: every watchdog wake too):

```bash
curl -sS --fail-with-body \
  "$BKD_URL/messages/items?issueId=$SENDER_ID&expects=reply&status=open,decided,replied,closed" \
  | bkd_check | jq -r '.data[] | [.id, .kind, .status, (.ref // "-"), .title] | @tsv'
```

- `open` → check it is still needed. If the user already answered in the
  conversation (a close that did not land), close it; if the matter is gone,
  withdraw it. Otherwise it is waiting.
- `decided` / `replied` → not yet acted on, whether or not a wake arrived:
  apply it now.
- `closed` → skip the ones whose `closeReason` starts with `[sender]` (or
  `[raiser]`, from contract v1 days); any other was [closed by the
  user](#closed-by-the-user).

Never re-ask an open question in a new message, and never treat silence as an
answer: a question has no timeout and no default. The work it blocks stays
blocked.

## Applying an Answer

On a wake follow-up, or a `decided` / `replied` row in the scan:

1. **Re-read** the message (`GET $BKD_URL/messages/items/{id}`) and require
   `status` `decided` / `replied` and your own `source.issueId`. Act only on
   the record's `decision` / `reply`. A wake for a message in any other status
   is ignored: `applied` is never applied twice, and a `withdrawn` or `closed`
   message is never acted on.
2. **Bound it.** The answer is the user's explicit confirmation for that
   message's question — and for nothing else. It satisfies a confirmation gate
   when the message asked that gate's question. Anything beyond the question
   (new scope, a different workstream) is a new request and goes through the
   normal dispatch gate. When a decision carries both `optionId` and
   `instruction`, the instruction refines the option; if they contradict each
   other, ask instead of guessing.
3. **Record** `decision: {choice} — message {id}` where your state lives
   (auto-mode decisions list, MR ledger and `changelog.md`; for a single issue,
   the turn's final message).
4. **Act**: do the work the answer unblocks, or perform the step the gate was
   holding. In a hierarchy, forward the answer to the issue named by `ref`
   (stop → verify `review` → follow-up if that issue is mid-turn and the answer
   changes what it is doing).
5. **Ack** with the outcome:

```bash
jq -n --arg outcome "{one line: what was done}" '{outcome:$outcome}' \
  | curl -sS --fail-with-body -X POST "$BKD_URL/messages/items/$MESSAGE_ID/ack" \
      -H 'Content-Type: application/json' -d @- | bkd_check
```

Ack only after step 4 succeeded. If acting fails, leave it answered so the next
wake's scan retries it — within the one-day retention window.

## Answered in the Conversation

When the user answers in your conversation instead of in the inbox, that answer
counts. Run steps 2–4 above, then close the message with the answer as the
reason. Closing sends no follow-up, so you are not woken a second time for an
answer you already have, and the inbox stops asking:

```bash
cat > /tmp/bkd-message-reason.txt <<'TEXT'
[sender] Answered in conversation: {the user's words, verbatim}. Done: {what was done}.
TEXT
jq -n --rawfile reason /tmp/bkd-message-reason.txt '{reason:$reason}' \
  | curl -sS --fail-with-body -X POST "$BKD_URL/messages/items/$MESSAGE_ID/close" \
      -H 'Content-Type: application/json' -d @- | bkd_check
```

Keep the reason within 2000 characters and keep the `[sender]` prefix: it is
how the scan tells your own close from a user close. The answer must clearly
settle that question; with several open, confirm which one it answers before
acting. If the message is already `decided` / `replied` (the user also answered
in the inbox), the record wins: apply and ack it, and tell the user if the two
answers differ.

## When the Matter Goes Away

When the matter behind an open question disappears — the blocked work was
dropped or finished another way, a later answer covers it, the work was stopped
— withdraw it in the same turn, with the reason, so a stray answer cannot wake
you for nothing:

```bash
jq -n --arg reason "{why it is no longer needed}" '{reason:$reason}' \
  | curl -sS --fail-with-body -X POST "$BKD_URL/messages/items/$MESSAGE_ID/withdraw" \
      -H 'Content-Type: application/json' -d @- | bkd_check
```

`withdraw` only works on `open`. A 409 means the user answered first: apply
whatever part still makes sense and ack with an outcome that says what was and
was not done; if nothing is left to apply, close it with a `[sender]`-prefixed
reason that explains why.

Work that finishes with open questions is not silently complete: list every
one in the final report. You still wake on a late answer and handle it as a
continuation.

## Closed by the User

The user can close a question without answering it. BKD sends no follow-up for
that, so you learn of it only from the scan, on your next wake. A `closed`
message without your prefix means the user declined to answer it this way:

- Do not act on it — not on the recommendation, and not on an answer it may
  still carry from before it was closed.
- Do not ask the same question again as a new message.
- Record it as dismissed (with `closeReason`, if any), keep the dependent work
  `blocked`, and say so once in your next message to the user: what was
  dismissed and what stays blocked. What happens to that work is then the
  user's call in the conversation.

## What Receivers Get

BKD delivers each state once per subscribed channel — decisions as
`decision.{opened,decided,applied,withdrawn,closed}` (v1 payload), notifications
as `message.{sent,replied,applied,withdrawn,closed}`; marking read is silent. A
`message.*` webhook receives:

```jsonc
{
  "event": "message.sent",
  "timestamp": "…",
  "message": { "id", "kind", "expects", "level", "status", "title", "body",
               "campaignId", "source", "ref", "reply", "outcome", "…" },
  "source": { "issueId", "issueNumber", "title", "projectId", "projectName",
              "engineType", "model", "issueUrl" } | null,
  "ref":    { … same shape … } | null,
  "links":  { "inboxUrl", "apiUrl" },
  "server": { "url", "version" }
}
```

There is no way to address one channel: the user decides which channels
subscribe. Put what a receiver needs to route the message into `level`,
`title`, `campaignId`, and `source`.

## Contract v1 (`/decisions`)

On a server whose probe found only `$BKD_URL/decisions` (contract 1), decisions
work with the same flow and these differences; there are no notifications.

| v2 | v1 |
|----|----|
| `$BKD_URL/messages/items` | `$BKD_URL/decisions/events` |
| `kind:"decision"` in the send body | implied; omit it |
| `title` / `body` / `source:{projectId,issueId}` | `question` / `context` / `notify:{type:"bkd-follow-up",projectId,issueId}` |
| scan with `?issueId=$SENDER_ID&expects=reply&status=…` | scan with `?campaignId=$CAMPAIGN_ID&status=open,decided,closed` |
| `.../{id}/{decision,notify,ack,withdraw,close}` | same sub-routes |
| statuses and wake signal | identical (`[event-decision …]`) |

Newer servers keep serving v1 from the same store, so decisions sent through
either contract show up in the same inbox. Use v2 whenever the probe offers it.

## Without the Messages Module

If the probe finds neither contract, do not invent a substitute (no stand-in
issues, notes, or files). Every rule in this file except the transport still
holds: one question at a time, the same card content (question, context,
options, impact, recommendation, what waits, what continues), non-blocking for
independent work, and no default answer. Put the question to the user in your
own conversation and record the answer where your state lives; say once that
this BKD server has no messages module.

## Key Constraints

1. **One message, one question** — never bundle; update an open one instead of
   sending a second.
2. **One sender per hierarchy** — the top coordinator sends, applies, acks, and
   withdraws; subtasks, L2s, L3s, and lanes escalate to it. A single issue
   sends for itself. A sender expecting an answer must be a BKD issue.
3. **The record is the source of truth** — the wake follow-up is only a signal;
   always re-read before acting.
4. **Non-blocking** — only dependent work waits; note the message id beside the
   blocked item.
5. **An answer covers its question only**; anything beyond it goes through the
   normal gates.
6. **No timeout, no default answer** — silence never resolves a question.
7. **Wake first, scan as safety net** — the scan runs on wakes that already
   happen; messages add no cron and no `sleep`.
8. **Ack on the wake that delivers the answer** — `decided`/`replied` means
   still owed, and BKD deletes answered messages left untouched for a day.
9. **End what is no longer waiting, at once** — close a question answered in
   the conversation, withdraw one whose matter went away.
10. **A user-closed question is never acted on** and never re-asked; its work
    stays blocked until the user says otherwise.
11. **No noise** — notifications for milestones, completion, blockers, and
    what the user asked to hear about; never routine progress.
12. **Enabling changes the channel, not the threshold** — never ask more,
    never decide more, never report more.
13. **Probe once, reuse `$BKD_URL`** — v2, else v1 for decisions, else the
    conversation.
