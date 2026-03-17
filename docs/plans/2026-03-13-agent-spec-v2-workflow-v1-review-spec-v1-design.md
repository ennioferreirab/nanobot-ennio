# Agent Spec V2, Workflow Spec V1, and Review Spec V1 Design

**Date:** 2026-03-13

**Objective:** Introduce a richer authoring model for agents, squads, workflows, and reviews that becomes the canonical source of truth in Convex/UI, while preserving the current Mission Control runtime through compiled projections such as `agents`, `config.yaml`, and `SOUL.md`.

## Goal

Replace the current shallow agent-creation flow with a deeper spec-driven system that can:

- create a single agent or a full squad blueprint
- support multiple reusable workflows per squad
- keep memory segmented by board even when specs are shared globally
- compile rich specs into the existing runtime contract instead of rewriting the runtime first
- introduce rubric-based review with explicit approval and rejection behavior

## Working Assumptions

- The canonical authoring source of truth moves to new Convex entities, not `agents`.
- Existing agents can be recreated and force-migrated into the new spec model.
- Squads are reusable blueprints and are not executed automatically when created.
- A squad can be shared across many boards.
- Memory remains segmented by board for both agents and squads.
- The current Kanban remains the primary operational state surface.
- For implementation planning, the requested working location is the project root on branch `agentSpecV2-workflowV1-reviewV1`.

## Core Decisions

### 1. Canonical Specs and Runtime Projections Are Separate

Authoring moves into a new spec layer:

- `agentSpecs`
- `squadSpecs`
- `workflowSpecs`
- `reviewSpecs`
- `boardSquadBindings`

The existing `agents` table and on-disk runtime artifacts remain, but they are no longer the authoring truth. They become compiled runtime projections generated from the canonical specs.

### 2. Agent Creation Must Become Spec-Driven, Not YAML-Driven

The existing create flow currently converges too early on YAML and prompt text. The new flow should instead build a structured `agentSpecDraft` through a deeper guided conversation that captures:

- purpose and non-goals
- operating context
- working style and quality bar
- execution policy
- review behavior

YAML should not be the primary artifact exposed during creation.

### 3. Squad Creation Produces a Blueprint First

`Create Squad` creates a reusable squad definition, not a running task. The result of squad creation is:

- one `squadSpec`
- one or more `agentSpecs`
- one or more `workflowSpecs`
- optional shared `reviewSpecs`

Execution is a later action that materializes a task from one chosen workflow.

### 4. One Squad Can Own Many Workflows

The model must support:

- one `squadSpec`
- many `workflowSpecs`
- an optional `defaultWorkflowSpecId`

This allows the same team to operate in different ways, such as fast lane, full review, or research-heavy flows, without duplicating the squad.

### 5. Shared Specs, Isolated Execution Memory

Specs are global and reusable. Execution context is board-scoped.

- one squad can be bound to many boards through `boardSquadBindings`
- the same `agentSpec` can participate across boards
- runtime memory remains isolated by board
- squad-level shared learnings during execution should also be board-scoped

This preserves the current memory strength of Mission Control while enabling reusable design artifacts.

### 6. Kanban Remains the State Layer

The board does not gain a new top-level workflow mode. Instead:

- Kanban continues to represent lifecycle state
- tasks gain a `workMode`
- workflows define how execution happens under the hood

Recommended task modes:

- `manual`
- `ai_single`
- `ai_workflow`

This keeps process design and operational state distinct.

### 7. Workflow Is More Than a Prompt Sequence

A workflow is a structured execution graph, not just a list of prompts. It should define:

- steps
- owners
- step type
- inputs and outputs
- handoffs
- review gates
- human checkpoints
- on-reject loops
- exit criteria
- execution policies

This brings Opensquad-like process rigor into the current Mission Control architecture.

### 8. Review Must Become Rubric-Based

The current review lifecycle is useful, but its evaluation model is too implicit. `Review Spec V1` introduces structured quality control through:

- criteria and weights
- veto conditions
- approval thresholds
- feedback contract
- routing of corrective action

Review should return structured output that the runtime can interpret, not just free-form text.

## Proposed Data Model

### `agentSpecs`

Represents a fully-authored agent definition. Suggested fields:

- identity
- display metadata
- role
- responsibilities
- non-goals
- principles
- process/framework guidance
- voice guidance
- anti-patterns
- output contract
- tools/skills
- execution policy
- memory policy
- review policy reference
- status and version metadata

### `squadSpecs`

Represents a reusable squad blueprint. Suggested fields:

- identity and display metadata
- description
- status
- version
- agent membership
- default workflow reference
- catalog metadata

### `workflowSpecs`

Represents one reusable process for a squad. Suggested fields:

- `squadSpecId`
- name and description
- workflow status/version
- workflow steps
- dependencies and ordering
- owners
- outputs
- review gates
- `onReject` routes
- execution policy

### `reviewSpecs`

Represents a reusable rubric for review. Suggested fields:

- name
- scope
- criteria
- weights
- veto conditions
- approval policy
- feedback contract
- reviewer policy
- rejection routing policy

### `boardSquadBindings`

Represents activation of a reusable squad on a given board. Suggested fields:

- `boardId`
- `squadSpecId`
- `enabled`
- board-specific default workflow override
- future room for lightweight board overrides

## UI and UX Direction

### Entry Point

Replace the current creation entry point with a unified `Create` button that opens a chooser modal:

- `Create Agent`
- `Create Squad`

### `Create Agent` Flow

The agent flow should be a guided, deep authoring wizard that progressively fills an `agentSpecDraft`.

Suggested phases:

1. Purpose
2. Operating Context
3. Working Style
4. Execution Policy
5. Review
6. Summary and Approval

The interface should emphasize structured authoring over raw prompt editing. A persistent summary panel should show the spec sections being built in real time.

### `Create Squad` Flow

The squad flow should behave more like an architect-guided design session. It should progressively fill:

- `squadSpecDraft`
- `agentDrafts`
- `workflowDrafts`
- optional shared `reviewDrafts`

Suggested phases:

1. Outcome
2. Team Design
3. Workflow Design
4. Variants
5. Review and Approval

### What the Flow Should Avoid

- exposing YAML as the main creation surface
- asking for technical identifiers too early
- forcing prompt editing before structure exists
- mixing blueprint creation with immediate execution

## Runtime Projection Strategy

The current runtime should remain functional while the authoring layer evolves.

### Authoring Layer

Canonical truth lives in:

- `agentSpecs`
- `squadSpecs`
- `workflowSpecs`
- `reviewSpecs`

### Projection Layer

Compiled artifacts include:

- runtime `agents`
- `config.yaml`
- `SOUL.md`

Each projection should record origin metadata such as:

- `compiledFromSpecId`
- `compiledFromVersion`
- `compiledAt`

### Prompt Compilation

The runtime `prompt` should be compiled from structured sections rather than authored as a flat string. The compiler should combine:

- global orientation
- identity
- responsibilities
- non-goals
- working style
- quality rules
- anti-patterns
- tool and memory policy
- output contract

This preserves compatibility with the current executor while materially improving authoring quality.

## Migration Strategy for Existing Agents

Because the project is not yet in production, the migration can be assertive.

Suggested migration flow:

1. Read current Convex agent records and local `config.yaml` files.
2. Create one `Agent Spec V2` per existing agent.
3. Use current prompt and `SOUL.md` content as source material for richer fields.
4. Fill missing spec fields with explicit migration defaults.
5. Recompile runtime projections from the new specs.
6. Mark legacy records as migrated.

Compatibility should be temporary. Long-term coexistence between the shallow and rich models should be avoided.

## Workflow Execution Model

Workflows are blueprints. Tasks and steps remain execution instances.

Suggested task additions:

- `workMode`
- `squadSpecId`
- `workflowSpecId`
- future `workflowRunId`

Execution semantics:

- `manual` tasks remain human-driven
- `ai_single` tasks use one agent or a trivial plan
- `ai_workflow` tasks materialize steps from a chosen `workflowSpec`

For `ai_workflow`, the lead agent should not invent the process skeleton. It may enrich context or adapt instructions, but the workflow structure comes from the blueprint.

Suggested workflow step types:

- `agent`
- `human`
- `checkpoint`
- `review`
- `system`

Review rejection should follow explicit `onReject` routing defined in the workflow rather than ad-hoc runtime decisions.

## Review Spec V1 Behavior

`Review Spec V1` should support:

- score-based evaluation
- weighted criteria
- veto-triggered rejection
- clear approval thresholds
- actionable feedback
- structured routing of rework

Suggested structured review result:

- `verdict`
- `scores`
- `strengths`
- `issues`
- `vetoesTriggered`
- `recommendedReturnStep`

Review should work at three levels:

- agent-definition review
- workflow/squad review
- execution-output review

Every workflow should have at least one final review stage.

## Rollout Plan

### Phase 0

Prepare the implementation environment and branch strategy for this initiative. The requested execution context is the repository root on branch `agentSpecV2-workflowV1-reviewV1`.

### Phase 1

Add canonical spec storage:

- `agentSpecs`
- `squadSpecs`
- `workflowSpecs`
- `reviewSpecs`
- `boardSquadBindings`

Add the future-facing task fields needed for workflow-backed execution.

### Phase 2

Build the projection compiler from specs into runtime artifacts:

- runtime `agents`
- `config.yaml`
- `SOUL.md`

### Phase 3

Migrate existing agents into `Agent Spec V2` and rebuild their runtime projections.

### Phase 4

Replace the current agent creation UI with the new `Create Agent | Create Squad` authoring entry point and guided flows.

### Phase 5

Add a `Squads` section above `Agents` in the sidebar and expose squad blueprints plus workflow counts there.

### Phase 6

Introduce squad execution as a later action that materializes `ai_workflow` tasks from a selected squad, workflow, and board.

## Risks and Mitigations

### Risk: temporary double source of truth

Mitigation: move authoring fully into specs and keep `agents` projection-only.

### Risk: compiled prompts regress current runtime quality

Mitigation: treat current prompts as migration seeds and compare compiled output during rollout.

### Risk: Convex and local artifact sync drift

Mitigation: version projections and validate generated runtime files after every compile.

### Risk: workflow scope grows too ambitious too early

Mitigation: keep `Workflow Spec V1` intentionally lean and focused on steps, ownership, gates, and rejection routing.

## Success Criteria

- all current agents are recreated in `Agent Spec V2`
- runtime execution still works through compiled `config.yaml`
- a new agent can be authored through a deep guided flow without editing YAML
- a new squad can be authored with one or more workflows and shared across boards
- squad and agent memory remain board-scoped
- current boards and tasks continue operating without lifecycle regressions
