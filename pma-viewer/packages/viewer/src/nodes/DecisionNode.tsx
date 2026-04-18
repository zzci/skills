import { Handle, Position, type NodeProps } from "@xyflow/react";
import { DEFAULT_PALETTES } from "../theme/tokens";
import type { RfdNodeData } from "../schema";

export function DecisionNode({ data }: NodeProps & { data: RfdNodeData }) {
  const palette = DEFAULT_PALETTES.decision;
  return (
    <div
      className="pma-node pma-node--decision"
      style={{ background: palette.bg, borderColor: palette.border, color: palette.text, borderWidth: 1.5, borderStyle: "solid" }}
    >
      <Handle type="target" position={Position.Top} id="in" />
      <div>
        <div className="pma-node__label">{data.label ?? "Decision"}</div>
        {data.subtitle ? <div className="pma-node__subtitle">{data.subtitle}</div> : null}
      </div>
      <Handle type="source" position={Position.Left} id="no" />
      <Handle type="source" position={Position.Right} id="yes" />
    </div>
  );
}
