# PMA-Bun Runtime

## Formatting And TypeScript

- Use `@antfu/eslint-config`.
- Ignore generated artifacts such as `drizzle/**` when appropriate.
- Keep TypeScript in strict mode with `noUncheckedIndexedAccess`.
- Prefer `verbatimModuleSyntax`, `exactOptionalPropertyTypes`, and `import type` discipline.

## Scripts

Baseline scripts should usually include:

- `dev`
- `lint`
- `typecheck`
- `build`
- `test`
- `db:generate`
- `db:migrate`

Keep script names predictable across repositories.

## Error Handling

- Use an `AppError` hierarchy with HTTP status mapping.
- Convert internal errors to safe API responses at the edge.
- Never leak stack traces or internal DB details to clients.

## Configuration

- Load environment variables once.
- Validate them with Zod at startup.
- Inject validated config into app services; do not call `Bun.env` from domain logic.
- Keep `.env.example` complete and non-secret.

## ROOT_DIR And Compiled Mode

When the project supports compiled binaries:

- centralize root-directory detection in one module
- support explicit env override
- handle both source-tree and compiled-binary execution paths
- keep asset and migration lookup logic out of business modules

## HTTP Server With OpenAPIHono

Recommended shape:

- `app.ts` builds the OpenAPIHono app
- `index.ts` handles startup and shutdown
- `modules/docs` serves OpenAPI JSON and Scalar UI
- `modules/health` exposes a health endpoint
- domain routes stay in their own modules

Rules:

- keep route handlers thin
- validate input with Zod
- map domain errors centrally
- return a consistent response envelope where the product expects it
- use graceful shutdown for signals

## Vite Dev Integration

For Bun full-stack projects:

- keep the web dev integration in a dedicated `dev.ts`
- avoid leaking dev-server concerns into production bootstrap
- proxy or share only the routes that need local integration

## Logging

- use consola for human-readable development logs
- use pino for structured operational logs
- redact secrets
- attach correlation IDs when the service needs request tracing

## API Documentation

- prefer OpenAPI generation from route schemas
- serve interactive docs at `/docs`
- keep docs generation aligned with actual validation schemas

## Single-Binary Delivery

When using `bun build --compile`:

- replace stub modules for embedded assets and migrations during build
- keep compiled-only logic isolated
- document any feature gaps versus source-mode execution
