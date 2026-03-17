# Provider CLI Backend Cutover Recovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** completar o cutover backend para `provider-cli`, provar que Claude roda steps reais sem `tmux`, trocar o default com segurança e só então remover `interactive_tui`.

**Architecture:** manter duas camadas temporariamente, mas fazer o caminho suportado de step execution sair do legado. O gateway compõe o runtime novo; a strategy nova executa; os eventos do provider fecham o lifecycle do step; o legado só sobrevive até a remoção final.

**Tech Stack:** Python backend, provider CLI runtime, Convex bridge, pytest, ruff

---

## References

- General plan: `docs/plans/2026-03-15-provider-cli-backend-cutover-recovery-plan.md`
- Wave plan: `docs/plans/2026-03-15-provider-cli-backend-cutover-recovery-wave-plan.md`
- Checklist: `docs/plans/2026-03-15-provider-cli-backend-cutover-checklist.md`
- Story: `_bmad-output/implementation-artifacts/28-8-compose-provider-cli-runtime-in-gateway.md`
- Story: `_bmad-output/implementation-artifacts/28-9-run-claude-steps-through-provider-cli-core.md`
- Story: `_bmad-output/implementation-artifacts/28-10-close-provider-cli-completion-and-crash-projection.md`
- Story: `_bmad-output/implementation-artifacts/28-11-backend-cutover-gates-and-default-flip.md`
- Story: `_bmad-output/implementation-artifacts/28-12-retire-interactive-tui-backend-runtime.md`

## Task 1: Compose provider-cli runtime in gateway

**Files:**
- Modify: `mc/runtime/gateway.py`
- Modify: `mc/application/execution/engine.py`
- Modify: `mc/application/execution/post_processing.py`
- Modify: `mc/application/execution/interactive_mode.py`
- Modify: `mc/application/execution/strategies/provider_cli.py`
- Test: `tests/mc/provider_cli/test_runtime_wiring.py`
- Test: `tests/mc/application/execution/test_interactive_mode.py`
- Test: `tests/mc/application/execution/test_provider_cli_strategy.py`

**Work:**
- make gateway compose provider-cli services explicitly
- remove hidden dependency on interactive session coordinator for the new path
- keep legacy runtime available only as temporary fallback

**Validation:**
```bash
uv run pytest tests/mc/provider_cli/test_runtime_wiring.py tests/mc/application/execution/test_interactive_mode.py tests/mc/application/execution/test_provider_cli_strategy.py
uv run ruff check mc/runtime/gateway.py mc/application/execution/engine.py mc/application/execution/post_processing.py mc/application/execution/interactive_mode.py mc/application/execution/strategies/provider_cli.py
```

## Task 2: Run Claude steps through provider-cli core

**Files:**
- Modify: `mc/contexts/provider_cli/providers/claude_code.py`
- Modify: `mc/application/execution/strategies/provider_cli.py`
- Modify: `mc/runtime/provider_cli/process_supervisor.py`
- Modify: `mc/runtime/provider_cli/live_stream.py`
- Test: `tests/mc/provider_cli/test_claude_code_parser.py`
- Test: `tests/mc/provider_cli/test_process_supervisor.py`
- Test: `tests/mc/application/execution/test_provider_cli_strategy.py`

**Work:**
- make Claude step startup happen via provider-cli process/session lifecycle
- ensure bootstrap prompt starts execution immediately
- eliminate step dependence on tmux-backed coordinator in this path

**Validation:**
```bash
uv run pytest tests/mc/provider_cli/test_claude_code_parser.py tests/mc/provider_cli/test_process_supervisor.py tests/mc/application/execution/test_provider_cli_strategy.py
uv run ruff check mc/contexts/provider_cli/providers/claude_code.py mc/runtime/provider_cli/process_supervisor.py mc/runtime/provider_cli/live_stream.py mc/application/execution/strategies/provider_cli.py
```

## Task 3: Close completion, crash, and final-result projection

**Files:**
- Modify: `mc/runtime/provider_cli/process_supervisor.py`
- Modify: `mc/runtime/provider_cli/intervention.py`
- Modify: `mc/contexts/provider_cli/registry.py`
- Modify: `mc/application/execution/strategies/provider_cli.py`
- Test: `tests/mc/provider_cli/test_process_supervisor.py`
- Test: `tests/mc/provider_cli/test_intervention.py`
- Test: `tests/mc/provider_cli/test_registry.py`

**Work:**
- prove canonical final result capture
- prove crash projection to step/task state
- prove cleanup and session closure behavior

**Validation:**
```bash
uv run pytest tests/mc/provider_cli/test_process_supervisor.py tests/mc/provider_cli/test_intervention.py tests/mc/provider_cli/test_registry.py
uv run ruff check mc/runtime/provider_cli/process_supervisor.py mc/runtime/provider_cli/intervention.py mc/contexts/provider_cli/registry.py mc/application/execution/strategies/provider_cli.py
```

## Task 4: Flip default behind backend-only cutover gates

**Files:**
- Modify: `mc/application/execution/interactive_mode.py`
- Modify: `mc/runtime/gateway.py`
- Modify: `tests/mc/application/execution/test_interactive_mode.py`
- Modify: `tests/mc/provider_cli/test_runtime_wiring.py`
- Modify: `tests/mc/provider_cli/test_tui_retirement.py`

**Work:**
- change default selection back to `provider-cli`
- keep explicit escape hatch for legacy only if still needed during one transition step
- prove supported path no longer requires tmux at runtime

**Validation:**
```bash
uv run pytest tests/mc/application/execution/test_interactive_mode.py tests/mc/provider_cli/test_runtime_wiring.py tests/mc/provider_cli/test_tui_retirement.py
uv run ruff check mc/application/execution/interactive_mode.py mc/runtime/gateway.py
```

## Task 5: Retire interactive_tui backend runtime

**Files:**
- Modify: `mc/runtime/gateway.py`
- Modify: `mc/runtime/interactive.py`
- Modify: `mc/runtime/interactive_transport.py`
- Modify: `mc/contexts/interactive/coordinator.py`
- Modify: `mc/infrastructure/interactive/tmux.py`
- Modify: `mc/infrastructure/interactive/pty.py`
- Test: `tests/mc/provider_cli/test_tui_retirement.py`
- Test: `tests/mc/test_architecture.py`

**Work:**
- remove dead backend ownership for tmux/PTY runtime
- delete or hard-disable legacy modules
- update tests so supported path forbids tmux-backed step execution

**Validation:**
```bash
uv run pytest tests/mc/provider_cli/test_tui_retirement.py tests/mc/test_architecture.py tests/mc/test_module_reorganization.py tests/mc/infrastructure/test_boundary.py
uv run ruff check mc/runtime/gateway.py mc/runtime/interactive.py mc/runtime/interactive_transport.py mc/contexts/interactive/coordinator.py mc/infrastructure/interactive/tmux.py mc/infrastructure/interactive/pty.py
```

## Completion Rule

Do not declare cutover complete until:

- Task 1 through Task 4 are green in backend tests
- a supported provider path no longer creates tmux sessions
- Task 5 either lands or is the only remaining isolated removal task
