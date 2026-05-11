---
name: pma-rust
description: Production-grade Rust implementation guide and acceptance baseline for PMA-managed projects. Hard-locks pure-Rust ecosystem (rustls only, no C-FFI bindings unless justified), `#![forbid(unsafe_code)]` by default, deny-warnings policy, edition 2024 workspaces with `[workspace.lints]` or build-flag enforcement, MSRV declared in `rust-version`, async stack on Tokio + Axum 0.8 + tower-http (or warp + tonic for gRPC-heavy services), SQLx (rustls TLS, no default features) by default, layered config with figment + clap v4, secret handling via secrecy/zeroize/subtle, OpenTelemetry-OTLP observability, cargo-nextest + insta + proptest + criterion testing, cargo-deny + cargo-shear + typos supply-chain gates, dual-profile builds (`release` for speed + `dist` for size with `lto=fat`/`codegen-units=1`/`panic=abort`/`strip=symbols`), `*-unknown-linux-musl` static binaries with `+crt-static` for distroless containers, `cross` or `cargo-zigbuild` cross-compilation, and CI release pipelines verified against cargo, rust-analyzer, reth, vector, axum, tokio, linkerd2-proxy, uv, ruff, and quickwit.
---

# Rust Project Implementation & Acceptance Guide

Use this skill together with `/pma`. `/pma` controls workflow, approval, and task tracking; this guide defines the **product-grade acceptance baseline** for every PMA-Rust project.

Every claim in the reference packs is **anchored to file:line evidence** from the standard-bearer projects below. If a recommendation is missing evidence, it is marked as such.

## Hard Locks (non-negotiable)

These rules apply to **every** PMA-Rust project. They cannot be overridden by project-level `CLAUDE.md`, only by an explicit, time-boxed exception in `docs/decisions/` with a sunset date.

| # | Rule | Enforcement |
|---|---|---|
| 1 | **Pure Rust ecosystem first.** No new dependency may pull in OpenSSL, native-tls, libgit2-sys, or any other C-FFI binding when a pure-Rust alternative exists. | `cargo deny bans` + dependency review |
| 2 | **rustls only** for TLS. `tokio-rustls` / `rustls-pemfile` / `rustls-platform-verifier` are the canonical stack. | `bans.deny = [openssl, openssl-sys, native-tls, native-tls-sys]` |
| 3 | **`#![forbid(unsafe_code)]`** at every crate root (lib.rs / main.rs). Only data-crate or FFI-crate may relax to `deny`, with `// SAFETY:` comments on every `unsafe` block. | clippy + workspace lints |
| 4 | **Deny warnings is config, not CLI.** Set `[workspace.lints]` (per-lint policy) **and** `.cargo/config.toml [build] rustflags = ["-D", "warnings"]` (global hammer). CI runs `cargo clippy` with no `-- -D warnings` suffix — policy lives in files so dev and CI see the same gate. | `.cargo/config.toml` + `[workspace.lints]` |
| 5 | **MSRV declared** in `[workspace.package].rust-version`. CI verifies via `cargo hack check --rust-version` or `cargo msrv verify`. | CI gate |
| 6 | **No `unwrap` / `expect` / `panic!` in runtime paths.** Allowed only in `#[cfg(test)]`, `xtask/`, `build.rs`. Enforced via clippy `unwrap_used = "deny"` / `panic = "deny"` in runtime crates. | workspace lints |
| 7 | **edition 2024.** New crates and refactors must adopt edition 2024 unless an upstream dependency blocks. | `[workspace.package].edition` |
| 8 | **Quality gates green** before merge: fmt + clippy `-D warnings` + nextest + doctest + cargo-deny + supply-chain check. See `references/delivery.md`. | CI gate |

