# Task Lifecycle Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Convex the unambiguous source of truth for task and step lifecycle, starting by simplifying review semantics and removing the most likely race windows.

**Architecture:** Keep runtime coordination in `mc/runtime`, move lifecycle authority into explicit Convex transition helpers, and make Python workers operate through compare-and-set transitions plus persistent claims instead of snapshot-only polling and process-local dedupe. Preserve the current board UX initially by keeping `task.status` coarse-grained while making ambiguous review sub-states explicit.

**Tech Stack:** Convex schema/mutations/queries, TypeScript lifecycle helpers, Python bridge/runtime workers, Next.js task UI, vitest, pytest.

---

## Confirmed Findings

Current line numbers below are from HEAD on `2026-03-16`.

1. `task.status="review"` is overloaded with at least four business meanings.
   - Pre-kickoff plan review: `mc/runtime/workers/planning.py:255-285`, `dashboard/convex/lib/taskStatus.ts:70-134`
   - Execution pause / ask-user pause: `dashboard/convex/lib/taskStatus.ts:8-68`, `mc/contexts/interaction/service.py:268-343`, `mc/contexts/conversation/ask_user/handler.py:73-118`, `mc/contexts/interactive/supervisor.py:220-260`
   - Final completion approval: `mc/application/execution/completion_status.py:10-16`, `mc/contexts/execution/step_dispatcher.py:278-296`, `dashboard/convex/lib/taskReview.ts:102-147`
   - Manual task bootstrap before the first plan exists: `mc/contexts/planning/negotiation.py:139-146`, `mc/contexts/planning/negotiation.py:571-595`

2. The UI currently infers review sub-states indirectly instead of reading an explicit field.
   - `dashboard/convex/lib/readModels.ts:84-116` derives behavior from `awaitingKickoff` plus presence of non-completed steps.
   - `dashboard/features/tasks/components/PlanReviewPanel.tsx:120-137` switches copy off `awaitingKickoff`.
   - `dashboard/features/tasks/components/TaskCard.tsx:53-65` shows approve/kickoff behavior from `awaitingKickoff`.

3. `task.status` has multiple writers in both Convex and Python.
   - Convex mutations/helpers: `dashboard/convex/lib/taskStatus.ts:8-134`, `dashboard/convex/lib/taskReview.ts:16-337`, `dashboard/convex/messages.ts:318-324`, `dashboard/convex/messages.ts:568-589`, `dashboard/convex/steps.ts:93-168`, `dashboard/convex/steps.ts:628-656`
   - Python runtime/context flows: `mc/runtime/workers/inbox.py:124-129`, `mc/runtime/workers/planning.py:227-233`, `mc/runtime/workers/planning.py:259-266`, `mc/runtime/workers/kickoff.py:178-184`, `mc/contexts/execution/executor_routing.py:43-49`, `mc/contexts/execution/executor.py:226-233`, `mc/contexts/execution/executor.py:630-636`, `mc/contexts/execution/step_dispatcher.py:260-285`, `mc/contexts/execution/step_dispatcher.py:587-593`, `mc/contexts/conversation/ask_user/handler.py:73-118`, `mc/contexts/interactive/supervisor.py:191-279`

4. `step.status` also has multiple writers.
   - Convex: `dashboard/convex/steps.ts:328-413`, `dashboard/convex/steps.ts:416-455`, `dashboard/convex/steps.ts:463-660`
   - Python: `mc/contexts/execution/step_dispatcher.py:398-546`, `mc/contexts/interaction/service.py:281-289`, `mc/contexts/interaction/service.py:335-343`, `mc/contexts/conversation/ask_user/handler.py:80-108`, `mc/contexts/interactive/supervisor.py:205-246`, `mc/contexts/interactive/supervisor.py:283-283`

5. Child step mutations currently reconcile parent task status directly.
   - `dashboard/convex/steps.ts:93-168` computes the next parent status from child steps.
   - `dashboard/convex/steps.ts:406-412` and `dashboard/convex/steps.ts:580-586` call that reconciler on every step transition.

6. Runtime capture is polling-based with process-local dedupe, not event- or claim-based.
   - Polling subscriptions: `mc/bridge/subscriptions.py:50-166`
   - Task loops by status: `mc/runtime/orchestrator.py:198-256`, `mc/contexts/execution/executor.py:247-270`, `mc/contexts/planning/supervisor.py:121-147`
   - In-memory dedupe: `mc/runtime/workers/inbox.py:23-37`, `mc/runtime/workers/planning.py:49-61`, `mc/runtime/workers/review.py:35-46`, `mc/runtime/workers/kickoff.py:46-71`, `mc/contexts/execution/executor.py:156-156`, `mc/contexts/conversation/mentions/watcher.py:70-70`, `mc/contexts/conversation/ask_user/watcher.py:32-32`

