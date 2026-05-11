# PMA-Rust Baseline

This is the **acceptance baseline** every PMA-Rust project must meet. It is anchored to the standard-bearer projects listed in `SKILL.md` and the official Rust API Guidelines. Citations refer to file paths under `/tmp/pma-rust-research/` (verifiable via `references/evidence.md`).

## Hard Locks

These rules are non-negotiable. Loosening one requires a dated decision record under `docs/decisions/`.

### Lock 1 — Pure Rust ecosystem first

Whenever a pure-Rust alternative exists, do **not** introduce a new dependency that wraps a C library or pulls in `*-sys` transitively.

| C-FFI dep | Pure-Rust alternative | Notes |
|---|---|---|
| `openssl`, `openssl-sys`, `native-tls` | **`rustls`** + `tokio-rustls` + `rustls-pemfile` + `rustls-platform-verifier` | reth bans `openssl` in `deny.toml:35`. Quickwit installs the rustls ring crypto provider at startup |
| `libgit2-sys`, `git2` | **`gix`** (gitoxide) | cargo's `audit.yml` lists `git2` as a watch item |
| `libssh2-sys` | `russh` | |
| `libpq-sys` (sync Postgres) | `tokio-postgres` / `sqlx-postgres` (rustls feature) | |
| `cmake`-built deps | a Rust port if one exists; otherwise vendor `cc` build with explicit `// JUSTIFICATION:` | |

Unavoidable C deps (e.g. `libsqlite3-sys` via `rusqlite`, system `protobuf` for `prost-build`) require a `// JUSTIFICATION:` comment in the workspace `Cargo.toml` next to the dependency, plus a CI gate that pins their versions.

### Lock 2 — rustls only, ring-provider explicit

```rust
// In `main.rs`, before any TLS use:
rustls::crypto::ring::default_provider()
    .install_default()
    .expect("install rustls crypto provider");
```

Pattern verified in `quickwit-cli/src/main.rs:98` (`install_default_crypto_ring_provider()`). Reject any PR that lets `default-features = true` re-enable `native-tls` on dependencies like `reqwest`, `sqlx`, `tonic`, `hyper-util`.

### Lock 3 — `#![forbid(unsafe_code)]` at every crate root

Every `lib.rs` and `main.rs` starts with:

```rust
#![forbid(unsafe_code)]
```

Exceptions (very narrow):
- A crate that genuinely owns FFI or memory layout primitives may relax to `#![deny(unsafe_code)]` and place every `unsafe` block behind a `// SAFETY:` comment that covers aliasing + lifetimes + invariants.
- The pattern in `tokio/src/lib.rs:13` is `#![deny(unsafe_op_in_unsafe_fn)]` — even inside an `unsafe fn`, the `unsafe { … }` block must be explicit. Adopt this in any crate that legitimately uses `unsafe`.

### Lock 4 — Deny warnings everywhere (config-driven, not CLI)

**Rule: `-D warnings` belongs in configuration files, not in CI command lines or shell aliases.** A CI workflow that passes `-- -D warnings` on the command line means developers building locally get a different policy than CI — every "passes locally, fails in CI" headache traces to this. The policy lives in `.cargo/config.toml` and `[workspace.lints]` so that every `cargo build`, `cargo check`, `cargo clippy`, IDE check, and CI job sees the same gate.

CI scripts and aliases run plain commands:

```yaml
# Right — policy is in config; CI is the trigger:
- run: cargo clippy --workspace --all-targets --all-features --locked

# Wrong — duplicates policy on the command line; dev and CI drift:
- run: cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
```

Two complementary enforcement paths — **use both**:

**Path A — workspace lints.** Used by `cargo`, `rust-analyzer`, `reth`. Centralizes per-lint policy in `Cargo.toml`, supports per-crate opt-out:

```toml
# workspace root Cargo.toml
[workspace.lints.rust]
unsafe_code              = "forbid"
unused_must_use          = "deny"
unsafe_op_in_unsafe_fn   = "deny"
missing_debug_implementations = "warn"
missing_docs             = "warn"
unreachable_pub          = "warn"
rust_2018_idioms         = { level = "deny", priority = -1 }

[workspace.lints.clippy]
correctness              = { level = "deny",  priority = -1 }
perf                     = { level = "deny",  priority = -1 }
complexity               = { level = "warn",  priority = -1 }
suspicious               = { level = "warn",  priority = -1 }
style                    = { level = "warn",  priority = -1 }
pedantic                 = { level = "warn",  priority = -1 }
# Promoted to deny in runtime crates:
unwrap_used              = "deny"
expect_used              = "deny"
panic                    = "deny"
todo                     = "warn"
dbg_macro                = "deny"
print_stdout             = "deny"
print_stderr             = "deny"
disallowed_methods       = "deny"
disallowed_types         = "deny"
```

