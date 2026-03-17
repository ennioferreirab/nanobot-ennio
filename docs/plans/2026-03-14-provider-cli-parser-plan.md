# Provider CLI Parser Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the remote TUI flow with a provider CLI session architecture that streams live output into the web UI, supports interrupt/resume/stop, and removes obsolete TUI infrastructure.

**Architecture:** Mission Control will own provider CLI processes directly, normalize their output through `ProviderCLIParser` adapters, persist session and process metadata in a new registry, and expose a unified `Live Chat` surface for both interactive chat and live steps. The old PTY/websocket/xterm path will be migrated behind a feature flag and then removed.

**Tech Stack:** Python runtime services, existing interactive supervision, subprocess/process-tree management, Next.js dashboard, Vitest, pytest, ruff.

**Wave Plan:** `docs/plans/2026-03-14-provider-cli-parser-wave-plan.md`

---

### Task 1: Add Provider CLI Domain Types

**Files:**
- Create: `mc/contexts/provider_cli/types.py`
- Test: `tests/mc/test_provider_cli_types.py`

**Step 1: Write the failing test**

Add a test that imports the new dataclasses and validates the required fields for:

- `ProviderProcessHandle`
- `ProviderSessionSnapshot`
- `ParsedCliEvent`

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/test_provider_cli_types.py -q`
Expected: FAIL with import error or missing symbols.

**Step 3: Write minimal implementation**

Create `mc/contexts/provider_cli/types.py` with the shared dataclasses and capability fields from the design.

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/mc/test_provider_cli_types.py -q`
Expected: PASS

**Step 5: Commit**

```bash
git add mc/contexts/provider_cli/types.py tests/mc/test_provider_cli_types.py
git commit -m "feat: add provider cli shared types"
```

### Task 2: Define the ProviderCLIParser Protocol

**Files:**
- Create: `mc/contexts/provider_cli/parser.py`
- Test: `tests/mc/test_provider_cli_parser_protocol.py`

**Step 1: Write the failing test**

Add a test asserting the protocol exposes:

- `start_session`
- `parse_output`
- `discover_session`
- `inspect_process_tree`
- `interrupt`
- `resume`
- `stop`

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/test_provider_cli_parser_protocol.py -q`
Expected: FAIL because the protocol file doesn't exist yet.

**Step 3: Write minimal implementation**

Create `mc/contexts/provider_cli/parser.py` and define the protocol using the new shared types.

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/mc/test_provider_cli_parser_protocol.py -q`
Expected: PASS

**Step 5: Commit**

```bash
git add mc/contexts/provider_cli/parser.py tests/mc/test_provider_cli_parser_protocol.py
git commit -m "feat: define provider cli parser protocol"
```

### Task 3: Build the Provider Process Supervisor

**Files:**
- Create: `mc/runtime/provider_cli/process_supervisor.py`
- Test: `tests/mc/test_provider_process_supervisor.py`

**Step 1: Write the failing test**

Add tests for:

- launching a process and recording `pid`
- capturing `pgid` when available
- sending interrupt/terminate signals
- returning a basic child-process snapshot

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/test_provider_process_supervisor.py -q`
Expected: FAIL because the supervisor doesn't exist yet.

**Step 3: Write minimal implementation**

Create a thin runtime-owned process supervisor that launches subprocesses, captures metadata, and exposes signal helpers.

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/mc/test_provider_process_supervisor.py -q`
Expected: PASS

**Step 5: Commit**

```bash
git add mc/runtime/provider_cli/process_supervisor.py tests/mc/test_provider_process_supervisor.py
git commit -m "feat: add provider process supervisor"
```

### Task 4: Add the Provider Session Registry

**Files:**
- Create: `mc/contexts/provider_cli/registry.py`
- Test: `tests/mc/test_provider_cli_registry.py`

**Step 1: Write the failing test**

Add tests covering:

- creating a provider session record
- updating process metadata
- persisting discovered `provider_session_id`
- transitioning between `starting`, `running`, `interrupting`, `human_intervening`, `resuming`

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/test_provider_cli_registry.py -q`
Expected: FAIL because the registry doesn't exist.

**Step 3: Write minimal implementation**

Create an in-process registry abstraction first, shaped so it can later project into the bridge/Convex layer.

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/mc/test_provider_cli_registry.py -q`
Expected: PASS

**Step 5: Commit**

```bash
git add mc/contexts/provider_cli/registry.py tests/mc/test_provider_cli_registry.py
git commit -m "feat: add provider cli session registry"
```

### Task 5: Build the Live Stream Projector

**Files:**
- Create: `mc/runtime/provider_cli/live_stream.py`
- Test: `tests/mc/test_provider_live_stream.py`

**Step 1: Write the failing test**

Add tests proving that parsed CLI events are projected into a single ordered live stream suitable for:

- interactive chat
- live step share

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/test_provider_live_stream.py -q`
Expected: FAIL because the projector doesn't exist yet.

**Step 3: Write minimal implementation**

Create a stream projector that accepts `ParsedCliEvent` objects and emits normalized web-facing events.

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/mc/test_provider_live_stream.py -q`
Expected: PASS

**Step 5: Commit**

```bash
git add mc/runtime/provider_cli/live_stream.py tests/mc/test_provider_live_stream.py
git commit -m "feat: add provider live stream projector"
```

### Task 6: Implement Claude Code Parser

**Files:**
- Create: `mc/contexts/provider_cli/providers/claude_code.py`
- Modify: `mc/contexts/interactive/adapters/claude_code.py`
- Test: `tests/mc/test_provider_cli_claude_code.py`

**Step 1: Write the failing test**

Cover:

- session discovery from Claude Code output or structured events
- `resume` capability declaration
- interrupt behavior wired through the new abstraction
- live output parsing into normalized events

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/test_provider_cli_claude_code.py -q`
Expected: FAIL because the parser doesn't exist.

**Step 3: Write minimal implementation**

Create the parser and adapt the Claude Code interactive path to publish into the new process/session model.

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/mc/test_provider_cli_claude_code.py -q`
Expected: PASS

**Step 5: Commit**

```bash
git add mc/contexts/provider_cli/providers/claude_code.py mc/contexts/interactive/adapters/claude_code.py tests/mc/test_provider_cli_claude_code.py
git commit -m "feat: add claude code provider cli parser"
```

### Task 7: Implement Codex Parser

**Files:**
- Create: `mc/contexts/provider_cli/providers/codex.py`
- Modify: `mc/contexts/interactive/adapters/codex.py`
- Test: `tests/mc/test_provider_cli_codex.py`

**Step 1: Write the failing test**

Cover:

- provider session discovery
- `resume` capability declaration
- normalized output parsing
- interrupt and stop behavior wiring

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/test_provider_cli_codex.py -q`
Expected: FAIL because the parser doesn't exist.

**Step 3: Write minimal implementation**

Create the Codex parser and adapt existing interactive startup to use it.

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/mc/test_provider_cli_codex.py -q`
Expected: PASS

**Step 5: Commit**

```bash
git add mc/contexts/provider_cli/providers/codex.py mc/contexts/interactive/adapters/codex.py tests/mc/test_provider_cli_codex.py
git commit -m "feat: add codex provider cli parser"
```

### Task 8: Implement Nanobot Runtime-Owned Parser

**Files:**
- Create: `mc/contexts/provider_cli/providers/nanobot.py`
- Modify: `mc/contexts/interactive/adapters/nanobot.py`
- Modify: `mc/runtime/nanobot_interactive_session.py`
- Test: `tests/mc/test_provider_cli_nanobot.py`

**Step 1: Write the failing test**

Cover:

- runtime-owned mode declaration
- use of Nanobot `session_key`
- interrupt/cancel by session
- subagent/session process enrichment where available

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/test_provider_cli_nanobot.py -q`
Expected: FAIL because the parser doesn't exist.

**Step 3: Write minimal implementation**

Create the Nanobot parser using the loop/session model rather than provider-native resume.

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/mc/test_provider_cli_nanobot.py -q`
Expected: PASS

**Step 5: Commit**

