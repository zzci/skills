import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  MiniMap,
  Controls,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./style.css";
import { nodeTypes } from "./nodes";
import { edgeTypes } from "./edges/presets";
import { RFD_SCHEMA_VERSION, validateRfdFile, type RfdEdge, type RfdFile, type RfdNode } from "./schema";
import { exportPaneAsPng, exportPaneAsSvg } from "./export";
import { applyAutoLayout, type LayoutDirection } from "./layout/dagre";

export interface PmaViewerApi {
  fitView: () => void;
  exportPNG: () => Promise<string>;
  exportSVG: () => Promise<string>;
}

export interface PmaViewerProps {
  src?: string;
  data?: RfdFile;
  height?: number | string;
  width?: number | string;
  fitView?: boolean;
  interactive?: boolean;
  theme?: "light" | "dark" | "auto";
  toolbar?: boolean;
  layout?: "manual" | "auto-lr" | "auto-tb" | "auto-rl" | "auto-bt";
  onReady?: (api: PmaViewerApi) => void;
}

function parseLayoutDirection(layout?: string): LayoutDirection | null {
  switch (layout) {
    case "auto-lr": return "LR";
    case "auto-tb": return "TB";
    case "auto-rl": return "RL";
    case "auto-bt": return "BT";
    default: return null;
  }
}

function useResolvedTheme(theme: PmaViewerProps["theme"]) {
  const [resolved, setResolved] = useState<"light" | "dark">(() => {
    if (theme === "light" || theme === "dark") return theme;
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "light";
  });
  useEffect(() => {
    if (theme === "light" || theme === "dark") {
      setResolved(theme);
      return;
    }
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (e: MediaQueryListEvent) => setResolved(e.matches ? "dark" : "light");
    mql.addEventListener("change", listener);
    return () => mql.removeEventListener("change", listener);
  }, [theme]);
  return resolved;
}

function toFlowNodes(nodes: RfdNode[]): Node[] {
  return nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data as Record<string, unknown>,
    parentId: n.parentNode,
    extent: n.extent,
    style: n.style,
    width: n.width,
    height: n.height,
    draggable: n.draggable,
    selectable: n.selectable,
  }));
}

function toFlowEdges(edges: RfdEdge[]): Edge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: e.type,
    label: e.label,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    animated: e.animated,
    data: e.data,
    style: e.style,
  }));
}

function Inner(props: PmaViewerProps) {
  const { src, data, height = "60vh", width = "100%", fitView = true, interactive = true, theme = "auto", toolbar = true, layout, onReady } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<RfdFile | null>(data ?? null);
  const [error, setError] = useState<string | null>(null);
  const resolvedTheme = useResolvedTheme(theme);
  const rf = useReactFlow();

  useEffect(() => {
    if (data) {
      const check = validateRfdFile(data);
      if (check.ok) { setFile(check.file); setError(null); } else setError(check.error);
      return;
    }
    if (!src) return;
    let cancelled = false;
    setError(null);
    fetch(src)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const check = validateRfdFile(json);
        if (check.ok) setFile(check.file);
        else setError(check.error);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => { cancelled = true; };
  }, [src, data]);

  const laidOut = useMemo(() => {
    if (!file) return null;
    const effective = layout ?? file.metadata?.layout;
    const dir = parseLayoutDirection(effective);
    if (!dir) return file.nodes;
    return applyAutoLayout(file.nodes, file.edges, { direction: dir });
  }, [file, layout]);

  const flowNodes = useMemo(() => (laidOut ? toFlowNodes(laidOut) : []), [laidOut]);
  const flowEdges = useMemo(() => (file ? toFlowEdges(file.edges) : []), [file]);

  const fit = useCallback(() => rf.fitView({ padding: 0.15, duration: 300 }), [rf]);
  const doExportPng = useCallback(async () => {
    if (!rootRef.current) throw new Error("viewer not mounted");
    return exportPaneAsPng(rootRef.current);
  }, []);
  const doExportSvg = useCallback(async () => {
    if (!rootRef.current) throw new Error("viewer not mounted");
    return exportPaneAsSvg(rootRef.current);
  }, []);

  useEffect(() => {
    if (!file) return;
    onReady?.({ fitView: fit, exportPNG: doExportPng, exportSVG: doExportSvg });
  }, [file, fit, doExportPng, doExportSvg, onReady]);

  if (error) {
    return (
      <div className="pma-viewer" data-pma-theme={resolvedTheme} style={{ width, height }}>
        <pre className="pma-error">Failed to load diagram: {error}</pre>
      </div>
    );
  }

  if (!file) {
    return (
      <div className="pma-viewer" data-pma-theme={resolvedTheme} style={{ width, height, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ opacity: 0.6 }}>Loading diagram…</span>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="pma-viewer" data-pma-theme={resolvedTheme} style={{ width, height }}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultViewport={file.viewport}
        fitView={fitView}
        nodesDraggable={interactive}
        nodesConnectable={false}
        elementsSelectable={interactive}
        panOnDrag={interactive}
        zoomOnScroll={interactive}
        zoomOnPinch={interactive}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} />
        {interactive ? <Controls showInteractive={false} /> : null}
        {interactive ? <MiniMap pannable zoomable /> : null}
      </ReactFlow>
      {toolbar ? (
        <div className="pma-toolbar">
          <button type="button" onClick={fit}>Fit</button>
          <button type="button" onClick={async () => {
            const url = await doExportPng();
            downloadDataUrl(url, (file.metadata?.title ?? "diagram") + ".png");
          }}>PNG</button>
          <button type="button" onClick={async () => {
            const url = await doExportSvg();
            downloadDataUrl(url, (file.metadata?.title ?? "diagram") + ".svg");
          }}>SVG</button>
        </div>
      ) : null}
    </div>
  );
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function PmaViewer(props: PmaViewerProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}

export { RFD_SCHEMA_VERSION, validateRfdFile };
export type { RfdFile, RfdNode, RfdEdge };
