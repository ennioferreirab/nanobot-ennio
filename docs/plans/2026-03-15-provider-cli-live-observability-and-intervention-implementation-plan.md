# Provider CLI Live Observability And Intervention Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** entregar observabilidade e intervenção reais para sessões `provider-cli`, provando no backend que o runtime registra eventos e que `interrupt/stop/resume` mudam o subprocesso de verdade.

**Architecture:** o backend vira a fonte de verdade. O `provider-cli` deve reaproveitar o contrato canônico de supervisão do runtime interativo, publicando telemetria em `interactiveSessions` e `sessionActivityLog`; um control plane backend chama `HumanInterventionController`; os testes E2E backend-only são o gate primário. Dashboard fica fora de escopo desta etapa.

**Tech Stack:** Python backend, Convex functions, provider-cli runtime, pytest, ruff

---

## References

- General plan: `docs/plans/2026-03-15-provider-cli-live-observability-and-intervention-plan.md`
- Wave plan: `docs/plans/2026-03-15-provider-cli-live-observability-and-intervention-wave-plan.md`
- Existing remediation: `docs/plans/2026-03-15-provider-cli-cutover-remediation-plan.md`

## Task 1: Project provider-cli events through the canonical supervision path

**Files:**
- Modify: `mc/application/execution/strategies/provider_cli.py`
- Modify: `mc/runtime/provider_cli/live_stream.py`
- Modify: `mc/contexts/interactive/supervisor.py`
- Modify: `mc/contexts/interactive/registry.py`
- Modify: `mc/runtime/gateway.py`
- Modify: `mc/infrastructure/runtime_context.py`
- Test: `tests/mc/provider_cli/test_live_stream.py`
- Test: `tests/mc/provider_cli/test_provider_cli_step_execution.py`
- Test: `tests/mc/test_interactive_supervisor.py`
- Test: `dashboard/convex/sessionActivityLog.test.ts`

**Step 1: Write the failing tests**

- Add a backend test proving streamed provider events are projected with session id and sequence.
- Add a backend integration test proving strategy execution appends activity records for text/tool/result/error events via the canonical supervision contract.
- Add a Convex test proving `sessionActivityLog.append` stores tool and summary fields as expected.

**Step 2: Run tests to verify they fail**

Run:

```bash
uv run pytest tests/mc/provider_cli/test_live_stream.py tests/mc/provider_cli/test_provider_cli_step_execution.py -q
npm run test -- dashboard/convex/sessionActivityLog.test.ts
```

**Step 3: Write minimal implementation**

- Project `ParsedCliEvent` into `LiveStreamProjector`.
- Adapt projected provider events into the same supervision payload used by `InteractiveExecutionSupervisor`.
- Persist projected events into `sessionActivityLog` through the existing supervision sink instead of a provider-specific shortcut.

**Step 4: Run tests to verify they pass**

Run the same commands.

**Step 5: Commit**

```bash
git add mc/application/execution/strategies/provider_cli.py mc/runtime/provider_cli/live_stream.py mc/contexts/interactive/supervisor.py mc/contexts/interactive/registry.py mc/runtime/gateway.py mc/infrastructure/runtime_context.py tests/mc/provider_cli/test_live_stream.py tests/mc/provider_cli/test_provider_cli_step_execution.py tests/mc/test_interactive_supervisor.py dashboard/convex/sessionActivityLog.test.ts
git commit -m "feat: project provider-cli session activity to convex"
```

## Task 2: Persist session metadata and bootstrap prompt

**Files:**
- Modify: `dashboard/convex/interactiveSessions.ts`
- Modify: `dashboard/convex/schema.ts`
- Modify: `mc/application/execution/strategies/provider_cli.py`
- Modify: `mc/application/execution/request.py`
- Modify: `mc/contexts/interactive/registry.py`
- Test: `dashboard/convex/interactiveSessions.test.ts`
- Test: `tests/mc/application/execution/test_provider_cli_strategy.py`
- Test: `tests/mc/test_interactive_session_registry.py`

**Step 1: Write the failing tests**

