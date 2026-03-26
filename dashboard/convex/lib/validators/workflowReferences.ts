import { ConvexError } from "convex/values";

/**
 * Validates that all step cross-references within a workflow are internally consistent.
 * MUST be called in every insertion/publish path. No exceptions.
 *
 * Checks:
 * - Every `dependsOn` item references an existing step id
 * - Review steps have a non-empty `onReject`
 * - Review step `onReject` target references an existing step id
 *
 * @param steps - Array of steps with id, type, and optional dependsOn/onReject fields
 * @param context - Human-readable context string for error messages (e.g. "workflow 'brand-delivery'")
 */
export function validateWorkflowStepReferences(
  steps: Array<{ id: string; type: string; dependsOn?: string[]; onReject?: string }>,
  context: string,
): void {
  const stepIds = new Set(steps.map((s) => s.id));

  for (const step of steps) {
    // dependsOn must reference existing step ids
    if (step.dependsOn) {
      for (const dep of step.dependsOn) {
        if (!stepIds.has(dep)) {
          throw new ConvexError(
            `Step "${step.id}" in ${context} has invalid dependsOn target "${dep}". ` +
              `Valid step ids: [${[...stepIds].join(", ")}]`,
          );
        }
      }
    }

    // review steps: onReject must be non-empty and reference an existing step id
    if (step.type === "review") {
      if (!step.onReject || step.onReject.trim().length === 0) {
        throw new ConvexError(
          `Review step "${step.id}" in ${context} requires onReject. ` +
            `Valid step ids: [${[...stepIds].join(", ")}]`,
        );
      }
      if (!stepIds.has(step.onReject)) {
        throw new ConvexError(
          `Review step "${step.id}" in ${context} has invalid onReject target "${step.onReject}". ` +
            `Valid step ids: [${[...stepIds].join(", ")}]`,
        );
      }
    }
  }
}
