---
name: pma-bun
description: Bun implementation guide for PMA-managed backend and full-stack projects. Covers project layout (src/features), strict linting with ESLint + @antfu/eslint-config, database access (Drizzle ORM + PostgreSQL or bun:sqlite), HTTP patterns (Bun.serve + Hono), layered config with environment variables, structured logging with pino, OpenTelemetry observability, and CI quality gates.
---

# Bun Project Implementation Guide

Use this skill together with `/pma`. `/pma` controls workflow, approval, and task tracking; this guide defines the implementation baseline for Bun delivery work after implementation is approved.

## Scope

**For:** PMA-managed Bun backends, API services, CLI applications, and full-stack TypeScript projects.

**Not for:** frontend-only SPAs (use `/pma-web`), Deno or Node.js-specific projects, or projects that do not use the `/pma` workflow.

Goals:

- Bun-native APIs preferred over Node.js polyfills
- strict TypeScript with zero `any`
- explicit error handling at every level
- reproducible builds with lockfile
- reviewable operational and security conventions

## Tech Stack

Constraint levels:

- **Required** — non-negotiable for all projects using this skill
- **Default** — standard choice; replace only with documented justification
- **Optional** — adopt when the project needs it
- **Alternative** — supported substitute for a Default item

### Required

| Category | Technology | Notes |
|---|---|---|
| Runtime | Bun 1.2+ | use latest stable |
| Language | TypeScript 5.9+ | strict mode, `noUncheckedIndexedAccess` |
| Package manager | bun | `bun.lock` checked into VCS |
| Format / Lint | ESLint + @antfu/eslint-config | no Prettier; formatting handled by ESLint |
| Validation | Zod 3 | schema-based validation at API boundaries |
| Errors | typed error classes | custom `AppError` hierarchy with status codes |
| Test | bun:test | built-in Jest-compatible runner |

### Default

| Category | Technology | Notes |
|---|---|---|
| HTTP server | Hono 4 | lightweight, type-safe routing on top of `Bun.serve()` |
| Data access | Drizzle ORM + drizzle-kit | type-safe schema-as-code with PostgreSQL |
| Database driver | postgres (porsager) | lightweight PostgreSQL driver for Drizzle |
| Migration | drizzle-kit | `generate` + `migrate` workflow |
| Config | environment variables + Zod | validated at startup with `z.object().parse(Bun.env)` |
| Logging | pino 9 | structured JSON logging |
| Task runner | package.json scripts | `bun run <script>` |
| Hot reload | `bun --watch` | built-in file watcher for development |

### Optional

| Category | Technology | When to adopt |
|---|---|---|
| Embedded DB | bun:sqlite | lightweight apps, local-first, or CLI tools |
| Observability | OpenTelemetry (@opentelemetry/sdk-node) | production services requiring distributed tracing and metrics |
| Queue | BullMQ | background job processing |
| Cache | Redis (ioredis) | shared cache across instances |
| CLI | Commander.js | subcommands, options parsing |
| E2E test | Playwright | browser-level E2E testing |

### Alternative

| Replaces | Technology | Notes |
|---|---|---|
| Hono | Elysia 1.2 | Bun-native with runtime validation; slightly less portable |
| Drizzle ORM | Prisma 6 | GUI-friendly, broader ORM features; heavier runtime |
| Drizzle ORM | bun:sqlite | for embedded/local apps without PostgreSQL |
| pino | console (structured) | for simple CLIs where a logging library is overkill |
| @antfu/eslint-config | Biome | all-in-one linter + formatter; faster but smaller ecosystem |

## Required Quality Gates

Every PMA-Bun project should define these checks before merge:

| Gate | Requirement |
|---|---|
| Lint | `bun run lint` passes with no errors |
| Typecheck | `bun run typecheck` passes |
| Build | `bun run build` succeeds |
| Test | `bun test` passes |
| Coverage | `bun test --coverage` meets project threshold (target 80%+) |
| Security review | auth, secrets, outbound HTTP, and config changes reviewed |

If a project is missing one of these commands, add it instead of leaving the expectation undocumented.

