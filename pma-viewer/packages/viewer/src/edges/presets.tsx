import { BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, type EdgeProps, type EdgeTypes } from "@xyflow/react";
import { EDGE_COLORS } from "../theme/tokens";

function renderLabel(label: string | undefined, labelX: number, labelY: number, color: string) {
  if (!label) return null;
  return (
    <EdgeLabelRenderer>
      <div
        style={{
          position: "absolute",
          transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          background: "#ffffff",
          padding: "2px 6px",
          borderRadius: 4,
          fontSize: 11,
          color,
          border: `1px solid ${color}33`,
          pointerEvents: "all",
        }}
      >
        {label}
      </div>
    </EdgeLabelRenderer>
  );
}

function makeStep(color: string, dashed = false, animated = false, width = 1.5) {
  return function Step(props: EdgeProps) {
    const [path, labelX, labelY] = getSmoothStepPath({
      sourceX: props.sourceX, sourceY: props.sourceY,
      targetX: props.targetX, targetY: props.targetY,
      sourcePosition: props.sourcePosition, targetPosition: props.targetPosition,
      borderRadius: 8,
    });
    return (
      <>
        <BaseEdge
          id={props.id}
          path={path}
          style={{ stroke: color, strokeWidth: width, strokeDasharray: dashed ? "6 4" : undefined }}
          className={animated ? "animated" : undefined}
          markerEnd={props.markerEnd}
        />
        {renderLabel(props.label as string | undefined, labelX, labelY, color)}
      </>
    );
  };
}

function makeBezier(color: string, dashed = false, width = 1.5) {
  return function Bezier(props: EdgeProps) {
    const [path, labelX, labelY] = getBezierPath({
      sourceX: props.sourceX, sourceY: props.sourceY,
      targetX: props.targetX, targetY: props.targetY,
      sourcePosition: props.sourcePosition, targetPosition: props.targetPosition,
    });
    return (
      <>
        <BaseEdge
          id={props.id}
          path={path}
          style={{ stroke: color, strokeWidth: width, strokeDasharray: dashed ? "4 3" : undefined }}
          markerEnd={props.markerEnd}
        />
        {renderLabel(props.label as string | undefined, labelX, labelY, color)}
      </>
    );
  };
}

export const edgeTypes: EdgeTypes = {
  flow:       makeStep(EDGE_COLORS.flow, false, false, 1.5),
  stream:     makeStep(EDGE_COLORS.stream, true, true, 2),
  callback:   makeBezier(EDGE_COLORS.callback, true, 1.25),
  dependency: makeStep(EDGE_COLORS.dependency, false, false, 1),
  comparison: makeStep(EDGE_COLORS.comparison, false, false, 2),
  annotated:  makeStep(EDGE_COLORS.annotated, false, false, 1.5),
  rejected:   makeStep(EDGE_COLORS.rejected, true, false, 1.5),
  async:      makeBezier(EDGE_COLORS.async, true, 1.5),
};
