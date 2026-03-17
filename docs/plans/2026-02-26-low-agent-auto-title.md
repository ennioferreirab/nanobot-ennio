# low-agent Auto-Title Delegation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the inline `generate_auto_title()` LLM call in the orchestrator with a `low-agent` System Agent whose model config drives title generation, keeping auto-title gated behind the `auto_title_enabled` dashboard setting.

**Architecture:** A new system agent `low-agent` is upserted directly to Convex at startup (no YAML file) with `isSystem=true` and `model="tier:standard-low"`. The orchestrator queries this agent's model, resolves tier references inline, and makes the same direct LLM call it did before — just sourcing the model from the agent registry instead of `model_tiers` settings directly.

**Tech Stack:** Python (asyncio), Convex Python SDK, `nanobot.mc.bridge`, `nanobot.mc.orchestrator`, `nanobot.mc.gateway`, `nanobot.mc.types`, `nanobot.mc.provider_factory`

---

### Task 1: Add `LOW_AGENT_NAME` constant to `types.py`

**Files:**
- Modify: `nanobot/mc/types.py:25-26`

**Step 1: Add the constant**

After the existing `NANOBOT_AGENT_NAME = "nanobot"` line (currently line 26), add:

```python
LOW_AGENT_NAME = "low-agent"
```

**Step 2: Run tests to confirm nothing broke**

```bash
uv run pytest tests/mc/ -x -q
```
Expected: all pass (no test touches this constant yet)

**Step 3: Commit**

```bash
git add nanobot/mc/types.py
git commit -m "feat(types): add LOW_AGENT_NAME constant for low-agent system agent"
```

---

### Task 2: Add `ensure_low_agent(bridge)` to `gateway.py`

The low-agent is a pure Convex system agent — no YAML file on disk. It's protected from
`deactivateExcept` because `isSystem=True` (verified: `agents.ts:354` skips system agents).

**Files:**
- Modify: `nanobot/mc/gateway.py`

**Step 1: Write a failing test in `tests/mc/test_gateway_low_agent.py`**

Create a new test file:

```python
"""Tests for ensure_low_agent in gateway."""
from unittest.mock import MagicMock, call
from nanobot.mc.gateway import ensure_low_agent
from nanobot.mc.types import LOW_AGENT_NAME, AgentData


def _make_bridge():
    bridge = MagicMock()
    bridge.sync_agent.return_value = None
    return bridge


def test_ensure_low_agent_upserts_system_agent():
    bridge = _make_bridge()
    ensure_low_agent(bridge)
    bridge.sync_agent.assert_called_once()
    agent: AgentData = bridge.sync_agent.call_args[0][0]
    assert agent.name == LOW_AGENT_NAME
    assert agent.is_system is True
    assert agent.model == "tier:standard-low"


def test_ensure_low_agent_is_idempotent():
    bridge = _make_bridge()
    ensure_low_agent(bridge)
    ensure_low_agent(bridge)
    assert bridge.sync_agent.call_count == 2  # called each time, upsert is idempotent
```

**Step 2: Run test to verify it fails**

```bash
uv run pytest tests/mc/test_gateway_low_agent.py -v
```
Expected: `ImportError: cannot import name 'ensure_low_agent' from 'nanobot.mc.gateway'`

**Step 3: Implement `ensure_low_agent` in `gateway.py`**

Add this function after `ensure_nanobot_agent` (around line 407, before `_sync_model_tiers`):

```python
def ensure_low_agent(bridge: "ConvexBridge") -> None:
    """Upsert the low-agent system agent to Convex.

    low-agent is a pure system agent (no YAML file on disk). It is always
    configured with the standard-low model tier and is used internally for
    lightweight tasks such as auto-title generation.

    isSystem=True protects it from being deactivated by deactivateExcept.
    """
    from nanobot.mc.types import LOW_AGENT_NAME, AgentData

    agent = AgentData(
        name=LOW_AGENT_NAME,
        display_name="Low Agent",
        role="Lightweight system utility agent",
        model="tier:standard-low",
        is_system=True,
    )
    bridge.sync_agent(agent)
    logger.info("[gateway] Ensured low-agent system agent")
```

Also add the import at the top of the file — check if `TYPE_CHECKING` block has `ConvexBridge`:

```python
# At top of the function, bridge type hint uses string "ConvexBridge" for forward ref
# (same pattern as ensure_nanobot_agent which already has bridge: "ConvexBridge")
```

**Step 4: Call `ensure_low_agent` from `sync_agent_registry`**

In `sync_agent_registry`, after the `ensure_nanobot_agent(agents_dir)` call (around line 494), add:

```python
    # Step 0a-pre: Ensure low-agent system agent exists in Convex
    try:
        ensure_low_agent(bridge)
    except Exception:
        logger.warning("[gateway] Failed to ensure low-agent", exc_info=True)
```

