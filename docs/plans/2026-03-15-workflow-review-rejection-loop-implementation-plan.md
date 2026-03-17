# Workflow Review Rejection Loop Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement workflow review-step verdict parsing, deterministic rejection routing back to `onRejectStepId`, and preserved context across rejected-step re-execution without losing thread history.

**Architecture:** Extend the existing workflow step runtime rather than introducing a separate workflow engine. Preserve `review` as an agent-run step type, add explicit review-result parsing and lifecycle routing driven by `reviewSpecId` and `onRejectStepId`, and keep rework/re-review inside the existing task thread and step state machine.

**Tech Stack:** Python runtime (`mc/contexts/execution`, `mc/application/execution`), Convex mutations/queries (`dashboard/convex`), shared workflow contract, pytest, vitest.

---

### Task 1: Lock the Runtime Contract with Failing Tests

**Files:**
- Modify: `tests/mc/runtime/test_squad_workflow_dispatch.py`
- Modify: `tests/mc/test_step_dispatcher.py`
- Modify: `dashboard/convex/steps.test.ts`
- Modify: `tests/mc/application/execution/test_context_builder.py`

**Step 1: Write the failing Python tests for review-step routing**

Add tests that assert:

- workflow `review` steps with `assigned_agent != "human"` do not gate to `waiting_human`
- a parsed `approved` verdict completes the review step
- a parsed `rejected` verdict blocks the review step and reassigns `onRejectStepId`

**Step 2: Run the Python tests to verify failure**

Run:

```bash
uv run pytest tests/mc/runtime/test_squad_workflow_dispatch.py tests/mc/test_step_dispatcher.py -v
```

Expected: FAIL because verdict parsing and rejection routing do not exist yet.

**Step 3: Write the failing Convex tests for gate/manual behavior**

Add tests that assert:

- non-human `checkpoint` / workflow gate steps can be completed through the intended gate lifecycle without getting stuck in `running`
- review-loop reroute helpers patch the rejected target and block the review step

**Step 4: Run the Convex tests to verify failure**

Run:

```bash
cd dashboard && npm run test -- convex/steps.test.ts
```

Expected: FAIL because gate completion and review reroute behavior are incomplete.

**Step 5: Write the failing context-builder test**

Add a test asserting the next execution context explicitly includes latest review feedback / latest rejected attempt when a step is re-run after review rejection.

**Step 6: Run the context-builder test to verify failure**

Run:

```bash
uv run pytest tests/mc/application/execution/test_context_builder.py -v
```

Expected: FAIL because rejection-specific prompt enrichment does not exist yet.

**Step 7: Commit the test-only baseline**

```bash
git add tests/mc/runtime/test_squad_workflow_dispatch.py tests/mc/test_step_dispatcher.py tests/mc/application/execution/test_context_builder.py dashboard/convex/steps.test.ts
git commit -m "test: lock workflow review rejection loop behavior"
```

### Task 2: Enforce Valid Workflow Review-Step Definitions

**Files:**
- Modify: `dashboard/convex/lib/workflowExecutionCompiler.ts`
- Modify: `dashboard/convex/lib/workflowExecutionCompiler.test.ts`
- Modify: `mc/contexts/planning/materializer.py`
- Modify: `tests/mc/contexts/planning/test_workflow_plan_materializer.py`

**Step 1: Write the failing compiler tests**

Add tests that reject workflow `review` steps missing:

- `agentId`
- `reviewSpecId`
- `onReject`

**Step 2: Run the compiler tests to verify failure**

Run:

```bash
cd dashboard && npm run test -- convex/lib/workflowExecutionCompiler.test.ts
```

Expected: FAIL because the compiler currently accepts incomplete review-step definitions.

**Step 3: Implement minimal compiler validation**

Update the workflow compiler so `review` steps require `agentId`, `reviewSpecId`, and `onReject`, while `human` / `checkpoint` remain non-agent gates.

**Step 4: Preserve and verify materialized metadata**

Keep `reviewSpecId` and `onRejectStepId` flowing through `PlanMaterializer`; expand tests if needed so the payload contract stays explicit.

**Step 5: Re-run relevant tests**

Run:

```bash
cd dashboard && npm run test -- convex/lib/workflowExecutionCompiler.test.ts
uv run pytest tests/mc/contexts/planning/test_workflow_plan_materializer.py -v
```

Expected: PASS

**Step 6: Commit**

```bash
git add dashboard/convex/lib/workflowExecutionCompiler.ts dashboard/convex/lib/workflowExecutionCompiler.test.ts mc/contexts/planning/materializer.py tests/mc/contexts/planning/test_workflow_plan_materializer.py
git commit -m "feat: validate workflow review-step contracts"
```

### Task 3: Separate Human Gates from Review-Agent Steps

**Files:**
- Modify: `mc/contexts/execution/step_dispatcher.py`
- Modify: `tests/mc/runtime/test_squad_workflow_dispatch.py`
- Modify: `dashboard/convex/steps.ts`
- Modify: `dashboard/convex/steps.test.ts`
- Modify: `dashboard/features/tasks/components/StepCard.tsx`

