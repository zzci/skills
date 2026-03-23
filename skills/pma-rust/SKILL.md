---
name: pma-rust
description: Rust implementation guide for PMA-managed multi-crate workspace projects. Covers workspace config, pinned stable toolchains, strict linting with clippy and cargo-cranky, async data access (Diesel-async or SQLx), Axum/Tokio service patterns, layered config with figment + clap, rustls-only TLS, OpenTelemetry observability, and CI quality gates.
---

# Rust Project Implementation Guide

Use this skill together with `/pma`. `/pma` controls workflow, approval, and task tracking; this guide defines the implementation baseline for Rust delivery work after implementation is approved.

## Scope

**For:** PMA-managed Rust backends, services, and CLI applications built as multi-crate workspaces.

**Not for:** embedded / `no_std` targets, library-only crates published to crates.io, or projects that do not use the `/pma` workflow.

Goals:

- predictable workspace structure
- strict safety and linting defaults
- explicit configuration and shutdown behavior
- reproducible builds
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
| Language | Rust (edition 2024) | pinned stable toolchain; nightly only when unstable features are needed |
| Build | Cargo workspaces | multi-crate monorepo |
| Format | rustfmt | `imports_granularity = "Module"` |
| Lint | clippy + cargo-cranky | deny unsafe / unwrap / expect / unchecked indexing |
| Dependency audit | cargo-deny | bans + licenses + advisories |
| Errors | thiserror 2 + anyhow 1 | typed local errors + boundary propagation |
| Serialization | serde + serde_json | derive |
| TLS | rustls 0.23 + aws-lc-rs | OpenSSL is banned |
| Secret compare | subtle 2 | constant-time comparison for auth tokens and secrets |

### Default

| Category | Technology | Notes |
|---|---|---|
| Task runner | just | command runner for local and CI tasks |
| Runtime | Tokio | full features |
| HTTP server | Axum 0.8 | middleware + graceful shutdown |
| HTTP client | reqwest 0.13 | `rustls-tls`, no OpenSSL |
| Data access | Diesel 2 + diesel-async + deadpool | async ORM with compile-time schema safety |
| Config | figment 0.10 | layered: defaults -> file -> env -> CLI |
| CLI | clap 4 | derive macros, subcommands |
| Serialization (config) | toml | for config files |

### Optional

| Category | Technology | When to adopt |
|---|---|---|
| Cache | DashMap 6 | concurrent in-memory cache needed |
| Observability | OpenTelemetry (tracing-opentelemetry) | production services requiring distributed tracing |
| Logging format | JSON via tracing-subscriber | machine-readable environments |

### Alternative

| Replaces | Technology | Notes |
|---|---|---|
| Diesel + diesel-async | SQLx 0.8 | native async, compile-time query checking, lighter dependency tree; prefer when raw SQL is acceptable |

## Required Quality Gates

Every PMA-Rust project should define these checks before merge:

| Gate | Requirement |
|---|---|
| Format | `cargo fmt --check` passes |
| Lint | `cargo cranky --all-features --all-targets -- -D warnings` passes |
| Dependency policy | `cargo deny check` passes |
| Test | `cargo test --all-features` passes |
| Build | `cargo build --all-features --release` succeeds |
| Security review | auth, secrets, outbound HTTP, and config changes reviewed |
| Vulnerability scan | `cargo audit` passes |

If a project is missing one of these commands, add it instead of leaving the expectation undocumented.

## Workspace Structure

```text
Cargo.toml                          # [workspace] root
Cargo.lock
rust-toolchain.toml                 # pinned stable toolchain
rustfmt.toml
clippy.toml
Cranky.toml                         # cargo-cranky lint config
deny.toml                           # cargo-deny config
justfile
.cargo/
  config.toml
.github/
  workflows/
    ci.yml
docs/
  architecture.md
  changelog.md
  task/
  plan/
crates/
  app/                              # main binary crate
    src/
      main.rs
      cli.rs
      config.rs
  core/                             # runtime services and domain logic
    src/
      services.rs
      protocols/
      state.rs
  db/                               # Diesel ORM + migrations
    src/
      lib.rs
      schema.rs
      models.rs
      migrations/
    diesel.toml
  common/                           # shared config, errors, helpers, types
    src/
      error.rs
      types/
      helpers/
tests/                              # integration tests if the project needs them
```

## Required Conventions

| Area | Convention |
|---|---|
| Crate naming | use stable, project-prefixed crate names for reusable crates |
| Imports | group std / external / local imports; format at module granularity |
| Error types | per-crate `thiserror` enums, `anyhow` only at boundaries |
| Shared state | clone services built from pools, `Arc<T>`, and immutable config |
| Secrets | redact secrets from `Debug` output |
| Config | figment layering: defaults -> file -> env -> CLI |
| CLI | clap derive with explicit `Option<T>` override fields |
| HTTP | Axum routers + middleware + graceful shutdown |
| TLS | rustls only; OpenSSL is banned |
| Auth | constant-time token comparison for secrets |
| Shutdown | handle SIGINT / SIGTERM and drain in-flight work |

