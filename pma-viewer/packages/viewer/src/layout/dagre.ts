import dagre from "@dagrejs/dagre";
import type { RfdEdge, RfdNode } from "../schema";

export type LayoutDirection = "LR" | "TB" | "RL" | "BT";

export interface AutoLayoutOptions {
  direction?: LayoutDirection;
  nodesep?: number;
  ranksep?: number;
  marginx?: number;
  marginy?: number;
}

function estimateNodeSize(n: RfdNode): { width: number; height: number } {
  if (n.width && n.height) return { width: n.width, height: n.height };
  if (n.type === "group") {
    const w = typeof n.style?.width === "number" ? n.style.width : 320;
    const h = typeof n.style?.height === "number" ? n.style.height : 200;
    return { width: w, height: h };
  }
  if (n.type === "decision") return { width: 180, height: 110 };
  if (n.type === "user") return { width: 160, height: 80 };
  if (n.type === "note") return { width: 220, height: 100 };
  if (n.type === "marker" || n.type === "divider") return { width: 120, height: 40 };
  if (n.type === "evidence-code" || n.type === "evidence-json") return { width: 320, height: 200 };
  return { width: 220, height: 90 };
}

export function applyAutoLayout(
  nodes: RfdNode[],
  edges: RfdEdge[],
  options: AutoLayoutOptions = {},
): RfdNode[] {
  const direction = options.direction ?? "LR";
  const isHorizontal = direction === "LR" || direction === "RL";

  const parentToChildren = new Map<string, RfdNode[]>();
  const topLevel: RfdNode[] = [];
  for (const n of nodes) {
    if (n.parentNode) {
      const arr = parentToChildren.get(n.parentNode) ?? [];
      arr.push(n);
      parentToChildren.set(n.parentNode, arr);
    } else {
      topLevel.push(n);
    }
  }

  const groupBoxes = new Map<string, { width: number; height: number }>();
  const childPositions = new Map<string, { x: number; y: number }>();

  for (const [parentId, children] of parentToChildren.entries()) {
    const sub = new dagre.graphlib.Graph();
    sub.setGraph({
      rankdir: direction,
      nodesep: options.nodesep ?? (isHorizontal ? 40 : 30),
      ranksep: options.ranksep ?? (isHorizontal ? 80 : 60),
      marginx: 20,
      marginy: 30,
    });
    sub.setDefaultEdgeLabel(() => ({}));

    const childIds = new Set(children.map((c) => c.id));
    for (const c of children) {
      const dims = estimateNodeSize(c);
      sub.setNode(c.id, { width: dims.width, height: dims.height });
    }
    for (const e of edges) {
      if (childIds.has(e.source) && childIds.has(e.target)) {
        sub.setEdge(e.source, e.target);
      }
    }

    dagre.layout(sub);

    let maxX = 0;
    let maxY = 0;
    for (const c of children) {
      const nd = sub.node(c.id);
      if (!nd) continue;
      const left = nd.x - nd.width / 2;
      const top = nd.y - nd.height / 2;
      childPositions.set(c.id, { x: left, y: top });
      maxX = Math.max(maxX, left + nd.width);
      maxY = Math.max(maxY, top + nd.height);
    }
    groupBoxes.set(parentId, { width: maxX + 20, height: maxY + 20 });
  }

  const top = new dagre.graphlib.Graph();
  top.setGraph({
    rankdir: direction,
    nodesep: options.nodesep ?? (isHorizontal ? 60 : 40),
    ranksep: options.ranksep ?? (isHorizontal ? 100 : 80),
    marginx: options.marginx ?? 20,
    marginy: options.marginy ?? 20,
  });
  top.setDefaultEdgeLabel(() => ({}));

  const topIds = new Set(topLevel.map((n) => n.id));
  for (const n of topLevel) {
    const dims = n.type === "group" ? groupBoxes.get(n.id) ?? estimateNodeSize(n) : estimateNodeSize(n);
    top.setNode(n.id, { width: dims.width, height: dims.height });
  }

  const childToParent = new Map<string, string>();
  for (const [parent, children] of parentToChildren) {
    for (const c of children) childToParent.set(c.id, parent);
  }
  for (const e of edges) {
    const src = topIds.has(e.source) ? e.source : childToParent.get(e.source);
    const tgt = topIds.has(e.target) ? e.target : childToParent.get(e.target);
    if (!src || !tgt || src === tgt) continue;
    top.setEdge(src, tgt);
  }

  dagre.layout(top);

  return nodes.map((n) => {
    if (n.parentNode) {
      const pos = childPositions.get(n.id);
      if (!pos) return n;
      return { ...n, position: pos };
    }
    const nd = top.node(n.id);
    if (!nd) return n;
    const dims = n.type === "group" ? groupBoxes.get(n.id) ?? estimateNodeSize(n) : estimateNodeSize(n);
    const position = { x: nd.x - dims.width / 2, y: nd.y - dims.height / 2 };
    if (n.type === "group") {
      return {
        ...n,
        position,
        style: { ...n.style, width: dims.width, height: dims.height },
      };
    }
    return { ...n, position };
  });
}
