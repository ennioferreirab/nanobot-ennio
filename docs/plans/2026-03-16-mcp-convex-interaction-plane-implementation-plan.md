# MCP Convex Interaction Plane Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move `ask_user`, `report_progress`, thread messaging, final-result recording, and execution pause/resume state onto a provider-agnostic MCP interaction plane backed by Convex.

**Architecture:** Keep MCP as the only contract exposed to agents and providers. Route MCP tool calls into a new `mc.contexts.interaction` application layer that persists durable interaction records in Convex, drives explicit execution-state transitions, and lets the dashboard read/write user interaction without depending on provider-local sockets.

**Tech Stack:** Python (`mc/`, pytest, ruff), Convex (`dashboard/convex/`), Next.js dashboard hooks/components, MCP bridge adapters for Claude/Codex.

---

## Target Design

- MCP remains the semantic contract: `ask_user`, `report_progress`, `send_message`, `record_final_result`.
- Convex becomes the durable source of truth for:
  - execution session identity
  - pending questions and answers
  - progress updates
  - agent thread messages
  - final results
  - execution interaction state
- Local socket/control plane remains only for process control and low-latency session I/O.
- Provider parsers may still emit supervision events, but workflow state changes are driven by persisted interaction events, not inferred from raw stdout.

## Data Model

Re-use existing task/step/message tables. Add provider-agnostic execution interaction tables:

- `executionSessions`
  - execution/session identity for a task step
  - provider metadata, agent name, task id, step id
  - state: `running | waiting_user_input | paused | ready_to_resume | completed | crashed`
  - latest progress snapshot
  - final result summary/source
- `executionInteractions`
  - append-only event log keyed by execution session
  - kinds: `question_requested`, `question_answered`, `progress_reported`, `message_posted`, `final_result_recorded`, `state_changed`, `provider_event`
- `executionQuestions`
  - one active or historical user question record
  - pending/answered/cancelled/expired
  - structured options/questionnaire payload
  - linked answer payload and timestamps

`interactiveSessions` and `sessionActivityLog` remain for live terminal supervision and observability. They stop being the source of truth for durable human-agent communication.

## Rollout Rules

- Phase 1 is dual-write: existing behavior remains while Convex interaction records are written in parallel.
- Phase 2 switches reads and workflow decisions to the new interaction plane.
- Phase 3 removes `ask_user_registry` as the primary pending-question source.
- Phase 4 makes provider-local socket optional for MCP business communication.

### Task 1: Add Convex execution interaction schema

**Files:**
- Modify: `dashboard/convex/schema.ts`
- Create: `dashboard/convex/executionSessions.ts`
- Create: `dashboard/convex/executionInteractions.ts`
- Create: `dashboard/convex/executionQuestions.ts`
- Test: `dashboard/convex/schema.test.ts`
- Test: `dashboard/convex/executionSessions.test.ts`
- Test: `dashboard/convex/executionInteractions.test.ts`
- Test: `dashboard/convex/executionQuestions.test.ts`

**Step 1: Write the failing schema tests**

- Add tests asserting:
  - the three new tables exist
  - validators accept the new execution states
  - required indexes exist for lookup by `sessionId`, `taskId`, `stepId`, and `status`

**Step 2: Run tests to verify they fail**

Run: `npm test -- dashboard/convex/schema.test.ts dashboard/convex/executionSessions.test.ts dashboard/convex/executionInteractions.test.ts dashboard/convex/executionQuestions.test.ts`

Expected: FAIL because the tables and functions do not exist yet.

**Step 3: Write the minimal Convex schema and CRUD surface**

- Add `executionSessions` with:
  - `sessionId`
  - `taskId`
  - `stepId`
  - `agentName`
  - `provider`
  - `state`
  - `lastProgressMessage`
  - `lastProgressPercentage`
  - `finalResult`
  - timestamps
- Add `executionInteractions` as append-only event log.
- Add `executionQuestions` with structured question payload and answer payload.
- Add internal mutations/queries for:
  - upsert session
  - append interaction event
  - create question
  - answer question
  - get pending question by task/step/session
  - list interactions for execution

**Step 4: Run tests to verify they pass**