**Step 5: Run tests**

```bash
uv run pytest tests/mc/test_gateway_low_agent.py -v
```
Expected: all PASS

**Step 6: Commit**

```bash
git add nanobot/mc/gateway.py tests/mc/test_gateway_low_agent.py
git commit -m "feat(gateway): add ensure_low_agent system agent upsert"
```

---

### Task 3: Replace `generate_auto_title` with `generate_title_via_low_agent` in `orchestrator.py`

**Files:**
- Modify: `nanobot/mc/orchestrator.py`
- Modify: `nanobot/mc/test_orchestrator.py`

**Step 1: Write failing tests for the new function**

Add these tests to `nanobot/mc/test_orchestrator.py`. First check how existing tests mock the bridge
(see `_make_bridge()` and `_make_task()` helpers already in the file):

```python
from unittest.mock import AsyncMock, MagicMock, patch
from nanobot.mc.orchestrator import generate_title_via_low_agent


class TestGenerateTitleViaLowAgent:
    @pytest.mark.asyncio
    async def test_returns_title_from_llm(self):
        bridge = _make_bridge()
        bridge.get_agent_by_name.return_value = {"model": "tier:standard-low"}

        mock_response = MagicMock()
        mock_response.finish_reason = "stop"
        mock_response.content = "  My Generated Title  "

        mock_provider = AsyncMock()
        mock_provider.chat.return_value = mock_response

        with patch(
            "nanobot.mc.orchestrator.create_provider",
            return_value=(mock_provider, "anthropic/claude-haiku"),
        ):
            with patch(
                "nanobot.mc.orchestrator.asyncio.to_thread",
                side_effect=_sync_to_thread,
            ):
                result = await generate_title_via_low_agent(bridge, "Do something useful")

        assert result == "My Generated Title"

    @pytest.mark.asyncio
    async def test_returns_none_on_llm_error(self):
        bridge = _make_bridge()
        bridge.get_agent_by_name.return_value = {"model": "tier:standard-low"}

        mock_response = MagicMock()
        mock_response.finish_reason = "error"
        mock_response.content = "oops"

        mock_provider = AsyncMock()
        mock_provider.chat.return_value = mock_response

        with patch(
            "nanobot.mc.orchestrator.create_provider",
            return_value=(mock_provider, "anthropic/claude-haiku"),
        ):
            with patch(
                "nanobot.mc.orchestrator.asyncio.to_thread",
                side_effect=_sync_to_thread,
            ):
                result = await generate_title_via_low_agent(bridge, "Do something useful")

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_when_low_agent_not_found(self):
        bridge = _make_bridge()
        bridge.get_agent_by_name.return_value = None

        with patch(
            "nanobot.mc.orchestrator.asyncio.to_thread",
            side_effect=_sync_to_thread,
        ):
            result = await generate_title_via_low_agent(bridge, "Do something useful")

        assert result is None

    @pytest.mark.asyncio
    async def test_truncates_long_descriptions(self):
        bridge = _make_bridge()
        bridge.get_agent_by_name.return_value = {"model": "tier:standard-low"}

        mock_response = MagicMock()
        mock_response.finish_reason = "stop"
        mock_response.content = "Short Title"

        mock_provider = AsyncMock()
        mock_provider.chat.return_value = mock_response

        long_desc = "x" * 10000

        with patch(
            "nanobot.mc.orchestrator.create_provider",
            return_value=(mock_provider, "anthropic/claude-haiku"),
        ):
            with patch(
                "nanobot.mc.orchestrator.asyncio.to_thread",
                side_effect=_sync_to_thread,
            ):
                result = await generate_title_via_low_agent(bridge, long_desc)

        # Verify the prompt was truncated (check what was passed to chat)
        call_messages = mock_provider.chat.call_args[1]["messages"]
        assert len(call_messages[0]["content"]) <= 5100  # prompt + truncated desc
        assert result == "Short Title"
```

**Step 2: Run tests to verify they fail**

```bash
uv run pytest nanobot/mc/test_orchestrator.py::TestGenerateTitleViaLowAgent -v
```
Expected: `ImportError: cannot import name 'generate_title_via_low_agent'`

**Step 3: Modify `orchestrator.py`**

3a. Remove these lines (the old inline implementation):
- The `AUTO_TITLE_PROMPT` constant (lines 34-38)
- The entire `generate_auto_title()` function (lines 41-90)

3b. Add the `LOW_AGENT_NAME` import to the existing `from nanobot.mc.types import (...)` block:

```python
from nanobot.mc.types import (
    AgentData,
    ActivityEventType,
    AuthorType,
    ExecutionPlan,
    LEAD_AGENT_NAME,
    LOW_AGENT_NAME,
    MessageType,
    TaskStatus,
    TrustLevel,
)
```

3c. Add the new function after the imports (before `class TaskOrchestrator`):

