---
name: create-squad-mc
description: guided mission control squad graph builder. use when the user wants to create or redesign a squad, assemble multiple agents into a team, define workflows and review gates, or publish a complete squad blueprint that follows the mission control squad schema.
disable-model-invocation: true
---

# Create Squad Graph for Mission Control

This skill builds a full squad blueprint: squad identity, agent roster, workflows, and review wiring.

## Goal

Produce a valid `publish_squad_graph` payload, not just a concept.

## Build order

1. Define squad outcome
2. Define or reuse agents
3. Define workflow steps
4. Wire review steps
5. Validate dependencies and routing
6. Publish

## Inputs to load first

Load published context before designing the graph.

```bash
curl -s http://localhost:3000/api/specs/squad/context
curl -s http://localhost:3000/api/specs/skills?available=true
```

Use context to:

- reuse existing agents when appropriate
- verify skill names
- select real review specs
- avoid rebuilding what already exists

## Strong design rules

- Every agent step must name a valid `agentKey`
- Every review step must include `reviewSpecId` and `onReject`
- Dependencies must reference real step keys
- Human approval should happen after automated review, not instead of it
- If copy and design are produced in parallel, add a synchronization layer before final review

## Squad design questions

Ask in this order:

1. What outcome the squad owns
2. What distinct jobs require separate agents
3. Which steps can run in parallel
4. Where automated review should happen
5. Where human approval is required

## Agent roster rules

For new agents, include complete creation fields:

- `name`
- `role`
- `displayName`
- `prompt`
- `model`
- `skills`
- `soul`

For reused agents, prefer `reuseName` instead of redefining them.

## Workflow validation checklist

- step keys are unique
- no orphan step references
- each review step has a real review spec id
- `onReject` points to a valid step key
- exit criteria describe a finished artifact, not just step completion

## Publish

```bash
curl -s -X POST http://localhost:3000/api/specs/squad       -H "Content-Type: application/json"       -d '{ ... }'
```
