import type { NodeType } from "../schema";

export interface Palette {
  bg: string;
  border: string;
  text: string;
  accent?: string;
}

export const DEFAULT_PALETTES: Record<NodeType, Palette> = {
  frontend:     { bg: "#eff6ff", border: "#3b82f6", text: "#1e3a8a" },
  backend:      { bg: "#ecfdf5", border: "#10b981", text: "#064e3b" },
  database:     { bg: "#f5f3ff", border: "#8b5cf6", text: "#4c1d95" },
  storage:      { bg: "#fff7ed", border: "#f97316", text: "#7c2d12" },
  cache:        { bg: "#fef2f2", border: "#ef4444", text: "#7f1d1d" },
  queue:        { bg: "#fefce8", border: "#eab308", text: "#713f12" },
  ai:           { bg: "#fdf4ff", border: "#d946ef", text: "#701a75" },
  external:     { bg: "#f1f5f9", border: "#64748b", text: "#0f172a" },
  orchestrator: { bg: "#ecfeff", border: "#06b6d4", text: "#164e63" },
  decision:     { bg: "#fff7ed", border: "#f59e0b", text: "#78350f" },
  user:         { bg: "#f0fdf4", border: "#22c55e", text: "#14532d" },
  monitoring:   { bg: "#f8fafc", border: "#0ea5e9", text: "#0c4a6e" },
  security:     { bg: "#fef2f2", border: "#dc2626", text: "#7f1d1d" },
  group:        { bg: "#f8fafc", border: "#cbd5e1", text: "#334155" },
  title:        { bg: "transparent", border: "transparent", text: "#0f172a" },
  note:         { bg: "#fefce8", border: "#eab308", text: "#713f12" },
  marker:       { bg: "#fef3c7", border: "#f59e0b", text: "#78350f" },
  divider:      { bg: "transparent", border: "#cbd5e1", text: "#64748b" },
  "evidence-code": { bg: "#0f172a", border: "#1e293b", text: "#e2e8f0", accent: "#38bdf8" },
  "evidence-json": { bg: "#0f172a", border: "#1e293b", text: "#e2e8f0", accent: "#22c55e" },
  "evidence-ui":   { bg: "#ffffff", border: "#e2e8f0", text: "#0f172a" },
  process:      { bg: "#ffffff", border: "#94a3b8", text: "#0f172a" },
  start:        { bg: "#dcfce7", border: "#16a34a", text: "#14532d" },
  end:          { bg: "#fee2e2", border: "#dc2626", text: "#7f1d1d" },
  io:           { bg: "#e0f2fe", border: "#0284c7", text: "#0c4a6e" },
};

export const EDGE_COLORS = {
  flow: "#64748b",
  stream: "#06b6d4",
  callback: "#8b5cf6",
  dependency: "#94a3b8",
  comparison: "#0f172a",
  annotated: "#334155",
  rejected: "#dc2626",
  async: "#f59e0b",
} as const;
