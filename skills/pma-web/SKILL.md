---
name: pma-web
description: Frontend implementation guide for PMA-managed React 19 + TypeScript + Vite 8 monorepo projects. Covers repository layout, required quality gates, type-safe routing with TanStack Router, state conventions (TanStack Query + Zustand), shadcn/ui + Tailwind CSS 4.2 patterns, Vitest 4 testing, theming, i18n, and delivery rules for frontend applications.
---

# Web Frontend Implementation Guide

Use this skill together with `/pma`. `/pma` controls workflow, approval, and task tracking; this guide defines the implementation baseline for frontend delivery work after implementation is approved.

## Scope

**For:** PMA-managed SPA and internal-tool web applications (dashboards, admin panels, back-office systems) using:

- React 19 + TypeScript + Vite 8
- TanStack Router for type-safe routing
- TanStack Query for server/async state
- Zustand for UI-only client state
- shadcn/ui (Base UI primitives) + Tailwind CSS v4

**Not for:** SSR-first / content-heavy sites (consider Next.js or Astro), static marketing pages, or projects that do not use the `/pma` workflow.

Keep this guide focused on engineering standards, not product-specific defaults.

## Tech Stack

Constraint levels:

- **Required** — non-negotiable for all projects using this skill
- **Default** — standard choice; replace only with documented justification
- **Optional** — adopt when the project needs it
- **Alternative** — supported substitute for a Default item

### Required

| Category | Technology | Version | Notes |
|---|---|---|---|
| Framework | React | 19 | default app framework |
| Language | TypeScript | 5.9+ | strict mode |
| Build tool | Vite | 8 | `host: '0.0.0.0'`, `allowedHosts: true` |
| Styling | Tailwind CSS | 4.2 | `@theme` + CSS variables |
| Server state | TanStack Query | 5 | owns request lifecycle, caching, retries, invalidation |
| Lint / format | ESLint + @antfu/eslint-config | 10 / 7.7 | no Prettier; formatting handled by ESLint |
| Test | Vitest | 4 | unit and integration tests, compatible with Vite 8 |

### Default

| Category | Technology | Version | Notes |
|---|---|---|---|
| Package manager | bun workspaces | — | monorepo workspace management |
| Router | TanStack Router | 1 | file-based or code-based type-safe routing with built-in search param validation |
| Client state | Zustand | 5.0 | UI-only local state; do not duplicate server state here |
| UI | shadcn/ui | latest | generated, owned code |
| Theming | ThemeProvider pattern | — | light / dark / system via CSS variables + `localStorage` |

### Optional

| Category | Technology | When to adopt |
|---|---|---|
| i18n | react-i18next | product requires multiple locales |
| Forms | react-hook-form | complex form validation beyond controlled inputs |
| E2E test | Playwright | critical user flows need browser-level verification |

### Alternative

| Replaces | Technology | Notes |
|---|---|---|
| bun workspaces | pnpm workspaces | more mature for large monorepos; use if bun compatibility is a blocker |
| react-i18next | LinguiJS | compile-time approach, ~50% smaller bundle; prefer for bundle-sensitive projects |

## Required Quality Gates

Every PMA-Web project should define these checks before merge:

| Gate | Requirement |
|---|---|
| Lint | `bun run lint` passes with no errors |
| Typecheck | `bun run typecheck` passes |
| Build | `bun run build` succeeds |
| Test | `bun run test` passes for the project scope |
| Accessibility | keyboard navigation, labels, focus states, and contrast reviewed for changed UI |
| Security | no unsafe HTML injection, auth boundaries checked, env usage reviewed |

If a project does not yet expose one of these commands, add it early instead of leaving verification implicit.

## Monorepo Structure

Use one consistent folder strategy. This guide standardizes on shared framework code under `src/shared/`.

```text
bunfig.toml
bun.lock
package.json                       # workspaces: ["apps/*", "packages/*"]
eslint.config.ts
apps/
  web/
    src/
      app/
        providers.tsx              # compose root providers
        router.tsx                 # TanStack Router route tree
        routeTree.gen.ts           # auto-generated route tree (if using file-based routing)
        i18n.ts                    # optional i18n bootstrap
      features/
        auth/
          api.ts                   # TanStack Query hooks
          routes.tsx               # feature route definitions (code-based) or route files
          store.ts                 # optional Zustand store
          components/
          hooks/
        dashboard/
          ...
      shared/
        components/
          ui/                      # shadcn/ui generated components
          theme-provider.tsx
          mode-toggle.tsx
        hooks/
        lib/
          http.ts                  # fetch wrapper / API client
          query-client.ts
          utils.ts                 # cn(), shared helpers
        types/
      styles/
        theme.css
      index.css
    index.html
    package.json
    tsconfig.json
    vite.config.ts
packages/
  config/
    tsconfig/
      base.json
      react.json
      utils.json
    package.json
  shared/
    src/
      index.ts
    package.json
```

## Required Conventions

