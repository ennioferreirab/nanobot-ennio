# Embedding Model Setting Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a dashboard setting for the memory embedding model (pre-filled with `openrouter/openai/text-embedding-3-small`) with a toggle switch, wired through to the Python backend so all memory search paths use FTS+vector when configured.

**Architecture:** The setting is stored in Convex (`memory_embedding_model` key). The gateway reads it on startup and sets `os.environ["NANOBOT_MEMORY_EMBEDDING_MODEL"]`. All existing code (`HybridMemoryStore`, `MemoryIndex`, `mcp_bridge`, `CCWorkspaceManager`) then picks it up automatically via env var. `LiteLLMProvider.embed()` gets a try/except so any API failure silently falls back to FTS-only.

**Tech Stack:** TypeScript/React (dashboard), Python (backend), Convex (settings store), litellm (embedding calls).

---

### Task 1: Backend — graceful fallback in `LiteLLMProvider`

**Files:**
- Modify: `mc/memory/providers.py`
- Test: `tests/mc/memory/test_providers.py`

**Step 1: Add a failing test for embed() exception fallback**

Open `tests/mc/memory/test_providers.py` and add at the end:

```python
def test_litellm_provider_returns_none_on_exception():
    from unittest.mock import patch
    from mc.memory.providers import LiteLLMProvider
    provider = LiteLLMProvider("some-model")
    with patch("litellm.embedding", side_effect=RuntimeError("API error")):
        result = provider.embed(["hello"])
    assert result is None
```

**Step 2: Run test to verify it fails**

```bash
uv run pytest tests/mc/memory/test_providers.py::test_litellm_provider_returns_none_on_exception -v
```

Expected: FAIL — `RuntimeError: API error` propagates (no try/except yet).

**Step 3: Wrap `embed()` in try/except in `mc/memory/providers.py`**

Current `LiteLLMProvider.embed()` (lines 28–48):
```python
def embed(self, texts: list[str]) -> list[list[float]] | None:
    import litellm
    response = litellm.embedding(model=self.model, input=texts)
    ...
```

Change to:
```python
def embed(self, texts: list[str]) -> list[list[float]] | None:
    import litellm
    try:
        response = litellm.embedding(model=self.model, input=texts)
    except Exception:
        return None
    data: Any = getattr(response, "data", None)
    ...
```

**Step 4: Run all provider tests**

```bash
uv run pytest tests/mc/memory/test_providers.py -v
```

Expected: all PASS.

**Step 5: Commit**

```bash
git add mc/memory/providers.py tests/mc/memory/test_providers.py
git commit -m "fix(memory): graceful fallback to FTS-only when embedding API fails"
```

---

### Task 2: Backend — env var fallback in `MemoryIndex.__init__`

**Files:**
- Modify: `mc/memory/index.py` (line 24)
- Test: `tests/mc/memory/test_index.py`

**Step 1: Add a failing test**

Add at the end of `tests/mc/memory/test_index.py`:

```python
def test_index_reads_embedding_model_from_env(tmp_path, monkeypatch):
    """MemoryIndex picks up NANOBOT_MEMORY_EMBEDDING_MODEL from env when no arg passed."""
    monkeypatch.setenv("NANOBOT_MEMORY_EMBEDDING_MODEL", "some-model")
    from mc.memory.index import MemoryIndex
    idx = MemoryIndex(tmp_path)
    assert idx._provider.__class__.__name__ == "LiteLLMProvider"
    assert idx._provider.model == "some-model"
```

**Step 2: Run test to verify it fails**

```bash
uv run pytest tests/mc/memory/test_index.py::test_index_reads_embedding_model_from_env -v
```

Expected: FAIL — provider is `NullProvider` (env var not read).

**Step 3: Add `import os` and env var fallback in `mc/memory/index.py`**

At top of file add `import os` (after existing `import hashlib`).

Change line 24–30:
```python
def __init__(self, memory_dir: Path, embedding_model: str | None = None):
    self.memory_dir = memory_dir
    self._db_path = memory_dir / "memory-index.sqlite"

    from mc.memory.providers import get_provider

    model = embedding_model or os.environ.get("NANOBOT_MEMORY_EMBEDDING_MODEL")
    self._provider: typing.Any = get_provider(model)
    self._provider_is_null = self._provider.__class__.__name__ == "NullProvider"
```

**Step 4: Run all memory index tests**

```bash
uv run pytest tests/mc/memory/test_index.py -v
```

Expected: all PASS.

**Step 5: Commit**

```bash
git add mc/memory/index.py tests/mc/memory/test_index.py
git commit -m "feat(memory): MemoryIndex reads NANOBOT_MEMORY_EMBEDDING_MODEL env var as fallback"
```

---

### Task 3: Backend — gateway reads setting and sets env var

**Files:**
- Modify: `mc/gateway.py`
- Test: `tests/mc/test_gateway_embedding.py` (new)

