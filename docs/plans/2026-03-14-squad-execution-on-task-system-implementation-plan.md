# Squad Execution On Task System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make squads launch real missions by compiling `workflowSpecs` into task execution plans, materializing them into Convex `steps`, and reusing the existing MC runtime for dispatch and review.

**Architecture:** Keep specs as blueprints, keep `tasks` and `steps` as runtime instances, add only the minimal launch/compiler/runtime metadata needed for coherent mission execution. Convex owns state; Python reacts to runnable work.

**Tech Stack:** Convex, Next.js App Router, React 19, TypeScript, Python, pytest, Vitest, Playwright CLI, Mission Control runtime

---

## References

- Diagnosis: `docs/plans/2026-03-14-squad-execution-on-task-system-plan.md`
- Wave plan: `docs/plans/2026-03-14-squad-execution-on-task-system-wave-plan.md`
- Story artifact: `_bmad-output/implementation-artifacts/tech-spec-squad-execution-engine-on-task-system.md`
- Story artifact: `_bmad-output/implementation-artifacts/tech-spec-ai-workflow-planning-bypass.md`
- Story artifact: `_bmad-output/implementation-artifacts/tech-spec-squad-mission-launch-and-task-binding.md`
- Story artifact: `_bmad-output/implementation-artifacts/tech-spec-workflow-spec-materialization-to-task-steps.md`
- Story artifact: `_bmad-output/implementation-artifacts/tech-spec-squad-runtime-execution-and-review-routing.md`
- Story artifact: `_bmad-output/implementation-artifacts/tech-spec-squad-execution-stabilization-and-rollout.md`

## Execution Setup

- Execute in a dedicated git worktree from the repository root.
- Suggested branch label: `squadExecutionOnTaskSystem`. If the branch is created via Codex tooling, use `codex/squadExecutionOnTaskSystem`.
- Keep app validation on the full MC stack with `PORT=3001 uv run nanobot mc start`.
- Do not validate this work with frontend-only `npm run dev`.

## Problems This Plan Fixes

1. Workflow-generated missions are still being routed into the legacy planning worker and have their plans overwritten.
2. Squads and workflows are persisted but cannot launch a mission safely.
3. The task system and squad system are adjacent, not integrated.
4. Workflow semantics are dropped before they reach materialized steps.
5. There is no workflow mission provenance or routing state.

## Delivery Order

1. Block the legacy inbox/planning pipeline from hijacking workflow-generated tasks.
2. Add a launch path from squad blueprint to task instance.
3. Compile workflow specs into execution plans and preserve runtime metadata.
4. Make runtime dispatch and gating honor workflow semantics.
5. Validate the full flow in the real app.

### Task 0: Add guardrails so ai-workflow tasks bypass legacy planning

**Files:**
- Modify: `dashboard/convex/lib/squadMissionLaunch.ts`
- Modify: `dashboard/convex/lib/squadMissionLaunch.test.ts`
- Modify: `mc/runtime/workers/inbox.py`
- Create: `tests/mc/runtime/test_inbox_worker_ai_workflow.py`
- Modify: `mc/runtime/workers/planning.py`
- Create: `tests/mc/runtime/test_planning_worker_ai_workflow.py`

**Step 1: Write the failing guardrail tests**

Add tests that prove:

- a launched squad mission with a workflow-generated plan does not go to `planning`
- the mission is created in `review` with `awaitingKickoff = true`, or is otherwise marked to bypass planning explicitly
- `PlanningWorker` skips tasks whose `executionPlan.generatedBy == "workflow"`
- an existing workflow-generated plan is not overwritten by the lead-agent planner

**Step 2: Run the targeted tests and confirm they fail**

```bash
uv run pytest tests/mc/runtime/test_inbox_worker_ai_workflow.py tests/mc/runtime/test_planning_worker_ai_workflow.py
cd dashboard
npm run test -- convex/lib/squadMissionLaunch.test.ts
```

Expected: FAIL because ai-workflow tasks still enter the legacy inbox/planning funnel.

**Step 3: Implement the bypass**

Recommended implementation:

1. launch the squad mission directly into `review` with `awaitingKickoff = true`
2. make `InboxWorker` skip `ai_workflow` tasks that already have workflow-generated plans
3. make `PlanningWorker` short-circuit when `workMode == ai_workflow` and `generatedBy == "workflow"`

This should be treated as defense in depth, not a single-point fix.

**Step 4: Re-run the targeted tests**

Run the same commands and expect PASS.

**Step 5: Run Python/dashboard guardrails and commit**

