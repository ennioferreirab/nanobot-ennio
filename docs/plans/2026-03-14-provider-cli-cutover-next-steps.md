# Provider CLI Cutover Next Steps

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the real cutover from the legacy `INTERACTIVE_TUI`/`tmux` runtime to the provider-owned CLI session core, starting with Claude step execution and ending with retirement of the old remote TUI path.

**Architecture:** The current codebase contains both the legacy interactive runtime and the new provider CLI foundation, but production still routes interactive steps through `RunnerType.INTERACTIVE_TUI`. This plan finishes the migration in controlled waves: first fix the remaining blocker in supervision, then activate the provider CLI core for Claude, expand the same architecture to Codex and Nanobot, ship the unified Live surface and intervention controls, and finally disable the old tmux-backed path.

**Tech Stack:** Python backend runtime, Convex bridge, Claude Code hooks + MCP, provider CLI parsers, process supervision, Next.js dashboard, pytest, Vitest, Playwright CLI.

---

## Current Truth

- Interactive steps still resolve to `RunnerType.INTERACTIVE_TUI` in `mc/application/execution/interactive_mode.py`.
- The execution engine still routes that runner to `InteractiveTuiRunnerStrategy`.
- The gateway still boots the legacy runtime in `mc/runtime/interactive.py` with `TmuxSessionManager`.
- The new `mc/contexts/provider_cli/*` and `mc/runtime/provider_cli/*` modules exist, but they are not the active step-execution path yet.

## Desired End State

- Claude step execution no longer depends on `tmux` or the legacy PTY attach path.
- The backend owns provider process lifecycle, transcript projection, supervision, and intervention state.
- `Live` attaches to the provider-owned session for the active step.
- Claude, Codex, and Nanobot share the same high-level runtime contract.
- The legacy remote TUI runtime is removed or explicitly disabled.

## Acceptance Criteria

- No interactive step execution path for supported providers goes through `TmuxSessionManager`.
- `resolve_step_runner_type()` no longer routes interactive providers to `RunnerType.INTERACTIVE_TUI`.
- Claude step execution starts immediately from the backend-owned provider process and produces canonical final output.
- `Live` shows the active step session, not a detached terminal abstraction.
- Human intervention and manual `Done` continue to work on the new runtime.
- Memory bootstrap and consolidation still run on interactive completion.
- The old tmux-backed runtime is either deleted or feature-gated off by default.

---

### Task 1: Close the remaining supervision blocker before cutover

**Stories:** `28-0b`

**Files:**
- Modify: `mc/contexts/interactive/supervisor.py`
- Test: `tests/mc/test_interactive_supervisor.py`
- Test: `tests/mc/bridge/test_repositories.py`

**Work:**
- Add a failing test for the real Convex message format: `Cannot transition from 'in_progress' to 'in_progress'`.
- Fix `_is_same_status_error()` so repeated supervision events stop crashing IPC.
- Keep genuine mutation failures visible.

**Done when:**
- Repeated `turn_started` / `item_started` events no longer break supervision.
- Focused tests prove both the real Convex string and unexpected errors.

### Task 2: Activate the provider CLI session core in production wiring

**Stories:** `28-1`

**Files:**
- Modify: `mc/application/execution/request.py`
- Modify: `mc/application/execution/interactive_mode.py`
- Modify: `mc/application/execution/engine.py`
- Modify: `mc/application/execution/post_processing.py`
- Modify: `mc/runtime/gateway.py`
- Modify: `mc/runtime/interactive.py`
- Modify: `mc/runtime/provider_cli/process_supervisor.py`
- Test: `tests/mc/provider_cli/test_process_supervisor.py`
- Test: `tests/mc/test_step_dispatcher.py`
- Test: `tests/mc/application/execution/test_interactive_mode.py`

**Work:**
- Introduce or activate a provider-CLI-backed runner type for interactive step execution.
- Stop routing interactive providers to `RunnerType.INTERACTIVE_TUI`.
- Wire the gateway and execution engine to construct the provider CLI runtime as a first-class dependency.
- Keep the legacy runtime present only while callers still need it, but not as the step path.

**Done when:**
- Interactive steps no longer select `InteractiveTuiRunnerStrategy`.
- The active step runtime uses the provider CLI process/session core.

### Task 3: Cut Claude step execution over to provider-owned sessions

**Stories:** `28-2`

**Files:**
- Modify: `mc/contexts/provider_cli/providers/claude_code.py`
- Modify: `mc/application/execution/strategies/interactive.py`
- Modify: `mc/contexts/interactive/adapters/claude_code.py`
- Modify: `vendor/claude-code/claude_code/hook_bridge.py`
- Modify: `vendor/claude-code/claude_code/ipc_server.py`
- Test: `tests/mc/provider_cli/test_claude_code_parser.py`
- Test: `tests/mc/application/execution/test_interactive_strategy.py`
- Test: `tests/mc/test_interactive_claude_adapter.py`
- Test: `tests/cc/test_hook_bridge.py`

**Work:**
- Launch Claude as a backend-owned provider process rather than a tmux session.
- Parse provider output into canonical runtime events.
- Preserve hooks/MCP-driven `ask_user`, supervision, final-result capture, and session resume.
- Keep bootstrap behavior: the task prompt must start execution immediately.