Each crate opts in:
```toml
[lints]
workspace = true
```

Lint table priorities matter: `priority = -1` lets you mass-`deny` a clippy group, then upgrade individual lints to `deny` (or downgrade noisy ones to `allow`) on top.

**Path B — build flags.** Used by `vector` in `.cargo/config.toml:9-15`. This is the only way to deny **future toolchain warnings** that don't yet exist in `[workspace.lints]`:

```toml
# .cargo/config.toml — applies to every build (dev, CI, IDE check)
[target.'cfg(all())']
rustflags = [
    "-D", "warnings",
    "-D", "clippy::print_stdout",
    "-D", "clippy::print_stderr",
    "-D", "clippy::dbg_macro",
]
```

**Use both** in new PMA projects: Path A catches the lints you have named opinions about; Path B catches everything else (including warnings added by future rustc releases). `reth` runs CI on **nightly** with `RUSTFLAGS: -D warnings` set at the workflow env level (`.github/workflows/lint.yml:60-69`) — same pattern, just env-scoped instead of file-scoped.

**Dependency builds are safe under `-D warnings`.** Cargo automatically passes `--cap-lints=warn` (path deps) or `--cap-lints=allow` (registry / git deps) to non-local crates, so your strict policy applies to your own crates without breaking on transitive warnings. No extra config needed for this.

**Local opt-out for in-progress work.** A developer who needs to iterate on warning-emitting code locally can override per-run without changing the policy file:

```bash
RUSTFLAGS="" cargo check          # bypass the workspace -D warnings just for this shell
# or per-call
cargo clippy --workspace --cap-lints=warn
```

Policy stays in the repo; only the developer's local shell relaxes it for the WIP iteration. CI is unaffected.

### Lock 5 — MSRV declared and verified

```toml
[workspace.package]
edition      = "2024"
rust-version = "1.85"   # bump deliberately; minor-version cadence; never in patch releases
```

Verify in CI with `cargo hack check --rust-version --workspace --ignore-private --locked` (cargo's pattern, `main.yml:320-323`) **or** `cargo msrv verify` (vector's pattern, `msrv.yml`). Tokio's policy: support at least 6 months of stable Rust, bump only in minor versions.

### Lock 6 — No `unwrap` / `expect` / `panic!` in runtime paths

Allowed only in `#[cfg(test)]`, `xtask/`, `build.rs`, and `examples/`. In runtime crates, `unwrap_used`/`expect_used`/`panic` are clippy `deny` (see Lock 4). Where an invariant cannot be expressed in the type system, write `expect("…")` with an `// INVARIANT:` comment, and only after considering whether `Result` would be cleaner.

### Lock 7 — edition 2024

Verified at all 10 standard-bearers (see `references/evidence.md`). New crates and refactors adopt edition 2024. Do not mix editions within a workspace except during a tracked migration.

### Lock 8 — Quality gates green

See `references/delivery.md` for the full CI matrix. Summary:

```
fmt → clippy -D warnings → nextest run → cargo test --doc →
cargo deny check (advisories + bans + licenses + sources) →
cargo shear (or machete) → typos → release build verification
```

## Known Trade-offs (When the Locks Backfire)

A Hard Lock is the right **default**. It is not the right answer in every project. Each lock has known scenarios where applying it blindly causes real harm — performance cliffs, compliance failure, debug-blindness. The discharge mechanism is the same in every case: **a dated decision record under `docs/decisions/`** explaining why and when the exception sunsets. This section lists the scenarios so the decision record can be specific.

### Lock 1 (pure Rust ecosystem) backfires when…