## Code Quality Standards

### Immutability

Prefer immutable data by default. Use owned values and return new structs rather than mutating in place:

```rust
// WRONG: mutation via &mut
fn update_name(user: &mut User, name: String) {
    user.name = name;
}

// CORRECT: return new value
fn with_name(user: User, name: String) -> User {
    User { name, ..user }
}
```

When mutation is necessary (e.g., connection pools, caches behind `Arc<Mutex<_>>`), document why and contain it behind an interface.

### File and Function Size Limits

| Metric | Target | Maximum |
|---|---|---|
| File length | 200-400 lines | 800 lines |
| Function length | < 30 lines | 50 lines |
| Nesting depth | 2 levels | 4 levels |

Extract utilities from large modules. Organize by feature/domain, not by type.

### Code Quality Checklist

Before marking work complete:

- [ ] Code is readable and well-named
- [ ] Functions are small (< 50 lines)
- [ ] Files are focused (< 800 lines)
- [ ] No deep nesting (> 4 levels)
- [ ] Proper error handling (thiserror/anyhow, no unwrap/expect)
- [ ] No hardcoded values (use constants or config)
- [ ] Immutable patterns used where possible
- [ ] Imports grouped: std / external / local

## Naming Conventions

| Element | Convention | Example |
|---|---|---|
| Types / Traits | `PascalCase` | `UserService`, `Repository` |
| Functions / Methods | `snake_case` | `find_by_id`, `create_user` |
| Constants | `SCREAMING_SNAKE_CASE` | `MAX_RETRIES`, `DEFAULT_PORT` |
| Modules | `snake_case` | `user_service`, `db` |
| Lifetimes | Short lowercase | `'a`, `'de`, `'ctx` |
| Crate names | `kebab-case` | `my-app-core` |

## Rust Idioms

- Prefer `impl Trait` over explicit generics when possible
- Use `Default` trait for struct initialization
- Prefer iterators over manual loops
- Use `Option` and `Result` — never panic in library code
- Prefer `into()` / `from()` conversions via `From`/`Into` traits
- Prefer borrowing (`&T`, `&mut T`) over cloning
- Use `Clone` only when ownership transfer is truly needed
- Prefer `&str` over `String` in function parameters
- Use `Cow<'_, str>` when you need both owned and borrowed
- Enable `#![forbid(unsafe_code)]` at the crate root for compile-time enforcement

## Workspace Cargo.toml

```toml
[workspace]
resolver = "2"
members = ["crates/*"]
default-members = ["crates/app"]

[workspace.package]
version = "0.1.0"
edition = "2024"
license = "Apache-2.0"

[workspace.dependencies]
tokio = { version = "1", features = ["full"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
toml = "0.8"
thiserror = "2"
anyhow = "1.0"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "time", "local-time", "ansi"] }
clap = { version = "4", features = ["derive"] }
axum = { version = "0.8", features = ["multipart"] }
reqwest = { version = "0.13", default-features = false, features = ["json", "rustls-tls"] }
figment = { version = "0.10", features = ["toml", "env"] }

# Option A: Diesel async (ORM + async pool)
diesel = { version = "2", features = ["postgres"] }
diesel-async = { version = "0.5", features = ["deadpool", "postgres"] }
diesel_migrations = "2"

# Option B: SQLx (native async, compile-time checked queries)
# sqlx = { version = "0.8", features = ["runtime-tokio", "tls-rustls", "postgres", "migrate"] }
dashmap = "6"
subtle = "2"

[profile.release]
lto = true
panic = "abort"
strip = "debuginfo"
```

Pin shared dependencies in `[workspace.dependencies]` so crate-level manifests stay small and consistent.

## Toolchain and Compiler Flags

### rust-toolchain.toml

```toml
[toolchain]
channel = "1.86.0"
components = ["rustfmt", "clippy"]
```

Pin a specific stable release for reproducibility. Use nightly only when the project requires unstable features (e.g. `-Zremap-cwd-prefix`).

### .cargo/config.toml

```toml
[target.'cfg(all())']
rustflags = [
  "--cfg", "tokio_unstable",
  "--remap-path-prefix=$HOME=/reproducible-home",
  "--remap-path-prefix=$PWD=/reproducible-pwd",
]
```

Notes:

- `tokio_unstable` enables tokio console and task IDs when the project needs them; omit if not used
- path remapping supports reproducible builds across environments
- `-Zremap-cwd-prefix` requires nightly; on stable, use `--remap-path-prefix` instead

## Lint Configuration

### rustfmt.toml

```toml
imports_granularity = "Module"
group_imports = "StdExternalCrate"
```