## Project Layout

```text
package.json
bun.lock
bunfig.toml
tsconfig.json
eslint.config.ts
.env.example
src/
  index.ts                              # entry point: config load, DI wiring, server start
  config.ts                             # Zod-validated environment config
  server.ts                             # Hono app setup, middleware, router
  features/
    auth/
      auth.routes.ts                    # route definitions
      auth.service.ts                   # business logic
      auth.schema.ts                    # Zod request/response schemas
      auth.test.ts                      # unit tests
    users/
      users.routes.ts
      users.service.ts
      users.repository.ts              # data access
      users.schema.ts
      users.test.ts
  shared/
    db/
      index.ts                         # Drizzle client setup
      schema.ts                        # Drizzle table definitions
      migrate.ts                       # migration runner
    middleware/
      auth.ts
      logging.ts
      error-handler.ts
    lib/
      errors.ts                        # AppError class hierarchy
      logger.ts                        # pino setup
      types.ts                         # shared types
tests/
  integration/
    users.test.ts
  e2e/                                 # Playwright (optional)
drizzle/
  migrations/                          # generated SQL migrations
  drizzle.config.ts
docs/
  architecture.md
  changelog.md
  task/
  plan/
.github/
  workflows/
    ci.yml
```

For small services or CLIs, flatten `src/` — do not create empty directories for structure's sake.

## Required Conventions

| Area | Convention |
|---|---|
| Project layout | `src/features/` for domain modules, `src/shared/` for cross-cutting concerns |
| Naming | files: kebab-case; types/interfaces: PascalCase; functions/variables: camelCase |
| Errors | custom `AppError` class with HTTP status mapping; never throw raw strings |
| Validation | Zod schemas at API boundaries; infer types from schemas |
| Imports | use `import type` for type-only imports; group: runtime / external / internal |
| Testing | co-located `*.test.ts` files; integration tests in `tests/integration/` |
| Config | never read `Bun.env` directly in business logic; inject via validated config |
| Secrets | never log or serialize secrets; redact before any output |
| Database | always use parameterized queries; never interpolate user input into SQL |
| Formatting | ESLint auto-fix on save; `bun run lint` in CI |

## Code Quality Standards

### Immutability

ALWAYS create new objects, NEVER mutate existing ones:

```typescript
interface User {
  readonly id: string;
  readonly name: string;
}

// WRONG: mutation
function updateUser(user: User, name: string): User {
  (user as any).name = name; // MUTATION!
  return user;
}

// CORRECT: immutable update
function updateUser(user: Readonly<User>, name: string): User {
  return { ...user, name };
}
```

Use `Readonly<T>`, `ReadonlyArray<T>`, and `as const` to enforce immutability at the type level.

### File and Function Size Limits

| Metric | Target | Maximum |
|---|---|---|
| File length | 200-400 lines | 800 lines |
| Function length | < 30 lines | 50 lines |
| Nesting depth | 2 levels | 4 levels |

Extract utilities from large files. Organize by feature/domain, not by type.

### Code Quality Checklist

Before marking work complete:

- [ ] Code is readable and well-named
- [ ] Functions are small (< 50 lines)
- [ ] Files are focused (< 800 lines)
- [ ] No deep nesting (> 4 levels)
- [ ] Proper error handling (AppError hierarchy)
- [ ] No hardcoded values (use constants or config)
- [ ] Immutable patterns used (spread operator, Readonly<T>)
- [ ] `import type` used for type-only imports
- [ ] No `console.log` in production code
- [ ] No `any` in application code

## Development Workflow

This skill defines implementation standards. The `/pma` skill controls the overall workflow. Within implementation, follow these phases:

### Phase 0: Research & Reuse

Before writing new code:

1. **GitHub search first**: `gh search repos` and `gh search code` for existing implementations
2. **Library docs**: Use Context7 or npmjs.com to confirm API behavior
3. **Package registries**: Search npm before writing utility code
4. **Adaptable implementations**: Look for open-source packages solving 80%+ of the problem

Prefer adopting a proven approach over writing net-new code.

### Phase 1: Plan

