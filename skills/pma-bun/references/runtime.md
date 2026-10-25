# PMA-Bun Runtime

## Table of Contents

- [Formatting And TypeScript](#formatting-and-typescript)
- [Scripts](#scripts)
- [Error Handling](#error-handling)
- [Configuration](#configuration)
- [ROOT_DIR And Compiled Mode](#root_dir-and-compiled-mode)
- [Bootstrap Split](#bootstrap-split)
- [HTTP Server With hono-openapi](#http-server-with-hono-openapi)
- [Middleware Stack](#middleware-stack)
- [Dev URL Routing (via nsl)](#dev-url-routing-via-nsl)
- [Logging](#logging)
- [API Documentation](#api-documentation)
- [PID Lock And Singleton Safety](#pid-lock-and-singleton-safety)
- [Single-Binary Delivery](#single-binary-delivery)


## Formatting And TypeScript

- Use `@antfu/eslint-config` (flat config) on the latest ESLint.
- Ignore generated artifacts such as `drizzle/**` and `dist/**`.
- Keep TypeScript in strict mode with `noUncheckedIndexedAccess`.
- Prefer `verbatimModuleSyntax`, `exactOptionalPropertyTypes`, and `import type` discipline.
- Keep path aliases aligned with `tsconfig.json`; do not invent aliases that CI does not resolve.

### TypeScript baseline

Current TypeScript removed several legacy options. A project that still carries them fails `typecheck`:

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

Keep `typescript` on the latest major for `tsc --noEmit`. When typescript-eslint or a similar tool needs a programmatic compiler API the latest major does not expose, let `@antfu/eslint-config` resolve the official compatibility package per the TypeScript migration guide. Pin an older major only when a tool has no compatibility path, and record the reason.

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
- One envelope: `{ success: true, data, meta? }` / `{ success: false, error: { code, message, details? } }`, documented through the helpers in `src/shared/lib/openapi.ts`.
- Validation failures also go through `onError`: the wrapped `validator()` throws `ValidationError` (422).
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

## HTTP Server With hono-openapi

Shape: `app.ts` mounts module route factories (`usersRoutes()`) with `app.route()`; `modules/docs` exports `mountDocs()`; `src/shared/lib/openapi.ts` is the only OpenAPI import for route files.

```typescript
// src/shared/lib/openapi.ts — the only place route files import OpenAPI pieces from
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";
import { validator as baseValidator, describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import { ValidationError } from "@/shared/lib/errors";

export { describeRoute, resolver };

// One tag per module; add a line when a module is added.
export const TAGS = { System: "System", Users: "Users" } as const;

// Names match `components.securitySchemes` in modules/docs.
export const SECURITY: Record<"session" | "serviceToken", Record<string, string[]>[]> = {
  session: [{ sessionCookie: [] }],
  serviceToken: [{ serviceToken: [] }],
};

// Wraps the library validator: a failure throws ValidationError, so `onError`
// answers with the standard 422 envelope instead of the library's 400.
export function validator<S extends ZodType, T extends keyof ValidationTargets>(target: T, schema: S) {
  return baseValidator(target, schema, (result) => {
    if (!result.success)
      throw new ValidationError("Validation failed", result.error);
  });
}

type ResponsesMap = Record<number, { description: string; content?: Record<string, { schema: ReturnType<typeof resolver> }> }>;

const errorEnvelope = z.object({
  success: z.literal(false),
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
});
const json = (schema: ZodType) => ({ "application/json": { schema: resolver(schema) } });

/** `200 { success: true, data }` */
export function jsonOk(data: ZodType = z.unknown(), description = "Success"): ResponsesMap {
  return { 200: { description, content: json(z.object({ success: z.literal(true), data })) } };
}

/** `200 { success: true, data: item[], meta }` */
export function jsonPaged(item: ZodType, description = "Paged list"): ResponsesMap {
  const meta = z.object({ total: z.number(), page: z.number(), limit: z.number() });
  return { 200: { description, content: json(z.object({ success: z.literal(true), data: z.array(item), meta })) } };
}

/** The error envelope for each listed status. */
export function errors(...codes: number[]): ResponsesMap {
  return Object.fromEntries(codes.map(code => [code, { description: "Error", content: json(errorEnvelope) }]));
}
// Also: jsonCreated (201), noContent (204), raw(status, mediaType, description) for non-JSON bodies.
```

```typescript
// src/modules/users/users.routes.ts
import type { AppEnv } from "@/shared/lib/types";
import { Hono } from "hono";
import { z } from "zod";
import { NotFoundError } from "@/shared/lib/errors";
import { describeRoute, errors, jsonOk, SECURITY, TAGS, validator } from "@/shared/lib/openapi";

const userSchema = z.object({ id: z.string(), name: z.string() });

export function usersRoutes() {
  const router = new Hono<AppEnv>();

  router.get(
    "/users/:id",
    describeRoute({
      tags: [TAGS.Users],
      summary: "Get user",
      security: SECURITY.session,
      responses: { ...jsonOk(userSchema, "User"), ...errors(401, 404, 422) },
    }),
    // auth middleware goes here, after describeRoute
    validator("param", z.object({ id: z.string().min(3) })),
    async (c) => {
      const { id } = c.req.valid("param");
      if (id !== "ada")
        throw new NotFoundError("User", id);
      return c.json({ success: true, data: { id, name: "Ada" } });
    },
  );

  return router;
}
```

```typescript
// src/modules/docs/docs.routes.ts
import type { MiddlewareHandler } from "hono";
import type { AppEnv, Config } from "@/shared/lib/types";
import { Hono } from "hono";
import { openAPIRouteHandler } from "hono-openapi";
import { TAGS } from "@/shared/lib/openapi";

// The app ships no docs UI; /docs hands the spec URL to an external viewer.
export const DOCS_VIEWER = "https://client.scalar.com/?url=";

export function mountDocs(api: Hono<AppEnv>, config: Config): void {
  const base = `${config.BASE_PATH}/api`;
  let handler: MiddlewareHandler | undefined;

  api.get("/openapi.json", async (c, next) => {
    // Built on first request, once every module has registered its routes.
    handler ??= openAPIRouteHandler(api, {
      documentation: {
        openapi: "3.1.0",
        info: { title: `${config.APP_NAME} API`, version: config.VERSION },
        servers: [{ url: base }],
        components: {
          securitySchemes: {
            sessionCookie: { type: "apiKey", in: "cookie", name: "session_id" },
            serviceToken: { type: "http", scheme: "bearer" },
          },
        },
        tags: Object.values(TAGS).map(name => ({ name })),
      },
      // validator() failures answer 422 (listed per route), not the library default 400
      defaultValidationErrorResponse: false,
    });
    const res = await handler(c, next);
    // The viewer fetches the spec from the browser on its own origin; no credentials.
    res?.headers.set("Access-Control-Allow-Origin", "*");
    return res;
  });

  api.get("/docs", (c) => {
    const origin = new URL(config.APP_URL ?? c.req.url).origin;
    return c.redirect(`${DOCS_VIEWER}${encodeURIComponent(`${origin}${base}/openapi.json`)}`);
  });
}
```

```typescript
// src/app.ts
import type { AppEnv, Config } from "@/shared/lib/types";
import { Hono } from "hono";
import { mountDocs } from "@/modules/docs/docs.routes";
import { usersRoutes } from "@/modules/users/users.routes";
import { AppError } from "@/shared/lib/errors";

export function createApp(config: Config) {
  const api = new Hono<AppEnv>();
  // middleware stack (see below), then dependency injection via c.set(...)
  api.use("*", async (c, next) => {
    c.set("config", config);
    await next();
  });

  mountDocs(api, config); // before the modules, so module auth guards do not cover it
  api.route("/", usersRoutes());

  api.onError((err, c) => {
    if (err instanceof AppError)
      return c.json({ success: false, error: { code: err.code, message: err.message, details: err.details } }, err.status);
    return c.json({ success: false, error: { code: "INTERNAL", message: "Internal server error" } }, 500);
  });
  return api;
}
```

Rules (beyond *Routing Hard Lock*):

- `describeRoute()` sets `tags` (one `TAGS` entry per module), `summary`, `security` on protected routes, and `responses` from the helpers with every realistic error status
- a new auth scheme goes into both `SECURITY` and `components.securitySchemes`
- `defaultValidationErrorResponse: false`, since validation answers 422, not the library's default 400
- the spec is generated at runtime, never hand-written; the snapshot test (`data-and-testing.md`) guards changes
- a consuming SPA generates its client types from `/openapi.json` (e.g. `openapi-typescript`)
- keep handlers thin and map domain errors centrally

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

- `/docs` redirects to `https://client.scalar.com/?url=` plus the spec's absolute URL (from `APP_URL`, else the request); any `?url=` viewer works the same way
- the viewer fetches the spec from the browser, so `/openapi.json` sends CORS `*` and needs no credentials
- `mountDocs()` runs before module routers to stay outside their `use("*")` guards; the spec is built lazily on first request
- when the API is not public, gate both routes with config

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
