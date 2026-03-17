# TUI Execution Supervision Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Mission Control run provider-native interactive sessions as the primary execution engine for interactive-capable steps, while preserving strong task/step supervision, `ask_user -> review` pauses, and optional `Live` attach from the dashboard.

**Architecture:** Keep the current PTY/tmux runtime as the execution substrate, but add a supervision layer above it. Claude Code supervision will come from official Claude hooks; Codex supervision will come from the Codex app-server protocol. Mission Control will normalize both into one internal event contract that drives task/step lifecycle, review pauses, and dashboard state. The interactive/TUI path becomes the default execution path for interactive-capable providers. Headless remains in the repository as a separate mode, but not as an automatic fallback.

**Tech Stack:** Python backend (`mc/contexts`, `mc/runtime`, `mc/infrastructure`), Claude Code hooks, Codex app-server protocol, tmux/PTTY transport, Convex task/step state, Next.js dashboard TUI surfaces.

---

### Task 1: Define the Interactive Supervision Contract

**Files:**
- Create: `mc/contexts/interactive/supervision.py`
- Create: `mc/contexts/interactive/supervision_types.py`
- Modify: `mc/contexts/interactive/types.py`
- Modify: `docs/ARCHITECTURE.md`
- Test: `tests/mc/test_interactive_supervision.py`

**Step 1: Write the failing test**

```python
def test_normalizes_provider_events_into_mc_supervision_events() -> None:
    event = normalize_provider_event(
        provider="claude-code",
        raw_event={"kind": "stop", "session_id": "sess-1"},
    )
    assert event.kind == "session_stopped"
```

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/test_interactive_supervision.py -v`

Expected: FAIL with missing module or symbol errors for `normalize_provider_event`.

**Step 3: Write minimal implementation**

Implement:
- a canonical `InteractiveSupervisionEvent` type
- provider-agnostic event kinds such as:
  - `session_started`
  - `session_ready`
  - `turn_started`
  - `turn_updated`
  - `turn_completed`
  - `item_started`
  - `item_completed`
  - `approval_requested`
  - `user_input_requested`
  - `ask_user_requested`
  - `paused_for_review`
  - `session_stopped`
  - `session_failed`
- payload fields:
  - `session_id`
  - `provider`
  - `task_id`
  - `step_id`
  - `turn_id`
  - `item_id`
  - `status`
  - `summary`
  - `error`
  - `metadata`

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/mc/test_interactive_supervision.py -v`

Expected: PASS.

**Step 5: Commit**

```bash
git add mc/contexts/interactive/supervision.py mc/contexts/interactive/supervision_types.py mc/contexts/interactive/types.py docs/ARCHITECTURE.md tests/mc/test_interactive_supervision.py
git commit -m "feat: add interactive supervision contract"
```

### Task 2: Add a Runtime-Owned Supervision Sink

**Files:**
- Create: `mc/contexts/interactive/supervisor.py`
- Modify: `mc/contexts/interactive/coordinator.py`
- Modify: `mc/runtime/interactive.py`
- Modify: `mc/runtime/gateway.py`
- Test: `tests/mc/test_interactive_supervisor.py`

**Step 1: Write the failing test**

```python
def test_supervisor_updates_session_state_from_event() -> None:
    bridge = FakeBridge()
    supervisor = InteractiveExecutionSupervisor(bridge=bridge)
    supervisor.handle_event(
        InteractiveSupervisionEvent(kind="turn_started", task_id="task-1", step_id="step-1")
    )
    assert bridge.step_status_updates[-1] == ("step-1", "in_progress")
```

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/test_interactive_supervisor.py -v`

Expected: FAIL because `InteractiveExecutionSupervisor` does not exist.

**Step 3: Write minimal implementation**

Implement a runtime-owned supervisor that:
- subscribes to normalized supervision events
- updates interactive session metadata
- updates task/step status through the bridge
- emits activity events for major lifecycle changes
- keeps provider supervision separate from terminal transport

Initial rules:
- `turn_started` or first `item_started` marks step `in_progress`
- `turn_completed` can mark the active step `done` only after provider success resolution
- `session_failed` marks task/step `crashed`
- `user_input_requested` or `ask_user_requested` marks task and current step `review`

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/mc/test_interactive_supervisor.py -v`

Expected: PASS.

**Step 5: Commit**

```bash
git add mc/contexts/interactive/supervisor.py mc/contexts/interactive/coordinator.py mc/runtime/interactive.py mc/runtime/gateway.py tests/mc/test_interactive_supervisor.py
git commit -m "feat: add interactive execution supervisor"
```

### Task 3: Wire Claude Code Hooks into the Supervision Layer

