# Tier Reasoning Propagation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Thread `reasoning_level` ("low" | "medium" | "max" | None) from the `tier_reasoning_levels` Convex setting through the entire execution stack so that `provider.chat()` sends the correct thinking/reasoning params to the LLM API.

**Architecture:** `TierResolver` gains a `resolve_reasoning_level()` method; `executor._execute_task()` calls it after model resolution and passes the result down through `_run_agent_on_task()` → `AgentLoop` → `provider.chat()`. Each provider translates the level to its native format: Anthropic gets `thinking={type,budget_tokens}`, OpenAI gets `reasoning_effort`, others silently ignore.

**Tech Stack:** Python 3.13, LiteLLM (`acompletion`), Anthropic Messages API (direct httpx for OAuth), pytest + pytest-asyncio.

---

## Reference: Value Mapping

| UI Level | Anthropic `budget_tokens` | OpenAI `reasoning_effort` |
|----------|--------------------------|---------------------------|
| `None`   | *(param omitted)*        | *(param omitted)*         |
| `"low"`  | 1024                     | `"low"`                   |
| `"medium"` | 8000                  | `"medium"`                |
| `"max"`  | 16000                    | `"high"`                  |

---

### Task 1: TierResolver — add `resolve_reasoning_level()`

**Files:**
- Modify: `nanobot/mc/tier_resolver.py`
- Test: `tests/mc/test_model_tier_reasoning.py`

The current `TierResolver` has one cache dict (`_cache`) for `model_tiers`. We need a second cache dict for `tier_reasoning_levels`, refreshed in the same `_refresh_cache()` call.

**Step 1: Remove the 3 xfail markers for TierResolver tests**

Open `tests/mc/test_model_tier_reasoning.py`.

In class `TestReasoningLevelResolutionOnTierResolver`, remove the three `@pytest.mark.xfail(...)` decorators from:
- `test_resolve_reasoning_level_exists`
- `test_resolve_reasoning_level_off_when_not_configured`
- `test_changing_reasoning_level_in_settings_is_reflected`

Keep the test bodies exactly as they are.

**Step 2: Run the tests to confirm they fail**

```bash
uv run pytest tests/mc/test_model_tier_reasoning.py::TestReasoningLevelResolutionOnTierResolver -v
```

Expected: 3 `FAILED` with `AttributeError: 'TierResolver' object has no attribute 'resolve_reasoning_level'`

**Step 3: Extend `TierResolver.__init__` and `_refresh_cache()`**

Open `nanobot/mc/tier_resolver.py`.

In `__init__`, add `_reasoning_cache` after `_cache`:

```python
def __init__(self, bridge: ConvexBridge) -> None:
    self._bridge = bridge
    self._cache: dict[str, str | None] = {}
    self._reasoning_cache: dict[str, str] = {}
    self._cache_time: float = 0.0
```

Replace the entire `_refresh_cache` method with:

```python
def _refresh_cache(self) -> None:
    """Fetch model_tiers and tier_reasoning_levels from Convex."""
    raw_tiers = self._bridge.query("settings:get", {"key": "model_tiers"})
    if raw_tiers is None:
        self._cache = {}
    else:
        try:
            parsed = json.loads(raw_tiers)
            if isinstance(parsed, dict):
                self._cache = parsed
            else:
                logger.warning("[tier_resolver] model_tiers is not a dict: %s", type(parsed))
                self._cache = {}
        except (json.JSONDecodeError, TypeError) as exc:
            logger.warning("[tier_resolver] Failed to parse model_tiers: %s", exc)
            self._cache = {}

    raw_reasoning = self._bridge.query("settings:get", {"key": "tier_reasoning_levels"})
    if raw_reasoning is None:
        self._reasoning_cache = {}
    else:
        try:
            parsed_r = json.loads(raw_reasoning)
            if isinstance(parsed_r, dict):
                self._reasoning_cache = parsed_r
            else:
                logger.warning("[tier_resolver] tier_reasoning_levels is not a dict: %s", type(parsed_r))
                self._reasoning_cache = {}
        except (json.JSONDecodeError, TypeError) as exc:
            logger.warning("[tier_resolver] Failed to parse tier_reasoning_levels: %s", exc)
            self._reasoning_cache = {}

    self._cache_time = time.monotonic()
```