- Add a Convex test that expects provider-cli session metadata to include status, last error, last event kind, and bootstrap prompt.
- Add a backend test that expects strategy execution to upsert session metadata with prompt and summary fields.

**Step 2: Run tests to verify they fail**

Run:

```bash
uv run pytest tests/mc/application/execution/test_provider_cli_strategy.py -q
npm run test -- dashboard/convex/interactiveSessions.test.ts
```

**Step 3: Write minimal implementation**

- Extend `interactiveSessions` metadata for provider-cli sessions.
- Persist `bootstrapPrompt` or equivalent preview fields.
- Persist provider session id and related runtime identifiers when discovered.
- Ensure failures update `lastError` and completion updates `finalResult`.

**Step 4: Run tests to verify they pass**

Run the same commands.

**Step 5: Commit**

```bash
git add dashboard/convex/interactiveSessions.ts dashboard/convex/schema.ts mc/application/execution/strategies/provider_cli.py mc/application/execution/request.py mc/contexts/interactive/registry.py tests/mc/application/execution/test_provider_cli_strategy.py tests/mc/test_interactive_session_registry.py dashboard/convex/interactiveSessions.test.ts
git commit -m "feat: persist provider-cli session metadata and prompt"
```

## Task 3: Add real provider-cli interrupt / stop / resume control plane

**Files:**
- Modify: `mc/runtime/provider_cli/intervention.py`
- Modify: `mc/runtime/gateway.py`
- Modify: `mc/infrastructure/runtime_context.py`
- Add: `mc/contexts/provider_cli/control_plane.py`
- Test: `tests/mc/provider_cli/test_intervention.py`
- Test: `tests/mc/provider_cli/test_control_plane.py`

**Step 1: Write the failing tests**

- Add backend tests proving interrupt calls parser/supervisor and changes registry state.
- Add backend tests proving stop terminates a session and persists a stopped state.
- Add backend tests proving resume is routed only when provider support exists.

**Step 2: Run tests to verify they fail**

Run:

```bash
uv run pytest tests/mc/provider_cli/test_intervention.py tests/mc/provider_cli/test_control_plane.py -q
```

**Step 3: Write minimal implementation**

- Create a backend control plane service that resolves `mc_session_id -> handle/parser`.
- Expose internal/backend-callable operations for interrupt/stop/resume.
- Make the backend path persist command results and resulting session state.

**Step 4: Run tests to verify they pass**

Run the same commands.

**Step 5: Commit**

```bash
git add mc/runtime/provider_cli/intervention.py mc/runtime/gateway.py mc/infrastructure/runtime_context.py mc/contexts/provider_cli/control_plane.py tests/mc/provider_cli/test_intervention.py tests/mc/provider_cli/test_control_plane.py
git commit -m "feat: add real provider-cli intervention control plane"
```

## Task 4: Prove provider-cli intervention effects backend-only

**Files:**
- Add: `tests/mc/provider_cli/test_provider_cli_e2e_control.py`
- Modify: `mc/runtime/provider_cli/process_supervisor.py`
- Modify: `mc/application/execution/strategies/provider_cli.py`
- Test: `tests/mc/provider_cli/test_process_supervisor.py`

**Step 1: Write the failing tests**

- Add an e2e backend test using a deterministic subprocess fixture that:
  - starts and emits output
  - can be interrupted
  - can be stopped
  - updates registry and activity log correctly
- Add a failure-mode test proving a stuck process can be stopped and leaves terminal state consistent.

**Step 2: Run tests to verify they fail**

Run:

```bash
uv run pytest tests/mc/provider_cli/test_provider_cli_e2e_control.py tests/mc/provider_cli/test_process_supervisor.py -q
```

**Step 3: Write minimal implementation**

- Use a real subprocess fixture, not only mocks.
- Guarantee the control plane reaches the actual `ProviderProcessSupervisor`.
- Record terminal state deterministically.

**Step 4: Run tests to verify they pass**

Run the same commands.

**Step 5: Commit**