**Files:**
- Create: `mc/contexts/interactive/adapters/claude_hooks.py`
- Modify: `mc/contexts/interactive/adapters/claude_code.py`
- Modify: `vendor/claude-code/claude_code/workspace.py`
- Modify: `vendor/claude-code/claude_code/mcp_bridge.py`
- Test: `tests/cc/test_workspace.py`
- Test: `tests/mc/test_claude_interactive_hooks.py`

**Step 1: Write the failing test**

```python
def test_claude_stop_hook_emits_turn_completed() -> None:
    sink = RecordingSink()
    handler = ClaudeHookRelay(sink=sink)
    handler.handle({"eventName": "Stop", "task_id": "task-1", "step_id": "step-1"})
    assert sink.events[-1].kind == "turn_completed"
```

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/test_claude_interactive_hooks.py tests/cc/test_workspace.py -v`

Expected: FAIL because no hook relay or CLAUDE.md hook config exists.

**Step 3: Write minimal implementation**

Implement Claude hook support that:
- injects a per-session hook config into the interactive Claude workspace
- routes Claude hook callbacks into Mission Control through a local relay
- maps hook events:
  - `SessionStart` -> `session_started`
  - `UserPromptSubmit` -> `turn_started`
  - `PreToolUse` / `PostToolUse` / `PostToolUseFailure` -> `item_*`
  - `PermissionRequest` -> `approval_requested`
  - `Stop` -> `turn_completed`
  - hook failures -> `session_failed`

Do not parse the TUI for lifecycle when hooks already provide it.

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/mc/test_claude_interactive_hooks.py tests/cc/test_workspace.py -v`

Expected: PASS.

**Step 5: Commit**

```bash
git add mc/contexts/interactive/adapters/claude_hooks.py mc/contexts/interactive/adapters/claude_code.py vendor/claude-code/claude_code/workspace.py vendor/claude-code/claude_code/mcp_bridge.py tests/mc/test_claude_interactive_hooks.py tests/cc/test_workspace.py
git commit -m "feat: add claude interactive hook supervision"
```

### Task 4: Integrate Codex Through the App-Server Event Stream

**Files:**
- Create: `mc/contexts/interactive/adapters/codex_app_server.py`
- Modify: `mc/contexts/interactive/adapters/codex.py`
- Modify: `mc/contexts/interactive/agent_loader.py`
- Test: `tests/mc/test_codex_app_server_adapter.py`

**Step 1: Write the failing test**

```python
def test_codex_turn_completed_notification_maps_to_supervision_event() -> None:
    sink = RecordingSink()
    adapter = CodexAppServerRelay(sink=sink)
    adapter.handle_notification(
        {"method": "turn/completed", "params": {"threadId": "thr-1", "turn": {"id": "turn-1"}}}
    )
    assert sink.events[-1].kind == "turn_completed"
```

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/test_codex_app_server_adapter.py -v`

Expected: FAIL because no app-server relay exists.

**Step 3: Write minimal implementation**

Implement a Codex supervision adapter that:
- launches Codex with app-server support for supervised execution
- consumes structured notifications such as:
  - `turn/started`
  - `turn/completed`
  - `item/started`
  - `item/completed`
  - `item/tool/requestUserInput`
  - approval requests
- maps them into the same internal supervision contract as Claude

Keep terminal attach independent from app-server supervision, so `Live` remains optional.

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/mc/test_codex_app_server_adapter.py -v`

Expected: PASS.

**Step 5: Commit**

```bash
git add mc/contexts/interactive/adapters/codex_app_server.py mc/contexts/interactive/adapters/codex.py mc/contexts/interactive/agent_loader.py tests/mc/test_codex_app_server_adapter.py
git commit -m "feat: add codex app-server supervision adapter"
```

### Task 5: Add an Interactive Step Execution Strategy

**Files:**
- Create: `mc/application/execution/strategies/interactive_tui.py`
- Modify: `mc/application/execution/strategies/claude_code.py`
- Modify: `mc/contexts/execution/step_dispatcher.py`
- Modify: `mc/contexts/execution/cc_step_runner.py`
- Test: `tests/mc/test_interactive_step_strategy.py`

**Step 1: Write the failing test**

```python
def test_dispatcher_uses_interactive_strategy_for_tui_capable_provider() -> None:
    dispatcher = build_dispatcher_with_interactive_default()
    strategy = dispatcher._resolve_strategy(provider="claude-code", mode="interactive")
    assert strategy.name == "interactive_tui"
```

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/test_interactive_step_strategy.py -v`

Expected: FAIL because the strategy does not exist.

**Step 3: Write minimal implementation**

Implement a step strategy that:
- creates a backend-owned interactive session per running step
- persists the mapping `{task_id, step_id} -> interactive_session_id`
- starts provider supervision before allowing UI attach
- updates step/task status through the supervisor rather than directly from terminal state
- keeps headless execution available as a feature-flagged fallback

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/mc/test_interactive_step_strategy.py -v`

