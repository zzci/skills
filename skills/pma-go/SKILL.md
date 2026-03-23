---
name: pma-go
description: Go implementation guide for PMA-managed service and CLI projects. Covers project layout (cmd/internal), strict linting with golangci-lint v2, database access (sqlc + pgx or GORM), HTTP patterns (stdlib + Chi or Gin), layered config with koanf, structured logging with slog, OpenTelemetry observability, and CI quality gates.
---

# Go Project Implementation Guide

Use this skill together with `/pma`. `/pma` controls workflow, approval, and task tracking; this guide defines the implementation baseline for Go delivery work after implementation is approved.

## Scope

**For:** PMA-managed Go backends, API services, and CLI applications.

**Not for:** embedded systems, shared libraries published as standalone modules without a binary, or projects that do not use the `/pma` workflow.

Goals:

- idiomatic Go code following official guidelines
- strict linting and formatting defaults
- explicit error handling at every level
- reproducible builds with pinned dependencies
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
| Language | Go 1.26+ | use latest stable; `go.mod` with minimum version |
| Format | gofmt / goimports | enforced in CI |
| Lint | golangci-lint v2 | revive, govet, errcheck, staticcheck, gosimple, unused |
| Errors | `fmt.Errorf` + `%w` | wrap with context; use `errors.Is` / `errors.As` for checks |
| Logging | slog (stdlib) | structured, handler-swappable |
| Modules | Go modules | `go.mod` + `go.sum` checked into VCS |
| Validation | go-playground/validator v10 | struct tag validation at API boundaries |

### Default

| Category | Technology | Notes |
|---|---|---|
| HTTP server | stdlib `net/http` + Chi v5 | enhanced ServeMux (Go 1.22+) with Chi router for middleware and grouping |
| Data access | sqlc + pgx v5 | compile-time SQL type safety; native PostgreSQL driver |
| Migration | goose | SQL + Go function migrations |
| Config | koanf v2 | layered: defaults -> file -> env -> flags; modular providers |
| CLI | Cobra + pflag | subcommands, persistent flags, shell completion |
| Task runner | Task (taskfile.dev) | YAML-based; replaces Make |
| Hot reload | air | file-watcher with configurable build command for development |

### Optional

| Category | Technology | When to adopt |
|---|---|---|
| Observability | OpenTelemetry (`go.opentelemetry.io/otel`) | production services requiring distributed tracing and metrics |
| High-perf logging | zerolog | measured logging overhead is a bottleneck |
| RPC | connect-go + buf | service-to-service communication needing gRPC compatibility |
| DI | google/wire | dependency graph is large enough that manual wiring is tedious |
| Release | GoReleaser v2 | cross-platform binaries, Docker images, SBOM, Homebrew taps |

### Alternative

| Replaces | Technology | Notes |
|---|---|---|
| Chi | Gin 1.10 | larger middleware ecosystem; 48% adoption in JetBrains survey; slightly less idiomatic |
| sqlc + pgx | GORM v2 | full ORM with associations and auto-migrate; prefer for rapid prototyping or CRUD-heavy internal tools |
| goose | golang-migrate | language-agnostic SQL migrations; wider database support |
| goose | Atlas | declarative schema-as-code with auto-planned diffs; prefer for complex schemas needing CI enforcement |
| koanf | envconfig | minimal env-only config; sufficient for pure 12-factor apps |

## Required Quality Gates

Every PMA-Go project should define these checks before merge:

| Gate | Requirement |
|---|---|
| Format | `goimports -l .` returns no output |
| Lint | `golangci-lint run` passes with no errors |
| Vet | `go vet ./...` passes |
| Test | `go test ./...` passes |
| Coverage | `go test -cover ./...` meets project threshold (target 80%+) |
| Build | `go build ./...` succeeds |
| Mod tidy | `go mod tidy` produces no diff |
| Security scan | `gosec ./...` passes with no high-severity findings |
| Security review | auth, secrets, outbound HTTP, and config changes reviewed |

If a project is missing one of these commands, add it instead of leaving the expectation undocumented.

## Project Layout

Use `cmd/` + `internal/` for binary projects. Avoid `/pkg` — it adds no value.

```text
go.mod
go.sum
Taskfile.yml
.air.toml                              # hot reload config (dev only)
.golangci.yml
cmd/
  server/
    main.go                            # entry point: config load, DI wiring, server start
  cli/
    main.go                            # optional CLI binary
internal/
  config/
    config.go                          # koanf layered loading
  server/
    server.go                          # HTTP server setup, router, middleware
    routes.go                          # route registration
  handler/
    user.go                            # HTTP handlers grouped by domain
    health.go
  service/
    user.go                            # business logic
  repository/
    user.go                            # data access interface + implementation
  model/
    user.go                            # domain types
  middleware/
    auth.go
    logging.go
    recovery.go
db/
  queries/
    user.sql                           # sqlc query files
  migrations/
    00001_create_users.sql             # goose migrations
  sqlc.yaml
docs/
  architecture.md
  changelog.md
  task/
  plan/
.github/
  workflows/
    ci.yml
```

