# Squad Execution On Task System Wave Plan

**Date:** 2026-03-14

**Goal:** Connect `squadSpecs` and `workflowSpecs` to the existing Convex task system so squads can launch real missions without creating a second runtime model.

**Detailed diagnosis:** `docs/plans/2026-03-14-squad-execution-on-task-system-plan.md`

---

## Story Decomposition

- `tech-spec-squad-execution-engine-on-task-system`
- `tech-spec-ai-workflow-planning-bypass`
- `tech-spec-squad-mission-launch-and-task-binding`
- `tech-spec-workflow-spec-materialization-to-task-steps`
- `tech-spec-squad-runtime-execution-and-review-routing`
- `tech-spec-squad-execution-stabilization-and-rollout`

## Problems Found

### Problem 1: Workflow-generated missions are being hijacked by legacy planning

The first implementation launches an `ai_workflow` task with a compiled plan, but the task still enters `inbox` and is routed into `planning`, where the lead-agent overwrites the workflow plan.

### Problem 2: Blueprint and runtime are disconnected

Squads and workflows can be created and inspected, but there is no launch path that turns a blueprint into a task instance.

### Problem 3: Task execution is already real, but workflow execution is not

The task system already owns lifecycle, plans, steps, and dispatch, yet workflows are not compiling into that system.

### Problem 4: Workflow semantics are lost at materialization time

Current step records do not preserve enough metadata to distinguish an agent step from a checkpoint or review gate reliably.

### Problem 5: There is no canonical mission runtime record

Without a thin workflow-run record, it becomes hard to trace launch inputs, workflow version, step mapping, and review routing over time.

## Solution Principles

1. Do not create a parallel squad executor outside `tasks` and `steps`.
2. Keep Convex as the source of truth for mission state.
3. Treat `workflowSpec` as a blueprint that compiles into `executionPlan`.
4. Add only the minimum runtime metadata needed for routing and observability.
5. Preserve board-scoped memory exactly as it works today.

## Wave 0: Freeze the Execution Shape

**Objective:** Align the team on the correct integration model before implementation starts.

**Core work:**
- record the current-state review
- record the target architecture
- record stories and implementation waves

**Must not do:**
- do not build a parallel “squad runner” outside tasks
- do not launch missions by bypassing `tasks` and writing directly to `steps`

**Exit gate:**
- the launch model is explicit
- Convex ownership boundaries are explicit

## Wave 1: Mission Launch and Task Binding

**Stories:**
- `tech-spec-ai-workflow-planning-bypass.md`
- `tech-spec-squad-mission-launch-and-task-binding.md`

**Objective:** Create the missing bridge from squad blueprint to task instance.

**Scope:**
- guardrail that prevents ai-workflow tasks from entering legacy planning
- `Run Mission` launch UX
- launch mutation
- task creation with `workMode = ai_workflow`
- board/workflow selection
- initial execution-plan compilation

**Problems solved in this wave:**
- workflow-plan overwrite by legacy planning
- no mission launch path
- blueprint/runtime disconnect

**Must not do:**
- no ad-hoc task creation path outside Convex
- no custom executor yet

**Exit gate:**
- launching a squad creates a task instance correctly bound to squad, workflow, and board
- workflow-generated tasks no longer get replanned by the lead-agent

## Wave 2: Workflow Compilation and Materialization Metadata

**Story:** `tech-spec-workflow-spec-materialization-to-task-steps.md`

**Objective:** Make compiled workflow plans first-class citizens in the current task pipeline.

**Scope:**
- workflow compiler
- plan source metadata
- step metadata extensions
- materialization compatibility

**Problems solved in this wave:**
- workflows not entering the task pipeline
- workflow semantics lost during step creation

**Must not do:**
- no lead-agent planning fallback for squad missions as the default path
- no duplication of dependency resolution logic

**Exit gate:**
- compiled workflow plans materialize cleanly into steps with workflow metadata preserved

## Wave 3: Runtime Dispatch, Review Routing, and Human Gates

**Story:** `tech-spec-squad-runtime-execution-and-review-routing.md`

**Objective:** Make launched workflow tasks behave correctly at runtime.

**Scope:**
- dispatch runnable agent steps
- stop on checkpoint/human steps
- support review-step routing
- introduce thin `workflowRuns` provenance

**Problems solved in this wave:**
- no runtime mission provenance
- no coherent handling of non-agent workflow steps

**Must not do:**
- no fully generic BPM engine
- no second status system competing with task status

**Exit gate:**
- the runtime can launch, pause, dispatch, and review a squad mission through existing task mechanics

## Wave 4: Stabilization and Rollout

**Story:** `tech-spec-squad-execution-stabilization-and-rollout.md`

**Objective:** Prove that squad execution is cohesive in the real product, not only in unit tests.

**Scope:**
- full-stack validation
- regression coverage
- rollout notes and migration guidance

**Problems solved in this wave:**
- false confidence from partial integration
- hidden mismatches between launch preview and runtime behavior

**Must not do:**
- no new feature scope
- no rollout without board-scoped memory validation

**Exit gate:**
- missions launch from squads in the real app
- task detail reflects workflow provenance correctly
- runtime behavior matches the compiled workflow

## Recommended Sequencing

1. Land launch and task binding first.
2. Land workflow compilation before runtime dispatch changes.
3. Add review routing only after step metadata is canonical.
4. Finish with real MC-stack validation, not frontend-only verification.
