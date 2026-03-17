# claude-remote Extraction — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract the terminal bridge functionality from nanobot into a standalone repo (`claude-remote`) that lets developers control remote Claude Code sessions from their browser.

**Architecture:** Python bridge (tmux ↔ Convex) + Convex backend (3 tables) + minimal Next.js dashboard. The bridge runs on the remote machine, Convex is the serverless hub, and the dashboard runs locally.

**Tech Stack:** Python 3.11+ (convex SDK), Convex (TypeScript), Next.js 15, React 19, Tailwind CSS

**Source repo:** `/Users/ennio/Documents/nanobot-ennio` (read-only reference)
**Target repo:** Create new directory at `/Users/ennio/Documents/claude-remote`

---

### Task 1: Initialize repo structure

**Files:**
- Create: `claude-remote/` (root)
- Create: `claude-remote/bridge/__init__.py`
- Create: `claude-remote/bridge/terminal.py`
- Create: `claude-remote/pyproject.toml`
- Create: `claude-remote/run-bridge.py`
- Create: `claude-remote/.gitignore`

**Step 1: Create directory structure**

```bash
mkdir -p /Users/ennio/Documents/claude-remote/bridge
```

**Step 2: Create `.gitignore`**

Create `claude-remote/.gitignore`:
```
__pycache__/
*.pyc
.venv/
dist/
*.egg-info/
node_modules/
.next/
.env
.env.local
```

**Step 3: Create `pyproject.toml`**

Create `claude-remote/pyproject.toml`:
```toml
[project]
name = "claude-remote"
version = "0.1.0"
description = "Remote Claude Code terminal bridge via Convex"
requires-python = ">=3.11"
license = {text = "MIT"}
dependencies = [
    "convex>=0.7.0,<1.0.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=9.0.0,<10.0.0",
    "pytest-timeout>=2.3.0,<3.0.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["bridge"]
```

**Step 4: Create `bridge/__init__.py` — ConvexBridge slim**

Extract from `/Users/ennio/Documents/nanobot-ennio/nanobot/mc/bridge.py` lines 1-171 only (the generic wrapper).

Keep:
- `_to_camel_case`, `_to_snake_case`, `_convert_keys_to_camel`, `_convert_keys_to_snake`
- `ConvexBridge.__init__`, `query`, `mutation`, `_mutation_with_retry`
- `_write_error_activity`
- `close`
- Constants: `MAX_RETRIES`, `BACKOFF_BASE_SECONDS`

Remove everything after line 171 (all the MC-specific methods: `update_task_status`, `update_agent_status`, `create_activity`, `create_task_directory`, `get_task_messages`, `send_message`, `post_step_completion`, `post_lead_agent_message`, `update_execution_plan`, `create_step`, `batch_create_steps`, `kick_off_task`, `approve_and_kick_off`, `post_system_error`, `update_step_status`, `get_steps_by_task`, `check_and_unblock_dependents`, `sync_agent`, `list_agents`, `get_agent_by_name`, `list_deleted_agents`, `archive_agent_data`, `get_agent_archive`, `clear_agent_archive`, `deactivate_agents_except`, `subscribe`, `async_subscribe`, `write_agent_config`, `sync_task_output_files`, `sync_output_files_to_parent`, `get_board_by_id`, `ensure_default_board`, `get_pending_chat_messages`, `send_chat_response`, `mark_chat_processing`, `mark_chat_done`).

**Step 5: Create `bridge/terminal.py` — TerminalBridge**

Copy from `/Users/ennio/Documents/nanobot-ennio/terminal_bridge.py` with these changes:
- Remove lines 31-33 (ROOT / sys.path hack)
- Change line 35 from `from nanobot.mc.bridge import ConvexBridge` to `from bridge import ConvexBridge`
- Remove line 38 (`_DEFAULT_CONVEX_URL = "https://affable-clownfish-908.convex.cloud"`) — no hardcoded URLs
- In `parse_args()`, change `--convex-url` default to just `os.environ.get("CONVEX_URL")` (no fallback)
- Keep everything else identical

