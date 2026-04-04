# PMA-Bun Data And Testing

## Database Default: Drizzle Plus bun:sqlite

Prefer this for:

- single-instance services
- local-first tools
- CLIs
- small internal APIs

Rules:

- keep schema in `src/db/schema.ts`
- keep DB initialization and migration wiring in `src/db/index.ts`
- use WAL mode when appropriate
- commit generated SQL migrations

## PostgreSQL Alternative

Use PostgreSQL when the service needs:

- multi-instance writes
- richer concurrent access patterns
- shared database infrastructure
- more advanced query characteristics than the default SQLite setup supports

Keep the swap explicit in docs, scripts, and CI.

## Repository Pattern

- repositories own persistence details
- services own business logic
- route handlers coordinate transport only
- keep DB-specific types from leaking through the application without intent

## Testing

Use:

- unit tests close to modules with `*.test.ts`
- integration tests under `tests/integration/`
- Playwright only when browser-level coverage is required

Rules:

- prefer real dependencies over fragile mocks when feasible
- restore mocks after each test
- keep tests independent
- run coverage in CI and target roughly 80 percent or higher

## Test Boundaries

- validate route input and error translation at the edge
- test repositories against real schema behavior where practical
- test service logic without coupling everything to HTTP transport
