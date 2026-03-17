# Interactive Runtime Stabilization and Provider CLI Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stabilize the post-Epic-27 interactive runtime just enough to restore trustworthy planning, supervision, and operator visibility, then migrate Claude step execution onto the provider CLI process core so Mission Control no longer depends on `tmux` for the supported live-share path.

**Architecture:** This plan intentionally splits the work into two phases. Phase A is a short stabilization wave over the current interactive runtime, focused only on regressions that currently break planning, activity projection, and status transitions. Phase B starts Epic 28 by introducing the provider CLI process/session core and moving the Claude step path onto it as the first provider-backed migration away from the PTY/`tmux` transport.

**Tech Stack:** Python backend runtime, Convex bridge and mutations, Claude Code IPC/hooks, provider process supervision, pytest, ruff, Next.js dashboard, Playwright CLI.

---

### Task 1: Lock Anthropic adaptive-thinking temperature behavior with tests

**Files:**
- Modify: `vendor/nanobot/nanobot/providers/anthropic_oauth_provider.py`
- Test: `tests/mc/test_provider_factory.py`
- Test: `tests/cc/test_provider.py`

**Step 1: Write the failing test**

Add focused tests covering:

- adaptive thinking requests force `temperature=1.0`
- enabled/budgeted thinking requests force `temperature=1.0`
- non-thinking Anthropic requests keep their caller-supplied temperature

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/cc/test_provider.py -q`
Expected: FAIL because the current coverage does not prove the contract.

**Step 3: Write minimal implementation**

Keep the existing hotfix only if the failing tests prove the Anthropic payload contract exactly. Avoid broad temperature rewriting outside thinking-enabled paths.

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/cc/test_provider.py -q`
Expected: PASS

**Step 5: Commit**

```bash
git add vendor/nanobot/nanobot/providers/anthropic_oauth_provider.py tests/cc/test_provider.py
git commit -m "test: lock anthropic thinking temperature contract"
```

### Task 2: Lock planning to the Lead Agent configured model

**Files:**
- Modify: `mc/runtime/workers/planning.py`
- Test: `tests/mc/workers/test_planning.py`

**Step 1: Write the failing test**

Add tests covering:

- Lead Agent configured with `cc/...` routes planning through the CC path
- Lead Agent configured with a tier reference resolves from the Lead Agent model instead of a hardcoded planning tier
- Lead Agent missing from delegatable agents still contributes its configured model from raw agent data
- planner failure remains visible and does not silently fall back

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/workers/test_planning.py -q`
Expected: FAIL because current tests do not fully pin the new planning-source contract.

**Step 3: Write minimal implementation**

Keep the existing hotfix only if the failing tests prove the intended behavior. Remove any remaining hardcoded planning-tier path for the default case.

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/mc/workers/test_planning.py -q`
Expected: PASS

**Step 5: Commit**

```bash
git add mc/runtime/workers/planning.py tests/mc/workers/test_planning.py
git commit -m "test: lock planning to lead agent model"
```

### Task 3: Lock session activity payload serialization

**Files:**
- Modify: `mc/contexts/interactive/supervisor.py`
- Test: `tests/mc/test_interactive_supervisor.py`

**Step 1: Write the failing test**

Add tests proving:

- optional string fields are omitted from `sessionActivityLog:append` when absent
- no `null` values are sent for optional Convex string fields
- required fields remain present and correctly named

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/test_interactive_supervisor.py -q`
Expected: FAIL because the payload-shape contract is not fully pinned.

**Step 3: Write minimal implementation**

Keep the payload builder explicit and avoid broad exception-swallowing around payload construction.

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/mc/test_interactive_supervisor.py -q`
Expected: PASS

**Step 5: Commit**

```bash
git add mc/contexts/interactive/supervisor.py tests/mc/test_interactive_supervisor.py
git commit -m "test: lock interactive session activity payload shape"
```

### Task 4: Make supervision status projection idempotent instead of best-effort

