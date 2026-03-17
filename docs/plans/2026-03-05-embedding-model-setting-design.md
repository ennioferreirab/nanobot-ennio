# Design: Embedding Model Setting in Dashboard

## Goal

Add a UI setting for `memory_embedding_model` so agents use hybrid FTS+vector memory search. Pre-filled with `openrouter/openai/text-embedding-3-small`, toggled on/off by the user. Graceful fallback to FTS-only if the model is unavailable.

## Changes

### 1. Dashboard UI (`SettingsPanel.tsx`)

Add a new section after Model Tier Settings:

- **Toggle switch** (off by default) labeled "Vector Memory Search"
- **Text input** (disabled when toggle off) pre-filled with `openrouter/openai/text-embedding-3-small`
- **Hint text**: "When enabled, memory search uses FTS + vector embeddings. Falls back to FTS-only if the model is unavailable."
- Saves to Convex key `memory_embedding_model`:
  - Toggle ON → saves the text input value
  - Toggle OFF → saves empty string `""`

### 2. Convex settings

No schema change needed — `settings` table is already a generic key-value store.

Key: `memory_embedding_model`
Value: `"openrouter/openai/text-embedding-3-small"` or `""`

### 3. Gateway startup (`mc/gateway.py`)

In the startup sequence (after `_sync_model_tiers`), read the setting and set the env var:

```python
embedding_model = bridge.query("settings:get", {"key": "memory_embedding_model"})
if embedding_model:
    os.environ["NANOBOT_MEMORY_EMBEDDING_MODEL"] = embedding_model
else:
    os.environ.pop("NANOBOT_MEMORY_EMBEDDING_MODEL", None)
```

### 4. MemoryIndex env var fallback (`mc/memory/index.py`)

Add env var fallback so all callers (mcp_bridge, CCWorkspaceManager, CCMemoryConsolidator) get embeddings without code changes:

```python
def __init__(self, memory_dir, embedding_model=None):
    model = embedding_model or os.environ.get("NANOBOT_MEMORY_EMBEDDING_MODEL")
    self._provider = get_provider(model)
```

### 5. Graceful fallback in `LiteLLMProvider`

Wrap `litellm.embedding()` in try/except so a failed embedding call degrades to FTS-only instead of crashing:

```python
def embed(self, texts):
    try:
        response = litellm.embedding(model=self.model, input=texts)
        ...
    except Exception:
        return None  # Fallback: no vectors, FTS-only
```

## Files to modify

| File | Change |
|------|--------|
| `dashboard/components/SettingsPanel.tsx` | Add toggle + text input for embedding model |
| `mc/gateway.py` | Read setting → set env var on startup |
| `mc/memory/index.py` | Add `os.environ.get()` fallback in `__init__` |
| `mc/memory/providers.py` | Add try/except in `LiteLLMProvider.embed()` |

## Acceptance Criteria

- Toggle OFF → `memory_embedding_model` is `""` → FTS-only (existing behavior)
- Toggle ON → model string saved → agents use FTS+vector
- If embedding API fails → falls back to FTS-only silently (no crash)
- Existing tests pass (`uv run pytest tests/mc/memory/ tests/cc/ -v`)