- Reconfirm the approved `/pma` proposal against the current code before editing
- Generate or update architecture notes when the change alters feature boundaries, runtime integration, or deployment shape
- Identify dependencies and risks

### Phase 2: TDD

- Prefer test-first delivery for new behavior and bug fixes with a clear reproduction
- Write test first (RED) — run and confirm it fails
- Write minimal implementation (GREEN) — run and confirm it passes
- Refactor (IMPROVE)
- Verify coverage with `bun test --coverage` when the project tracks coverage

### Phase 3: Code Review

- Run a review pass immediately after writing code; use a review agent/tool only when available
- Address CRITICAL and HIGH issues before committing
- Fix MEDIUM issues when possible

## Hooks Configuration

Configure Claude Code hooks in `~/.claude/settings.json` for automatic quality enforcement:

### PostToolUse Hooks

- **ESLint --fix**: Auto-format `.ts`/`.tsx` files after edit
- **tsc --noEmit**: Run type checking after editing TypeScript files
- **console.log warning**: Warn about `console.log` in edited files

### Stop Hooks

- **bun run typecheck**: Verify no type errors before session ends
- **bun run lint**: Check all modified files for lint issues
- **bun test**: Run tests to verify no regressions

## Formatting and Linting

### ESLint Configuration

```typescript
// eslint.config.ts
import antfu from "@antfu/eslint-config";

export default antfu({
  typescript: true,
  stylistic: {
    indent: 2,
    quotes: "double",
    semi: true,
  },
  rules: {
    "no-console": "warn",
    "ts/no-explicit-any": "error",
    "ts/consistent-type-imports": ["error", { prefer: "type-imports" }],
  },
  ignores: ["drizzle/migrations/**"],
});
```

### TypeScript Configuration

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "types": ["bun-types"],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

### bunfig.toml

```toml
[test]
coverage = true
coverageThreshold = { line = 80, function = 80, statement = 80 }
coverageReporter = ["text", "lcov"]

[run]
shell = "bash"
```

### Scripts

```json
{
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "build": "bun build src/index.ts --outdir dist --target bun --minify",
    "start": "bun dist/index.js",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "test:watch": "bun test --watch",
    "test:coverage": "bun test --coverage",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "bun src/shared/db/migrate.ts",
    "db:studio": "drizzle-kit studio",
    "check": "bun run lint && bun run typecheck && bun test && bun run build"
  }
}
```

## Error Handling

Use a structured error hierarchy with HTTP status mapping:

```typescript
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly code: string = "INTERNAL_ERROR",
  ) {
    super(message);
    this.name = "AppError";
  }

  toJSON() {
    return {
      error: { code: this.code, message: this.message },
    };
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} ${id} not found`, 404, "NOT_FOUND");
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly details: unknown,
  ) {
    super(message, 422, "VALIDATION_ERROR");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
  }
}
```

At API boundaries, translate errors to HTTP responses. Never leak internal error details to external callers:

```typescript
import type { Context } from "hono";

export function errorHandler(err: Error, c: Context) {
  if (err instanceof AppError) {
    return c.json(err.toJSON(), err.statusCode as any);
  }

  logger.error({ err }, "unhandled error");
  return c.json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } }, 500);
}
```

## Configuration System

Validate environment variables at startup using Zod:

### Config Schema

```typescript
// src/config.ts
import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default("0.0.0.0"),

  DATABASE_URL: z.string().url(),
  DATABASE_MAX_CONNECTIONS: z.coerce.number().int().min(1).default(10),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("7d"),

  OTEL_ENABLED: z.coerce.boolean().default(false),
  OTEL_ENDPOINT: z.string().default("http://localhost:4317"),
  OTEL_SERVICE_NAME: z.string().default("myapp"),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const result = configSchema.safeParse(Bun.env);
  if (!result.success) {
    const formatted = result.error.flatten().fieldErrors;
    console.error("Invalid configuration:", formatted);
    process.exit(1);
  }
  return result.data;
}
```

### .env.example

Every project should ship a `.env.example` at the repository root as the reference default:

```env
# .env.example — reference configuration
# Copy to .env and fill in values

NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# Database
DATABASE_URL=postgres://user:pass@localhost:5432/myapp
DATABASE_MAX_CONNECTIONS=10

# Logging
LOG_LEVEL=info

# Auth
JWT_SECRET=change-me-to-a-random-32-char-string
JWT_EXPIRES_IN=7d

# Observability (optional)
OTEL_ENABLED=false
OTEL_ENDPOINT=http://localhost:4317
OTEL_SERVICE_NAME=myapp
```

### Config Conventions

| Convention | Rule |
|---|---|
| File name | `.env.example` at project root |
| Format | key=value, Zod-validated at startup |
| Secrets | **never** commit `.env`; use `.env.example` as reference |
| Defaults | defined in Zod schema `.default()`; env overrides defaults |
| Validation | fail fast at startup with clear error messages |
| `.gitignore` | add `.env`, `.env.local`, `.env.*.local` |

## Database with Drizzle ORM + PostgreSQL

### Schema Definition

```typescript
// src/shared/db/schema.ts
import { pgTable, serial, text, timestamp, varchar, integer } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  content: text("content").notNull(),
  authorId: integer("author_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

### Drizzle Client

```typescript
// src/shared/db/index.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import type { Config } from "@/config";

export function createDb(config: Config) {
  const client = postgres(config.DATABASE_URL, {
    max: config.DATABASE_MAX_CONNECTIONS,
  });
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDb>;
```

### Drizzle Config

```typescript
// drizzle/drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/shared/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

### Migration Runner

```typescript
// src/shared/db/migrate.ts
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const client = postgres(Bun.env.DATABASE_URL!, { max: 1 });
const db = drizzle(client);

await migrate(db, { migrationsFolder: "./drizzle/migrations" });
await client.end();
console.log("Migrations complete");
```

### Repository Pattern

```typescript
// src/features/users/users.repository.ts
import { eq } from "drizzle-orm";
import { users } from "@/shared/db/schema";
import { NotFoundError } from "@/shared/lib/errors";
import type { Database } from "@/shared/db";

export class UserRepository {
  constructor(private readonly db: Database) {}

  async findById(id: number) {
    const result = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (result.length === 0) {
      throw new NotFoundError("User", String(id));
    }
    return result[0];
  }

  async findByEmail(email: string) {
    const result = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0] ?? null;
  }

  async create(data: { name: string; email: string; passwordHash: string }) {
    const result = await this.db.insert(users).values(data).returning();
    return result[0];
  }

  async list(limit = 20, offset = 0) {
    return this.db.select().from(users).limit(limit).offset(offset);
  }
}
```

### Migration CLI

**NEVER write migration files by hand.** Always use `drizzle-kit generate` to produce them from schema changes:

```bash
# Generate migration from schema changes — the ONLY way to create migrations
bun run db:generate

# Run pending migrations
bun run db:migrate

# Open Drizzle Studio for visual DB browsing
bun run db:studio
```

Migration rules:

- Modify `src/shared/db/schema.ts` first, then run `bun run db:generate` — never create SQL files manually
- Review the generated SQL in `drizzle/migrations/` before applying
- Test migrations against a clean database before committing
- Never modify a migration that has already been applied in any shared environment

## Database with bun:sqlite (Embedded)

For CLI tools and local-first applications:

```typescript
import { Database } from "bun:sqlite";

