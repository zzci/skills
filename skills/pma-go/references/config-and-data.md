# PMA-Go Config And Data

## Configuration Layering

Load config in this order:

```text
defaults -> config file -> environment variables -> CLI flags
```

Rules:

- keep config structs explicit
- validate after load
- map env vars predictably
- keep config-file format aligned with the repository convention
- never read process env directly inside domain logic

## koanf Guidance

- keep loading centralized in `internal/config`
- separate loading, validation, and defaulting concerns
- document required env vars and defaults

Load sketch matching the layering order:

```go
func Load(flags *pflag.FlagSet) (*Config, error) {
    k := koanf.New(".")

    // 1. defaults
    _ = k.Load(structs.Provider(defaultConfig, "koanf"), nil)
    // 2. config file (optional)
    if err := k.Load(file.Provider("config.yaml"), yaml.Parser()); err != nil && !errors.Is(err, fs.ErrNotExist) {
        return nil, fmt.Errorf("load config file: %w", err)
    }
    // 3. environment: APP_SERVER_PORT -> server.port
    _ = k.Load(env.Provider("APP_", ".", func(s string) string {
        return strings.ReplaceAll(strings.ToLower(strings.TrimPrefix(s, "APP_")), "_", ".")
    }), nil)
    // 4. CLI flags (highest precedence)
    _ = k.Load(posflag.Provider(flags, ".", k), nil)

    var cfg Config
    if err := k.Unmarshal("", &cfg); err != nil {
        return nil, fmt.Errorf("unmarshal config: %w", err)
    }
    return &cfg, cfg.Validate()
}
```

## Database Default: sqlc Plus pgx

Prefer this when:

- SQL is part of the product logic
- compile-time query safety matters
- the team wants direct control over SQL

Rules:

- store queries under `db/queries`
- keep generated code isolated
- manage connection pools centrally
- pass `context.Context` through all DB calls

## Migration Guidance

- use goose by default
- create versioned stubs with `goose create <name> sql` (or `go` for a code migration), then author the migration body; Goose does not infer the intended schema diff
- commit migrations; never edit one already applied to a shared environment
- avoid silent schema drift
- verify with the configured Goose apply and status commands against an ephemeral database

## GORM Alternative

Use GORM when:

- CRUD speed matters more than SQL transparency
- the schema is simple enough that ORM conventions help more than they hurt

If selected, keep the choice explicit and do not mix ad hoc sqlc and ORM patterns without a clear boundary.

## Repository Boundaries

- handlers manage transport
- services manage business rules
- repositories manage persistence
- keep DB-specific errors translated before they leak into unrelated layers