**Files:**
- Modify: `mc/contexts/interactive/supervisor.py`
- Modify: `mc/bridge/repositories/tasks.py`
- Modify: `mc/bridge/repositories/steps.py`
- Test: `tests/mc/test_interactive_supervisor.py`
- Test: `tests/mc/bridge/test_repositories.py`

**Step 1: Write the failing test**

Add tests proving:

- repeated `turn_started` or `item_started` events do not attempt invalid `in_progress -> in_progress`
- repeated `running` step projection does not attempt invalid `running -> running`
- genuine transition failures still surface and are not silently swallowed

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/test_interactive_supervisor.py tests/mc/bridge/test_repositories.py -q`
Expected: FAIL because current behavior relies on broad `try/except`.

**Step 3: Write minimal implementation**

Replace generic swallow behavior with explicit idempotency:

- inspect current task/step status before mutating when feasible
- or detect and suppress only the specific “same status” transition error
- preserve logging/raising for unexpected mutation failures

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/mc/test_interactive_supervisor.py tests/mc/bridge/test_repositories.py -q`
Expected: PASS

**Step 5: Commit**

```bash
git add mc/contexts/interactive/supervisor.py mc/bridge/repositories/tasks.py mc/bridge/repositories/steps.py tests/mc/test_interactive_supervisor.py tests/mc/bridge/test_repositories.py
git commit -m "fix: make supervision status projection idempotent"
```

### Task 5: Restore operator visibility for the current Claude step path

**Files:**
- Modify: `mc/contexts/interactive/adapters/claude_code.py`
- Modify: `vendor/claude-code/claude_code/workspace.py`
- Modify: `vendor/claude-code/claude_code/ipc_server.py`
- Modify: `dashboard/features/tasks/components/TaskDetailSheet.tsx`
- Test: `tests/mc/test_interactive_claude_adapter.py`
- Test: `tests/cc/test_workspace.py`
- Test: `dashboard/components/TaskDetailSheet.test.tsx`

**Step 1: Write the failing test**

Add tests covering the specific regression:

- a Claude step session starts with an execution turn rather than sitting indefinitely at an initial CLI prompt
- the task detail surface exposes the running session as observable/intervenable when the session exists

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/test_interactive_claude_adapter.py tests/cc/test_workspace.py -q`
Run: `cd dashboard && npm test -- components/TaskDetailSheet.test.tsx`
Expected: FAIL because the current runtime still behaves like a raw terminal session.

**Step 3: Write minimal implementation**

Stabilize only what is required for visibility and startup correctness. Do not deepen `tmux` coupling. This task is a temporary operational fix before the provider CLI migration.

**Step 4: Run test to verify it passes**

Run the same focused pytest and dashboard suites.
Expected: PASS

**Step 5: Commit**

```bash
git add mc/contexts/interactive/adapters/claude_code.py vendor/claude-code/claude_code/workspace.py vendor/claude-code/claude_code/ipc_server.py dashboard/features/tasks/components/TaskDetailSheet.tsx tests/mc/test_interactive_claude_adapter.py tests/cc/test_workspace.py dashboard/components/TaskDetailSheet.test.tsx
git commit -m "fix: restore claude step visibility and startup behavior"
```

### Task 6: Implement Epic 28.1 provider CLI session core

**Files:**
- Create: `mc/contexts/provider_cli/types.py`
- Create: `mc/contexts/provider_cli/parser.py`
- Create: `mc/contexts/provider_cli/registry.py`
- Create: `mc/runtime/provider_cli/process_supervisor.py`
- Create: `mc/runtime/provider_cli/live_stream.py`
- Test: `tests/mc/test_provider_cli_types.py`
- Test: `tests/mc/test_provider_cli_parser_protocol.py`
- Test: `tests/mc/test_provider_process_supervisor.py`
- Test: `tests/mc/test_provider_cli_registry.py`
- Test: `tests/mc/test_provider_live_stream.py`

**Step 1: Write the failing tests**

Follow Story `28.1` exactly and add the core failing tests before any implementation.

**Step 2: Run tests to verify they fail**

Run the new focused pytest modules individually.
Expected: FAIL with missing modules/symbols.

**Step 3: Write minimal implementation**

Implement only the shared process/session/live-stream foundation. Do not touch browser terminal code or `interactive_transport.py`.

**Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/mc/test_provider_cli_types.py tests/mc/test_provider_cli_parser_protocol.py tests/mc/test_provider_process_supervisor.py tests/mc/test_provider_cli_registry.py tests/mc/test_provider_live_stream.py -q`
Expected: PASS

