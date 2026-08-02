# PMA-Go HTTP And Runtime

## HTTP Server

Default stack:

- stdlib `net/http`
- Chi router

Rules:

- centralize router construction in `internal/server`
- register middleware explicitly
- keep route registration readable

## Handler Pattern

- handlers should parse input, call services, and write responses
- move business rules out of handlers
- validate input before calling deeper layers
- keep response mapping consistent

## API Response Envelope

Use a response envelope only when the product already standardizes on it. Do not wrap everything by reflex.

## Middleware

Common middleware concerns:

- request logging
- panic recovery
- auth and authorization
- request IDs and correlation
- timeouts where appropriate

## Logging

- use slog for structured logs
- keep attribute names stable
- redact secrets and sensitive identifiers when needed
- attach request context fields consistently

## Observability

Adopt OpenTelemetry when deployment context requires it.

Focus areas:

- tracer and meter setup
- HTTP instrumentation
- DB instrumentation
- health and readiness endpoints
- trace correlation in logs

## Dev URL Routing (nsl)

When the service ships a UI managed by `/pma-web`, run the dev server behind nsl so the SPA and the API share one origin (`http://<name>.localhost`):

```bash
nsl run -n <name>:/api -s -- go run ./cmd/<app> --port NSL_PORT
```

- nsl allocates a port and substitutes it for the `NSL_PORT` placeholder; `-s` (`--strip`) drops the `/api` prefix before forwarding, so handlers stay mounted at their domain paths.
- The SPA's own dev script registers `<name>.localhost` → frontend; this command mounts the API at `<name>.localhost:3355/api`, so the frontend keeps a relative `/api` base URL with no CORS setup.
- Production is unaffected — nothing in the binary depends on nsl.

Full protocol (registration patterns, `--strip` semantics, `NSL_PORT`, fallback): `/pma references/dev-environment.md`.

## Graceful Shutdown

- handle `SIGINT` and `SIGTERM`
- stop accepting new work before process exit
- let in-flight requests drain within a timeout
- close DB pools and telemetry exporters cleanly

Sketch:

```go
func run(ctx context.Context, srv *http.Server) error {
    ctx, stop := signal.NotifyContext(ctx, syscall.SIGINT, syscall.SIGTERM)
    defer stop()

    errCh := make(chan error, 1)
    go func() {
        if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
            errCh <- err
        }
    }()

    select {
    case err := <-errCh:
        return err
    case <-ctx.Done():
        shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
        defer cancel()
        return srv.Shutdown(shutdownCtx) // then close DB pools and telemetry exporters
    }
}
```
