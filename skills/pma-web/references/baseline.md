# PMA-Web Baseline

## Scope

This skill is for PMA-managed SPA and internal-tool web applications using:

- React 19 + TypeScript + Vite 8
- TanStack Router
- TanStack Query
- Zustand
- shadcn/ui plus Tailwind CSS v4

Use `/pma` for workflow control. Use this pack for implementation defaults.

## Tech Stack

### Required

| Category | Technology | Version | Notes |
|---|---|---|---|
| Framework | React | 19 | default app framework |
| Language | TypeScript | 5.9+ | strict mode |
| Build tool | Vite | 8 | `host: "0.0.0.0"`. `server.allowedHosts` decision depends on the nsl deployment — see *Vite Configuration* in `runtime-and-data.md`. |
| Styling | Tailwind CSS | 4 | `@theme` plus CSS variables in oklch |
| Server state | TanStack Query | 5 | owns request lifecycle |
| Lint / format | ESLint + @antfu/eslint-config | 8+ | no Prettier; see notes below |
| Test | Vitest | 4 | unit and integration tests |

#### @antfu/eslint-config notes

- **v8+** requires `@eslint-react/eslint-plugin` v3. Ensure the project does not pin v2.
- **v7+** enables `react/prefer-namespace-import` by default — use `import * as React from 'react'` instead of `import React from 'react'`, or explicitly disable the rule in eslint config.
- The config is flat-config native. Do not use legacy `.eslintrc` format.

### Default

| Category | Technology | Notes |
|---|---|---|
| Package manager | bun (single project) | use `bun install` directly; no workspaces unless promoted |
| Router | TanStack Router | file-based routing with generated route tree |
| Client state | Zustand | UI-only local state |
| UI | shadcn/ui | `base-nova` style with `@base-ui/react` primitives |
| Theming | ThemeProvider pattern | light, dark, system |
| Icons | lucide-react | consistent icon set |
| HTTP client | `src/shared/lib/http.ts` | typed fetch wrapper with `/api` base URL |
| Dev URL routing | `@nsio/nsl` | install as devDependency; named `.localhost` routes for frontend and backend; replaces vite proxy / hono dev server |

### Optional

| Category | Technology | When to adopt |
|---|---|---|
| i18n | react-i18next + i18next-http-backend | multi-locale products |
| Forms | react-hook-form | complex form validation |
| E2E test | Playwright | critical user flows |
| Fonts | @fontsource-variable | self-hosted variable fonts |

### Alternative

| Replaces | Technology | Notes |
|---|---|---|
| bun (single project) | bun workspaces | promote when the repo really hosts multiple apps or shared packages |
| bun workspaces | pnpm workspaces | use consistently across docs and CI |
| react-i18next | LinguiJS | smaller bundle, compile-time approach |
| `@base-ui/react` | Radix UI | change shadcn setup consistently |
| `@nsio/nsl` | vite proxy / `@hono/vite-dev-server` | only when the dev environment cannot run nsl at all (rare; nsl is a single binary shipped via npm) |

## Required Quality Gates

Every PMA-Web project should define:

- `bun run lint`
- `bun run typecheck`
- `bun run build`
- `bun run test`
- accessibility review for changed UI
- security review for changed auth, env usage, or unsafe rendering paths

If a repo is missing a gate, add it instead of leaving verification implicit.

## Project Layout

Pick exactly one of the two layouts below and stay with it. Default to **Single App**; switch to **Monorepo** only when the trigger conditions in the next section are met.

### Single App (default)

For a standalone SPA, an internal tool, or the UI that ships with a Rust / Go service. No workspaces, no `apps/*` indirection, no cross-package wiring.

```text
package.json                       # plain dependencies, no `workspaces`
tsconfig.json
vite.config.ts
components.json
src/
  main.tsx
  index.css
  app/
    providers.tsx
    i18n.ts
    routeTree.gen.ts
    routes/
  features/
  shared/
    components/
    lib/
      http.ts
  styles/
public/
  locales/
```

When the SPA lives next to a backend in the same repo (typical for Rust / Go projects), keep it under a sibling directory such as `web/` or `frontend/`, and treat that directory as the project root for everything in this skill — `package.json`, `vite.config.ts`, `tsconfig.json`, `src/`, etc. all live inside it. Backend code stays in its own language-native layout and is wired up through nsl, not through Vite plugins.

### Monorepo (only when justified)

Use a Bun workspace only when one or more of these are true:

- two or more deployable apps live in the same repo
- one or more `packages/*` are genuinely shared by multiple consumers
- shared TS config / lint config must be reused across apps

A single SPA plus a single backend in another language is **not** a sufficient reason — that case is Single App.

```text
package.json                       # workspaces: ["apps/*", "packages/*"]
apps/
  web/
    src/
      main.tsx
      index.css
      app/
        providers.tsx
        i18n.ts
        routeTree.gen.ts
        routes/
      features/
      shared/
      styles/
    public/
      locales/
    vite.config.ts
    components.json
packages/
  config/
    tsconfig/
      base.json
      react.json
  shared/
    src/
      index.ts
```

## Required Conventions

| Area | Convention |
|---|---|
| Entry point | `main.tsx` creates router and renders providers |
| Routing | `src/app/routes/` with generated `routeTree.gen.ts` |
| Providers | composed in `app/providers.tsx` |
| API layer | each feature exposes `useXxxQuery` and `useXxxMutation` |
| HTTP client | centralized in `shared/lib/http.ts` |
| Server state | TanStack Query owns it |
| Client state | Zustand only for UI and interaction state |
| Components | shared UI primitives in `src/shared/components/ui/` |
| Imports | use `import type` where applicable |
| Naming | kebab-case files, PascalCase components |
| Aliases | `@/` maps to `src/` |
| Generated code | do not hand-edit `routeTree.gen.ts` blindly |

## Workspace Management

Default (Single App):

- no workspaces; one `package.json` at the SPA root
- run `bun install` and the baseline scripts directly inside the SPA directory
- when the SPA shares a repo with a non-JS backend, do not introduce workspaces just to "tie things together" — use nsl for dev URL routing instead

Promotion (to Monorepo):

- only when the trigger conditions in *Project Layout > Monorepo* are met
- use Bun workspaces with `workspace:*` for cross-package references
- keep root scripts and app-local scripts predictable
- use pnpm workspaces only when the repo already standardizes on pnpm; update install, run, and CI commands consistently

## Baseline Scripts

Each PMA-Web app should expose at least:

```json
{
  "scripts": {
    "dev": "bunx nsl run vite",
    "dev:bare": "bunx --bun vite",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "@nsio/nsl": "^0.1.4"
  }
}
```

Notes:

- Install `@nsio/nsl` as a devDependency (`bun add -D @nsio/nsl`); it ships the `nsl` binary, no global install needed.
- `bunx nsl run vite` allocates a port, exports it as `PORT` (which Vite reads natively), and registers `<name>.localhost` → frontend. The full nsl protocol lives in `/pma references/dev-environment.md`.
- `dev:bare` keeps a plain Vite invocation around for CI smoke tests, container builds, or any environment where the nsl daemon cannot run.
