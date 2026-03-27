import { describe, expect, it } from "vitest";
import { reduceTransitiveDeps } from "./graphUtils";

describe("reduceTransitiveDeps", () => {
  it("returns empty map for empty input", () => {
    const result = reduceTransitiveDeps([]);
    expect(result.size).toBe(0);
  });

  it("preserves steps with no dependencies", () => {
    const steps = [{ id: "A", dependsOn: [] }, { id: "B" }];
    const result = reduceTransitiveDeps(steps);
    expect(result.get("A")).toEqual([]);
    expect(result.get("B")).toEqual([]);
  });

  it("preserves steps with a single dependency", () => {
    const steps = [{ id: "A" }, { id: "B", dependsOn: ["A"] }];
    const result = reduceTransitiveDeps(steps);
    expect(result.get("B")).toEqual(["A"]);
  });

  it("removes transitive dependency in a linear chain", () => {
    // A → B → C, and C also depends on A (redundant)
    const steps = [{ id: "A" }, { id: "B", dependsOn: ["A"] }, { id: "C", dependsOn: ["A", "B"] }];
    const result = reduceTransitiveDeps(steps);
    expect(result.get("C")).toEqual(["B"]);
  });

  it("removes transitive dep through parallel branches", () => {
    // A → B, A → C, D depends on [A, B, C] — A is redundant (reachable via B and C)
    const steps = [
      { id: "A" },
      { id: "B", dependsOn: ["A"] },
      { id: "C", dependsOn: ["A"] },
      { id: "D", dependsOn: ["A", "B", "C"] },
    ];
    const result = reduceTransitiveDeps(steps);
    expect(result.get("D")).toEqual(["B", "C"]);
  });

  it("preserves independent parallel dependencies", () => {
    // A and B are independent roots, C depends on both — no redundancy
    const steps = [{ id: "A" }, { id: "B" }, { id: "C", dependsOn: ["A", "B"] }];
    const result = reduceTransitiveDeps(steps);
    expect(result.get("C")).toEqual(["A", "B"]);
  });

  it("handles diamond pattern correctly", () => {
    //     A
    //    / \
    //   B   C
    //    \ /
    //     D
    // D depends on [B, C] — no redundancy (B and C are independent)
    const steps = [
      { id: "A" },
      { id: "B", dependsOn: ["A"] },
      { id: "C", dependsOn: ["A"] },
      { id: "D", dependsOn: ["B", "C"] },
    ];
    const result = reduceTransitiveDeps(steps);
    expect(result.get("D")).toEqual(["B", "C"]);
  });

  it("handles diamond with extra transitive edge", () => {
    //     A
    //    / \
    //   B   C
    //    \ /
    //     D → also depends on A (redundant)
    const steps = [
      { id: "A" },
      { id: "B", dependsOn: ["A"] },
      { id: "C", dependsOn: ["A"] },
      { id: "D", dependsOn: ["A", "B", "C"] },
    ];
    const result = reduceTransitiveDeps(steps);
    expect(result.get("D")).toEqual(["B", "C"]);
  });

  it("handles deep chain with skip edge", () => {
    // A → B → C → D, and D also depends on A and B (both redundant)
    const steps = [
      { id: "A" },
      { id: "B", dependsOn: ["A"] },
      { id: "C", dependsOn: ["B"] },
      { id: "D", dependsOn: ["A", "B", "C"] },
    ];
    const result = reduceTransitiveDeps(steps);
    expect(result.get("D")).toEqual(["C"]);
  });

  it("models instagram-post-creation-v3 buggy deps", () => {
    // Real-world scenario: LLM generates over-connected graph
    // company-intel → post-specs → copywriting → creative-review
    //                            → visual-design ↗
    // creative-review also depends on company-intel and post-specs (redundant)
    const steps = [
      { id: "company-intel" },
      { id: "post-specs", dependsOn: ["company-intel"] },
      { id: "copywriting", dependsOn: ["post-specs"] },
      { id: "visual-design", dependsOn: ["post-specs"] },
      {
        id: "creative-review",
        dependsOn: ["company-intel", "post-specs", "copywriting", "visual-design"],
      },
    ];
    const result = reduceTransitiveDeps(steps);
    // Only copywriting and visual-design are meaningful — the rest are transitive
    expect(result.get("creative-review")).toEqual(["copywriting", "visual-design"]);
  });

  it("does not mutate input steps", () => {
    const steps = [{ id: "A" }, { id: "B", dependsOn: ["A"] }, { id: "C", dependsOn: ["A", "B"] }];
    const originalDeps = [...steps[2].dependsOn!];
    reduceTransitiveDeps(steps);
    expect(steps[2].dependsOn).toEqual(originalDeps);
  });
});
