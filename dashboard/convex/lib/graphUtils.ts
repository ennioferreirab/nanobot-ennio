/**
 * Graph utilities for workflow dependency management.
 *
 * Transitive reduction removes redundant edges from a DAG.
 * If step D depends on [A, B] and B already depends on A,
 * then D→A is redundant — B→A guarantees A completes before D.
 */

interface StepLike {
  id: string;
  dependsOn?: string[];
}

/**
 * Compute all nodes reachable from `startId` by following dependency edges.
 * Does NOT include `startId` itself.
 */
function reachableFrom(startId: string, depsMap: Map<string, string[]>): Set<string> {
  const visited = new Set<string>();
  const stack = [...(depsMap.get(startId) ?? [])];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const dep of depsMap.get(current) ?? []) {
      stack.push(dep);
    }
  }
  return visited;
}

/**
 * Remove transitive (redundant) dependencies from a set of workflow steps.
 *
 * A dependency X of step D is redundant if X is transitively reachable
 * through another direct dependency Y of D (i.e. there exists a path Y→...→X).
 *
 * Returns a new Map<stepId, reducedDeps>. Steps with 0-1 dependencies
 * are returned unchanged (no redundancy possible).
 *
 * This is a pure function — it does not mutate the input.
 */
export function reduceTransitiveDeps(steps: StepLike[]): Map<string, string[]> {
  const depsMap = new Map<string, string[]>();
  for (const step of steps) {
    depsMap.set(step.id, [...(step.dependsOn ?? [])]);
  }

  const reduced = new Map<string, string[]>();

  for (const [stepId, deps] of depsMap) {
    if (deps.length < 2) {
      reduced.set(stepId, deps);
      continue;
    }

    // For each direct dependency, compute its full transitive closure
    const reachableSets = new Map<string, Set<string>>();
    for (const dep of deps) {
      reachableSets.set(dep, reachableFrom(dep, depsMap));
    }

    // dep X is redundant if ANY other direct dep Y can reach X transitively
    const redundant = new Set<string>();
    for (const depX of deps) {
      for (const depY of deps) {
        if (depX === depY) continue;
        if (reachableSets.get(depY)!.has(depX)) {
          redundant.add(depX);
          break;
        }
      }
    }

    reduced.set(
      stepId,
      deps.filter((d) => !redundant.has(d)),
    );
  }

  return reduced;
}