7. There is no task/step `stateVersion`, no compare-and-set lifecycle mutation, and no persisted runtime claim/lease in the schema.
   - `dashboard/convex/schema.ts:108-199` has no lifecycle versioning or claim fields.
   - `dashboard/convex/tasks.ts:575-585` and `dashboard/convex/steps.ts:328-413` accept plain status updates.
   - `mc/bridge/__init__.py:95-134` retries mutations generically with no idempotency contract.

8. `executionPlan` is being used as both intended plan and runtime state mirror.
   - Step status mirroring: `dashboard/convex/steps.ts:21-55`, `dashboard/convex/steps.ts:119-125`, `dashboard/convex/steps.ts:509-519`
   - Plan status forced to completed on task completion: `dashboard/convex/lib/taskLifecycle.ts:198-217`
   - UI still reads plan-step status directly for progress in places: `dashboard/features/tasks/components/TaskCard.tsx:58-63`

9. `@mention` and operational delegation are already separate in code.
   - Mention path does not change task status: `dashboard/convex/messages.ts:464-523`, `mc/contexts/conversation/service.py:259-267`
   - Operational delegation is `sendThreadMessage`: `dashboard/convex/messages.ts:525-602`
   - Mention handling is global polling plus thread reply: `mc/contexts/conversation/mentions/watcher.py:47-187`, `mc/contexts/conversation/mentions/handler.py:134-499`

## Recommended Direction

1. Keep `task.status` as the coarse-grained board status for the first refactor, but add explicit lifecycle fields instead of inferring meaning from `awaitingKickoff` and live steps.
2. Make `review` semantics explicit through `reviewPhase`, not through more implicit combinations.
3. Move the manual "no plan yet" bootstrap case out of `review`; it should live in `inbox` or `planning` until a concrete plan exists.
4. Reserve `step.status` for execution lifecycle; stop using `step.status="review"` as a generic pause bucket.
5. Make a single Convex transition helper the only legal writer of `task.status`.
6. Treat `executionPlan` as desired structure, not live execution state.
7. Add persistent claims and idempotency so polling can remain temporarily without remaining unsafe.

## Proposed Concrete State Model

### Task

- Keep `status` for board movement: `inbox`, `planning`, `assigned`, `in_progress`, `review`, `done`, `retrying`, `failed`, `crashed`, `deleted`
- Add `reviewPhase?: "plan_review" | "execution_pause" | "final_approval"`
- Manual tasks without a concrete plan should not use `status="review"`; keep them in `inbox` or `planning` until the first real plan is created
- Add `stateVersion: number`

### Step

- Keep execution statuses, but deprecate use of `review` as a pause bucket
- Route human/interactive pauses through `waiting_human`
- Keep workflow semantics on `workflowStepType === "review"`
- Add `stateVersion: number`

### Runtime coordination

- Add persistent claim storage for worker ownership
- Add idempotency receipts for mutations that can be retried safely

## Phase 1: Make Review Semantics Explicit

**Why first:** This is the highest-value simplification and removes the worst ambiguity without requiring the whole runtime rewrite first.

**Files:**
- Modify: `dashboard/convex/schema.ts:108-199`
- Modify: `mc/types.py:84-110`
- Modify: `dashboard/convex/lib/readModels.ts:84-116`
- Modify: `dashboard/convex/lib/taskStatus.ts:8-134`
- Modify: `dashboard/convex/lib/taskReview.ts:102-249`
- Modify: `dashboard/convex/messages.ts:286-364`
- Modify: `mc/application/execution/completion_status.py:10-16`
- Modify: `mc/runtime/workers/planning.py:255-285`
- Modify: `mc/runtime/workers/review.py:48-123`
- Modify: `mc/contexts/planning/negotiation.py:571-855`
- Modify: `mc/contexts/conversation/intent.py:57-101`
- Modify: `dashboard/features/tasks/components/PlanReviewPanel.tsx:120-137`
- Modify: `dashboard/features/tasks/components/TaskCard.tsx:53-65`
- Test: `dashboard/convex/tasks.test.ts`
- Test: `dashboard/convex/lib/readModels.test.ts`
- Test: `dashboard/convex/messages.test.ts`
- Test: `tests/mc/services/test_conversation_intent.py`
- Test: `tests/mc/runtime/test_planning_worker_ai_workflow.py`

**Implementation notes:**
- Replace implicit `awaitingKickoff + hasNonCompletedSteps` inference with explicit `reviewPhase`.
- Keep `awaitingKickoff` as a temporary compatibility shim only during migration; do not add new logic that depends on it.
- Change completion logic so the runtime requests `reviewPhase="final_approval"` explicitly instead of returning bare `TaskStatus.REVIEW`.
- Manual task bootstrap should stop using `review` as a holding state before the first plan exists. Route that case through `inbox` or `planning`, and only enter `reviewPhase="plan_review"` once there is an actual plan to approve.

