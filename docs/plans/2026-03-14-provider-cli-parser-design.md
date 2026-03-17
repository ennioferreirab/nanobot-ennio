# Provider CLI Parser Design

## Decision Status

Approved on 2026-03-14.

This design supersedes the remote-TUI direction documented in
`docs/plans/2026-03-12-interactive-agent-tui-design.md`.

## Goal

Replace the remote TUI stack with a process-supervised, provider-aware live session model that streams CLI output into the web UI, supports human interruption and resume, and removes the legacy PTY/xterm/websocket TUI surface from Mission Control.

## Problem

The current remote TUI implementation depends on PTY attachment, websocket transport, xterm rendering, reconnect handling, and provider-specific terminal behavior. In practice this creates instability around attach/detach, redraw, copy/paste, keyboard semantics, and browser-driven reconnection. We want to keep human intervention and live visibility, but stop treating the browser as a terminal emulator.

## Design Summary

Mission Control becomes the owner of the provider CLI process and its live output stream. Instead of exposing a PTY-backed remote terminal, the backend launches provider CLIs directly, records `pid` and `pgid`, discovers provider-native session identifiers when available, watches process output in real time, and projects that output into a unified `Live Chat` UI.

Human intervention moves from terminal takeover to session control:

- interrupt the current iteration
- keep the session alive when possible
- send the next human message in resume mode
- stop the session explicitly

The provider-specific differences live behind a new abstraction: `ProviderCLIParser`.

## Source of Truth

The source of truth for live share and human intervention is the Mission
Control-owned process/session record, not a browser terminal session.

Primary ownership:

- `ProviderProcessSupervisor` owns the launched process, `pid`, `pgid`, child
  processes, liveness, and signal delivery
- `ProviderSessionRegistry` owns the current session state, discovered provider
  session id, and intervention status
- `LiveStreamProjector` owns the normalized stream consumed by the web UI

Secondary enrichment:

- provider hooks, transcript files, JSONL session files, or MCP events can
  enrich the stream or help discover provider-native session ids
- those secondary sources must not become the authoritative transport for live
  chat state

This lets chat live share and step live share consume one consistent stream
without depending on xterm, PTY attach state, or browser reconnect semantics.

## Architecture

### 1. ProviderProcessSupervisor

This runtime component owns the actual CLI process lifecycle.

Responsibilities:

- launch the provider CLI process
- record `pid`, `pgid`, command, cwd, and timestamps
- track child processes and subprocess trees
- expose `interrupt`, `terminate`, and liveness checks
- stream `stdout` and `stderr` into the parser pipeline

This becomes the source of truth for process ownership instead of PTY attachment.

### 2. ProviderCLIParser

This is the provider abstraction layer.

Responsibilities:

- discover provider-native session identifiers from output, files, or structured events
- parse raw output into normalized live events
- implement provider-specific `resume`, `interrupt`, and `stop`
- expose whether the provider is `provider-native` or `runtime-owned`

The contract must support both:

- providers with native resumable sessions like Claude Code and Codex
- providers with internal runtime continuity like Nanobot

### 3. ProviderSessionRegistry

This becomes the canonical registry for live provider sessions.

Required fields:

- `mc_session_id`
- `provider`
- `provider_session_id`
- `task_id`
- `step_id`
- `agent_name`
- `pid`
- `pgid`
- `child_pids`
- `mode`
- `status`
- `supports_resume`
- `supports_interrupt`
- `last_output_at`
- `last_input_at`

### 4. LiveStreamProjector

This projects normalized events into a single stream consumed by the dashboard.

Example event kinds:

- `output`
- `session_discovered`
- `turn_started`
- `turn_completed`
- `subagent_spawned`
- `approval_requested`
- `error`

This stream powers both:

- chat live share
- step live share

### 5. HumanInterventionController

This coordinates the intervention lifecycle.

State transitions:

- `running -> interrupting -> human_intervening -> resuming -> running`

Core operations:

- interrupt current provider iteration
- allow the human to send a message
- route the next message through provider-specific resume logic
- stop the session if requested

## Provider Contract

The new abstraction should look like this conceptually:

```python
@dataclass
class ProviderProcessHandle:
    mc_session_id: str
    provider: str
    pid: int
    pgid: int | None
    cwd: str
    command: list[str]
    started_at: str


@dataclass
class ProviderSessionSnapshot:
    mc_session_id: str
    provider_session_id: str | None
    mode: Literal["provider-native", "runtime-owned"]
    supports_resume: bool
    supports_interrupt: bool
    supports_stop: bool


@dataclass
class ParsedCliEvent:
    kind: str
    text: str | None = None
    provider_session_id: str | None = None
    pid: int | None = None
    metadata: dict[str, Any] | None = None
```

And the protocol:

```python
class ProviderCLIParser(Protocol):
    provider_name: str

    async def start_session(...) -> ProviderProcessHandle: ...
    def parse_output(self, chunk: bytes) -> list[ParsedCliEvent]: ...
    async def discover_session(self, handle: ProviderProcessHandle) -> ProviderSessionSnapshot: ...
    async def inspect_process_tree(self, handle: ProviderProcessHandle) -> dict[str, Any]: ...
    async def interrupt(self, handle: ProviderProcessHandle) -> None: ...
    async def resume(self, handle: ProviderProcessHandle, message: str) -> None: ...
    async def stop(self, handle: ProviderProcessHandle) -> None: ...
```

## Provider Mapping

### Claude Code

- mode: `provider-native`
- discover provider session from structured output and existing hook/MCP signals
- `resume` uses provider-native resume semantics
- `interrupt` likely uses process signaling plus provider-aware recovery
- existing hook bridge remains useful as an enrichment channel, not as the primary UI transport

### Codex

- mode: `provider-native`
- discover session from CLI output and provider metadata
- `resume` uses provider-native session semantics
- `interrupt` is provider-specific and may mix signal-based and provider-aware logic

### Nanobot

- mode: `runtime-owned`
- no native external `--resume <session_id>` flow in the current interactive adapter
- continuity is based on internal `session_key` and loop ownership
- subagent tracking already exists by session and should feed the generic process/session registry

## Live UX

The browser no longer renders a terminal emulator.

The UI becomes:

- a `Live Chat` stream showing provider output in real time
- controls for `Interrupt`, `Resume`, and `Stop`
- session metadata such as provider, session state, and agent identity

The same component should power:

- the chat panel for interactive agents
- the step live share surface in task details

## Migration Plan

### Phase 1: Build the new session core

- add `ProviderProcessSupervisor`
- add `ProviderCLIParser` protocol and shared types
- add `ProviderSessionRegistry`
- add `LiveStreamProjector`

### Phase 2: Integrate providers

- implement `ClaudeCodeCLIParser`
- implement `CodexCLIParser`
- implement `NanobotCLIParser` in runtime-owned mode

### Phase 3: Move the UI

- build a unified `Live Chat` surface
- route interactive chat and step live share to the new stream
- migrate human intervention controls to `interrupt/resume/stop`

### Phase 4: Retire remote TUI

- hide TUI tabs and terminal panels behind a feature flag
- remove PTY/websocket/xterm codepaths once no longer referenced
- delete TUI-specific tests, hooks, and runtime modules

## TUI Retirement Inventory

The migration is not done until the old TUI-specific interface and runtime
pieces are removed or clearly marked as transitional. The cleanup pass should
audit and delete or collapse the following areas once the new live chat path is
fully wired:

- `dashboard/features/interactive/components/InteractiveTerminalPanel.tsx`
- `dashboard/features/interactive/components/InteractiveTerminalPanel.test.tsx`
- `dashboard/features/interactive/components/InteractiveChatTabs.tsx` TUI-only
  affordances
- `dashboard/features/interactive/hooks/useTaskInteractiveSession.ts` if it
  only exists to drive remote terminal attach
- `dashboard/convex/interactiveSessions.ts` if the new registry replaces it
- `mc/runtime/interactive_transport.py`
- `mc/runtime/interactive.py` websocket/attach-token transport branches that
  only support the remote TUI
- PTY/tmux-specific runtime wiring that no longer serves any non-TUI workflow

If any of these remain temporarily for rollout safety, they should be guarded
behind an explicit migration flag and scheduled for follow-up deletion rather
than left as a silent parallel path.

## Files Likely Affected

New backend areas:

- `mc/contexts/provider_cli/`
- `mc/runtime/provider_cli/`

Likely touched existing backend files:

- `mc/contexts/interactive/registry.py`
- `mc/contexts/interactive/supervisor.py`
- `mc/application/execution/strategies/interactive.py`
- `mc/runtime/gateway.py`

Likely touched dashboard files:

- `dashboard/features/interactive/components/InteractiveChatTabs.tsx`
- `dashboard/features/interactive/components/InteractiveTerminalPanel.tsx`
- `dashboard/features/tasks/components/TaskDetailSheet.tsx`

Expected removals:

- `mc/runtime/interactive_transport.py`
- websocket/PTy/TUI-specific runtime wiring once migration completes
- TUI-specific dashboard affordances and tests

## Risks

- `interrupt` behavior differs per provider and should be modeled as capability-driven
- some provider session discovery may require both stdout parsing and auxiliary metadata
- child process tracking may differ between direct subprocesses and provider-managed subagents
- migration must avoid leaving unused TUI codepaths behind

## Recommendation

Start with the generic session core plus a first complete adapter for Claude Code. Then add Codex, then adapt Nanobot to the runtime-owned contract. Keep the existing interactive supervision events where useful, but stop treating a browser terminal as the authoritative live surface.
