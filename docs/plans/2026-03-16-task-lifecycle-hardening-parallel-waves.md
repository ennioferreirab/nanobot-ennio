# Task Lifecycle Hardening Parallel Waves Plan

**Goal:** Distribute the lifecycle-hardening stories into safe development waves with clear parallel boundaries, minimizing merge conflicts and semantic drift.

**Approach:** Parallelize by ownership boundary, not just by story count. The biggest risks in this refactor are shared files (`schema.ts`, `tasks.ts`, `steps.ts`, bridge repositories, and review semantics), so early waves must stabilize contracts first; later waves can fan out once those contracts exist.

---

## Guiding Rules

1. Do not parallelize stories that redefine the meaning of the same state fields.
2. Do not run two workers against the same hotspot files unless ownership is explicitly split.
3. Freeze the task transition contract before parallelizing Convex-side and Python-side migration.
4. Freeze the step transition contract before parallelizing worker-claim work and execution-plan cleanup.

## Recommended Waves

### Wave 0: Semantic Lock

**Stories:** `30.1` then `30.2`

**Objective:**
- Make `review` semantics explicit with `reviewPhase`
- Remove the manual no-plan bootstrap from `review`
- Make `pause`, `resume`, and `final_approval` mutually exclusive

**Why not parallelize this wave:**
- `30.1` and `30.2` both touch the same core semantics and several of the same files:
  - `dashboard/convex/schema.ts`
  - `dashboard/convex/lib/readModels.ts`
  - `dashboard/convex/lib/taskStatus.ts`
  - `dashboard/convex/lib/taskReview.ts`
  - `mc/runtime/workers/review.py`
  - `mc/contexts/planning/negotiation.py`

**Recommended staffing:**
- 1 lead implementer
- 1 reviewer validating state semantics and tests

**Merge gate:**
- No code path may still infer review meaning primarily from `awaitingKickoff + steps`
- No paused task may be approvable as final completion

### Wave 1: Canonical Task Transition Foundation

**Stories:** `30.3`

**Objective:**
- Add `stateVersion`
- Create the canonical CAS-based task transition kernel
- Freeze the task transition API for the rest of the refactor

**Why this should stay isolated:**
- This is the contract every later task-writer migration will depend on
- It touches the highest-conflict files:
  - `dashboard/convex/schema.ts`
  - `dashboard/convex/tasks.ts`
  - `dashboard/convex/lib/taskLifecycle.ts`
  - `dashboard/convex/lib/taskTransitions.ts`

**Recommended staffing:**
- 1 senior implementer
- 1 reviewer focused on API shape and conflict semantics

**Merge gate:**
- `tasks:transition` exists and is the canonical path
- `stateVersion` is initialized and incremented correctly

### Wave 2: Parallel Task-Writer Migration

**Stories:** `30.4` and `30.5` in parallel

**Objective:**
- Move all task lifecycle writes to the canonical transition path
- Split work by platform boundary

**Parallel lanes:**

**Lane A: Convex-side migration**
- Story `30.4`
- Ownership:
  - `dashboard/convex/lib/taskStatus.ts`
  - `dashboard/convex/lib/taskReview.ts`
  - `dashboard/convex/lib/taskPlanning.ts`
  - `dashboard/convex/messages.ts`
  - `dashboard/convex/interactiveSessions.ts`

**Lane B: Python/runtime-side migration**
- Story `30.5`
- Ownership:
  - `mc/bridge/repositories/tasks.py`
  - `mc/bridge/facade_mixins.py`
  - `mc/runtime/workers/inbox.py`
  - `mc/runtime/workers/planning.py`
  - `mc/runtime/workers/kickoff.py`
  - `mc/contexts/execution/executor.py`
  - `mc/contexts/execution/step_dispatcher.py`

**Coordination note:**
- Lane B must consume the API frozen in `30.3`
- Lane A and Lane B should agree up front on the exact bridge payload and conflict/no-op handling

**Recommended staffing:**
- 2 implementers, one per lane
- 1 reviewer/integrator

**Merge gate:**
- No normal task lifecycle path still depends on raw `tasks:updateStatus`

### Wave 3: Step Transition Core

**Stories:** `30.6`

