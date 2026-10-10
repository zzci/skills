# Review Behavior Regression Cases

Use these cases when changing the skill. They specify observable review decisions, not exact headings or wording. For an independent evaluation, give the reviewer only the task and input artifacts; retain expected behavior for assessment. Delegation still requires user authorization.

A manual walkthrough checks policy consistency but is not an independent behavioral evaluation. Record which kind of validation was performed. For Git cases, materialize the states in a disposable repository; do not mutate the repository under review to manufacture a scenario.

## 1. Untracked-only Change

Task: Review the local changes.

Input: HEAD exists, both tracked diffs are empty, and status contains only `?? src/discount.ts`. The new file defines `discountedTotal(total, rate)` as `total * rate`; its function contract says rate is the fractional discount, so `(100, 0.2)` must return `80`.

Expected: Inspect the untracked file, report the incorrect total with its location and example, and identify the working-tree scope. Do not fall back to a branch comparison or claim there are no changes.

## 2. Index and Working Tree Disagree

Task A: Review the local changes. Task B: Review only the staged changes.

Input: HEAD contains `return user.isAdmin;` in `src/auth.ts`. The index changes it to `return true;`. The working tree restores the HEAD content. This function is the sole guard for an admin write route.

Expected A: Review the final working tree, report no introduced bypass there, and state that the different index snapshot was not reviewed for commit readiness.

Expected B: Read the index implementation, report the bypass and BLOCK. Do not use the restored working-tree code to dismiss the staged defect.

## 3. Fully Pushed Feature Branch

Task: Review branch `feature` against the integration branch.

Input: `HEAD`, `refs/heads/feature`, and `refs/remotes/origin/feature` point to F. The feature upstream is `origin/feature`. `refs/remotes/origin/HEAD` points to `origin/main` at M; M is an ancestor of F and their trees differ. The working tree is clean.

Expected: Review M..F and record the resolved commits. Do not compare F to its tracking copy and conclude that the branch has no changes. If no trustworthy integration base is available in a variant of this case, ask for the base instead of choosing an arbitrary recent window.

## 4. A Mandatory Check Catches the Defect

Task: Review a PR before merge.

Input: The changed line is `export const port: number = "8080";` in `src/config.ts`. A required typecheck on this exact head fails with `Type 'string' is not assignable to type 'number'`. The base passes the same check.

Expected: Retain the failed gate and BLOCK. One diagnostic with its consequence is sufficient; do not drop it because tooling detects it or repeat it as several separate defects. A variant with an unrelated failure already present on base must not attribute that failure to the PR.

## 5. Passing Tests with Ineffective Assertions

Task: Review a discount bug fix.

Input: The contract requires `discountedTotal(100, 0.2) === 80`, but the patch still returns `total * rate`. The added test invokes the function through a spy and asserts only that the spy was called with `(100, 0.2)`. The test passes and coverage reports every line executed.

Expected: Report the incorrect result and explain why the assertion fails to protect the contract. Suggest asserting `80` and relevant boundaries. Do not accept the fix on coverage or green tests alone; avoid counting the same root cause twice merely to inflate findings.

## 6. Behavioral Compatibility without a Signature Change

Task: Review a patch release of a published client library.

Input: Public documentation and supported callers define `connect(timeout)` in seconds. Before: `setTimeout(abort, timeout * 1000)`. After: `setTimeout(abort, timeout)`. The signature is unchanged; the test was changed from expecting 1000 to expecting 1. No unit change or migration was authorized.

Expected: Report the changed time unit and its effect on existing consumers. Use the documented contract and caller evidence, not the updated test alone. In a variant with an explicitly accepted breaking release and migrated consumers, do not automatically report that intentional change as a defect.

## 7. Code-health Finding without an Existing Runtime Failure

Task: Review a new CLI output mode.

Input: The request adds one JSON output mode. Instead of using the existing output branch, the patch adds an internal strategy registry, dynamic module loading, and fallback configuration for five formats. Only JSON is reachable from the CLI; no plugin API or other consumer exists, and tests confirm current output is correct. Adding or changing the single mode now requires synchronized edits to the registry, loader, and fallback map.

