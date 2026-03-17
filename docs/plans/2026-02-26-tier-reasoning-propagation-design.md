# Design: Tier Reasoning Level Propagation

**Date:** 2026-02-26
**Status:** Approved

## Problem

The `tier_reasoning_levels` setting is saved by the Settings UI to Convex but is never read by the Python backend. Changing reasoning level for a model tier (e.g. `standard-medium`) has no effect on the actual API calls.

## Solution

Thread a `reasoning_level` string (`"low"`, `"medium"`, `"max"`, or `None`) from `TierResolver` through the entire execution stack to `provider.chat()`, where it is translated into provider-native parameters.

## Data Flow

```
Settings UI  ──saves──→  tier_reasoning_levels: {"standard-medium": "low"}
                                          │ (Convex)
                                          ▼
TierResolver.resolve_reasoning_level()   ← reads tier_reasoning_levels
          │
          ▼
executor._execute_task()   ← resolves model + reasoning_level after tier resolution
          │
          ▼
_run_agent_on_task(reasoning_level="low")
          │
          ▼
AgentLoop(reasoning_level="low")
          │
          ▼
provider.chat(reasoning_level="low")
          │
          ├─ LiteLLMProvider (API Key)
          │     ├─ anthropic/*  →  thinking={"type":"enabled","budget_tokens":1024}
          │     └─ openai/*     →  reasoning_effort="low"
          │
          └─ AnthropicOAuthProvider (OAuth)
                →  body["thinking"] = {"type":"enabled","budget_tokens":1024}
                   temperature = 1.0  (required by Anthropic when thinking is on)
```

## Value Mapping

| UI Level | Anthropic `budget_tokens` | OpenAI `reasoning_effort` |
|----------|--------------------------|---------------------------|
| off / None | *(param omitted)*      | *(param omitted)*         |
| low      | 1024                     | "low"                     |
| medium   | 8000                     | "medium"                  |
| max      | 16000                    | "high"                    |

## Files Changed

| File | Change |
|------|--------|
| `nanobot/mc/tier_resolver.py` | Add `resolve_reasoning_level()` method; extend `_refresh_cache()` to also fetch `tier_reasoning_levels` into a second cache dict |
| `nanobot/mc/executor.py` | After resolving tier model, resolve reasoning level; pass to `_run_agent_on_task()` |
| `nanobot/mc/executor.py:_run_agent_on_task()` | Add `reasoning_level: str \| None = None` param; pass to `AgentLoop` |
| `nanobot/agent/loop.py` | `AgentLoop.__init__()` accepts `reasoning_level`; `_run_agent_loop()` passes it to `provider.chat()` |
| `nanobot/providers/base.py` | Add `reasoning_level: str \| None = None` to abstract `chat()` signature |
| `nanobot/providers/litellm_provider.py` | Detect model prefix; inject `thinking` dict for Anthropic or `reasoning_effort` for OpenAI |
| `nanobot/providers/anthropic_oauth_provider.py` | Inject `thinking` in body; force `temperature=1.0`; parse thinking blocks in SSE stream |
| `tests/mc/test_model_tier_reasoning.py` | Remove 4 `xfail` markers — tests should now pass |

## Compatibility Notes

- **Anthropic constraint**: `temperature` must be `1.0` when `thinking` is enabled. `AnthropicOAuthProvider` overrides temperature automatically.
- **Multi-turn thinking**: `reasoning_content` is already stored in conversation history (`context.py:234`). LiteLLM path works; OAuth provider will parse thinking blocks in `_consume_sse`.
- **Other providers** (custom, codex): `reasoning_level` is silently ignored — no change in behaviour.
- **Non-tier agents**: If an agent uses a direct model ID (not a `tier:` reference), `reasoning_level` will be `None` and no reasoning param is sent.

## Testing

The test file `tests/mc/test_model_tier_reasoning.py` already contains 4 `xfail` tests that will become the acceptance criteria:

1. `test_resolve_reasoning_level_exists` — `TierResolver.resolve_reasoning_level()` method exists
2. `test_resolve_reasoning_level_off_when_not_configured` — returns `None` when not set
3. `test_changing_reasoning_level_in_settings_is_reflected` — cache invalidation picks up changes
4. `test_standard_medium_reasoning_low_reaches_provider_chat` — `provider.chat()` receives thinking param
