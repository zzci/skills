import type { NodeProps } from "@xyflow/react";
import type { RfdNodeData } from "../schema";

export function TitleNode({ data }: NodeProps & { data: RfdNodeData }) {
  return <div className="pma-node pma-node--title">{data.label ?? data.text ?? ""}</div>;
}

export function NoteNode({ data }: NodeProps & { data: RfdNodeData }) {
  return (
    <div className="pma-node pma-node--note" style={{ background: "#fefce8", borderColor: "#eab308", color: "#713f12" }}>
      {data.text ?? data.label ?? ""}
    </div>
  );
}

export function MarkerNode({ data }: NodeProps & { data: RfdNodeData }) {
  return (
    <div className="pma-node" style={{ background: "#fef3c7", borderColor: "#f59e0b", color: "#78350f", padding: "4px 8px", minWidth: 0 }}>
      {data.label ?? "•"}
    </div>
  );
}

export function DividerNode({ data }: NodeProps & { data: RfdNodeData }) {
  return (
    <div style={{ borderTop: "1px dashed #cbd5e1", width: "100%", color: "#64748b", fontSize: 11, paddingTop: 2 }}>
      {data.label ?? ""}
    </div>
  );
}