```python
AUTO_TITLE_PROMPT = (
    "Create a simple title for this task description. "
    "Do not change the language used in the text.\n\n"
    "{description}"
)


async def generate_title_via_low_agent(
    bridge: "ConvexBridge",
    description: str,
) -> str | None:
    """Generate a concise title by delegating to the low-agent system agent.

    Reads the model configured on the low-agent from Convex. If the agent is
    not found or the LLM call fails, returns None.
    """
    # Fetch low-agent model config
    agent_data: dict | None = None
    try:
        agent_data = await asyncio.to_thread(
            bridge.get_agent_by_name, LOW_AGENT_NAME
        )
    except Exception:
        logger.warning("[orchestrator] Failed to fetch low-agent config", exc_info=True)

    if not agent_data:
        logger.warning("[orchestrator] low-agent not found; skipping auto-title")
        return None

    low_model: str | None = agent_data.get("model") or None

    # Resolve tier reference to concrete model string
    if low_model and low_model.startswith("tier:"):
        try:
            raw_tiers = await asyncio.to_thread(
                bridge.query, "settings:get", {"key": "model_tiers"}
            )
            if raw_tiers:
                tiers = json.loads(raw_tiers)
                tier_name = low_model[len("tier:"):]
                low_model = tiers.get(tier_name) or None
                if low_model:
                    logger.info("[orchestrator] low-agent tier resolved to: %s", low_model)
                else:
                    logger.info("[orchestrator] tier '%s' not configured; using default", tier_name)
        except Exception:
            logger.warning("[orchestrator] Failed to resolve tier for low-agent", exc_info=True)
            low_model = None

    description = description[:5000]

    try:
        provider, resolved_model = create_provider(model=low_model)
        response = await provider.chat(
            model=resolved_model,
            messages=[
                {"role": "user", "content": AUTO_TITLE_PROMPT.format(description=description)},
            ],
            temperature=0.3,
            max_tokens=60,
        )
        if response.finish_reason == "error":
            logger.warning("[orchestrator] Auto-title LLM error: %s", response.content)
            return None
        title = (response.content or "").strip().lstrip("#").strip().strip('"').strip("'")
        if not title:
            return None
        logger.info("[orchestrator] Auto-title generated via low-agent: '%s'", title)
        return title
    except Exception:
        logger.exception("[orchestrator] Auto-title generation failed")
        return None
```

3d. In `_process_planning_task`, update the auto-title block (currently lines 143-157) to call the new function:

```python
        # Auto-title: generate a concise title from description if autoTitle is set
        if task_data.get("auto_title") and description:
            generated_title = await generate_title_via_low_agent(self._bridge, description)
            if generated_title:
                title = generated_title
                # Patch the title back to Convex
                await asyncio.to_thread(
                    self._bridge.mutation,
                    "tasks:updateTitle",
                    {"task_id": task_id, "title": title},
                )
                logger.info(
                    "[orchestrator] Auto-generated title for task %s: '%s'",
                    task_id,
                    title,
                )
```

(This block is identical to the old one except it calls `generate_title_via_low_agent` instead of `generate_auto_title`.)

**Step 4: Run tests**

```bash
uv run pytest nanobot/mc/test_orchestrator.py -v
```
Expected: all PASS

**Step 5: Run full test suite**

```bash
uv run pytest tests/mc/ nanobot/mc/ -x -q
```
Expected: all PASS

**Step 6: Commit**

```bash
git add nanobot/mc/orchestrator.py nanobot/mc/test_orchestrator.py
git commit -m "feat(orchestrator): delegate auto-title to low-agent system agent"
```

---

### Task 4: Clean up `scripts/test_auto_title_live.py`

This script tests the old `generate_auto_title` function which no longer exists.

**Files:**
- Delete: `scripts/test_auto_title_live.py`

**Step 1: Verify no other file imports from it**

```bash
grep -r "test_auto_title_live" /Users/ennio/Documents/nanobot-ennio --include="*.py"
```
Expected: no results

**Step 2: Delete the file**

```bash
git rm scripts/test_auto_title_live.py
```

**Step 3: Commit**

```bash
git commit -m "chore: remove stale test_auto_title_live script"
```

---

### Task 5: Final verification

**Step 1: Run full test suite**

```bash
uv run pytest tests/mc/ nanobot/mc/ -v
```
Expected: all PASS

**Step 2: Verify no references to old `generate_auto_title` remain**

```bash
grep -r "generate_auto_title" /Users/ennio/Documents/nanobot-ennio --include="*.py"
```
Expected: no results

**Step 3: Verify `LOW_AGENT_NAME` is exported and referenced correctly**

```bash
grep -r "low-agent\|LOW_AGENT_NAME" /Users/ennio/Documents/nanobot-ennio/nanobot --include="*.py"
```
Expected: hits in `types.py`, `gateway.py`, `orchestrator.py` (and test files)