For small services or CLIs, flatten `internal/` — do not create empty packages for structure's sake.

## Required Conventions

| Area | Convention |
|---|---|
| Project layout | `cmd/` for binaries, `internal/` for unexported packages; no `/pkg` |
| Naming | packages: lowercase, single word; files: snake_case; interfaces: `-er` suffix when natural |
| Errors | wrap with `fmt.Errorf("operation: %w", err)`; define sentinel errors with `var ErrNotFound = errors.New(...)` |
| Context | pass `context.Context` as the first parameter; never store it in structs |
| Interfaces | define at the consumer side, not the implementor; keep them small |
| Constructors | `NewXxx(deps) (*Xxx, error)` pattern; return concrete types, accept interfaces |
| Imports | group: stdlib / external / internal; enforced by goimports |
| Testing | table-driven tests; test files in same package (`_test.go`); use testify for assertions |
| Config | never read env vars directly in business logic; inject via config struct |
| Secrets | never log or serialize secrets; redact before any output |

## Error Handling

Use a two-tier model:

1. **Sentinel errors** for well-known conditions callers need to check:

```go
var (
    ErrNotFound    = errors.New("not found")
    ErrUnauthorized = errors.New("unauthorized")
)
```

2. **Wrapped errors** for context propagation:

```go
func (r *UserRepo) FindByID(ctx context.Context, id int64) (*User, error) {
    user, err := r.q.GetUser(ctx, id)
    if err != nil {
        if errors.Is(err, pgx.ErrNoRows) {
            return nil, ErrNotFound
        }
        return nil, fmt.Errorf("find user %d: %w", id, err)
    }
    return user, nil
}
```

At API boundaries, translate internal errors to HTTP status codes. Never leak internal error details to external callers:

```go
func handleError(w http.ResponseWriter, err error) {
    switch {
    case errors.Is(err, ErrNotFound):
        http.Error(w, "not found", http.StatusNotFound)
    case errors.Is(err, ErrUnauthorized):
        http.Error(w, "unauthorized", http.StatusUnauthorized)
    default:
        slog.Error("internal error", "error", err)
        http.Error(w, "internal server error", http.StatusInternalServerError)
    }
}
```

## Configuration System

Layer configuration in this order:

```text
compiled defaults
  -> config file (TOML/YAML)
  -> environment variables
  -> CLI flags
```

### Config Struct

```go
type Config struct {
    Server   ServerConfig   `koanf:"server"`
    Database DatabaseConfig `koanf:"database"`
    Log      LogConfig      `koanf:"log"`
}

type ServerConfig struct {
    Host string `koanf:"host"`
    Port int    `koanf:"port"`
}

type DatabaseConfig struct {
    URL             string `koanf:"url"`
    MaxConns        int    `koanf:"max_conns"`
    MigrateOnStart  bool   `koanf:"migrate_on_start"`
}

type LogConfig struct {
    Level  string `koanf:"level"`
    Format string `koanf:"format"`
}
```

### Layered Loading with koanf

```go
import (
    "github.com/knadh/koanf/v2"
    "github.com/knadh/koanf/parsers/toml"
    "github.com/knadh/koanf/providers/env"
    "github.com/knadh/koanf/providers/file"
    "github.com/knadh/koanf/providers/structs"
)

func Load(path string) (*Config, error) {
    k := koanf.New(".")

    defaults := Config{
        Server:   ServerConfig{Host: "0.0.0.0", Port: 8080},
        Database: DatabaseConfig{MaxConns: 10},
        Log:      LogConfig{Level: "info", Format: "text"},
    }

    if err := k.Load(structs.Provider(defaults, "koanf"), nil); err != nil {
        return nil, fmt.Errorf("load defaults: %w", err)
    }

    if err := k.Load(file.Provider(path), toml.Parser()); err != nil {
        slog.Warn("config file not found, using defaults", "path", path)
    }

    if err := k.Load(env.Provider("APP_", ".", func(s string) string {
        return strings.ToLower(strings.TrimPrefix(s, "APP_"))
    }), nil); err != nil {
        return nil, fmt.Errorf("load env: %w", err)
    }

    var cfg Config
    if err := k.Unmarshal("", &cfg); err != nil {
        return nil, fmt.Errorf("unmarshal config: %w", err)
    }

    return &cfg, nil
}
```

