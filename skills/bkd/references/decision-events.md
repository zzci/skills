# BKD Decision Events

A **decision event** is one record in BKD's decisions module that carries
exactly one question for the human. The coordinator raises it when it hits
something only the user may decide, keeps the rest of the campaign moving, and
takes its next step from the event's outcome. The user decides **on the event
itself**, in BKD's global `/decisions` inbox; BKD then follows up the
coordinator, which wakes and acts on it.

Shared by `three-tier-coordination.md` (coordinator = L1) and
`multi-repo-coordination.md` (coordinator = the master). Those files say *when*
to raise an event; this file is the flow and the API.

The module is served by BKD itself under `$BKD_URL/decisions/events`, so it
needs no URL or credential of its own. It was added after 0.3.15; an older
server answers 404 there. The routes and fields below were checked against the
BKD source and its route tests, not yet against a released server — treat a
mismatch on a live server as a finding to report, not something to work around.
BKD only stores, shows, and notifies: it never raises an event itself.

Shell examples assume `set -o pipefail` and the `bkd_check` helper from
`rest-api.md`. The never-inline rule applies to every body here.

## Table of Contents

- [Why Events](#why-events)
- [Roles](#roles)
- [What Becomes an Event](#what-becomes-an-event)
- [Probing the API](#probing-the-api)
- [Lifecycle](#lifecycle)
- [Event Record](#event-record)
- [REST API](#rest-api)
- [Raising an Event](#raising-an-event)
- [Tracking Events](#tracking-events)
- [Applying a Decision](#applying-a-decision)
- [Decided in the Conversation](#decided-in-the-conversation)
- [When the Matter Goes Away](#when-the-matter-goes-away)
- [Closed by the User](#closed-by-the-user)
- [Without the Decisions Module](#without-the-decisions-module)
- [Key Constraints](#key-constraints)

## Why Events

A question asked only in the coordinator's conversation is easy to miss, blocks
on one thread, and is lost when that process is replaced. An event:

- is a durable record outside any agent session, listed in one inbox across
  all projects as "waiting on me";
- is decidable in place — the user acts on the event, not on a chat thread;
- holds one question, so several decisions can be open at once and be answered
  in any order while unaffected work continues;
- costs no BKD execution slot and no agent turn while it waits.

## Roles

- **Coordinator (L1 / MR master)** — the only tier that raises, tracks,
  applies, acks, and withdraws events. L2s, L3s, and lanes keep escalating to
  the coordinator by follow-up exactly as before; they never call the
  decisions API.
- **BKD** — stores events, shows them in the `/decisions` inbox, and wakes the
  raiser. It makes no decisions and runs no work.
- **User** — decides an event, or closes it without answering, in the inbox.
  Answering in the coordinator's own conversation stays valid; the coordinator
  then closes the event itself.

## What Becomes an Event

Raise one event per decision whenever the coordinator would otherwise stop and
wait for the user:

- an escalation that needs a human choice (`yellow`, `blocked` after exhausted
  retries, an unresolvable merge conflict, ambiguous acceptance criteria);
- a confirmation gate the user has not answered in the conversation (merge or
  acceptance of finished work, a continuation or scope change);
- every auto-mode hard stop;
- an outward-facing or irreversible step (push, publish, tag, deletion).

Do not raise an event for the initial dispatch package of a new campaign (that
is a live conversation with the user), for anything the coordinator is allowed
to decide itself, or for progress news that needs no decision.

Before creating one, list the campaign's open events; if one already covers the
same question, `PATCH` it with the new facts instead of opening a second.

## Probing the API

`GET $BKD_URL/decisions` is the capability probe. A server with the module
answers `{ success:true, data:{ supported:true, contractVersion:1 } }`; an older
server answers 404. Probe once per session, during pre-flight, and keep the
result for the whole campaign:

```bash
DECISIONS_API=0
PROBE=$(curl -sS --max-time 10 -w '\n%{http_code}' "$BKD_URL/decisions") || PROBE=$'\n000'
DECISIONS_HTTP=${PROBE##*$'\n'}
if [ "$DECISIONS_HTTP" = 200 ] \
  && printf '%s\n' "${PROBE%$'\n'*}" | jq -e '.success == true and .data.supported == true' >/dev/null; then
  DECISIONS_API=1
  DECISIONS_CONTRACT=$(printf '%s\n' "${PROBE%$'\n'*}" | jq -r '.data.contractVersion')
elif [ "$DECISIONS_HTTP" != 404 ]; then
  printf 'decisions probe: HTTP %s\n' "$DECISIONS_HTTP" >&2
fi
```

- **Supported** → use decision events. This file describes
  `contractVersion` **1**. On a higher version, tell the user once that the
  server's decisions contract is newer than this skill, and check the routes
  you are about to use against the server's OpenAPI (`$BKD_URL/openapi.json`)
  before the first call.
- **404** → the server predates the module; an expected answer, not an error,
  so the probe deliberately does not use `--fail-with-body`.
- **Anything else** → report it to the user once and treat as unavailable.

Do not re-probe on every wake; re-probe only when a decisions call that used to
work starts failing, or when the server version changes. With
`DECISIONS_API=0`, follow [Without the Decisions
Module](#without-the-decisions-module).

`GET $BKD_URL/events` is BKD's server-sent event stream and is unrelated; never
use it for this flow.

## Lifecycle

```
coordinator: create event                                  -> open
user:        decides in the inbox (option and/or instruction) -> decided
BKD:         follows up the notify issue with [event-decision ...]
coordinator: woken -> re-read the event -> apply -> ack     -> applied

user answers in the coordinator's conversation instead:
coordinator: apply -> close with the decision as the reason -> closed

the matter went away:
coordinator: withdraw with a reason                         -> withdrawn

user ends the event in the inbox without answering          -> closed
```

| State | Meaning | Reached by | From |
|-------|---------|------------|------|
| `open` | waiting on the human | create | — |
| `decided` | the human answered; not yet acted on | `decision` (user) | `open` |
| `applied` | the coordinator acted on the decision | `ack` (coordinator) | `decided` |
| `withdrawn` | no longer needed; never decided | `withdraw` (coordinator) | `open` |
| `closed` | ended without the event flow completing | `close` (user or coordinator) | `open`, `decided` |

`applied`, `withdrawn`, and `closed` are terminal. A call that the current
state does not allow returns HTTP 409 (`Not allowed while the event is
{status}`), so a terminal event can no longer be decided and can never trigger
a follow-up. Ending an event promptly is what keeps a stray reply from waking
the coordinator with a decision nobody needs.

An event is **non-blocking**: only the work that depends on the decision waits
(keep the affected subtask or lane `blocked`, with the event id noted beside
it). Everything independent keeps running.

## Event Record

| Field | Set by | Content |
|-------|--------|---------|
| `id` | BKD | event id |
| `status` | BKD | `open` / `decided` / `applied` / `withdrawn` / `closed` |
| `campaignId` | coordinator | required, ≤ 200 chars |
| `ref` | coordinator | issue id of the L2 / lane / subtask the decision concerns; the inbox links to it |
| `question` | coordinator | required; the single decision needed, one sentence (≤ 2000) |
| `context` | coordinator | 3–6 lines; file paths + line ranges, never pasted contents |
| `options[]` | coordinator | `{ id, label, impact }`, unique ids, at most 20 — impact = scope / time / risk |
| `recommendation` | coordinator | `{ optionId, reason }`; `optionId` must be one of the options |
| `blocks` | coordinator | what stays blocked until decided (≤ 2000) |
| `continues` | coordinator | what keeps running meanwhile (≤ 2000) |
| `notify` | coordinator | required: `{ type:"bkd-follow-up", projectId, issueId }` — the coordinator's own issue |
| `decision` | user | `{ optionId \| null, instruction, decidedBy, decidedAt }` |
| `outcome` | coordinator (ack) | one line: what was done with the decision |
| `withdrawReason` | coordinator (withdraw) | why it is no longer needed |
| `closeReason` | whoever closed it | free text, may be null |
| `notifiedAt` | BKD | when the wake follow-up was delivered; null if it was not |
| `links` | BKD | `{ projectName, ref, notify }` resolved issue titles, read-only |

A decision carries an `optionId`, a free-form `instruction`, or both — at least
one. The `notify` issue must exist in `notify.projectId`, or create fails with
HTTP 400.

## REST API

The capability probe is `GET $BKD_URL/decisions`; every event route is under
`$BKD_URL/decisions/events`. All use the BKD envelope.

| Operation | Route | Body | Allowed from | Caller |
|-----------|-------|------|--------------|--------|
| Create | `POST /` → 201 | the card fields + `notify` | — | coordinator |
| List | `GET /?campaignId=&status=a,b` | — | — | coordinator, inbox |
| Get | `GET /{id}` | — | — | coordinator |
| Update facts | `PATCH /{id}` | any card field | `open` | coordinator |
| Decide | `POST /{id}/decision` | `{optionId?, instruction?, decidedBy?}` | `open` | user (inbox) |
| Resend wake | `POST /{id}/notify` | — | `decided` | user (inbox) |
| Ack | `POST /{id}/ack` | `{outcome}` (required) | `decided` | coordinator |
| Withdraw | `POST /{id}/withdraw` | `{reason}` (required) | `open` | coordinator |
| Close | `POST /{id}/close` | `{reason?}` | `open`, `decided` | user, coordinator |

`List` returns the newest 500 events, unpaginated; `status` is a
comma-separated list. An unknown id returns 404, a wrong state 409, an invalid
body 400.

**Notification.** On `decision`, BKD sends one follow-up to the `notify` issue:

```text
[event-decision eventId={id} campaignId={campaignId}]
```

It is only a wake signal and carries no decision the coordinator may act on;
the event record is the single source of truth and is always re-read. The
follow-up uses normal BKD routing: it wakes a coordinator issue resting in
`review` or idle in `working`, is delivered after the current turn if the
coordinator is mid-turn, and is only queued — waking nothing — if that issue is
`todo` or `done`. Keep the coordinator issue out of `done` while it has open
events. If delivery fails, the event stays `decided` with `notifiedAt` null;
the coordinator's scan still picks it up. `withdraw` and `close` never send a
follow-up.

## Raising an Event

```bash
cat > /tmp/bkd-event-context.txt <<'TEXT'
{3-6 lines of context; paths + line ranges}
TEXT

jq -n --rawfile context /tmp/bkd-event-context.txt \
  --arg campaignId "$CAMPAIGN_ID" --arg ref "$SUBJECT_ID" \
  --arg projectId "$PROJECT_ID" --arg issueId "$COORDINATOR_ID" \
  '{campaignId:$campaignId, ref:$ref,
    question:"{one-sentence question}",
    context:$context,
    options:[{id:"A",label:"{option}",impact:"{scope/time/risk}"},
             {id:"B",label:"{option}",impact:"{scope/time/risk}"}],
    recommendation:{optionId:"A",reason:"{reason}"},
    blocks:"{what waits on this}", continues:"{what keeps running}",
    notify:{type:"bkd-follow-up",projectId:$projectId,issueId:$issueId}}' \
  > /tmp/bkd-event-body.json

EVENT=$(curl -sS --fail-with-body -X POST "$BKD_URL/decisions/events" \
  -H 'Content-Type: application/json' --data-binary @/tmp/bkd-event-body.json) || exit 1
EVENT_ID=$(printf '%s\n' "$EVENT" | bkd_check | jq -er '.data.id') || exit 1
```

Write the card in the language the user speaks with the coordinator. Tell the
user about the new event once, in the coordinator's next message: event id, the
question, what is waiting on it, and that it can be decided in the `/decisions`
inbox. Record the event id beside the blocked item in the campaign state. Then
end the turn — never wait in-turn for the decision.

## Tracking Events

The notification is the primary signal: it wakes the coordinator the moment the
user decides. The scan below is the safety net for a lost notification, the
only way to notice an event the user closed, and the source of the "open
decisions" line in every progress report. Run it at the start of every
coordinator wake that touches the campaign (auto mode: every watchdog wake
too):

```bash
curl -sS --fail-with-body \
  "$BKD_URL/decisions/events?campaignId=$CAMPAIGN_ID&status=open,decided,closed" | bkd_check \
  | jq -r '.data[] | [.id, .status, (.ref // "-"), .question] | @tsv'
```

- `open` → check it is still needed. If the campaign state already records a
  decision for it (a conversation answer whose close did not land), close it;
  if the matter it asks about is gone, withdraw it. Otherwise it is waiting.
- `decided` → not yet acted on, whether or not a notification arrived: apply it.
- `closed` → skip the ones the campaign state already records as settled; any
  other was [closed by the user](#closed-by-the-user).

Never re-ask an open event's question in a new event, and never treat silence
as an answer: an open event has no timeout and no default. The work it blocks
stays blocked.

## Applying a Decision

On an `[event-decision eventId=...]` follow-up, or a `decided` row in the scan:

1. **Re-read** the event (`GET /decisions/events/{id}`) and require
   `status:"decided"` and this campaign's `campaignId`. Act only on the
   record's `decision` field. A notification for an event in any other state is
   ignored: `applied` is never applied twice, and a `withdrawn` or `closed`
   event is never acted on.
2. **Bound it.** The decision is the user's explicit confirmation for that
   event's question — and for nothing else. It satisfies a confirmation gate
   when the event asked that gate's question. If the instruction goes beyond
   the question (new scope, a different workstream), treat the extra part as a
   new request and put it through the normal dispatch gate. When `optionId`
   and `instruction` are both present, the instruction refines the option; if
   they contradict each other, ask instead of guessing.
3. **Record** `decision: {choice} — event {eventId}` in the campaign state
   (auto-mode decisions list, MR ledger and `changelog.md`).
4. **Act**: forward the decision to the L2 or lane named by `ref` (stop →
   verify `review` → follow-up if that issue is mid-turn and the decision
   changes what it is doing), or perform the step the gate was holding.
5. **Ack** with the outcome, so the event shows what was done:

```bash
jq -n --arg outcome "{one line: what was done}" '{outcome:$outcome}' \
  | curl -sS --fail-with-body -X POST "$BKD_URL/decisions/events/$EVENT_ID/ack" \
      -H 'Content-Type: application/json' -d @- | bkd_check
```

Ack only after step 4 succeeded. If acting fails, leave the event `decided`
so the next wake's scan retries it.

## Decided in the Conversation

When the user answers in the coordinator's conversation instead of in the
inbox, that answer is the decision. The coordinator runs steps 2–4 above, then
closes the event with the decision as the reason. Closing sends no follow-up,
so the coordinator is not woken a second time for an answer it already has, and
the inbox stops asking:

```bash
cat > /tmp/bkd-event-reason.txt <<'TEXT'
Decided in conversation: {the user's words, verbatim}. Done: {what was done}.
TEXT
jq -n --rawfile reason /tmp/bkd-event-reason.txt '{reason:$reason}' \
  | curl -sS --fail-with-body -X POST "$BKD_URL/decisions/events/$EVENT_ID/close" \
      -H 'Content-Type: application/json' -d @- | bkd_check
```

Keep the reason within 2000 characters, and record the event as settled in the
campaign state so the scan does not mistake it for a user close. The answer
must clearly settle that event's question; with several events open, confirm
which one it answers before acting. If the event turns out to be `decided`
already (the user also answered in the inbox), the record wins: apply and ack
that decision, and tell the user if the two answers differ.

## When the Matter Goes Away

When the matter behind an open event disappears — the blocked work was dropped
or finished another way, a later decision covers it, the campaign was stopped —
withdraw the event in the same turn, with the reason. An event left open keeps
asking the user for a decision that no longer matters, and an answer to it
would send a follow-up and wake the coordinator for nothing:

```bash
jq -n --arg reason "{why it is no longer needed}" '{reason:$reason}' \
  | curl -sS --fail-with-body -X POST "$BKD_URL/decisions/events/$EVENT_ID/withdraw" \
      -H 'Content-Type: application/json' -d @- | bkd_check
```

`withdraw` only works on an `open` event. A 409 means the user decided first:
apply whatever part of the decision still makes sense and ack with an outcome
that says what was and was not done; if nothing is left to apply, `close` it
with that explanation as the reason.

A campaign that finishes with open events is not silently complete: list every
open event in the final report. The coordinator still wakes on a late decision
and handles it as a continuation.

## Closed by the User

The user can close an event in the inbox without answering it. BKD sends no
follow-up for that, so the coordinator learns of it only from the scan, on its
next wake. A `closed` event that the campaign state does not record as settled
by the coordinator means: the user declined to decide this through the event.

- Do not act on it — not on the recommendation, and not on a `decision` the
  event may still carry from before it was closed.
- Do not raise the same question again as a new event.
- Record it as dismissed (with `closeReason`, if any), keep the dependent work
  `blocked`, and say so once in the next message to the user: what was
  dismissed and what stays blocked because of it. What happens to that work is
  then the user's call in the conversation.

## Without the Decisions Module

If the [probe](#probing-the-api) finds no decisions module, do not invent a
substitute (no stand-in issues, notes, or files). Every rule in this file
except the transport still holds: one question at a time per decision, the same
card content (question, context, options, impact, recommendation, what waits,
what continues), non-blocking for independent work, and no default answer. The
coordinator puts the card to the user in its own conversation and records the
decision in the campaign state. Say once that decisions are being handled in
the conversation because this BKD server has no decisions module.

## Key Constraints

1. **One event, one decision** — never bundle questions; update an open event
   for the same question instead of opening another.
2. **Only the coordinator raises, applies, acks, and withdraws events**; L2s,
   L3s, and lanes escalate to the coordinator and never call the decisions API.
3. **The event record is the source of truth** — the notification follow-up is
   only a wake signal; always re-read the event before acting.
4. **Non-blocking** — only dependent work waits; note the event id beside the
   blocked item.
5. **A decision covers its event's question only**; anything beyond it goes
   through the normal gates.
6. **No timeout, no default answer** — silence never resolves an event.
7. **Notification first, scan as safety net** — the scan runs on wakes that
   already happen; events add no cron and no `sleep`.
8. **Ack after acting** — `decided` means still owed; `applied` means done.
9. **End what is no longer waiting, at once** — close an event answered in the
   conversation, withdraw one whose matter went away, so a stray reply cannot
   trigger a follow-up.
10. **A user-closed event is never acted on** and never re-raised; its work
    stays blocked until the user says otherwise.
11. **Probe once, reuse `$BKD_URL`** — on a server without the module, fall
    back to the conversation and keep the same flow.
