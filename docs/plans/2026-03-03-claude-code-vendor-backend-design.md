# Claude Code Vendor Backend Design

## Date: 2026-03-03
## Status: Approved

## Problem

Add Claude Code as an alternative agent backend alongside nanobot's existing AgentLoop. Agents should be able to run on either backend, with shared memory, skills, and communication infrastructure.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Integration model | Hybrid Backend | Nanobot + CC side by side, MC orchestrates both |
| Execution mode | CLI headless (`claude -p`) | Supports OAuth login natively (no SDK OAuth ban) |
| Backend selection | `backend` field in agent config.yaml | Explicit, no magic |
| User questions | MCP Server bridge | Custom MCP with `ask_user` tool routed through MessageBus |
| Memory | CC auto-memory, `--cwd` = nanobot workspace | CC native memory, configurable workspace path |
| Skills | Map nanobot SKILL.md → `.claude/skills/` | Symlink/copy, nearly identical format |
| Orchestration | Provider abstraction | `ClaudeCodeProvider` in MC |
| Agent loop | CC manages loop internally | Full agentic loop, MC receives final result |
| MCP tools | Communication + MC | ask_user, send_message, delegate_task, ask_agent, report_progress |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              Mission Control (MC)                     │
│         orchestrator / executor / gateway             │
│                                                       │
│  agent config.yaml:                                   │
│    backend: nanobot | claude-code                     │
├───────────────┬───────────────────────────────────────┤
│   Nanobot     │      Claude Code Backend              │
│   AgentLoop   │                                       │
│   (LiteLLM)   │  ClaudeCodeProvider                   │
│               │  spawns: claude -p                     │
│   existing    │  --output-format stream-json           │
│   agents      │  --resume <session-id>                │
│               │  --cwd <agent-workspace>              │
│               │  --mcp-config <generated.json>        │
├───────────────┴───────────────────────────────────────┤
│              MCP Server Bridge (stdio)                 │
│  ask_user | send_message | delegate_task              │
│  ask_agent | report_progress                          │
├───────────────────────────────────────────────────────┤
│              Shared Infrastructure                     │
│  Workspaces: ~/.nanobot/agents/{name}/                │
│  Skills: nanobot→CC symlinks                          │
│  Config: ~/.nanobot/config.json                       │
│  Sessions: CC-native, session_id in Convex            │
└───────────────────────────────────────────────────────┘
```

## Components

### 1. ClaudeCodeProvider (`mc/providers/claude_code.py`)

Spawns Claude Code CLI as agentic subprocess. Receives task, manages lifecycle, returns result.

```python
class ClaudeCodeProvider:
    async def execute_task(prompt, agent_config, session_id=None, on_stream=None) -> TaskResult
    async def resume_session(session_id, prompt) -> TaskResult
```

Returns: `TaskResult(output, session_id, cost_usd, usage, is_error)`

### 2. MCP Server Bridge (`mc/mcp_bridge.py`)

stdio MCP server that Claude Code connects to. Communicates with MC via unix socket.

Tools: `ask_user`, `send_message`, `delegate_task`, `ask_agent`, `report_progress`

IPC: `MC Process ←── unix socket ──→ MCP Bridge ←── stdio ──→ claude CLI`

### 3. Workspace Manager (`mc/cc_workspace.py`)

Prepares workspace before spawning CC:
- Generate CLAUDE.md from agent config
- Symlink nanobot skills → `.claude/skills/`
- Generate `.mcp.json` with bridge config
- Return WorkspaceContext

### 4. Agent Config Extension

```yaml
backend: claude-code
claude_code:
  max_budget_usd: 5.0
  max_turns: 50
  permission_mode: acceptEdits
  allowed_tools: [Read, Glob, Grep, Bash]
  disallowed_tools: [Write]
```

### 5. Global Config Extension

```json
{
  "claude_code": {
    "cli_path": "claude",
    "default_model": "claude-sonnet-4-6",
    "default_max_budget_usd": 5.0,
    "auth_method": "oauth"
  }
}
```

## Execution Flow

1. MC Executor receives task → reads agent config → `backend: claude-code`
2. CCWorkspaceManager.prepare() → CLAUDE.md, .mcp.json, skills symlinks
3. MC starts MCP bridge server (unix socket)
4. ClaudeCodeProvider.execute_task() → spawns `claude -p`
5. CC connects to MCP bridge, works autonomously
6. Stream parsed → progress relayed to Convex
7. Result → TaskResult → task marked done
8. Session ID stored for resume

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| OAuth token refresh bugs in headless | Support both OAuth and API key auth; `apiKeyHelper` as fallback |
| AskUserQuestion silently fails in headless | MCP bridge `ask_user` tool; CLAUDE.md instructs agent to use it |
| Session JSONL duplicate entries bug | Deduplicate by message ID on read |
| CC context window (200K) different from nanobot | CC manages its own compaction; no intervention needed |
| MCP bridge IPC complexity | Unix socket is battle-tested; fallback to HTTP localhost |

## Stories (Implementation Order)

1. **ClaudeCodeProvider** — core provider with CLI spawning and stream parsing
2. **MCP Server Bridge** — stdio MCP server with IPC to MC
3. **Workspace Manager** — workspace preparation (CLAUDE.md, skills, mcp.json)
4. **Agent Config Extension** — `backend` field and CC-specific options
5. **Executor Integration** — wire provider into MC executor flow
6. **Session Management** — persist/resume CC sessions via Convex