### Example Config File

Every project should ship a `config.toml` at the repository root as the reference default. This file documents all available settings and their defaults:

```toml
# config.toml — reference configuration
# Override any value with environment variables prefixed APP_
# e.g. APP_SERVER_PORT=9090, APP_DATABASE_URL=postgres://...

[server]
host = "0.0.0.0"
port = 8080

[database]
url = "postgres://user:pass@localhost:5432/myapp"
max_conns = 10
migrate_on_start = false

[log]
level = "info"        # debug, info, warn, error
format = "text"       # text (dev), json (production)

[otel]
enabled = false
endpoint = "localhost:4317"
service_name = "myapp"
insecure = true       # disable TLS for local dev only
```

### Config File Conventions

| Convention | Rule |
|---|---|
| File name | `config.toml` at project root |
| Format | TOML (lightweight, widely supported in Go via koanf) |
| Env prefix | `APP_` — maps `APP_SERVER_PORT` to `server.port` via koanf `env.Provider("APP_", ".", ...)` |
| Sections | one top-level table per concern: `[server]`, `[database]`, `[log]`, `[otel]` |
| Secrets | **never** commit real secrets; use env vars or a secret manager for `database.url`, API keys, etc. |
| Defaults | compiled into the Go struct literal; config file overrides defaults; env overrides file; CLI flags override env |
| Validation | validate immediately after loading; fail fast with a clear error message |
| `.gitignore` | add `config.local.toml` for personal overrides; never ignore the reference `config.toml` |

### Config Validation

Validate after loading, before any service starts:

```go
func (c *Config) Validate() error {
    if c.Database.URL == "" {
        return fmt.Errorf("database.url must not be empty")
    }
    if c.Server.Port <= 0 || c.Server.Port > 65535 {
        return fmt.Errorf("server.port must be between 1 and 65535")
    }

    validLevels := map[string]bool{"debug": true, "info": true, "warn": true, "error": true}
    if !validLevels[c.Log.Level] {
        return fmt.Errorf("log.level must be one of: debug, info, warn, error")
    }

    return nil
}
```

Call in `main.go` immediately after loading:

```go
cfg, err := config.Load("config.toml")
if err != nil {
    slog.Error("failed to load config", "error", err)
    os.Exit(1)
}
if err := cfg.Validate(); err != nil {
    slog.Error("invalid config", "error", err)
    os.Exit(1)
}
```

### Environment Variable Mapping

```text
Config field          Environment variable         Example
─────────────────────────────────────────────────────────────
server.host           APP_SERVER_HOST              APP_SERVER_HOST=127.0.0.1
server.port           APP_SERVER_PORT              APP_SERVER_PORT=9090
database.url          APP_DATABASE_URL             APP_DATABASE_URL=postgres://...
database.max_conns    APP_DATABASE_MAX_CONNS       APP_DATABASE_MAX_CONNS=20
database.migrate_on_start  APP_DATABASE_MIGRATE_ON_START  APP_DATABASE_MIGRATE_ON_START=true
log.level             APP_LOG_LEVEL                APP_LOG_LEVEL=debug
log.format            APP_LOG_FORMAT               APP_LOG_FORMAT=json
otel.enabled          APP_OTEL_ENABLED             APP_OTEL_ENABLED=true
otel.endpoint         APP_OTEL_ENDPOINT            APP_OTEL_ENDPOINT=otel-collector:4317
```

Conventions:

- namespace env vars with `APP_` prefix
- do not hand-roll merge precedence
- validate config after loading, fail fast on invalid values
- ship `config.toml` as reference; use `config.local.toml` (gitignored) for personal overrides

## Database with sqlc + pgx

### sqlc.yaml

```yaml
version: "2"
sql:
  - engine: "postgresql"
    queries: "db/queries/"
    schema: "db/migrations/"
    gen:
      go:
        package: "sqlcgen"
        out: "internal/repository/sqlcgen"
        sql_package: "pgx/v5"
        emit_json_tags: true
        emit_empty_slices: true
```

### Query Example

```sql
-- db/queries/user.sql

-- name: GetUser :one
SELECT id, name, email, created_at
FROM users
WHERE id = $1;

-- name: ListUsers :many
SELECT id, name, email, created_at
FROM users
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: CreateUser :one
INSERT INTO users (name, email)
VALUES ($1, $2)
RETURNING id, name, email, created_at;
```

### Connection Pool

