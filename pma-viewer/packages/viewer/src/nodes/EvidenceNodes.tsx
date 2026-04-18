import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { RfdNodeData } from "../schema";

export function EvidenceCode({ data }: NodeProps & { data: RfdNodeData }) {
  const lang = (data.language as string) ?? "";
  return (
    <div className="pma-node pma-node--evidence-code" style={{ background: "#0f172a", borderColor: "#1e293b", color: "#e2e8f0", borderWidth: 1, borderStyle: "solid", borderRadius: 10 }}>
      <Handle type="target" position={Position.Top} id="in" style={{ background: "#38bdf8" }} />
      {data.label || lang ? (
        <div style={{ fontSize: 11, color: "#38bdf8", marginBottom: 6 }}>
          {data.label ?? lang}
        </div>
      ) : null}
      <code style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{(data.code as string) ?? ""}</code>
      <Handle type="source" position={Position.Bottom} id="out" style={{ background: "#38bdf8" }} />
    </div>
  );
}

export function EvidenceJson({ data }: NodeProps & { data: RfdNodeData }) {
  const content = typeof data.json === "string" ? data.json : JSON.stringify(data.json ?? {}, null, 2);
  return (
    <div className="pma-node pma-node--evidence-json" style={{ background: "#0f172a", borderColor: "#1e293b", color: "#e2e8f0", borderWidth: 1, borderStyle: "solid", borderRadius: 10 }}>
      <Handle type="target" position={Position.Top} id="in" style={{ background: "#22c55e" }} />
      {data.label ? <div style={{ fontSize: 11, color: "#22c55e", marginBottom: 6 }}>{data.label}</div> : null}
      <pre style={{ margin: 0, fontFamily: "inherit" }}>{content}</pre>
      <Handle type="source" position={Position.Bottom} id="out" style={{ background: "#22c55e" }} />
    </div>
  );
}

export function EvidenceUi({ data }: NodeProps & { data: RfdNodeData }) {
  return (
    <div className="pma-node" style={{ background: "#ffffff", borderColor: "#e2e8f0", color: "#0f172a", padding: 12, maxWidth: 320 }}>
      <Handle type="target" position={Position.Top} id="in" />
      {data.label ? <div className="pma-node__label">{data.label}</div> : null}
      {data.subtitle ? <div className="pma-node__subtitle">{data.subtitle}</div> : null}
      <Handle type="source" position={Position.Bottom} id="out" />
    </div>
  );
}