**Step 4: Add `resolve_reasoning_level()` method**

Add this method after `resolve_model()`:

```python
def resolve_reasoning_level(self, model: str | None) -> str | None:
    """Resolve the reasoning level for a tier reference.

    Returns "low", "medium", "max", or None (off / not configured).
    Non-tier model strings and unconfigured tiers both return None.
    Never raises — missing config is treated as reasoning off.
    """
    if not model or not is_tier_reference(model):
        return None

    tier_name = extract_tier_name(model)
    if tier_name is None:
        return None

    if time.monotonic() - self._cache_time > self.CACHE_TTL:
        self._refresh_cache()

    level = self._reasoning_cache.get(tier_name)
    return level if level else None  # empty string → None (off)
```

**Step 5: Run the TierResolver tests to confirm they pass**

```bash
uv run pytest tests/mc/test_model_tier_reasoning.py::TestReasoningLevelResolutionOnTierResolver -v
```

Expected: 3 `PASSED`

**Step 6: Run full test_tier_resolver to ensure no regression**

```bash
uv run pytest tests/mc/test_tier_resolver.py -v
```

Expected: all `PASSED`

**Step 7: Commit**

```bash
git add nanobot/mc/tier_resolver.py tests/mc/test_model_tier_reasoning.py
git commit -m "feat(tier-resolver): add resolve_reasoning_level() from tier_reasoning_levels setting"
```

---

### Task 2: Executor — resolve and pass `reasoning_level`

**Files:**
- Modify: `nanobot/mc/executor.py` (two locations: the tier block inside `_execute_task`, and `_run_agent_on_task` signature + AgentLoop call)

**Step 1: Update `_run_agent_on_task` signature**

In `nanobot/mc/executor.py`, find the function signature of `_run_agent_on_task` (around line 104):

```python
async def _run_agent_on_task(
    agent_name: str,
    agent_prompt: str | None,
    agent_model: str | None,
    task_title: str,
    task_description: str | None,
    agent_skills: list[str] | None = None,
    board_name: str | None = None,
    memory_workspace: Path | None = None,
    cron_service: Any | None = None,
    task_id: str | None = None,
    bridge: "ConvexBridge | None" = None,
) -> str:
```

Add `reasoning_level: str | None = None` after `agent_model`:

```python
async def _run_agent_on_task(
    agent_name: str,
    agent_prompt: str | None,
    agent_model: str | None,
    reasoning_level: str | None = None,
    task_title: str = "",
    task_description: str | None = None,
    agent_skills: list[str] | None = None,
    board_name: str | None = None,
    memory_workspace: Path | None = None,
    cron_service: Any | None = None,
    task_id: str | None = None,
    bridge: "ConvexBridge | None" = None,
) -> str:
```

> Note: `task_title` and `task_description` gain defaults so existing callers without `reasoning_level` still work.

**Step 2: Pass `reasoning_level` to `AgentLoop` inside `_run_agent_on_task`**

Find the `AgentLoop(...)` constructor call (around line 157):

```python
loop = AgentLoop(
    bus=bus,
    provider=provider,
    workspace=workspace,
    model=resolved_model,
    allowed_skills=agent_skills,
    global_skills_dir=global_skills_dir,
    memory_workspace=memory_workspace,
    cron_service=cron_service,
)
```

Add `reasoning_level=reasoning_level`:

```python
loop = AgentLoop(
    bus=bus,
    provider=provider,
    workspace=workspace,
    model=resolved_model,
    reasoning_level=reasoning_level,
    allowed_skills=agent_skills,
    global_skills_dir=global_skills_dir,
    memory_workspace=memory_workspace,
    cron_service=cron_service,
)
```

**Step 3: Resolve reasoning level in `_execute_task`**

Find the tier resolution block in `_execute_task` (around line 864):

```python
        # Resolve tier references (Story 11.1, AC5)
        if agent_model and is_tier_reference(agent_model):
            try:
                agent_model = self._get_tier_resolver().resolve_model(agent_model)
                logger.info("[executor] Resolved tier for agent '%s': %s", agent_name, agent_model)
            except ValueError as exc:
                await self._handle_tier_error(task_id, title, agent_name, exc)
                return
```

Replace with:

