# MC MCP-First Phase 1 Tools Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the Phase 1 Mission Control-owned tools to an MCP-first surface in the nanobot MC runtime, while keeping vendor changes minimal and making provider-facing tool serialization explicit and provider-safe.

**Architecture:** Keep upstream nanobot responsible for generic MCP consumption and generic local tools. Add repo-owned MC layers for (1) canonical MC tool specifications, (2) provider-specific tool-schema adaptation, and (3) a repo-owned MC MCP bridge that nanobot can consume through its existing `mcpServers` path. In MC task execution, hide overlapping native tools and expose the canonical MCP-first surface instead. Preserve non-MC nanobot behavior.

**Tech Stack:** Python, pytest, MCP stdio server/client, Mission Control bridge/IPC, nanobot `AgentLoop`, provider wrappers/adapters, Codex/Anthropic/custom providers

---

## References

- Design direction from this thread: Phase 1 MCP-first for `ask_user`, `ask_agent`, `delegate_task`, `send_message`, `cron`, `report_progress`, `record_final_result`
- Existing nanobot MCP client path: `vendor/nanobot/nanobot/agent/tools/mcp.py`
- Existing MC IPC handlers: `vendor/claude-code/claude_code/ipc_server.py`
- Existing MC tool guide: `vendor/claude-code/claude_code/workspace.py`
- Existing provider factory: `mc/infrastructure/providers/factory.py`
- Existing nanobot execution path: `mc/contexts/execution/agent_runner.py`

## Scope Rules

- Treat vendor nanobot as upstream. Do not redesign or fork its MCP client path.
- Prefer new code in `mc/` over edits in `vendor/`.
- If a vendor touch is unavoidable, keep it to a thin import seam or compatibility hook and document why.
- Public tool names remain semantic and stable: `ask_user`, `ask_agent`, `delegate_task`, `send_message`, `cron`, `report_progress`, `record_final_result`.
- Do not rename public tools to transport-coupled names like `send_message_mc`.

## Non-Goals

- Migrating local nanobot tools such as `read_file`, `write_file`, `edit_file`, `list_dir`, `exec`, `web_search`, `web_fetch`, or `spawn`
- Replacing the full Claude Code MCP bridge in the same wave unless a thin compatibility import is trivial
- Broad vendor refactors inside `vendor/nanobot` or `vendor/claude-code`

## Delivery Order

1. Add a provider-facing tool adaptation layer in `mc` so Codex-safe schema translation exists before runtime wiring.
2. Define the canonical MC Phase 1 tool surface in repo-owned code and expose it through a repo-owned MCP bridge.
3. Wire nanobot MC execution to that MCP bridge and hide overlapping native tools in MC runtime only.
4. Fix nanobot error propagation so provider/schema failures do not look like task success.
5. Run focused regression and guardrail checks.

### Task 1: Add the provider-facing tool adapter contract

**Files:**
- Create: `mc/infrastructure/providers/tool_adapters.py`
- Create: `tests/mc/infrastructure/providers/test_tool_adapters.py`
- Modify: `mc/infrastructure/providers/factory.py`
- Modify: `tests/mc/test_provider_factory.py`

**Step 1: Write the failing adapter tests**

Add tests that prove:
- a Codex-facing adapter rejects top-level combinators by translating them before provider submission
- `ask_user` semantic requirements are preserved in adapter metadata/runtime validation rather than raw top-level `oneOf`
- public tool names remain unchanged after adaptation
- wrapping the provider happens in MC factory code, not inside vendor provider implementations

Use a small fixture like:

```python
tool = {
    "type": "function",
    "function": {
        "name": "ask_user",
        "description": "Ask the human user a question.",
        "parameters": {
            "type": "object",
            "properties": {
                "question": {"type": "string"},
                "questions": {"type": "array", "items": {"type": "object"}},
            },
            "oneOf": [{"required": ["question"]}, {"required": ["questions"]}],
        },
    },
}
```

**Step 2: Run the targeted tests and confirm they fail**

Run:

```bash
uv run pytest tests/mc/infrastructure/providers/test_tool_adapters.py tests/mc/test_provider_factory.py -v
```

Expected: FAIL because no adapter layer exists yet and `create_provider()` returns raw providers.

**Step 3: Implement the adapter layer**

Create an MC-owned adapter module with shapes like:

```python
class ProviderToolAdapter(Protocol):
    def adapt_tools(self, tools: list[dict[str, Any]]) -> list[dict[str, Any]]: ...


class CodexToolAdapter:
    def adapt_tools(self, tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
        ...


class AdaptedProvider:
    async def chat(..., tools=None, ...):
        adapted = self._tool_adapter.adapt_tools(tools or [])
        return await self._inner.chat(..., tools=adapted, ...)
```

`factory.py` should keep returning the resolved model string, but the provider instance should be wrapped in MC runtime creation so vendor providers remain unchanged.

