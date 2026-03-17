# Design: Sync Nanobot Default Model from Convex on Gateway Startup

**Date:** 2026-03-05
**Status:** Approved

## Problem

The nanobot gateway (Telegram/channels) reads its model from `~/.nanobot/config.json → agents.defaults.model` at startup. This is a static value, independent of the MC agent registry stored in Convex. When the user changes the `nanobot` agent's model in the dashboard, the Telegram channel keeps using the old model until the user manually edits `config.json`.

## Solution

Add `sync_nanobot_default_model(bridge)` to `mc/gateway.py`. Called at gateway startup (after `sync_agent_registry()`), it reads the `nanobot` agent's model from Convex and writes it to `~/.nanobot/config.json` if different. On the next `nanobot mc start`, the nanobot gateway process picks up the updated value.

## Key Design Decisions

### Reference agent: `NANOBOT_AGENT_NAME` constant

Do NOT hardcode the string `"owl"` or any display name. Use the existing constant from `mc/types.py`:

```python
NANOBOT_AGENT_NAME = "nanobot"
```

The agent known to users as "Owl" is internally identified as `nanobot`. Using the constant makes the code resilient to display name changes.

### Model lookup: `bridge.get_agent_by_name()`

Already exists in `mc/bridge.py:584`. Returns the full agent dict or `None`.

### config.json update: atomic write

1. Read `~/.nanobot/config.json` as JSON
2. Set `config["agents"]["defaults"]["model"] = new_model`
3. Write to a temp file in the same directory
4. `os.replace(tmp, config_path)` — atomic on POSIX

### Error handling

| Condition | Behavior |
|-----------|----------|
| `nanobot` agent not in Convex | log WARNING, skip |
| agent has no `model` field | log WARNING, skip |
| model unchanged | log DEBUG, no write |
| config.json missing | log WARNING, skip |
| write failure | log ERROR, do NOT crash |

## Architecture

```
run_gateway()
  └── sync_agent_registry(bridge, agents_dir)    # existing
  └── sync_nanobot_default_model(bridge)          # NEW
        ├── bridge.get_agent_by_name(NANOBOT_AGENT_NAME)
        ├── read ~/.nanobot/config.json
        ├── compare model fields
        └── atomic write if changed
  └── _sync_model_tiers(bridge)                   # existing
```

## Files Changed

| File | Change |
|------|--------|
| `mc/gateway.py` | New function `sync_nanobot_default_model(bridge)` + call in `run_gateway()` |
| `tests/mc/test_sync_nanobot_model.py` | New test file |

## Test Cases

1. Convex returns model `anthropic-oauth/claude-opus-4-6` and config.json has Sonnet → config.json updated
2. Convex model matches config.json → no write, DEBUG log
3. `nanobot` agent absent from Convex → skip, WARNING log
4. Agent present but `model` field empty/None → skip, WARNING log
5. config.json missing → skip, WARNING log
