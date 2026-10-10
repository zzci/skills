# Core Review Policy

Use this policy for every mode. Read `engineering-baseline.md` for the shared engineering checks; stack packs add runtime-specific checks.

## Objective and Scope

Protect correctness and long-term code health while allowing sound incremental improvements. Accept reasonable tradeoffs; do not demand perfection or optimize for finding count.

- Local and PR review: report problems introduced or exposed by the change. Follow affected callers, contracts, and dependencies as needed to establish impact, even outside the diff. Do not make unrelated legacy issues conditions of approval.
- Repository audit: report evidenced problems in the current repository, including existing issues. Distinguish sampled coverage from exhaustive inspection.
- Review does not authorize implementation, dead-code deletion, or remote posting. Preserve existing user authorization for those actions when explicitly given.

## Review Sequence

1. Establish the requested snapshot, scope, intended behavior, and applicable project requirements.
2. Understand the design, contracts, dependencies, and ownership of state or resources.
3. Trace correctness, trust boundaries, data integrity, concurrency, and failure paths.
4. Check test effectiveness, compatibility, and relevant performance or operational consequences.
5. Falsify candidate findings, deduplicate by root cause, and report evidence and coverage.

This is a reading sequence, not a severity ranking. Read the human-written changes in the agreed scope; risk-based sampling must be disclosed as partial coverage.

## Finding Types and Confidence

Report high-confidence, actionable findings in these categories:

| Category | Required basis |
|---|---|
| Defect | A supported trigger and a trace to incorrect behavior, an unsafe boundary, or a broken contract |
| Code health | A specific structure and a concrete consequence for understanding, changing, or correctly using this code |
| Policy | An applicable, explicit project requirement and the exact violation |

Design problems need not cause an existing runtime failure. Explain the dependency, duplicated invariant, unnecessary mechanism, or ambiguous ownership and its consequence. Function length, argument count, naming taste, and a preferred framework are not sufficient evidence.

Usually omit cosmetic nits, equally valid implementation choices, speculative future needs, and broad rewrites. Useful optional improvements may be labeled non-blocking suggestions; do not count them as defects.

Keep confidence separate from impact. Static reasoning can confirm a finding without a reproduction if the reachable path and violated contract are established. If a critical premise is unknown, put the item in verification gaps with the missing evidence and a concrete next check. Do not disguise an unproven suspicion as a LOW finding.

## Verification Pass

Before reporting a candidate:

- Read the enclosing implementation and the relevant callers, callees, guards, tests, and configuration from the reviewed snapshot.
- Check the requirement or existing contract, supported versions, and real consumers. Do not infer a bug from a keyword or pattern alone.
- Look for a counterexample to the claim: upstream validation, a bounded input, transaction ownership, a framework guarantee, or a tested alternative path.
- Anchor the finding to a precise `file:line` actually inspected. For missing behavior, anchor the responsible implementation and identify the absent check or test. For diff review, point to the changed location responsible for the regression and link other evidence as needed.
- State the trigger, evidence, impact, and smallest useful remedy. Explain why the impact warrants the severity. Do not claim a reproduction, test run, or exhaustive search that did not happen.
- Deduplicate repeated symptoms by root cause. Include representative anchors and the verified affected scope, not an invented total.

### Tests and Automated Gates

Automation reduces repetitive review work; it does not erase failures.

- Record relevant commands or CI checks as `passed`, `failed`, `not run`, or `unavailable`, with the snapshot and environment when material. A configured job is not proof that it ran or is required.
- Summarize routine lint/typecheck diagnostics once. Retain failed gates and their consequences; avoid duplicating a gate failure as many manual findings.
- A passing check is evidence only for the behavior and matrix it actually covers. Inspect tests rather than treating a green build as proof of correctness.
- Attribute failures to the change only with evidence. Report pre-existing failures separately instead of silently ignoring them or blaming the change.
- With an established test suite, identify the concrete changed behavior left unprotected, especially a bug fix without a regression test. Respect explicit project test requirements. Do not demand tests merely because a line changed.
- Without test infrastructure, record the validation gap and available manual evidence once; do not introduce a framework as part of review.

## Severity and Decision