**Step 4: Re-run the targeted tests**

Run:

```bash
uv run pytest tests/mc/infrastructure/providers/test_tool_adapters.py tests/mc/test_provider_factory.py -v
```

Expected: PASS.

**Step 5: Run Python guardrails and commit**

Run:

```bash
uv run ruff format --check mc/infrastructure/providers/tool_adapters.py mc/infrastructure/providers/factory.py tests/mc/infrastructure/providers/test_tool_adapters.py tests/mc/test_provider_factory.py
uv run ruff check mc/infrastructure/providers/tool_adapters.py mc/infrastructure/providers/factory.py tests/mc/infrastructure/providers/test_tool_adapters.py tests/mc/test_provider_factory.py
uv run pytest tests/mc/infrastructure/providers/test_tool_adapters.py tests/mc/test_provider_factory.py tests/mc/test_architecture.py tests/mc/test_module_reorganization.py tests/mc/infrastructure/test_boundary.py
git add mc/infrastructure/providers/tool_adapters.py mc/infrastructure/providers/factory.py tests/mc/infrastructure/providers/test_tool_adapters.py tests/mc/test_provider_factory.py
git commit -m "feat: add MC provider tool adapters"
```

### Task 2: Define the canonical Phase 1 MC MCP tool surface

**Files:**
- Create: `mc/runtime/mcp/tool_specs.py`
- Create: `mc/runtime/mcp/bridge.py`
- Create: `tests/mc/runtime/test_mc_mcp_bridge.py`
- Modify: `vendor/claude-code/claude_code/mcp_bridge.py` only if a thin import seam is needed to reuse canonical specs
- Modify: `tests/cc/test_mcp_bridge.py` only if the thin import seam is taken

**Step 1: Write the failing tool-surface tests**

Add tests that prove:
- the repo-owned MC MCP bridge exposes exactly the Phase 1 tools
- the public names are `ask_user`, `ask_agent`, `delegate_task`, `send_message`, `cron`, `report_progress`, `record_final_result`
- `send_message` is present and `message` is not exposed on the MCP surface
- the repo-owned bridge can forward tool calls to the existing IPC server contract

**Step 2: Run the targeted tests and confirm they fail**

Run:

```bash
uv run pytest tests/mc/runtime/test_mc_mcp_bridge.py -v
```

Expected: FAIL because the repo-owned bridge/tool-spec module does not exist yet.

**Step 3: Implement the canonical MCP surface**

Create a repo-owned MCP stdio bridge that:
- defines the canonical tool surface in `tool_specs.py`
- forwards calls through the existing MC IPC socket contract
- keeps tool names semantic and transport-agnostic
- treats `send_message` as the canonical message tool for MC runtime

If practical without widening scope, make the vendor Claude Code bridge import the canonical specs instead of duplicating inline schema. If that introduces risk, document it as a follow-up and keep the vendor bridge stable in this wave.

**Step 4: Re-run the targeted tests**

Run:

```bash
uv run pytest tests/mc/runtime/test_mc_mcp_bridge.py -v
```

Expected: PASS.

**Step 5: Run Python checks and commit**

Run:

```bash
uv run ruff format --check mc/runtime/mcp/tool_specs.py mc/runtime/mcp/bridge.py tests/mc/runtime/test_mc_mcp_bridge.py
uv run ruff check mc/runtime/mcp/tool_specs.py mc/runtime/mcp/bridge.py tests/mc/runtime/test_mc_mcp_bridge.py
uv run pytest tests/mc/runtime/test_mc_mcp_bridge.py
git add mc/runtime/mcp/tool_specs.py mc/runtime/mcp/bridge.py tests/mc/runtime/test_mc_mcp_bridge.py
git commit -m "feat: add canonical MC MCP phase 1 surface"
```

### Task 3: Wire nanobot MC execution to the MCP-first Phase 1 surface

**Files:**
- Modify: `mc/contexts/execution/agent_runner.py`
- Modify: `mc/application/execution/runtime.py`
- Create: `tests/mc/contexts/execution/test_agent_runner_mcp_first.py`
- Create: `tests/mc/application/execution/test_nanobot_strategy.py`

**Step 1: Write the failing runtime tests**

Add tests that prove:
- MC nanobot execution injects the repo-owned MC MCP server into `AgentLoop`
- overlapping native tools are hidden in MC runtime (`ask_user`, `ask_agent`, `delegate_task`, `message`, `cron`, `search_memory` only if Phase 1 includes it)
- `send_message` is visible to the model, not `message`
- provider/schema failures come back as execution errors instead of successful task completion

**Step 2: Run the targeted tests and confirm they fail**

Run:

```bash
uv run pytest tests/mc/contexts/execution/test_agent_runner_mcp_first.py tests/mc/application/execution/test_nanobot_strategy.py -v
```

