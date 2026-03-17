# Agent and Squad Unification Design

**Date:** 2026-03-15

**Objective:** Remove the split between squad-only agents and registered agents so that every squad member is a normal global agent from the canonical `agents` registry.

## Goal

Make `agents` the only canonical identity for agent configuration and squad membership. A squad may reference many agents, and the same agent may participate in many squads, but a squad can never contain an unregistered or squad-local agent.

## Working Assumptions

- This repository is not in production yet, so the change does not need a compatibility layer for existing squads.
- Existing squads can be ignored during migration because they have already been deleted.
- Existing registered agents can be updated in place if needed.
- Editing an agent from a squad context must update the global agent, not a squad-specific copy.
- Implementation should still start from an implementation-ready story artifact in `_bmad-output/implementation-artifacts/`.

## Problems in the Current Model

- `squadSpecs` currently owns `agentSpecIds`, which makes squad membership point at a squad-specific authoring entity instead of the canonical runtime agent registry.
- `workflowSpecs.steps` currently store `agentSpecId`, so workflow ownership is also tied to the squad-specific layer.
- `Create Squad` currently publishes child `agentSpecs`, which creates the impression that a squad owns distinct agents.
- Runtime execution eventually needs `agentName` from the global agent registry, so the current flow converts squad-owned records back into runtime agents later.
- The same logical agent cannot be cleanly reused across squads without duplicating authoring records.

## Core Decisions

### 1. `agents` Becomes the Only Canonical Agent Identity

The canonical source of truth for agent identity and configuration is the `agents` table. Squad membership, workflow ownership, runtime dispatch, and agent editing all resolve back to this one entity.

### 2. Squads Reference Registered Agents Instead of Owning Child Specs

`squadSpecs` should store `agentIds: Id<"agents">[]`, not `agentSpecIds`. A squad is only a grouping of agents plus workflow blueprints; it is not the owner of a second agent model.

### 3. Workflow Steps Reference Canonical Agents

`workflowSpecs.steps` should store `agentId: Id<"agents">` for agent-owned steps. This keeps workflow ownership stable even if a global agent is renamed later.

### 4. `Create Squad` Reuses or Creates Global Agents

When the authoring flow publishes a squad graph:

- it looks up each proposed agent by canonical `name`
- if the agent exists, it reuses that agent
- if the agent does not exist, it creates a normal global agent in `agents`
- it then stores the resulting `agentIds` on the squad and workflows

The squad flow no longer inserts `agentSpecs` as a child entity.

### 5. Editing from a Squad Is Always a Global Edit

Opening an agent from squad details must show the same global agent configuration surfaced elsewhere in the app. Any save action updates the global `agents` record and affects all squads that reference it.

### 6. No Compatibility Layer for Deleted Squads

Because current squads can be ignored, the implementation can replace the squad authoring and runtime path directly instead of maintaining both `agentSpecId` and `agentId` long term.

## Proposed Data Model

### `agents`

Keep `agents` as the canonical table for:

- identity: `name`, `displayName`
- role and prompt data
- skills, model, provider, execution settings
- status and runtime metadata

This table remains editable from the standard agent surfaces.

### `squadSpecs`

Replace:

- `agentSpecIds: Id<"agentSpecs">[]`

With:

- `agentIds: Id<"agents">[]`

This makes squad membership a direct reference to registered agents.

### `workflowSpecs.steps`

Replace:

- `agentSpecId: Id<"agentSpecs">`

With:

- `agentId: Id<"agents">`

This makes workflow ownership point at the same canonical agents used everywhere else.

## Flow Changes

### Create Squad

The authoring assistant can keep proposing a graph of agents and workflows, but publish changes:

1. normalize each proposed agent identity
2. resolve each agent against the global registry by `name`
3. create any missing global agents
4. publish the squad with `agentIds`
5. publish workflows with `agentId` references

### Squad Detail

The squad detail view should load agent documents directly from `agents`, not `agentSpecs`. Selecting an agent inside the squad should open the standard global configuration data for that agent.

### Mission Launch

Mission launch should resolve workflow step ownership from `agentId` directly to the runtime `agent.name`. The intermediate `agentSpecId -> agentName` translation disappears.

## Validation Rules

- A squad cannot be published with an empty or unresolved agent reference for an agent-owned workflow step.
- Every `agent` step in a workflow must reference an existing registered agent.
- Deleting or archiving a global agent that is still referenced by a squad should be explicitly blocked or handled by validation.

## Risks and Tradeoffs

### Risk: Name Collisions During Squad Publish

If `Create Squad` reuses agents by `name`, ambiguous or low-quality generated names may accidentally match the wrong global agent. Publish should either normalize names deterministically or surface a conflict when an existing agent's role is materially different.

### Risk: Global Edits Have Wider Blast Radius

This is intentional, but the UI must make it obvious that editing an agent inside a squad changes the shared agent for every squad.

### Tradeoff: Rich Squad-Specific Authoring Fields Are Dropped

This design intentionally prefers one coherent source of truth over richer but ambiguous local copies. If squad-specific behavior is ever needed later, it should be introduced as explicit workflow or squad metadata, not by duplicating agents.

## Recommended Delivery Shape

1. Replace squad/workflow references in Convex schema and queries.
2. Update squad graph publish to upsert/reuse global agents.
3. Update squad detail UI to load global agents.
4. Update mission launch and workflow compilation to resolve from `agentId`.
5. Remove squad flow dependencies on `agentSpecs`.
