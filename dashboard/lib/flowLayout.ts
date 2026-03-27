/**
 * Converts EditablePlanStep[] into React Flow nodes/edges and applies dagre layout.
 */

import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";
import type { EditablePlanStep } from "./types";

export interface FlowLayoutOptions {
  nodeWidth?: number;
  nodeHeight?: number;
  rankSep?: number;
  nodeSep?: number;
  direction?: "TB" | "LR";
}

const DEFAULTS: Required<FlowLayoutOptions> = {
  nodeWidth: 220,
  nodeHeight: 80,
  rankSep: 120,
  nodeSep: 60,
  direction: "LR",
};

const START_NODE_ID = "__start__";
const END_NODE_ID = "__end__";
const START_END_WIDTH = 120;
const START_END_HEIGHT = 50;
const PARALLEL_LABEL_SIZE = 20;

/**
 * Convert EditablePlanStep[] into React Flow nodes and edges.
 * Injects START and END terminal nodes connected to root/leaf steps.
 */
export function stepsToNodesAndEdges(
  steps: EditablePlanStep[],
  options?: FlowLayoutOptions,
): { nodes: Node[]; edges: Edge[] } {
  const opts = { ...DEFAULTS, ...options };

  const startNode: Node = {
    id: START_NODE_ID,
    type: "start",
    data: {},
    position: { x: 0, y: 0 },
    width: START_END_WIDTH,
    height: START_END_HEIGHT,
    selectable: false,
    draggable: false,
    deletable: false,
  };

  const endNode: Node = {
    id: END_NODE_ID,
    type: "end",
    data: {},
    position: { x: 0, y: 0 },
    width: START_END_WIDTH,
    height: START_END_HEIGHT,
    selectable: false,
    draggable: false,
    deletable: false,
  };

  if (steps.length === 0) {
    return {
      nodes: [startNode, endNode],
      edges: [
        { id: `e-${START_NODE_ID}-${END_NODE_ID}`, source: START_NODE_ID, target: END_NODE_ID },
      ],
    };
  }

  const nodes: Node[] = steps.map((step) => ({
    id: step.tempId,
    type: "flowStep",
    data: { step },
    position: { x: 0, y: 0 },
    width: opts.nodeWidth,
    height: opts.nodeHeight,
  }));

  const edges: Edge[] = [];
  for (const step of steps) {
    for (const blockerId of step.blockedBy) {
      edges.push({
        id: `e-${blockerId}-${step.tempId}`,
        source: blockerId,
        target: step.tempId,
        animated: false,
      });
    }
  }

  // Root steps: no dependencies → connect from START
  const rootSteps = steps.filter((s) => s.blockedBy.length === 0);
  for (const step of rootSteps) {
    edges.push({
      id: `e-${START_NODE_ID}-${step.tempId}`,
      source: START_NODE_ID,
      target: step.tempId,
      animated: false,
    });
  }

  // Leaf steps: not referenced by any other step's blockedBy → connect to END
  const referencedByOthers = new Set(steps.flatMap((s) => s.blockedBy));
  const leafSteps = steps.filter((s) => !referencedByOthers.has(s.tempId));
  for (const step of leafSteps) {
    edges.push({
      id: `e-${step.tempId}-${END_NODE_ID}`,
      source: step.tempId,
      target: END_NODE_ID,
      animated: false,
    });
  }

  // --- Detect parallel groups and annotate edges ---
  // A fork: a source node with 2+ outgoing edges to step nodes
  // A join: a target node with 2+ incoming edges from step nodes

  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const edge of edges) {
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source)!.push(edge.target);
    if (!incoming.has(edge.target)) incoming.set(edge.target, []);
    incoming.get(edge.target)!.push(edge.source);
  }

  // Mark fork edges (source has 2+ outgoing to step nodes)
  const forkSources = new Set<string>();
  for (const [source, targets] of outgoing) {
    const stepTargets = targets.filter((t) => t !== END_NODE_ID);
    if (stepTargets.length >= 2) forkSources.add(source);
  }

  // Mark join edges (target has 2+ incoming from step nodes)
  const joinTargets = new Set<string>();
  for (const [target, sources] of incoming) {
    const stepSources = sources.filter((s) => s !== START_NODE_ID);
    if (stepSources.length >= 2) joinTargets.add(target);
  }

  // Annotate edges with parallel fork/join data and set edge type
  const annotatedEdges: Edge[] = edges.map((edge) => {
    const isParallelFork = forkSources.has(edge.source) && edge.target !== END_NODE_ID;
    const isParallelJoin = joinTargets.has(edge.target) && edge.source !== START_NODE_ID;
    if (isParallelFork || isParallelJoin) {
      return {
        ...edge,
        type: "parallel",
        data: { isParallelFork, isParallelJoin },
      };
    }
    return edge;
  });

  // Insert parallel label pseudo-nodes between fork siblings
  const parallelLabelNodes: Node[] = [];
  for (const source of forkSources) {
    const targets = (outgoing.get(source) ?? []).filter((t) => t !== END_NODE_ID);
    if (targets.length < 2) continue;
    const labelId = `__parallel_label_${source}__`;
    parallelLabelNodes.push({
      id: labelId,
      type: "parallelLabel",
      data: { forkSource: source, forkTargets: targets },
      position: { x: 0, y: 0 },
      width: PARALLEL_LABEL_SIZE,
      height: PARALLEL_LABEL_SIZE,
      selectable: false,
      draggable: false,
      deletable: false,
    });
  }

  return {
    nodes: [startNode, ...nodes, ...parallelLabelNodes, endNode],
    edges: annotatedEdges,
  };
}