Expected: FAIL because MC nanobot execution still uses native overlapping tools and still calls `process_direct()` rather than consuming structured error state.

**Step 3: Implement the runtime wiring**

In `agent_runner.py`:
- construct an MC MCP server config for the repo-owned bridge
- pass it into `AgentLoop(..., mcp_servers=...)`
- unregister overlapping native tools in MC runtime after loop setup
- keep non-MC nanobot behavior unchanged

In the nanobot execution strategy path:
- switch to structured direct results rather than bare string return
- propagate `is_error` into `ExecutionResult(success=False, ...)`

Keep the public tool surface narrow and explicit. The model should see one MC message tool: `send_message`.

**Step 4: Re-run the targeted tests**

Run:

```bash
uv run pytest tests/mc/contexts/execution/test_agent_runner_mcp_first.py tests/mc/application/execution/test_nanobot_strategy.py -v
```

Expected: PASS.

**Step 5: Run focused execution tests, guardrails, and commit**

Run:

```bash
uv run ruff format --check mc/contexts/execution/agent_runner.py mc/application/execution/runtime.py tests/mc/contexts/execution/test_agent_runner_mcp_first.py tests/mc/application/execution/test_nanobot_strategy.py
uv run ruff check mc/contexts/execution/agent_runner.py mc/application/execution/runtime.py tests/mc/contexts/execution/test_agent_runner_mcp_first.py tests/mc/application/execution/test_nanobot_strategy.py
uv run pytest tests/mc/contexts/execution/test_agent_runner_mcp_first.py tests/mc/application/execution/test_nanobot_strategy.py tests/mc/test_architecture.py tests/mc/test_module_reorganization.py tests/mc/infrastructure/test_boundary.py
git add mc/contexts/execution/agent_runner.py mc/application/execution/runtime.py tests/mc/contexts/execution/test_agent_runner_mcp_first.py tests/mc/application/execution/test_nanobot_strategy.py
git commit -m "feat: migrate MC nanobot runtime to MCP-first phase 1 tools"
```

### Task 4: Run the Phase 1 exit gate

**Files:**
- Modify: `docs/ARCHITECTURE.md` only if ownership language needs a small update
- Modify: any touched story or plan docs with final notes

**Step 1: Run focused backend verification**

Run:

```bash
uv run pytest tests/mc/infrastructure/providers/test_tool_adapters.py tests/mc/test_provider_factory.py tests/mc/runtime/test_mc_mcp_bridge.py tests/mc/contexts/execution/test_agent_runner_mcp_first.py tests/mc/application/execution/test_nanobot_strategy.py
```

Expected: PASS.

**Step 2: Run always-on backend guardrails**

Run:

```bash
uv run pytest tests/mc/test_architecture.py tests/mc/test_module_reorganization.py tests/mc/infrastructure/test_boundary.py
```

Expected: PASS.

**Step 3: Run a focused code review**

Run the repository review workflow on the full diff and fix any high-severity findings before merge.

**Step 4: Run a real-stack smoke**

From the worktree root:

```bash
cp dashboard/.env.local .worktrees/codex/<branch>/dashboard/.env.local
cd .worktrees/codex/<branch>
PORT=3001 uv run nanobot mc start
```

Validate:
- a nanobot task can start under Codex
- the Phase 1 tool surface appears as intended
- `ask_user` no longer fails on Codex schema upload
- provider errors, if forced, do not route the task to review as success

**Step 5: Commit the exit gate**

```bash
git add docs/ARCHITECTURE.md docs/plans/2026-03-14-mc-mcp-phase-1-tools-implementation-plan.md _bmad-output/implementation-artifacts/tech-spec-mc-mcp-phase-1-provider-tool-adapter.md _bmad-output/implementation-artifacts/tech-spec-mc-mcp-phase-1-canonical-mc-tool-surface.md _bmad-output/implementation-artifacts/tech-spec-mc-mcp-phase-1-nanobot-runtime-migration-and-regression.md
git commit -m "docs: record MC MCP-first phase 1 implementation plan"
```

## Expected End State

- MC-owned Phase 1 tools are canonical and MCP-first in nanobot task execution.
- Provider-facing tool translation is explicit and owned by `mc`, not hidden in vendor providers.
- `send_message` is the single message tool exposed to the model in MC runtime.
- `ask_user` no longer ships an invalid top-level schema to Codex.
- Provider/schema failures surface as execution failures, not successful review transitions.

## Story Set

- `_bmad-output/implementation-artifacts/tech-spec-mc-mcp-phase-1-provider-tool-adapter.md`
- `_bmad-output/implementation-artifacts/tech-spec-mc-mcp-phase-1-canonical-mc-tool-surface.md`
- `_bmad-output/implementation-artifacts/tech-spec-mc-mcp-phase-1-nanobot-runtime-migration-and-regression.md`
