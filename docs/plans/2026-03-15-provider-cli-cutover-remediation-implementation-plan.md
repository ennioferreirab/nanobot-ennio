# Provider CLI Cutover Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** corrigir os bloqueios reais do cutover `provider-cli` no backend: prompt vazio no fluxo real, runtime wiring não propagado e ausência de prova backend-only do path suportado.

**Architecture:** centralizar a correção no pipeline canônico de execução. O `ContextBuilder` monta o prompt final; `Executor` e `StepDispatcher` usam o mesmo wiring do engine; o runtime real consome os serviços `provider-cli` compostos no gateway; só depois disso os gates de `28-11` e `28-12` voltam a andar.

**Tech Stack:** Python backend, provider CLI runtime, pytest, ruff

---

## References

- General plan: `docs/plans/2026-03-15-provider-cli-cutover-remediation-plan.md`
- Wave plan: `docs/plans/2026-03-15-provider-cli-cutover-remediation-wave-plan.md`
- Prior cutover plan: `docs/plans/2026-03-15-provider-cli-backend-cutover-recovery-plan.md`
- Story: `_bmad-output/implementation-artifacts/28-13-populate-canonical-provider-cli-prompt.md`
- Story: `_bmad-output/implementation-artifacts/28-14-route-gateway-provider-cli-services-through-runtime.md`
- Story: `_bmad-output/implementation-artifacts/28-15-prove-provider-cli-step-execution-backend-only.md`
- Story: `_bmad-output/implementation-artifacts/28-17-preserve-agent-prompt-in-provider-cli-bootstrap.md`
- Story: `_bmad-output/implementation-artifacts/28-16-rebaseline-provider-cli-cutover-gates.md`

## Task 1: Populate canonical provider-cli prompt

**Files:**
- Modify: `mc/application/execution/context_builder.py`
- Modify: `mc/application/execution/request.py`
- Modify: `mc/application/execution/strategies/provider_cli.py`
- Test: `tests/mc/application/execution/test_context_builder.py`
- Test: `tests/mc/application/execution/test_provider_cli_strategy.py`

**Step 1: Write the failing tests**

- Add a task-context test that expects `ExecutionRequest.prompt` to be populated when the runner path is provider-cli.
- Add a step-context test that expects `ExecutionRequest.prompt` to include the step mission/context.
- Add a strategy test that proves `_build_command()` receives a non-empty prompt from the real request-building path.

**Step 2: Run tests to verify they fail**

Run:

```bash
uv run pytest tests/mc/application/execution/test_context_builder.py tests/mc/application/execution/test_provider_cli_strategy.py -q
```

Expected:

- failure showing `request.prompt == ""` or command missing `--prompt`

**Step 3: Write minimal implementation**

- Define the canonical rule for `request.prompt` in `ContextBuilder`.
- Keep `agent_prompt` and `description` separate; do not make the strategy reconstruct prompt semantics.
- Ensure both task and step builders populate the new field consistently.

**Step 4: Run tests to verify they pass**

Run:

```bash
uv run pytest tests/mc/application/execution/test_context_builder.py tests/mc/application/execution/test_provider_cli_strategy.py -q
```

Expected:

- pass

**Step 5: Commit**

```bash
git add mc/application/execution/context_builder.py mc/application/execution/request.py mc/application/execution/strategies/provider_cli.py tests/mc/application/execution/test_context_builder.py tests/mc/application/execution/test_provider_cli_strategy.py
git commit -m "fix: populate canonical provider-cli prompt"
```

## Task 2: Route gateway-composed provider-cli services through runtime

**Files:**
- Modify: `mc/runtime/gateway.py`
- Modify: `mc/application/execution/post_processing.py`
- Modify: `mc/contexts/execution/step_dispatcher.py`
- Modify: `mc/contexts/execution/executor.py`
- Modify: `mc/application/execution/engine.py`
- Test: `tests/mc/provider_cli/test_runtime_wiring.py`
- Test: `tests/mc/contexts/execution/test_step_dispatcher.py`
- Test: `tests/mc/contexts/execution/test_executor.py`

**Step 1: Write the failing tests**

- Add a test proving the runtime-composed registry/supervisor instances are the same objects seen by the engine used in step execution.
- Add a test proving `StepDispatcher` no longer bypasses its own engine-builder/wiring path.
- Add a task execution test proving `Executor` and `StepDispatcher` share the same provider-cli injection contract.

**Step 2: Run tests to verify they fail**

Run:

```bash
uv run pytest tests/mc/provider_cli/test_runtime_wiring.py tests/mc/contexts/execution/test_step_dispatcher.py tests/mc/contexts/execution/test_executor.py -q
```

Expected:

- failure showing fresh default registry/supervisor creation or bypassed builder path

**Step 3: Write minimal implementation**