### clippy.toml

```toml
avoid-breaking-exported-api = false
allow-unwrap-in-tests = true
```

### Cranky.toml

```toml
[cranky]
deny = [
  "unsafe_code",
  "clippy::unwrap_used",
  "clippy::expect_used",
  "clippy::panic",
  "clippy::indexing_slicing",
  "clippy::dbg_macro",
]
allow = [
  "clippy::result_large_err",
]
```

Hard rule:

- `unsafe`, `unwrap`, `expect`, and unchecked indexing are not allowed in normal application code
- if a startup path must abort the process, keep that exception local, explicit, and easy to review

### deny.toml

```toml
[bans]
deny = [
  { crate = "openssl-sys", use-instead = "rustls" },
]

[licenses]
allow = [
  "MIT", "Apache-2.0", "ISC",
  "BSD-2-Clause", "BSD-3-Clause",
  "Zlib", "CC0-1.0",
]
```

## Error Handling

Use a two-tier error model:

1. `thiserror` for crate-local typed errors
2. `anyhow::Result<T>` at boundaries where the exact type is no longer useful

Example:

```rust
#[derive(thiserror::Error, Debug)]
pub enum AppError {
    #[error("database error: {0}")]
    Database(#[from] diesel::result::Error),

    #[error("config error: {0}")]
    Config(#[from] ConfigError),

    #[error(transparent)]
    Other(#[from] anyhow::Error),
}
```

### Secret Handling

Wrap secrets in a type that redacts `Debug` output:

```rust
pub struct Secret<T>(T);

impl<T> std::fmt::Debug for Secret<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("<secret>")
    }
}
```

## Architecture Patterns

### Services

Prefer explicit, cheaply cloned services:

```rust
#[derive(Clone)]
pub struct Services {
    pub db: DbPool,
    pub config: Arc<AppConfig>,
    pub cache: Arc<Cache>,
}
```

Avoid wrapping the entire application in one `Arc<Mutex<...>>`. Share only what is truly mutable.

### Protocol Server Trait

```rust
pub trait ProtocolServer {
    fn name(&self) -> &'static str;
    fn run(self, address: ListenEndpoint) -> impl Future<Output = Result<()>> + Send;
}
```

### Trait Polymorphism

Prefer enum-based dispatch over `Box<dyn Trait>` when you need polymorphism with predictable runtime cost. Use `enum_dispatch` crate or hand-written `match` arms depending on project preference and cross-crate requirements.

### Debug Lock Diagnostics

If a project uses `tokio::sync::Mutex`, prefer a debug-only timeout wrapper so deadlocks surface early:

```rust
#[cfg(debug_assertions)]
pub async fn lock(&self) -> anyhow::Result<MutexGuard<'_, T>> {
    tokio::time::timeout(Duration::from_secs(5), self.inner.lock())
        .await
        .map_err(|_| anyhow::anyhow!("possible deadlock on mutex: {}", self.name))
}
```

## Database

Choose one data access strategy per project:

| Option | When to use |
|---|---|
| **Diesel + diesel-async** | need ORM, migrations, schema DSL; team prefers compile-time schema safety |
| **SQLx** | prefer raw SQL with compile-time query checking; lighter dependency tree |

### Migration Rules

**NEVER write migration files by hand.** Always use the CLI to generate them:

- Diesel: `diesel migration generate <name>` — generates timestamped `up.sql` / `down.sql`
- SQLx: `sqlx migrate add <name>` — generates timestamped migration file
- Each migration must include both `up` and `down` (rollback) statements
- Test migrations against a clean database before committing
- Never modify a migration that has already been applied in any shared environment

### Crate Structure (shared by both options)

```text
crates/
  db/
    src/
      lib.rs
      schema.rs          # Diesel only
      models.rs
      migrations/
        00000000000000_create_xxx/
          up.sql
          down.sql
    diesel.toml          # Diesel only
```

### Option A: Diesel + diesel-async + deadpool

#### diesel.toml

```toml
[print_schema]
file = "src/schema.rs"

[migrations_directory]
dir = "src/migrations"
```

#### Feature Flags

```toml
[features]
default = ["postgres"]
postgres = ["diesel/postgres", "diesel-async/postgres", "diesel-async/deadpool"]
```

#### Async Connection Pool

```rust
use anyhow::Context;
use diesel_async::{
    pooled_connection::{deadpool::Pool, AsyncDieselConnectionManager},
    AsyncPgConnection,
};

pub type DbPool = Pool<AsyncPgConnection>;

pub fn establish_pool(database_url: &str) -> anyhow::Result<DbPool> {
    let config = AsyncDieselConnectionManager::<AsyncPgConnection>::new(database_url);
    Pool::builder(config)
        .max_size(10)
        .build()
        .context("failed to create database pool")
}
```

#### Migration