**Done when:**
- Claude interactive steps run without `tmux`.
- Final result, review pauses, and step completion still project correctly.

### Task 4: Rebind Live to the provider session instead of the terminal transport

**Stories:** `28-5`

**Files:**
- Modify: `dashboard/features/interactive/hooks/useTaskInteractiveSession.ts`
- Modify: `dashboard/features/interactive/components/InteractiveTerminalPanel.tsx`
- Modify: `dashboard/features/tasks/components/TaskDetailSheet.tsx`
- Modify: `dashboard/components/ChatPanel.tsx`
- Modify: `mc/runtime/provider_cli/live_stream.py`
- Test: `dashboard/features/interactive/hooks/useTaskInteractiveSession.test.ts`
- Test: `dashboard/features/interactive/components/InteractiveTerminalPanel.test.tsx`
- Test: `tests/mc/provider_cli/test_live_stream.py`

**Work:**
- Make `Live` bind to the provider session for the active step/session record.
- Show activity from the provider-owned stream rather than from PTY attach state.
- Preserve the correct agent/provider/session identity checks.

**Done when:**
- `Live` opens the active provider-backed session for the correct step and agent.
- The UI no longer depends on the old tmux attach semantics to observe progress.

### Task 5: Move human intervention onto the new runtime

**Stories:** `28-6`

**Files:**
- Modify: `mc/runtime/provider_cli/intervention.py`
- Modify: `mc/contexts/interactive/supervisor.py`
- Modify: `dashboard/features/interactive/components/InteractiveTerminalPanel.tsx`
- Modify: `dashboard/convex/interactiveSessions.ts`
- Test: `tests/mc/provider_cli/test_intervention.py`
- Test: `dashboard/features/interactive/components/InteractiveTerminalPanel.test.tsx`

**Work:**
- Reimplement pause/intervene/manual-done flows on top of provider-owned sessions.
- Ensure `Done` still completes only the active step.
- Keep task/step review projection and canonical final result requirements.

**Done when:**
- Human takeover and manual completion work without depending on the legacy TUI runtime.

### Task 6: Expand the same runtime contract to Codex and Nanobot

**Stories:** `28-3`, `28-4`

**Files:**
- Modify: `mc/contexts/provider_cli/providers/codex.py`
- Modify: `mc/contexts/provider_cli/providers/nanobot.py`
- Modify: `mc/application/execution/strategies/interactive.py`
- Test: `tests/mc/provider_cli/test_codex_parser.py`
- Test: `tests/mc/provider_cli/test_nanobot_parser.py`
- Test: `tests/mc/test_codex_ask_user_integration.py`
- Test: `tests/mc/test_nanobot_interactive_session.py`

**Work:**
- Bring Codex and Nanobot onto the same provider session model.
- Preserve provider-specific supervision and resume behavior without reintroducing terminal ownership.

**Done when:**
- All supported interactive providers use the same runtime pattern.

### Task 7: Retire or hard-disable the old remote TUI runtime

**Stories:** `28-7`

**Files:**
- Modify: `mc/runtime/interactive.py`
- Modify: `mc/runtime/interactive_transport.py`
- Modify: `mc/contexts/interactive/coordinator.py`
- Modify: `mc/infrastructure/interactive/tmux.py`
- Modify: `mc/infrastructure/interactive/pty.py`
- Modify: `docs/ARCHITECTURE.md`
- Test: `tests/mc/provider_cli/test_tui_retirement.py`

**Work:**
- Remove the legacy runtime where safe, or gate it off by default with explicit deprecation.
- Delete dead ownership paths that would let tmux/PTTY become truth again.
- Update docs to reflect the new supported architecture.

**Done when:**
- The supported runtime path no longer includes the remote tmux-backed TUI stack.

---

## Recommended Execution Order

1. Fix the supervision blocker from `28-0b`.
2. Land `28-1` and make it the active step runtime path.
3. Land `28-2` and move Claude off tmux first.
4. Rebind `Live` and intervention flows to the new runtime.
5. Migrate Codex and Nanobot onto the same contract.
6. Retire the legacy TUI runtime.

## Validation Checklist

- Python focused:
  - `uv run pytest tests/mc/test_interactive_supervisor.py tests/mc/bridge/test_repositories.py`
  - `uv run pytest tests/mc/provider_cli`
  - `uv run pytest tests/mc/application/execution/test_interactive_mode.py tests/mc/application/execution/test_interactive_strategy.py`
- Python guardrails:
  - `uv run pytest tests/mc/test_architecture.py tests/mc/test_module_reorganization.py tests/mc/infrastructure/test_boundary.py`
- Dashboard focused:
  - `npm run test -- dashboard/features/interactive/components/InteractiveTerminalPanel.test.tsx`
  - `npm run test:architecture`
- End-to-end:
  - `uv run nanobot mc start`
  - Validate Claude step execution and `Live` with Playwright CLI on a clean task.

## Milestones

- **Milestone A:** Claude runs through provider CLI, but legacy runtime still exists behind the scenes.
- **Milestone B:** `Live` and intervention are provider-session-based for Claude.
- **Milestone C:** Codex and Nanobot match the same runtime contract.
- **Milestone D:** Legacy tmux-backed remote TUI is retired.
