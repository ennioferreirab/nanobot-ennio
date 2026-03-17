# MC Plan Sync — Design

## Overview

Hook handler that syncs CC plan detection and step completion to Mission Control via IPC direct socket communication.

## Architecture

```
CC CLI (workspace: ~/.nanobot/agents/{agent}/)
  └─ hook fires → mc.hooks.dispatcher
       └─ MCPlanSyncHandler
            └─ SyncIPCClient ──Unix socket──→ MCSocketServer (MC runtime)
                                                   └─ ConvexBridge → Convex DB
```

## Key Constraint: Socket Path Discovery

MC env vars (`MC_SOCKET_PATH`, `AGENT_NAME`, `TASK_ID`) are only in `.mcp.json` for the MCP bridge subprocess. Hooks don't inherit them.

**Discovery strategy** (try in order):
1. `MC_SOCKET_PATH` env var (if explicitly set)
2. Read `{cwd}/.mcp.json` → extract `mcpServers.nanobot.env.MC_SOCKET_PATH` (+ AGENT_NAME, TASK_ID)
3. If no `.mcp.json` or no socket → skip silently (standalone CC session)

The CC CLI runs from `~/.nanobot/agents/{agent}/` which contains `.mcp.json`. The hook process inherits this cwd.

## Transport: Sync IPC Client

Hooks are blocking shell commands. The existing `MCSocketClient` is async. We need a lightweight sync client using stdlib `socket` module.

Protocol: same JSON-RPC over Unix socket as the MCP bridge uses.
- Request: `{"method": "...", "params": {...}}\n`
- Response: `{"key": "value"}\n`
- Timeout: 5 seconds (hooks should be fast)

## IPC Methods Used

No vendor code changes. Uses existing MCSocketServer methods only:

| Hook Event | IPC Method | Purpose |
|------------|------------|---------|
| PostToolUse/Write (plan detected) | `report_progress` | Report plan structure to MC |
| TaskCompleted (step matched) | `report_progress` | Report step completion + progress |

`report_progress` creates Convex activity events (STEP_STARTED) without side effects. Follow-up: add `delegate_task` to create real MC tasks per step.

## Handler: MCPlanSyncHandler

Events: `[("PostToolUse", "Write"), ("TaskCompleted", None)]`

### Plan Write Flow
1. Check if written file matches plan pattern (`docs/plans/*.md`)
2. Parse `### Task N: Name` + `**Blocked by:** Task X, Y` (reuse plan_tracker parse logic)
3. Discover MC context from `.mcp.json`
4. Call `report_progress` with plan summary
5. Return additionalContext for CC

### Task Completed Flow
1. Extract task subject from payload
2. Match to plan step via regex `Task ([0-9]+)` or name lookup
3. Discover MC context from `.mcp.json`
4. Call `report_progress` with completion + unblocked info
5. Return additionalContext for CC

## Edge Cases

- **No `.mcp.json`** → standalone CC, skip silently
- **Socket doesn't exist** → MC not running, skip silently
- **IPC fails** → non-fatal, log + skip (hook must never break CC)
- **Not a plan file** → skip
- **Task doesn't match plan step** → skip

## Files

| File | Action |
|------|--------|
| `mc/hooks/ipc_sync.py` | CREATE — sync Unix socket client |
| `mc/hooks/handlers/mc_plan_sync.py` | CREATE — plan sync handler |
| `mc/hooks/handlers/plan_tracker.py` | REFACTOR — extract reusable parse function |
| `tests/mc/test_mc_plan_sync.py` | CREATE — tests |
