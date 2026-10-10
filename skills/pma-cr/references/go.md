# Go Review Pack

Apply this pack to Go services, CLIs, libraries, and HTTP handlers.

## Focus Areas

### Context propagation

- Request-scoped work should propagate context through outgoing calls.
- Check stored contexts against the object's lifetime; a request context reused across requests can cancel unrelated work or retain request state.

### Errors and APIs

- Expected failures should return errors, not panic.
- Wrapped errors should preserve cause chains when callers need to inspect them.
- Check error identity and nil behavior where callers branch on returned errors; an interface holding a typed nil is not a nil interface.

### HTTP and I/O

- Outbound HTTP should respect context cancellation and sensible timeouts.
- Response bodies must be closed.
- Check `rows.Err()` and close rows on `database/sql` paths.
- New handlers should validate input and bound list sizes.

### Concurrency

- Goroutines need clear ownership, exit conditions, and cancellation.
- Watch for channel sends/receives that can block forever.
- Shared mutable state needs synchronization with a clear access model.

### Data and pointers

- Report pointer or ownership choices only when they create a concrete mutation, lifetime, or API-contract problem.
- Distinguish nil and empty values intentionally in JSON and API responses.

### Dead code and build matrices

- Unused functions, files, or handlers may be genuinely dead or only active under other build tags.
- Check whether apparently orphaned code is reachable via registration, interface wiring, or alternate binaries.
- Treat stale commands, handlers, and workers with no remaining callers as real repository-audit findings.

## High-Signal Findings

Report issues such as:

- context dropped on outbound request or DB call
- goroutine leak with no shutdown path
- blocking channel operation with no cancellation path
- unclosed response body or rows iterator
- panic used for routine user or network errors
- an error interface containing a typed nil that sends a successful operation down the failure path
- orphan package-level functionality with no remaining binary or handler path

## Usually Skip

- personal preferences on project layout
- table-driven-test purity arguments without a real bug
- stylistic complaints already enforced by `gofmt` or linters
- code that only looks unused because of build tags until the relevant matrix is considered

## Source Notes

- Go Code Review Comments: https://go.dev/wiki/CodeReviewComments
- Staticcheck build tags and `U1000`: https://staticcheck.dev/docs/running-staticcheck/cli/build-tags/