Run: `npm test -- dashboard/convex/schema.test.ts dashboard/convex/executionSessions.test.ts dashboard/convex/executionInteractions.test.ts dashboard/convex/executionQuestions.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add dashboard/convex/schema.ts dashboard/convex/executionSessions.ts dashboard/convex/executionInteractions.ts dashboard/convex/executionQuestions.ts dashboard/convex/schema.test.ts dashboard/convex/executionSessions.test.ts dashboard/convex/executionInteractions.test.ts dashboard/convex/executionQuestions.test.ts
git commit -m "feat: add execution interaction convex schema"
```

### Task 2: Create the provider-agnostic interaction application layer

**Files:**
- Create: `mc/contexts/interaction/__init__.py`
- Create: `mc/contexts/interaction/types.py`
- Create: `mc/contexts/interaction/service.py`
- Create: `mc/contexts/interaction/state_machine.py`
- Create: `mc/contexts/interaction/projector.py`
- Modify: `mc/application/execution/post_processing.py`
- Modify: `mc/application/execution/runtime.py`
- Modify: `mc/runtime/orchestrator.py`
- Test: `tests/mc/contexts/test_interaction_service.py`
- Test: `tests/mc/contexts/test_interaction_state_machine.py`

**Step 1: Write the failing service/state tests**

- Add tests for:
  - `request_user_input()` creates a pending question and target state
  - `report_progress()` appends event and updates the session projection
  - `post_message()` appends event and optionally mirrors to thread
  - `record_final_result()` appends event and marks session completed
  - state transitions reject invalid moves

**Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/mc/contexts/test_interaction_service.py tests/mc/contexts/test_interaction_state_machine.py -q`

Expected: FAIL because the module does not exist yet.

**Step 3: Write minimal service and state machine**

- Define typed commands and event payloads.
- Keep bridge calls centralized in `InteractionService`.
- Add projector methods that call Convex mutations:
  - `executionSessions:upsert`
  - `executionInteractions:append`
  - `executionQuestions:create`
  - `executionQuestions:answer`
- Keep task/step status updates behind the state machine instead of scattered across handlers.

**Step 4: Wire the service into runtime composition**

- Build one `InteractionService` in runtime bootstrap.
- Pass it into MCP bridge handlers, execution runtime, and reply watchers.

**Step 5: Run tests to verify they pass**

Run: `uv run pytest tests/mc/contexts/test_interaction_service.py tests/mc/contexts/test_interaction_state_machine.py -q`

Expected: PASS.

**Step 6: Commit**

```bash
git add mc/contexts/interaction mc/application/execution/post_processing.py mc/application/execution/runtime.py mc/runtime/orchestrator.py tests/mc/contexts/test_interaction_service.py tests/mc/contexts/test_interaction_state_machine.py
git commit -m "feat: add interaction service and state machine"
```

### Task 3: Route MCP tools through the interaction service

**Files:**
- Modify: `mc/runtime/mcp/bridge.py`
- Modify: `mc/runtime/mcp/tool_specs.py`
- Modify: `vendor/claude-code/claude_code/mcp_bridge.py`
- Modify: `tests/cc/test_mcp_bridge.py`
- Modify: `tests/mc/runtime/test_mc_mcp_bridge.py`
- Test: `tests/mc/test_codex_ask_user_integration.py`

**Step 1: Write the failing MCP routing tests**

- Add tests asserting:
  - `ask_user` writes an execution question instead of requiring immediate socket-mediated resume logic
  - `report_progress` writes session progress even when provider supervision is unavailable
  - `send_message` and `record_final_result` use interaction service APIs
  - provider-specific adapters still strip unsupported schema fields while preserving canonical MCP semantics

**Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/cc/test_mcp_bridge.py tests/mc/runtime/test_mc_mcp_bridge.py tests/mc/test_codex_ask_user_integration.py -q`

Expected: FAIL on old routing assumptions.

**Step 3: Implement MCP routing changes**

- Keep tool names unchanged.
- Resolve execution context from env/session metadata.
- Replace direct imperative socket-side business logic with interaction-service calls.
- Return compact MCP responses:
  - `ask_user`: `"Question posted to Mission Control."`
  - `report_progress`: `"Progress reported."`
  - `send_message`: `"Message sent."`
  - `record_final_result`: `"Final result recorded."`

**Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/cc/test_mcp_bridge.py tests/mc/runtime/test_mc_mcp_bridge.py tests/mc/test_codex_ask_user_integration.py -q`

Expected: PASS.

**Step 5: Commit**

```bash
git add mc/runtime/mcp/bridge.py mc/runtime/mcp/tool_specs.py vendor/claude-code/claude_code/mcp_bridge.py tests/cc/test_mcp_bridge.py tests/mc/runtime/test_mc_mcp_bridge.py tests/mc/test_codex_ask_user_integration.py
git commit -m "feat: route mcp tools through interaction service"
```

### Task 4: Migrate ask_user pause/resume to durable question state

**Files:**
- Modify: `mc/contexts/conversation/ask_user/handler.py`
- Modify: `mc/contexts/conversation/ask_user/watcher.py`
- Modify: `mc/contexts/conversation/ask_user/registry.py`
- Modify: `mc/runtime/workers/review.py`
- Modify: `mc/contexts/review/handler.py`
- Modify: `mc/contexts/planning/negotiation.py`
- Test: `tests/mc/test_ask_user_handler.py`
- Test: `tests/mc/services/test_conversation_gateway_integration.py`
- Test: `tests/mc/services/test_conversation.py`

**Step 1: Write the failing ask_user flow tests**

- Add tests asserting:
  - asking a question creates a durable pending question record
  - user reply is matched by `questionId/sessionId`, not only by in-memory future lookup
  - restart-safe resume works when the original process is gone
  - review/planning workers skip only when Convex shows an active pending question

**Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/mc/test_ask_user_handler.py tests/mc/services/test_conversation_gateway_integration.py tests/mc/services/test_conversation.py -q`

Expected: FAIL because current implementation depends on in-memory futures and registry state.

**Step 3: Implement durable question handling**

- Make `AskUserHandler` create questions through `InteractionService`.
- Keep `AskUserRegistry` only as a temporary compatibility cache during dual-write.
- Update watcher logic to:
  - find pending questions in Convex
  - append answer event
  - transition the execution session to `ready_to_resume`
- Do not directly flip task/step state inside the handler; call the interaction state machine.

**Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/mc/test_ask_user_handler.py tests/mc/services/test_conversation_gateway_integration.py tests/mc/services/test_conversation.py -q`

Expected: PASS.

**Step 5: Commit**

```bash
git add mc/contexts/conversation/ask_user/handler.py mc/contexts/conversation/ask_user/watcher.py mc/contexts/conversation/ask_user/registry.py mc/runtime/workers/review.py mc/contexts/review/handler.py mc/contexts/planning/negotiation.py tests/mc/test_ask_user_handler.py tests/mc/services/test_conversation_gateway_integration.py tests/mc/services/test_conversation.py
git commit -m "feat: persist ask_user state and replies in convex"
```

### Task 5: Project supervision and provider events into the interaction plane

**Files:**
- Modify: `mc/contexts/interactive/supervisor.py`
- Modify: `mc/contexts/interactive/registry.py`
- Modify: `mc/contexts/interactive/supervision_types.py`
- Modify: `mc/application/execution/strategies/provider_cli.py`
- Modify: `mc/contexts/provider_cli/providers/claude_code.py`
- Modify: `mc/contexts/provider_cli/providers/codex.py`
- Test: `tests/mc/test_interactive_supervisor.py`
- Test: `tests/mc/provider_cli/test_claude_code_parser.py`
- Test: `tests/mc/test_provider_cli_strategy.py`

**Step 1: Write the failing projection tests**

- Add tests asserting:
  - `ask_user_requested`, `approval_requested`, `session_failed`, `turn_started` append execution interaction events
  - state transitions go through the interaction state machine
  - provider-specific parsers only normalize provider events; they do not own workflow state

**Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/mc/test_interactive_supervisor.py tests/mc/provider_cli/test_claude_code_parser.py tests/mc/test_provider_cli_strategy.py -q`

Expected: FAIL because state is still mutated directly from supervision handlers.

**Step 3: Implement interaction projection**

