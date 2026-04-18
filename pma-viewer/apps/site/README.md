# pma-viewer site

Cloudflare Pages SPA that hosts the viewer and a server-rendered SVG endpoint.

## Local dev

```bash
pnpm install            # at the monorepo root
pnpm dev                # starts Vite at http://localhost:5173
```

Open <http://localhost:5173/?src=https://raw.githubusercontent.com/...ingest.rfd.json>
or drag a `.rfd.json` onto the page.

## Deploy to Cloudflare Pages

```bash
pnpm build
npx wrangler pages deploy dist
```

Or connect the repo at <https://dash.cloudflare.com/> → Pages → Create project.
Build command: `pnpm build`. Build output: `apps/site/dist`.

## Pages Functions

`functions/render.svg.ts` implements `GET /render.svg?src=<json-url>` using
`@cloudflare/puppeteer` on top of the Cloudflare **Browser Rendering** binding.
It launches a headless page, navigates to `/?src=<url>&interactive=0&toolbar=0`,
waits for the `.react-flow__viewport` selector, and serializes the nodes +
edges SVG into a self-contained `<svg>` with a computed bounding box.

Steps to enable on the account:

1. In the Cloudflare dashboard, enable Browser Rendering for the account /
   project.
2. `wrangler.toml` already declares the `BROWSER` binding.
3. Deploy with `pnpm deploy` — the Pages Function is picked up automatically
   from `apps/site/functions/`.

## Env vars

| Var | Purpose |
|-----|---------|
| `ALLOWED_SRC_HOSTS` | Comma-separated allow-list for `?src=` hosts. Unset = any https. |

## Endpoints

| Path | Description |
|------|-------------|
| `/`  | SPA landing (file drop + URL params) |
| `/?src=<url>` | Opens a hosted `.rfd.json` interactively |
| `/render.svg?src=<url>` | Server-rendered SVG (for GitHub README etc.) |
