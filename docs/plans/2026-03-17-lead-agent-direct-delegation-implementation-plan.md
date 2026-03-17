# Lead Agent Direct Delegation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make normal tasks use `direct_delegate` routing through the lead-agent, keep `ExecutionPlan` exclusive to workflow tasks, and preserve explicit human-to-agent assignment as a separate routing mode.

**Architecture:** Introduce explicit `workMode` and `routingMode` fields on tasks, move normal task routing onto a lead-agent-backed registry lookup instead of plan generation, and restrict planning/review semantics so they only apply to workflow tasks. The dashboard keeps the `Execution Plan` tab shell, but only workflow tasks own plan data and plan-review behavior.

**Tech Stack:** Python, Convex, Next.js, React, TypeScript, pytest, vitest, Testing Library, ruff

---

### Task 1: Add failing schema and task metadata tests for work/routing modes

**Files:**
- Modify: `dashboard/convex/schema.ts`
- Modify: `dashboard/convex/tasks.test.ts`
- Modify: `dashboard/convex/lib/taskMetadata.ts`
- Reference: `dashboard/convex/tasks.ts`

**Step 1: Write the failing test**

Add tests that assert:
- newly created normal tasks persist `workMode="direct_delegate"`
- direct-assigned dashboard tasks can persist `routingMode="human"`
- workflow-launched tasks continue to persist `workMode="ai_workflow"` and retain `executionPlan`

**Step 2: Run test to verify it fails**

Run: `npm test -- convex/tasks.test.ts`
Expected: FAIL because task creation does not yet persist the new routing fields.

**Step 3: Write minimal implementation**

Update task schema and creation helpers so:
- normal creation defaults to `workMode="direct_delegate"`
- explicit human assignment can mark `routingMode="human"`
- workflow launch remains separate

**Step 4: Run test to verify it passes**

Run: `npm test -- convex/tasks.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add dashboard/convex/schema.ts dashboard/convex/tasks.test.ts dashboard/convex/lib/taskMetadata.ts dashboard/convex/tasks.ts
git commit -m "feat: add task work and routing modes"
```

### Task 2: Add failing agent registry and metrics tests

**Files:**
- Modify: `dashboard/convex/agents.ts`
- Modify: `dashboard/convex/schema.ts`
- Create or Modify: `dashboard/convex/agents.test.ts`
- Reference: `mc/bridge/repositories/agents.py`

**Step 1: Write the failing test**

Add tests that assert:
- `agents:listActiveRegistryView` returns only active delegatable agents
- registry rows include `skills`, `role`, `squads`, `tasksExecuted`, `stepsExecuted`, and `lastActiveAt`
- system-only or non-delegatable agents are excluded where appropriate

**Step 2: Run test to verify it fails**

Run: `npm test -- convex/agents.test.ts`
Expected: FAIL because the registry view and metric fields do not exist yet.

**Step 3: Write minimal implementation**

Add:
- agent metric fields to schema
- the registry read model query
- minimal squad-name resolution for registry output

**Step 4: Run test to verify it passes**

Run: `npm test -- convex/agents.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add dashboard/convex/agents.ts dashboard/convex/schema.ts dashboard/convex/agents.test.ts
git commit -m "feat: add active agent registry view"
```

### Task 3: Add failing Python routing tests for direct delegation

**Files:**
- Modify: `tests/mc/runtime/test_inbox_worker_ai_workflow.py`
- Create: `tests/mc/workers/test_direct_delegate_routing.py`
- Modify: `mc/runtime/workers/inbox.py`
- Modify: `mc/runtime/workers/planning.py`
- Reference: `mc/runtime/orchestrator.py`

**Step 1: Write the failing test**

Add tests that assert:
- normal tasks created from inbox are routed as `direct_delegate`
- workflow tasks still bypass direct delegation and keep workflow planning/materialization
- direct-delegate tasks do not enter the lead-agent planner path

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/workers/test_direct_delegate_routing.py tests/mc/runtime/test_inbox_worker_ai_workflow.py -q`
Expected: FAIL because inbox/planning workers still treat normal tasks as planning tasks.

**Step 3: Write minimal implementation**

Refactor routing so:
- inbox worker decides between workflow and direct delegation
- normal tasks are assigned to a new direct-delegation path
- planning worker becomes workflow-only in practice

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/mc/workers/test_direct_delegate_routing.py tests/mc/runtime/test_inbox_worker_ai_workflow.py -q`
Expected: PASS

**Step 5: Commit**