```python
        # Resolve tier references (Story 11.1, AC5)
        reasoning_level: str | None = None
        if agent_model and is_tier_reference(agent_model):
            tier_ref = agent_model  # save before overwriting
            try:
                agent_model = self._get_tier_resolver().resolve_model(agent_model)
                logger.info("[executor] Resolved tier for agent '%s': %s", agent_name, agent_model)
            except ValueError as exc:
                await self._handle_tier_error(task_id, title, agent_name, exc)
                return
            # Resolve reasoning level — never raises, missing config = off
            reasoning_level = self._get_tier_resolver().resolve_reasoning_level(tier_ref)
            if reasoning_level:
                logger.info(
                    "[executor] Reasoning level for agent '%s': %s", agent_name, reasoning_level
                )
```

**Step 4: Pass `reasoning_level` in the `_run_agent_on_task` call**

Find the `_run_agent_on_task(...)` call (around line 926):

```python
            result = await _run_agent_on_task(
                agent_name=agent_name,
                agent_prompt=agent_prompt,
                agent_model=agent_model,
                task_title=title,
                task_description=description,
                agent_skills=agent_skills,
                board_name=board_name,
                memory_workspace=memory_workspace,
                cron_service=self._cron_service,
                task_id=task_id,
                bridge=self._bridge,
            )
```

Add `reasoning_level=reasoning_level`:

```python
            result = await _run_agent_on_task(
                agent_name=agent_name,
                agent_prompt=agent_prompt,
                agent_model=agent_model,
                reasoning_level=reasoning_level,
                task_title=title,
                task_description=description,
                agent_skills=agent_skills,
                board_name=board_name,
                memory_workspace=memory_workspace,
                cron_service=self._cron_service,
                task_id=task_id,
                bridge=self._bridge,
            )
```

**Step 5: Run existing executor tests**

```bash
uv run pytest tests/mc/ -k "executor or tier" -v
```

Expected: all existing tests pass (no regressions).

**Step 6: Commit**

```bash
git add nanobot/mc/executor.py
git commit -m "feat(executor): resolve and thread reasoning_level from tier settings to _run_agent_on_task"
```

---

### Task 3: AgentLoop — accept and forward `reasoning_level`

**Files:**
- Modify: `nanobot/agent/loop.py`

**Step 1: Add `reasoning_level` to `__init__`**

Find `AgentLoop.__init__` (around line 46). Add `reasoning_level: str | None = None` after `memory_workspace`:

```python
def __init__(
    self,
    bus: MessageBus,
    provider: LLMProvider,
    workspace: Path,
    model: str | None = None,
    max_iterations: int = 20,
    temperature: float = 0.7,
    max_tokens: int = 4096,
    memory_window: int = 50,
    brave_api_key: str | None = None,
    exec_config: ExecToolConfig | None = None,
    cron_service: CronService | None = None,
    restrict_to_workspace: bool = False,
    session_manager: SessionManager | None = None,
    mcp_servers: dict | None = None,
    allowed_skills: list[str] | None = None,
    global_skills_dir: Path | None = None,
    memory_workspace: Path | None = None,
    reasoning_level: str | None = None,
):
```

After `self.allowed_skills = allowed_skills`, add:

```python
        self.reasoning_level = reasoning_level
```

**Step 2: Pass `reasoning_level` to `provider.chat()` in `_run_agent_loop`**

Find the `provider.chat(...)` call inside `_run_agent_loop` (around line 207):

```python
            response = await self.provider.chat(
                messages=messages,
                tools=self.tools.get_definitions(),
                model=self.model,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
            )
```

Add `reasoning_level=self.reasoning_level`:

```python
            response = await self.provider.chat(
                messages=messages,
                tools=self.tools.get_definitions(),
                model=self.model,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                reasoning_level=self.reasoning_level,
            )
```

**Step 3: Run tests**

```bash
uv run pytest tests/mc/ -v
```

