---
name: pma-web
description: Frontend implementation guide for PMA-managed React + Vite SPA and internal-tool frontend projects. Covers required quality gates, file-based type-safe routing with TanStack Router, server state with TanStack Query, the shadcn/ui (base-nova) hard lock (other UI component ecosystems are forbidden), Tailwind theming, testing, i18n, nsl-based dev integration, and frontend delivery rules. Use when implementing, scaffolding, or reviewing a React/Vite SPA or internal-tool frontend in a PMA repo.
---

# Web Frontend Implementation Guide

Use this skill together with `/pma`. `/pma` controls workflow, approval, and task tracking; this guide defines the implementation baseline after work is approved.

Keep this entry file lean. Load only the reference packs needed for the current task.

## Scope

For PMA-managed SPA and internal-tool frontend projects using:

- React 19 + TypeScript + Vite 8
- TanStack Router for file-based type-safe routing
- TanStack Query for server state
- Zustand for UI-only client state
- shadcn/ui (base-nova style) with `@base-ui/react` primitives and Tailwind CSS v4 — this is the **only** allowed UI ecosystem; Radix UI and other component libraries are forbidden (see `references/baseline.md` *UI Library Policy*)

Single-app layout is the default. Reach for a Bun monorepo only when the repo really hosts multiple apps or shared packages — a single SPA bolted onto a Rust or Go service does not need workspaces.

Not for SSR-first sites, content sites, or non-PMA projects.

## Loading Order

1. Always load `references/baseline.md` first.
2. Load `references/routing-and-ui.md` when touching route structure, providers, theming, Tailwind, or shadcn/ui.
3. Load `references/runtime-and-data.md` when touching API integration, query state, i18n, Vite config, or the frontend-side dev script. For the full nsl protocol (registration patterns, `--strip`, `NSL_PORT`, fallback) load `/pma references/dev-environment.md`.
4. Load `references/review.md` when touching release checks, tests, accessibility, or security-sensitive UI behavior.

## Quick Routing

- New app setup or repo restructuring (single-app vs monorepo) → `references/baseline.md`
- Router, layouts, providers, entrypoint, shadcn, Tailwind, theme → `references/routing-and-ui.md`
- runtime (HTTP client, query client, i18n, Vite config) → `references/runtime-and-data.md`
- dev URL routing (nsl) → `references/runtime-and-data.md` (full protocol → `/pma references/dev-environment.md`)
- testing → `references/review.md`
- CI and delivery (lint, typecheck, build, accessibility, security review) → `references/review.md`

## Reference Packs

- `references/baseline.md`
  Stack defaults, quality gates, workspace layout, conventions, and baseline scripts.
- `references/routing-and-ui.md`
  TanStack Router layout, provider composition, entry point, shadcn/ui, Tailwind v4, and theming.
- `references/runtime-and-data.md`
  Query client, HTTP layer, state boundaries, i18n, Vite config, and the frontend-side nsl invocation. Full nsl protocol lives in `/pma references/dev-environment.md`.
- `references/review.md`
  Verification gates and the accessibility and security review checklist for UI changes.

## Acceptance Checklist

Before merge:

- [ ] `lint`, `typecheck`, `build` pass
- [ ] tests pass with coverage; target 80% or higher
- [ ] UI lock respected: no Radix or other component ecosystems (grep gate in `references/review.md`)
- [ ] new components followed the sourcing order in `references/baseline.md` *UI Library Policy*
- [ ] routing stays file-based under `src/app/routes/` with generated `routeTree.gen.ts`
- [ ] theming stays dual-channel (`:root` / `.dark` variables + `@theme inline` mapping); no hardcoded colors in components
- [ ] nsl dev routing works (`bun run dev` serves `<name>.localhost`; API reachable at `/api`)

If the project intentionally diverges from these defaults, keep the divergence explicit in the proposal and match the repository's existing patterns consistently.