- Keep `interactiveSessions` and `sessionActivityLog` for live session telemetry.
- Add parallel writes into `executionInteractions`.
- Update `InteractiveExecutionSupervisor` to call the interaction state machine for:
  - `running`
  - `waiting_user_input`
  - `paused`
  - `crashed`
- Keep provider parsers focused on normalization only.

**Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/mc/test_interactive_supervisor.py tests/mc/provider_cli/test_claude_code_parser.py tests/mc/test_provider_cli_strategy.py -q`

Expected: PASS.

**Step 5: Commit**

```bash
git add mc/contexts/interactive/supervisor.py mc/contexts/interactive/registry.py mc/contexts/interactive/supervision_types.py mc/application/execution/strategies/provider_cli.py mc/contexts/provider_cli/providers/claude_code.py mc/contexts/provider_cli/providers/codex.py tests/mc/test_interactive_supervisor.py tests/mc/provider_cli/test_claude_code_parser.py tests/mc/test_provider_cli_strategy.py
git commit -m "feat: project provider events into execution interaction state"
```

### Task 6: Move dashboard task/thread UX to the new interaction records

**Files:**
- Modify: `dashboard/convex/lib/taskDetailView.ts`
- Modify: `dashboard/hooks/useBoardColumns.ts`
- Modify: `dashboard/features/tasks/hooks/useTaskDetailView.ts`
- Modify: `dashboard/features/tasks/components/TaskDetailThreadTab.tsx`
- Modify: `dashboard/features/tasks/components/TaskCard.tsx`
- Modify: `dashboard/features/tasks/components/StepCard.tsx`
- Create: `dashboard/features/tasks/hooks/useExecutionInteractionState.ts`
- Test: `dashboard/features/tasks/components/TaskDetailThreadTab.test.tsx`
- Test: `dashboard/features/tasks/components/TaskCard.test.tsx`

**Step 1: Write the failing dashboard tests**

- Add tests asserting:
  - pending question appears as a first-class interaction card in the task thread
  - answering the question uses the new Convex mutation
  - progress comes from `executionSessions` snapshot instead of live socket-only state
  - a task/step in `waiting_user_input` renders in Review cleanly

**Step 2: Run tests to verify they fail**

Run: `npm test -- dashboard/features/tasks/components/TaskDetailThreadTab.test.tsx dashboard/features/tasks/components/TaskCard.test.tsx`

Expected: FAIL because the UI does not read the new interaction tables yet.

**Step 3: Implement the dashboard read path**

- Extend task detail view queries to join:
  - pending question
  - interaction timeline
  - latest progress
- Render question/reply/progress blocks from interaction records.
- Treat `waiting_user_input` as Review-facing state without relying on raw `review` task text.

**Step 4: Run tests to verify they pass**

Run: `npm test -- dashboard/features/tasks/components/TaskDetailThreadTab.test.tsx dashboard/features/tasks/components/TaskCard.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add dashboard/convex/lib/taskDetailView.ts dashboard/hooks/useBoardColumns.ts dashboard/features/tasks/hooks/useTaskDetailView.ts dashboard/features/tasks/hooks/useExecutionInteractionState.ts dashboard/features/tasks/components/TaskDetailThreadTab.tsx dashboard/features/tasks/components/TaskCard.tsx dashboard/features/tasks/components/StepCard.tsx dashboard/features/tasks/components/TaskDetailThreadTab.test.tsx dashboard/features/tasks/components/TaskCard.test.tsx
git commit -m "feat: read execution interaction state in dashboard"
```

### Task 7: Add dual-write migration and cutover safety rails

**Files:**
- Modify: `mc/application/execution/post_processing.py`
- Modify: `mc/runtime/gateway.py`
- Modify: `mc/runtime/orchestrator.py`
- Modify: `mc/runtime/timeout_checker.py`
- Create: `mc/contexts/interaction/feature_flags.py`
- Create: `tests/mc/test_interaction_cutover.py`

**Step 1: Write the failing cutover tests**

- Add tests asserting:
  - dual-write mode writes both old and new paths
  - read mode can switch to Convex interaction source
  - timeout checker and review worker consume new state safely
  - process restart does not lose pending-question or progress state

**Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/mc/test_interaction_cutover.py tests/mc/test_gateway.py tests/mc/test_orchestrator.py tests/mc/test_timeout_checker.py -q`