Expected: PASS.

**Step 5: Commit**

```bash
git add mc/application/execution/strategies/interactive_tui.py mc/application/execution/strategies/claude_code.py mc/contexts/execution/step_dispatcher.py mc/contexts/execution/cc_step_runner.py tests/mc/test_interactive_step_strategy.py
git commit -m "feat: add interactive tui step execution strategy"
```

### Task 6: Make `ask_user` Pause Task and Step in Review

**Files:**
- Modify: `mc/contexts/conversation/ask_user/handler.py`
- Modify: `mc/contexts/conversation/ask_user/registry.py`
- Modify: `mc/contexts/interactive/supervisor.py`
- Modify: `mc/runtime/workers/review.py`
- Modify: `mc/contexts/review/handler.py`
- Test: `tests/mc/test_ask_user_handler.py`
- Test: `tests/mc/test_interactive_review_pause.py`

**Step 1: Write the failing test**

```python
def test_ask_user_marks_task_and_active_step_review() -> None:
    bridge = FakeBridge()
    handler = AskUserHandler()
    await handler.ask(
        question="Need approval?",
        agent_name="marketing-copy",
        task_id="task-1",
        bridge=bridge,
        step_id="step-1",
    )
    assert ("task-1", "review") in bridge.task_status_updates
    assert ("step-1", "review") in bridge.step_status_updates
```

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/test_ask_user_handler.py tests/mc/test_interactive_review_pause.py -v`

Expected: FAIL because `step_id` review propagation is not implemented.

**Step 3: Write minimal implementation**

Update the ask-user flow so that:
- MCP `ask_user` always records the active `step_id` when one exists
- `ask_user` moves:
  - task -> `review`
  - active step -> `review`
- user reply resumes:
  - task -> `in_progress`
  - active step -> `in_progress`
- review workers continue to skip tasks with pending `ask_user`
- review is treated as a deliberate pause, not a completion candidate

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/mc/test_ask_user_handler.py tests/mc/test_interactive_review_pause.py -v`

Expected: PASS.

**Step 5: Commit**

```bash
git add mc/contexts/conversation/ask_user/handler.py mc/contexts/conversation/ask_user/registry.py mc/contexts/interactive/supervisor.py mc/runtime/workers/review.py mc/contexts/review/handler.py tests/mc/test_ask_user_handler.py tests/mc/test_interactive_review_pause.py
git commit -m "feat: pause task and step on ask_user review"
```

### Task 7: Expose Live Attach from the Running Step Thread

**Files:**
- Modify: `dashboard/features/interactive/components/InteractiveTerminalPanel.tsx`
- Modify: `dashboard/components/ChatPanel.tsx`
- Modify: `dashboard/features/tasks/components/TaskDetailSheet.tsx`
- Modify: `dashboard/convex/interactiveSessions.ts`
- Create: `dashboard/features/interactive/hooks/useInteractiveStepSession.ts`
- Test: `dashboard/features/interactive/components/InteractiveTerminalPanel.test.tsx`
- Test: `dashboard/features/tasks/components/TaskDetailSheet.test.tsx`

**Step 1: Write the failing test**

```tsx
it("attaches Live to the existing running step session instead of creating a new one", async () => {
  render(<TaskDetailSheet task={taskWithInteractiveStep} />);
  await user.click(screen.getByRole("button", { name: /Live/i }));
  expect(connectSpy).toHaveBeenCalledWith(
    expect.objectContaining({ sessionId: "interactive-step-1" }),
  );
});
```

**Step 2: Run test to verify it fails**

Run: `cd dashboard && npm run test -- features/interactive/components/InteractiveTerminalPanel.test.tsx features/tasks/components/TaskDetailSheet.test.tsx`

Expected: FAIL because the UI does not yet resolve the step-owned interactive session.

**Step 3: Write minimal implementation**

Implement UI behavior where:
- the backend owns the running session
- `Live` only attaches to the existing session
- opening/closing the panel does not start/stop work
- task and step surfaces show:
  - current execution status
  - whether a live session is available
  - whether the session is paused in review

**Step 4: Run test to verify it passes**