```rust
use anyhow::Context;
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};

const MIGRATIONS: EmbeddedMigrations = embed_migrations!("src/migrations");

pub fn run_migrations(
    conn: &mut impl MigrationHarness<diesel::pg::Pg>,
) -> anyhow::Result<()> {
    conn.run_pending_migrations(MIGRATIONS)
        .context("failed to run pending migrations")?;
    Ok(())
}
```

#### CLI

```bash
cargo install diesel_cli --no-default-features --features postgres
diesel setup
diesel migration generate create_users
diesel migration run
diesel print-schema > src/schema.rs
```

### Option B: SQLx

#### Connection Pool

```rust
use anyhow::Context;
use sqlx::postgres::PgPoolOptions;

pub type DbPool = sqlx::PgPool;

pub async fn establish_pool(database_url: &str) -> anyhow::Result<DbPool> {
    PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await
        .context("failed to create database pool")
}
```

#### Migration

```bash
cargo install sqlx-cli --no-default-features --features postgres,rustls
sqlx database create
sqlx migrate add create_users
sqlx migrate run
```

#### Compile-time Query Checking

```rust
let user = sqlx::query_as!(
    User,
    "SELECT id, name, email FROM users WHERE id = $1",
    user_id
)
.fetch_one(&pool)
.await?;
```

Run `cargo sqlx prepare` to generate offline query metadata for CI builds without a live database.

## Configuration System

Layer configuration in this order:

```text
compiled defaults
  -> TOML file
  -> environment variables
  -> CLI overrides
```

### Config Structs

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    pub logging: LoggingConfig,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct DatabaseConfig {
    pub url: String,
    pub max_connections: u32,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct LoggingConfig {
    pub level: String,
    pub format: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            server: ServerConfig { host: "0.0.0.0".into(), port: 3000 },
            database: DatabaseConfig {
                url: "postgres://user:pass@localhost:5432/myapp".into(),
                max_connections: 10,
            },
            logging: LoggingConfig { level: "info".into(), format: "text".into() },
        }
    }
}
```

### CLI Struct

```rust
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "myapp", about = "Application description")]
pub struct Cli {
    #[arg(short, long, default_value = "config.toml")]
    pub config: String,

    #[arg(long)]
    pub port: Option<u16>,

    #[arg(long)]
    pub log_level: Option<String>,

    #[command(subcommand)]
    pub command: Command,
}

#[derive(Subcommand)]
pub enum Command {
    Run,
    Check,
    Version,
    Init,
}
```

### Layered Loading with figment

```rust
use figment::{
    Figment,
    providers::{Env, Format, Serialized, Toml},
};