```bash
git add mc/runtime/workers/inbox.py mc/runtime/workers/planning.py tests/mc/workers/test_direct_delegate_routing.py tests/mc/runtime/test_inbox_worker_ai_workflow.py
git commit -m "feat: route normal tasks through direct delegation"
```

### Task 4: Add failing lead-agent router tests and implementation

**Files:**
- Create: `mc/contexts/routing/router.py`
- Create: `tests/mc/contexts/routing/test_router.py`
- Modify: `mc/bridge/repositories/agents.py`
- Modify: `mc/bridge/facade_mixins.py`
- Reference: `mc/contexts/planning/planner.py`

**Step 1: Write the failing test**

Add tests that assert:
- router can fetch the active registry view
- router selects a target agent for a normal task
- routing decision stores `targetAgent`, `routedAt`, and optional reason fields
- human-routed tasks do not require `reason` or `reasonCode`

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/contexts/routing/test_router.py -q`
Expected: FAIL because the routing context and bridge method do not exist.

**Step 3: Write minimal implementation**

Add a focused routing context that:
- reads `agents:listActiveRegistryView`
- applies lead-agent selection logic
- returns a routing decision payload

Do not reuse `TaskPlanner` or plan parsing code.

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/mc/contexts/routing/test_router.py -q`
Expected: PASS

**Step 5: Commit**

```bash
git add mc/contexts/routing/router.py tests/mc/contexts/routing/test_router.py mc/bridge/repositories/agents.py mc/bridge/facade_mixins.py
git commit -m "feat: add lead-agent direct delegation router"
```

### Task 5: Add failing conversation intent tests for workflow-only plan chat

**Files:**
- Modify: `tests/mc/services/test_conversation_intent.py`
- Modify: `tests/mc/services/test_conversation.py`
- Modify: `mc/contexts/conversation/intent.py`
- Modify: `mc/contexts/conversation/service.py`
- Modify: `mc/contexts/planning/negotiation.py`

**Step 1: Write the failing test**

Add tests that assert:
- `plan_chat` is only returned for workflow-backed tasks
- direct-delegate tasks use normal follow-up/comment behavior
- human-routed tasks do not enter plan negotiation

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/services/test_conversation_intent.py tests/mc/services/test_conversation.py -q`
Expected: FAIL because non-workflow tasks can still enter plan negotiation paths.

**Step 3: Write minimal implementation**

Restrict negotiable status checks so they require workflow ownership, not merely `review` plus an empty or stale plan shape.

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/mc/services/test_conversation_intent.py tests/mc/services/test_conversation.py -q`
Expected: PASS

**Step 5: Commit**

```bash
git add mc/contexts/conversation/intent.py mc/contexts/conversation/service.py mc/contexts/planning/negotiation.py tests/mc/services/test_conversation_intent.py tests/mc/services/test_conversation.py
git commit -m "fix: limit plan chat to workflow tasks"
```

### Task 6: Add failing dashboard task detail tests for routing-aware behavior

**Files:**
- Modify: `dashboard/features/tasks/components/TaskDetailSheet.test.tsx`
- Modify: `dashboard/features/tasks/components/PlanReviewPanel.test.tsx`
- Modify: `dashboard/features/tasks/hooks/useTaskDetailView.test.ts`
- Modify: `dashboard/convex/lib/readModels.ts`
- Reference: `dashboard/features/tasks/components/ExecutionPlanTab.tsx`

**Step 1: Write the failing test**

Add tests that assert:
- direct-delegate tasks keep the `Execution Plan` tab shell
- direct-delegate tasks do not show lead-agent review UI
- human-routed tasks do not show lead-agent review UI
- workflow tasks still show the existing workflow plan/review behavior

**Step 2: Run test to verify it fails**

Run: `npm test -- features/tasks/components/TaskDetailSheet.test.tsx features/tasks/components/PlanReviewPanel.test.tsx hooks/useTaskDetailView.test.ts`
Expected: FAIL because read models and task detail still key off generic plan-review fields.

**Step 3: Write minimal implementation**

Update read models and task detail logic so workflow ownership, not merely tab presence, drives plan-review rendering.

**Step 4: Run test to verify it passes**

Run: `npm test -- features/tasks/components/TaskDetailSheet.test.tsx features/tasks/components/PlanReviewPanel.test.tsx hooks/useTaskDetailView.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add dashboard/features/tasks/components/TaskDetailSheet.test.tsx dashboard/features/tasks/components/PlanReviewPanel.test.tsx dashboard/features/tasks/hooks/useTaskDetailView.test.ts dashboard/convex/lib/readModels.ts
git commit -m "fix: scope plan review ui to workflow tasks"
```

