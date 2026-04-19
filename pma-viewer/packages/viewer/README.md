# @zzci/pma-viewer

ReactFlow-based viewer for `.rfd.json` diagrams produced by the `pma-draw` skill.

## Install

```bash
pnpm add @zzci/pma-viewer
```

## React / MDX

```tsx
import { PmaViewer } from "@zzci/pma-viewer";
import "@zzci/pma-viewer/style.css";

export default function Arch() {
  return <PmaViewer src="/diagrams/ingest.rfd.json" height={560} />;
}
```

## Browser (UMD)

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@zzci/pma-viewer/dist/style.css" />
<script src="https://cdn.jsdelivr.net/npm/@zzci/pma-viewer/dist/pma-viewer.umd.js"></script>
<div id="d" style="height:560px"></div>
<script>
  PmaViewer.mount("#d", { src: "/diagrams/ingest.rfd.json" });
</script>
```

## Schema

Accepts files with `schema: "pma-draw/v1"`. See the `pma-draw` skill's
`references/json-schema.md` for the full spec.

## License

MIT