```bash
uv run ruff format --check mc/runtime/workers/inbox.py mc/runtime/workers/planning.py tests/mc/runtime/test_inbox_worker_ai_workflow.py tests/mc/runtime/test_planning_worker_ai_workflow.py
uv run ruff check mc/runtime/workers/inbox.py mc/runtime/workers/planning.py tests/mc/runtime/test_inbox_worker_ai_workflow.py tests/mc/runtime/test_planning_worker_ai_workflow.py
cd dashboard
npm run format:file:check -- convex/lib/squadMissionLaunch.ts convex/lib/squadMissionLaunch.test.ts
npm run lint:file -- convex/lib/squadMissionLaunch.ts convex/lib/squadMissionLaunch.test.ts
git add mc/runtime/workers/inbox.py mc/runtime/workers/planning.py tests/mc/runtime/test_inbox_worker_ai_workflow.py tests/mc/runtime/test_planning_worker_ai_workflow.py dashboard/convex/lib/squadMissionLaunch.ts dashboard/convex/lib/squadMissionLaunch.test.ts
git commit -m "fix: bypass legacy planning for workflow missions"
```

### Task 1: Add mission launch and task binding

**Files:**
- Modify: `dashboard/convex/schema.ts`
- Modify: `dashboard/convex/tasks.ts`
- Modify: `dashboard/convex/tasks.test.ts`
- Create: `dashboard/convex/lib/squadMissionLaunch.ts`
- Create: `dashboard/convex/lib/squadMissionLaunch.test.ts`
- Modify: `dashboard/convex/boardSquadBindings.ts`
- Modify: `dashboard/convex/boardSquadBindings.test.ts`
- Modify: `dashboard/features/agents/components/SquadDetailSheet.tsx`
- Create: `dashboard/features/agents/components/RunSquadMissionDialog.tsx`
- Create: `dashboard/features/agents/components/RunSquadMissionDialog.test.tsx`
- Create: `dashboard/features/agents/hooks/useRunSquadMission.ts`
- Create: `dashboard/features/agents/hooks/useRunSquadMission.test.tsx`

**Step 1: Write the failing launch tests**

Add tests that prove:

- a mission can be launched from a published squad
- the launch resolves a board binding and selected workflow
- the created task stores `workMode = ai_workflow`
- the created task stores `squadSpecId` and `workflowSpecId`
- the launch path returns the created task id

**Step 2: Run the targeted tests and confirm they fail**

```bash
cd dashboard
npm run test -- convex/tasks.test.ts convex/lib/squadMissionLaunch.test.ts features/agents/components/RunSquadMissionDialog.test.tsx features/agents/hooks/useRunSquadMission.test.tsx
```

Expected: FAIL because no mission launch path exists yet.

**Step 3: Implement launch plumbing**

Create a dedicated launch helper that:

1. validates squad + workflow + board selection
2. creates a task mission record
3. seeds the task with the compiled workflow plan placeholder
4. returns the task id for navigation

**Step 4: Re-run the targeted tests**

Run the same `npm run test -- ...` command and expect PASS.

**Step 5: Run dashboard guardrails and commit**

```bash
cd dashboard
npm run format:file:check -- convex/schema.ts convex/tasks.ts convex/tasks.test.ts convex/lib/squadMissionLaunch.ts convex/lib/squadMissionLaunch.test.ts convex/boardSquadBindings.ts convex/boardSquadBindings.test.ts features/agents/components/SquadDetailSheet.tsx features/agents/components/RunSquadMissionDialog.tsx features/agents/components/RunSquadMissionDialog.test.tsx features/agents/hooks/useRunSquadMission.ts features/agents/hooks/useRunSquadMission.test.tsx
npm run lint:file -- convex/schema.ts convex/tasks.ts convex/tasks.test.ts convex/lib/squadMissionLaunch.ts convex/lib/squadMissionLaunch.test.ts convex/boardSquadBindings.ts convex/boardSquadBindings.test.ts features/agents/components/SquadDetailSheet.tsx features/agents/components/RunSquadMissionDialog.tsx features/agents/components/RunSquadMissionDialog.test.tsx features/agents/hooks/useRunSquadMission.ts features/agents/hooks/useRunSquadMission.test.tsx
git add dashboard/convex/schema.ts dashboard/convex/tasks.ts dashboard/convex/tasks.test.ts dashboard/convex/lib/squadMissionLaunch.ts dashboard/convex/lib/squadMissionLaunch.test.ts dashboard/convex/boardSquadBindings.ts dashboard/convex/boardSquadBindings.test.ts dashboard/features/agents/components/SquadDetailSheet.tsx dashboard/features/agents/components/RunSquadMissionDialog.tsx dashboard/features/agents/components/RunSquadMissionDialog.test.tsx dashboard/features/agents/hooks/useRunSquadMission.ts dashboard/features/agents/hooks/useRunSquadMission.test.tsx
git commit -m "feat: add squad mission launch flow"
```

### Task 2: Compile workflow specs into execution plans