```bash
git add mc/contexts/provider_cli/providers/nanobot.py mc/contexts/interactive/adapters/nanobot.py mc/runtime/nanobot_interactive_session.py tests/mc/test_provider_cli_nanobot.py
git commit -m "feat: add nanobot provider cli parser"
```

### Task 9: Add Human Intervention Controller

**Files:**
- Create: `mc/runtime/provider_cli/intervention.py`
- Test: `tests/mc/test_provider_human_intervention.py`

**Step 1: Write the failing test**

Cover the state transitions:

- `running -> interrupting`
- `interrupting -> human_intervening`
- `human_intervening -> resuming`
- `resuming -> running`

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/test_provider_human_intervention.py -q`
Expected: FAIL because the controller doesn't exist.

**Step 3: Write minimal implementation**

Create an orchestration layer that coordinates the registry, supervisor, and provider parser capabilities.

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/mc/test_provider_human_intervention.py -q`
Expected: PASS

**Step 5: Commit**

```bash
git add mc/runtime/provider_cli/intervention.py tests/mc/test_provider_human_intervention.py
git commit -m "feat: add provider human intervention controller"
```

### Task 10: Build Unified Live Chat UI

**Files:**
- Create: `dashboard/features/interactive/components/ProviderLiveChatPanel.tsx`
- Modify: `dashboard/components/ChatPanel.tsx`
- Modify: `dashboard/features/tasks/components/TaskDetailSheet.tsx`
- Test: `dashboard/features/interactive/components/ProviderLiveChatPanel.test.tsx`

**Step 1: Write the failing test**

Cover:

- rendering live provider output
- rendering status and intervention controls
- reuse of the same component in chat and task live share

**Step 2: Run test to verify it fails**

Run: `npm test -- features/interactive/components/ProviderLiveChatPanel.test.tsx`
Expected: FAIL because the panel doesn't exist.

**Step 3: Write minimal implementation**

Create a unified live chat panel and route both existing surfaces to it.

**Step 4: Run test to verify it passes**

Run: `npm test -- features/interactive/components/ProviderLiveChatPanel.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add dashboard/features/interactive/components/ProviderLiveChatPanel.tsx dashboard/components/ChatPanel.tsx dashboard/features/tasks/components/TaskDetailSheet.tsx dashboard/features/interactive/components/ProviderLiveChatPanel.test.tsx
git commit -m "feat: add unified provider live chat panel"
```

### Task 11: Remove TUI-Only UI and Runtime Paths

**Files:**
- Modify: `dashboard/features/interactive/components/InteractiveChatTabs.tsx`
- Modify: `dashboard/features/interactive/components/InteractiveTerminalPanel.tsx`
- Modify: `dashboard/features/interactive/hooks/useTaskInteractiveSession.ts`
- Modify: `dashboard/convex/interactiveSessions.ts`
- Modify: `mc/runtime/interactive.py`
- Modify: `mc/runtime/interactive_transport.py`
- Test: `tests/mc/test_interactive_runtime.py`
- Test: `dashboard/features/interactive/components/InteractiveTerminalPanel.test.tsx`

**Step 1: Write the failing test**

Add or update tests asserting:

- chat and step live share no longer depend on the TUI terminal panel
- TUI-only tabs, transport hooks, and attach flows are either deleted or gated
  as transitional rollout code
- no user-facing path still prefers the remote terminal surface over live chat

**Step 2: Run test to verify it fails**

Run:

- `npm test -- features/interactive/components/InteractiveTerminalPanel.test.tsx`
- `uv run pytest tests/mc/test_interactive_runtime.py -q`

Expected: FAIL because the old path is still wired in.

**Step 3: Write minimal implementation**

Remove or fence off the obsolete TUI-specific interface and runtime branches.
Prefer deleting dead code over leaving duplicate paths. If a rollout flag is
required, make it explicit and ensure the default path is the new live chat
flow.

**Step 4: Run test to verify it passes**

Run:

- `npm test -- features/interactive/components/InteractiveTerminalPanel.test.tsx`
- `uv run pytest tests/mc/test_interactive_runtime.py -q`