### Task 7: Implement dashboard creation and direct-human assignment plumbing

**Files:**
- Modify: `dashboard/features/tasks/components/TaskInput.tsx`
- Modify: `dashboard/features/tasks/hooks/useTaskInputData.ts`
- Modify: `dashboard/convex/tasks.ts`
- Modify: `dashboard/convex/lib/taskMetadata.ts`
- Modify: `dashboard/hooks/useSelectableAgents.ts` only if registry view replaces the current query
- Test: `dashboard/components/TaskInput.test.tsx`

**Step 1: Write the failing test**

Add tests that assert:
- standard frontend task creation sends `workMode="direct_delegate"`
- direct manual assignment stores `routingMode="human"` when the operator chooses a specific agent
- creation still supports board/tag/file behavior unchanged

**Step 2: Run test to verify it fails**

Run: `npm test -- components/TaskInput.test.tsx`
Expected: FAIL because task creation does not yet send the new routing fields.

**Step 3: Write minimal implementation**

Update task creation arguments and mutation plumbing without changing the current UI shell.

**Step 4: Run test to verify it passes**

Run: `npm test -- components/TaskInput.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add dashboard/features/tasks/components/TaskInput.tsx dashboard/features/tasks/hooks/useTaskInputData.ts dashboard/convex/tasks.ts dashboard/convex/lib/taskMetadata.ts dashboard/components/TaskInput.test.tsx
git commit -m "feat: persist direct delegation task mode from dashboard"
```

### Task 8: Add execution metric updates and regression tests

**Files:**
- Modify: `dashboard/convex/steps.ts`
- Modify: `dashboard/convex/lib/taskLifecycle.ts`
- Modify: `dashboard/convex/lib/taskLifecycle.test.ts`
- Modify: `dashboard/convex/steps.test.ts`
- Reference: `mc/contexts/execution/step_dispatcher.py`

**Step 1: Write the failing test**

Add tests that assert:
- task completion increments `tasksExecuted` for the assigned agent on direct delegation
- step completion increments `stepsExecuted` for workflow executors
- timestamps update alongside counters

**Step 2: Run test to verify it fails**

Run: `npm test -- convex/lib/taskLifecycle.test.ts convex/steps.test.ts`
Expected: FAIL because execution metrics are not yet tracked.

**Step 3: Write minimal implementation**

Increment agent metrics at the canonical completion points instead of scattering updates through UI-specific flows.

**Step 4: Run test to verify it passes**

Run: `npm test -- convex/lib/taskLifecycle.test.ts convex/steps.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add dashboard/convex/steps.ts dashboard/convex/lib/taskLifecycle.ts dashboard/convex/lib/taskLifecycle.test.ts dashboard/convex/steps.test.ts
git commit -m "feat: track agent execution metrics"
```

### Task 9: Run verification and guardrails

**Files:**
- Modify: touched Python and dashboard files only
- Test: `tests/mc/test_architecture.py`
- Test: `tests/mc/test_module_reorganization.py`
- Test: `tests/mc/infrastructure/test_boundary.py`
- Test: `dashboard/tests/architecture.test.ts`

**Step 1: Run Python format check**

Run: `uv run ruff format --check mc tests/mc`
Expected: PASS

**Step 2: Run Python lint**

Run: `uv run ruff check mc tests/mc`
Expected: PASS

**Step 3: Run Python architecture guardrails**

Run: `uv run pytest tests/mc/test_architecture.py tests/mc/test_module_reorganization.py tests/mc/infrastructure/test_boundary.py -q`
Expected: PASS

**Step 4: Run dashboard checks**

Run: `npm run format:file:check -- <touched-dashboard-paths>`
Expected: PASS

**Step 5: Run dashboard lint and architecture**

Run: `npm run lint:file -- <touched-dashboard-paths> && npm run test:architecture`
Expected: PASS

**Step 6: Run targeted regression suites**

Run: `npm test -- convex/tasks.test.ts convex/agents.test.ts features/tasks/components/TaskDetailSheet.test.tsx features/tasks/components/PlanReviewPanel.test.tsx components/TaskInput.test.tsx`
Expected: PASS

Run: `uv run pytest tests/mc/workers/test_direct_delegate_routing.py tests/mc/contexts/routing/test_router.py tests/mc/services/test_conversation_intent.py tests/mc/services/test_conversation.py -q`
Expected: PASS

**Step 7: Commit**

```bash
git add <touched-files>
git commit -m "feat: split workflow planning from direct delegation"
```
