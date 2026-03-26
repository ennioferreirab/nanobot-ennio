---
name: creative-qc
description: evaluate research, strategy, captions, and visual directions against an explicit review rubric. use when an agent must score an artifact, apply veto conditions, identify root cause, and return actionable pass or reject feedback before work moves to the next workflow stage.
---

# Creative QC

This skill is for review steps, not creation steps.

## Evaluation loop

1. Read the review spec first
2. Read the artifact under review
3. Read required upstream dependencies
4. Score each criterion
5. Trigger vetoes if present
6. Identify root cause
7. Route rework precisely

## Required output

- `verdict`
- `overallScore`
- `criterionScores`
- `vetoesTriggered`
- `evidenceUsed`
- `rootCause`
- `requiredFixes`
- `recommendedRouting`

See `references/review-output-template.md` for the preferred response structure.

## Review principles

- do not approve work just because it looks promising
- tie every major comment to a criterion or missing field
- route upstream when the problem started upstream
- prefer concrete fixes over vague feedback
