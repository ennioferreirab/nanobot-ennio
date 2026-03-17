# Design: Execution Plan Enhancements — Add Steps, Inline Chat, Resume

**Date:** 2026-03-05
**Epic:** 13 — Execution Plan Enhancements

## Problem

Currently, the Execution Plan tab is read-only during execution. Users can only modify plans:
- Via PlanEditor in edit mode (review/pre-kickoff only)
- Via ThreadInput chat at the bottom of TaskDetailSheet (disconnected from the plan view)

Once a plan finishes executing, the task is marked "done" and there's no way to extend it with new steps and resume. Users must create a new task to continue work.

## Solution

Three capabilities, delivered as 3 stories:

### 1. Add Steps Inline (Story 13-1)

An "Add Step" button directly on the ExecutionPlanTab, always visible (review, in_progress, done).

**In review (pre-kickoff):** Adds to the executionPlan JSON, re-renders in the flow graph. Works with existing PlanEditor infrastructure.

**In in_progress / done:** Creates a new step record directly in Convex with status "planned". The new step appears immediately in the flow graph. A quick-add form collects: title, description, assigned agent (dropdown), blocked_by (multi-select from existing steps).

**Backend:**
- New Convex mutation `steps.addStep` — creates a step record for an existing task, auto-assigns next order number, resolves blockedBy to real step IDs.
- Updates `tasks.executionPlan` JSON to include the new step (keeps plan and steps in sync).

### 2. Inline Lead-Agent Chat (Story 13-2)

A collapsible chat sidebar within the ExecutionPlanTab. Split layout: flow graph (left) + chat panel (right).

**Chat panel shows:**
- Messages filtered from the task thread: only `lead_agent_chat`, `lead_agent_plan`, and `user_message` types
- Input field at the bottom (reuses `postUserPlanMessage` mutation)

**Available in:** review (awaitingKickoff), in_progress, done (for adding steps via conversation).

The plan_negotiator backend already handles the LLM interaction — no backend changes needed for the chat itself. The only change is extending `plan_negotiator` to also handle tasks with status "done" (currently stops at in_progress).

**When the lead-agent proposes plan changes during "done" status:**
- New steps are added to the executionPlan JSON
- Steps are NOT auto-materialized (user must click Resume to start execution)

### 3. Resume Execution (Story 13-3)

A "Resume" button appears when:
- Task status is "done" AND there are steps with status "planned" (newly added)
- OR task status is "in_progress" with all steps completed/crashed AND new "planned" steps exist

**Flow:**
1. User adds new steps (via Add Step button or via lead-agent chat)
2. "Resume" button appears in the ExecutionPlanTab header
3. User clicks Resume
4. Backend materializes any unmaterialized steps, transitions task to "in_progress"
5. Orchestrator detects the new planned steps and dispatches them

**Backend:**
- Extend `tasks.resumeFromDone` mutation — transitions done → in_progress, materializes new planned steps
- Extend MC orchestrator to detect tasks transitioning back to in_progress and dispatch pending steps
- Extend `plan_negotiator._is_negotiable_status()` to include "done" tasks with execution plans

## Architecture

```
ExecutionPlanTab
├── Flow Graph (ReactFlow) — existing, unchanged
├── [+Add Step] button → AddStepForm (new)
│   └── Calls steps.addStep mutation
├── Chat Sidebar (new, collapsible)
│   ├── Filtered thread messages (lead_agent_chat/plan)
│   ├── Chat input → postUserPlanMessage
│   └── plan_negotiator handles LLM (existing)
└── [Resume] button (conditional, new)
    └── Calls tasks.resumeFromDone mutation
        └── Orchestrator dispatches new steps
```

## Data Flow

```
User adds step via UI
  → steps.addStep mutation (Convex)
  → New step record (status: planned)
  → ExecutionPlanTab re-renders with new node

User chats with lead-agent
  → postUserPlanMessage (Convex)
  → plan_negotiator detects message (MC)
  → LLM proposes changes
  → bridge.update_execution_plan (if update_plan)
  → ExecutionPlanTab re-renders

User clicks Resume
  → tasks.resumeFromDone mutation (Convex)
  → Task status: done → in_progress
  → Orchestrator detects new in_progress task
  → StepDispatcher dispatches planned steps
```

## Stories

| Story | Title | Size | Dependencies |
|-------|-------|------|-------------|
| 13-1 | Add Steps Inline on Execution Plan | Medium | None |
| 13-2 | Inline Lead-Agent Chat in Plan Tab | Medium | None |
| 13-3 | Resume Execution After Adding Steps | Medium | 13-1 |

Stories 13-1 and 13-2 are independent and can be developed in parallel.
Story 13-3 depends on 13-1 (needs the addStep mutation to exist).