**Objective:**
- Add the canonical step transition kernel
- Remove parent-task lifecycle authority from `steps.ts`
- Replace generic step `review` pauses with `waiting_human`

**Why not parallelize this wave widely:**
- It changes the second half of the lifecycle model and touches another hotspot:
  - `dashboard/convex/schema.ts`
  - `dashboard/convex/steps.ts`
  - `mc/contexts/interaction/service.py`
  - `mc/contexts/conversation/ask_user/handler.py`
  - `mc/contexts/interactive/supervisor.py`

**Recommended staffing:**
- 1 lead implementer
- 1 reviewer focused on task/step ownership boundaries

**Merge gate:**
- `steps.ts` no longer directly owns parent task lifecycle transitions
- ask-user and interactive pause paths use `waiting_human`

### Wave 4: Reliability Infrastructure

**Stories:** `30.7`

**Objective:**
- Add runtime claims
- Add idempotency receipts
- Make retries safe for messages, activities, and transitions

**Why keep this mostly isolated:**
- It overlaps with schema, bridge retry behavior, and write-heavy Convex paths
- If this runs while task/step transition APIs are still moving, we risk baking idempotency into the wrong interface

**Recommended staffing:**
- 1 infrastructure-focused implementer
- 1 reviewer focused on retry semantics

**Merge gate:**
- Duplicate retries do not duplicate covered side effects
- Claims and receipts exist in Convex

### Wave 5: Parallel Runtime Cleanup

**Stories:** `30.8` and `30.9` in parallel

**Objective:**
- Make workers claim-aware
- Remove execution-state mirroring from `executionPlan`

**Parallel lanes:**

**Lane A: Worker and watcher claim-awareness**
- Story `30.8`
- Ownership:
  - `mc/runtime/orchestrator.py`
  - `mc/runtime/workers/*.py`
  - `mc/contexts/conversation/mentions/watcher.py`
  - `mc/contexts/conversation/ask_user/watcher.py`
  - `mc/contexts/planning/supervisor.py`

**Lane B: Execution-plan cleanup and dashboard overlay**
- Story `30.9`
- Ownership:
  - `dashboard/convex/steps.ts`
  - `dashboard/convex/lib/taskLifecycle.ts`
  - `dashboard/features/tasks/components/TaskCard.tsx`
  - `dashboard/features/tasks/components/ExecutionPlanTab.tsx`
  - `dashboard/features/tasks/hooks/useTaskDetailView.ts`

**Why these can run in parallel:**
- Lane A is runtime/worker correctness
- Lane B is data-model/read-model cleanup
- The only shared dependency is that `30.6` and `30.7` must be merged first

**Recommended staffing:**
- 2 implementers, one per lane
- 1 reviewer/integrator

**Merge gate:**
- Local `_known_*` and `_seen_*` sets are no longer correctness barriers
- `executionPlan` is no longer the source of live runtime status

## Suggested Team Shape

### Lean team: 2 engineers

- Engineer 1 owns semantic/kernel waves: `30.1`, `30.2`, `30.3`, `30.6`
- Engineer 2 owns migration/infrastructure waves: `30.4`, `30.5`, `30.7`, `30.8`, `30.9`
- Parallelism starts in Wave 2 and Wave 5 only

### Balanced team: 3 engineers

- Engineer 1: semantic core and task kernel
- Engineer 2: Convex/runtime migration
- Engineer 3: infrastructure and later cleanup
- Best fit for the wave plan above

### Aggressive team: 4 engineers

- Only recommended after Wave 1 is merged
- Split Wave 2 into two lanes, Wave 5 into two lanes, plus one floating integrator/reviewer
- Do not try to split Wave 0, Wave 1, or Wave 3 across multiple implementers

## Practical Recommendation

If the goal is speed with low integration risk, use this sequence:

1. Wave 0 sequential
2. Wave 1 sequential
3. Wave 2 parallel
4. Wave 3 sequential
5. Wave 4 sequential
6. Wave 5 parallel

This gives parallel throughput exactly where the contracts are already stable, and avoids the highest-risk mistake in this refactor: parallelizing too early around `review`, `tasks.ts`, `steps.ts`, and the bridge contract.