```bash
git add tests/mc/provider_cli/test_provider_cli_e2e_control.py mc/runtime/provider_cli/process_supervisor.py mc/application/execution/strategies/provider_cli.py tests/mc/provider_cli/test_process_supervisor.py
git commit -m "test: prove provider-cli control effects end to end"
```

## Task 5: Capture backend command-effect diagnostics

**Files:**
- Modify: `mc/contexts/provider_cli/control_plane.py`
- Modify: `mc/runtime/provider_cli/intervention.py`
- Modify: `mc/contexts/interactive/registry.py`
- Modify: `dashboard/convex/interactiveSessions.ts`
- Modify: `dashboard/convex/schema.ts`
- Test: `tests/mc/provider_cli/test_control_plane.py`
- Test: `tests/mc/provider_cli/test_intervention.py`
- Test: `dashboard/convex/interactiveSessions.test.ts`

**Step 1: Write the failing tests**

- Add a backend test proving every control command persists a diagnostic trace.
- Add a backend test proving failed commands surface actionable error details.
- Add a Convex test proving command-effect metadata is queryable from session state.

**Step 2: Run tests to verify they fail**

Run:

```bash
uv run pytest tests/mc/provider_cli/test_control_plane.py tests/mc/provider_cli/test_intervention.py -q
npm run test -- dashboard/convex/interactiveSessions.test.ts
```

**Step 3: Write minimal implementation**

- Persist command diagnostics such as:
  - `lastControlCommand`
  - `lastControlRequestedAt`
  - `lastControlAppliedAt`
  - `lastControlOutcome`
  - `lastControlError`
- Append command lifecycle events to `sessionActivityLog`.
- Ensure operator diagnostics can be retrieved from backend state without logs.

**Step 4: Run tests to verify they pass**

Run the same commands.

**Step 5: Commit**

```bash
git add mc/contexts/provider_cli/control_plane.py mc/runtime/provider_cli/intervention.py mc/contexts/interactive/registry.py dashboard/convex/interactiveSessions.ts dashboard/convex/schema.ts tests/mc/provider_cli/test_control_plane.py tests/mc/provider_cli/test_intervention.py dashboard/convex/interactiveSessions.test.ts
git commit -m "feat: add provider-cli command effect diagnostics"
```

## Task 6: Stabilize and roll out

**Files:**
- Modify: `docs/plans/2026-03-15-provider-cli-cutover-remediation-checklist.md`
- Add: `docs/plans/2026-03-15-provider-cli-live-observability-and-intervention-checklist.md`
- Modify: `_bmad-output/implementation-artifacts/28-23-stabilize-provider-cli-backend-observability-rollout.md`

**Step 1: Update rollout gates**

- Require backend e2e control proof before any downstream consumer is treated as trustworthy.
- Require session activity fidelity checks.

**Step 2: Run final checks**

Run:

```bash
uv run pytest tests/mc/provider_cli/test_live_stream.py tests/mc/provider_cli/test_intervention.py tests/mc/provider_cli/test_control_plane.py tests/mc/provider_cli/test_provider_cli_e2e_control.py tests/mc/provider_cli/test_provider_cli_step_execution.py tests/mc/test_architecture.py tests/mc/test_module_reorganization.py tests/mc/infrastructure/test_boundary.py
uv run ruff check mc/runtime/provider_cli mc/application/execution/strategies/provider_cli.py
npm run test -- dashboard/convex/sessionActivityLog.test.ts dashboard/convex/interactiveSessions.test.ts
```

**Step 3: Commit**

```bash
git add docs/plans/2026-03-15-provider-cli-cutover-remediation-checklist.md docs/plans/2026-03-15-provider-cli-live-observability-and-intervention-checklist.md _bmad-output/implementation-artifacts/28-23-stabilize-provider-cli-backend-observability-rollout.md
git commit -m "docs: stabilize provider-cli backend observability rollout"
```

## Completion Rule

Nada desse pacote está pronto até que:

- o backend prove start/stream/interrupt/stop com efeito real
- `sessionActivityLog` reflita a sessão provider-cli real
- `interactiveSessions` reflita prompt, erro e comandos operacionais relevantes
- qualquer consumo futuro de dashboard dependa desse backend já provado