| Severity | Meaning |
|---|---|
| CRITICAL / P0 | Severe security compromise, major data loss, or widespread service failure with an established trigger |
| HIGH / P1 | Substantial correctness, security, compatibility, or reliability impact under supported conditions |
| MEDIUM / P2 | Bounded behavioral impact or a demonstrated design, testing, or maintenance problem |
| LOW / P3 | Small but actionable issue with concrete impact |

Use impact, reachability, affected users/data, and recovery cost to justify severity. A security label does not automatically make a finding CRITICAL. Do not lower severity because a consequence is serious but still unverified; record the missing evidence separately.

For local and PR reviews, apply these decisions in order:

| Verdict | Condition |
|---|---|
| BLOCK | A confirmed CRITICAL/HIGH issue, or an unmet mandatory acceptance requirement attributable to the change |
| INCOMPLETE | No confirmed blocker, but requested coverage or evidence necessary for a decision is missing |
| WARNING | No blocker or decision-critical gap, but MEDIUM findings remain |
| PASS | The declared review scope is covered and only LOW findings or no findings remain |

Record coverage independently as `complete` or `partial`, including with BLOCK. Explicit project acceptance rules may change the decision; cite the rule and preserve the finding's severity. A verification gap is not a confirmed violation. An optional check not run need not make a static review incomplete, but PASS on static inspection never asserts CI success or production readiness.

The verdict is advice, not authorization to merge, approve, request changes, or publish. Repository audits use priorities and coverage rather than a merge verdict. Zero findings is valid; zero findings with partial coverage is not an unqualified PASS.

## Output Format

Use the same evidence fields in all modes. Keep uncomplicated findings concise; omit empty optional sections.

```text
[HIGH][Defect] Replay of a payment callback credits the account twice
Location: src/payments/callback.ts:48
Trigger: The provider delivers the same event twice, as allowed by its retry contract.
Evidence: Both requests reach creditAccount; the event ID is neither recorded nor protected by a unique constraint in the inspected write path.
Impact: A retry changes the balance twice, causing a substantial financial correctness failure.
Fix: Deduplicate the event atomically with the balance update.
Verify: Deliver the same event twice and assert one balance change.
```

For a code-health finding, replace a runtime trigger with the supported maintenance or usage scenario. For a policy finding, cite the requirement. `Verify` describes a proposed check unless its execution is explicitly recorded.

Close local and PR reports with:

```text
Scope: <mode, base/head or working-tree/index snapshot, paths>
Coverage: complete | partial; <exclusions or sampled areas>
Checks: <command/check, result, relevant environment>
Findings: CRITICAL <n>, HIGH <n>, MEDIUM <n>, LOW <n>
Verification gaps: <missing evidence and next check, or none>
Verdict: BLOCK | INCOMPLETE | WARNING | PASS
```

For PRs, pin evidence links to the full reviewed commit SHA: GitHub uses `/blob/FULL_SHA/path#Lx-Ly`; Gitea uses `/src/commit/FULL_SHA/path#Lx-Ly`. Recheck the head before authorized posting; if it changed, review the delta before asserting that the report applies to the new head. Do not link local-only content as if it existed on the remote.

The repository audit template is in `repository-audit.md`.

## Dead Code

Report orphaned code when reachability evidence and a concrete maintenance, permission, dependency, or behavior cost are established. Search the supported entry points, registrations, build variants, generated consumers, and framework discovery paths.

No in-repository caller does not prove that a public library API, plugin hook, CLI command, or externally invoked route is dead. Preserve compatibility obligations and side effects such as module initialization or destruction. Unverified candidates belong in verification gaps, not removal instructions. Review does not authorize deletion.

## Sources and Adaptation

These sources inform the policy; their organization-specific procedures are not automatic project requirements. Explicit repository rules and user scope govern acceptance.

- [Google: review standard](https://google.github.io/eng-practices/review/reviewer/standard.html)
- [Google: what to review](https://google.github.io/eng-practices/review/reviewer/looking-for.html)
- [Microsoft ISE: reviewer guidance](https://microsoft.github.io/code-with-engineering-playbook/code-reviews/process-guidance/reviewer-guidance/)
- [Microsoft ISE: learning from review outcomes](https://microsoft.github.io/code-with-engineering-playbook/code-reviews/evidence-and-measures/)
