# Python Review Pack

Apply this pack to Python services, CLIs, libraries, and async applications.

## Focus Areas

### Input validation and trust boundaries

- All external input should be validated at the edge: request bodies, query params, headers, webhook payloads, queue messages.
- Verify the actual runtime validators and coercion rules; a type annotation or data-class declaration alone does not validate input.
- Check the actual loader and input trust level for pickle, YAML, or dynamic evaluation. `yaml.load` with a safe loader is not evidence of unsafe deserialization.

### Query and command safety

- User input must not be interpolated into SQL, shell commands, or filesystem paths.
- Use parameterized queries for all database access.
- Use `subprocess` with list arguments, never `shell=True` with user-controlled input.
- Watch for path traversal via `os.path.join` with absolute user input.

### Auth and permissions

- Authentication is not authorization.
- Read and write endpoints need the relevant object, field, and tenant permission checks, possibly enforced by verified shared guards.
- Decorator-based auth should be verified on every new route, not assumed by convention.

### Async correctness

- Blocking I/O in async functions starves the event loop.
- Detached `asyncio` tasks need lifetime ownership and exception observation; keeping a task reference alone does not handle its failure.
- Outbound HTTP should have timeout configuration.
- Watch for mixing sync and async database drivers incorrectly.

### Error handling

- Bare `except:` or `except Exception:` that swallows errors silently is a defect.
- Avoid returning `None` as an implicit error signal when the caller cannot distinguish it from a valid result.
- Do not log secrets, tokens, or raw credentials in exception handlers.

### Type safety

- Apply the project's annotation policy. Report missing hints as a policy violation only when required; otherwise identify a concrete boundary or misuse rather than asking for annotations by default.
- `Any` should not be used to silence type errors on well-typed boundaries.
- Optional fields need explicit `None` handling, not implicit attribute access.

### Dead code and stale modules

- Look for modules, views, management commands, or Celery tasks with no remaining registrations or callers.
- Stale feature flags and superseded migration paths often leave dead write paths behind.
- Beware of false positives from dynamic imports, decorator-based registration, and Django URL autodiscovery.

## High-Signal Findings

Report issues such as:

- `pickle.loads` or an unsafe YAML loader consuming untrusted input
- string-formatted SQL or shell commands
- missing object or tenant permission checks on new read or write endpoints
- blocking I/O inside async handlers
- bare exception swallowing with no logging or re-raise
- unbounded queries without pagination or limits
- orphan views, tasks, or management commands with no remaining callers

## Usually Skip

- PEP 8 style nits already enforced by formatters (black, ruff)
- personal preferences on project structure
- broad "add type hints everywhere" on unchanged legacy code
- code that only looks unused because of dynamic registration or framework autodiscovery

## Source Notes

- OWASP Input Validation Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
- OWASP SQL Injection Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html
- OWASP OS Command Injection Defense Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html
- OWASP Deserialization Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Deserialization_Cheat_Sheet.html
- Bandit security linter: https://bandit.readthedocs.io/en/latest/
- mypy documentation: https://mypy.readthedocs.io/en/stable/
