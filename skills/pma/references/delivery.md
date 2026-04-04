# PMA Delivery Rules

## Shell And Process Management

- Prefer `bash` for command execution.
- Always use tmux for dev servers, test servers, and long-running processes.
- Tmux session name:

```bash
echo $(basename "$PWD" | tr '.' '-')-$(echo -n "$PWD" | md5sum | cut -c1-6)
```

- Before starting a server, check `tmux has-session -t NAME` first.
- Do not kill ports as the first approach.
- Never use `kill $(lsof -ti:PORT)` without `-sTCP:LISTEN`.

## Git Conventions

- Use English for commits, PR titles, PR descriptions, and all remote-visible metadata.
- Do not mention assistants or model names in remote-visible content.
- Use conventional commits: `<type>: <description>`.

## Pull Request Workflow

Before creating or updating a PR:

1. Review the full diff from the branch point.
2. Run code review focused on correctness, regressions, and missing tests.
3. Run a security review.
4. Ensure build passes.
5. Ensure lint passes.
6. Ensure tests pass.

PR body format:

```markdown
## Summary
- ...

## Test plan
- [ ] ...
```

## PR Review Checklist

- all review and security checks pass
- build, lint, and tests pass
- commit history is clean
- task and plan state are synced
- changelog updated if required

## CI Pipeline

Standard stages:

```text
format/lint -> static checks -> build -> test -> security review
```

CI commands come from the active stack skill or existing project scripts.

## GitHub Actions Conventions

- workflows live in `.github/workflows/`
- pin actions to full SHAs
- run on `pull_request` and `push`
- align cache and toolchain setup with the active project stack

## Tools And Security

- Never skip checks with `--no-verify`.
- Stop and escalate when a serious security issue is found.
- Review auth, secrets, outbound HTTP, and config changes with extra scrutiny.