/**
 * Position nodes using dagre (left-to-right layout).
 * Respects per-node width/height for accurate sizing of START/END nodes.
 * Positions parallel label pseudo-nodes at the midpoint of their fork targets.
 */
export function layoutWithDagre(nodes: Node[], edges: Edge[], options?: FlowLayoutOptions): Node[] {
  const opts = { ...DEFAULTS, ...options };

  // Separate label pseudo-nodes — they are not part of the dagre graph
  const labelNodes: Node[] = [];
  const graphNodes: Node[] = [];
  for (const node of nodes) {
    if (node.type === "parallelLabel") {
      labelNodes.push(node);
    } else {
      graphNodes.push(node);
    }
  }

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: opts.direction,
    ranksep: opts.rankSep,
    nodesep: opts.nodeSep,
  });

  for (const node of graphNodes) {
    g.setNode(node.id, {
      width: node.width ?? opts.nodeWidth,
      height: node.height ?? opts.nodeHeight,
    });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const positioned = graphNodes.map((node) => {
    const nodeWithPosition = g.node(node.id);
    const w = node.width ?? opts.nodeWidth;
    const h = node.height ?? opts.nodeHeight;
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - w / 2,
        y: nodeWithPosition.y - h / 2,
      },
    };
  });

  // Position label nodes at the vertical midpoint of their fork targets,
  // horizontally between the fork source and targets.
  const positionedMap = new Map(positioned.map((n) => [n.id, n]));
  const positionedLabels = labelNodes.map((label) => {
    const data = label.data as { forkSource: string; forkTargets: string[] };
    const targetNodes = data.forkTargets
      .map((id: string) => positionedMap.get(id))
      .filter(Boolean) as Node[];
    const sourceNode = positionedMap.get(data.forkSource);

    if (targetNodes.length === 0 || !sourceNode) return label;

    // Average Y of targets (center of each target node)
    const avgY =
      targetNodes.reduce((sum, n) => sum + n.position.y + (n.height ?? opts.nodeHeight) / 2, 0) /
      targetNodes.length;

    // X: between source right edge and targets left edge
    const sourceRight = sourceNode.position.x + (sourceNode.width ?? opts.nodeWidth);
    const targetLeft = Math.min(...targetNodes.map((n) => n.position.x));
    const midX = (sourceRight + targetLeft) / 2;

    return {
      ...label,
      position: {
        x: midX - (label.width ?? PARALLEL_LABEL_SIZE) / 2,
        y: avgY - (label.height ?? PARALLEL_LABEL_SIZE) / 2,
      },
    };
  });

  return [...positioned, ...positionedLabels];
}
