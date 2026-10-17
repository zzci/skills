# Engineering Review Baseline

Read this baseline in every review mode, then apply only checks relevant to the change or audited area. Use `core-review-policy.md` for evidence, severity, and reporting. This baseline is independent of PMA implementation workflows.

## Intent and Contracts

- Establish expected behavior from the request, acceptance criteria, relevant design decisions, public documentation, and existing consumers. Tests are evidence, not the sole definition of correctness.
- Follow a representative path from entry point to observable result. Check normal input, boundaries, failures, and state transitions that matter to the change.
- Identify non-goals and compatibility obligations. Do not invent business requirements or block a focused improvement on unrelated debt.
- If competing interpretations materially change correctness, state the assumption or missing contract. Continue reviewing independent areas.

## Design, Complexity, and Ownership

- Check whether responsibilities and dependency direction fit the existing system. Trace concrete coupling: circular dependencies, domain rules split across entry points, or a shared abstraction that now depends on one consumer's internals.
- Identify who owns mutable state, validation, transactions, cleanup, and error recovery. Multiple owners or an implicit caller obligation can be a problem even before a production incident.
- Check whether a new abstraction or option serves a present requirement. Show the unused mechanism and its cost; do not require interfaces, service layers, or configurability by default.
- Distinguish shared business invariants from incidental textual duplication. Consolidation is useful when one rule must stay consistent, but can be harmful when superficially similar behaviors evolve independently.
- Report readability problems when names, control flow, or hidden side effects obscure an actual contract. Function size and parameter count are prompts to inspect, not automatic findings.
- Accept equally valid designs and necessary complexity. Prefer a remedy local to the change over an unrelated redesign.

## Correctness and Data Integrity

- Check invariants before and after writes, including partial failures. Validate transaction boundaries, constraints, commit errors, duplicate requests, and concurrent updates where relevant.
- Trace state transitions rather than only individual conditions. Consider out-of-order messages, stale reads, cancellation between side effects, and retry after a response is lost.
- For migrations, inspect existing data assumptions, old/new readers and writers, lock or rewrite cost, and a feasible recovery path. Do not assume reversing a migration can restore deleted data.
- Check numeric units, precision, time zones, ordering, null/empty semantics, and boundary values when they are part of the contract.
- For files and processes, inspect atomicity, path resolution, exit status, cleanup, and user-visible failure behavior.

## Trust Boundaries

- Trace untrusted data through validation to its use, including external APIs, queue messages, and stored data. Types and syntactic parsing alone do not establish authorization or business validity.
- Verify object, field, function, and tenant permissions on reads, searches, exports, and writes. Include cache keys and background execution identities when they affect isolation.
- Check injection and unsafe deserialization at the actual sink. Parameterization, safe loaders, escaping, and path or URL restrictions must match the context; pattern matches alone are not findings.
- For relevant flows, inspect session/token validation, expiry and revocation, webhook authenticity and replay handling, CSRF, browser output encoding, and outbound URL redirects.
- Trace sensitive data into logs, errors, client payloads, and artifacts. Report locations and exposure paths without reproducing secrets.

## Tests as Evidence

- Read new and affected tests. Would an incorrect implementation or the original bug fail the assertions? Assertions about observable results are stronger than checking only mocked calls or reproducing the implementation's calculation.
- Select unit, integration, contract, or end-to-end evidence according to the boundary under test. A mocked database cannot establish that a real migration or uniqueness constraint works.
- Check realistic boundary and failure cases: denied access, malformed input, duplicate execution, cancellation, or partial writes, as applicable. Do not demand every test type for every change.
- Verify fixtures and mocks match real interfaces and failure behavior. Look for leaked global state, order dependence, real-time sleeps, and uncontrolled network or clock dependencies.
- Review the tests' own clarity and complexity. Passing counts and line coverage do not prove meaningful assertions or covered input combinations.
- For refactors, verify preserved behavior with existing or targeted checks. Record a validation gap when adequate evidence is unavailable; follow the project's testing policy rather than imposing a new framework.