Expected: FAIL because no cutover feature flag exists yet.

**Step 3: Implement cutover controls**

- Add feature flags:
  - `interaction_dual_write`
  - `interaction_read_from_convex`
  - `interaction_resume_from_convex`
- Make runtime components log source-of-truth decisions.
- Keep rollback simple: disable read flag and continue dual-write.

**Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/mc/test_interaction_cutover.py tests/mc/test_gateway.py tests/mc/test_orchestrator.py tests/mc/test_timeout_checker.py -q`

Expected: PASS.

**Step 5: Commit**

```bash
git add mc/application/execution/post_processing.py mc/runtime/gateway.py mc/runtime/orchestrator.py mc/runtime/timeout_checker.py mc/contexts/interaction/feature_flags.py tests/mc/test_interaction_cutover.py tests/mc/test_gateway.py tests/mc/test_orchestrator.py tests/mc/test_timeout_checker.py
git commit -m "feat: add convex interaction cutover controls"
```

### Task 8: Verify provider-agnostic end-to-end flows

**Files:**
- Modify: `scripts/repro_provider_cli_step.py`
- Create: `scripts/repro_interaction_flow.py`
- Test: `tests/mc/test_provider_agnostic_interaction_flow.py`

**Step 1: Write the failing end-to-end tests**

- Add tests for two flows:
  - Claude provider asks user, user answers, step resumes
  - Codex provider reports progress, sends message, records final result
- Assert the same Convex interaction records are produced in both flows.

**Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/mc/test_provider_agnostic_interaction_flow.py -q`

Expected: FAIL because the unified interaction plane is not fully wired yet.

**Step 3: Implement minimal repro harnesses**

- Extend `scripts/repro_provider_cli_step.py` to print:
  - execution session state
  - pending questions
  - latest progress
- Add `scripts/repro_interaction_flow.py` that simulates MCP calls without relying on a specific provider parser.

**Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/mc/test_provider_agnostic_interaction_flow.py -q`

Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/repro_provider_cli_step.py scripts/repro_interaction_flow.py tests/mc/test_provider_agnostic_interaction_flow.py
git commit -m "test: add provider-agnostic interaction flow coverage"
```

## Final Verification

Run the full baseline for touched areas:

```bash
uv run ruff format --check mc dashboard/convex tests/mc tests/cc scripts
uv run ruff check mc tests/mc tests/cc scripts
uv run pytest tests/mc/test_architecture.py tests/mc/test_module_reorganization.py tests/mc/infrastructure/test_boundary.py
npm run format:file:check -- dashboard/convex/schema.ts dashboard/convex/executionSessions.ts dashboard/convex/executionInteractions.ts dashboard/convex/executionQuestions.ts dashboard/features/tasks/hooks/useExecutionInteractionState.ts dashboard/features/tasks/components/TaskDetailThreadTab.tsx dashboard/features/tasks/components/TaskCard.tsx dashboard/features/tasks/components/StepCard.tsx dashboard/hooks/useBoardColumns.ts
npm run lint:file -- dashboard/convex/schema.ts dashboard/convex/executionSessions.ts dashboard/convex/executionInteractions.ts dashboard/convex/executionQuestions.ts dashboard/features/tasks/hooks/useExecutionInteractionState.ts dashboard/features/tasks/components/TaskDetailThreadTab.tsx dashboard/features/tasks/components/TaskCard.tsx dashboard/features/tasks/components/StepCard.tsx dashboard/hooks/useBoardColumns.ts
npm run test:architecture
```

## Migration Notes

- Do not remove `interactiveSessions` or `sessionActivityLog` in this wave.
- Do not remove provider-local sockets in this wave.
- Do not make provider parsers responsible for workflow-state mutation.
- Do not let dashboard components subscribe directly to raw provider telemetry for durable UX.
- Cutover success criteria:
  - user questions survive gateway restart
  - progress is visible even if live stream drops
  - reply/resume does not require the original provider process to stay alive
  - Claude and Codex produce the same durable interaction records through MCP

Plan complete and saved to `docs/plans/2026-03-16-mcp-convex-interaction-plane-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
