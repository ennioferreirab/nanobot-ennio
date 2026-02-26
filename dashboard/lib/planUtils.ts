/**
 * Pure utility functions for plan editing logic.
 * No React, no Convex, no UI dependencies.
 */

export type { PlanStep } from "./types";
import type { PlanStep } from "./types";

/**
 * Checks if adding a proposed dependency edge would create a cycle.
 *
 * The dependency direction: step.blockedBy = [A, B] means A -> step and B -> step
 * (A and B must complete before step can run).
 *
 * When the user proposes that stepTempId should be blocked by blockerTempId,
 * we add edge blockerTempId -> stepTempId. We then check if stepTempId can
 * already reach blockerTempId in the graph. If so, adding the edge would create a cycle.
 *
 * @param steps - Current plan steps
 * @param proposed - Proposed new dependency edge
 * @returns true if adding the edge would create a cycle
 */
export function hasCycle(
  steps: PlanStep[],
  proposed: { stepTempId: string; blockerTempId: string }
): boolean {
  // Self-dependency is always a cycle
  if (proposed.stepTempId === proposed.blockerTempId) return true;

  // Build adjacency: blocker -> dependents
  // step.blockedBy = [X, Y] means edges X -> step, Y -> step
  const adj = new Map<string, string[]>();
  for (const s of steps) {
    for (const blocker of s.blockedBy) {
      const deps = adj.get(blocker) ?? [];
      deps.push(s.tempId);
      adj.set(blocker, deps);
    }
  }
  // Add proposed edge: blockerTempId -> stepTempId
  const deps = adj.get(proposed.blockerTempId) ?? [];
  deps.push(proposed.stepTempId);
  adj.set(proposed.blockerTempId, deps);

  // DFS from stepTempId: can we reach blockerTempId?
  // If yes, adding blockerTempId -> stepTempId creates a cycle.
  const visited = new Set<string>();
  function dfs(node: string): boolean {
    if (node === proposed.blockerTempId) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    for (const neighbor of adj.get(node) ?? []) {
      if (dfs(neighbor)) return true;
    }
    return false;
  }
  return dfs(proposed.stepTempId);
}

/**
 * Recalculates parallelGroup values after reorder or dependency changes.
 *
 * Steps with no blockers get group 0.
 * Steps whose blockers are all in group N get group N+1.
 * Steps with multiple blockers get max(blocker groups) + 1.
 * This is equivalent to the longest path from a root node in a DAG.
 *
 * @param steps - Current plan steps
 * @returns New steps array with updated parallelGroup values
 */
export function recalcParallelGroups(steps: PlanStep[]): PlanStep[] {
  const stepMap = new Map(steps.map((s) => [s.tempId, s]));
  const levels = new Map<string, number>();
  // Guard against infinite recursion if blockedBy data contains a cycle
  // (e.g., corrupted backend data). Nodes currently being visited are
  // tracked in `visiting`; if we re-enter one, we treat it as level 0.
  const visiting = new Set<string>();

  function getLevel(tempId: string): number {
    if (levels.has(tempId)) return levels.get(tempId)!;
    if (visiting.has(tempId)) return 0; // break cycle
    const step = stepMap.get(tempId);
    if (!step || step.blockedBy.length === 0) {
      levels.set(tempId, 0);
      return 0;
    }
    visiting.add(tempId);
    const maxBlocker = Math.max(...step.blockedBy.map((id) => getLevel(id)));
    visiting.delete(tempId);
    const level = maxBlocker + 1;
    levels.set(tempId, level);
    return level;
  }

  for (const s of steps) getLevel(s.tempId);

  return steps.map((s) => ({
    ...s,
    parallelGroup: levels.get(s.tempId) ?? 0,
  }));
}

/**
 * Topological sort (Kahn's algorithm) to compute `order` from the DAG.
 * Steps with no blockers get the lowest orders; dependents come after.
 * Within the same level, original array order is preserved.
 *
 * @param steps - Current plan steps
 * @returns New steps array with updated `order` values (0-indexed)
 */
export function recalcOrderFromDAG(steps: PlanStep[]): PlanStep[] {
  const stepMap = new Map(steps.map((s) => [s.tempId, s]));
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const s of steps) {
    inDegree.set(s.tempId, 0);
    adj.set(s.tempId, []);
  }

  for (const s of steps) {
    for (const blocker of s.blockedBy) {
      if (stepMap.has(blocker)) {
        const targets = adj.get(blocker)!;
        targets.push(s.tempId);
        inDegree.set(s.tempId, (inDegree.get(s.tempId) ?? 0) + 1);
      }
    }
  }

  // Seed queue with zero in-degree nodes, preserving original order
  const queue: string[] = steps
    .filter((s) => (inDegree.get(s.tempId) ?? 0) === 0)
    .map((s) => s.tempId);

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);
    for (const neighbor of adj.get(current) ?? []) {
      const deg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, deg);
      if (deg === 0) {
        queue.push(neighbor);
      }
    }
  }

  // If cycle detected (sorted.length < steps.length), append remaining
  if (sorted.length < steps.length) {
    for (const s of steps) {
      if (!sorted.includes(s.tempId)) {
        sorted.push(s.tempId);
      }
    }
  }

  const orderMap = new Map(sorted.map((id, i) => [id, i]));
  return steps.map((s) => ({
    ...s,
    order: orderMap.get(s.tempId) ?? s.order,
  }));
}
