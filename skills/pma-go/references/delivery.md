# PMA-Go Delivery

## Lint And Static Checks

- use `.golangci.yml` for shared lint rules — start from the starter below
- every linter added beyond the starter's `enable` list needs a one-line justification in the PR that adds it
- fail on real issues, not style noise; suppress false positives with scoped exclusion rules, not by disabling the linter

### `.golangci.yml` starter (golangci-lint v2)

```yaml
version: "2"

run:
  timeout: 5m

linters:
  default: none
  enable:
    - govet
    - staticcheck
    - errcheck
    - revive
    - gosec
    - misspell
    - ineffassign
    - unused
    - gocritic
  exclusions:
    generated: lax          # skip generated code (sqlc output, etc.)
    rules:
      - path: _test\.go     # relax security/error-check noise in tests only
        linters: [gosec, errcheck]

formatters:
  enable:
    - gofmt
    - goimports
```

Keep exclusions narrow and path-scoped; a repo-wide linter disable is a decision, not a convenience.

## Testing

- default to table-driven tests
- keep tests close to the package they verify
- add integration tests for DB or HTTP behavior when unit tests alone are insufficient
- use coverage as a signal, not as a substitute for meaningful assertions

## Task Runner

Prefer `Taskfile.yml`, wiring the gate commands from `baseline.md` *Required Quality Gates*:

```yaml
version: "3"

tasks:
  fmt:
    cmds: [goimports -l -w .]
  lint:
    cmds: [golangci-lint run]
  vet:
    cmds: [go vet ./...]
  test:
    cmds: [go test -cover ./...]
  build:
    cmds: [go build ./...]
  tidy-check:
    cmds:
      - go mod tidy
      - git diff --exit-code go.mod go.sum
  check:
    desc: run all gates in order
    cmds:
      - task: fmt
      - task: lint
      - task: vet
      - task: test
      - task: build
      - task: tidy-check
```

Add `generate` (sqlc) and `migrate` (goose) tasks when the project uses them. Keep task names predictable and aligned with CI.

## Security Patterns

Review:

- input validation
- SSRF risk on outbound HTTP
- constant-time secret comparison
- auth and permission boundaries
- secret redaction in logs

## Pre-Commit Security Checklist

- no hardcoded secrets
- all user input validated
- no unsafe outbound HTTP behavior
- no sensitive error leakage
- no auth regression on changed endpoints

## CI Pipeline

Typical stages:

- format
- lint
- vet and static checks
- test
- build
- security review

## Git Conventions

- English for commit messages and all remote-visible metadata
- conventional commits format
- no AI-assistant or agent mentions in commit messages, PR text, or other remote-visible content

## Review Focus

Prioritize:

- correctness
- regression risk
- context propagation
- cancellation and resource lifetime
- missing tests around changed behavior
