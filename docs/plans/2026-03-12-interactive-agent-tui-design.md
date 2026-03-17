# Interactive Agent TUI Design

> Superseded on 2026-03-14 by
> `docs/plans/2026-03-14-provider-cli-parser-design.md`.
> The approved direction is no longer a remote browser-rendered TUI. Mission
> Control now moves toward a process-supervised provider CLI stream with a
> unified live chat surface and explicit retirement of PTY/xterm/websocket TUI
> infrastructure.

## Goal

Add a provider-agnostic interactive TUI path to Mission Control that can host
the native Claude Code TUI first, then Codex and similar CLIs, without mixing
that path with the existing headless execution flow.

## Core Decisions

### 1. Headless and interactive are separate modes

The current Claude Code backend remains the headless path for task/step/chat
execution via `claude -p ... --output-format stream-json`.

The new interactive mode must not reuse that process contract, session storage,
or stream parser. Interactive mode launches the provider's native CLI inside a
real terminal session.

### 2. TUI fidelity requires a real terminal

The browser experience must be backed by a PTY plus reconnectable session
manager such as `tmux`. Convex can hold metadata, discovery, and presence, but
must not be the byte transport for terminal output/input.

### 3. The runtime should be provider-agnostic

Claude Code is the first adapter, not the special case baked into the runtime.
The runtime owns:

- session metadata
- PTY/tmux lifecycle
- bidirectional socket transport
- reconnect/cleanup rules

Provider adapters own:

- launch command
- environment
- workspace/bootstrap preparation
- capability declaration

### 4. The first user-facing surface is Chat

The first visible POC should add a `TUI` tab to the existing chat surface for
interactive-capable agents.

This does not mean Chat owns the runtime. It is only the first UI entry point.
The architecture should allow later reuse from task detail, board area, or a
dedicated workspace surface.

## Proposed Architecture

### Backend

- Create a new backend owner under `mc/contexts/interactive/` for interactive
  session behavior.
- Put PTY/tmux and socket transport helpers under
  `mc/infrastructure/interactive/`.
- Keep runtime wiring in `mc/runtime/` or a runtime-owned sidecar started by
  `nanobot mc start`.
- Store interactive session metadata separately from:
  - existing `cc_session:*` settings
  - existing `terminalSessions` docs used by the remote terminal bridge

### Frontend

- Add a new feature owner under `dashboard/features/interactive/` for web
  terminal rendering and session attach logic.
- Keep `dashboard/components/ChatPanel.tsx` as the shell that composes `Chat`
  and `TUI` tabs.
- Use a real terminal emulator component in the browser rather than rendering
  screen text in a `<pre>`.

### Session Model

Interactive sessions should track metadata only, for example:

- provider (`claude-code`, `codex`)
- agent name
- workspace/task/chat scope
- runtime session id
- tmux session name
- status
- capabilities
- last activity

The byte stream should travel over a socket channel owned by the MC runtime or
its sidecar.

## Non-Goals

- Replacing the existing headless Claude Code backend
- Replacing the existing remote terminal bridge
- Streaming terminal bytes through Convex polling
- Shipping multiple UI surfaces in the first POC
- Turning task execution into an interactive-only flow

## Story Breakdown

### Story 27.1

Build the interactive session runtime foundation: metadata, PTY/tmux, socket
transport, reconnect lifecycle, and architecture guardrails.

### Story 27.2

Add the Claude Code interactive adapter using the existing CC workspace and MCP
bootstrap, but keeping it fully separate from the headless provider.

### Story 27.3

Embed the first TUI surface as a `TUI` tab inside the chat panel.

### Story 27.4

Generalize the provider adapter contract and add a Codex interactive adapter on
top of the same runtime and web terminal shell.

### Story 27.5

Harden observability, security, reconnect behavior, and session reuse rules so
the feature can graduate from POC to a reusable platform capability.

## Success Metrics

### User-visible

- Native provider autocomplete, command menus, and interactive prompts work in
  the browser without MC-specific reimplementation.
- A user can refresh the browser and reattach to the same interactive session.
- The chat surface can switch between message history and live TUI for the same
  agent context.

### Technical

- Local keystroke-to-render latency p95 is at or below 150 ms.
- Session reattach after refresh completes in 2 seconds or less in local dev.
- Interactive sessions never reuse the headless `ClaudeCodeProvider` process
  contract.
- Adding Codex support does not require changes to the web terminal component
  or socket transport.

### Safety

- Existing headless task/step/chat flows keep their current behavior and tests.
- Terminal byte streaming does not go through Convex write loops.
- Unauthorized socket attach attempts fail cleanly.
