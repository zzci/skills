---
name: pma-rust
description: Production-grade Rust implementation and acceptance baseline for PMA-managed Rust services and CLIs. Use with /pma when creating, upgrading, or validating acceptance of Rust workspaces, Axum/Tokio services, CLI binaries, CI pipelines, release packaging, lint policy, dependencies, testing, observability, security, or supply-chain controls. Use pma-cr for code-review workflow.
---

# Rust Project Implementation & Acceptance Guide

Use this skill together with `/pma`. `/pma` controls workflow, approval, and task tracking; this guide defines the **product-grade acceptance baseline** for every PMA-Rust project.

This skill names no versions: every crate, toolchain, edition, and base image starts from its latest stable release verified at the registry (see `/pma references/workflow.md` *Dependency Freshness*). Versions inside `references/evidence.md` are evidence, not targets.

## Hard Locks

Defined in `references/baseline.md` *Hard Locks*; loosening one follows its *Known Trade-offs* section. `/pma` refuses implementation approval when they are not enforced.

1. Mature crates first; pure Rust is not required, but every release target must build
2. rustls only, with the `aws-lc-rs` provider installed in `main()`
3. `#![forbid(unsafe_code)]` at every crate root
4. Deny warnings in `[workspace.lints]`, not on the CLI
5. MSRV declared and verified in CI
6. No `unwrap` / `expect` / `panic!` in runtime paths
7. Latest stable edition
8. Quality gates green before merge (`references/delivery.md`)

## Standard-Bearer Anchors

Every recommendation is anchored to file:line evidence from 10 clone-verified projects (cargo, rust-analyzer, reth, vector, tokio, axum, linkerd2-proxy, uv, ruff, quickwit); citations live in `references/evidence.md`.

## Loading Order

Always load `references/baseline.md` first. Then load the pack(s) relevant to the task:

1. `references/baseline.md` — hard locks, tech stack, naming, code quality (always required)
2. `references/toolchain-and-workspace.md` — workspace layout, edition, `[workspace.lints]` vs build-flag pattern, toolchain pinning, dev-loop tools
3. `references/runtime-and-data.md` — Axum + tower + tokio runtime, error handling with `IntoResponse`, SQLx/SeaORM/Diesel selection, layered config, graceful shutdown
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

- [ ] Workspace declares the latest stable `edition` and `rust-version`
- [ ] Every crate has `#![forbid(unsafe_code)]` (or documented exception)
- [ ] CI runs: fmt + clippy with workspace deny-warnings policy + nextest + `--doc` test + cargo-deny + cargo-shear (or machete) + typos + MSRV check (`cargo hack check --rust-version` or `cargo msrv verify`)
- [ ] No transitive `openssl` / `native-tls` (verified by `cargo deny bans`)
- [ ] All TLS uses rustls; the `aws-lc-rs` provider installed early in `main` (canonical snippet: `references/baseline.md` Lock 2)
- [ ] Tracing initialized with JSON formatter in prod; OTLP optional
- [ ] `/livez` (liveness) + `/readyz` (readiness) endpoints exist for services
- [ ] Graceful shutdown wired via `axum::serve(...).with_graceful_shutdown(...)` + `CancellationToken` (or equivalent)
- [ ] Secrets wrapped in `secrecy::SecretString` / `SecretBox<T>`; never `Debug`-formatted
- [ ] Config layered: defaults → file → env → CLI; validated post-merge
- [ ] Errors typed per crate (`thiserror`); `anyhow`/`eyre` only in bin entry points
- [ ] Release pipeline reproducible: tag → CI → signed binaries (cargo-dist or custom)
- [ ] Distributable binaries built against `*-unknown-linux-musl` with `+crt-static` (verified via `ldd` saying "not a dynamic executable") **when** the project ships portable CLI binaries
- [ ] `[profile.dist]` defined with size-tuned options (`lto=fat`, `codegen-units=1`, `panic=abort`, `strip=symbols`) when shipping CLI binaries
- [ ] Container base image chosen **with intent and documented in `docs/decisions/`**: pick by ops needs (minimal runtime, debug-friendly, glibc-bound, corporate base, multi-arch). No fixed size target — the right size is whatever the chosen base + binary needs
- [ ] **Core dumps suppressed at all reachable layers** — in-process `rlimit::setrlimit(Resource::CORE, 0, 0)` early in `main` (always), plus systemd `LimitCORE=0` / container `--ulimit core=0:0` / K8s read-only rootfs / kernel `kernel.core_pattern = \|/bin/false` per environment
- [ ] **Panic hook installed** in `main` to emit a structured `tracing::error!` with backtrace before the runtime aborts; production logs replace post-mortem cores

If any item fails, the project is **not production-ready**.