- Introduce a single supported path for engine construction in task and step execution.
- Pass provider-cli services through the runtime/execution call chain.
- Remove or hard-disable the bypass path in `_run_step_agent()` that constructs an under-injected engine.
- Keep default object creation only for isolated tests or explicit non-runtime call sites.

**Step 4: Run tests to verify they pass**

Run:

```bash
uv run pytest tests/mc/provider_cli/test_runtime_wiring.py tests/mc/contexts/execution/test_step_dispatcher.py tests/mc/contexts/execution/test_executor.py -q
```

Expected:

- pass

**Step 5: Commit**

```bash
git add mc/runtime/gateway.py mc/application/execution/post_processing.py mc/contexts/execution/step_dispatcher.py mc/contexts/execution/executor.py mc/application/execution/engine.py tests/mc/provider_cli/test_runtime_wiring.py tests/mc/contexts/execution/test_step_dispatcher.py tests/mc/contexts/execution/test_executor.py
git commit -m "fix: route provider-cli runtime services through execution path"
```

## Task 3: Prove backend-only provider-cli step execution

**Files:**
- Modify: `mc/application/execution/interactive_mode.py`
- Modify: `mc/application/execution/strategies/provider_cli.py`
- Modify: `mc/runtime/provider_cli/process_supervisor.py`
- Modify: `mc/runtime/provider_cli/live_stream.py`
- Test: `tests/mc/provider_cli/test_provider_cli_step_execution.py`
- Test: `tests/mc/provider_cli/test_tui_retirement.py`
- Test: `tests/mc/application/execution/test_interactive_mode.py`

**Step 1: Write the failing tests**

- Add an integration-style backend test for the supported path:
  - build a real `ExecutionRequest`
  - resolve `RunnerType.PROVIDER_CLI`
  - verify prompt is present
  - verify no `tmux` dependency is touched
  - verify completion or crash state is projected correctly
- Add a guardrail test that the supported path does not require `interactive_session_coordinator`.

**Step 2: Run tests to verify they fail**

Run:

```bash
uv run pytest tests/mc/provider_cli/test_provider_cli_step_execution.py tests/mc/provider_cli/test_tui_retirement.py tests/mc/application/execution/test_interactive_mode.py -q
```

Expected:

- failure showing missing no-tmux proof or unsupported dependency

**Step 3: Write minimal implementation**

- Close the last runtime gaps needed by the integration test.
- If `LiveStreamProjector` is intended to be runtime state, thread it through the supported path; otherwise remove it from the cutover claim and keep tests focused on canonical completion/crash.
- Keep all validation backend-only.

**Step 4: Run tests to verify they pass**

Run:

```bash
uv run pytest tests/mc/provider_cli/test_provider_cli_step_execution.py tests/mc/provider_cli/test_tui_retirement.py tests/mc/application/execution/test_interactive_mode.py -q
```

Expected:

- pass

**Step 5: Commit**

```bash
git add mc/application/execution/interactive_mode.py mc/application/execution/strategies/provider_cli.py mc/runtime/provider_cli/process_supervisor.py mc/runtime/provider_cli/live_stream.py tests/mc/provider_cli/test_provider_cli_step_execution.py tests/mc/provider_cli/test_tui_retirement.py tests/mc/application/execution/test_interactive_mode.py
git commit -m "test: prove provider-cli step execution without tmux"
```

## Task 4: Preserve agent prompt in provider-cli bootstrap

**Files:**
- Modify: `mc/application/execution/context_builder.py`
- Modify: `mc/application/execution/strategies/provider_cli.py`
- Modify: `mc/application/execution/request.py`
- Test: `tests/mc/application/execution/test_context_builder.py`
- Test: `tests/mc/provider_cli/test_provider_cli_step_execution.py`
- Test: `tests/mc/application/execution/test_provider_cli_strategy.py`

**Step 1: Write the failing tests**

- Add a task-path test proving the bootstrap contract includes `agent_prompt` plus the operational mission.
- Add a step-path test proving orientation/persona survives into the provider-cli bootstrap payload.
- Add a strategy-level test proving the final command/bootstrap seen by provider-cli reflects both layers.

**Step 2: Run tests to verify they fail**

Run:

```bash
uv run pytest tests/mc/application/execution/test_context_builder.py tests/mc/provider_cli/test_provider_cli_step_execution.py tests/mc/application/execution/test_provider_cli_strategy.py -q
```

Expected:

- failure showing provider-cli bootstrap contains only the task/step body and drops `agent_prompt`

**Step 3: Write minimal implementation**

- Define the canonical bootstrap contract for provider-cli.
- Preserve semantic separation between `agent_prompt`, `description`, and `prompt`.
- Ensure both task and step builders follow the same contract.

**Step 4: Run tests to verify they pass**

Run:

```bash
uv run pytest tests/mc/application/execution/test_context_builder.py tests/mc/provider_cli/test_provider_cli_step_execution.py tests/mc/application/execution/test_provider_cli_strategy.py -q
```

