# Squad Execution On Task System Plan

**Date:** 2026-03-14

## Goal

Make squad execution a first-class capability by launching missions from `squadSpecs` and `workflowSpecs`, while keeping Convex as the canonical owner of `tasks` and `steps` and reusing the existing Mission Control runtime for materialization, dispatch, review, and board-scoped memory.

## Current State Review

What is already implemented:

- `agentSpecs`, `squadSpecs`, `workflowSpecs`, `reviewSpecs`, and `boardSquadBindings` now exist in Convex.
- `squadSpecs.publishGraph` persists a full blueprint graph and `squadGraphPublisher` resolves child `agentSpecs` and `workflowSpecs`.
- `tasks` already has optional scaffolding fields for `workMode`, `squadSpecId`, and `workflowSpecId`.
- The task system already supports `executionPlan`, step materialization, kickoff/resume, step dispatch, and task/step lifecycle transitions.
- The runtime already has the right backbone for execution: `PlanMaterializer`, `KickoffResumeWorker`, and `StepDispatcher`.

What is missing:

- There is no “Run Squad” or “Launch Mission” flow yet.
- `workflowSpecs` stop at persistence; they are not compiled into runnable task instances.
- The `tasks` runtime path still assumes plans come from the lead-agent or manual editing.
- `steps` do not yet carry canonical workflow metadata needed for review routing, checkpoint semantics, or workflow-level observability.
- There is no explicit runtime object tracking a launched workflow instance.

## Core Diagnosis

The system does **not** need a separate execution engine outside the task system.

The cohesive design is:

- `squadSpec` and `workflowSpec` stay as reusable blueprints.
- launching a squad mission creates a **task instance** in Convex.
- the chosen `workflowSpec` is compiled into the task’s `executionPlan`.
- the existing materializer creates `steps`.
- the existing runtime dispatches runnable steps.
- Convex remains the source of truth for mission state, step state, and review state.

That keeps one operational model:

- blueprints live in specs
- runtime instances live in `tasks` and `steps`
- Python reacts to Convex state; it does not own mission orchestration state

## Observed Integration Failure

The first implementation already proved the right architectural direction, but it exposed a concrete integration bug:

- squad mission launch successfully compiles and saves a workflow-generated `executionPlan`
- the task is still created as a normal `inbox` task
- `InboxWorker` routes it to `planning`
- `PlanningWorker` generates a new lead-agent plan and overwrites the workflow plan

That means the current system is still treating `ai_workflow` launches as generic tasks.

This explains the observed behavior:

- the workflow plan appears briefly in the task
- the task then moves to `planning`
- the lead-agent replaces the plan
- task execution continues with a generic delegated plan, not the squad workflow

So the first corrective move is not “more workflow logic”. It is a **routing guardrail**:

- workflow-generated tasks must skip the legacy inbox-to-planning path
- the planner must refuse to re-plan a task that already has a workflow-generated execution plan

## Architecture Recommendation

### 1. Launch Model

Introduce a dedicated mission launch path:

- user selects a squad
- user picks a board and a workflow
- user provides a mission title, brief, optional files, and execution mode
- Convex creates a task with:
  - `workMode = ai_workflow`
  - `squadSpecId`
  - `workflowSpecId`
  - selected `boardId`
  - compiled `executionPlan`

Recommended initial status:

- `review` with `awaitingKickoff = true` when the plan was precompiled from the workflow

This prevents the inbox/planning worker pair from hijacking the mission and matches the existing dashboard kickoff model.

This task is the mission.

### 2. Workflow Compilation

Add a compiler that converts `workflowSpec.steps` into the existing execution-plan shape.

It should:

- map workflow step dependencies to `blockedBy`
- resolve `agentSpecId` to runtime `assignedAgent`
- preserve workflow metadata for later routing and observability
- mark the plan source as workflow-generated rather than lead-agent-generated

### 3. Runtime Metadata

Add a thin runtime state object, recommended as `workflowRuns`, to store:

- `taskId`
- `squadSpecId`
- `workflowSpecId`
- `boardId`
- launch mode and lifecycle status
- workflow version / compile version
- step-key to runtime-step mapping
- timestamps and latest verdict metadata

This is not a parallel executor. It is a provenance and control-plane record for one launched mission.

### 4. Step Semantics

Extend materialized steps with optional workflow metadata:

- `workflowStepId`
- `workflowStepType`
- `agentSpecId`
- `reviewSpecId`
- `onRejectStepId`

This lets the runtime distinguish:

- normal agent work
- human checkpoints
- review steps
- system steps

without guessing from plain text.

### 5. Human and Review Gates

Use the existing task and step lifecycle instead of inventing a separate workflow state machine.

Recommended mapping:

- `agent` step -> normal assigned/runnable step
- `human` step -> materialize directly as `waiting_human`
- `checkpoint` step -> materialize as `waiting_human` with checkpoint metadata
- `review` step -> runnable step for a reviewer agent, returning structured verdict data
- `system` step -> internal step, only if truly needed in v1

Task-level status remains the Kanban-facing state. Workflow-level richness is tracked via step metadata and `workflowRuns`.

## Key Problems To Solve

1. Workflow-generated tasks are still entering the legacy inbox/planning funnel.
2. There is no mission-launch entrypoint from squads to tasks.
3. `workflowSpecs` are persisted but never compiled into runnable task plans safely.
4. `tasks.executionPlan` still assumes only lead-agent/manual generation.
5. `steps` lack workflow semantics, so review loops and checkpoints cannot be routed reliably.
6. There is no runtime provenance object for a workflow mission instance.
7. Board-scoped memory must remain isolated even when the same squad is reused on multiple boards.

## Product Direction

### User-facing v1

Add a `Run Mission` action on squad detail or squad list.

The launch flow should ask for:

- board
- workflow variant
- mission title
- mission brief
- optional files
- autonomy mode

Then it creates a task and routes the user to that task detail view.

### Execution v1

V1 should support:

- launch from squad blueprint
- materialize workflow into steps
- dispatch agent-owned steps
- stop on human/checkpoint steps
- show workflow provenance in the task detail UI

### Execution v2

V2 can add:

- review-step verdict parsing with structured `onReject`
- partial reruns
- workflow analytics and mission templates

## Data Model Recommendation

### Reuse

- `tasks` remains the mission runtime record
- `steps` remains the per-step runtime record

### Add

- `workflowRuns`
  - thin mission runtime/provenance table

### Extend

- `tasks`
  - make `workMode`, `squadSpecId`, `workflowSpecId` operational
  - add optional plan source / launch metadata if needed
- `steps`
  - add optional workflow metadata fields

## Runtime Ownership Boundary

Convex should own:

- mission launch
- mission/task records
- workflow run records
- step records
- review / checkpoint status

Python runtime should own:

- consuming runnable steps
- executing agent work
- posting outputs
- updating task and step state through the existing bridge

This keeps orchestration state canonical in Convex and execution side effects in MC.

## Rollout Recommendation

Build this in waves:

1. mission launch and task binding
2. workflow compilation and step materialization metadata
3. runtime dispatch integration and human/review gate behavior
4. stabilization and full-stack validation

## Success Criteria

- A user can launch a mission from a published squad.
- The launch creates exactly one task with `workMode = ai_workflow`.
- The chosen workflow is compiled into a visible execution plan on the task.
- Kickoff materializes the right steps with dependency fidelity.
- Agent steps dispatch through the current runtime.
- Human/checkpoint steps pause correctly in Convex.
- The same squad can launch missions on different boards without memory leakage.
