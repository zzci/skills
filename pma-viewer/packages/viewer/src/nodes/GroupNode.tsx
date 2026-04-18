import type { NodeProps } from "@xyflow/react";
import type { RfdNodeData } from "../schema";

export function GroupNode({ data }: NodeProps & { data: RfdNodeData }) {
  return (
    <div className="pma-node pma-node--group" style={{ width: "100%", height: "100%" }}>
      {data.label ? <div className="pma-node__label">{data.label}</div> : null}
      {data.subtitle ? <div className="pma-node__subtitle">{data.subtitle}</div> : null}
    </div>
  );
}