**Step 5: Commit**

```bash
git add mc/contexts/provider_cli mc/runtime/provider_cli tests/mc/test_provider_cli_types.py tests/mc/test_provider_cli_parser_protocol.py tests/mc/test_provider_process_supervisor.py tests/mc/test_provider_cli_registry.py tests/mc/test_provider_live_stream.py
git commit -m "feat: add provider cli session core"
```

### Task 7: Implement Epic 28.2 and move Claude step execution onto the new core

**Files:**
- Create: `mc/contexts/provider_cli/providers/claude_code.py`
- Modify: `mc/contexts/interactive/adapters/claude_code.py`
- Modify: `mc/application/execution/interactive_mode.py`
- Modify: `mc/application/execution/strategies/interactive.py`
- Modify: `mc/runtime/interactive.py`
- Test: `tests/mc/test_provider_cli_claude_code.py`
- Test: `tests/mc/application/execution/test_interactive_mode.py`
- Test: `tests/mc/application/execution/test_interactive_strategy.py`

**Step 1: Write the failing test**

Add tests proving:

- Claude provider session discovery works through the parser contract
- Claude step execution can launch through the process supervisor path
- interrupt/resume capability flags are surfaced
- the step path no longer requires `tmux` in the supported Claude flow

**Step 2: Run test to verify it fails**

Run the focused pytest suite for the new parser and execution routing.
Expected: FAIL because Claude still routes through `RunnerType.INTERACTIVE_TUI`.

**Step 3: Write minimal implementation**

Wire Claude as the pilot provider on the new process-based runtime. Keep old `tmux` code intact but non-canonical while Codex and Nanobot are still pending migration.

**Step 4: Run test to verify it passes**

Run the focused parser and execution pytest suite.
Expected: PASS

**Step 5: Commit**

```bash
git add mc/contexts/provider_cli/providers/claude_code.py mc/contexts/interactive/adapters/claude_code.py mc/application/execution/interactive_mode.py mc/application/execution/strategies/interactive.py mc/runtime/interactive.py tests/mc/test_provider_cli_claude_code.py tests/mc/application/execution/test_interactive_mode.py tests/mc/application/execution/test_interactive_strategy.py
git commit -m "feat: move claude interactive execution to provider cli core"
```

### Task 8: Run wave guardrails and record migration boundary

**Files:**
- Modify: `docs/plans/2026-03-14-provider-cli-parser-wave-plan.md`
- Modify: `_bmad-output/implementation-artifacts/sprint-status.yaml`

**Step 1: Run focused validation**

Run:

- the focused pytest suites from Tasks 1 through 7
- `uv run pytest tests/mc/test_architecture.py tests/mc/test_module_reorganization.py tests/mc/infrastructure/test_boundary.py`
- dashboard tests touched by the stabilization task
- `cd dashboard && npm run test:architecture`

**Step 2: Validate the real stack**

Run the full stack from repo root:

```bash
PORT=3001 uv run nanobot mc start
```

Then validate with `playwright-cli`:

- planning uses the Lead Agent configured model
- a Claude step is observable and controllable
- no supported Claude live-share path requires the remote TUI entrypoint

**Step 3: Record outcomes**

Update the wave plan and sprint tracking with:

- what remains on the old `tmux` path
- whether Codex and Nanobot still depend on transitional runtime pieces
- what is now canonical for Claude

**Step 4: Commit**

```bash
git add docs/plans/2026-03-14-provider-cli-parser-wave-plan.md _bmad-output/implementation-artifacts/sprint-status.yaml
git commit -m "docs: record provider cli migration boundary"
```