```go
import (
    "context"
    "fmt"

    "github.com/jackc/pgx/v5/pgxpool"
)

func NewPool(ctx context.Context, databaseURL string, maxConns int) (*pgxpool.Pool, error) {
    config, err := pgxpool.ParseConfig(databaseURL)
    if err != nil {
        return nil, fmt.Errorf("parse database url: %w", err)
    }
    config.MaxConns = int32(maxConns)

    pool, err := pgxpool.NewWithConfig(ctx, config)
    if err != nil {
        return nil, fmt.Errorf("create connection pool: %w", err)
    }

    if err := pool.Ping(ctx); err != nil {
        pool.Close()
        return nil, fmt.Errorf("ping database: %w", err)
    }

    return pool, nil
}
```

### Migration with goose

**NEVER write migration files by hand.** Always use the CLI to generate them:

```bash
go install github.com/pressly/goose/v3/cmd/goose@latest
goose -dir db/migrations postgres "$DATABASE_URL" up
goose -dir db/migrations postgres "$DATABASE_URL" create create_users sql
```

Migration rules:

- Use `goose create <name> sql` to generate timestamped migration files — never create them manually
- Each migration must include both `up` and `down` (rollback) statements
- Test migrations against a clean database before committing
- Never modify a migration that has already been applied in any shared environment

Embed migrations for single-binary deployment:

```go
import (
    "embed"

    "github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var migrations embed.FS

func RunMigrations(db *sql.DB) error {
    goose.SetBaseFS(migrations)
    return goose.Up(db, "migrations")
}
```

## API Documentation

### OpenAPI Specification

**Every API project must have an OpenAPI 3.1 specification.** Generate it from code — never maintain a separate YAML/JSON file by hand.

Use **swag** (Swaggo) for annotation-based OpenAPI generation:

```bash
go install github.com/swaggo/swag/cmd/swag@latest
swag init -g cmd/server/main.go -o docs/swagger
```

#### Handler Annotations

```go
// @Summary      Get user by ID
// @Description  Returns a single user
// @Tags         users
// @Accept       json
// @Produce      json
// @Param        id   path      int  true  "User ID"
// @Success      200  {object}  APIResponse{data=model.User}
// @Failure      404  {object}  APIResponse
// @Router       /api/v1/users/{id} [get]
func (h *Handler) GetUser(w http.ResponseWriter, r *http.Request) {
```

#### Serving the Docs

```go
import httpSwagger "github.com/swaggo/http-swagger"

r.Get("/docs/*", httpSwagger.WrapHandler)
```

### API Documentation Rules

| Rule | Requirement |
|---|---|
| Source of truth | OpenAPI spec generated from code annotations — never hand-written |
| Generation | `swag init` runs in CI and produces no diff |
| Viewer | Swagger UI or Scalar served at `/docs` in development |
| Coverage | every public endpoint must have annotations (summary, params, responses) |
| Versioning | spec version matches API version (`/api/v1` → `info.version: 1.x`) |

Add to Quality Gates:

```
API docs | `swag init` produces no diff against checked-in spec
```

Add to Taskfile:

```yaml
  docs:
    desc: Generate OpenAPI spec
    cmd: swag init -g cmd/server/main.go -o docs/swagger
```

## HTTP Server

### Router with Chi

```go
import (
    "net/http"

    "github.com/go-chi/chi/v5"
    "github.com/go-chi/chi/v5/middleware"
)

func NewRouter(h *Handler, authMw func(http.Handler) http.Handler) http.Handler {
    r := chi.NewRouter()

    r.Use(middleware.RequestID)
    r.Use(middleware.RealIP)
    r.Use(LoggingMiddleware)
    r.Use(middleware.Recoverer)

    r.Get("/health", h.Health)

    r.Route("/api/v1", func(r chi.Router) {
        r.Use(authMw)
        r.Get("/users", h.ListUsers)
        r.Get("/users/{id}", h.GetUser)
        r.Post("/users", h.CreateUser)
    })

    return r
}
```

### Handler Pattern

```go
type Handler struct {
    svc    *service.UserService
    logger *slog.Logger
}

func NewHandler(svc *service.UserService, logger *slog.Logger) *Handler {
    return &Handler{svc: svc, logger: logger}
}

func (h *Handler) GetUser(w http.ResponseWriter, r *http.Request) {
    id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
    if err != nil {
        http.Error(w, "invalid id", http.StatusBadRequest)
        return
    }

    user, err := h.svc.GetByID(r.Context(), id)
    if err != nil {
        handleError(w, err)
        return
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(user)
}
```

### API Response Envelope

Use a consistent response format for all API endpoints:

```go
type APIResponse struct {
    Success bool        `json:"success"`
    Data    interface{} `json:"data,omitempty"`
    Error   *APIError   `json:"error,omitempty"`
    Meta    *Meta       `json:"meta,omitempty"`
}

type APIError struct {
    Code    string `json:"code"`
    Message string `json:"message"`
}

type Meta struct {
    Total  int `json:"total"`
    Page   int `json:"page"`
    Limit  int `json:"limit"`
}

func respondJSON(w http.ResponseWriter, status int, resp APIResponse) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(resp)
}

func respondOK(w http.ResponseWriter, data interface{}) {
    respondJSON(w, http.StatusOK, APIResponse{Success: true, Data: data})
}

func respondError(w http.ResponseWriter, status int, code, message string) {
    respondJSON(w, status, APIResponse{Success: false, Error: &APIError{Code: code, Message: message}})
}
```

### Graceful Shutdown

```go
func Run(ctx context.Context, cfg *Config, handler http.Handler) error {
    srv := &http.Server{
        Addr:         fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port),
        Handler:      handler,
        ReadTimeout:  15 * time.Second,
        WriteTimeout: 15 * time.Second,
        IdleTimeout:  60 * time.Second,
    }

    errCh := make(chan error, 1)
    go func() {
        slog.Info("server starting", "addr", srv.Addr)
        if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
            errCh <- err
        }
        close(errCh)
    }()

    select {
    case err := <-errCh:
        return fmt.Errorf("server listen: %w", err)
    case <-ctx.Done():
        slog.Info("shutting down server")
    }

    shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    if err := srv.Shutdown(shutdownCtx); err != nil {
        return fmt.Errorf("server shutdown: %w", err)
    }

    slog.Info("server stopped")
    return nil
}
```

### Main Entry Point

```go
func main() {
    ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
    defer stop()

    cfg, err := config.Load("config.toml")
    if err != nil {
        slog.Error("failed to load config", "error", err)
        os.Exit(1)
    }

    setupLogger(cfg.Log)

    pool, err := db.NewPool(ctx, cfg.Database.URL, cfg.Database.MaxConns)
    if err != nil {
        slog.Error("failed to connect to database", "error", err)
        os.Exit(1)
    }
    defer pool.Close()

    queries := sqlcgen.New(pool)
    userSvc := service.NewUserService(queries)
    handler := handler.NewHandler(userSvc, slog.Default())
    router := server.NewRouter(handler, middleware.Auth(cfg))

    if err := server.Run(ctx, cfg, router); err != nil {
        slog.Error("server error", "error", err)
        os.Exit(1)
    }
}
```

## Logging

Use `slog` as the default structured logger:

```go
func setupLogger(cfg LogConfig) {
    var handler slog.Handler

    level := parseLevel(cfg.Level)

    switch cfg.Format {
    case "json":
        handler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level})
    default:
        handler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: level})
    }

    slog.SetDefault(slog.New(handler))
}

func parseLevel(s string) slog.Level {
    switch strings.ToLower(s) {
    case "debug":
        return slog.LevelDebug
    case "warn":
        return slog.LevelWarn
    case "error":
        return slog.LevelError
    default:
        return slog.LevelInfo
    }
}
```

Rules:

- use `slog.With("key", value)` for request-scoped context
- never log secrets, tokens, or full request bodies containing PII
- for high-throughput services where slog overhead is measured, swap to zerolog handler

## Observability

Observability is **Optional** — adopt when deploying production services that need distributed tracing, metrics, or log correlation.

### Strategy

| Signal | Tool | Notes |
|---|---|---|
| Traces | OpenTelemetry SDK + OTLP exporter | distributed request tracing across services |
| Metrics | OpenTelemetry SDK + OTLP exporter | request duration, error rate, queue depth, custom counters |
| Logs | slog → OTLP log bridge (or JSON stdout) | correlate logs with trace/span IDs |
| Health | `/health` and `/ready` endpoints | liveness and readiness probes for orchestrators |

### Dependencies

```go
// go.mod — add when observability is enabled
require (
    go.opentelemetry.io/otel                      v1.34
    go.opentelemetry.io/otel/sdk                   v1.34
    go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc  v1.34
    go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc v1.34
    go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp      v0.58
    go.opentelemetry.io/contrib/instrumentation/github.com/jackc/pgx/v5/otelpgx  v0.2
)
```

### Tracer and Meter Setup