Expected: all pass. (The `provider.chat()` mock in tests will get an unexpected `reasoning_level` kwarg — verify it doesn't crash. If `MagicMock().chat` receives extra kwargs, it ignores them by default.)

**Step 4: Commit**

```bash
git add nanobot/agent/loop.py
git commit -m "feat(agent-loop): forward reasoning_level to provider.chat()"
```

---

### Task 4: `base.py` — add `reasoning_level` to abstract `chat()` signature

**Files:**
- Modify: `nanobot/providers/base.py`

**Step 1: Add param to abstract method**

In `LLMProvider.chat()` (around line 84), add `reasoning_level: str | None = None` after `temperature`:

```python
@abstractmethod
async def chat(
    self,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    model: str | None = None,
    max_tokens: int = 4096,
    temperature: float = 0.7,
    reasoning_level: str | None = None,
) -> LLMResponse:
```

**Step 2: Update docstring**

Add after `temperature` line:

```
            reasoning_level: Optional reasoning effort level ("low", "medium", "max").
                Translated to provider-native params (thinking/reasoning_effort).
```

**Step 3: Add `reasoning_level` to all concrete providers that don't use it**

These providers should accept and silently ignore `reasoning_level`:

- `nanobot/providers/custom_provider.py` — add `reasoning_level: str | None = None` to `chat()` signature
- `nanobot/providers/openai_codex_provider.py` — add `reasoning_level: str | None = None` to `chat()` signature

**Step 4: Run tests**

```bash
uv run pytest tests/mc/ -v
```

Expected: all pass.

**Step 5: Commit**

```bash
git add nanobot/providers/base.py nanobot/providers/custom_provider.py nanobot/providers/openai_codex_provider.py
git commit -m "feat(providers): add reasoning_level param to LLMProvider.chat() interface"
```

---

### Task 5: `LiteLLMProvider` — inject thinking / reasoning_effort

**Files:**
- Modify: `nanobot/providers/litellm_provider.py`

**Step 1: Add the budget token constant**

At the top of the file (after the imports), add:

```python
_REASONING_BUDGET_TOKENS: dict[str, int] = {
    "low": 1024,
    "medium": 8000,
    "max": 16000,
}
```

**Step 2: Add `reasoning_level` to `chat()` signature**

In `LiteLLMProvider.chat()` (around line 166), add `reasoning_level: str | None = None` after `temperature`:

```python
async def chat(
    self,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    model: str | None = None,
    max_tokens: int = 4096,
    temperature: float = 0.7,
    reasoning_level: str | None = None,
) -> LLMResponse:
```

**Step 3: Inject reasoning kwargs before the `tools` block**

Find the comment `# Pass extra headers` block (around line 215). After `if self.extra_headers:` block and before `if tools:`, add:

```python
        # Inject reasoning / thinking params
        if reasoning_level:
            model_lower = model.lower()
            if "anthropic" in model_lower or "claude" in model_lower:
                budget = _REASONING_BUDGET_TOKENS.get(reasoning_level)
                if budget:
                    kwargs["thinking"] = {"type": "enabled", "budget_tokens": budget}
                    kwargs["temperature"] = 1.0  # Anthropic requires temp=1.0 with thinking
            elif any(p in model_lower for p in ("openai", "gpt", "o1", "o3", "o4")):
                effort_map = {"low": "low", "medium": "medium", "max": "high"}
                effort = effort_map.get(reasoning_level)
                if effort:
                    kwargs["reasoning_effort"] = effort
            else:
                # Unknown provider — try thinking dict (LiteLLM may translate it)
                budget = _REASONING_BUDGET_TOKENS.get(reasoning_level)
                if budget:
                    kwargs["thinking"] = {"type": "enabled", "budget_tokens": budget}
                    kwargs["temperature"] = 1.0
```

**Step 4: Write a unit test for LiteLLM reasoning injection**

Add a new test class to `tests/mc/test_model_tier_reasoning.py`:

```python
class TestLiteLLMProviderReasoningInjection:
    """LiteLLMProvider.chat() injects correct params for each reasoning level."""

    @pytest.mark.asyncio
    async def test_anthropic_model_low_reasoning_injects_thinking(self) -> None:
        from nanobot.providers.litellm_provider import LiteLLMProvider
        from unittest.mock import patch, AsyncMock

        provider = LiteLLMProvider(api_key="test-key")
        fake_response = MagicMock()
        fake_response.choices = [MagicMock(
            message=MagicMock(content="ok", tool_calls=None),
            finish_reason="stop",
        )]
        fake_response.usage = MagicMock(prompt_tokens=10, completion_tokens=5, total_tokens=15)

        with patch("nanobot.providers.litellm_provider.acompletion", new=AsyncMock(return_value=fake_response)) as mock_ac:
            await provider.chat(
                messages=[{"role": "user", "content": "hello"}],
                model="anthropic/claude-sonnet-4-6-20250514",
                reasoning_level="low",
            )

        _, kwargs = mock_ac.call_args
        assert kwargs.get("thinking") == {"type": "enabled", "budget_tokens": 1024}
        assert kwargs.get("temperature") == 1.0

    @pytest.mark.asyncio
    async def test_anthropic_model_medium_reasoning_injects_thinking(self) -> None:
        from nanobot.providers.litellm_provider import LiteLLMProvider

        provider = LiteLLMProvider(api_key="test-key")
        fake_response = MagicMock()
        fake_response.choices = [MagicMock(
            message=MagicMock(content="ok", tool_calls=None),
            finish_reason="stop",
        )]
        fake_response.usage = MagicMock(prompt_tokens=10, completion_tokens=5, total_tokens=15)

        with patch("nanobot.providers.litellm_provider.acompletion", new=AsyncMock(return_value=fake_response)) as mock_ac:
            await provider.chat(
                messages=[{"role": "user", "content": "hello"}],
                model="anthropic/claude-sonnet-4-6-20250514",
                reasoning_level="medium",
            )

        _, kwargs = mock_ac.call_args
        assert kwargs.get("thinking") == {"type": "enabled", "budget_tokens": 8000}

    @pytest.mark.asyncio
    async def test_anthropic_model_none_reasoning_omits_thinking(self) -> None:
        from nanobot.providers.litellm_provider import LiteLLMProvider

        provider = LiteLLMProvider(api_key="test-key")
        fake_response = MagicMock()
        fake_response.choices = [MagicMock(
            message=MagicMock(content="ok", tool_calls=None),
            finish_reason="stop",
        )]
        fake_response.usage = MagicMock(prompt_tokens=10, completion_tokens=5, total_tokens=15)

        with patch("nanobot.providers.litellm_provider.acompletion", new=AsyncMock(return_value=fake_response)) as mock_ac:
            await provider.chat(
                messages=[{"role": "user", "content": "hello"}],
                model="anthropic/claude-sonnet-4-6-20250514",
                reasoning_level=None,
            )

        _, kwargs = mock_ac.call_args
        assert "thinking" not in kwargs
        assert "reasoning_effort" not in kwargs

    @pytest.mark.asyncio
    async def test_openai_model_reasoning_injects_reasoning_effort(self) -> None:
        from nanobot.providers.litellm_provider import LiteLLMProvider

        provider = LiteLLMProvider(api_key="test-key")
        fake_response = MagicMock()
        fake_response.choices = [MagicMock(
            message=MagicMock(content="ok", tool_calls=None),
            finish_reason="stop",
        )]
        fake_response.usage = MagicMock(prompt_tokens=10, completion_tokens=5, total_tokens=15)

        with patch("nanobot.providers.litellm_provider.acompletion", new=AsyncMock(return_value=fake_response)) as mock_ac:
            await provider.chat(
                messages=[{"role": "user", "content": "hello"}],
                model="openai/gpt-4o",
                reasoning_level="max",
            )

        _, kwargs = mock_ac.call_args
        assert kwargs.get("reasoning_effort") == "high"
        assert "thinking" not in kwargs
```

**Step 5: Run the new LiteLLM tests to confirm they fail first**

```bash
uv run pytest tests/mc/test_model_tier_reasoning.py::TestLiteLLMProviderReasoningInjection -v
```

Expected: 4 `FAILED` (reasoning_level not yet in LiteLLM provider)

**Step 6: Apply the changes in Steps 1-3 to `litellm_provider.py`**

**Step 7: Run the LiteLLM tests again**

```bash
uv run pytest tests/mc/test_model_tier_reasoning.py::TestLiteLLMProviderReasoningInjection -v
```

Expected: 4 `PASSED`

**Step 8: Commit**

```bash
git add nanobot/providers/litellm_provider.py tests/mc/test_model_tier_reasoning.py
git commit -m "feat(litellm-provider): inject thinking/reasoning_effort kwargs from reasoning_level"
```

---

### Task 6: `AnthropicOAuthProvider` — thinking in body + SSE parsing

**Files:**
- Modify: `nanobot/providers/anthropic_oauth_provider.py`

**Step 1: Add `_REASONING_BUDGET_TOKENS` constant**

At the top of the file (after imports), add:

```python
_REASONING_BUDGET_TOKENS: dict[str, int] = {
    "low": 1024,
    "medium": 8000,
    "max": 16000,
}
```

**Step 2: Add `reasoning_level` to `chat()` signature**

```python
async def chat(
    self,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    model: str | None = None,
    max_tokens: int = 4096,
    temperature: float = 0.7,
    reasoning_level: str | None = None,
) -> LLMResponse:
```

**Step 3: Inject `thinking` into `body` and override temperature**

After `if tools:` block (around line 60) and before the `try:`, add:

```python
        if reasoning_level:
            budget = _REASONING_BUDGET_TOKENS.get(reasoning_level)
            if budget:
                body["thinking"] = {"type": "enabled", "budget_tokens": budget}
                body["temperature"] = 1.0  # Anthropic requires temp=1.0 with thinking
```

**Step 4: Parse thinking blocks in `_consume_sse`**

The current `_consume_sse` only tracks `tool_use` blocks. We need to also track `thinking` blocks and collect their text.

Inside `_consume_sse`, add a `thinking_text` accumulator and handle `thinking_delta`:

```python
async def _consume_sse(
    response: httpx.Response,
) -> tuple[str, list[ToolCallRequest], str, dict[str, int], str | None]:
    """Parse Anthropic SSE stream into content + tool calls + reasoning."""
    content = ""
    thinking_text = ""
    tool_calls: list[ToolCallRequest] = []
    tool_buffers: dict[int, dict[str, Any]] = {}
    thinking_blocks: set[int] = set()  # track which indices are thinking blocks
    finish_reason = "stop"
    usage: dict[str, int] = {}

    async for event in _iter_sse(response):
        event_type = event.get("type")

        if event_type == "content_block_start":
            idx = event.get("index", 0)
            block = event.get("content_block") or {}
            if block.get("type") == "tool_use":
                tool_buffers[idx] = {
                    "id": block.get("id", f"tool_{idx}"),
                    "name": block.get("name", ""),
                    "arguments_json": "",
                }
            elif block.get("type") == "thinking":
                thinking_blocks.add(idx)

        elif event_type == "content_block_delta":
            idx = event.get("index", 0)
            delta = event.get("delta") or {}
            delta_type = delta.get("type")

            if delta_type == "text_delta":
                content += delta.get("text", "")
            elif delta_type == "input_json_delta":
                if idx in tool_buffers:
                    tool_buffers[idx]["arguments_json"] += delta.get("partial_json", "")
            elif delta_type == "thinking_delta":
                if idx in thinking_blocks:
                    thinking_text += delta.get("thinking", "")

        elif event_type == "content_block_stop":
            idx = event.get("index", 0)
            thinking_blocks.discard(idx)
            if idx in tool_buffers:
                buf = tool_buffers.pop(idx)
                raw = buf["arguments_json"]
                try:
                    args = json.loads(raw) if raw else {}
                except json.JSONDecodeError:
                    args = {"raw": raw}
                tool_calls.append(ToolCallRequest(
                    id=buf["id"],
                    name=buf["name"],
                    arguments=args,
                ))

        elif event_type == "message_delta":
            delta = event.get("delta") or {}
            stop_reason = delta.get("stop_reason")
            if stop_reason:
                finish_reason = _map_stop_reason(stop_reason)
            u = event.get("usage") or {}
            if u.get("output_tokens"):
                usage["completion_tokens"] = u["output_tokens"]

        elif event_type == "message_start":
            msg = event.get("message") or {}
            u = msg.get("usage") or {}
            if u.get("input_tokens"):
                usage["prompt_tokens"] = u["input_tokens"]

        elif event_type == "error":
            error = event.get("error") or {}
            raise RuntimeError(f"Anthropic stream error: {error.get('message', event)}")

    usage["total_tokens"] = usage.get("prompt_tokens", 0) + usage.get("completion_tokens", 0)
    return content, tool_calls, finish_reason, usage, thinking_text or None
```

**Step 5: Update the `_request_anthropic` and `chat()` to handle the new return value**

`_request_anthropic` just calls `_consume_sse` and returns its result. Update its return type annotation:

```python
async def _request_anthropic(
    headers: dict[str, str],
    body: dict[str, Any],
) -> tuple[str, list[ToolCallRequest], str, dict[str, int], str | None]:
```

In `chat()`, unpack the new `reasoning_content` from the result:

```python
        content, tool_calls, finish_reason, usage, reasoning_content = await _request_anthropic(
            headers, body
        )
        return LLMResponse(
            content=content or None,
            tool_calls=tool_calls,
            finish_reason=finish_reason,
            usage=usage,
            reasoning_content=reasoning_content,
        )
```

**Step 6: Run tests**

```bash
uv run pytest tests/mc/ -v
```

Expected: all pass.

**Step 7: Commit**

```bash
git add nanobot/providers/anthropic_oauth_provider.py
git commit -m "feat(oauth-provider): inject thinking param + parse thinking blocks from SSE"
```

---

### Task 7: Remove remaining xfail + verify full test suite

**Files:**
- Modify: `tests/mc/test_model_tier_reasoning.py`

**Step 1: Remove the xfail from the executor-level test and update it**

In `TestReasoningPropagationToProviderChat::test_standard_medium_reasoning_low_reaches_provider_chat`, remove the `@pytest.mark.xfail(...)` decorator and update the test body to:
1. Pass `reasoning_level="low"` to `_run_agent_on_task()`
2. Assert `provider.chat()` was called with `reasoning_level="low"`

Replace the test with:

```python
@pytest.mark.asyncio
async def test_standard_medium_reasoning_low_reaches_provider_chat(self) -> None:
    """When reasoning_level='low' is passed, provider.chat() receives it."""
    from nanobot.mc.executor import _run_agent_on_task

    mock_provider = MagicMock()
    mock_provider.chat = AsyncMock(return_value=MagicMock(
        content="done", has_tool_calls=False, tool_calls=[], reasoning_content=None
    ))
    mock_provider.get_default_model = MagicMock(return_value=SONNET_MODEL)

    with patch(
        "nanobot.mc.executor._make_provider",
        return_value=(mock_provider, SONNET_MODEL),
    ):
        await _run_agent_on_task(
            agent_name="test-agent",
            agent_prompt="You are a test agent.",
            agent_model=SONNET_MODEL,
            reasoning_level="low",
            task_title="Test task",
            task_description="Do something",
        )

    chat_calls = mock_provider.chat.call_args_list
    assert chat_calls, "provider.chat() was never called"

    # Verify reasoning_level was threaded through to provider.chat()
    last_kwargs = chat_calls[-1].kwargs
    assert last_kwargs.get("reasoning_level") == "low", (
        f"provider.chat() was NOT called with reasoning_level='low'.\n"
        f"Actual kwargs: {last_kwargs}"
    )
```

**Step 2: Run the full test file**

```bash
uv run pytest tests/mc/test_model_tier_reasoning.py -v
```

Expected: all 11+ tests `PASSED`, 0 `xfailed`

**Step 3: Run the full MC test suite**

```bash
uv run pytest tests/mc/ -v
```

Expected: all pass.

**Step 4: Commit**

```bash
git add tests/mc/test_model_tier_reasoning.py
git commit -m "test: remove xfail markers — tier reasoning propagation fully implemented"
```

---

### Task 8: Final verification

**Step 1: Run all tests**

```bash
uv run pytest tests/ -v
```

Expected: all pass, no regressions.

**Step 2: Verify the git log looks clean**

```bash
git log --oneline -6
```

Expected output (approximately):
```
xxxxxxx test: remove xfail markers — tier reasoning propagation fully implemented
xxxxxxx feat(oauth-provider): inject thinking param + parse thinking blocks from SSE
xxxxxxx feat(litellm-provider): inject thinking/reasoning_effort kwargs from reasoning_level
xxxxxxx feat(providers): add reasoning_level param to LLMProvider.chat() interface
xxxxxxx feat(agent-loop): forward reasoning_level to provider.chat()
xxxxxxx feat(executor): resolve and thread reasoning_level from tier settings to _run_agent_on_task
xxxxxxx feat(tier-resolver): add resolve_reasoning_level() from tier_reasoning_levels setting
```
