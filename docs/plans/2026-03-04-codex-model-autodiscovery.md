# Codex Model Auto-Discovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auto-populate the MC dashboard model selector with OpenAI Codex models (`gpt-5.3-codex`, `gpt-5.2`) when the user is authenticated, and support reasoning effort for Codex requests.

**Architecture:** Two focused changes: (1) add `CODEX_MODELS`, `list_models()`, and reasoning support to `OpenAICodexProvider`; (2) extend `list_available_models()` in `mc/provider_factory.py` to detect Codex auth via `get_token()` and merge its models with `config.agents.models`. The gateway already syncs this list to Convex on startup, so the dashboard picks it up with zero frontend changes.

**Tech Stack:** Python, `oauth_cli_kit.get_token`, `uv run pytest`

---

### Task 1: Add CODEX_MODELS, list_models(), and reasoning to OpenAICodexProvider

**Files:**
- Modify: `vendor/nanobot/nanobot/providers/openai_codex_provider.py`

**Step 1: Write the failing test**

Add to `tests/mc/test_provider_factory.py` (end of file):

```python
class TestOpenAICodexProviderListModels:
    """OpenAICodexProvider.list_models() returns the known Codex models."""

    def test_list_models_returns_codex_models(self):
        from nanobot.providers.openai_codex_provider import OpenAICodexProvider, CODEX_MODELS
        provider = OpenAICodexProvider()
        assert provider.list_models() == CODEX_MODELS
        assert "openai-codex/gpt-5.3-codex" in CODEX_MODELS
        assert "openai-codex/gpt-5.2" in CODEX_MODELS
        assert "openai-codex/gpt-5.1-codex" not in CODEX_MODELS
```

**Step 2: Run test to verify it fails**

```bash
uv run pytest tests/mc/test_provider_factory.py::TestOpenAICodexProviderListModels -v
```

Expected: `ImportError: cannot import name 'CODEX_MODELS'` or `AttributeError`

**Step 3: Implement in openai_codex_provider.py**

Add after line 16 (`DEFAULT_ORIGINATOR = "nanobot"`):

```python
CODEX_MODELS: list[str] = [
    "openai-codex/gpt-5.3-codex",
    "openai-codex/gpt-5.2",
]
```

Change `__init__` default model to `"openai-codex/gpt-5.3-codex"`:

```python
def __init__(self, default_model: str = "openai-codex/gpt-5.3-codex"):
```

Add `list_models()` method after `get_default_model()`:

```python
def list_models(self) -> list[str]:
    return list(CODEX_MODELS)
```

**Step 4: Run test to verify it passes**

```bash
uv run pytest tests/mc/test_provider_factory.py::TestOpenAICodexProviderListModels -v
```

Expected: PASS

**Step 5: Write reasoning test**

Add to `tests/mc/test_provider_factory.py`:

