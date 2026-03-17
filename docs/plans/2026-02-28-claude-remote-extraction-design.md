# Design: claude-remote — Remote Claude Code Terminal Bridge

**Date:** 2026-02-28
**Status:** Approved

## Problem

The nanobot project contains a production-ready terminal bridge that connects remote Claude Code instances to a Convex-backed dashboard. This functionality is useful standalone — developers want to control remote Claude Code sessions from their browser without the full Mission Control system (tasks, orchestrator, executor, planner, etc.).

## Solution

Extract the terminal bridge into a standalone repo (`claude-remote`) as a lightweight monorepo with three layers:

1. **Python bridge** — connects local tmux/Claude to Convex
2. **Convex backend** — 3 tables, real-time data sync
3. **Dashboard** — minimal Next.js UI for terminal interaction

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Dashboard UI   │◄───►│ Convex Cloud  │◄───►│ Terminal Bridge   │
│  (Next.js)      │     │ (3 tables)   │     │ (Python + tmux)  │
│  localhost:3000  │     │              │     │ remote machine   │
└─────────────────┘     └──────────────┘     └──────────────────┘
```

- **Convex** is the central hub (serverless, real-time, zero infra)
- **Terminal Bridge** runs on the remote machine, pipes tmux ↔ Convex
- **Dashboard** runs locally (or anywhere), shows output and accepts input

## Repo Structure

```
claude-remote/
├── bridge/                     # Python package
│   ├── __init__.py            # ConvexBridge slim (~150 lines)
│   └── terminal.py            # TerminalBridge class (~400 lines)
├── convex/                     # Convex backend (npx convex deploy)
│   ├── schema.ts              # 3 tables: terminalSessions, agents, activities
│   ├── terminalSessions.ts    # upsert, get, sendInput, listSessions, register, disconnect
│   ├── agents.ts              # list (for frontend to resolve ipAddress)
│   └── activities.ts          # create (event log)
├── dashboard/                  # Next.js minimal app
│   ├── app/
│   │   ├── layout.tsx         # ConvexProvider wrapper
│   │   └── page.tsx           # Single page: terminal list + panel
│   ├── components/
│   │   ├── TerminalPanel.tsx  # Terminal output + input + TUI nav keys
│   │   └── TerminalBoard.tsx  # Multi-terminal split layout
│   ├── package.json
│   └── next.config.ts
├── pyproject.toml             # Python deps: convex>=0.7
├── run-bridge.py              # CLI entry point
└── README.md
```

## Components

### ConvexBridge (slim)

Extracted from `nanobot/mc/bridge.py`. Only the generic Convex wrapper:

- `query(function_name, args)` — call Convex query with snake→camel conversion
- `mutation(function_name, args)` — call Convex mutation with retry + exponential backoff
- Key conversion helpers (`_to_camel_case`, `_to_snake_case`, recursive converters)
- `_write_error_activity()` — best-effort error logging after retry exhaustion
- `close()` — clean disconnect

**Removed**: All MC-specific methods (tasks, steps, messages, boards, chats, agents, files) — ~800 lines cut.

### TerminalBridge

Extracted from `terminal_bridge.py` with minimal changes:

- Import path changes from `nanobot.mc.bridge` to `bridge`
- Remove hardcoded default Convex URL (require env var or CLI arg)
- Keep all functionality: tmux management, polling loops, graceful shutdown, `!!keys:` protocol

### Convex Backend (3 tables)

| Table | Fields | Purpose |
|-------|--------|---------|
| `terminalSessions` | sessionId, output, pendingInput, status, agentName, updatedAt | Terminal session state |
| `agents` | name, displayName, role, status, variables, deletedAt, skills, ... | Remote agent registry |
| `activities` | eventType, description, timestamp, agentName | Event log (connect/disconnect/error) |

**Functions:**

| Function | Type | Called by |
|----------|------|----------|
| `terminalSessions:upsert` | mutation | Bridge (output writes) |
| `terminalSessions:get` | query | Bridge (input poll, 300ms) |
| `terminalSessions:sendInput` | mutation | Dashboard (user input) |
| `terminalSessions:listSessions` | query | Dashboard (sidebar) |
| `terminalSessions:registerTerminal` | mutation | Bridge (startup) |
| `terminalSessions:disconnectTerminal` | mutation | Bridge (shutdown) |
| `agents:list` | query | Dashboard (resolve ipAddress) |
| `activities:create` | mutation | Bridge (error fallback) |

### Dashboard (minimal)

Extracted components:
- **TerminalPanel** — terminal output display, input bar, TUI navigation buttons
- **TerminalBoard** — multi-terminal split layout with close buttons

New components (simplified from nanobot):
- **TerminalSidebar** — lists connected remote agents, click to open terminal
- **Single page** — no routing, no tasks, no boards

## Dependencies

### Python
```toml
[project]
dependencies = ["convex>=0.7.0,<1.0.0"]
```

### Dashboard
```json
{
  "dependencies": {
    "convex": "^1.x",
    "next": "^15.x",
    "react": "^19.x"
  }
}
```

## What's NOT included

- Task management (orchestrator, executor, planner, step dispatcher)
- Agent runtime (AgentLoop, process manager)
- LLM integration (litellm, provider factory)
- Chat system
- Cron service
- Telegram/Slack/DingTalk delivery
- Board management
- Skills system
- Plan negotiation

## User Flow

```bash
# 1. Clone the repo
git clone https://github.com/user/claude-remote
cd claude-remote

# 2. Deploy Convex backend
npx convex deploy

# 3. Install Python bridge (on remote machine)
pip install .  # or: uv pip install .

# 4. Run bridge on remote machine
CONVEX_URL="https://your-project.convex.cloud" \
CONVEX_ADMIN_KEY="your-admin-key" \
python run-bridge.py --display-name "My Server"

# 5. Run dashboard locally
cd dashboard && npm install && npm run dev

# 6. Open http://localhost:3000 — interact with remote Claude Code
```