impl AppConfig {
    pub fn load(cli: &Cli) -> anyhow::Result<Self> {
        let mut figment = Figment::new()
            .merge(Serialized::defaults(AppConfig::default()))
            .merge(Toml::file(&cli.config))
            .merge(Env::prefixed("APP_").split("_"));

        if let Some(port) = cli.port {
            figment = figment.merge(Serialized::default("server.port", port));
        }
        if let Some(ref level) = cli.log_level {
            figment = figment.merge(Serialized::default("logging.level", level));
        }

        Ok(figment.extract()?)
    }
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
port = 3000

[database]
url = "postgres://user:pass@localhost:5432/myapp"
max_connections = 10

[logging]
level = "info"        # debug, info, warn, error
format = "text"       # text (dev), json (production)

[otel]
enabled = false
endpoint = "http://localhost:4317"
service_name = "myapp"
insecure = true       # disable TLS for local dev only
```

### Config File Conventions

| Convention | Rule |
|---|---|
| File name | `config.toml` at project root |
| Format | TOML (consistent with Cargo ecosystem) |
| Env prefix | `APP_` — maps `APP_SERVER_PORT` to `server.port` via figment `Env::prefixed("APP_").split("_")` |
| Sections | one top-level table per concern: `[server]`, `[database]`, `[logging]`, `[otel]` |
| Secrets | **never** commit real secrets; use env vars or a secret manager for `database.url`, API keys, etc. |
| Defaults | compiled into the `Default` impl; config file overrides defaults; env overrides file; CLI overrides env |
| Validation | validate immediately after loading; fail fast with a clear error message |
| `.gitignore` | add `config.local.toml` for personal overrides; never ignore the reference `config.toml` |

### Config Validation

Validate after loading, before any service starts:

```rust
impl AppConfig {
    pub fn validate(&self) -> anyhow::Result<()> {
        anyhow::ensure!(!self.database.url.is_empty(), "database.url must not be empty");
        anyhow::ensure!(self.server.port > 0, "server.port must be > 0");
        anyhow::ensure!(
            ["debug", "info", "warn", "error"].contains(&self.logging.level.as_str()),
            "logging.level must be one of: debug, info, warn, error"
        );
        Ok(())
    }
}
```

### Environment Variable Mapping

```text
Config field          Environment variable         Example
─────────────────────────────────────────────────────────────
server.host           APP_SERVER_HOST              APP_SERVER_HOST=127.0.0.1
server.port           APP_SERVER_PORT              APP_SERVER_PORT=9090
database.url          APP_DATABASE_URL             APP_DATABASE_URL=postgres://...
database.max_conns    APP_DATABASE_MAX_CONNECTIONS  APP_DATABASE_MAX_CONNECTIONS=20
logging.level         APP_LOGGING_LEVEL            APP_LOGGING_LEVEL=debug
logging.format        APP_LOGGING_FORMAT           APP_LOGGING_FORMAT=json
otel.enabled          APP_OTEL_ENABLED             APP_OTEL_ENABLED=true
otel.endpoint         APP_OTEL_ENDPOINT            APP_OTEL_ENDPOINT=http://otel:4317
```

Conventions:

- do not hand-roll merge precedence
- keep env overrides namespaced with `APP_`
- use `Option<T>` CLI fields so only explicit overrides win
- ship `config.toml` as reference; use `config.local.toml` (gitignored) for personal overrides

## Signal Handling

Graceful shutdown should handle SIGINT and SIGTERM:

```rust
use anyhow::Context;
use tokio::signal;

pub async fn shutdown_signal() -> anyhow::Result<()> {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .context("failed to install Ctrl+C handler")
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .context("failed to install SIGTERM handler")?
            .recv()
            .await;
        Ok::<(), anyhow::Error>(())
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<anyhow::Result<()>>();

    tokio::select! {
        result = ctrl_c => {
            result?;
            tracing::info!("received Ctrl+C, shutting down");
        }
        result = terminate => {
            result?;
            tracing::info!("received SIGTERM, shutting down");
        }
    }

    Ok(())
}
```

Shutdown checklist:

- stop accepting new work
- drain or time out in-flight requests
- flush logs
- close pools and background tasks cleanly

## API Documentation

### OpenAPI Specification

**Every API project must have an OpenAPI 3.1 specification.** Generate it from code — never maintain a separate YAML/JSON file by hand.

Use **utoipa** for derive-macro-based OpenAPI generation:

```toml
# Cargo.toml
utoipa = { version = "5", features = ["axum_extras"] }
utoipa-scalar = { version = "0.3", features = ["axum"] }
```

#### Handler Annotations

```rust
use utoipa::OpenApi;

#[derive(OpenApi)]
#[openapi(
    paths(get_user, list_users, create_user),
    components(schemas(User, ApiResponse<User>, ApiError)),
    tags((name = "users", description = "User management"))
)]
struct ApiDoc;

/// Get user by ID
#[utoipa::path(
    get,
    path = "/api/v1/users/{id}",
    params(("id" = i32, Path, description = "User ID")),
    responses(
        (status = 200, description = "User found", body = ApiResponse<User>),
        (status = 404, description = "User not found", body = ApiResponse<()>),
    ),
    tag = "users"
)]
async fn get_user(/* ... */) -> impl IntoResponse { /* ... */ }
```

#### Serving the Docs

```rust
use utoipa_scalar::{Scalar, Servable};

let app = Router::new()
    .merge(Scalar::with_url("/docs", ApiDoc::openapi()))
    .nest("/api/v1", api_routes());
```

### API Documentation Rules

| Rule | Requirement |
|---|---|
| Source of truth | OpenAPI spec generated from `#[derive(OpenApi)]` — never hand-written |
| Viewer | Scalar served at `/docs` in development |
| Coverage | every public endpoint must have `#[utoipa::path]` annotations |
| Versioning | spec version matches API version (`/api/v1` → `info.version: 1.x`) |

## HTTP Server with Axum

### Router Structure

```rust
use axum::{middleware, routing::get, Router};

pub fn create_router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .nest("/api/v1", api_routes().layer(middleware::from_fn(verify_token)))
        .with_state(state)
}
```

### AppState

```rust
#[derive(Clone)]
pub struct AppState {
    pub services: Services,
}
```

### Handler Pattern

```rust
async fn get_item(
    State(state): State<AppState>,
    Path(id): Path<i32>,
) -> Result<Json<Item>, AppError> {
    let conn = &mut state.services.db.get().map_err(anyhow::Error::from)?;
    let item = items::table.find(id).first(conn)?;
    Ok(Json(item))
}
```

### API Response Envelope

Use a consistent response format:

```rust
#[derive(Serialize)]
struct ApiResponse<T: Serialize> {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<ApiError>,
}

#[derive(Serialize)]
struct ApiError {
    code: String,
    message: String,
}

fn ok<T: Serialize>(data: T) -> Json<ApiResponse<T>> {
    Json(ApiResponse { success: true, data: Some(data), error: None })
}

fn err<T: Serialize>(code: &str, message: &str) -> (StatusCode, Json<ApiResponse<T>>) {
    (StatusCode::BAD_REQUEST, Json(ApiResponse {
        success: false, data: None,
        error: Some(ApiError { code: code.into(), message: message.into() }),
    }))
}
```