export function createSqliteDb(path: string) {
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

// Prepared statements — always use parameterized queries
const findUser = db.prepare<{ id: number; name: string; email: string }, [number]>(
  "SELECT id, name, email FROM users WHERE id = ?",
);
const user = findUser.get(userId);

// Transactions
const insertMany = db.transaction((items: Array<{ name: string; email: string }>) => {
  const insert = db.prepare("INSERT INTO users (name, email) VALUES (?, ?)");
  for (const item of items) {
    insert.run(item.name, item.email);
  }
});
```

## API Documentation

### OpenAPI Specification

**Every API project must have an OpenAPI 3.1 specification.** Generate it from code — never maintain a separate YAML/JSON file by hand.

Use **@hono/zod-openapi** for type-safe, Zod-driven OpenAPI generation:

```bash
bun add @hono/zod-openapi
```

#### Route Definition with OpenAPI

```typescript
import { createRoute, z } from "@hono/zod-openapi";

const getUserRoute = createRoute({
  method: "get",
  path: "/api/v1/users/{id}",
  request: {
    params: z.object({ id: z.coerce.number().int() }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ success: z.literal(true), data: userSchema }) } },
      description: "User found",
    },
    404: {
      content: { "application/json": { schema: z.object({ success: z.literal(false), error: apiErrorSchema }) } },
      description: "User not found",
    },
  },
  tags: ["users"],
  summary: "Get user by ID",
});
```

#### Serving the Docs

```typescript
import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";

const app = new OpenAPIHono();

// Register routes with OpenAPI metadata
app.openapi(getUserRoute, async (c) => {
  const { id } = c.req.valid("param");
  const user = await userService.getById(id);
  return c.json({ success: true, data: user }, 200);
});

// Serve OpenAPI JSON
app.doc("/openapi.json", {
  openapi: "3.1.0",
  info: { title: "My API", version: "1.0.0" },
});

// Serve Scalar UI
app.get("/docs", apiReference({ spec: { url: "/openapi.json" } }));
```

### API Documentation Rules

| Rule | Requirement |
|---|---|
| Source of truth | OpenAPI spec generated from Zod schemas via `@hono/zod-openapi` — never hand-written |
| Viewer | Scalar served at `/docs` in development |
| Coverage | every public endpoint must be registered via `app.openapi()` with full request/response schemas |
| Versioning | spec version matches API version (`/api/v1` → `info.version: 1.x`) |
| Validation | request validation is automatic — Zod schemas serve as both OpenAPI docs and runtime validation |

Add to scripts:

```json
{
  "scripts": {
    "docs:openapi": "bun run src/openapi-export.ts > openapi.json"
  }
}
```

## HTTP Server with Hono

### App Setup

```typescript
// src/server.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { requestId } from "hono/request-id";
import { authRoutes } from "@/features/auth/auth.routes";
import { userRoutes } from "@/features/users/users.routes";
import { errorHandler } from "@/shared/middleware/error-handler";
import { loggingMiddleware } from "@/shared/middleware/logging";
import type { AppEnv } from "@/shared/lib/types";

export function createApp() {
  const app = new Hono<AppEnv>();

  // Global middleware
  app.use("*", requestId());
  app.use("*", secureHeaders());
  app.use("*", cors());
  app.use("*", loggingMiddleware());

  // Health check
  app.get("/health", (c) => c.json({ status: "ok" }));

  // API routes
  app.route("/api/v1/auth", authRoutes());
  app.route("/api/v1/users", userRoutes());

  // Global error handler
  app.onError(errorHandler);

  return app;
}
```

### App Environment Type

```typescript
// src/shared/lib/types.ts
import type { Database } from "@/shared/db";
import type { Config } from "@/config";

export interface AppEnv {
  Variables: {
    requestId: string;
    userId?: number;
    db: Database;
    config: Config;
  };
}
```

### Route Handler Pattern

```typescript
// src/features/users/users.routes.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { createUserSchema, listUsersSchema } from "./users.schema";
import { UserService } from "./users.service";
import type { AppEnv } from "@/shared/lib/types";

export function userRoutes() {
  const router = new Hono<AppEnv>();

  router.get("/", zValidator("query", listUsersSchema), async (c) => {
    const { limit, offset } = c.req.valid("query");
    const svc = new UserService(c.get("db"));
    const users = await svc.list(limit, offset);
    return c.json({ success: true, data: users });
  });

  router.get("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const svc = new UserService(c.get("db"));
    const user = await svc.getById(id);
    return c.json({ success: true, data: user });
  });

  router.post("/", zValidator("json", createUserSchema), async (c) => {
    const body = c.req.valid("json");
    const svc = new UserService(c.get("db"));
    const user = await svc.create(body);
    return c.json({ success: true, data: user }, 201);
  });

  return router;
}
```

### API Response Envelope

Use a consistent response format for all API endpoints:

```typescript
// src/shared/lib/response.ts
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
  meta?: { total: number; page: number; limit: number };
}