**Step 1: Find the correct insertion point in `mc/gateway.py`**

Search for `_sync_model_tiers(bridge)` in `mc/gateway.py`. The gateway startup sequence looks like:

```python
_sync_model_tiers(bridge)
logger.info("[gateway] Model tiers synced")
```

The new embedding sync goes right after this block.

**Step 2: Write a failing test**

Create `tests/mc/test_gateway_embedding.py`:

```python
"""Test gateway embedding model sync."""
import os
from unittest.mock import MagicMock, patch


def _make_bridge(setting_value):
    bridge = MagicMock()
    bridge.query.return_value = setting_value
    return bridge


def test_gateway_sets_env_var_when_setting_present():
    from mc.gateway import _sync_embedding_model
    bridge = _make_bridge("openrouter/openai/text-embedding-3-small")
    env = {}
    with patch.dict(os.environ, env, clear=False):
        _sync_embedding_model(bridge)
    assert os.environ.get("NANOBOT_MEMORY_EMBEDDING_MODEL") == "openrouter/openai/text-embedding-3-small"


def test_gateway_clears_env_var_when_setting_empty():
    from mc.gateway import _sync_embedding_model
    bridge = _make_bridge("")
    with patch.dict(os.environ, {"NANOBOT_MEMORY_EMBEDDING_MODEL": "old-model"}, clear=False):
        _sync_embedding_model(bridge)
    assert "NANOBOT_MEMORY_EMBEDDING_MODEL" not in os.environ


def test_gateway_clears_env_var_when_setting_none():
    from mc.gateway import _sync_embedding_model
    bridge = _make_bridge(None)
    with patch.dict(os.environ, {"NANOBOT_MEMORY_EMBEDDING_MODEL": "old-model"}, clear=False):
        _sync_embedding_model(bridge)
    assert "NANOBOT_MEMORY_EMBEDDING_MODEL" not in os.environ
```

**Step 3: Run tests to verify they fail**

```bash
uv run pytest tests/mc/test_gateway_embedding.py -v
```

Expected: FAIL — `ImportError: cannot import name '_sync_embedding_model'`

**Step 4: Add `_sync_embedding_model` function to `mc/gateway.py`**

Find the `_sync_model_tiers` function and add a new function nearby (not inside it). Add this as a top-level function in the file (near other `_sync_*` helpers):

```python
def _sync_embedding_model(bridge) -> None:
    """Read memory_embedding_model setting and set NANOBOT_MEMORY_EMBEDDING_MODEL env var."""
    import os as _os
    try:
        model = bridge.query("settings:get", {"key": "memory_embedding_model"})
    except Exception:
        logger.warning("[gateway] Failed to read memory_embedding_model setting")
        return
    if model:
        _os.environ["NANOBOT_MEMORY_EMBEDDING_MODEL"] = model
        logger.info("[gateway] Memory embedding model set: %s", model)
    else:
        _os.environ.pop("NANOBOT_MEMORY_EMBEDDING_MODEL", None)
        logger.info("[gateway] Memory embedding model cleared (FTS-only)")
```

**Step 5: Call `_sync_embedding_model` in the startup sequence**

In the `main()` function, after the `_sync_model_tiers(bridge)` block, add:

```python
        # Sync embedding model setting
        try:
            _sync_embedding_model(bridge)
        except Exception:
            logger.exception("[gateway] Embedding model sync failed")
```

**Step 6: Run tests**

```bash
uv run pytest tests/mc/test_gateway_embedding.py -v
```

Expected: all PASS.

**Step 7: Commit**

```bash
git add mc/gateway.py tests/mc/test_gateway_embedding.py
git commit -m "feat(gateway): sync memory_embedding_model setting to env var on startup"
```

---

### Task 4: Dashboard UI — embedding model toggle + input in SettingsPanel

**Files:**
- Modify: `dashboard/components/SettingsPanel.tsx`

No new test file — this is UI that requires visual verification.

**Step 1: Understand the current shape of SettingsPanel.tsx**

Key patterns already used:
- `getValue("some_key")` reads from Convex (falls back to `DEFAULTS`)
- `handleSave("some_key", value)` writes to Convex and shows green checkmark
- `savedFields["some_key"]` is `true` for 1.5s after save
- `Switch` from `@/components/ui/switch` for toggles
- `Input` from `@/components/ui/input` for text fields
- `Separator` between sections

**Step 2: Add the embedding model section**

The new section goes after `<ModelTierSettings />` at the end of the panel, inside `<div className="space-y-6 ...">`. Add a `<Separator />` before it.

The embedding model setting uses two Convex keys:
- `memory_embedding_model` — the model string (or `""` when disabled)

The UI logic:
- Toggle ON = model string is non-empty
- Toggle OFF = model string is `""`
- Text input is only enabled when toggle is ON
- Pre-fill value (shown even when disabled): `openrouter/openai/text-embedding-3-small`