```go
import (
    "context"
    "fmt"
    "time"

    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
    "go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc"
    sdkmetric "go.opentelemetry.io/otel/sdk/metric"
    "go.opentelemetry.io/otel/sdk/resource"
    sdktrace "go.opentelemetry.io/otel/sdk/trace"
    semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

type OtelShutdown func(ctx context.Context) error

func SetupOtel(ctx context.Context, serviceName, serviceVersion string) (OtelShutdown, error) {
    res, err := resource.New(ctx,
        resource.WithAttributes(
            semconv.ServiceName(serviceName),
            semconv.ServiceVersion(serviceVersion),
        ),
    )
    if err != nil {
        return nil, fmt.Errorf("create resource: %w", err)
    }

    // Traces
    traceExp, err := otlptracegrpc.New(ctx)
    if err != nil {
        return nil, fmt.Errorf("create trace exporter: %w", err)
    }
    tp := sdktrace.NewTracerProvider(
        sdktrace.WithBatcher(traceExp),
        sdktrace.WithResource(res),
    )
    otel.SetTracerProvider(tp)

    // Metrics
    metricExp, err := otlpmetricgrpc.New(ctx)
    if err != nil {
        return nil, fmt.Errorf("create metric exporter: %w", err)
    }
    mp := sdkmetric.NewMeterProvider(
        sdkmetric.WithReader(sdkmetric.NewPeriodicReader(metricExp, sdkmetric.WithInterval(30*time.Second))),
        sdkmetric.WithResource(res),
    )
    otel.SetMeterProvider(mp)

    shutdown := func(ctx context.Context) error {
        var errs []error
        if err := tp.Shutdown(ctx); err != nil {
            errs = append(errs, err)
        }
        if err := mp.Shutdown(ctx); err != nil {
            errs = append(errs, err)
        }
        return errors.Join(errs...)
    }

    return shutdown, nil
}
```

### HTTP Instrumentation

Use `otelhttp` middleware to auto-instrument all incoming requests with traces and metrics:

```go
import "go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"

func NewRouter(h *Handler, authMw func(http.Handler) http.Handler) http.Handler {
    r := chi.NewRouter()

    r.Use(func(next http.Handler) http.Handler {
        return otelhttp.NewHandler(next, "http.request")
    })
    r.Use(middleware.RequestID)
    // ... other middleware and routes
    return r
}
```

### Database Instrumentation

When using pgx, add the OpenTelemetry tracer to the pool config:

```go
import "github.com/jackc/pgx/v5/pgxpool"

config, _ := pgxpool.ParseConfig(databaseURL)
config.ConnConfig.Tracer = otelpgx.NewTracer()
```

### Health and Readiness Endpoints

```go
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(http.StatusOK)
    w.Write([]byte(`{"status":"ok"}`))
}

func (h *Handler) Ready(w http.ResponseWriter, r *http.Request) {
    if err := h.pool.Ping(r.Context()); err != nil {
        w.WriteHeader(http.StatusServiceUnavailable)
        w.Write([]byte(`{"status":"not ready"}`))
        return
    }
    w.WriteHeader(http.StatusOK)
    w.Write([]byte(`{"status":"ready"}`))
}
```

Register both in the router **outside** the auth middleware:

```go
r.Get("/health", h.Health)
r.Get("/ready", h.Ready)
```

### Slog Trace Correlation

Inject trace and span IDs into slog records for log correlation:

```go
func TracingMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        span := trace.SpanFromContext(r.Context())
        if span.SpanContext().IsValid() {
            logger := slog.Default().With(
                "trace_id", span.SpanContext().TraceID().String(),
                "span_id", span.SpanContext().SpanID().String(),
            )
            ctx := context.WithValue(r.Context(), loggerKey, logger)
            r = r.WithContext(ctx)
        }
        next.ServeHTTP(w, r)
    })
}
```

### Config

```go
type OtelConfig struct {
    Enabled     bool   `koanf:"enabled"`
    Endpoint    string `koanf:"endpoint"`     // e.g. "localhost:4317"
    ServiceName string `koanf:"service_name"`
    Insecure    bool   `koanf:"insecure"`     // disable TLS for local dev
}
```

Conventions:

- set `OTEL_EXPORTER_OTLP_ENDPOINT` via env for deployment flexibility
- use `insecure: true` only in local dev; production must use TLS
- flush traces and metrics during graceful shutdown (call the `OtelShutdown` function before closing DB pools)
- keep secret-bearing fields out of span attributes and log records

### Shutdown Integration

Update `main.go` to initialize and tear down observability:

```go
if cfg.Otel.Enabled {
    otelShutdown, err := observability.SetupOtel(ctx, cfg.Otel.ServiceName, version)
    if err != nil {
        slog.Error("failed to setup otel", "error", err)
        os.Exit(1)
    }
    defer func() {
        shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
        defer cancel()
        if err := otelShutdown(shutdownCtx); err != nil {
            slog.Error("otel shutdown error", "error", err)
        }
    }()
}
```

## Middleware

### Logging Middleware

```go
func LoggingMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)

        next.ServeHTTP(ww, r)

        slog.Info("request",
            "method", r.Method,
            "path", r.URL.Path,
            "status", ww.Status(),
            "duration_ms", time.Since(start).Milliseconds(),
            "bytes", ww.BytesWritten(),
        )
    })
}
```

