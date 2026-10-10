# Repository Audit Pack

Use this pack for the current repository rather than a diff. Apply `core-review-policy.md` and `engineering-baseline.md`; load stack packs only for relevant areas.

## 1. Inventory and Scope

Record the reviewed commit and relevant local changes, requested directories, exclusions, and supported runtime/build variants. Inventory:

- manifests, lockfiles, build scripts, CI, and release configuration
- application/service entry points and externally consumed library APIs, routes, plugins, or commands
- architecture decisions, public contracts, schema/migrations, and operational documentation
- test suites, critical behavior they cover, and quality gates with actual results when available

Use the inventory to establish applicability. A library needs consumer compatibility checks; a deployed service may also need rollout and recovery checks. Do not impose a full service checklist on every repository.

## 2. Map Boundaries and Select Hotspots

Trace important flows across modules, not just suspicious functions:

- user-visible behavior and contracts through UI, API, domain logic, and storage
- ownership of shared state, business invariants, transactions, and cleanup
- authentication, object/tenant permissions, validation, and external calls
- database writes, migrations, background jobs, retries, and shutdown
- filesystem/process access, configuration, sensitive data, and release privileges
- public interfaces, supported consumers, dependency direction, and repeated sources of maintenance errors

Prioritize by impact and reachability. Record why areas were selected and whether the review is representative sampling or complete within the declared scope.

## 3. Inspect and Verify

Read representative end-to-end paths deeply before expanding coverage. For each applicable area, apply the shared baseline and relevant runtime pack:

- verify behavior and failure handling against the actual contract
- examine the design consequence of coupling, unclear ownership, or unnecessary mechanisms
- read critical assertions and mocks; determine what the tests establish and what remains unverified
- inspect supported compatibility, migration, resource bounds, and recovery paths
- inspect relevant build/CI/release logic and distinguish configured checks from executed checks

Maintain a compact coverage record. Use `inspected`, `sampled`, `not reviewed`, or `not applicable`; give paths, evidence, or the reason. Reading manifests alone does not count as inspecting the implementation. Lack of runtime access should identify the exact question it prevents answering, not invalidate all static findings.

### Dead-code Inspection

Check incoming references, entry-point registration, exported contracts, dynamic imports, reflection, framework routing, generators, build tags/features, and initialization/destruction side effects. Lack of in-repository callers is insufficient for public interfaces.

Confirmed orphaned code with a demonstrated cost belongs among prioritized findings. Likely unused code with unresolved external or dynamic consumers belongs in verification gaps, with the next check. Do not list the same issue again in a separate dead-code section or recommend deletion before these obligations are understood.

## 4. Deduplicate and Prioritize

Group findings by root cause rather than file count. A shared authorization flaw affecting ten verified handlers is one finding with representative anchors and the affected scope. Do not claim all handlers are affected based on two samples.

Use the canonical CRITICAL/P0 through LOW/P3 definitions. Keep confidence, severity, and coverage separate:

- confirmed findings require an inspected location, supporting evidence, concrete impact, and a remedy
- missing runtime facts or uncertain reachability belong in verification gaps
- absent tests are a testing/validation gap unless a concrete affected behavior or explicit project requirement supports a finding
- architecture criticism needs a specific dependency, ownership, contract, or maintenance consequence
- existing bugs are in scope for an audit; cosmetic preferences and speculative rewrites are not

## Report Skeleton

Use priorities rather than a merge verdict. State the strongest confirmed risks and the limits of the assessment. Omit empty priority sections; a zero-finding audit still needs its scope and coverage record.

```markdown
## Repository Audit Summary

Snapshot: <commit and local changes>
Scope: <requested areas, exclusions, supported variants>
Coverage: <complete within declared scope or partial; sampling limits>
Checks: <command/CI check, result, relevant environment>

### P1

[HIGH][Defect] <title>
Location: <inspected file:line>
Trigger: <supported input/state or operating condition>
Evidence: <path from trigger to failure, including relevant guards/tests>
Impact: <consequence and severity rationale>
Fix: <smallest useful correction>
Verify: <targeted reproduction or acceptance check; state if already run>

### Coverage

| Area | Status | Evidence or limitation |
|---|---|---|
| Contracts and module boundaries | inspected | <entry points, consumers, paths> |
| Data writes and migrations | sampled | <paths examined and remaining areas> |
| Critical tests | inspected | <assertions/flows reviewed and execution status> |
| Production recovery | not reviewed | <missing deployment evidence and next check> |
| Browser interaction | not applicable | <repository has no browser interface> |

### Verification Gaps

- <unknown premise, why it matters, and how to verify it>

### Recommended Next Actions

1. <address confirmed priority finding>
2. <resolve a decision-relevant verification gap>
```

Adapt coverage rows to the actual repository. Do not invent paths or fill the table with irrelevant categories. Use the shared finding fields for code-health and policy findings as well. Separate suggested checks from checks actually performed.

## Sources

- [Google: review scope and system context](https://google.github.io/eng-practices/review/reviewer/looking-for.html)
- [Microsoft ISE: design review](https://microsoft.github.io/code-with-engineering-playbook/design/design-reviews/)
- [Kubernetes: production readiness](https://github.com/kubernetes/community/blob/master/sig-architecture/production-readiness.md)
