# Lead-Agent Direct Delegation Parallel Waves Plan

**Goal:** Deliver the lead-agent direct delegation refactor in safe waves that
stabilize task semantics first, then split runtime and dashboard work without
reintroducing ambiguity around workflow planning.

**Approach:** Parallelize only after the task contract is explicit. The main
hotspots in this refactor are `dashboard/convex/schema.ts`,
`dashboard/convex/tasks.ts`, `dashboard/convex/lib/taskMetadata.ts`,
`mc/runtime/workers/inbox.py`, `mc/runtime/workers/planning.py`,
`mc/contexts/conversation/intent.py`, and the task-detail read models. Early
waves must freeze meaning before runtime and UI can safely fan out.

---

## Guiding Rules

1. Do not parallelize stories that redefine the same task fields.
2. Freeze `workMode` and `routingMode` before splitting runtime and dashboard
   implementation.
3. Do not let workflow and direct-delegate semantics evolve in separate lanes
   before the boundary is explicit in tests.
4. Keep `ExecutionPlan` ownership stable during the refactor: workflow only.
5. Keep the `Execution Plan` tab shell while removing non-workflow plan-review
   behavior.

## Recommended Waves

### Wave 0: Contract Lock

**Stories:** `31.1` then `31.2`

**Objective:**
- make `workMode` and `routingMode` explicit on tasks
- add the routing-grade active agent registry contract
- add durable agent metric fields before any runtime or UI depends on them

**Why not parallelize this wave:**
- both stories touch `dashboard/convex/schema.ts`
- `31.2` depends on the semantic naming frozen by `31.1`
- introducing routing logic before these contracts settle would create rework

**Recommended staffing:**
- 1 lead implementer
- 1 reviewer validating schema and query shape

**Merge gate:**
- new tasks can declare `direct_delegate` vs `ai_workflow`
- the registry view exists and is consumable from Python

### Wave 1: Runtime Split

**Stories:** `31.3` then `31.4`

**Objective:**
- route normal tasks through direct delegation
- make planning and plan chat workflow-only

**Why not parallelize this wave:**
- both stories touch the runtime boundary between inbox, planning, and
  conversation intent
- `31.4` depends on the runtime split introduced in `31.3`
- the highest-risk bug here is leaving a half-routed state where direct tasks
  still leak into planning or negotiation

**Recommended staffing:**
- 1 lead implementer
- 1 reviewer focused on runtime and conversation invariants

**Merge gate:**
- direct-delegate tasks never receive lead-agent-generated plans
- non-workflow tasks cannot trigger `plan_chat`

### Wave 2: Dashboard Contract Adoption

**Stories:** `31.5` and `31.6` in parallel

**Objective:**
- persist the new routing contract from the dashboard
- scope task-detail plan-review UI to workflow while keeping the plan tab shell

**Parallel lanes:**

**Lane A: Task creation and explicit human routing**
- Story `31.5`
- Ownership:
  - `dashboard/features/tasks/components/TaskInput.tsx`
  - `dashboard/features/tasks/hooks/useTaskInputData.ts`
  - `dashboard/convex/tasks.ts`
  - `dashboard/convex/lib/taskMetadata.ts`

**Lane B: Read models and task-detail rendering**
- Story `31.6`
- Ownership:
  - `dashboard/convex/lib/readModels.ts`
  - `dashboard/features/tasks/components/TaskDetailSheet.tsx`
  - `dashboard/features/tasks/components/PlanReviewPanel.tsx`
  - `dashboard/features/tasks/hooks/useTaskDetailView.ts`

**Why these can run in parallel:**
- Lane A owns creation payloads and persistence
- Lane B owns read models and rendering semantics
- the shared dependency is the contract frozen in Waves 0 and 1

**Recommended staffing:**
- 2 implementers, one per lane
- 1 reviewer/integrator

**Merge gate:**
- dashboard-created normal tasks persist as `direct_delegate`
- non-workflow tasks keep the plan tab shell but lose workflow-only plan-review
  affordances

### Wave 3: Metric Activation

**Stories:** `31.7`

**Objective:**
- turn the previously added metric fields into real lifecycle counters

**Why keep this isolated:**
- it touches canonical completion points in `taskLifecycle.ts` and `steps.ts`
- shipping it after runtime and dashboard adoption reduces the chance of
  counting the wrong paths during active refactor churn

**Recommended staffing:**
- 1 implementer
- 1 reviewer focused on lifecycle truth and regression tests

**Merge gate:**
- direct task completion increments task counters only
- workflow step completion increments step counters only

## Suggested Team Shape

### Lean team: 2 engineers

- Engineer 1 owns Waves 0 and 1
- Engineer 2 owns Wave 2 lane A and Wave 3
- Wave 2 lane B is done after lane A unless the first engineer is free

### Balanced team: 3 engineers

- Engineer 1: semantic contract and runtime split
- Engineer 2: dashboard creation and human routing
- Engineer 3: task-detail UI and later metric activation

### Aggressive team: 4 engineers

- Only recommended after Wave 1 is merged
- One engineer per Wave 2 lane, one on metrics prep, one on review/integration
- Do not split Wave 0 or Wave 1 across multiple implementers

## Practical Recommendation

If the goal is speed with low integration risk, use this sequence:

1. Wave 0 sequential
2. Wave 1 sequential
3. Wave 2 parallel
4. Wave 3 sequential

This preserves the most important invariant of the refactor: workflow keeps
exclusive ownership of `ExecutionPlan`, while direct-delegate and human-routed
tasks become simpler without breaking the existing task-detail shell.
