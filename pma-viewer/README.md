# pma-viewer

ReactFlow-based viewer for `.rfd.json` diagrams produced by the `pma-draw`
skill. Lives at the repo root; the skill (`skills/pma-draw/`) only ships
specification and docs — no runtime code.

## Structure

```
pma-viewer/
├── packages/
│   └── viewer/        # @zzci/pma-viewer — the published React + UMD library
└── apps/
    └── site/          # Cloudflare Pages SPA + /render.svg Pages Function
```

## Quick Start

```bash
pnpm install
pnpm dev           # starts the SPA at localhost:5173
pnpm build         # builds library + site
pnpm build:lib     # build @zzci/pma-viewer only
pnpm build:site    # build Cloudflare Pages SPA only
```

## Publishing the library

```bash
cd packages/viewer
pnpm build
pnpm publish --access public
```

## Deploying the site

The `apps/site` package is a Cloudflare Pages project.

```bash
cd apps/site
pnpm build                     # outputs dist/
npx wrangler pages deploy dist # or connect the repo in the Cloudflare dashboard
```

Pages Functions in `apps/site/functions/` are deployed automatically with the SPA.

## Contract

The viewer implements the node / edge / color catalog defined in the skill's
reference pack at `../skills/pma-draw/references/` (node-types.md, edges.md,
colors.md). Any drift between skill and viewer must be resolved in the
viewer — the skill emits JSON only.

Schema version: `pma-draw/v1`.