**Files:**
- Modify: `dashboard/convex/workflowSpecs.ts`
- Create: `dashboard/convex/lib/workflowExecutionCompiler.ts`
- Create: `dashboard/convex/lib/workflowExecutionCompiler.test.ts`
- Modify: `dashboard/convex/lib/taskPlanning.ts`
- Modify: `dashboard/convex/schema.ts`
- Modify: `dashboard/features/tasks/hooks/useTaskDetailView.ts`
- Modify: `dashboard/features/tasks/components/ExecutionPlanTab.tsx`

**Step 1: Write the failing compiler tests**

Add tests that prove:

- workflow steps compile into execution-plan steps with stable temp ids
- dependencies map into `blockedBy`
- agent workflow steps resolve to runtime `assignedAgent`
- workflow-generated plans carry source metadata distinct from lead-agent plans

**Step 2: Run the targeted tests and confirm they fail**

```bash
cd dashboard
npm run test -- convex/lib/workflowExecutionCompiler.test.ts convex/tasks.test.ts
```

Expected: FAIL because no workflow compiler exists yet.

**Step 3: Implement the compiler and plan-source support**

Keep the output compatible with the current execution-plan shape, but enrich it with optional workflow metadata needed downstream.

**Step 4: Re-run the targeted tests**

Run the same `npm run test -- ...` command and expect PASS.

**Step 5: Run dashboard guardrails and commit**

```bash
cd dashboard
npm run format:file:check -- convex/workflowSpecs.ts convex/lib/workflowExecutionCompiler.ts convex/lib/workflowExecutionCompiler.test.ts convex/lib/taskPlanning.ts convex/schema.ts features/tasks/hooks/useTaskDetailView.ts features/tasks/components/ExecutionPlanTab.tsx
npm run lint:file -- convex/workflowSpecs.ts convex/lib/workflowExecutionCompiler.ts convex/lib/workflowExecutionCompiler.test.ts convex/lib/taskPlanning.ts convex/schema.ts features/tasks/hooks/useTaskDetailView.ts features/tasks/components/ExecutionPlanTab.tsx
git add dashboard/convex/workflowSpecs.ts dashboard/convex/lib/workflowExecutionCompiler.ts dashboard/convex/lib/workflowExecutionCompiler.test.ts dashboard/convex/lib/taskPlanning.ts dashboard/convex/schema.ts dashboard/features/tasks/hooks/useTaskDetailView.ts dashboard/features/tasks/components/ExecutionPlanTab.tsx
git commit -m "feat: compile workflow specs into execution plans"
```

### Task 3: Preserve workflow metadata on materialized steps

**Files:**
- Modify: `dashboard/convex/steps.ts`
- Modify: `dashboard/convex/steps.test.ts`
- Modify: `dashboard/convex/schema.ts`
- Modify: `mc/types.py`
- Modify: `mc/contexts/planning/materializer.py`
- Create: `tests/mc/contexts/planning/test_workflow_plan_materializer.py`
- Modify: `mc/bridge/repositories/steps.py`

**Step 1: Write the failing materialization tests**

Add tests that prove:

- workflow-generated plans create steps with preserved workflow metadata
- human/checkpoint/review step types survive materialization
- dependency mapping still works after metadata is added

**Step 2: Run the targeted tests and confirm they fail**

```bash
uv run pytest tests/mc/contexts/planning/test_workflow_plan_materializer.py
cd dashboard
npm run test -- convex/steps.test.ts
```

Expected: FAIL because the current batch step payload has no workflow metadata fields.

**Step 3: Extend step payloads and materialization**

Prefer extending the existing `batchCreate` path with optional metadata rather than creating a second step-creation mutation.

**Step 4: Re-run the targeted tests**

Run the same commands and expect PASS.

**Step 5: Run Python and dashboard guardrails and commit**

```bash
uv run ruff format --check mc/types.py mc/contexts/planning/materializer.py mc/bridge/repositories/steps.py tests/mc/contexts/planning/test_workflow_plan_materializer.py
uv run ruff check mc/types.py mc/contexts/planning/materializer.py mc/bridge/repositories/steps.py tests/mc/contexts/planning/test_workflow_plan_materializer.py
cd dashboard
npm run format:file:check -- convex/steps.ts convex/steps.test.ts convex/schema.ts
npm run lint:file -- convex/steps.ts convex/steps.test.ts convex/schema.ts
git add mc/types.py mc/contexts/planning/materializer.py mc/bridge/repositories/steps.py tests/mc/contexts/planning/test_workflow_plan_materializer.py dashboard/convex/steps.ts dashboard/convex/steps.test.ts dashboard/convex/schema.ts
git commit -m "feat: preserve workflow metadata on materialized steps"
```

### Task 4: Add workflow runtime provenance and gate behavior

