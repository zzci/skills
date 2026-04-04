# PMA-Bun Delivery

## Hooks And Tooling

- keep lint and typecheck fast enough for frequent local runs
- use post-tool or stop hooks only when the repository already standardizes on them
- avoid hook logic that mutates code unpredictably

## Security Patterns

Review these areas before merge:

- password hashing
- constant-time secret comparison
- rate limiting for public endpoints
- CSRF protection when serving browser-facing state-changing routes
- XSS avoidance by rejecting raw HTML injection paths
- secret redaction in logs

Pre-commit checklist:

- no hardcoded secrets
- all user inputs validated
- SQL injection blocked through parameterized access
- auth and authorization checked
- rate limits applied where needed
- error messages do not leak internals

## Observability

Adopt only when the deployment context needs it.

Recommended shape:

- OpenTelemetry for traces and metrics
- pino logs with request correlation
- health endpoint for liveness

## CI Pipeline

Typical jobs:

- lint
- test
- build

If the project needs security audit or DB bootstrap jobs, keep them explicit and reproducible.

## Docker

When containerizing:

- use reproducible Bun images
- copy only necessary build inputs
- set non-root execution where possible
- keep env injection external to the image

## Workspaces

For monorepos:

- keep workspace boundaries explicit
- centralize shared configs
- avoid hidden cross-package imports

## Git Conventions

- use English remote-visible metadata
- use conventional commits
- keep PR summaries short and test plans explicit

## API Review Checklist

Before merge, verify:

- request and response schemas match behavior
- docs match runtime validation
- error mapping is consistent
- auth boundaries are explicit
- migration impact is understood