Expected:

- pass

**Step 5: Commit**

```bash
git add mc/application/execution/context_builder.py mc/application/execution/strategies/provider_cli.py mc/application/execution/request.py tests/mc/application/execution/test_context_builder.py tests/mc/provider_cli/test_provider_cli_step_execution.py tests/mc/application/execution/test_provider_cli_strategy.py
git commit -m "fix: preserve agent prompt in provider-cli bootstrap"
```

## Task 5: Rebaseline cutover gates and resume 28-11/28-12

**Files:**
- Modify: `docs/plans/2026-03-15-provider-cli-backend-cutover-recovery-plan.md`
- Modify: `docs/plans/2026-03-15-provider-cli-backend-cutover-recovery-wave-plan.md`
- Modify: `docs/plans/2026-03-15-provider-cli-backend-cutover-checklist.md`
- Modify: `_bmad-output/implementation-artifacts/28-11-backend-cutover-gates-and-default-flip.md`
- Modify: `_bmad-output/implementation-artifacts/28-12-retire-interactive-tui-backend-runtime.md`

**Step 1: Update docs to reflect the new prerequisite chain**

- Make `28-11` depend on `28-13` through `28-15`.
- Make `28-12` explicitly blocked until the backend-only proof is green.
- Update the checklist so “no tmux” means the real supported step path, not only module imports or unit seams.

**Step 2: Verify docs are coherent**

Run:

```bash
rg -n "28-11|28-12|provider-cli|tmux|prompt" docs/plans _bmad-output/implementation-artifacts
```

Expected:

- references consistent with the new remediation order

**Step 3: Commit**

```bash
git add docs/plans/2026-03-15-provider-cli-backend-cutover-recovery-plan.md docs/plans/2026-03-15-provider-cli-backend-cutover-recovery-wave-plan.md docs/plans/2026-03-15-provider-cli-backend-cutover-checklist.md _bmad-output/implementation-artifacts/28-11-backend-cutover-gates-and-default-flip.md _bmad-output/implementation-artifacts/28-12-retire-interactive-tui-backend-runtime.md
git commit -m "docs: rebaseline provider-cli cutover gates"
```

## Final Verification

Run:

```bash
uv run ruff format --check mc/application/execution/context_builder.py mc/application/execution/request.py mc/application/execution/strategies/provider_cli.py mc/runtime/gateway.py mc/application/execution/post_processing.py mc/contexts/execution/step_dispatcher.py mc/contexts/execution/executor.py mc/application/execution/engine.py mc/application/execution/interactive_mode.py mc/runtime/provider_cli/process_supervisor.py mc/runtime/provider_cli/live_stream.py tests/mc/application/execution/test_context_builder.py tests/mc/application/execution/test_provider_cli_strategy.py tests/mc/provider_cli/test_runtime_wiring.py tests/mc/contexts/execution/test_step_dispatcher.py tests/mc/contexts/execution/test_executor.py tests/mc/provider_cli/test_provider_cli_step_execution.py tests/mc/provider_cli/test_tui_retirement.py tests/mc/application/execution/test_interactive_mode.py
uv run ruff check mc/application/execution/context_builder.py mc/application/execution/request.py mc/application/execution/strategies/provider_cli.py mc/runtime/gateway.py mc/application/execution/post_processing.py mc/contexts/execution/step_dispatcher.py mc/contexts/execution/executor.py mc/application/execution/engine.py mc/application/execution/interactive_mode.py mc/runtime/provider_cli/process_supervisor.py mc/runtime/provider_cli/live_stream.py tests/mc/application/execution/test_context_builder.py tests/mc/application/execution/test_provider_cli_strategy.py tests/mc/provider_cli/test_runtime_wiring.py tests/mc/contexts/execution/test_step_dispatcher.py tests/mc/contexts/execution/test_executor.py tests/mc/provider_cli/test_provider_cli_step_execution.py tests/mc/provider_cli/test_tui_retirement.py tests/mc/application/execution/test_interactive_mode.py
uv run pytest tests/mc/application/execution/test_context_builder.py tests/mc/application/execution/test_provider_cli_strategy.py tests/mc/provider_cli/test_runtime_wiring.py tests/mc/contexts/execution/test_step_dispatcher.py tests/mc/contexts/execution/test_executor.py tests/mc/provider_cli/test_provider_cli_step_execution.py tests/mc/provider_cli/test_tui_retirement.py tests/mc/application/execution/test_interactive_mode.py tests/mc/test_architecture.py tests/mc/test_module_reorganization.py tests/mc/infrastructure/test_boundary.py
```

## Completion Rule

Do not resume `28-11` or `28-12` until:

- Task 1 through Task 4 are green
- the backend-only step proof passes
- the supported path is proven to run without `tmux`
- the supported path is proven to preserve `agent_prompt` and orientation
- the updated checklist reflects the real runtime path rather than only synthetic seams