Expected: PASS

**Step 5: Commit**

```bash
git add dashboard/features/interactive/components/InteractiveChatTabs.tsx dashboard/features/interactive/components/InteractiveTerminalPanel.tsx mc/runtime/interactive.py mc/runtime/interactive_transport.py tests/mc/test_interactive_runtime.py dashboard/features/interactive/components/InteractiveTerminalPanel.test.tsx
git commit -m "refactor: retire remote tui flow"
```

### Task 12: Mark Superseded TUI Design and Cleanup Docs

**Files:**
- Modify: `docs/plans/2026-03-12-interactive-agent-tui-design.md`
- Modify: `docs/plans/2026-03-14-provider-cli-parser-design.md`
- Modify: `docs/plans/2026-03-14-provider-cli-parser-plan.md`

**Step 1: Write the failing test**

No code test. Instead, review the docs set and list every active document that
still presents remote TUI as the recommended direction.

**Step 2: Verify the mismatch exists**

Run: `rg -n "TUI|remote terminal|xterm|tmux" docs/plans/2026-03-12-interactive-agent-tui-design.md docs/plans/2026-03-14-provider-cli-parser-design.md docs/plans/2026-03-14-provider-cli-parser-plan.md`
Expected: remote TUI language is still present without a superseded marker in
the older design doc.

**Step 3: Write minimal implementation**

Add a clear superseded note to the old TUI design doc and keep the new design
and plan explicit about removal of obsolete TUI codepaths.

**Step 4: Verify the docs are aligned**

Run: `rg -n "supersed|obsolete|retire remote tui" docs/plans/2026-03-12-interactive-agent-tui-design.md docs/plans/2026-03-14-provider-cli-parser-design.md docs/plans/2026-03-14-provider-cli-parser-plan.md`
Expected: PASS with visible markers that the provider CLI parser design is the
current direction.

**Step 5: Commit**

```bash
git add docs/plans/2026-03-12-interactive-agent-tui-design.md docs/plans/2026-03-14-provider-cli-parser-design.md docs/plans/2026-03-14-provider-cli-parser-plan.md
git commit -m "docs: mark remote tui design as superseded"
```

### Task 13: Run Final Guardrails

**Files:**
- Modify: `docs/plans/2026-03-14-provider-cli-parser-design.md`
- Modify: `docs/plans/2026-03-14-provider-cli-parser-plan.md`

**Step 1: Run dashboard verification**

Run:

- `npm run format:file:check -- features/interactive/components/ProviderLiveChatPanel.tsx features/interactive/components/ProviderLiveChatPanel.test.tsx features/interactive/components/InteractiveChatTabs.tsx`
- `npm run lint:file -- features/interactive/components/ProviderLiveChatPanel.tsx features/interactive/components/ProviderLiveChatPanel.test.tsx features/interactive/components/InteractiveChatTabs.tsx`
- `npm run test:architecture`

Expected: PASS

**Step 2: Run Python verification**

Run:

- `uv run ruff format --check mc/contexts/provider_cli mc/runtime/provider_cli mc/runtime/interactive.py`
- `uv run ruff check mc/contexts/provider_cli mc/runtime/provider_cli mc/runtime/interactive.py`
- `uv run pytest tests/mc/test_architecture.py tests/mc/test_module_reorganization.py tests/mc/infrastructure/test_boundary.py -q`

Expected: PASS

**Step 3: Run focused integration suites**

Run:

- `uv run pytest tests/mc/test_provider_cli_types.py tests/mc/test_provider_process_supervisor.py tests/mc/test_provider_cli_registry.py tests/mc/test_provider_live_stream.py tests/mc/test_provider_cli_claude_code.py tests/mc/test_provider_cli_codex.py tests/mc/test_provider_cli_nanobot.py tests/mc/test_provider_human_intervention.py -q`

Expected: PASS

**Step 4: Commit**

```bash
git add docs/plans/2026-03-14-provider-cli-parser-design.md docs/plans/2026-03-14-provider-cli-parser-plan.md
git commit -m "docs: add provider cli parser design and plan"
```
