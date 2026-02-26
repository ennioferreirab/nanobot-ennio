/**
 * Converts PlanStep[] into React Flow nodes/edges and applies dagre layout.
 */

import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";
import type { PlanStep } from "./types";

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
  rankSep: 60,
  nodeSep: 40,
  direction: "TB",
};

/**
 * Convert PlanStep[] into React Flow nodes and edges.
 * Nodes carry step data; edges are derived from `blockedBy`.
 */
export function stepsToNodesAndEdges(
  steps: PlanStep[],
  options?: FlowLayoutOptions
): { nodes: Node[]; edges: Edge[] } {
  const opts = { ...DEFAULTS, ...options };

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

  return { nodes, edges };
}

/**
 * Position nodes using dagre (top-to-bottom layout).
 */
export function layoutWithDagre(
  nodes: Node[],
  edges: Edge[],
  options?: FlowLayoutOptions
): Node[] {
  const opts = { ...DEFAULTS, ...options };

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: opts.direction,
    ranksep: opts.rankSep,
    nodesep: opts.nodeSep,
  });

  for (const node of nodes) {
    g.setNode(node.id, {
      width: opts.nodeWidth,
      height: opts.nodeHeight,
    });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const nodeWithPosition = g.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - opts.nodeWidth / 2,
        y: nodeWithPosition.y - opts.nodeHeight / 2,
      },
    };
  });
}