### Auth Middleware

```rust
use subtle::ConstantTimeEq;

async fn verify_token(
    headers: HeaderMap,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));

    match token {
        Some(t) if t.as_bytes().ct_eq(expected.as_bytes()).into() => {
            Ok(next.run(request).await)
        }
        _ => Err(StatusCode::UNAUTHORIZED),
    }
}
```

### Graceful Shutdown

```rust
let listener = tokio::net::TcpListener::bind(&addr).await?;
axum::serve(listener, router)
    .with_graceful_shutdown(async {
        if let Err(error) = shutdown_signal().await {
            tracing::error!(?error, "shutdown signal handler failed");
        }
    })
    .await?;
```

## Security

### Constant-Time Secret Comparison

Always use `subtle::ConstantTimeEq` for auth tokens, API keys, and HMAC values. Never compare secrets with `==`.

### SSRF Protection

When a project accepts user-provided callback or webhook URLs, validate the resolved IP before making outbound requests:

```rust
use std::net::IpAddr;

fn is_private_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_private() || v4.is_loopback() || v4.is_link_local()
                || v4.is_broadcast() || v4.is_unspecified()
        }
        IpAddr::V6(v6) => v6.is_loopback() || v6.is_unspecified(),
    }
}
```

### Concurrent Cache

Use `DashMap` for shared in-memory caches that need concurrent reads and writes:

```rust
use dashmap::DashMap;

pub struct Cache {
    inner: DashMap<String, CachedItem>,
}
```

### Pre-Commit Security Checklist

Before every commit, verify:

- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] All user inputs validated (Zod-equivalent: serde + custom validation)
- [ ] SQL injection prevention (parameterized queries via Diesel/SQLx)
- [ ] Authentication/authorization verified on all protected endpoints
- [ ] Rate limiting applied to public-facing endpoints
- [ ] Error messages do not leak internal details
- [ ] Secrets not logged or serialized (use `Secret<T>` wrapper)
- [ ] `#![forbid(unsafe_code)]` enabled at crate root
- [ ] `cargo audit` passes with no known vulnerabilities

### Security Response Protocol

If a security issue is found during development:

1. **STOP** — do not continue feature work
2. Use **security-reviewer** agent for comprehensive analysis
3. Fix CRITICAL issues before any other work
4. Rotate any secrets that may have been exposed
5. Review codebase for similar patterns

## Logging and Observability

### Strategy

| Signal | Tool | Notes |
|---|---|---|
| Traces | `tracing` + `tracing-opentelemetry` + OTLP exporter | distributed request tracing; zero-cost when no subscriber is attached |
| Metrics | `opentelemetry` metrics SDK + OTLP exporter | request duration, error rate, queue depth, custom counters |
| Logs | `tracing-subscriber` (console / JSON) | structured logs; auto-correlated with trace/span IDs via the OTel layer |
| Health | `/health` and `/ready` Axum routes | liveness and readiness probes for orchestrators |

### Logging Setup

Use `tracing` and `tracing-subscriber` with layers appropriate to the project:

- console logs with ANSI colors for local development
- JSON logs for machine-readable environments
- environment-driven filtering
- optional project-specific sinks such as files or databases if justified

```rust
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

pub fn init_logging(json: bool) {
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));

    let registry = tracing_subscriber::registry().with(env_filter);

    if json {
        registry.with(fmt::layer().json()).init();
    } else {
        registry.with(fmt::layer().with_ansi(true)).init();
    }
}
```

### OpenTelemetry Integration

Observability is **Optional** — adopt when deploying production services that need distributed tracing and metrics.

#### Dependencies

Add to `[workspace.dependencies]` when needed:

```toml
opentelemetry = "0.28"
opentelemetry_sdk = { version = "0.28", features = ["rt-tokio"] }
opentelemetry-otlp = "0.28"
tracing-opentelemetry = "0.29"
```

#### Tracer and Meter Setup