**Step 1: Write the failing gate-lifecycle tests**

Add tests for:

- `human` and `checkpoint` steps being the only types that enter `waiting_human`
- workflow gate steps not getting stuck after Accept when they are not literally assigned to `"human"`

**Step 2: Run the tests to verify failure**

Run:

```bash
uv run pytest tests/mc/runtime/test_squad_workflow_dispatch.py -v
cd dashboard && npm run test -- convex/steps.test.ts
```

Expected: FAIL because current gate handling mixes workflow gate metadata with `assignedAgent === "human"` assumptions.

**Step 3: Implement minimal gate fix**

Update runtime and Convex gate lifecycle so:

- only `human` / `checkpoint` enter `waiting_human`
- gate completion is valid for workflow-owned gates
- UI actions do not depend solely on `assignedAgent === "human"`

**Step 4: Re-run tests**

Run:

```bash
uv run pytest tests/mc/runtime/test_squad_workflow_dispatch.py -v
cd dashboard && npm run test -- convex/steps.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add mc/contexts/execution/step_dispatcher.py tests/mc/runtime/test_squad_workflow_dispatch.py dashboard/convex/steps.ts dashboard/convex/steps.test.ts dashboard/features/tasks/components/StepCard.tsx
git commit -m "fix: separate workflow human gates from review-agent steps"
```

### Task 4: Implement Structured Review Result Parsing

**Files:**
- Modify: `mc/application/execution/context_builder.py`
- Modify: `mc/contexts/execution/step_dispatcher.py`
- Create: `mc/domain/workflow/review_result.py`
- Create: `tests/mc/domain/test_review_result.py`
- Modify: `tests/mc/test_step_dispatcher.py`

**Step 1: Write the failing parser tests**

Create parser tests for:

- valid approved payload
- valid rejected payload
- malformed payload
- payload missing `verdict`

**Step 2: Run parser tests to verify failure**

Run:

```bash
uv run pytest tests/mc/domain/test_review_result.py -v
```

Expected: FAIL because the parser module does not exist.

**Step 3: Implement the parser**

Create `mc/domain/workflow/review_result.py` with a small typed parser that normalizes reviewer output into a contract with:

- `verdict`
- `issues`
- `strengths`
- `scores`
- `vetoes_triggered`
- `recommended_return_step`

Reject malformed outputs with a clear workflow error.

**Step 4: Inject review-specific prompt context**

Extend `ContextBuilder.build_step_context()` so review steps with `reviewSpecId` receive review-specific instructions and, for re-runs, an explicit `Previous review feedback` block.

**Step 5: Wire dispatcher parsing**

In `StepDispatcher`, detect `workflow_step_type == "review"`, parse the agent output through the review parser, and branch approval/rejection behavior from the parsed verdict rather than free-form text.

**Step 6: Re-run tests**

Run:

```bash
uv run pytest tests/mc/domain/test_review_result.py tests/mc/test_step_dispatcher.py tests/mc/application/execution/test_context_builder.py -v
```

Expected: PASS

**Step 7: Commit**

```bash
git add mc/domain/workflow/review_result.py tests/mc/domain/test_review_result.py mc/application/execution/context_builder.py mc/contexts/execution/step_dispatcher.py tests/mc/test_step_dispatcher.py tests/mc/application/execution/test_context_builder.py
git commit -m "feat: parse structured workflow review results"
```

### Task 5: Implement Rejection Routing and Re-Review Loop

**Files:**
- Modify: `mc/contexts/execution/step_dispatcher.py`
- Modify: `dashboard/convex/lib/stepLifecycle.ts`
- Modify: `dashboard/convex/steps.ts`
- Modify: `tests/mc/test_step_dispatcher.py`
- Modify: `dashboard/convex/steps.test.ts`

**Step 1: Write the failing reroute tests**

Add tests asserting that on review rejection:

- review step becomes `blocked`
- target step from `onRejectStepId` becomes `assigned`
- target step retains its identity
- when target step completes again, the blocked review step becomes dispatchable

**Step 2: Run the tests to verify failure**

Run:

```bash
uv run pytest tests/mc/test_step_dispatcher.py -v
cd dashboard && npm run test -- convex/steps.test.ts
```

Expected: FAIL because no such reroute exists yet.

**Step 3: Implement minimal lifecycle changes**

Add helper logic that:

- blocks the review step on rejection
- reassigns the rejected target step
- clears transient error/completion fields on the target step
- keeps the task in an active state

**Step 4: Re-run tests**

Run:

```bash
uv run pytest tests/mc/test_step_dispatcher.py -v
cd dashboard && npm run test -- convex/steps.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add mc/contexts/execution/step_dispatcher.py dashboard/convex/lib/stepLifecycle.ts dashboard/convex/steps.ts tests/mc/test_step_dispatcher.py dashboard/convex/steps.test.ts
git commit -m "feat: reroute rejected workflow review steps"
```

### Task 6: Preserve Rejection Context Across Re-Execution

