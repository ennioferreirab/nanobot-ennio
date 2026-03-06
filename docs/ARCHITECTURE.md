# Mission Control Architecture

## Overview

Mission Control (MC) is a multi-agent orchestration platform. The Python
backend (`mc/`) manages agent lifecycle, task planning, step execution, and
communication with the Convex database. The frontend (`dashboard/`) is a
Next.js + Convex real-time dashboard.

## Module Dependency Diagram

```
boot.py
  |
  v
mc/gateway.py (AgentGateway, sync_agent_registry, run_gateway)
  |
  +---> mc/orchestrator.py  (TaskOrchestrator, lead-agent routing)
  +---> mc/timeout_checker.py
  +---> mc/yaml_validator.py
  |
  |  (function-scope imports, deferred to avoid circular deps)
  +- - -> mc/executor.py       (TaskExecutor, agent subprocess mgmt)
  +- - -> mc/step_dispatcher.py (step dispatch, dependency resolution)
  +- - -> mc/planner.py         (TaskPlanner, LLM-based plan generation)
  +- - -> mc/plan_materializer.py (plan -> Convex steps)
  |
  v
mc/bridge.py  (ConvexBridge -- single Convex SDK integration point)
  |
  v
mc/types.py   (shared enums, dataclasses, constants)
mc/state_machine.py (task + step state transition validation)
```

### Key rules

- **Foundation layer** (`types`, `bridge`, `state_machine`, `thread_context`)
  must never import from `mc.gateway`. Dependencies flow downward only.
- **`mc.bridge`** is the sole Convex SDK consumer. All other modules interact
  with Convex through the bridge. Its only mc-internal dependency is `mc.types`
  (at top level).
- **Circular dependency avoidance**: `mc.gateway` imports `mc.orchestrator` at
  top level, so `mc.orchestrator` must use function-scope imports for any
  gateway access. Same pattern applies between gateway and executor.
- These rules are enforced by `tests/mc/test_architecture.py`.

## Data Flow

```
User request (dashboard / CLI)
  |
  v
Convex mutation (tasks:create)
  |
  v
ConvexBridge.subscribe() --> AgentGateway polling loop
  |
  v
TaskOrchestrator.route_task()
  |  (assigns agent, creates execution plan)
  v
TaskPlanner.plan() --> PlanMaterializer.materialize()
  |  (creates steps in Convex)
  v
StepDispatcher.dispatch_ready_steps()
  |
  v
TaskExecutor._run_agent_on_task()
  |  (spawns nanobot / claude-code subprocess)
  v
Agent completes step --> bridge.update_step_status()
  |
  v
StepDispatcher checks dependencies --> dispatches next steps
  |
  v
All steps done --> bridge.update_task_status("done")
```

## Frontend Architecture

```
dashboard/
  app/              -- Next.js app router pages
  components/       -- React components (KanbanBoard, TaskDetailSheet, ...)
  hooks/            -- Shared React hooks (useDocumentFetch, useSelectableAgents)
  convex/           -- Convex schema, queries, mutations
  lib/              -- Shared utilities, types, constants
  tests/            -- Vitest test files
```

### Frontend rules

- Feature components (`KanbanBoard`, `TaskDetailSheet`) currently use
  `useQuery`/`useMutation` directly. The aspiration is to extract these
  into custom hooks so components focus on rendering.
- Hook files (`hooks/`) must not import from `components/` (no upward deps).
- These rules are documented in `dashboard/tests/architecture.test.ts`.

## State Machines

Task and step lifecycles are governed by state machines defined in:

- **Python**: `mc/state_machine.py` (pre-validation before Convex mutations)
- **Convex**: `dashboard/convex/tasks.ts` and `dashboard/convex/steps.ts`
  (authoritative server-side validation)

Task states: `planning -> review -> in_progress -> done`
             (with `crashed`, `retrying`, `inbox`, `assigned` branches)

Step states: `planned -> assigned -> running -> completed`
             (with `blocked`, `crashed`, `waiting_human` branches)

## ADR: Codebase Structure

### Context

The MC codebase started as a monolithic `gateway.py` that handled agent
registration, task routing, step dispatch, and subprocess management. As
features grew (LLM planning, step dependencies, claude-code backend, chat,
mentions), the file exceeded 1500 lines and became difficult to navigate.

### Decision

Extract cohesive concerns into focused modules while keeping `gateway.py`
as the top-level orchestration entry point:

| Module | Responsibility |
|--------|---------------|
| `gateway.py` | Agent registry sync, gateway main loop, AgentGateway class |
| `bridge.py` | Convex SDK integration (queries, mutations, subscriptions) |
| `types.py` | Shared enums, dataclasses, type definitions |
| `orchestrator.py` | Lead-agent task routing and delegation |
| `executor.py` | Agent subprocess lifecycle (nanobot + claude-code) |
| `step_dispatcher.py` | Step dispatch with dependency resolution |
| `planner.py` | LLM-based execution plan generation |
| `plan_materializer.py` | Plan-to-Convex-steps materialization |
| `state_machine.py` | State transition validation |
| `thread_context.py` | Thread context building for agent prompt injection |
| `process_manager.py` | Low-level subprocess management |
| `mention_handler.py` | @mention detection and routing |
| `chat_handler.py` | Agent chat message processing |
| `hooks/` | Lifecycle hooks (ask-user, plan negotiation) |
| `memory/` | Agent memory search and consolidation |
| `skills/` | Skill distribution and sync |

### Consequences

- Each module has a clear, testable responsibility
- Circular dependencies are managed via function-scope imports
- The bridge remains the single Convex integration point
- Architecture guardrails (`test_architecture.py`) prevent regression