**Step 6: Create `run-bridge.py` — CLI entry point**

Create `claude-remote/run-bridge.py`:
```python
#!/usr/bin/env python3
"""CLI entry point for the Claude Remote terminal bridge."""
from bridge.terminal import TerminalBridge, parse_args

if __name__ == "__main__":
    args = parse_args()
    if not args.convex_url:
        print("Error: --convex-url or CONVEX_URL env var is required.")
        raise SystemExit(1)
    tb = TerminalBridge(
        session_id=args.session_id,
        display_name=args.display_name,
        convex_url=args.convex_url,
        admin_key=args.admin_key,
        tmux_session=args.tmux_session,
    )
    tb.run()
```

**Step 7: Initialize git and commit**

```bash
cd /Users/ennio/Documents/claude-remote
git init
git add .
git commit -m "feat: initial Python bridge extraction from nanobot"
```

---

### Task 2: Convex backend — schema + terminalSessions

**Files:**
- Create: `claude-remote/convex/schema.ts`
- Create: `claude-remote/convex/terminalSessions.ts`
- Create: `claude-remote/convex/tsconfig.json`
- Create: `claude-remote/convex/package.json` (Convex project root)

**Step 1: Create Convex directory**

```bash
mkdir -p /Users/ennio/Documents/claude-remote/convex
```

**Step 2: Create `convex/package.json`**

This is the root package.json for the Convex project (NOT the dashboard):
```json
{
  "name": "claude-remote-convex",
  "private": true,
  "dependencies": {
    "convex": "^1.31.6"
  }
}
```

**Step 3: Create `convex/tsconfig.json`**

Copy from `/Users/ennio/Documents/nanobot-ennio/dashboard/convex/tsconfig.json` as-is.

**Step 4: Create `convex/schema.ts` — 3 tables only**

Extract from `/Users/ennio/Documents/nanobot-ennio/dashboard/convex/schema.ts`. Keep only:
- `terminalSessions` table (with both indexes)
- `agents` table (with both indexes)
- `activities` table (with both indexes)

Remove: `boards`, `tasks`, `steps`, `messages`, `skills`, `taskTags`, `chats`, `tagAttributes`, `tagAttributeValues`, `settings`.

For `activities.eventType`, trim to only the event types used by terminal bridge:
- `agent_connected`, `agent_disconnected`, `system_error`