**Files:**
- Modify: `mc/application/execution/context_builder.py`
- Modify: `mc/application/execution/thread_context.py`
- Modify: `tests/mc/application/execution/test_context_builder.py`
- Modify: `tests/mc/application/execution/test_thread_context_builder.py`

**Step 1: Write the failing prompt-preservation tests**

Add tests showing that a rejected step re-run receives:

- latest reviewer feedback
- previous rejected output summary
- normal thread history

**Step 2: Run the tests to verify failure**

Run:

```bash
uv run pytest tests/mc/application/execution/test_context_builder.py tests/mc/application/execution/test_thread_context_builder.py -v
```

Expected: FAIL because the current prompt relies only on generic thread windowing.

**Step 3: Implement explicit rejection-context enrichment**

Add a focused enrichment block for re-run steps so rejection-loop context is promoted into the prompt even when the generic 20-message window would otherwise drop it.

**Step 4: Re-run tests**

Run:

```bash
uv run pytest tests/mc/application/execution/test_context_builder.py tests/mc/application/execution/test_thread_context_builder.py -v
```

Expected: PASS

**Step 5: Commit**

```bash
git add mc/application/execution/context_builder.py mc/application/execution/thread_context.py tests/mc/application/execution/test_context_builder.py tests/mc/application/execution/test_thread_context_builder.py
git commit -m "feat: preserve review rejection context on step re-run"
```

### Task 7: Keep Provider-CLI Approval Events Out of Workflow Review Semantics

**Files:**
- Modify: `mc/contexts/interactive/supervisor.py`
- Modify: `mc/contexts/provider_cli/providers/codex.py`
- Modify: `tests/mc/test_interactive_supervisor.py`
- Modify: `tests/mc/provider_cli/test_codex_parser.py`

**Step 1: Write the failing supervision tests**

Add tests asserting that provider-CLI `approval_requested` does not masquerade as workflow human review semantics for workflow review steps.

**Step 2: Run the tests to verify failure**

Run:

```bash
uv run pytest tests/mc/test_interactive_supervisor.py tests/mc/provider_cli/test_codex_parser.py -v
```

Expected: FAIL or reveal incorrect coupling between provider approval pauses and workflow review status.

**Step 3: Implement minimal separation**

Keep provider approval/intervention events as live-session supervision concerns, not workflow review-step lifecycle transitions.

**Step 4: Re-run tests**

Run:

```bash
uv run pytest tests/mc/test_interactive_supervisor.py tests/mc/provider_cli/test_codex_parser.py -v
```

Expected: PASS

**Step 5: Commit**

```bash
git add mc/contexts/interactive/supervisor.py mc/contexts/provider_cli/providers/codex.py tests/mc/test_interactive_supervisor.py tests/mc/provider_cli/test_codex_parser.py
git commit -m "fix: decouple provider approval pauses from workflow review"
```

### Task 8: Run Baseline Verification

**Files:**
- Modify: none

**Step 1: Run Python formatting and lint checks**

Run:

```bash
uv run ruff format --check mc tests
uv run ruff check mc tests
```

Expected: PASS

**Step 2: Run Python guardrails**

Run:

```bash
uv run pytest tests/mc/test_architecture.py tests/mc/test_module_reorganization.py tests/mc/infrastructure/test_boundary.py
```

Expected: PASS

**Step 3: Run targeted Python regression suite**

Run:

```bash
uv run pytest tests/mc/runtime/test_squad_workflow_dispatch.py tests/mc/test_step_dispatcher.py tests/mc/application/execution/test_context_builder.py tests/mc/application/execution/test_thread_context_builder.py tests/mc/domain/test_review_result.py tests/mc/test_interactive_supervisor.py tests/mc/provider_cli/test_codex_parser.py -v
```

Expected: PASS

**Step 4: Run dashboard checks for touched files**

Run:

```bash
cd dashboard && npm run format:file:check -- convex/steps.ts convex/lib/stepLifecycle.ts convex/lib/workflowExecutionCompiler.ts features/tasks/components/StepCard.tsx
cd dashboard && npm run lint:file -- convex/steps.ts convex/lib/stepLifecycle.ts convex/lib/workflowExecutionCompiler.ts features/tasks/components/StepCard.tsx
cd dashboard && npm run test:architecture
cd dashboard && npm run test -- convex/steps.test.ts convex/lib/workflowExecutionCompiler.test.ts
```

Expected: PASS

**Step 5: Start the full MC stack for manual validation**

Run:

```bash
cp dashboard/.env.local .worktrees/codex/<branch>/dashboard/.env.local
cd .worktrees/codex/<branch>
PORT=3001 uv run nanobot mc start
```

Expected: app boots at `http://localhost:3001`

**Step 6: Validate the workflow loop manually**

Verify:

- review step runs on the assigned reviewer agent
- rejected review blocks itself and reassigns `onRejectStepId`
- the rejected step re-runs on the same task thread
- reviewer feedback remains visible in the thread
- review step re-runs after the corrected step completes
- explicit human/checkpoint gates still use `waiting_human`

**Step 7: Commit verification updates if needed**

```bash
git add .
git commit -m "test: verify workflow review rejection loop end-to-end"
```
