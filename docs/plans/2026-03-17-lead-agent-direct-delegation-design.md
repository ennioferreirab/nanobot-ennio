# Lead Agent Direct Delegation Design

**Goal:** Remove lead-agent planning for normal tasks, keep `ExecutionPlan` as a workflow-only concept, and turn the lead-agent into a direct delegation router.

**Status:** Approved for implementation planning on 2026-03-17.

---

## Problem

The current task flow mixes two different execution models:

- normal user-created tasks that should be routed to a single best executor
- workflow/squad tasks that legitimately need structured execution plans

Today the system routes both through lead-agent planning concepts. That creates ambiguity in three places:

- backend ownership, because `mc.contexts.planning` is handling both workflow planning and normal task routing
- task conversation intent, because non-workflow tasks can be pulled into `plan_chat` behavior
- dashboard UI, because task detail and execution views carry lead-agent plan review surfaces even when no robust workflow plan exists

The result is a blurry boundary between:

- workflow planning
- direct delegation
- human-assigned tasks

This design removes that ambiguity by making workflow the only owner of `ExecutionPlan` and redefining the lead-agent as a direct router for standard tasks.

## Approved Runtime Model

### Task Modes

Every task must belong to exactly one work mode:

- `ai_workflow`: workflow-owned execution with `ExecutionPlan`
- `direct_delegate`: normal task routed by the lead-agent to one executor

The invariant is:

- `ExecutionPlan` belongs only to `ai_workflow`
- `direct_delegate` tasks never receive lead-agent-generated plans

### Routing Modes

Every task may also carry a routing mode describing how the executor was chosen:

- `workflow`: executor comes from workflow compilation/materialization
- `lead_agent`: executor was selected by lead-agent routing
- `human`: operator explicitly sent the task to an agent from the dashboard

`routingMode` is orthogonal to task status. It exists to explain provenance, not lifecycle.

### Lead-Agent Responsibility

The lead-agent no longer plans normal tasks.

For `direct_delegate` tasks, it only:

1. receives the task after creation
2. queries an active agent registry view
3. selects the best registered executor
4. records the routing decision
5. assigns the task directly to that executor

The lead-agent is therefore a router, not a planner, for standard tasks.

### Workflow Responsibility

Workflow remains the only owner of:

- `ExecutionPlan`
- plan materialization
- parallelism and dependency graphs
- workflow review criteria
- workflow-specific plan review and execution semantics

This keeps the robust model where it already has clear rules and removes the weak duplicate planning path from normal tasks.

## Data Model

### Task Fields

Add or formalize the following fields on tasks:

- `workMode: "direct_delegate" | "ai_workflow"`
- `routingMode: "lead_agent" | "workflow" | "human"`
- `routingDecision?: { targetAgent?: string; reason?: string; reasonCode?: string; routedAt?: string; registrySnapshot?: ... }`

Rules:

- `ai_workflow` tasks may populate `executionPlan`
- `direct_delegate` tasks should leave `executionPlan` empty
- `routingMode="human"` may leave `reason` and `reasonCode` unset
- unset metadata should be stored as `undefined`/absent fields, not placeholder strings

### Agent Metrics

Add execution counters at the agent level:

- `tasksExecuted`
- `stepsExecuted`
- `lastTaskExecutedAt`
- `lastStepExecutedAt`

If the UI later wants one aggregate number, it can derive `executionsCompleted`, but storage should keep task and step counts separate because direct delegation and workflow execution are materially different.

## Active Agent Registry View

Introduce a dedicated read model for routing, for example:

- `agents:listActiveRegistryView`

It should return active, delegatable agents with enough context for both UI and lead-agent routing:

- `agentId`
- `name`
- `displayName`
- `role`
- `skills`
- `squads`
- `enabled`
- `status`
- `tasksExecuted`
- `stepsExecuted`
- `lastActiveAt`

This is not just a UI convenience query. It becomes the authoritative routing input for lead-agent delegation.

## Runtime Flow

### Direct Delegation Flow

For `direct_delegate` tasks:

1. frontend creates the task
2. task enters `inbox`
3. runtime resolves it as a direct-delegation task
4. lead-agent router queries the active agent registry view
5. lead-agent router selects the target agent
6. runtime stores `routingMode="lead_agent"` and `routingDecision`
7. task moves to `assigned`
8. existing task execution path runs the assigned agent

No plan generation, plan review, or plan negotiation occurs in this mode.

### Human Delegation Flow

For operator-directed agent assignment:

1. operator assigns or sends a task directly to an agent from the dashboard
2. task stores `routingMode="human"`
3. optional `routingDecision.targetAgent` is the explicitly chosen agent
4. `reason` and `reasonCode` may remain absent

This preserves provenance without forcing fake routing explanations.

### Workflow Flow

For `ai_workflow` tasks:

1. workflow launch produces the execution structure
2. task stores `routingMode="workflow"`
3. workflow continues to own `executionPlan`, materialization, dispatch, and review semantics

No lead-agent planning is reintroduced into this path.

## Conversation and Review Semantics

`plan_chat` and lead-agent plan negotiation must become workflow-only behaviors.

For `direct_delegate` and `human` tasks:

- no lead-agent plan review loop
- no plan-negotiation thread mode
- no plan-specific thread interception
- standard task thread behavior only

For `ai_workflow` tasks:

- existing workflow plan and review surfaces remain valid

This removes the current bug-prone state where normal task messages can be treated as if a plan contract exists when it does not.

## Dashboard Behavior

### Execution Plan Tab

The `Execution Plan` tab remains visible in task detail for now.

Behavior by mode:

- `ai_workflow`: render the workflow plan normally
- `direct_delegate`: leave the tab empty, matching current empty-plan behavior
- `human`: leave the tab empty, matching current empty-plan behavior

The key rule is that the tab may exist as a shell, but only workflow tasks actually own plan data.

### Task Detail

For `direct_delegate` and `human` tasks:

- remove lead-agent review affordances
- remove plan-review conversation affordances
- show normal thread behavior
- optionally show routing metadata in task detail later, but that is not required for the first cut

For `ai_workflow` tasks:

- preserve current workflow-specific plan surfaces

## Migration Strategy

The safest migration is additive first, then restrictive:

1. add `workMode`, `routingMode`, and routing metadata fields
2. add agent execution metrics and registry view
3. route new normal tasks through `direct_delegate`
4. restrict conversation intent so `plan_chat` only applies to workflow tasks
5. stop generating lead-agent execution plans for normal tasks
6. keep workflow path unchanged

This avoids a flag day and lets the old empty-plan UI survive while backend ownership is corrected.

## Non-Goals

- no attempt to redesign workflow execution in this change
- no requirement to remove the `Execution Plan` tab shell from task detail
- no fake one-step `ExecutionPlan` for direct delegation
- no requirement to expose routing explanations in the first UI iteration
- no reintroduction of lead-agent as a step executor

## Testing Strategy

The implementation should prove these boundaries explicitly:

- normal task creation results in `workMode="direct_delegate"`
- direct-delegate tasks do not receive lead-agent-generated plans
- workflow tasks still preserve and execute `ExecutionPlan`
- `routingMode="human"` is preserved for direct operator assignment
- conversation intent does not route non-workflow tasks into `plan_chat`
- task detail keeps the plan tab shell while only workflow tasks render plan content
- agent metrics increment on task and step completions through the correct paths
