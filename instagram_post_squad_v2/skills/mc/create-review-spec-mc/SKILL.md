---
name: create-review-spec-mc
description: guided mission control review-spec builder. use when the user wants to create a review spec, quality gate, approval rubric, scoring criteria, rejection rules, or workflow review policy that follows the mission control reviewspec schema.
disable-model-invocation: true
---

# Create Review Spec for Mission Control

This skill creates `reviewSpec` entities that act as quality gates for agents, workflows, or executions.

## Required fields

Always collect:

- `name`
- `scope`
- `criteria`
- `approvalThreshold`

Each criterion needs:

- `id`
- `label`
- `weight`
- optional `description`

## Design rules

Good review specs are:

- narrow enough to enforce a real standard
- weighted so tradeoffs are explicit
- strict enough that vetoes matter
- actionable enough that rejected work can be fixed

## Rubric-building sequence

Ask in this order:

1. What artifact is being reviewed
2. What failure is unacceptable
3. What dimensions matter most
4. What score is needed to pass
5. What should happen on rejection

## Weight discipline

- Require at least one criterion
- Prefer 3–7 criteria
- Make weights sum to 1.0
- Avoid duplicate criteria in different words

## Veto conditions

Add vetoes for failures that must auto-reject regardless of score.

Examples:

- wrong language
- unsupported claim
- missing required field
- no evidence
- visual contradiction with brand brief

## Feedback contract

Encourage a response shape like:

- verdict
- overall score
- criterion scores
- evidence used
- vetoes triggered
- required fixes
- routing recommendation

## API call

```bash
curl -s -X POST http://localhost:3000/api/specs/review-spec       -H "Content-Type: application/json"       -d '{ ... }'
```

## Validation checklist

- `name` is slug-safe
- `scope` is one of `agent`, `workflow`, `execution`
- weights sum to 1.0
- threshold is between 0 and 1
- vetoes are genuinely disqualifying
- feedbackContract is actionable
