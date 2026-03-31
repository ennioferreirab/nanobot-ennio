---
name: create-workflow-mc
description: guided mission control workflow builder. use when the user wants to add, redesign, or publish a workflow inside an existing squad, define ordered steps, dependencies, review gates, on-reject routing, or publish a standalone workflow that follows the mission control workflow schema.
disable-model-invocation: true
---

# Create Workflow for Mission Control

This skill builds standalone workflow specs for an existing squad.

## Context loading

Always load workflow context first:

```bash
curl -s http://localhost:3000/api/specs/workflow/context
```

Use it to identify:

- published squads
- squad agent roster
- existing workflows
- available review specs

## Workflow design rules

- A workflow is a graph, not just an ordered list
- Every dependency must point to a real step id
- `review` steps must include `reviewSpecId` and `onReject`
- `agentKey` must exist in the selected squad roster
- Prefer explicit quality gates before any human approval step

## Dependency design principles

- A dependency means "this step needs the OUTPUT of that step" — not "this step happens after that step"
- NEVER add transitive dependencies. If A→B→C, do NOT add A→C. B already guarantees A completes before C
- Minimize dependencies to maximize parallelism. Fewer edges = more steps can run concurrently
- Steps with no data relationship should NOT be connected even if one "logically precedes" the other
- When in doubt, omit the dependency. The system applies transitive reduction automatically, but cleaner input = cleaner graphs

## Design sequence

1. Confirm the target squad
2. Confirm the workflow output
3. Design steps and dependencies
4. Add review gates
5. Validate routing and exit criteria

## Step rules by type

### agent
Requires `agentKey`

### review
Requires:
- `agentKey`
- `reviewSpecId`
- `onReject`

### human
Use for approvals or irreversible external decisions

### system
Use for orchestration, normalization, or persistence

## If no review spec exists

Stop and create one first. Do not fabricate a `reviewSpecId`.

## Publish

```bash
curl -s -X POST http://localhost:3000/api/specs/workflow       -H "Content-Type: application/json"       -d '{ ... }'
```