- **Numerical / ML / HPC workloads.** A pure-Rust BLAS/LAPACK port can be 5-10× slower than `intel-mkl-sys` or `openblas-sys` for matrix kernels. ONNX Runtime, candle's CUDA backend, and most ML inference paths cross C/C++ boundaries — refusing this delivers a benchmark loss, not a security win.
- **Compression at scale.** `zstd` via `zstd-safe` (C bindings) is currently faster than the pure-Rust `ruzstd`. For ingestion pipelines processing TB/day, the difference is measurable in cluster cost.
- **Build-time tools that use C executables.** `prost-build` invokes `protoc`; `tonic-build` invokes the same; `bindgen` invokes `clang`. These are build-time only and do not ship in the binary — Lock 1 is about runtime FFI, not build-time tools. Do not block these.
- **SQLite, HSMs, hardware video codecs, OS audio APIs, kernel bypass NIC drivers.** Some interfaces have no pure-Rust equivalent at all.

**Discharge:** add `// JUSTIFICATION: <reason + sunset condition>` next to the dependency in `Cargo.toml`. Add a `cargo deny` waiver. Re-evaluate when a viable pure-Rust alternative reaches feature parity.

### Lock 2 (rustls only) backfires when…

- **FIPS 140-3 compliance** is required (banking, US federal, healthcare). rustls's `ring` provider is not FIPS-validated. The pragmatic path is `aws-lc-rs` (rustls's other provider, FIPS-validated module available); but if the org requires the OpenSSL FIPS module specifically, `openssl` is unavoidable.
- **PKCS#11 / HSM token integration.** `openssl-engine` has decades of HSM driver support; rustls PKCS#11 is still maturing.
- **Legacy TLS 1.0 / 1.1 endpoints.** rustls intentionally drops these; `native-tls`/`openssl` keep them. If you must integrate with legacy banking or telco gear that has not deprecated TLS 1.1, you may need the C stack on that one egress path.
- **Specific protocols** (FTPS, S/MIME, SMTP STARTTLS quirks) where library coverage is openssl-only.

**Discharge:** scope the exception to the smallest possible boundary — one outbound client, not the whole process. Document the protocol/compliance reason. Pin versions; track the sunset (e.g. "remove when partner X completes TLS 1.2 migration").

### Lock 3 (`#![forbid(unsafe_code)]`) backfires when…

- **The crate genuinely owns FFI, memory layout, or hot SIMD.** A `bytemuck`-style zero-cost cast crate, an allocator, a lock-free data structure, an FFI shim — all need `unsafe`. Forbid is wrong; **`#![deny(unsafe_code)]` + `// SAFETY:` per block** is the correct posture.
- **`std::hint::unreachable_unchecked()`** in proven-unreachable hot paths (rare, profile first).
- **Cross-language interop crates** (`napi-rs` for Node addons, `pyo3` for Python extensions, `cxx` for C++ interop) cannot exist without `unsafe`.

**Discharge:** the crate-level attribute is `#![deny(unsafe_code)]` not `#![forbid]`, and **every `unsafe` block carries a `// SAFETY:`** comment covering aliasing + lifetimes + invariants. Tokio's `#![deny(unsafe_op_in_unsafe_fn)]` (lib.rs:13) is the exemplar — even inside `unsafe fn`, the `unsafe { … }` block must be explicit.

### Lock 4 (`-D warnings`) backfires when…

- **A new stable Rust release adds a `warn`-by-default lint.** Every locked-down project that runs `cargo clippy -- -D warnings` on stable will brick CI on rustc release day, even with no code change.
- **Transitive dependencies emit warnings you cannot fix.** `crate-foo` deprecates an item; downstream you can't patch it; CI fails.
- **Doc-comment warnings on macro-generated code.** Some derive macros emit code that triggers `missing_docs` even with `#[allow(missing_docs)]` on the call site.

**Discharge / mitigations (apply these and keep the lock):**

- `RUSTFLAGS="--cap-lints=warn"` for **dependency builds** so transitive warnings never become errors. Stable convention; most production CIs have this.
- Pin the toolchain version (`rust-toolchain.toml` or CI `dtolnay/rust-toolchain@1.85.0`) so a new `warn`-by-default lint does not surprise you mid-sprint.
- Run a **separate "newer-stable" job** that builds with the just-released stable but is allowed to fail (does not block merges); fix lints on a real schedule.
- For published library crates, `[build] rustflags = ["-D", "warnings"]` in `.cargo/config.toml` only affects local builds — downstream consumers don't inherit it. Safe to keep.

### Lock 5 (MSRV declared + verified) backfires when…

- **Transitive dep MSRV creep.** A `cargo update` brings in a crate whose newer version raised its MSRV; your verify job fails. Resolver cannot solve it because the offending crate doesn't declare MSRV.
- **`cargo msrv verify` is slow on large workspaces** (10+ minutes on reth-scale repos).