### Auth Middleware

```go
func AuthMiddleware(secret string) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
            if token == "" {
                http.Error(w, "unauthorized", http.StatusUnauthorized)
                return
            }

            // validate token (JWT, opaque, etc.)
            claims, err := validateToken(token, secret)
            if err != nil {
                http.Error(w, "unauthorized", http.StatusUnauthorized)
                return
            }

            ctx := context.WithValue(r.Context(), userClaimsKey, claims)
            next.ServeHTTP(w, r.WithContext(ctx))
        })
    }
}
```

## Lint Configuration

### .golangci.yml

```yaml
run:
  timeout: 5m

linters:
  enable:
    - revive
    - govet
    - errcheck
    - staticcheck
    - gosimple
    - unused
    - ineffassign
    - gocritic
    - gofumpt
    - misspell
    - nolintlint
    - prealloc
    - unconvert
    - gosec

linters-settings:
  revive:
    rules:
      - name: exported
        arguments:
          - "checkPrivateReceivers"
      - name: blank-imports
      - name: context-as-argument
      - name: context-keys-type
      - name: error-return
      - name: error-strings
      - name: error-naming
      - name: increment-decrement
      - name: var-naming
      - name: package-comments
      - name: range
      - name: receiver-naming
      - name: indent-error-flow
      - name: superfluous-else
      - name: unreachable-code

  govet:
    enable-all: true

  gocritic:
    enabled-tags:
      - diagnostic
      - style
      - performance
```

## Testing

Use table-driven tests with testify:

```go
func TestUserService_GetByID(t *testing.T) {
    tests := []struct {
        name    string
        id      int64
        want    *model.User
        wantErr error
    }{
        {
            name:    "existing user",
            id:      1,
            want:    &model.User{ID: 1, Name: "Alice"},
            wantErr: nil,
        },
        {
            name:    "not found",
            id:      999,
            want:    nil,
            wantErr: ErrNotFound,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            svc := setupTestService(t)
            got, err := svc.GetByID(context.Background(), tt.id)

            if tt.wantErr != nil {
                require.ErrorIs(t, err, tt.wantErr)
                return
            }

            require.NoError(t, err)
            assert.Equal(t, tt.want.Name, got.Name)
        })
    }
}
```

Rules:

- prefer real dependencies (test database, test server) over mocks when feasible
- use `go.uber.org/mock` (`mockgen`) for interface mocking when external services are impractical to test against
- use `t.Parallel()` where tests are independent
- use `testcontainers-go` for integration tests needing a real database

## Taskfile

```yaml
version: "3"

tasks:
  dev:
    desc: Run with hot reload
    cmd: air

  build:
    desc: Build binary
    cmd: go build -o bin/server ./cmd/server

  test:
    desc: Run tests
    cmd: go test -race ./...

  test-cover:
    desc: Run tests with coverage
    cmd: go test -race -coverprofile=coverage.out ./... && go tool cover -func=coverage.out

  lint:
    desc: Run linters
    cmd: golangci-lint run

  fmt:
    desc: Format code
    cmd: goimports -w .

  tidy:
    desc: Tidy modules
    cmd: go mod tidy

  sqlc:
    desc: Generate sqlc code
    cmd: sqlc generate

  migrate-up:
    desc: Run migrations
    cmd: goose -dir db/migrations postgres "$DATABASE_URL" up

  migrate-create:
    desc: Create new migration
    cmd: goose -dir db/migrations create {{.CLI_ARGS}} sql

  check:
    desc: Run all quality gates
    deps: [fmt, lint, test, build, tidy]
```

## CI Pipeline

Use a two-stage model: formatting gate first, then parallel checks.

```yaml
jobs:
  fmt:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
      - uses: actions/setup-go@<sha>
        with:
          go-version-file: go.mod
      - run: test -z "$(goimports -l .)"

  lint:
    needs: [fmt]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
      - uses: actions/setup-go@<sha>
        with:
          go-version-file: go.mod
      - uses: golangci/golangci-lint-action@<sha>
        with:
          version: latest

  test:
    needs: [fmt]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
      - uses: actions/setup-go@<sha>
        with:
          go-version-file: go.mod
      - run: |
          go test -race -coverprofile=coverage.out ./...
          # Enforce 80% coverage threshold
          COVERAGE=$(go tool cover -func=coverage.out | grep total | awk '{print substr($3, 1, length($3)-1)}')
          echo "Total coverage: ${COVERAGE}%"
          awk "BEGIN {exit ($COVERAGE < 80.0) ? 1 : 0}" || (echo "Coverage ${COVERAGE}% is below 80% threshold" && exit 1)

  build:
    needs: [fmt]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
      - uses: actions/setup-go@<sha>
        with:
          go-version-file: go.mod
      - run: go build ./...

  tidy:
    needs: [fmt]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
      - uses: actions/setup-go@<sha>
        with:
          go-version-file: go.mod
      - run: go mod tidy && git diff --exit-code go.mod go.sum

  security:
    needs: [fmt]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
      - uses: actions/setup-go@<sha>
        with:
          go-version-file: go.mod
      - run: go install github.com/securego/gosec/v2/cmd/gosec@latest
      - run: gosec ./...
```