```rust
use anyhow::Context;
use opentelemetry::global;
use opentelemetry_otlp::WithExportConfig;
use opentelemetry_sdk::{
    metrics::SdkMeterProvider,
    resource::{EnvResourceDetector, SdkProvidedResourceDetector, ResourceDetector},
    trace::TracerProvider,
    Resource,
};
use tracing_opentelemetry::OpenTelemetryLayer;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

pub struct OtelGuard {
    tracer_provider: TracerProvider,
    meter_provider: SdkMeterProvider,
}

impl OtelGuard {
    pub fn shutdown(self) {
        if let Err(err) = self.tracer_provider.shutdown() {
            tracing::error!(?err, "failed to shutdown tracer provider");
        }
        if let Err(err) = self.meter_provider.shutdown() {
            tracing::error!(?err, "failed to shutdown meter provider");
        }
    }
}

pub fn init_telemetry(
    service_name: &str,
    service_version: &str,
    otlp_endpoint: &str,
    json_logs: bool,
) -> anyhow::Result<OtelGuard> {
    let resource = Resource::builder()
        .with_service_name(service_name.to_owned())
        .with_attribute(opentelemetry::KeyValue::new(
            "service.version",
            service_version.to_owned(),
        ))
        .build();

    // Traces
    let tracer_provider = opentelemetry_otlp::SpanExporter::builder()
        .with_tonic()
        .with_endpoint(otlp_endpoint)
        .build()
        .map(|exporter| {
            TracerProvider::builder()
                .with_batch_exporter(exporter)
                .with_resource(resource.clone())
                .build()
        })
        .context("failed to create tracer provider")?;

    global::set_tracer_provider(tracer_provider.clone());

    // Metrics
    let meter_provider = opentelemetry_otlp::MetricExporter::builder()
        .with_tonic()
        .with_endpoint(otlp_endpoint)
        .build()
        .map(|exporter| {
            SdkMeterProvider::builder()
                .with_periodic_exporter(exporter)
                .with_resource(resource)
                .build()
        })
        .context("failed to create meter provider")?;

    global::set_meter_provider(meter_provider.clone());

    // Subscriber: tracing layers
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));

    let otel_layer = OpenTelemetryLayer::new(tracer_provider.tracer(service_name.to_owned()));

    let registry = tracing_subscriber::registry()
        .with(env_filter)
        .with(otel_layer);

    if json_logs {
        registry.with(fmt::layer().json()).init();
    } else {
        registry.with(fmt::layer().with_ansi(true)).init();
    }

    Ok(OtelGuard {
        tracer_provider,
        meter_provider,
    })
}
```

#### Axum HTTP Instrumentation

Use `tower-http`'s tracing layer to auto-instrument all incoming requests. Traces are automatically correlated with the OTel layer above:

```rust
use axum::{middleware, Router};
use tower_http::trace::TraceLayer;

pub fn create_router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/ready", get(ready))
        .nest("/api/v1", api_routes().layer(middleware::from_fn(verify_token)))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
```

For finer control over span attributes (e.g. adding route patterns, user IDs):

```rust
use tower_http::trace::{DefaultOnRequest, DefaultOnResponse, TraceLayer};
use tracing::Level;

TraceLayer::new_for_http()
    .make_span_with(|request: &http::Request<_>| {
        tracing::info_span!(
            "http_request",
            method = %request.method(),
            uri = %request.uri(),
            otel.kind = "server",
        )
    })
    .on_request(DefaultOnRequest::new().level(Level::INFO))
    .on_response(DefaultOnResponse::new().level(Level::INFO))
```

#### Database Span Instrumentation

When using SQLx, enable the `tracing` feature for automatic query spans:

```toml
sqlx = { version = "0.8", features = ["runtime-tokio", "tls-rustls", "postgres", "migrate", "tracing"] }
```

When using Diesel-async, wrap repository methods with explicit spans:

```rust
use tracing::instrument;

#[instrument(skip(pool), fields(otel.kind = "client", db.system = "postgresql"))]
pub async fn find_user_by_id(pool: &DbPool, user_id: i32) -> anyhow::Result<User> {
    let mut conn = pool.get().await?;
    users::table
        .find(user_id)
        .first(&mut conn)
        .await
        .map_err(Into::into)
}
```

#### Health and Readiness Endpoints

```rust
async fn health() -> impl IntoResponse {
    Json(serde_json::json!({"status": "ok"}))
}

async fn ready(State(state): State<AppState>) -> impl IntoResponse {
    match state.services.db.get().await {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({"status": "ready"}))),
        Err(_) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"status": "not ready"})),
        ),
    }
}
```

Register both **outside** the auth middleware so orchestrator probes are never blocked:

```rust
Router::new()
    .route("/health", get(health))
    .route("/ready", get(ready))
    .nest("/api/v1", api_routes().layer(...))
```

#### Config

```rust
#[derive(Debug, Deserialize, Serialize)]
pub struct OtelConfig {
    pub enabled: bool,
    pub endpoint: String,       // e.g. "http://localhost:4317"
    pub service_name: String,
    pub insecure: bool,         // disable TLS for local dev
}

impl Default for OtelConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            endpoint: "http://localhost:4317".into(),
            service_name: "myapp".into(),
            insecure: true,
        }
    }
}
```

#### Main Entry Point Integration