For `agents`, keep full schema (it's used by registerTerminal).

**Step 5: Create `convex/terminalSessions.ts`**

Copy verbatim from `/Users/ennio/Documents/nanobot-ennio/dashboard/convex/terminalSessions.ts` — all 6 functions:
- `upsert` (mutation)
- `get` (query)
- `sendInput` (mutation)
- `listSessions` (query)
- `registerTerminal` (mutation)
- `disconnectTerminal` (mutation)

No changes needed — these have zero dependencies on tasks/boards/etc.

**Step 6: Commit**

```bash
git add convex/
git commit -m "feat: Convex backend — schema + terminalSessions"
```

---

### Task 3: Convex backend — agents + activities

**Files:**
- Create: `claude-remote/convex/agents.ts`
- Create: `claude-remote/convex/activities.ts`

**Step 1: Create `convex/agents.ts` — minimal subset**

From `/Users/ennio/Documents/nanobot-ennio/dashboard/convex/agents.ts`, extract only:
- `list` (query) — needed by dashboard to resolve ipAddress from agent variables

That's all. The agent upsert/delete is handled atomically inside `terminalSessions:registerTerminal` and `terminalSessions:disconnectTerminal`.

**Step 2: Create `convex/activities.ts` — minimal subset**

From `/Users/ennio/Documents/nanobot-ennio/dashboard/convex/activities.ts`, extract:
- `create` (mutation) — trim `eventType` union to only: `agent_connected`, `agent_disconnected`, `system_error`
- `listRecent` (query) — useful for dashboard activity feed

Remove: `list`, `clearAll` (not needed).

**Step 3: Commit**

```bash
git add convex/
git commit -m "feat: Convex backend — agents list + activities create"
```

---

### Task 4: Dashboard — project scaffold

**Files:**
- Create: `claude-remote/dashboard/package.json`
- Create: `claude-remote/dashboard/tsconfig.json`
- Create: `claude-remote/dashboard/next.config.ts`
- Create: `claude-remote/dashboard/tailwind.config.ts`
- Create: `claude-remote/dashboard/postcss.config.mjs`
- Create: `claude-remote/dashboard/app/layout.tsx`
- Create: `claude-remote/dashboard/app/globals.css`
- Create: `claude-remote/dashboard/components/ConvexClientProvider.tsx`

**Step 1: Create dashboard directory structure**

```bash
mkdir -p /Users/ennio/Documents/claude-remote/dashboard/{app,components,lib}
```

**Step 2: Create `dashboard/package.json`**

Minimal dependencies — only what the terminal UI needs:
```json
{
  "name": "claude-remote-dashboard",
  "private": true,
  "scripts": {
    "dev": "npm-run-all2 --parallel dev:frontend dev:backend",
    "dev:frontend": "next dev",
    "dev:backend": "npx convex dev --once",
    "build": "next build"
  },
  "dependencies": {
    "convex": "^1.31.6",
    "lucide-react": "^0.544.0",
    "next": "^16.1.5",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.6.0",
    "npm-run-all2": "^5.0.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "postcss": "^8",
    "tailwindcss": "^3.4.1",
    "typescript": "^5"
  }
}
```

**Step 3: Create standard Next.js config files**

- `tsconfig.json` — standard Next.js 15 config with `@/` path alias
- `next.config.ts` — minimal, just `export default {}`
- `tailwind.config.ts` — scan `app/` and `components/` for classes
- `postcss.config.mjs` — standard tailwind + autoprefixer
- `app/globals.css` — tailwind directives + dark terminal-like defaults

**Step 4: Create `components/ConvexClientProvider.tsx`**

Read `/Users/ennio/Documents/nanobot-ennio/dashboard/components/ConvexClientProvider.tsx` as reference. Create a simplified version:
```tsx
"use client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
```

**Step 5: Create `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";
import ConvexClientProvider from "@/components/ConvexClientProvider";

export const metadata: Metadata = {
  title: "Claude Remote",
  description: "Remote Claude Code terminal dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 antialiased">
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
```

**Step 6: Commit**

```bash
git add dashboard/
git commit -m "feat: dashboard scaffold — Next.js + Convex + Tailwind"
```

---

### Task 5: Dashboard — TerminalPanel + TerminalBoard components

**Files:**
- Create: `claude-remote/dashboard/components/TerminalPanel.tsx`
- Create: `claude-remote/dashboard/components/TerminalBoard.tsx`

**Step 1: Create `components/TerminalPanel.tsx`**

Copy from `/Users/ennio/Documents/nanobot-ennio/dashboard/components/TerminalPanel.tsx` with these changes:
- Import path: `api` from `"../convex/_generated/api"` → `"@/convex/_generated/api"` (depends on Next.js path setup — may need to use relative path if Convex is at project root)
- Otherwise identical — it's already self-contained with zero task/board dependencies

Note: The `convex/_generated` folder won't exist until `npx convex dev` runs. The dashboard `convex/` symlinks or copies from the root `convex/` folder. The simplest approach: the dashboard itself IS the Convex project (put `convex/` inside `dashboard/`), OR use the root `convex/` and configure the dashboard's `convex.json` to point to it.

**Decision for plan:** Put `convex/` inside `dashboard/` (standard Convex + Next.js layout). Remove the separate root `convex/` from Task 2-3 and instead create it under `dashboard/convex/`.

**UPDATE: Revised structure:**
```
claude-remote/
├── bridge/                     # Python package
├── dashboard/                  # Next.js + Convex (all-in-one)
│   ├── convex/                # Convex functions + schema
│   │   ├── schema.ts
│   │   ├── terminalSessions.ts
│   │   ├── agents.ts
│   │   └── activities.ts
│   ├── app/
│   ├── components/
│   └── package.json
├── pyproject.toml
├── run-bridge.py
└── README.md
```

This follows the standard Convex + Next.js pattern where `npx convex dev` runs from within `dashboard/`.

**Step 2: Create `components/TerminalBoard.tsx`**

Copy from `/Users/ennio/Documents/nanobot-ennio/dashboard/components/TerminalBoard.tsx` with changes:
- Remove `useBoard()` dependency — simplify to receive `openTerminals` and `onClose` as props (we'll create a simpler state management in the page)
- Remove `lucide-react` X icon → use plain `×` character or inline SVG to minimize dependencies (actually lucide-react is already in deps, so keep it)
- Adjust import paths

**Step 3: Commit**

```bash
git add dashboard/components/
git commit -m "feat: TerminalPanel + TerminalBoard components"
```

---

### Task 6: Dashboard — main page with sidebar + terminal state

**Files:**
- Create: `claude-remote/dashboard/app/page.tsx`

**Step 1: Create `app/page.tsx` — single page app**

This page replaces the entire nanobot dashboard with a single focused view:

1. **Left sidebar** (~250px): Lists connected remote agents from `agents:list` filtered by `role === "remote-terminal"`. Each agent shows displayName, IP, and status dot. Click to toggle terminal open/close.

2. **Main area**: Shows `TerminalBoard` with open terminals.

3. **State management**: Use `useState` for `openTerminals: {sessionId, agentName}[]` directly in the page — no need for a context provider with only one page.

The page queries:
- `api.agents.list` — to show remote agents in sidebar
- `api.terminalSessions.listSessions` with `agentName` filter — to get session IDs per agent

When user clicks an agent:
- Query its sessions
- Toggle the first session in/out of `openTerminals`
- Cap at 4 open terminals

**Step 2: Commit**

```bash
git add dashboard/app/
git commit -m "feat: main page — terminal sidebar + board"
```

---

### Task 7: Move Convex files inside dashboard

This consolidates Tasks 2-3 into the revised structure.

**Files:**
- Move: `claude-remote/convex/*` → `claude-remote/dashboard/convex/`
- Update: `claude-remote/dashboard/package.json` to include Convex dev scripts

**Step 1: Move Convex files**

```bash
mv /Users/ennio/Documents/claude-remote/convex/* /Users/ennio/Documents/claude-remote/dashboard/convex/
rmdir /Users/ennio/Documents/claude-remote/convex
```

Wait — better approach: **Create the Convex files directly under `dashboard/convex/` in Tasks 2-3** instead of moving them later. Reorder the tasks accordingly.

**REVISED TASK ORDER:**
- Task 1: Python bridge + repo init
- Task 2: Dashboard scaffold (includes `dashboard/convex/` directory)
- Task 3: Convex schema + terminalSessions + agents + activities (all under `dashboard/convex/`)
- Task 4: TerminalPanel + TerminalBoard components
- Task 5: Main page with sidebar + terminal state
- Task 6: README.md
- Task 7: Final verification

**Step 2: Commit**

```bash
git add .
git commit -m "chore: consolidate Convex under dashboard/"
```

---

### Task 6 (revised): README.md

**Files:**
- Create: `claude-remote/README.md`

**Step 1: Write README**

Structure:
```markdown
# Claude Remote

Control Claude Code running on remote machines from your browser.

## How it works

[Architecture diagram: Dashboard ↔ Convex ↔ Bridge ↔ tmux/Claude]

The bridge runs on your remote machine alongside Claude Code in a tmux session.
It streams the terminal output to Convex in real-time and polls for input you
send from the dashboard. Everything happens via Convex — no port forwarding,
no SSH tunnels, no VPN needed.

## Prerequisites

- **Remote machine**: Python 3.11+, tmux, Claude Code CLI installed
- **Local machine**: Node.js 18+
- **Convex account**: Free at convex.dev

## Quick Start

### 1. Clone and deploy backend

git clone ...
cd claude-remote/dashboard
npm install
npx convex deploy

Save the deployment URL (CONVEX_URL) and generate an admin key from the Convex dashboard.

### 2. Set up the bridge (remote machine)

pip install .  # from repo root, or: uv pip install .

CONVEX_URL="https://your-project.convex.cloud" \
CONVEX_ADMIN_KEY="your-admin-key" \
python run-bridge.py --display-name "My Server"

### 3. Open the dashboard (local machine)

cd dashboard
echo 'NEXT_PUBLIC_CONVEX_URL=https://your-project.convex.cloud' > .env.local
npm run dev

Open http://localhost:3000 — click your remote agent in the sidebar to open the terminal.

## CLI Options

| Flag | Default | Description |
|------|---------|-------------|
| --session-id | auto (UUID4) | Unique session identifier |
| --display-name | "Remoto" | Human-readable name shown in dashboard |
| --convex-url | $CONVEX_URL | Convex deployment URL |
| --admin-key | $CONVEX_ADMIN_KEY | Convex admin key |
| --tmux-session | "claude-terminal" | tmux session name |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| CONVEX_URL | Yes | Convex deployment URL |
| CONVEX_ADMIN_KEY | Yes | Server-side admin key (bridge only) |
| NEXT_PUBLIC_CONVEX_URL | Yes | Client-side Convex URL (dashboard only) |

## Multiple bridges

You can run multiple bridges on different machines pointing to the same Convex project.
Each bridge creates its own agent and terminal session. The dashboard shows all connected
terminals in the sidebar — click any to open.

## How it works (technical)

### Bridge (Python)
- Creates a tmux session and starts Claude Code inside it
- Two polling loops (300ms each):
  - **Input poll**: checks Convex for `pendingInput`, injects into tmux via `send-keys`
  - **Screen monitor**: captures tmux pane, pushes changes to Convex
- Supports `!!keys:` protocol for TUI navigation (Up/Down/Enter/Tab/Esc)
- Graceful shutdown: Ctrl+C kills tmux, notifies Convex, exits

### Convex (Backend)
- 3 tables: `terminalSessions`, `agents`, `activities`
- Real-time: dashboard subscribes to queries, updates instantly
- `registerTerminal` atomically creates agent + session + activity event
- `disconnectTerminal` soft-deletes agent + hard-deletes sessions

### Dashboard (Next.js)
- Single-page app with terminal sidebar and split terminal view
- TUI navigation buttons for Claude Code's interactive prompts
- Status indicators: idle (green), processing (amber pulse), error (red)
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with quickstart, CLI options, architecture"
```

---

### Task 7 (revised): Final verification

**Step 1: Verify Python bridge imports work**

```bash
cd /Users/ennio/Documents/claude-remote
python -c "from bridge import ConvexBridge; print('OK')"
```

Expected: `OK` (will fail if convex package not installed, but import structure is correct)

**Step 2: Verify dashboard builds**

```bash
cd /Users/ennio/Documents/claude-remote/dashboard
npm install
npx convex codegen  # generates _generated/ types
npm run build
```

**Step 3: Verify all files are committed**

```bash
cd /Users/ennio/Documents/claude-remote
git status  # should be clean
git log --oneline  # should show all commits
```

**Step 4: Final commit if needed**

```bash
git add .
git commit -m "chore: final cleanup"
```