## Security Patterns

### Input Validation

Validate at API boundaries using struct tags:

```go
type CreateUserRequest struct {
    Name  string `json:"name" validate:"required,min=1,max=255"`
    Email string `json:"email" validate:"required,email"`
}

var validate = validator.New(validator.WithRequiredStructEnabled())

func (h *Handler) CreateUser(w http.ResponseWriter, r *http.Request) {
    var req CreateUserRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid request body", http.StatusBadRequest)
        return
    }
    if err := validate.Struct(req); err != nil {
        http.Error(w, "validation failed", http.StatusUnprocessableEntity)
        return
    }
    // ...
}
```

### SSRF Protection

When accepting user-provided URLs for callbacks or webhooks:

```go
func isSafeURL(rawURL string) error {
    u, err := url.Parse(rawURL)
    if err != nil {
        return fmt.Errorf("invalid url: %w", err)
    }

    ips, err := net.LookupIP(u.Hostname())
    if err != nil {
        return fmt.Errorf("dns lookup failed: %w", err)
    }

    for _, ip := range ips {
        if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() {
            return fmt.Errorf("url resolves to private IP: %s", ip)
        }
    }

    return nil
}
```

### Constant-Time Secret Comparison

```go
import "crypto/subtle"

func verifyToken(provided, expected string) bool {
    return subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) == 1
}
```

## Pre-Commit Security Checklist

Before every commit, verify:

- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] All user inputs validated (`go-playground/validator` at API boundaries)
- [ ] SQL injection prevention (parameterized queries via sqlc/pgx)
- [ ] XSS prevention (sanitized output for any HTML-rendering endpoints)
- [ ] CSRF protection enabled (for browser-facing APIs)
- [ ] Authentication/authorization verified on all protected endpoints
- [ ] Rate limiting applied to public-facing endpoints
- [ ] Error messages do not leak internal details (stack traces, SQL errors)
- [ ] Secrets not logged, serialized, or included in error messages
- [ ] Outbound HTTP calls use `context.WithTimeout`

### Security Response Protocol

If a security issue is found during development:

1. **STOP** — do not continue feature work
2. Use **security-reviewer** agent for comprehensive analysis
3. Fix CRITICAL issues before any other work
4. Rotate any secrets that may have been exposed
5. Review codebase for similar patterns

## Code Quality Standards

### Immutability

Prefer value semantics and immutable data. Create new structs rather than mutating existing ones:

```go
// WRONG: mutation
func updateUser(u *User, name string) {
    u.Name = name
}

// CORRECT: return new value
func updateUser(u User, name string) User {
    u.Name = name
    return u
}
```

When mutation is necessary (e.g., database connection pools), document why and contain it behind an interface.

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
- [ ] Proper error handling with context wrapping
- [ ] No hardcoded values (use constants or config)
- [ ] Immutable patterns used where possible
- [ ] Import grouping correct (stdlib / external / internal)

## Development Workflow

This skill defines implementation standards. The `/pma` skill controls the overall workflow. Within implementation, follow these phases:

### Phase 0: Research & Reuse

Before writing new code:

1. **GitHub search first**: `gh search repos` and `gh search code` for existing implementations
2. **Library docs**: Use Context7 or pkg.go.dev to confirm API behavior
3. **Package registries**: Search pkg.go.dev before writing utility code
4. **Adaptable implementations**: Look for open-source projects solving 80%+ of the problem

Prefer adopting a proven approach over writing net-new code.

### Phase 1: Plan

- Use **planner** agent to create implementation plan
- Generate architecture docs before coding
- Identify dependencies and risks

### Phase 2: TDD

- Use **tdd-guide** agent proactively for new features
- Write test first (RED) — run and confirm it fails
- Write minimal implementation (GREEN) — run and confirm it passes
- Refactor (IMPROVE)
- Verify 80%+ coverage with `go test -cover`

### Phase 3: Code Review

- Use **code-reviewer** agent immediately after writing code
- Address CRITICAL and HIGH issues before committing
- Fix MEDIUM issues when possible

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
