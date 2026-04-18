import type { NodeTypes } from "@xyflow/react";
import { SemanticNode } from "./SemanticNode";
import { DecisionNode } from "./DecisionNode";
import { GroupNode } from "./GroupNode";
import { TitleNode, NoteNode, MarkerNode, DividerNode } from "./StructuralNodes";
import { EvidenceCode, EvidenceJson, EvidenceUi } from "./EvidenceNodes";
import { ProcessNode, StartNode, EndNode, IoNode } from "./UtilityNodes";

export const nodeTypes: NodeTypes = {
  frontend: SemanticNode,
  backend: SemanticNode,
  database: SemanticNode,
  storage: SemanticNode,
  cache: SemanticNode,
  queue: SemanticNode,
  ai: SemanticNode,
  external: SemanticNode,
  orchestrator: SemanticNode,
  user: SemanticNode,
  monitoring: SemanticNode,
  security: SemanticNode,
  decision: DecisionNode,
  group: GroupNode,
  title: TitleNode,
  note: NoteNode,
  marker: MarkerNode,
  divider: DividerNode,
  "evidence-code": EvidenceCode,
  "evidence-json": EvidenceJson,
  "evidence-ui": EvidenceUi,
  process: ProcessNode,
  start: StartNode,
  end: EndNode,
  io: IoNode,
};
