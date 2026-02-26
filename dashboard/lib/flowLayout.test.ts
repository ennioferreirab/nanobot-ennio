import { describe, it, expect } from "vitest";
import { stepsToNodesAndEdges, layoutWithDagre } from "./flowLayout";
import type { PlanStep } from "./types";

function makeStep(overrides: Partial<PlanStep> & { tempId: string }): PlanStep {
  return {
    title: overrides.tempId,
    description: overrides.tempId,
    assignedAgent: "nanobot",
    blockedBy: [],
    parallelGroup: 0,
    order: 0,
    ...overrides,
  };
}

describe("stepsToNodesAndEdges", () => {
  it("creates one node per step", () => {
    const steps = [
      makeStep({ tempId: "A" }),
      makeStep({ tempId: "B" }),
      makeStep({ tempId: "C" }),
    ];
    const { nodes, edges } = stepsToNodesAndEdges(steps);
    expect(nodes).toHaveLength(3);
    expect(edges).toHaveLength(0);
  });

  it("creates edges from blockedBy", () => {
    const steps = [
      makeStep({ tempId: "A" }),
      makeStep({ tempId: "B", blockedBy: ["A"] }),
      makeStep({ tempId: "C", blockedBy: ["A", "B"] }),
    ];
    const { edges } = stepsToNodesAndEdges(steps);
    expect(edges).toHaveLength(3);
    expect(edges[0]).toMatchObject({ source: "A", target: "B" });
    expect(edges[1]).toMatchObject({ source: "A", target: "C" });
    expect(edges[2]).toMatchObject({ source: "B", target: "C" });
  });

  it("uses flowStep node type", () => {
    const steps = [makeStep({ tempId: "A" })];
    const { nodes } = stepsToNodesAndEdges(steps);
    expect(nodes[0].type).toBe("flowStep");
  });

  it("stores step data in node.data", () => {
    const steps = [makeStep({ tempId: "A", title: "My Step" })];
    const { nodes } = stepsToNodesAndEdges(steps);
    const data = nodes[0].data as { step: PlanStep };
    expect(data.step.title).toBe("My Step");
    expect(data.step.tempId).toBe("A");
  });

  it("returns empty arrays for no steps", () => {
    const { nodes, edges } = stepsToNodesAndEdges([]);
    expect(nodes).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });
});

describe("layoutWithDagre", () => {
  it("positions nodes with valid x/y coordinates", () => {
    const steps = [
      makeStep({ tempId: "A" }),
      makeStep({ tempId: "B", blockedBy: ["A"] }),
    ];
    const { nodes, edges } = stepsToNodesAndEdges(steps);
    const positioned = layoutWithDagre(nodes, edges);

    expect(positioned).toHaveLength(2);
    for (const node of positioned) {
      expect(typeof node.position.x).toBe("number");
      expect(typeof node.position.y).toBe("number");
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    }
  });

  it("places dependent nodes below their blockers (TB direction)", () => {
    const steps = [
      makeStep({ tempId: "A" }),
      makeStep({ tempId: "B", blockedBy: ["A"] }),
    ];
    const { nodes, edges } = stepsToNodesAndEdges(steps);
    const positioned = layoutWithDagre(nodes, edges);

    const nodeA = positioned.find((n) => n.id === "A")!;
    const nodeB = positioned.find((n) => n.id === "B")!;
    expect(nodeB.position.y).toBeGreaterThan(nodeA.position.y);
  });

  it("places parallel nodes at the same y level", () => {
    const steps = [
      makeStep({ tempId: "A" }),
      makeStep({ tempId: "B", blockedBy: ["A"] }),
      makeStep({ tempId: "C", blockedBy: ["A"] }),
    ];
    const { nodes, edges } = stepsToNodesAndEdges(steps);
    const positioned = layoutWithDagre(nodes, edges);

    const nodeB = positioned.find((n) => n.id === "B")!;
    const nodeC = positioned.find((n) => n.id === "C")!;
    expect(nodeB.position.y).toBe(nodeC.position.y);
  });

  it("handles diamond dependency pattern", () => {
    const steps = [
      makeStep({ tempId: "A" }),
      makeStep({ tempId: "B", blockedBy: ["A"] }),
      makeStep({ tempId: "C", blockedBy: ["A"] }),
      makeStep({ tempId: "D", blockedBy: ["B", "C"] }),
    ];
    const { nodes, edges } = stepsToNodesAndEdges(steps);
    const positioned = layoutWithDagre(nodes, edges);

    const nodeA = positioned.find((n) => n.id === "A")!;
    const nodeB = positioned.find((n) => n.id === "B")!;
    const nodeD = positioned.find((n) => n.id === "D")!;

    // A at top, B/C in middle, D at bottom
    expect(nodeB.position.y).toBeGreaterThan(nodeA.position.y);
    expect(nodeD.position.y).toBeGreaterThan(nodeB.position.y);
  });

  it("does not mutate original nodes", () => {
    const steps = [makeStep({ tempId: "A" })];
    const { nodes, edges } = stepsToNodesAndEdges(steps);
    const originalX = nodes[0].position.x;
    const originalY = nodes[0].position.y;
    layoutWithDagre(nodes, edges);
    expect(nodes[0].position.x).toBe(originalX);
    expect(nodes[0].position.y).toBe(originalY);
  });
});