## Phase 2: Centralize Task Lifecycle Transitions

**Why second:** This establishes a single owner for `task.status` without yet changing every worker strategy.

**Files:**
- Create: `dashboard/convex/lib/taskTransitions.ts`
- Modify: `dashboard/convex/tasks.ts:456-585`
- Modify: `dashboard/convex/lib/taskStatus.ts:8-134`
- Modify: `dashboard/convex/lib/taskReview.ts:16-337`
- Modify: `dashboard/convex/messages.ts:318-324`
- Modify: `dashboard/convex/messages.ts:568-589`
- Modify: `mc/bridge/repositories/tasks.py:26-48`
- Modify: `mc/bridge/facade_mixins.py:12-23`
- Modify: `mc/runtime/workers/inbox.py:101-129`
- Modify: `mc/runtime/workers/planning.py:227-285`
- Modify: `mc/runtime/workers/kickoff.py:171-190`
- Modify: `mc/contexts/execution/executor_routing.py:43-49`
- Modify: `mc/contexts/execution/executor.py:226-233`
- Modify: `mc/contexts/execution/executor.py:626-636`
- Modify: `mc/contexts/execution/step_dispatcher.py:257-295`
- Test: `dashboard/convex/tasks.test.ts`
- Test: `tests/mc/bridge/test_repositories.py`

**Implementation notes:**
- Replace generic `tasks:updateStatus` usage with a richer transition contract:
  - `fromStatus`
  - `expectedStateVersion`
  - `toStatus`
  - `reviewPhase`
  - `reason`
  - `idempotencyKey`
- Stale snapshot conflicts should become explicit no-op/conflict returns, not silent overwrites.

## Phase 3: Centralize Step Lifecycle Transitions And Remove Parent Status Patching From Child Code

**Why third:** This removes the current split-brain where `steps.ts` owns part of the parent task lifecycle.

**Files:**
- Create: `dashboard/convex/lib/stepTransitions.ts`
- Modify: `dashboard/convex/steps.ts:21-168`
- Modify: `dashboard/convex/steps.ts:328-413`
- Modify: `dashboard/convex/steps.ts:463-660`
- Modify: `dashboard/convex/lib/stepLifecycle.ts:20-64`
- Modify: `mc/bridge/repositories/steps.py:59-72`
- Modify: `mc/bridge/facade_mixins.py:67-71`
- Modify: `mc/contexts/execution/step_dispatcher.py:377-546`
- Modify: `mc/contexts/interaction/service.py:268-343`
- Modify: `mc/contexts/conversation/ask_user/handler.py:73-118`
- Modify: `mc/contexts/interactive/supervisor.py:183-279`
- Test: `dashboard/convex/steps.test.ts`
- Test: `tests/mc/test_interactive_runtime.py`
- Test: `tests/mc/application/execution/test_post_processing.py`

**Implementation notes:**
- Remove direct `ctx.db.patch(taskId, { status: ... })` from `reconcileParentTaskAfterStepChange`.
- If a step transition implies a parent transition, compute that intent and route it through the canonical task transition helper.
- Replace `step.status="review"` with `waiting_human` for ask-user and interactive pause flows.

## Phase 4: Add `stateVersion`, Persistent Claims, And Idempotency Receipts

**Why fourth:** This hardens the system against restart, duplicate loops, and bridge retries without waiting for a full runtime redesign.

**Files:**
- Modify: `dashboard/convex/schema.ts:108-256`
- Create: `dashboard/convex/runtimeClaims.ts`
- Create: `dashboard/convex/runtimeReceipts.ts`
- Modify: `dashboard/convex/messages.ts:125-203`
- Modify: `dashboard/convex/messages.ts:243-273`
- Modify: `dashboard/convex/messages.ts:472-602`
- Modify: `mc/bridge/__init__.py:95-134`
- Modify: `mc/bridge/repositories/messages.py:34-166`
- Modify: `mc/bridge/repositories/tasks.py:26-90`
- Modify: `mc/bridge/repositories/steps.py:59-91`
- Modify: `mc/bridge/subscriptions.py:50-166`
- Test: `dashboard/convex/messages.test.ts`
- Test: `dashboard/convex/tasks.test.ts`
- Test: `dashboard/convex/steps.test.ts`
- Test: `tests/mc/bridge/test_retry.py`
- Test: `tests/mc/bridge/test_subscriptions.py`