Loosening any hard lock requires an explicit, dated decision record (Why? What's the sunset?). PMA `/pma` enforces this by refusing implementation approval when these gates are not configured.

**Locks are defaults, not handcuffs.** `references/baseline.md` "Known Trade-offs (When the Locks Backfire)" lists the real-world scenarios where each lock harms the project (FIPS compliance, ML/HPC C bindings, CLI stdout, glibc NSS, etc.) and the discharge mechanism (`docs/decisions/<adr>.md` with sunset). Read that section before applying a lock dogmatically — and before relaxing one.

## Standard-Bearer Anchors

Every recommendation in the reference packs is grounded in these projects (all clone-verified, see `references/evidence.md` for file:line citations):

| Project | What we mirror | Verified file evidence |
|---|---|---|
| `rust-lang/cargo` | Workspace `[lints]`, `xtask-*` split crates, `crate-ci/typos`, `cargo-deny`, MSRV via `cargo hack` | `Cargo.toml`, `.cargo/config.toml`, `deny.toml`, `.github/workflows/main.yml` |
| `rust-lang/rust-analyzer` | Large multi-crate workspace, single `xtask/` (`publish=false`), `cargo nextest`, `cargo machete` | `Cargo.toml`, `xtask/Cargo.toml`, `.github/workflows/ci.yaml` |
| `paradigmxyz/reth` | `default-members`, extensive `[workspace.lints]`, `deny.toml` with hard `openssl` ban, `mold` + `sccache` + `Swatinem/rust-cache`, `cargo udeps`, `zepter` | `Cargo.toml`, `deny.toml`, `.github/workflows/lint.yml` |
| `vectordotdev/vector` | `rust-toolchain.toml` pin, build-flag lint enforcement via `.cargo/config.toml` rustflags, `vdev` published xtask | `rust-toolchain.toml`, `.cargo/config.toml`, `vdev/` |
| `tokio-rs/tokio` | Lib-level lint policy, MSRV policy, `cargo nextest` + separate `--doc`, loom + miri + cargo-fuzz | `tokio/src/lib.rs`, `CONTRIBUTING.md`, `.github/workflows/ci.yml` |
| `tokio-rs/axum` | Axum 0.8 path syntax `/{id}`, `with_state`, `ServiceBuilder` middleware order, `tower::ServiceExt::oneshot` testing, `with_graceful_shutdown` | `examples/*/src/main.rs`, `axum/src/docs/routing/with_state.md` |
| `linkerd/linkerd2-proxy` | Production tower stack: load-shed outside concurrency-limit, normalized middleware ordering | `linkerd/app/inbound/src/http/server.rs` |
| `astral-sh/uv` | Thin bin (`crates/uv/src/bin/uv.rs`) + `uv-cli` crate split, `clap_complete_command`, `ArgAction::Count` for verbose/quiet, `cargo-dist`, `cargo-shear`, `insta` | `crates/uv-cli/src/lib.rs`, `release.yml` |
| `astral-sh/ruff` | Single bin + custom panic hook, `cargo insta test --unreferenced reject --test-runner nextest --disable-nextest-doctest`, mimalloc/jemalloc allocator switching | `crates/ruff/src/{main,lib}.rs`, `.github/workflows/ci.yaml` |
| `quickwit-oss/quickwit` | Hand-built tokio runtime + tokio-metrics, OTLP via `opentelemetry-otlp` 0.31 (gRPC + HTTP/JSON), `prometheus` const-label build_info, `utoipa` OpenAPI, `/livez` + `/readyz`, rustls `install_default_crypto_ring_provider()` | `quickwit-cli/src/{main,logger}.rs`, `quickwit-serve/src/{health_check_api,metrics_api,openapi}.rs` |

**`references/evidence.md`** lists the exact file:line references for every pattern in this skill.

## Loading Order

Always load `references/baseline.md` first. Then load the pack(s) relevant to the task:

1. `references/baseline.md` — hard locks, tech stack, naming, code quality (always required)
2. `references/toolchain-and-workspace.md` — workspace layout, edition 2024, `[workspace.lints]` vs build-flag pattern, toolchain pinning, dev-loop tools
3. `references/runtime-and-data.md` — Axum 0.8 + tower + tokio runtime, error handling with `IntoResponse`, SQLx/SeaORM/Diesel selection, layered config, graceful shutdown
4. `references/delivery.md` — security, secrets, OTLP observability, testing layers, supply-chain (`cargo-deny`/`cargo-shear`/`typos`), release automation, CI
5. `references/evidence.md` — anchored citations (load when verifying or extending the skill)

## Quick Routing

| If the task touches… | Load |
|---|---|
| New workspace, lints, toolchain, dev tooling | `toolchain-and-workspace.md` |
| Axum/tower handlers, DB access, config, shutdown | `runtime-and-data.md` |
| Tests, CI, observability, release, secrets, supply chain | `delivery.md` |
| "Why is this rule here?" / "What proves X is best practice?" | `evidence.md` |
| Anything else (always) | `baseline.md` |

## Acceptance Checklist (PMA gate)

Before `/pma` accepts a Rust crate or service for production:

- [ ] Workspace declares `edition = "2024"` and `rust-version`
- [ ] Every crate has `#![forbid(unsafe_code)]` (or documented exception)
- [ ] CI runs: fmt + clippy `-D warnings` + nextest + `--doc` test + cargo-deny + cargo-shear (or machete) + typos
- [ ] No transitive `openssl` / `native-tls` (verified by `cargo deny bans`)
- [ ] All TLS uses rustls; `install_default_crypto_provider()` called in `main`
- [ ] Tracing initialized with JSON formatter in prod; OTLP optional
- [ ] `/healthz` (liveness) + `/readyz` (readiness) endpoints exist for services
- [ ] Graceful shutdown wired via `axum::serve(...).with_graceful_shutdown(...)` + `CancellationToken` (or equivalent)
- [ ] Secrets wrapped in `secrecy::Secret<T>`; never `Debug`-formatted
- [ ] Config layered: defaults → file → env → CLI; validated post-merge
- [ ] Errors typed per crate (`thiserror` 2.x); `anyhow`/`eyre` only in bin entry points
- [ ] Release pipeline reproducible: tag → CI → signed binaries (cargo-dist or custom)
- [ ] Distributable binaries built against `*-unknown-linux-musl` with `+crt-static` (verified via `ldd` saying "not a dynamic executable") **when** the project ships portable CLI binaries
- [ ] `[profile.dist]` defined with size-tuned options (`lto=fat`, `codegen-units=1`, `panic=abort`, `strip=symbols`) when shipping CLI binaries
- [ ] Container base image chosen **with intent and documented in `docs/decisions/`**: pick by ops needs (minimal runtime, debug-friendly, glibc-bound, corporate base, multi-arch). No fixed size target — the right size is whatever the chosen base + binary needs
- [ ] **Core dumps suppressed at all reachable layers** — in-process `rlimit::setrlimit(Resource::CORE, 0, 0)` early in `main` (always), plus systemd `LimitCORE=0` / container `--ulimit core=0:0` / K8s read-only rootfs / kernel `kernel.core_pattern = \|/bin/false` per environment
- [ ] **Panic hook installed** in `main` to emit a structured `tracing::error!` with backtrace before the runtime aborts; production logs replace post-mortem cores

If any item fails, the project is **not production-ready**.