| Area | Convention |
|---|---|
| Routing | `app/router.tsx` defines the route tree using TanStack Router; feature routes are split via lazy loading |
| API layer | each feature exports `useXxxQuery` / `useXxxMutation` from `api.ts` |
| Server state | TanStack Query owns request lifecycle, caching, retries, and invalidation |
| Client state | Zustand stores only UI or interaction state; do not mirror server data there |
| Components | generated shadcn/ui components live in `src/shared/components/ui/`; business components stay inside each feature |
| Imports | use `import type` for type-only imports |
| Naming | files: kebab-case; components: PascalCase; hooks: `use-xxx.ts` |
| Aliases | `@/` maps to `src/`; shared aliases must match the actual folder layout |
| Generated code | shadcn/ui output is owned code; update via CLI and local edits, not copied snippets from docs |

## bun Workspaces

- Root `package.json` declares `"workspaces": ["apps/*", "packages/*"]`
- Use `bun install`, not `pnpm install`
- Cross-package references use `workspace:*`
- Common app commands should be runnable via `bun run --filter apps/web <script>`

## packages/config

Shared TypeScript configs should live in `packages/config/tsconfig/`.

| File | Purpose |
|---|---|
| `base.json` | strict defaults, NodeNext, ES2022 |
| `react.json` | bundler module resolution, `jsx: react-jsx`, `noEmit: true` |
| `utils.json` | shared config for utility packages |

Example app config:

```json
{
  "extends": "@repo/config/tsconfig/react.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

## packages/shared

Use `packages/shared` for cross-workspace domain types and constants:

- API request / response types
- shared enums and value objects
- constants reused by multiple apps or packages

Keep it dependency-light and prefer `import type` on the consuming side.

## Scripts

Each PMA-Web project should expose at least:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

Projects may add `test:e2e`, `storybook`, or `check`, but the baseline should remain predictable.

## State Management

| Data type | Solution |
|---|---|
| Async/request state | TanStack Query |
| Client UI state | Zustand |
| Theme | ThemeProvider |
| Forms | controlled inputs or react-hook-form |

Rules:

- Do not duplicate TanStack Query data into Zustand.
- Keep feature-specific stores within the feature unless they are genuinely cross-feature.
- Query keys must be explicit and stable.
- Mutations must invalidate or update relevant queries deliberately.

## Theming

- Use the shadcn/ui Vite theme setup pattern
- ThemeProvider is the single source of truth; do not create a parallel theme store in Zustand
- Support light / dark / system when the product needs them
- Persist the selected theme via `localStorage`
- Define design tokens with Tailwind v4 `@theme` and CSS variables

## i18n

i18n is optional unless the product requires multiple locales.

When localization is enabled:

- use `react-i18next` with namespace-per-feature organization
- keep locale files under `public/locales/{{lng}}/{{ns}}.json`
- support the locales required by the product, not hardcoded defaults from this skill
- set fallback language according to the product's primary language
- lazy-load namespaces with `i18next-http-backend` when bundle size matters

## Provider Composition Order

```text
I18nextProvider (optional)
  QueryClientProvider
    ThemeProvider
      RouterProvider          # TanStack Router
```

If i18n is not required, omit `I18nextProvider`. The `RouterProvider` from TanStack Router replaces the traditional `<App />` root — routes define the component tree.

## ESLint

- Use `@antfu/eslint-config` with TypeScript and React support
- Do not add Prettier unless the repository already standardizes on it
- Formatting is handled by ESLint
- Ignore generated shadcn/ui files at `src/shared/components/ui/**` only if the project truly treats them as generated output

## Vite Config

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    tsConfigPaths(),
    TanStackRouterVite(),          // file-based route generation; omit if using code-based routing
    react(),
  ],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
})
```

## shadcn/ui Initialization

Run shadcn from the app directory:

```bash
cd apps/web
bunx shadcn@latest init
```

Recommended answers:

- Component library: `base-ui` (alternative: `radix`)
- Style: `nova` (compact; alternatives: `vega` classic, `maia` rounded, `lyra` sharp, `mira`)
- Base color: `neutral`
- CSS variables: `yes`
- RSC: `no`
- Icon library: `lucide`

Align `components.json` with the repository structure:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "nova",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/shared/components",
    "utils": "@/shared/lib/utils",
    "ui": "@/shared/components/ui",
    "lib": "@/shared/lib",
    "hooks": "@/shared/hooks"
  }
}
```

Component commands:

```bash
bunx shadcn@latest add button card dialog
bunx shadcn@latest add sonner
```

Rules:

- generate components into `src/shared/components/ui/`
- keep alias paths synchronized with actual folders
- add new primitives through the CLI instead of pasting arbitrary snippets

## Tailwind CSS v4

```css
/* src/index.css */
@import 'tailwindcss';
@import 'tw-animate-css';

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-border: var(--border);
  --color-ring: var(--ring);
}
```

Put product tokens in CSS variables and map them into Tailwind tokens. Avoid hardcoding colors deep inside feature components.

## Accessibility and Security Review

For every UI-affecting change, review:

- keyboard access and visible focus
- semantic labels for forms, dialogs, menus, and icon-only buttons
- contrast on both light and dark themes
- loading, empty, and error states
- unsafe rendering such as `dangerouslySetInnerHTML`
- auth and permission checks around protected routes and actions

These checks are part of delivery quality, not optional polish.