**Files:**
- Modify: `dashboard/convex/schema.ts`
- Create: `dashboard/convex/workflowRuns.ts`
- Create: `dashboard/convex/workflowRuns.test.ts`
- Modify: `mc/runtime/workers/kickoff.py`
- Modify: `mc/contexts/execution/step_dispatcher.py`
- Create: `tests/mc/runtime/test_squad_workflow_dispatch.py`
- Modify: `dashboard/features/tasks/components/TaskDetailSheet.tsx`
- Modify: `dashboard/features/tasks/components/ExecutionPlanTab.tsx`

**Step 1: Write the failing runtime tests**

Add tests that prove:

- launching a mission creates a `workflowRun`
- agent steps dispatch automatically
- human/checkpoint steps stop in `waiting_human`
- review steps can be identified reliably from step metadata

**Step 2: Run the targeted tests and confirm they fail**

```bash
uv run pytest tests/mc/runtime/test_squad_workflow_dispatch.py
cd dashboard
npm run test -- convex/workflowRuns.test.ts features/tasks/components/ExecutionPlanTab.tsx
```

Expected: FAIL because there is no workflow runtime provenance and the dispatcher is still generic.

**Step 3: Implement runtime provenance and gate handling**

Use `workflowRuns` as a thin control-plane record. Do not move task ownership out of Convex and do not replace the existing dispatcher loop.

**Step 4: Re-run the targeted tests**

Run the same commands and expect PASS.

**Step 5: Run guardrails and commit**

```bash
uv run ruff format --check mc/runtime/workers/kickoff.py mc/contexts/execution/step_dispatcher.py tests/mc/runtime/test_squad_workflow_dispatch.py
uv run ruff check mc/runtime/workers/kickoff.py mc/contexts/execution/step_dispatcher.py tests/mc/runtime/test_squad_workflow_dispatch.py
cd dashboard
npm run format:file:check -- convex/schema.ts convex/workflowRuns.ts convex/workflowRuns.test.ts features/tasks/components/TaskDetailSheet.tsx features/tasks/components/ExecutionPlanTab.tsx
npm run lint:file -- convex/schema.ts convex/workflowRuns.ts convex/workflowRuns.test.ts features/tasks/components/TaskDetailSheet.tsx features/tasks/components/ExecutionPlanTab.tsx
git add mc/runtime/workers/kickoff.py mc/contexts/execution/step_dispatcher.py tests/mc/runtime/test_squad_workflow_dispatch.py dashboard/convex/schema.ts dashboard/convex/workflowRuns.ts dashboard/convex/workflowRuns.test.ts dashboard/features/tasks/components/TaskDetailSheet.tsx dashboard/features/tasks/components/ExecutionPlanTab.tsx
git commit -m "feat: add squad workflow runtime provenance"
```

### Task 5: Stabilize and validate end-to-end

**Files:**
- Test: `dashboard/convex/lib/squadMissionLaunch.test.ts`
- Test: `dashboard/convex/lib/workflowExecutionCompiler.test.ts`
- Test: `dashboard/convex/steps.test.ts`
- Test: `dashboard/convex/workflowRuns.test.ts`
- Test: `tests/mc/contexts/planning/test_workflow_plan_materializer.py`
- Test: `tests/mc/runtime/test_squad_workflow_dispatch.py`
- Test: `dashboard/features/agents/components/RunSquadMissionDialog.test.tsx`
- Test: `dashboard/e2e/dashboard-smoke.spec.ts`

**Step 1: Run the targeted regression suite**

```bash
uv run pytest tests/mc/contexts/planning/test_workflow_plan_materializer.py tests/mc/runtime/test_squad_workflow_dispatch.py
cd dashboard
npm run test -- convex/lib/squadMissionLaunch.test.ts convex/lib/workflowExecutionCompiler.test.ts convex/steps.test.ts convex/workflowRuns.test.ts features/agents/components/RunSquadMissionDialog.test.tsx
```

Expected: PASS.

**Step 2: Run baseline guardrails**

```bash
uv run pytest tests/mc/test_architecture.py tests/mc/test_module_reorganization.py tests/mc/infrastructure/test_boundary.py
cd dashboard
npm run test:architecture
```

Expected: PASS.

**Step 3: Validate the real app**

Run from the repository root:

```bash
PORT=3001 uv run nanobot mc start
```

Then validate with `playwright-cli` against `http://localhost:3001`:

- open a saved squad
- launch a mission with a selected board and workflow
- confirm the new task appears with workflow provenance
- confirm the execution plan reflects the chosen workflow
- kick off the mission
- confirm agent steps dispatch and human/checkpoint steps pause correctly

**Step 4: Run smoke validation if needed**

```bash
cd dashboard
npm run test:e2e
```

**Step 5: Commit the integration wave**

```bash
git add .
git commit -m "feat: ship squad execution on task system"
```