function ok<T>(c: Context, data: T, meta?: ApiResponse<T>["meta"]) {
  return c.json({ success: true, data, meta } satisfies ApiResponse<T>);
}

function err(c: Context, status: number, code: string, message: string) {
  return c.json({ success: false, error: { code, message } } satisfies ApiResponse<never>, status as any);
}
```

### Zod Request Schemas

```typescript
// src/features/users/users.schema.ts
import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const listUsersSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
```

### Entry Point with Graceful Shutdown

```typescript
// src/index.ts
import { loadConfig } from "./config";
import { createDb } from "./shared/db";
import { createApp } from "./server";
import { createLogger } from "./shared/lib/logger";

const config = loadConfig();
const logger = createLogger(config);
const db = createDb(config);
const app = createApp();

const server = Bun.serve({
  port: config.PORT,
  hostname: config.HOST,
  fetch(req) {
    return app.fetch(req, {
      // Inject dependencies into Hono context
      env: { Variables: { db, config } },
    });
  },
});

logger.info({ port: config.PORT, host: config.HOST }, "server started");

// Graceful shutdown
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  server.stop(true); // wait for in-flight requests
  process.exit(0);
}
```

### Auth Middleware

```typescript
// src/shared/middleware/auth.ts
import { createMiddleware } from "hono/factory";
import { UnauthorizedError } from "@/shared/lib/errors";
import type { AppEnv } from "@/shared/lib/types";

export function authMiddleware() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const header = c.req.header("Authorization");
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedError();
    }

    const token = header.slice(7);
    const payload = await verifyToken(token, c.get("config").JWT_SECRET);
    if (!payload) {
      throw new UnauthorizedError("Invalid token");
    }

    c.set("userId", payload.userId);
    await next();
  });
}
```

## Logging

Use `pino` for structured logging:

```typescript
// src/shared/lib/logger.ts
import pino from "pino";
import type { Config } from "@/config";

export function createLogger(config: Config) {
  return pino({
    level: config.LOG_LEVEL,
    transport: config.NODE_ENV === "development"
      ? { target: "pino-pretty" }
      : undefined,
    redact: {
      paths: ["req.headers.authorization", "*.password", "*.passwordHash", "*.token"],
      censor: "[REDACTED]",
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
```

### Logging Middleware

```typescript
// src/shared/middleware/logging.ts
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "@/shared/lib/types";

export function loggingMiddleware() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const start = performance.now();
    await next();
    const duration = Math.round(performance.now() - start);

    logger.info({
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration,
      requestId: c.get("requestId"),
    }, "request completed");
  });
}
```

Rules:

- use structured key-value pairs, not string interpolation
- never log secrets, tokens, or full request bodies containing PII
- configure `redact` paths in pino for automatic secret scrubbing
- use `pino-pretty` only in development

## Testing

### Unit Tests

```typescript
// src/features/users/users.service.test.ts
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { UserService } from "./users.service";

describe("UserService", () => {
  let service: UserService;
  let mockRepo: any;

  beforeEach(() => {
    mockRepo = {
      findById: mock(() => Promise.resolve({ id: 1, name: "Alice", email: "alice@example.com" })),
      findByEmail: mock(() => Promise.resolve(null)),
      create: mock((data: any) => Promise.resolve({ id: 2, ...data })),
      list: mock(() => Promise.resolve([{ id: 1, name: "Alice" }])),
    };
    service = new UserService(mockRepo);
  });

  it("should return user by id", async () => {
    const user = await service.getById(1);
    expect(user).toEqual({ id: 1, name: "Alice", email: "alice@example.com" });
    expect(mockRepo.findById).toHaveBeenCalledWith(1);
  });

  it("should throw NotFoundError for missing user", async () => {
    mockRepo.findById = mock(() => { throw new NotFoundError("User", "999"); });
    expect(service.getById(999)).rejects.toThrow("not found");
  });
});
```

### Integration Tests

```typescript
// tests/integration/users.test.ts
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createApp } from "@/server";
import { createDb } from "@/shared/db";
import { loadConfig } from "@/config";

