import { Handle, Position, type NodeProps } from "@xyflow/react";
import { DEFAULT_PALETTES } from "../theme/tokens";
import type { NodeType, RfdNodeData } from "../schema";

function base(type: NodeType, data: RfdNodeData, shape?: "round") {
  const palette = DEFAULT_PALETTES[type];
  const style = {
    background: palette.bg,
    borderColor: palette.border,
    color: palette.text,
    borderRadius: shape === "round" ? 999 : 10,
  };
  return (
    <div className={`pma-node pma-node--${type}`} style={style}>
      <Handle type="target" position={Position.Top} id="in" />
      <div className="pma-node__label">{data.label ?? type}</div>
      {data.subtitle ? <div className="pma-node__subtitle">{data.subtitle}</div> : null}
      <Handle type="source" position={Position.Bottom} id="out" />
    </div>
  );
}

export function ProcessNode({ data }: NodeProps & { data: RfdNodeData }) { return base("process", data); }
export function StartNode({ data }: NodeProps & { data: RfdNodeData }) { return base("start", data, "round"); }
export function EndNode({ data }: NodeProps & { data: RfdNodeData }) { return base("end", data, "round"); }
export function IoNode({ data }: NodeProps & { data: RfdNodeData }) { return base("io", data); }