## Compatibility and Evolution

- Inventory affected consumers, including external consumers of exported APIs. Check source compatibility, binary compatibility where applicable, and behavioral compatibility separately.
- Examine defaults, validation strictness, error types/statuses, ordering, units, serialization, CLI flags/output/exit codes, environment variables, and configuration keys. An unchanged signature or a bug fix can still break callers.
- Check schema and protocol changes against supported clients, persisted data, and mixed-version deployments. A new required field or enum value may be incompatible with existing consumers.
- Respect the project's version and deprecation policy. An intentional breaking change with an accepted migration plan is not automatically a defect.
- Verify that documented examples, API specifications, and build/run instructions affected by the behavior change remain accurate. Report necessary updates to existing contract documentation; do not demand unrelated documents or an ADR for every edit.

## Performance and Production Operation

Apply operational checks to affected services, jobs, deployments, and resource-intensive paths. Do not impose a service operating model on a small library or one-off script.

- Ground performance findings in input growth, supported load, query counts/plans, allocations, blocking operations, or measurements. Avoid speculative micro-optimization; request a targeted measurement when the outcome is unknown.
- Check bounds on work, payload size, queues, fan-out, and resource lifetime. Trace deadline/cancellation propagation and retry budgets, including whether retries duplicate side effects or amplify an outage.
- For rollout-sensitive changes, examine mixed versions, feature enable/disable behavior, rollback or forward recovery, and what happens to already-written data. State deployment assumptions.
- Verify that operators or users can detect and diagnose the relevant failure using existing status, errors, logs, or metrics. Do not require every observability mechanism; confirm the chosen signal is actually wired up.
- When dependency, build, CI, or release files change, inspect reproducibility, supported runtime versions, privileges, untrusted inputs, secret access, and artifact origin. An advisory needs a matching dependency version and affected use; distinguish a vulnerable dependency from a demonstrated application exploit. A new dependency, toolchain, or base image added below its latest stable version, or a superseded technology chosen for new code, needs a recorded reason (user request or a concrete compatibility problem); without one, report it as a maintenance finding.

## Reviewability and Scope

- Prefer self-contained changes with related tests. Explain when unrelated formatting or refactoring hides behavioral changes or makes rollback harder; do not enforce a universal line limit.
- For UI changes, inspect or exercise the relevant interaction when feasible: keyboard/focus behavior, loading/error/empty states, stale responses, and recovery. Say when visual or interactive behavior was not verified.
- Changed generated output may require inspecting its generator and contract. Do not count scanning generated files as reviewing the source behavior.

## Sources and Applicability

Adapt these public practices to the repository. They are not a claim of organization-wide certification or a requirement to adopt another project's approval process.

- Design, complexity, tests, and documentation: [Google review guidance](https://google.github.io/eng-practices/review/reviewer/looking-for.html).
- Cohesive changes: [Google small changes](https://google.github.io/eng-practices/review/developer/small-cls.html).
- Business logic and design pass: [Microsoft ISE reviewer guidance](https://microsoft.github.io/code-with-engineering-playbook/code-reviews/process-guidance/reviewer-guidance/).
- Tests beyond coverage: [Microsoft ISE testing example](https://microsoft.github.io/code-with-engineering-playbook/automated-testing/unit-testing/authoring-example/).
- Compatibility categories, adapted beyond .NET: [Microsoft library guidance](https://learn.microsoft.com/en-us/dotnet/standard/library-guidance/breaking-changes).
- Safe operation and recovery, adapted to relevant services: [Kubernetes production readiness](https://github.com/kubernetes/community/blob/master/sig-architecture/production-readiness.md) and [KEP questionnaire](https://github.com/kubernetes/enhancements/blob/master/keps/NNNN-kep-template/README.md#production-readiness-review-questionnaire).
- Technical security controls: [OWASP ASVS](https://github.com/OWASP/ASVS), latest release. If mapping a finding to ASVS, verify and include the versioned requirement ID from that release; this baseline is not a complete ASVS assessment.
- Pipeline boundaries: [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use).
