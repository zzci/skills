export const RFD_SCHEMA_VERSION = "pma-draw/v1";

export type NodeType =
  | "frontend"
  | "backend"
  | "database"
  | "storage"
  | "cache"
  | "queue"
  | "ai"
  | "external"
  | "orchestrator"
  | "decision"
  | "user"
  | "monitoring"
  | "security"
  | "group"
  | "title"
  | "note"
  | "marker"
  | "divider"
  | "evidence-code"
  | "evidence-json"
  | "evidence-ui"
  | "process"
  | "start"
  | "end"
  | "io";

export type EdgeType =
  | "flow"
  | "stream"
  | "callback"
  | "dependency"
  | "comparison"
  | "annotated"
  | "rejected"
  | "async";

export interface RfdNodeData {
  label?: string;
  subtitle?: string;
  icon?: string;
  badges?: string[];
  href?: string;
  dimmed?: boolean;
  code?: string;
  language?: string;
  json?: unknown;
  text?: string;
  [key: string]: unknown;
}

export interface RfdNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: RfdNodeData;
  parentNode?: string;
  extent?: "parent";
  style?: Record<string, string | number>;
  width?: number;
  height?: number;
  draggable?: boolean;
  selectable?: boolean;
}

export interface RfdEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  label?: string;
  sourceHandle?: string;
  targetHandle?: string;
  animated?: boolean;
  data?: Record<string, unknown>;
  style?: Record<string, string | number>;
}

export interface RfdViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface RfdFile {
  schema: typeof RFD_SCHEMA_VERSION;
  type: "reactflow";
  metadata?: {
    title?: string;
    description?: string;
    createdAt?: string;
    palette?: "default" | "aws" | "azure" | "gcp" | "k8s";
    [key: string]: unknown;
  };
  viewport?: RfdViewport;
  nodes: RfdNode[];
  edges: RfdEdge[];
}

export function isRfdFile(value: unknown): value is RfdFile {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<RfdFile>;
  return (
    v.schema === RFD_SCHEMA_VERSION &&
    v.type === "reactflow" &&
    Array.isArray(v.nodes) &&
    Array.isArray(v.edges)
  );
}

export function validateRfdFile(value: unknown): { ok: true; file: RfdFile } | { ok: false; error: string } {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: "Input is not an object" };
  }
  const v = value as Partial<RfdFile>;
  if (v.schema !== RFD_SCHEMA_VERSION) {
    return { ok: false, error: `Expected schema "${RFD_SCHEMA_VERSION}", got "${String(v.schema)}"` };
  }
  if (v.type !== "reactflow") {
    return { ok: false, error: `Expected type "reactflow", got "${String(v.type)}"` };
  }
  if (!Array.isArray(v.nodes)) return { ok: false, error: "nodes[] missing" };
  if (!Array.isArray(v.edges)) return { ok: false, error: "edges[] missing" };

  const ids = new Set<string>();
  for (const n of v.nodes) {
    if (!n.id) return { ok: false, error: "node missing id" };
    if (ids.has(n.id)) return { ok: false, error: `duplicate node id: ${n.id}` };
    ids.add(n.id);
  }
  for (const e of v.edges) {
    if (!e.id || !e.source || !e.target) return { ok: false, error: `edge missing id/source/target` };
    if (!ids.has(e.source)) return { ok: false, error: `edge.source not found: ${e.source}` };
    if (!ids.has(e.target)) return { ok: false, error: `edge.target not found: ${e.target}` };
  }
  return { ok: true, file: v as RfdFile };
}