describe("Users API", () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    const config = loadConfig();
    const db = createDb(config);
    app = createApp();
  });

  it("GET /health returns 200", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("POST /api/v1/users validates input", async () => {
    const res = await app.request("/api/v1/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "", email: "invalid" }),
    });
    expect(res.status).toBe(422);
  });
});
```

### Test Organization

| Type | Location | Runner |
|---|---|---|
| Unit tests | `src/**/*.test.ts` co-located | `bun test` |
| Integration tests | `tests/integration/*.test.ts` | `bun test tests/integration/` |
| E2E tests | `tests/e2e/*.spec.ts` | `bunx playwright test` |

### Coverage Configuration

```toml
# bunfig.toml
[test]
coverage = true
coverageThreshold = { line = 80, function = 80, statement = 80 }
coverageReporter = ["text", "lcov"]
```

### Mocking

```typescript
import { mock } from "bun:test";

// Mock a module
mock.module("@/shared/lib/logger", () => ({
  createLogger: () => ({
    info: mock(),
    warn: mock(),
    error: mock(),
  }),
}));

// Mock a function
const sendEmail = mock(() => Promise.resolve());

// Restore after each test
afterEach(() => {
  mock.restore();
});
```

### Snapshot Testing

```typescript
it("should match response shape", async () => {
  const res = await app.request("/api/v1/users/1");
  const body = await res.json();
  expect(body).toMatchSnapshot();
});
```

Rules:

- prefer real dependencies (test database) over mocks when feasible
- use mocks only for external services (email, payment, etc.)
- run with coverage in CI: `bun test --coverage`
- target 80%+ line, function, and statement coverage

### TDD Workflow

Follow the RED-GREEN-REFACTOR cycle strictly:

1. **RED**: Write a failing test that describes the desired behavior
2. **GREEN**: Write the minimum code to make the test pass
3. **REFACTOR**: Clean up without changing behavior
4. **VERIFY**: Run `bun test --coverage` and confirm 80%+ coverage

### Test Isolation Rules

- Always restore mocks after each test: `afterEach(() => { mock.restore(); })`
- Fix implementation, not tests (unless the test itself is wrong)
- Each test must be independent — no shared mutable state between tests

### E2E Testing with Playwright

For critical user flows:

```typescript
// tests/e2e/auth.spec.ts
import { test, expect } from "@playwright/test";

test("user can log in", async ({ page }) => {
  await page.goto("/login");
  await page.fill("[name=email]", "alice@example.com");
  await page.fill("[name=password]", "password123");
  await page.click("button[type=submit]");
  await expect(page).toHaveURL("/dashboard");
});
```

Use **e2e-runner** agent for Playwright test generation and execution.

## Security Patterns

### Password Hashing

Use Bun's built-in argon2id:

```typescript
const hash = await Bun.password.hash(password);
const isValid = await Bun.password.verify(password, hash);
```

### Constant-Time Comparison

Use `crypto.timingSafeEqual` for token comparison:

```typescript
import { timingSafeEqual } from "node:crypto";

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
```

### SSRF Protection

```typescript
function isPrivateIp(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  return (
    parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "0.0.0.0"
  );
}
```

### Rate Limiting

```typescript
import { rateLimiter } from "hono-rate-limiter";

app.use("/api/*", rateLimiter({
  windowMs: 60_000,
  limit: 100,
  keyGenerator: (c) => c.req.header("x-forwarded-for") ?? "unknown",
}));
```

### Input Sanitization

- always validate with Zod before processing
- never use `dangerouslySetInnerHTML` or raw HTML insertion
- use parameterized queries for all database operations
- escape user input in error messages

### CSRF Protection

For browser-facing APIs, implement CSRF protection:

```typescript
import { csrf } from "hono/csrf";

// Apply to routes that accept state-changing requests from browsers
app.use("/api/*", csrf());
```

### Pre-Commit Security Checklist

Before every commit, verify:

- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] All user inputs validated (Zod schemas at API boundaries)
- [ ] SQL injection prevention (parameterized queries via Drizzle/bun:sqlite)
- [ ] XSS prevention (no raw HTML injection, no `dangerouslySetInnerHTML`)
- [ ] CSRF protection enabled (for browser-facing APIs)
- [ ] Authentication/authorization verified on all protected endpoints
- [ ] Rate limiting applied to public-facing endpoints
- [ ] Error messages do not leak internal details
- [ ] Secrets not logged or serialized (pino `redact` configured)
- [ ] Passwords hashed with `Bun.password.hash()` (argon2id)
- [ ] Tokens compared with `crypto.timingSafeEqual`

### Dependency Auditing

```bash
# Check for known vulnerabilities
bun pm audit
```

Include `bun pm audit` in CI pipeline.

### Security Response Protocol

If a security issue is found during development:

1. **STOP** — do not continue feature work
2. Run a focused security review. If a dedicated security-review tool is available, use it; otherwise inspect the affected paths manually and expand the review to similar code paths.
3. Fix CRITICAL issues before any other work
4. Rotate any secrets that may have been exposed
5. Review codebase for similar patterns

## Observability

Observability is **Optional** — adopt when deploying production services that need distributed tracing and metrics.

### Strategy

| Signal | Tool | Notes |
|---|---|---|
| Traces | OpenTelemetry SDK + OTLP exporter | distributed request tracing across services |
| Metrics | OpenTelemetry SDK + OTLP exporter | request duration, error rate, custom counters |
| Logs | pino JSON output | correlate via request ID; OTel log bridge optional |
| Health | `/health` and `/ready` endpoints | liveness and readiness probes |

### Setup

```typescript
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

export function setupOtel(config: Config) {
  const sdk = new NodeSDK({
    serviceName: config.OTEL_SERVICE_NAME,
    traceExporter: new OTLPTraceExporter({ url: config.OTEL_ENDPOINT }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: config.OTEL_ENDPOINT }),
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
  return sdk;
}
```

## CI Pipeline

Use a two-stage model: formatting gate first, then parallel checks.

```yaml
name: CI
on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run lint

  typecheck:
    needs: [lint]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run typecheck

  test:
    needs: [lint]
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: testdb
        ports: ["5432:5432"]
        options: --health-cmd pg_isready --health-interval 5s
    env:
      DATABASE_URL: postgres://test:test@localhost:5432/testdb
      JWT_SECRET: test-secret-at-least-32-characters-long
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run db:migrate
      - run: bun test --coverage

  build:
    needs: [lint]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run build

  audit:
    needs: [lint]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun pm audit
```

## Dockerfile

```dockerfile
FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS install
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM base AS build
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM base AS release
COPY --from=install /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle

USER bun
EXPOSE 3000
CMD ["bun", "dist/index.js"]
```

## Workspaces (Monorepo)

For multi-package projects:

```json
{
  "name": "my-monorepo",
  "workspaces": ["apps/*", "packages/*"]
}
```

- Use `bun install` at the root
- Cross-package references: `"@repo/shared": "workspace:*"`
- Run scripts per workspace: `bun run --filter apps/api dev`
- Shared TypeScript configs in `packages/config/`

## Git Conventions

### Commit Message Format

```
<type>: <description>

<optional body>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`

### PR Workflow

1. Analyze full commit history with `git diff [base-branch]...HEAD`
2. Draft comprehensive PR summary covering all changes
3. Include test plan with TODOs
4. Push with `-u` flag for new branches

## API Review Checklist

For every API-affecting change, review:

- request validation covers all input fields (Zod schemas)
- error responses do not leak internal details
- auth and permission checks guard protected endpoints
- rate limiting is applied to public-facing endpoints
- SQL queries use parameterized arguments (never string concatenation)
- secrets are not logged, serialized, or included in error messages
- passwords are hashed with `Bun.password.hash()` (argon2id)
- tokens are compared with `crypto.timingSafeEqual`

These checks are part of delivery quality, not optional polish.