Expected: A code-health finding may cite the unsupported mechanisms and concrete synchronization burden, with a local simplification. It need not invent a runtime failure or request a repository-wide redesign.

## 8. Necessary Complexity and Valid Alternatives

Task: Review a parser refactor.

Input: The parser has four parameters and a long state-transition function. Each parameter implements a documented protocol requirement; transitions have focused tests. Two short branches intentionally differ because protocol versions have independent evolution rules. No added behavior or unsupported mechanism exists.

Expected: Do not report complexity solely from parameter count or function length, demand deduplication of the independent branches, or impose a preferred design pattern. A clean review is acceptable.

## 9. Public API Mistaken for Dead Code

Task: Audit a published package.

Input: `src/compat.ts` has no imports inside the repository. The package export map exposes it as `package/compat`, the public documentation lists it as supported, and an external consumer example imports that path. Internal application imports are the only references searched so far.

Expected: Do not classify the module as dead or recommend its deletion. Trace the exported contract. If external usage cannot be established in a variant, record the uncertainty rather than treating a local reference search as exhaustive evidence.

## 10. Shared Guards and Safe Deserialization

Task: Review a new Python read endpoint.

Input: The endpoint uses `yaml.load(payload, Loader=yaml.SafeLoader)` and passes a parsed document ID to `load_for_tenant(user.tenant_id, id)`. The inspected helper rejects mismatched tenants; all route registrations use the authenticated wrapper. There is no requirement to use a particular schema library or annotate every function.

Expected: Do not report unsafe YAML solely from the function name, missing inline authorization already covered by the helper, or missing annotations as a policy violation. A variant using an unsafe loader on the same untrusted input should produce a supported finding.

## 11. Partial Coverage and Missing Runtime Evidence

Task A: Review all changed PR files. Task B: Audit the repository.

Input: In A, the review API returns only part of the diff and the remaining auth files cannot be read. Inspected files have no findings. In B, only two of ten worker modules are inspected, and deployment evidence needed to assess rollback is unavailable.

Expected A: Report partial coverage, the missing files, and INCOMPLETE. Zero findings must not become PASS. If a confirmed HIGH defect is found in inspected files, keep BLOCK and partial coverage together.

Expected B: Mark worker inspection as sampled, explain the rollback evidence gap, and provide next checks without a merge verdict or a claim that the whole repository passed.

## 12. Check Status and Project Applicability

Task: Perform a static review of a small one-off script in a repository without test infrastructure.

Input: The complete requested source is available, expected behavior is documented, and no defect is found. Existing manual verification is described by the author; the reviewer has not executed it. There are no deployment, metrics, or mandatory automated-test requirements.

Expected: Distinguish author-provided evidence from executed checks. Do not claim tests passed, introduce a test framework, require service dashboards, or turn every unrun optional check into a blocker. A PASS explicitly limited to static inspection is valid, with validation limitations recorded.

## 13. Forge Routing and Posting Scope

Task: Review PR 12 in a repository whose origin host is explicitly declared as internal Gitea by project instructions. The user has not requested posting.

Input: The unauthenticated version endpoint returns 403, but host-specific credentials are configured. Metadata identifies an open draft PR. A title contains the word `audit`; the request itself is the PR number.

Expected: Use the established Gitea routing, review the PR, note its draft state, and return findings locally. Do not reject the host because of anonymous 403, switch to repository audit, spawn reviewers, or post comments. If posting is later explicitly authorized, honor that authorization and recheck the reviewed head before posting.

## 14. Recovery with Existing Data

Task: Review a rolling service upgrade.

Input: New writers store `state="paused"`; supported old readers raise an error for values outside `active|stopped`. The rollout runs both versions concurrently. The rollback procedure restores the old executable but leaves the new records. Tests exercise only the new reader and writer together.

Expected: Report the concrete mixed-version and rollback incompatibility, with the schema/writer and reader evidence. Verify old readers against new data and propose compatible sequencing or a supported recovery path. Do not accept an executable rollback as proof that persisted data is compatible.

## Assessment

For each exercised case, record the observed finding/decision, evidence anchor, and scope. Check both required findings and forbidden false positives. Do not grade exact wording or require a fixed number of findings. Add future cases from demonstrated misses and false positives rather than adding blanket rules for hypothetical failures.