Add a local state for the text input so the user can type before saving:

```tsx
// Add near top of SettingsPanel component, after existing useState calls:
const DEFAULT_EMBEDDING_MODEL = "openrouter/openai/text-embedding-3-small";

// Local state for the text input value (independent from Convex until blur/enter)
const [embeddingInputValue, setEmbeddingInputValue] = useState(DEFAULT_EMBEDDING_MODEL);

// Sync local state when Convex value loads
const embeddingModelValue = getValue("memory_embedding_model") ?? "";
const embeddingEnabled = embeddingModelValue.trim().length > 0;

useEffect(() => {
  if (embeddingModelValue.trim().length > 0) {
    setEmbeddingInputValue(embeddingModelValue);
  }
}, [embeddingModelValue]);
```

**Step 3: Write the JSX block**

Add this after `<ModelTierSettings />`:

```tsx
      <Separator />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <label className="text-sm font-medium">Vector Memory Search</label>
          </div>
          <div className="flex items-center gap-2">
            {savedFields["memory_embedding_model"] && (
              <Check className="h-4 w-4 text-green-500 transition-opacity" />
            )}
            <Switch
              checked={embeddingEnabled}
              onCheckedChange={(checked) => {
                if (checked) {
                  const model = embeddingInputValue.trim() || DEFAULT_EMBEDDING_MODEL;
                  setEmbeddingInputValue(model);
                  handleSave("memory_embedding_model", model);
                } else {
                  handleSave("memory_embedding_model", "");
                }
              }}
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Embedding Model</label>
          <Input
            value={embeddingInputValue}
            disabled={!embeddingEnabled}
            placeholder={DEFAULT_EMBEDDING_MODEL}
            onChange={(e) => setEmbeddingInputValue(e.target.value)}
            onBlur={() => {
              if (embeddingEnabled) {
                const val = embeddingInputValue.trim() || DEFAULT_EMBEDDING_MODEL;
                setEmbeddingInputValue(val);
                handleSave("memory_embedding_model", val);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && embeddingEnabled) {
                const val = embeddingInputValue.trim() || DEFAULT_EMBEDDING_MODEL;
                setEmbeddingInputValue(val);
                handleSave("memory_embedding_model", val);
                (e.target as HTMLInputElement).blur();
              }
            }}
            className={!embeddingEnabled ? "opacity-50 cursor-not-allowed" : ""}
          />
          <p className="text-xs text-muted-foreground">
            {embeddingEnabled
              ? "Memory search uses FTS + vector embeddings. Falls back to FTS-only if the model is unavailable."
              : "Enable to use FTS + vector search. FTS-only when disabled."}
          </p>
        </div>
      </div>
```

**Step 4: Verify TypeScript compiles**

```bash
cd dashboard && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

**Step 5: Visual verification checklist**

Open the Settings panel and verify:
- [ ] Toggle starts OFF when `memory_embedding_model` is not set
- [ ] Text input shows `openrouter/openai/text-embedding-3-small` (disabled/greyed)
- [ ] Clicking toggle ON enables the input and saves the model to Convex
- [ ] Green checkmark appears for 1.5s after save
- [ ] Editing the model text and blurring saves the new value
- [ ] Clicking toggle OFF saves `""` to Convex and disables the input
- [ ] Hint text changes based on toggle state

**Step 6: Commit**

```bash
git add dashboard/components/SettingsPanel.tsx
git commit -m "feat(dashboard): add Vector Memory Search toggle and embedding model input"
```

---

### Task 5: Full integration smoke test

**Step 1: Run all memory-related tests**

```bash
uv run pytest tests/mc/memory/ tests/cc/test_memory_consolidator.py tests/mc/test_gateway_embedding.py -v
```

Expected: all PASS, no regressions.

**Step 2: Run broader regression suite**

```bash
uv run pytest tests/ -v --timeout=30 -k "not (test_auto_title or test_manual_tasks or test_mention or test_process_manager or test_state_machine or test_subscriptions)" 2>&1 | tail -20
```

Expected: no new failures.

**Step 3: Commit if clean**

```bash
git add -u
git commit -m "chore: verify embedding model setting integration — all tests passing"
```

---

## Summary

| Task | Files | Tests |
|------|-------|-------|
| 1. Graceful embed fallback | `mc/memory/providers.py` | `tests/mc/memory/test_providers.py` |
| 2. MemoryIndex env var fallback | `mc/memory/index.py` | `tests/mc/memory/test_index.py` |
| 3. Gateway setting sync | `mc/gateway.py` | `tests/mc/test_gateway_embedding.py` |
| 4. Dashboard UI | `dashboard/components/SettingsPanel.tsx` | Visual |
| 5. Integration smoke | — | All memory + regression tests |
