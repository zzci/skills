import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { CSSProperties } from "react";
import { DEFAULT_PALETTES } from "../theme/tokens";
import type { NodeType, RfdNodeData } from "../schema";

interface SemanticNodeProps extends NodeProps {
  data: RfdNodeData;
  type: string;
}

export function SemanticNode({ data, type }: SemanticNodeProps) {
  const palette = DEFAULT_PALETTES[type as NodeType] ?? DEFAULT_PALETTES.process;
  const style: CSSProperties = {
    background: palette.bg,
    borderColor: palette.border,
    color: palette.text,
  };
  const body = (
    <>
      <div className="pma-node__label">
        {data.icon ? <span aria-hidden>{data.icon}</span> : null}
        <span>{data.label ?? type}</span>
      </div>
      {data.subtitle ? <div className="pma-node__subtitle">{data.subtitle}</div> : null}
      {data.badges?.length ? (
        <div className="pma-node__badges">
          {data.badges.map((b, i) => (
            <span key={i} className="pma-node__badge">{b}</span>
          ))}
        </div>
      ) : null}
    </>
  );
  const className = `pma-node pma-node--${type}${data.dimmed ? " pma-node--dimmed" : ""}`;
  return (
    <div className={className} style={style}>
      <Handle type="target" position={Position.Top} id="in" />
      {data.href ? (
        <a href={data.href as string} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none" }}>
          {body}
        </a>
      ) : body}
      <Handle type="source" position={Position.Bottom} id="out" />
    </div>
  );
}
