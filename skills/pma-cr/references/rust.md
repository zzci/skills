# Rust Review Pack

Apply this pack to Rust libraries, services, and async runtimes.

## Focus Areas

### Panic and error boundaries

- Use `Result` for recoverable failures.
- `panic!`, `unwrap`, and `expect` in production paths need justification.
- Panic conditions should be documented for public APIs that can panic.

### API contracts and docs

- Check that public error and panic behavior is understandable to callers; require specific `Errors`/`Panics` sections when project policy requires them, or report the concrete missing contract.
- `unsafe` APIs need explicit `Safety` docs and a check that callers can realistically uphold the invariants.

### Async and blocking work

- Check blocking filesystem or CPU-heavy work on the async scheduler against input size and call frequency; small bounded computation is not automatically a runtime-blocking defect.
- Long or repeated blocking work should be offloaded deliberately.
- Review shutdown and spawned-task lifetime for leaked work.

### Arithmetic and invariants

- Implicit overflow assumptions are bugs unless wrapping or saturating behavior is explicit.
- Prefer explicit checked, saturating, or wrapping operations when overflow semantics matter.

### Visibility and type boundaries

- Avoid making items `pub` broader than necessary.
- Public APIs should not expose accidental implementation details if a narrower abstraction would hold.

### Dead code and conditional compilation

- Unused items may be truly dead or only live behind `cfg` gates, feature flags, or macro expansion.
- Do not remove fields or types blindly when they may exist for drop semantics, registration, or layout guarantees.
- Treat orphan modules, stale feature-gated subsystems, and never-called async tasks as real repository-audit findings.

## High-Signal Findings

Report issues such as:

- new `unwrap`/`expect` on an input or I/O path that can fail in normal operation
- an unsafe or panicking public API whose undocumented preconditions prevent callers from using it safely
- blocking work added directly inside an async path
- spawned tasks with no ownership or shutdown handling
- arithmetic whose correctness depends on silent overflow
- orphan module or feature-gated subsystem with no live call path in supported builds

## Usually Skip

- broad "rewrite with iterators" advice
- pure stylistic macro preferences
- duplicate explanations of compiler diagnostics; record an actual build failure once under the shared gate policy
- items that only look unused because they are activated by `cfg`, macro expansion, or side-effectful drop behavior

## Source Notes

- Rust API Guidelines, documentation: https://rust-lang.github.io/api-guidelines/documentation.html
- Rust API Guidelines, dependability: https://rust-lang.github.io/api-guidelines/dependability.html
- Rust book, panic vs error guidance: https://rust-lang.github.io/book/ch09-03-to-panic-or-not-to-panic.html
- Clippy lints: https://rust-lang.github.io/rust-clippy/master/
- Tokio `spawn_blocking`: https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html
- Rust reference on integer overflow: https://doc.rust-lang.org/stable/reference/behavior-not-considered-unsafe.html
- Rust `dead_code` lint: https://doc.rust-lang.org/rustc/lints/listing/warn-by-default.html#dead-code