```rust
fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    let config = AppConfig::load(&cli)?;

    // Init telemetry (with or without OTel)
    let _otel_guard = if config.otel.enabled {
        Some(init_telemetry(
            &config.otel.service_name,
            env!("CARGO_PKG_VERSION"),
            &config.otel.endpoint,
            config.logging.format == "json",
        )?)
    } else {
        init_logging(config.logging.format == "json");
        None
    };

    let rt = tokio::runtime::Runtime::new()?;
    rt.block_on(async {
        // ... server startup ...
        shutdown_signal().await?;

        // OtelGuard::drop flushes on scope exit
        Ok::<(), anyhow::Error>(())
    })?;

    // Explicit shutdown to flush before process exits
    if let Some(guard) = _otel_guard {
        guard.shutdown();
    }

    Ok(())
}
```

#### Conventions

- set `OTEL_EXPORTER_OTLP_ENDPOINT` via env for deployment flexibility
- use `insecure: true` only in local dev; production must use TLS
- flush traces and metrics during graceful shutdown (the `OtelGuard` pattern above ensures this)
- keep secret-bearing fields redacted before they reach logs or trace spans
- use `#[instrument(skip(secret_field))]` to exclude sensitive arguments from spans
- health and readiness endpoints must remain outside auth middleware

## Development Workflow

This skill defines implementation standards. The `/pma` skill controls the overall workflow. Within implementation, follow these phases:

### Phase 0: Research & Reuse

Before writing new code:

1. **GitHub search first**: `gh search repos` and `gh search code` for existing implementations
2. **Library docs**: Use Context7 or docs.rs/crates.io to confirm API behavior
3. **Package registries**: Search crates.io before writing utility code
4. **Adaptable implementations**: Look for open-source crates solving 80%+ of the problem

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
- Verify 80%+ coverage with `cargo-tarpaulin` or `cargo-llvm-cov`

### Phase 3: Code Review

- Use **code-reviewer** agent immediately after writing code
- Address CRITICAL and HIGH issues before committing
- Fix MEDIUM issues when possible

## Testing

### Test Organization

| Type | Location | How to run |
|---|---|---|
| Unit tests | `#[cfg(test)] mod tests` in same file | `cargo test` |
| Integration tests | `tests/` directory at crate root | `cargo test --test '*'` |
| Doc tests | `///` examples in public APIs | `cargo test --doc` |

### Async Tests

Use `#[tokio::test]` for async test functions:

```rust
#[tokio::test]
async fn test_fetch_user() {
    let pool = setup_test_pool().await;
    let user = find_user_by_id(&pool, 1).await.unwrap();
    assert_eq!(user.name, "Alice");
}
```

### Property-Based Testing

Use `proptest` for invariant verification:

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn test_roundtrip(s in "\\PC*") {
        let encoded = encode(&s);
        let decoded = decode(&encoded).unwrap();
        prop_assert_eq!(s, decoded);
    }
}
```

### Coverage

Use `cargo-tarpaulin` or `cargo-llvm-cov`:

```bash
cargo install cargo-tarpaulin
cargo tarpaulin --out Html --engine llvm
# Target: 80%+ line coverage
```

### Error Enum Per Module

Define a focused error enum per module/crate, not one giant error type:

```rust
// crates/db/src/error.rs — database-specific errors
#[derive(thiserror::Error, Debug)]
pub enum DbError {
    #[error("not found")]
    NotFound,
    #[error("connection failed: {0}")]
    Connection(#[from] diesel::ConnectionError),
}

// crates/core/src/error.rs — service-level errors
#[derive(thiserror::Error, Debug)]
pub enum ServiceError {
    #[error(transparent)]
    Db(#[from] DbError),
    #[error("validation failed: {0}")]
    Validation(String),
}
```

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

## CI Pipeline

Use a two-stage model: formatting gate first, then parallel checks.

```yaml
jobs:
  fmt:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
      - uses: dtolnay/rust-toolchain@<sha>
      - run: cargo fmt --check

  clippy:
    needs: [fmt]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
      - uses: dtolnay/rust-toolchain@<sha>
      - run: cargo cranky --all-features --all-targets -- -D warnings

  test:
    needs: [fmt]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
      - uses: dtolnay/rust-toolchain@<sha>
      - run: cargo test --all-features

  deny:
    needs: [fmt]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
      - uses: EmbarkStudios/cargo-deny-action@<sha>

  audit:
    needs: [fmt]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
      - uses: dtolnay/rust-toolchain@<sha>
      - run: cargo install cargo-audit
      - run: cargo audit

  build:
    needs: [fmt]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
      - uses: dtolnay/rust-toolchain@<sha>
      - run: cargo build --all-features --release
```

## justfile Tasks

```just
check:
    cargo fmt --check
    cargo cranky --all-features --all-targets -- -D warnings
    cargo deny check
    cargo test --all-features

fmt:
    cargo fmt

build:
    cargo build --all-features --release
```

Keep common commands predictable and easy to run locally before CI.
