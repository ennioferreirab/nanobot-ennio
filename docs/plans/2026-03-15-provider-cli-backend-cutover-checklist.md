# Provider CLI Backend Cutover Checklist

## Remediation Prerequisites (Stories 28-13 through 28-15)

- [x] `ContextBuilder` populates `request.prompt` for provider-cli runs (Story 28-13)
- [x] Gateway-composed provider-cli services are threaded through Executor → StepDispatcher → engine (Story 28-14)
- [ ] Backend-only integration test proves supported step path runs without tmux (Story 28-15)

## Before Default Flip (Story 28-11, blocked until remediation is green)

- [x] Gateway composes `provider-cli` runtime without borrowing the legacy coordinator (Story 28-8)
- [x] `RunnerType.PROVIDER_CLI` executes a real step path via `ProviderCliRunnerStrategy` (Story 28-8)
- [x] Claude step startup works without `tmux` (Story 28-9)
- [x] Claude step completion produces canonical `final_result` (Story 28-10)
- [x] Claude crash path marks step/task correctly (Story 28-10)
- [x] backend tests for provider-cli runtime wiring are green (Story 28-8)
- [x] backend tests for provider-cli strategy are green (Story 28-9)
- [x] backend tests for Claude parser/process supervisor are green (Story 28-9)

## Default Flip Gate (Story 28-11)

- [x] `resolve_step_runner_type()` defaults to `provider-cli`
- [x] rollback env escape hatch (`interactive-tui`) is explicit and temporary
- [x] supported path does not instantiate `TmuxSessionManager`
- [x] `tests/mc/provider_cli/test_tui_retirement.py` is green

## Removal Gate (Story 28-12)

- [x] no supported backend path imports `mc/runtime/interactive.py` for step execution
- [x] no supported backend path requires `mc/runtime/interactive_transport.py`
- [ ] no supported backend path requires `mc/infrastructure/interactive/tmux.py`
- [ ] no supported backend path requires `mc/infrastructure/interactive/pty.py`
- [x] architecture tests are green after deprecation gating

## Backend Validation Commands

```bash
uv run pytest tests/mc/provider_cli
uv run pytest tests/mc/contexts/provider_cli
uv run pytest tests/mc/application/execution/test_interactive_mode.py tests/mc/application/execution/test_provider_cli_strategy.py
uv run pytest tests/mc/test_architecture.py tests/mc/test_module_reorganization.py tests/mc/infrastructure/test_boundary.py
uv run ruff check mc/runtime/gateway.py mc/application/execution/interactive_mode.py mc/application/execution/strategies/provider_cli.py mc/runtime/provider_cli
```
