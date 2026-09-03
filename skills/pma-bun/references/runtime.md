# PMA-Bun Runtime

## Table of Contents

- [Formatting And TypeScript](#formatting-and-typescript)
- [Scripts](#scripts)
- [Error Handling](#error-handling)
- [Configuration](#configuration)
- [ROOT_DIR And Compiled Mode](#root_dir-and-compiled-mode)
- [Bootstrap Split](#bootstrap-split)
- [HTTP Server With OpenAPIHono](#http-server-with-openapihono)
- [OpenAPI Contract Rules](#openapi-contract-rules)
- [Middleware Stack](#middleware-stack)
- [Dev URL Routing (via nsl)](#dev-url-routing-via-nsl)
- [Logging](#logging)
- [API Documentation](#api-documentation)
- [PID Lock And Singleton Safety](#pid-lock-and-singleton-safety)
- [Single-Binary Delivery](#single-binary-delivery)


## Formatting And TypeScript

- Use `@antfu/eslint-config` (flat config) on ESLint 10.
- Ignore generated artifacts such as `drizzle/**` and `dist/**`.
- Keep TypeScript in strict mode with `noUncheckedIndexedAccess`.
- Prefer `verbatimModuleSyntax`, `exactOptionalPropertyTypes`, and `import type` discipline.
- Keep path aliases aligned with `tsconfig.json`; do not invent aliases that CI does not resolve.

### TypeScript 7 baseline

TypeScript 6 deprecated and TypeScript 7 removed several options. A project that still carries them fails `typecheck`:

- `baseUrl` is gone — write `paths` relative to the tsconfig (`"@/*": ["./src/*"]`)
- `moduleResolution: node` / `node10` / `classic` are gone — use `bundler`
- `types` now defaults to `[]` — list `"types": ["bun"]` explicitly or the Bun globals disappear
- `rootDir` is always the tsconfig directory; `strict` and `module: esnext` are the defaults
- `esModuleInterop` / `allowSyntheticDefaultImports` can no longer be `false`

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "target": "esnext",
    "lib": ["esnext"],
    "module": "preserve",
    "moduleResolution": "bundler",
    "types": ["bun"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "skipLibCheck": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src", "scripts", "drizzle.config.ts"]
}
```

TypeScript 7 ships no programmatic compiler API before 7.1; typescript-eslint and similar tools run through `@typescript/typescript6`. Keep `typescript` at 7 for `tsc --noEmit` and let `@antfu/eslint-config` resolve the shim it needs. Pin TypeScript 6 only when a tool has no shim path, and record the reason.

## Scripts

Baseline scripts should usually include:

- `dev`
- `lint`
- `typecheck`
- `build`
- `test`
- `test:coverage`
- `check`
- `db:generate`
- `start`
- `compile` (only when a binary ships)

Keep script names predictable across repositories.

## Error Handling

- Use an `AppError` hierarchy with HTTP status mapping.
- Convert internal errors to safe API responses in a single `app.onError` handler.
- Validation failures use the same error envelope: set it once through the `OpenAPIHono` `defaultHook` instead of per-route hooks.
- Publish the envelope as one shared `ErrorResponse` schema (`src/shared/errors.ts`) and reference it from every error status in `createRoute`.
- Never leak stack traces or internal DB details to clients.

## Configuration

- Load environment variables once.
- Validate them with Zod at startup.
- Inject validated config into app services; do not call `Bun.env` from domain logic.
- Keep `.env.example` complete and non-secret.
- Resolve file paths relative to a centralized root helper instead of scattering path joins across modules.

## ROOT_DIR And Compiled Mode

Centralize root-directory detection in `src/root.ts`:

- source mode: the project root, derived from `import.meta.dir` with an explicit `ROOT_DIR` env override
- compiled mode (`Bun.isStandaloneExecutable === true`): directories embedded with `--asset` live under `import.meta.dir` at their original relative path (`--asset ./drizzle` → `join(import.meta.dir, "drizzle")`) and are readable through `node:fs` and `Bun.file()`
- writable state (SQLite file, logs, PID lock) never lives next to embedded assets — resolve it from `DATA_DIR`

```typescript
// src/root.ts
import { join } from "node:path";

const source = process.env.ROOT_DIR ?? join(import.meta.dir, "..");

export const root = {
  // read-only assets embedded in the binary: drizzle/, web/dist
  asset: (...p: string[]) => join(Bun.isStandaloneExecutable ? import.meta.dir : source, ...p),
  // writable runtime state
  data: (...p: string[]) => join(process.env.DATA_DIR ?? join(source, "data"), ...p),
};
```

Keep asset and migration lookup out of business modules; `root.ts` is the only place that knows about compiled mode.

## Bootstrap Split

Recommended shape:

- `app.ts` bootstraps config, logging, db wiring, and returns the `fetch` handler
- `index.ts` owns `Bun.serve()` and graceful shutdown — reads `PORT` from the env (which `nsl run` injects in dev) and binds to it
- `root.ts` resolves runtime root paths
- `pid-lock.ts` prevents duplicate listeners when the service should be singleton-like
- `dev.ts` is **optional**. Add it only if dev startup truly diverges from prod (e.g. seeding fixtures, attaching dev-only middleware). Frontend integration is handled by nsl outside the process — `dev.ts` should not exist solely to mount Vite.

Rules:

- keep startup side effects centralized
- keep mutable runtime state out of business modules unless the design explicitly requires it
- separate dev-only bootstrap from production startup *only when there is real divergence*

## HTTP Server With OpenAPIHono

Recommended shape:

- `app.ts` builds the `OpenAPIHono` app graph and mounts module sub-apps with `app.route()`
- `index.ts` handles startup and shutdown
- `modules/docs` serves `/openapi.json` and the Scalar UI at `/docs`
- `modules/health` exposes a health endpoint
- each domain module exports its own `OpenAPIHono` instance with `<domain>.routes.ts` + `<domain>.schemas.ts`; plain routes may sit on the same instance, and a module with no contract routes may export a plain `Hono`

```typescript
// src/modules/users/users.schemas.ts
import { z } from "@hono/zod-openapi"; // not from "zod": this z carries .openapi()

export const UserId = z.uuid().openapi({ example: "3f1c9d2e-8a4b-4c1d-9e2f-1a2b3c4d5e6f" });

export const User = z
  .object({
    id: UserId,
    name: z.string().min(1).openapi({ example: "Ada" }),
  })
  .openapi("User"); // named schemas land in components.schemas
```

```typescript
// src/modules/users/users.routes.ts
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { AppEnv } from "@/shared/env";
import { ErrorResponse } from "@/shared/errors";
import { User, UserId } from "./users.schemas";

const getUser = createRoute({
  method: "get",
  path: "/users/{id}",
  operationId: "getUser",
  tags: ["users"],
  request: { params: z.object({ id: UserId }) },
  responses: {
    200: { description: "User", content: { "application/json": { schema: User } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorResponse } } },
  },
});

export const usersRoutes = new OpenAPIHono<AppEnv>().openapi(getUser, async (c) => {
  const { id } = c.req.valid("param");
  const user = await c.var.users.find(id);
  if (!user) return c.json({ error: { code: "not_found", message: "user not found" } }, 404);
  return c.json(user, 200);
});
```

```typescript
// src/app.ts
import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";

export function createApp(deps: Deps) {
  const app = new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success)
        return c.json({ error: { code: "validation_failed", issues: result.error.issues } }, 422);
    },
  });

  // middleware stack (see below), then dependency injection via c.set(...)
  app.route("/", healthRoutes).route("/", usersRoutes);

  app.doc31("/openapi.json", {
    openapi: "3.1.0",
    info: { title: deps.config.appName, version: deps.config.version },
  });
  if (deps.config.docsEnabled)
    app.get("/docs", Scalar({ url: "/openapi.json", pageTitle: deps.config.appName }));

  app.onError(errorHandler);
  return app;
}
```

Rules:

- keep route handlers thin
- validate input with Zod through `createRoute`; never re-parse inside the handler
- map domain errors centrally
- return a consistent response envelope where the product expects it
- use graceful shutdown for signals

## OpenAPI Contract Rules

- Routing is a hard lock (`baseline.md` *Routing Hard Lock*): `@hono/zod-openapi` routes for contract endpoints, plain Hono routes only where OpenAPI does not apply, nothing else — `@hono/zod-validator` and `@hono/standard-validator` are never added.
- Every contract endpoint is one `createRoute` object mounted with `app.openapi()`. Plain routes (`app.get()`, …) cover `/health`, `/docs`, `/openapi.json`, static assets, SSE/WebSocket upgrades, inbound webhooks, and internal ops; they validate bodies with Zod `safeParse` directly and stay out of `/openapi.json`.
- List every response status the handler can return, including error statuses, and point each error at the shared `ErrorResponse` schema.
- Name reusable schemas with `.openapi("Name")` so clients get `components.schemas`, not inline duplicates. Set `operationId` on every route; generated clients key on it.
- Import `z` from `@hono/zod-openapi` in schema files. `z` from `zod` has no `.openapi()` and produces unnamed, example-less schemas.
- `/openapi.json` is generated at runtime from the same schemas that validate. Never hand-maintain a spec file.
- Emit OpenAPI 3.1 (`app.doc31`). Use `app.doc` (3.0) only when a downstream consumer cannot read 3.1, and record it.
- `/openapi.json` and `/docs` are open in development and gated by config (`DOCS_ENABLED`) in production; they never sit behind the API's own auth in dev.
- The contract test (`data-and-testing.md` *Testing*) snapshots `/openapi.json`; a route change that does not update the snapshot on purpose fails CI.
- When a SPA consumes the API, generate its client types from `/openapi.json` (e.g. `openapi-typescript`) rather than hand-copying schemas.

## Middleware Stack

Default API middleware ordering should be explicit; use Hono's built-ins where they exist:

1. request ID — `hono/request-id`
2. secure headers — `hono/secure-headers`
3. CORS — `hono/cors`, allowlist from config
4. body limit and timeout — `hono/body-limit`, `hono/timeout`
5. dependency injection onto context (`c.set(...)`)
6. request logging (pino, tagged with the request ID)
7. CSRF or other browser-facing state protections — `hono/csrf`
8. auth
9. business routes
10. `app.notFound` and `app.onError`

Keep security middleware close to the edge, not inside individual feature handlers.

## Dev URL Routing (via nsl)

The full nsl protocol lives in `/pma references/dev-environment.md`. This section only covers the **Bun-specific** angle.

### Bun dev script

```bash
bunx nsl run -n <name>:/api -s -- bun --watch src/index.ts
```

- `Bun.serve()` reads `PORT` natively, so the API binds to the port nsl allocates without any extra wiring.
- `-s` (`--strip`) drops the `/api` prefix before forwarding, so route handlers stay mounted at their domain paths (`/users`, `/orders`, …) and remain unaware of the public mount point.

### Bun-specific anti-patterns

- Do **not** mount Vite into the Bun process (no `@hono/vite-dev-server`, no Vite middleware in `dev.ts`).
- Do **not** import the API package from the frontend for middleware mounting — frontend and backend run as independent processes.
- Production bootstrap stays untouched: `index.ts` reads `PORT` and serves embedded SPA assets normally; nothing in production depends on nsl.

## Logging

- use consola for human-readable development logs
- use pino for structured operational logs
- redact secrets
- attach the request ID from `hono/request-id` to every request log line
- flush structured logs on controlled shutdown when using file destinations

## API Documentation

```typescript
import { Scalar } from "@scalar/hono-api-reference";

app.doc31("/openapi.json", { openapi: "3.1.0", info: { title, version } });
app.get("/docs", Scalar({ url: "/openapi.json", pageTitle: title }));
```

- serve the OpenAPI 3.1 document at `/openapi.json` and the interactive UI at `/docs`
- `Scalar` is the current export of `@scalar/hono-api-reference`; the old `apiReference` export was removed
- keep docs generation aligned with actual validation schemas — the snapshot test guards it
- gate `/docs` in production with config; keep `/openapi.json` available wherever generated clients are built

## PID Lock And Singleton Safety

When the service uses local files, embedded SQLite, or singleton integrations:

- keep PID lock logic in one module
- record enough metadata to detect stale locks
- probe carefully before taking over an existing lock
- never scatter duplicate-listener protection across startup code

## Single-Binary Delivery

When using `bun build --compile`:

- embed directories with `--asset` (`--asset ./drizzle`, `--asset ./web/dist`); no build-time module rewriting
- resolve embedded paths only through `root.asset()`; branch on `Bun.isStandaloneExecutable` there and nowhere else
- serve the embedded SPA with `serveStatic` from `hono/bun` rooted at `root.asset("web", "dist")`, with an `index.html` fallback for client-side routes, and only when the SPA ships in the binary (dev serves it through Vite via nsl)
- document any feature gaps versus source-mode execution
- the compiled-mode smoke test (`data-and-testing.md`) proves migrations and static assets resolve from the binary; see `delivery.md` *Compile Pipeline* for the script
