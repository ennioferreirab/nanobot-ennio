# Workflow Review Rejection Loop Design

**Goal:** Make workflow `review` steps execute as agent-owned review runs driven by `reviewSpecId`, with deterministic `onRejectStepId` routing and preserved thread context across re-execution.

**Status:** Approved for implementation planning on 2026-03-15.

---

## Problem

The current workflow runtime preserves review metadata on steps, but it does not execute the full review loop:

- `workflowStepType`, `reviewSpecId`, and `onRejectStepId` survive compilation/materialization.
- `review` steps are still treated too generically at runtime.
- there is no structured verdict parsing for reviewer output.
- there is no automatic rejection routing back to the rejected step.
- there is no explicit re-review loop that blocks the review step, re-runs the rejected step, and then returns to review.

There is also a separate bug where workflow human/checkpoint gates can enter `waiting_human` without being truly human-owned. That bug must be addressed in the implementation, but it is orthogonal to this design.

## Approved Runtime Model

### Step Type Semantics

- `agent`: normal runnable agent step.
- `human`: explicit human gate step.
- `checkpoint`: explicit human gate step.
- `review`: runnable reviewer-agent step.
- `system`: reserved for future use; no new behavior in this work unless required by tests.

Only `human` and `checkpoint` may enter `waiting_human`.

`review` must never be treated as a human gate unless the workflow author explicitly modeled a human/checkpoint step instead.

### Reviewer Ownership

The reviewer agent comes from the step itself.

- `review` steps must resolve execution ownership from `agentId` / `assignedAgent`.
- `reviewSpecId` defines the evaluation contract only.
- `reviewSpec.reviewerPolicy` must not dynamically choose the executor for workflow runtime.

### Review Output Contract

The reviewer must return a structured result. The runtime contract should support at least:

- `verdict`
- `issues`
- `strengths`
- `scores`
- `vetoesTriggered`
- `recommendedReturnStep`

Minimum required field for routing is `verdict`.

Accepted `verdict` values:

- `approved`
- `rejected`

`recommendedReturnStep` is advisory. The workflow runtime should use `onRejectStepId` as the canonical routing target for v1 of this loop. If the reviewer suggests a different target, that can be surfaced in feedback but should not override the workflow graph automatically in this change.

### Rejection Routing

When a `review` step returns `verdict = rejected`:

1. The current review step transitions to `blocked`.
2. The rejected target step identified by `onRejectStepId` transitions back to `assigned`.
3. The target step re-executes on the same task thread.
4. When the target step completes again, dependency resolution unblocks the same review step.
5. The same review step runs again and evaluates the latest result.

This is a re-execution of the existing runtime step instances, not creation of replacement steps.

### Approval Routing

When a `review` step returns `verdict = approved`:

1. The review step completes normally.
2. Normal dependency unblocking continues.
3. Downstream workflow steps proceed without human intervention unless a later explicit human/checkpoint step or task-level HITL gate requires it.

## Context Preservation Rules

Rejected-step re-execution must preserve context.

The implementation must keep these invariants:

- the task thread remains the single source of conversational history.
- re-running a rejected step must append new messages/events, not overwrite old ones.
- the previous rejected output remains in the thread.
- the reviewer feedback remains in the thread.
- the re-executed agent sees both the task thread history and predecessor context.

The current thread-context system already gives a strong base because step execution reads the task thread each time and injects it into the prompt. The implementation should strengthen this for rejection loops by explicitly surfacing the latest review feedback and most recent rejected attempt in the next execution prompt, rather than relying only on the generic 20-message window.

## State Transition Model

### Review Approval Path

- rejected step completes
- review step becomes assigned/runs
- review step returns `approved`
- review step becomes `completed`
- downstream dependents unblock

### Review Rejection Path

- rejected step completes
- review step becomes assigned/runs
- review step returns `rejected`
- review step becomes `blocked`
- `onRejectStepId` target becomes `assigned`
- target re-runs
- target completes
- blocked review step becomes `assigned`
- review step runs again

## Required Validation Rules

Workflow publishing or compilation must reject invalid review-step definitions.

For `workflowStepType == "review"`:

- `agentId` must be present
- `reviewSpecId` must be present
- `onRejectStepId` should be required for deterministic rejection routing in this loop

For `human` and `checkpoint`:

- no reviewer semantics
- no reviewer verdict parsing

## Non-Goals

- No creation of duplicate review steps per rejection cycle.
- No dynamic executor resolution from `reviewerPolicy`.
- No replacement of the task thread with per-attempt threads.
- No workflow graph mutation at runtime.
- No human approval semantics for reviewer-agent output except existing task-level HITL rules.

## Implementation Notes

- The workflow runtime already preserves `reviewSpecId` and `onRejectStepId`; implementation should consume that metadata instead of inferring behavior from agent names.
- The review loop should be implemented inside the existing dispatcher / step lifecycle, not as a second workflow state machine.
- Provider CLI approval/intervention events must remain separate from workflow review semantics.
