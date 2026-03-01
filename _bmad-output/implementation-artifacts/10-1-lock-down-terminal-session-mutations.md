# Story 10.1: Lock Down Terminal Session Mutations

Status: ready-for-dev

## Story

As the system operator,
I want terminal session backend-only mutations converted to `internalMutation` and the terminal bridge hardened to require `CONVEX_ADMIN_KEY`,
so that no unauthenticated client can inject commands into a live Claude Code tmux session via the Convex deployment URL.

## Acceptance Criteria

1. **AC 1:** Given the Convex deployment is updated, when an unauthenticated client calls `terminalSessions:upsert`, `terminalSessions:registerTerminal`, or `terminalSessions:disconnectTerminal` without admin auth, then the call fails with a permission error.

2. **AC 2:** Given the Convex deployment is updated, when the dashboard frontend calls `terminalSessions:sendInput`, `terminalSessions:get`, and `terminalSessions:listSessions`, then they succeed without admin auth (still public).

3. **AC 3:** Given `terminal_bridge.py` is started without `CONVEX_ADMIN_KEY`, then it exits immediately with a clear error message before attempting any Convex calls.

4. **AC 4:** Given `terminal_bridge.py` is started without `CONVEX_URL` and no `--convex-url` flag, then it exits immediately with a clear error message (no hardcoded fallback).

5. **AC 5:** Given `terminal_bridge.py` is started with both `CONVEX_URL` and `CONVEX_ADMIN_KEY`, then it connects and functions normally — registering, polling, and disconnecting terminal sessions.

6. **AC 10:** Given all changes are deployed, `npx convex dev` deploys without TypeScript or schema errors.

## Tasks / Subtasks

- [ ] Task 1: Convert terminal session backend-only mutations to `internalMutation` (AC: 1, 2)
  - [ ] 1.1 In `dashboard/convex/terminalSessions.ts`, add `internalMutation` to the import from `"./_generated/server"`
  - [ ] 1.2 Change `export const upsert = mutation({` → `export const upsert = internalMutation({` (line 5)
  - [ ] 1.3 Change `export const registerTerminal = mutation({` → `export const registerTerminal = internalMutation({` (line 113)
  - [ ] 1.4 Change `export const disconnectTerminal = mutation({` → `export const disconnectTerminal = internalMutation({` (line 188)
  - [ ] 1.5 Leave `sendInput` as `mutation` (line 56) — called from `TerminalPanel.tsx`
  - [ ] 1.6 Leave `get` as `query` (line 46) — called from `TerminalPanel.tsx`
  - [ ] 1.7 Leave `listSessions` as `query` (line 81) — called from `AgentSidebarItem.tsx`

- [ ] Task 2: Remove hardcoded Convex URL from `terminal_bridge.py` (AC: 4)
  - [ ] 2.1 Remove the `_DEFAULT_CONVEX_URL = "https://affable-clownfish-908.convex.cloud"` constant (line 38)
  - [ ] 2.2 Update `--convex-url` argument default to `default=os.environ.get("CONVEX_URL")` only (line 75)
  - [ ] 2.3 Add startup check: if `args.convex_url` is `None`, print error and `sys.exit(1)`: `"Error: Convex URL required. Set CONVEX_URL env var or pass --convex-url."`

- [ ] Task 3: Make `CONVEX_ADMIN_KEY` required in `terminal_bridge.py` (AC: 3)
  - [ ] 3.1 Add startup check after the Convex URL check: if `args.admin_key` is `None`, print error and `sys.exit(1)`: `"Error: CONVEX_ADMIN_KEY required. Set CONVEX_ADMIN_KEY env var or pass --admin-key."`

## Dev Notes

### Critical Context

This is **Phase 1 (Critical Priority)** of Convex Security Hardening. The most urgent fix — `terminalSessions:sendInput` stays public (dashboard needs it), but `upsert`, `registerTerminal`, and `disconnectTerminal` are ONLY called from the Python terminal bridge and MUST be locked down. Without this, anyone with the Convex deployment URL can call `registerTerminal` and inject commands into a live tmux session.

### Codebase Patterns

- **`mutation()` vs `internalMutation()`**: Both are exported from `"./_generated/server"`. Public `mutation()` is callable by any client. `internalMutation()` requires admin key auth via `ConvexClient.set_admin_auth()`. The function name format used by `ConvexClient.mutation("module:function", args)` is identical for both — the Python bridge doesn't need to change its call syntax.

- **Terminal bridge architecture**: `terminal_bridge.py` is a standalone Python script connecting a local tmux session to Convex. It creates its own `ConvexBridge` instances (line 120-121 — two instances for thread safety). It currently has:
  - `_DEFAULT_CONVEX_URL` hardcoded fallback (line 38) — REMOVE THIS
  - `--admin-key` optional argument (lines 79-82) — MAKE REQUIRED
  - `--convex-url` with hardcoded default (line 75) — CHANGE DEFAULT

- **ConvexBridge class**: `nanobot/mc/bridge.py:67-78` — `__init__` accepts optional `admin_key`. When present, calls `self._client.set_admin_auth(admin_key)`. The terminal bridge already passes admin_key through; we just need to enforce it's not None at startup.

### Files to Modify

| File | What Changes |
|------|-------------|
| `dashboard/convex/terminalSessions.ts` | Add `internalMutation` import; convert 3 functions from `mutation` → `internalMutation` |
| `terminal_bridge.py` | Remove hardcoded URL; add startup checks for URL and admin key |

### Files to NOT Modify

| File | Why |
|------|-----|
| `dashboard/components/TerminalPanel.tsx` | Calls `sendInput` and `get` which stay public |
| `dashboard/components/AgentSidebarItem.tsx` | Calls `listSessions` which stays public |
| `nanobot/mc/bridge.py` | No changes needed — admin_key handling already works |

### Testing

- `npx convex dev` — must deploy without TypeScript errors
- `uv run pytest tests/mc/ -v` — existing bridge tests must pass (they mock ConvexClient)
- Manual: start `terminal_bridge.py` without admin key → should exit with clear error
- Manual: start `terminal_bridge.py` without CONVEX_URL → should exit with clear error
- Manual: start `terminal_bridge.py` with both → should work normally

### Project Structure Notes

- `terminal_bridge.py` is at project root (not inside nanobot/)
- Convex functions are in `dashboard/convex/`
- The `_generated/server` exports both `mutation` and `internalMutation` — no codegen needed

### References

- [Source: _bmad-output/implementation-artifacts/tech-spec-convex-security-hardening.md#Phase 1]
- [Source: dashboard/convex/terminalSessions.ts] — terminal session mutations
- [Source: terminal_bridge.py:38,75,79-82] — hardcoded URL and admin key arg
- [Source: dashboard/convex/_generated/server.js:49,59] — mutation and internalMutation exports
- [Source: nanobot/mc/bridge.py:67-78] — ConvexBridge.__init__ with admin_key
- [Source: dashboard/components/TerminalPanel.tsx:16-17] — frontend caller of sendInput/get
- [Source: dashboard/components/AgentSidebarItem.tsx:72-75] — frontend caller of listSessions

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