**Discharge:** pin the offending dep to a pre-creep version in `[workspace.dependencies]` until you do an intentional MSRV bump. Use `cargo hack check --rust-version` (faster) over `cargo msrv verify` on large monorepos. Never raise MSRV silently — always with a CHANGELOG entry.

### Lock 6 (no `unwrap`/`expect`/`panic!`) backfires when…

- **The expression is genuinely infallible.** `Regex::new(LITERAL_PATTERN).expect("static regex")` cannot fail; refusing `expect` here pushes panics into runtime indirection. Same for `Mutex` you fully own and never poison, or `OnceLock::get_or_init` after first-call.
- **Crashing IS the correct response.** Encountering a corrupt internal data structure (e.g., an invariant the type system can't express was violated) means continuing produces bad output. A logged abort is better than silent corruption.

**Discharge:** `expect("INVARIANT: <what holds>")` with the comment, not bare `unwrap()`. The `INVARIANT:` prefix is grep-able. Reviewers should still push back if the invariant could be encoded in a type — that's almost always the better path.

### Lock 7 (edition 2024) backfires when…

- **Brownfield migration with rough crate-graph compatibility.** Some ecosystem crates that haven't migrated to edition 2024 have name-resolution edge cases that surface as resolver errors during dep upgrades.
- **Internal/private toolchains pinned older than 1.85.**

**Discharge:** stage the migration crate-by-crate. Use `cargo fix --edition` for the mechanical part. Hold the rust-version pin one minor below the edition's stabilization release until the dep tree settles.

### Lock 8 (quality gates green) — rarely backfires; the only gotchas:

- `cargo deny advisories` runs against a live database; a new RUSTSEC published overnight can fail PRs that touched no advisory-affected code. **Mitigation:** run `cargo deny check advisories` on a **schedule** (nightly cron) separately from PR checks; PR checks run only `bans + licenses + sources`. Pattern verified at `cargo/.github/workflows/audit.yml:19-30` (matrix splits the two).
- `cargo nextest` runs tests in parallel by default; tests that latently raced on a shared file/port pass under serial `cargo test` but fail under nextest. **Mitigation:** isolate per-test resources (tempdirs, ephemeral ports); use `[test-groups.serial] max-threads = 1` in `nextest.toml` for genuinely shared resources.

## Other Strict Rules — When They Backfire

These are not Hard Locks, but they appear elsewhere in the skill as strong defaults. Same discharge pattern.

| Rule | Backfire scenario | Discharge |
|---|---|---|
| `missing_docs = "warn"` workspace-wide | Application / `bin` crates have no public API; enforcing missing_docs is boilerplate friction. | Apply on **library crates only** via per-crate `[lints.rust] missing_docs = "warn"`. Skip on bin crates. Tokio's pattern: enforced on `tokio` lib, relaxed on examples |
| `print_stdout = "deny"` / `print_stderr = "deny"` | **CLI tools must print** — that is their output. ruff and uv use `println!` / `eprintln!` extensively in their main code. | Allow stdout in the **output module(s)** of CLI bin crates with a focused `#[allow(clippy::print_stdout)] mod output` boundary; deny everywhere else. Use `tracing::info!` over `println!` for diagnostic output that should go to logs |
| `JSON logs in prod` | A small team that tails logs by eye hates JSON without `jq`. | The mandate is "machine-readable in prod, pretty in dev" — a tracing-subscriber switch driven by config, never a build flag. Any operator can override at startup |
| `cargo nextest` (no `cargo test`) | Doctests don't run under nextest; some custom test harnesses (mdtest, cargo-test-attribute hacks) need plain `cargo test`. | Run **both** in CI: `cargo nextest run --workspace` + `cargo test --doc --workspace`. ruff additionally uses `cargo insta test --test-runner nextest --disable-nextest-doctest` |
| `panic = "abort"` in `[profile.dist]` | Code that relies on `std::panic::catch_unwind` (some plugin systems, FFI shims, web framework panic recovery) breaks. tokio task panic isolation still works. | Keep `[profile.release] panic = "unwind"` (the default). Apply `abort` **only** in `[profile.dist]` and verify no transitive dep needs `catch_unwind` (grep the dep tree) |
| `+crt-static` musl for all binaries | Binaries needing **glibc NSS modules** (LDAP user lookup, SSSD, Active Directory join), `dlopen`, or kernel features through libc may break. | Ship glibc target (`*-unknown-linux-gnu`) when these are needed; document in `docs/decisions/`. Both targets can coexist in the release matrix |
| Disable core dumps in **all** environments | Genuinely diagnosing memory corruption (suspected miscompilation, FFI bug) needs cores. | The mandate applies to **production**; dev clusters and the `:debug` image variant may keep cores enabled. Document in the runbook |
| `cargo deny` license allow-list strict | False-positives on licenses like `Apache-2.0 OR MIT` (composite expressions), `MPL-2.0` (file-level copyleft, contentious in compliance reviews), `Unicode-3.0` (replaced `Unicode-DFS-2016`). | Use `version = 2` in `deny.toml` (better SPDX expression handling). Add specific licenses with a comment explaining the legal review outcome. Vector's `deny.toml` adds `MPL-2.0` only via per-crate exception |
| SQLx with `query!` macros | Compile-time check requires either a live DB during build or a committed `.sqlx/` cache. New contributors hit "missing query" errors. | Document `cargo sqlx prepare` in CONTRIBUTING; commit `.sqlx/` to git; CI verifies cache freshness via `cargo sqlx prepare --check` |
| `secrecy::Secret<T>` everywhere | `Secret<String>` does not zeroize on drop unless the inner type is `Zeroize`. False sense of security. | Combine: `Secret<SecretString>` where `SecretString` derives `Zeroize`. Or use `secrecy = { features = ["serde"] }` + custom `Zeroizing` newtype. Audit at every `expose_secret()` call |

## Meta-rule: how to add an exception cleanly

```text
docs/decisions/2026-05-10-allow-openssl-fips.md
```

```markdown
# ADR: Allow openssl-fips for compliance integration

Status   : Accepted
Date     : 2026-05-10
Sunset   : 2027-06-30 (reassess when aws-lc-rs FIPS 140-3 cert lands)
Owner    : @platform-team

## Context
Hard Lock 2 mandates rustls only. The federal payments integration requires FIPS 140-3
validated TLS, which rustls's ring provider cannot provide today.

## Decision
- Single egress client `crates/api/src/payments_client.rs` may use `openssl` 0.10
  with the `vendored` feature.
- All other code remains rustls-only.
- `deny.toml` waives `openssl` only for that one path via a `[[bans.skip]]` entry.

## Consequences
- Image size +5 MB.
- Sunset hard-pinned: a renewal review at 2027-06-30 must either confirm rustls coverage
  or re-justify with a new ADR.
```

This is the discharge contract. PMA `/pma` will accept the project even with the rustls lock relaxed if a matching ADR exists; without one, it blocks merge.

## Tech Stack

### Required

| Category | Technology | Notes / Evidence |
|---|---|---|
| Toolchain | stable Rust, **edition 2024** | `rust-version` in workspace; `rust-toolchain.toml` optional (only `vector` of the 4 workspace standard-bearers uses it) |
| Runtime | **Tokio** (multi-thread) | hand-built `Builder` is acceptable for tuning (`quickwit-cli/main.rs:43-53`) |
| HTTP server | **Axum 0.8.x** + Hyper 1 + tower / tower-http | default for REST/JSON. For gRPC-heavy services, **Tonic** + warp/axum hybrid (quickwit pattern) is acceptable |
| TLS | **rustls** (ring or aws-lc-rs provider) | install provider at startup (`quickwit-cli/main.rs:98`) |
| Errors | **`thiserror` 2.x** per crate; **`anyhow`** at bin entry | universal across uv/ruff/quickwit (`thiserror = "2.0"`, `anyhow = "1.0"`). `eyre` is an acceptable swap for `anyhow` |
| Logging | **`tracing` + `tracing-subscriber`** | JSON in prod, pretty in dev. `quickwit-cli/logger.rs` is the canonical multi-layer setup |
| Lint policy | `[workspace.lints]` (Path A) **or** build rustflags (Path B) | see Lock 4 |
| Test runner | **`cargo nextest`** | 5 of 10 standard-bearers (rust-analyzer, reth, vector, tokio, uv, ruff, quickwit). Doctest still runs via `cargo test --doc --workspace` |
| Secrets | **`secrecy`** + **`zeroize`** + **`subtle`** | wrap, redact, constant-time-compare |
| Supply chain | **`cargo-deny`** + **`cargo-shear`** (preferred over `cargo-machete`) + **`typos`** | uv/ruff use `cargo-shear`; rust-analyzer uses `cargo-machete`; cargo/r-a/reth all run `crate-ci/typos` |

### Default

| Category | Technology | Notes |
|---|---|---|
| Workspace | multi-crate Cargo workspace; `resolver = "2"` (or `"3"` once stable in your toolchain) | `"2"` is what cargo / rust-analyzer / reth ship today |
| Data access | **SQLx** (`default-features = false`, `features = ["runtime-tokio", "tls-rustls", ...]`) | the most balanced default; compile-time-checked queries. **Never** allow native-tls feature |
| Alt data access | **SeaORM** | pick when ActiveRecord ergonomics dominate |
| Alt data access | **`diesel-async` + `deadpool`** | pick when compile-time schema typing dominates |
| Migrations | `sqlx migrate` / `sea-orm-migration` / `diesel migration` | tool matches ORM; commit migrations |
| CLI parsing | **`clap` v4 (derive)** + **`clap_complete_command`** | derive used by uv/ruff; quickwit uses builder API for very large CLIs |
| Serialization | **`serde`** + `serde_with` | derive-based |
| Validation | **`validator`** or **`garde`** | derive-based, post-deserialize |
| Config layering | **`figment`** (TOML/YAML/Env/CLI) | quickwit rolls its own versioned config; figment is the default for new projects |
| HTTP client | **`reqwest`** with `default-features = false, features = ["rustls-tls", "json"]` | never `native-tls` |
| Caching | **`moka`** (in-process, TTL + size bounds) | |
| Concurrency | `parking_lot`, `dashmap`, `arc-swap` | only when stdlib primitives don't fit |
| Observability | **`opentelemetry-otlp`** (gRPC and/or HTTP-JSON) + `tracing-opentelemetry` + `metrics` or `prometheus` | quickwit uses `opentelemetry = 0.31`, `opentelemetry-otlp = 0.31`, `tracing-opentelemetry = 0.32` |
| Runtime metrics | **`tokio-metrics`** | `quickwit-common/src/runtimes.rs` patterns; pair with `Prometheus` |
| OpenAPI | **`utoipa`** | quickwit pattern; pin until v5 ecosystem stabilizes |
| Snapshot tests | **`insta`** with `cargo insta test --unreferenced reject --test-runner nextest --disable-nextest-doctest` | ruff's exact CI line, `.github/workflows/ci.yaml:323` |
| Property tests | **`proptest`** | quickwit uses it for invariants |
| Bench | **`criterion`** (or **`divan`** for newer projects) | |
| Allocator (binaries) | **`mimalloc`** on Windows + musl, **`tikv-jemallocator`** on glibc Linux/macOS | ruff's pattern extended for musl (`crates/ruff/src/main.rs:11-28`) |
| Crash policy | **`rlimit::setrlimit(Resource::CORE, 0, 0)`** at the very top of `main`; `std::panic::set_hook` to emit JSON panic record then abort | core dumps leak secrets and user data in memory; suppress at the source. See `references/delivery.md` "Disable Core Dumps" |
| Panic strategy | `panic = "abort"` in `[profile.dist]` only; `[profile.release]` keeps `unwind` so backtraces and `catch_unwind` still work | abort + suppressed core dump = process dies fast, panic record reaches stderr/log, no on-disk artifact |
| Cross-compile target | **`*-unknown-linux-musl`** with `+crt-static` for distributable binaries | uv ships 4 musl targets; produces `FROM scratch`-ready images |
| Cross-compile driver | **`cross`** (Docker-based, default) or **`cargo-zigbuild`** (no Docker) | uv uses `cross`; either is acceptable |
| Release profile | dual-profile: `[profile.release]` (speed) + `[profile.dist]` (size) | follows the Rust Performance Book; uv/ruff use `cargo-dist` with size-tuned profile |
| Release artifacts | **`cargo-dist`** for prebuilt binaries (uv + ruff in production) | release-plz is **not** validated against any of our 10 standard-bearers — adopt with caution |
| Dev loop | **`bacon`** + **`just`** + **`cargo nextest`** | optional but reduces friction |

### Forbidden / Discouraged

- **`openssl`, `openssl-sys`, `native-tls`, `native-tls-sys`** — banned by `cargo-deny` (see `delivery.md`). reth's `deny.toml:35` is the canonical example.
- **`git2`, `libgit2-sys`** — prefer `gix` (gitoxide) when feasible. cargo lists `git2` as a watch item.
- **`dotenv`** (unmaintained) — use `dotenvy`.
- **`async-trait`** macro — use native `async fn` in trait (stable since Rust 1.75) unless object-safety is required.
- **`cargo-cranky`** — superseded by `[workspace.lints]`. **None** of the 10 standard-bearers use cargo-cranky.
- **`once_cell::sync::Lazy`** in new code — prefer `std::sync::LazyLock` (vector's `clippy.toml:17-22` enforces this).
- **`std::collections::HashMap`** in performance-sensitive paths — prefer `FxHashMap` (rust-analyzer's `clippy.toml:1-5` enforces this).
- **`std::sync::Mutex` held across `.await`** — use `tokio::sync::Mutex` or restructure to message passing.
- **`unwrap()` / `expect()` / `panic!`** in runtime crates — see Lock 6.
- **Crates with abandoned advisories** from `cargo-audit` — require an explicit waiver with sunset date.

## Naming (Rust API Guidelines)

| Element | Convention | Guideline ref |
|---|---|---|
| Types and traits | `PascalCase` | C-CASE |
| Functions, modules, file names | `snake_case` | C-CASE |
| Constants and statics | `SCREAMING_SNAKE_CASE` | C-CASE |
| Conversions | `as_*` (cheap ref→ref), `to_*` (expensive owned→owned), `into_*` (consuming) | C-CONV |
| Iterator methods | `iter`, `iter_mut`, `into_iter` | C-ITER |
| Crates | stable, project-prefixed names (e.g. `acme-core`, `acme-api`, `acme-cli`) | C-FEATURE |
| Cargo features | lowercase, hyphenated, **additive only** (no mutually exclusive features) | C-FEATURE |
| Test modules | `mod tests { … }` inline; integration tests under `tests/<feature>.rs` | |
| Bench files | under `benches/<scenario>.rs` | |

Pair every public item with a `Debug` impl (C-DEBUG) and a `///` rustdoc example (C-EXAMPLE). Examples use `?`, never `unwrap()` (C-QUESTION-MARK).

## Required Conventions

| Area | Convention |
|---|---|
| Error types | per-crate `thiserror` enums; `#[from]` only when conversion is genuinely lossless; `anyhow`/`eyre` only at bin entry / `xtask/` / integration tests |
| Shared state | `Arc<T>` with immutable inner; `arc-swap` for hot reload; **never** `Arc<Mutex<…>>` across `.await` |
| Secrets | wrap in `secrecy::Secret<T>`; redact in `Debug`; compare with `subtle::ConstantTimeEq`; never log |
| CLI | `clap` v4 derive with `#[command(version, about)]`; subcommands as enum variants; `ArgAction::Count` for verbose/quiet (uv pattern, `uv-cli/src/lib.rs:156-219`) |
| Shutdown | `tokio::signal` for SIGINT/SIGTERM; `axum::serve(...).with_graceful_shutdown(...)` paired with `TimeoutLayer`; `CancellationToken` (or `tokio_util::task::TaskTracker`) for fan-out |
| Async traits | use native `async fn` in trait (stable since Rust 1.75); avoid `async-trait` macro for new code unless object-safety is required |
| MSRV | declare `rust-version` in workspace; bump only in minor releases; document in CHANGELOG |
| Async I/O | never call `std::fs`, `std::net`, blocking `std::sync::Mutex` from async tasks; use `tokio::fs` or `tokio::task::spawn_blocking` |

## Code Quality

- prefer immutable data and `&` borrows by default; reach for `&mut` only when mutation is truly needed
- keep files focused — split when a module exceeds ~600 lines or accrues multiple responsibilities
- keep functions small and single-purpose; complex pipelines belong behind named helpers
- prefer iterators and `?`-propagation over imperative loops with manual error tracking
- isolate `unsafe`, FFI, and platform-specific code behind a documented module boundary
- gate optional functionality with **additive** Cargo features (`#[cfg(feature = "…")]`); keep default features minimal so downstream pays only for what they use
- public types implement `Debug` and `Clone` where reasonable (Rust API Guidelines C-COMMON-TRAITS, C-DEBUG)
- newtype wrappers carry meaning that `String`/`u64`/`bool` cannot (C-NEWTYPE, C-CUSTOM-TYPE)
- builders for complex constructors (C-BUILDER); private struct fields by default (C-STRUCT-PRIVATE)