Run: `cd dashboard && npm run test -- features/interactive/components/InteractiveTerminalPanel.test.tsx features/tasks/components/TaskDetailSheet.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add dashboard/features/interactive/components/InteractiveTerminalPanel.tsx dashboard/components/ChatPanel.tsx dashboard/features/tasks/components/TaskDetailSheet.tsx dashboard/convex/interactiveSessions.ts dashboard/features/interactive/hooks/useInteractiveStepSession.ts dashboard/features/interactive/components/InteractiveTerminalPanel.test.tsx dashboard/features/tasks/components/TaskDetailSheet.test.tsx
git commit -m "feat: attach live ui to running interactive step sessions"
```

### Task 8: Add Interactive-First Controls, Metrics, and Guardrails

**Files:**
- Modify: `mc/runtime/gateway.py`
- Modify: `mc/contexts/execution/executor.py`
- Modify: `mc/contexts/interactive/registry.py`
- Modify: `mc/contexts/interactive/service.py`
- Create: `tests/mc/test_interactive_execution_migration.py`
- Modify: `docs/plans/2026-03-12-interactive-agent-tui-design.md`

**Step 1: Write the failing test**

```python
def test_interactive_execution_mode_defaults_to_tui_for_interactive_provider() -> None:
    settings = {"interactive_execution_default": True}
    executor = build_executor(settings=settings)
    assert executor.resolve_execution_mode(provider="claude-code") == "interactive"
```

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/test_interactive_execution_migration.py -v`

Expected: FAIL because no interactive-first mode resolution exists.

**Step 3: Write minimal implementation**

Add:
- feature flag or runtime setting for `interactive_execution_default`
- explicit provider capability checks
- metrics and activity logs:
  - step start latency
  - session crash rate
  - reattach success
  - `ask_user` pause/resume counts
  - completed vs failed supervised turns
- explicit audit trail for:
  - session created
  - step attached
  - supervision ready
  - paused for review
  - resumed after reply
  - completed
  - crashed
- explicit operator-visible failures when interactive startup cannot proceed

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/mc/test_interactive_execution_migration.py -v`

Expected: PASS.

**Step 5: Commit**

```bash
git add mc/runtime/gateway.py mc/contexts/execution/executor.py mc/contexts/interactive/registry.py mc/contexts/interactive/service.py tests/mc/test_interactive_execution_migration.py docs/plans/2026-03-12-interactive-agent-tui-design.md
git commit -m "feat: add interactive-first execution controls"
```

### Task 9: Run End-to-End Verification

**Files:**
- Verify only

**Step 1: Run Python checks**

Run:

```bash
uv run ruff format --check mc/contexts/interactive mc/contexts/conversation/ask_user mc/contexts/execution mc/runtime tests/mc
uv run ruff check mc/contexts/interactive mc/contexts/conversation/ask_user mc/contexts/execution mc/runtime tests/mc
uv run pytest tests/mc/test_interactive_supervision.py tests/mc/test_interactive_supervisor.py tests/mc/test_claude_interactive_hooks.py tests/mc/test_codex_app_server_adapter.py tests/mc/test_interactive_step_strategy.py tests/mc/test_interactive_review_pause.py tests/mc/test_interactive_execution_migration.py tests/mc/test_architecture.py tests/mc/test_module_reorganization.py tests/mc/infrastructure/test_boundary.py
```

Expected: PASS.

**Step 2: Run dashboard checks**

Run:

```bash
cd dashboard
npm run format:file:check -- features/interactive/components/InteractiveTerminalPanel.tsx features/tasks/components/TaskDetailSheet.tsx convex/interactiveSessions.ts features/interactive/hooks/useInteractiveStepSession.ts
npm run lint:file -- features/interactive/components/InteractiveTerminalPanel.tsx features/tasks/components/TaskDetailSheet.tsx convex/interactiveSessions.ts features/interactive/hooks/useInteractiveStepSession.ts
npm run test -- features/interactive/components/InteractiveTerminalPanel.test.tsx features/tasks/components/TaskDetailSheet.test.tsx
npm run test:architecture
```

Expected: PASS.

**Step 3: Run full-stack preview**

Run:

```bash
PORT=3001 uv run nanobot mc start
```

Then verify:
- create or resume an interactive Claude step
- confirm the backend session runs without opening `Live`
- click `Live` and attach to the running session
- trigger `mcp__mc__ask_user`
- confirm task and active step move to `review`
- reply in the thread
- confirm task and step resume `in_progress`
- confirm step ends `done` and session is detachable/reattachable

**Step 4: Capture validation artifacts**

Run with `playwright-cli` against `http://localhost:3001`:
- screenshot of step running without `Live`
- screenshot of attached `Live` session
- screenshot of `ask_user` review pause
- screenshot of resumed execution

**Step 5: Commit final verification updates**

```bash
git add .
git commit -m "test: verify interactive tui execution supervision"
```