```python
class TestOpenAICodexProviderReasoning:
    """Reasoning effort is passed correctly to the Codex API body."""

    @pytest.mark.asyncio
    async def test_reasoning_level_added_to_body(self):
        """When reasoning_level is set, body includes reasoning.effort."""
        import httpx
        from unittest.mock import AsyncMock, patch, MagicMock
        from nanobot.providers.openai_codex_provider import OpenAICodexProvider

        provider = OpenAICodexProvider()

        captured_body = {}

        async def fake_request_codex(url, headers, body, verify):
            captured_body.update(body)
            return ("hello", [], "stop")

        mock_token = MagicMock()
        mock_token.account_id = "acc123"
        mock_token.access = "tok123"

        with patch("nanobot.providers.openai_codex_provider.get_codex_token", return_value=mock_token), \
             patch("nanobot.providers.openai_codex_provider._request_codex", side_effect=fake_request_codex):
            await provider.chat(
                messages=[{"role": "user", "content": "hi"}],
                reasoning_level="medium",
            )

        assert captured_body.get("reasoning") == {"effort": "medium"}

    @pytest.mark.asyncio
    async def test_reasoning_max_maps_to_high(self):
        """'max' reasoning_level is sent as 'high' to the API."""
        from unittest.mock import patch, MagicMock
        from nanobot.providers.openai_codex_provider import OpenAICodexProvider

        provider = OpenAICodexProvider()
        captured_body = {}

        async def fake_request_codex(url, headers, body, verify):
            captured_body.update(body)
            return ("hello", [], "stop")

        mock_token = MagicMock()
        mock_token.account_id = "acc"
        mock_token.access = "tok"

        with patch("nanobot.providers.openai_codex_provider.get_codex_token", return_value=mock_token), \
             patch("nanobot.providers.openai_codex_provider._request_codex", side_effect=fake_request_codex):
            await provider.chat(
                messages=[{"role": "user", "content": "hi"}],
                reasoning_level="max",
            )

        assert captured_body.get("reasoning") == {"effort": "high"}

    @pytest.mark.asyncio
    async def test_no_reasoning_when_not_set(self):
        """When reasoning_level is None, body has no 'reasoning' key."""
        from unittest.mock import patch, MagicMock
        from nanobot.providers.openai_codex_provider import OpenAICodexProvider

        provider = OpenAICodexProvider()
        captured_body = {}

        async def fake_request_codex(url, headers, body, verify):
            captured_body.update(body)
            return ("hello", [], "stop")

        mock_token = MagicMock()
        mock_token.account_id = "acc"
        mock_token.access = "tok"

        with patch("nanobot.providers.openai_codex_provider.get_codex_token", return_value=mock_token), \
             patch("nanobot.providers.openai_codex_provider._request_codex", side_effect=fake_request_codex):
            await provider.chat(messages=[{"role": "user", "content": "hi"}])

        assert "reasoning" not in captured_body
```

**Step 6: Run reasoning tests to verify they fail**

```bash
uv run pytest tests/mc/test_provider_factory.py::TestOpenAICodexProviderReasoning -v
```

Expected: FAIL — `reasoning` key not in body

**Step 7: Implement reasoning in chat()**

In `openai_codex_provider.py`, inside `chat()`, after building the `body` dict and before the `if tools:` block, add:

```python
# Reasoning effort — "max" is MC alias, maps to "high" for the API
effective_reasoning = reasoning_level or reasoning_effort
if effective_reasoning:
    effort = "high" if effective_reasoning == "max" else effective_reasoning
    body["reasoning"] = {"effort": effort}
```

**Step 8: Run all reasoning tests**

```bash
uv run pytest tests/mc/test_provider_factory.py::TestOpenAICodexProviderReasoning -v
```

Expected: all 3 PASS

**Step 9: Run full test suite to check no regressions**

```bash
uv run pytest tests/mc/test_provider_factory.py -v
```

Expected: all PASS

**Step 10: Commit**

```bash
git add vendor/nanobot/nanobot/providers/openai_codex_provider.py tests/mc/test_provider_factory.py
git commit -m "feat(codex): add CODEX_MODELS, list_models(), and reasoning effort support"
```

---

### Task 2: Auto-discover Codex models in list_available_models()

**Files:**
- Modify: `mc/provider_factory.py`
- Test: `tests/mc/test_provider_factory.py`

**Step 1: Write failing tests**

Add to `tests/mc/test_provider_factory.py`:

```python
class TestListAvailableModelsCodexDiscovery:
    """list_available_models() merges Codex models when Codex is authenticated."""

    def _make_config(self, models=None):
        mock_config = MagicMock()
        mock_config.agents.defaults.model = "anthropic-oauth/claude-sonnet-4-6"
        mock_config.agents.models = models or [
            "anthropic-oauth/claude-sonnet-4-6",
            "anthropic-oauth/claude-opus-4-6",
        ]
        return mock_config

    def test_codex_models_added_when_authenticated(self):
        """When get_token() succeeds, Codex models are appended to the list."""
        from mc.provider_factory import list_available_models
        from nanobot.providers.openai_codex_provider import CODEX_MODELS
        from unittest.mock import MagicMock

        mock_token = MagicMock()
        config = self._make_config()

        with patch("nanobot.config.loader.load_config", return_value=config), \
             patch("mc.provider_factory._get_codex_token", return_value=mock_token):
            result = list_available_models()

        for m in CODEX_MODELS:
            assert m in result

    def test_codex_models_not_added_when_not_authenticated(self):
        """When get_token() raises, Codex models are NOT added."""
        from mc.provider_factory import list_available_models
        from nanobot.providers.openai_codex_provider import CODEX_MODELS

        config = self._make_config()

        with patch("nanobot.config.loader.load_config", return_value=config), \
             patch("mc.provider_factory._get_codex_token", side_effect=Exception("no token")):
            result = list_available_models()

        for m in CODEX_MODELS:
            assert m not in result

    def test_codex_models_not_duplicated(self):
        """If a Codex model is already in config.agents.models, it appears only once."""
        from mc.provider_factory import list_available_models
        from unittest.mock import MagicMock

        config = self._make_config(models=["openai-codex/gpt-5.3-codex", "anthropic-oauth/claude-sonnet-4-6"])
        mock_token = MagicMock()

        with patch("nanobot.config.loader.load_config", return_value=config), \
             patch("mc.provider_factory._get_codex_token", return_value=mock_token):
            result = list_available_models()

        assert result.count("openai-codex/gpt-5.3-codex") == 1
```

**Step 2: Run tests to verify they fail**

```bash
uv run pytest tests/mc/test_provider_factory.py::TestListAvailableModelsCodexDiscovery -v
```

Expected: `AttributeError: module 'mc.provider_factory' has no attribute '_get_codex_token'`

**Step 3: Implement in mc/provider_factory.py**

Add a module-level helper after the imports:

```python
def _get_codex_token():
    """Try to get the Codex OAuth token. Raises if not authenticated."""
    from oauth_cli_kit import get_token
    return get_token()
```

Modify `list_available_models()` — replace the body with:

```python
def list_available_models() -> list[str]:
    """Return model identifiers available from the configured provider.

    Priority:
      1. agents.models in config — explicit user-defined list (base).
      2. Authenticated OAuth providers — Codex models merged in if token exists.
      3. Provider API query — e.g. GET /v1/models for OpenRouter, Anthropic, etc.
      4. Fallback — just the default model if everything else fails.
    """
    from nanobot.config.loader import load_config

    config = load_config()
    default_model = config.agents.defaults.model

    # 1. Explicit user-defined list as base
    if config.agents.models:
        models: list[str] = list(config.agents.models)
        # 2. Merge Codex models if authenticated
        models = _merge_codex_models(models)
        return models

    # 3. Query the active provider's models endpoint
    try:
        provider, _ = create_provider(model=None)
        models_from_api = provider.list_models()
        if models_from_api:
            return _merge_codex_models(models_from_api)
    except Exception as e:
        logger.warning("list_available_models: provider query failed: %s", e)

    # 4. Fallback
    base = [default_model] if default_model else []
    return _merge_codex_models(base)
```

Add the merge helper after `_get_codex_token`:

```python
def _merge_codex_models(models: list[str]) -> list[str]:
    """Append Codex models if the user is authenticated, without duplicates."""
    try:
        _get_codex_token()
    except Exception:
        return models

    from nanobot.providers.openai_codex_provider import CODEX_MODELS
    existing = set(models)
    return models + [m for m in CODEX_MODELS if m not in existing]
```

**Step 4: Run tests to verify they pass**

```bash
uv run pytest tests/mc/test_provider_factory.py::TestListAvailableModelsCodexDiscovery -v
```

Expected: all 3 PASS

**Step 5: Run full test suite**

```bash
uv run pytest tests/mc/test_provider_factory.py -v
```

Expected: all PASS

**Step 6: Smoke test end-to-end**

```bash
uv run python -c "from mc.provider_factory import list_available_models; print(list_available_models())"
```

Expected: list includes `openai-codex/gpt-5.3-codex` and `openai-codex/gpt-5.2` (since Codex is authenticated).

**Step 7: Commit**

```bash
git add mc/provider_factory.py tests/mc/test_provider_factory.py
git commit -m "feat(mc): auto-discover Codex models in list_available_models() when authenticated"
```