**Implementation notes:**
- Add `stateVersion` to `tasks` and `steps`, initialized to `1` and incremented on every lifecycle transition.
- Add `runtimeClaims` table keyed by `(claimKind, entityType, entityId)` with lease expiration.
- Add `runtimeReceipts` table keyed by idempotency key for message/activity/transition effects.
- Bridge retry logic must reuse the same idempotency key across attempts.

## Phase 5: Stop Mirroring Live Step Status Into `executionPlan`

**Why fifth:** Runtime state is currently duplicated between `steps` and `executionPlan.steps[*].status`, which creates another source of ambiguity.

**Files:**
- Modify: `dashboard/convex/steps.ts:21-55`
- Modify: `dashboard/convex/steps.ts:119-125`
- Modify: `dashboard/convex/steps.ts:509-519`
- Modify: `dashboard/convex/lib/taskLifecycle.ts:198-217`
- Modify: `dashboard/convex/lib/taskDetailView.ts:44-106`
- Modify: `dashboard/features/tasks/components/TaskCard.tsx:58-63`
- Modify: `dashboard/features/tasks/components/ExecutionPlanTab.tsx:315-325`
- Modify: `dashboard/features/tasks/hooks/useTaskDetailView.ts:137-177`
- Test: `dashboard/convex/lib/readModels.test.ts`
- Test: `dashboard/convex/tasks.test.ts`

**Implementation notes:**
- `executionPlan` should remain the desired graph and metadata only.
- Build read-model overlays from live `steps` for progress and current execution state.
- `ExecutionPlanTab` already has live overlay logic; extend that path and remove the fallback reliance on stored plan-step status.

## Phase 6: Replace Process-Local Dedupe With Claim-Aware Workers

**Why sixth:** Once claims and CAS exist, the runtime can stop depending on `_known_*` and `_seen_*` correctness.

**Files:**
- Modify: `mc/runtime/orchestrator.py:168-256`
- Modify: `mc/runtime/workers/inbox.py:23-39`
- Modify: `mc/runtime/workers/planning.py:49-63`
- Modify: `mc/runtime/workers/review.py:35-46`
- Modify: `mc/runtime/workers/kickoff.py:46-79`
- Modify: `mc/contexts/execution/executor.py:156-270`
- Modify: `mc/contexts/planning/supervisor.py:45-147`
- Modify: `mc/contexts/conversation/mentions/watcher.py:66-187`
- Modify: `mc/contexts/conversation/ask_user/watcher.py:32-135`
- Modify: `mc/runtime/timeout_checker.py:58-108`
- Test: `tests/mc/runtime/test_inbox_worker_ai_workflow.py`
- Test: `tests/mc/runtime/test_planning_worker_ai_workflow.py`
- Test: `tests/mc/services/test_conversation_gateway_integration.py`

**Implementation notes:**
- Worker loops should claim work in Convex before side effects.
- Duplicate local sets may remain temporarily as optimization only, not as correctness mechanisms.
- `KickoffResumeWorker` should stop using `_processed_signatures` as a correctness barrier.

## Recommended Order Of Delivery

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5
6. Phase 6

This order gives the smallest safe cut:
- First remove review ambiguity.
- Then enforce single-writer transitions.
- Then harden replay and restart behavior.
- Then clean up duplicated runtime state and worker heuristics.

## Minimum Safe Cut

If the goal is to eliminate the most probable races without rewriting the whole runtime, stop after Phases 1 through 4.

That minimum cut gives:
- explicit review meaning
- compare-and-set lifecycle transitions
- single logical owner for `task.status`
- persistent claims and idempotent side effects

## Verification Gates

Run after each phase:

- `uv run ruff format --check mc`
- `uv run ruff check mc`
- `uv run pytest tests/mc/test_architecture.py tests/mc/test_module_reorganization.py tests/mc/infrastructure/test_boundary.py`
- `uv run pytest tests/mc/bridge/test_retry.py tests/mc/bridge/test_subscriptions.py`
- `npm run format:file:check -- dashboard/convex/schema.ts dashboard/convex/tasks.ts dashboard/convex/steps.ts dashboard/convex/messages.ts`
- `npm run lint:file -- dashboard/convex/schema.ts dashboard/convex/tasks.ts dashboard/convex/steps.ts dashboard/convex/messages.ts`
- `npm run test:architecture`
- `npm run vitest -- dashboard/convex/tasks.test.ts dashboard/convex/steps.test.ts dashboard/convex/messages.test.ts`

## Notes For Execution

- Do not introduce top-level status-enum churn as the first move. `reviewPhase` is the lower-risk way to remove ambiguity while keeping board/status queries stable.
- Do not keep adding logic that derives review meaning from `awaitingKickoff`, child step presence, or thread metadata.
- Do not let new runtime code patch `tasks.status` or `steps.status` directly; all writes should go through transition helpers once Phase 2 starts.
