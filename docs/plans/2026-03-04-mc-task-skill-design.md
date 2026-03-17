# MC Task Management Skill + CLI Extension

## Problem

The nanobot agent (running on Telegram/any channel) has only `delegate_task` tool which creates tasks. There's no way for the agent to **manage** existing tasks — change status, send messages to threads, delete, approve, etc. A weaker model asked to manipulate MC tasks gets completely lost.

## Solution

Two deliverables:

1. **Extend `nanobot mc tasks` CLI** with full CRUD commands
2. **Create `mc` nanobot skill** (SKILL.md) that teaches the agent to use these commands via `exec` tool

## Design

### Part 1: CLI Commands (mc/cli.py)

Extend the existing `tasks_app` typer group. All commands use `_get_bridge()` for Convex access.

#### Existing Commands (enhance)

**`nanobot mc tasks create <title>`**
Add flags:
- `--description / -d` (already exists)
- `--tags / -t` (already exists)
- `--trust-level` — autonomous | agent_reviewed | human_approved (default: autonomous)
- `--supervision-mode` — autonomous | supervised (default: autonomous)
- `--is-manual` — boolean flag, creates a human/manual task
- `--assigned-agent` — agent name to assign
- `--source-agent` — agent that created this task

**`nanobot mc tasks list`** (already exists, enhance)
Add flags:
- `--status / -s` — filter by status
- `--json` — output as JSON (for programmatic consumption by the agent)

#### New Commands

| Command | Args | Description |
|---------|------|-------------|
| `get <id>` | task_id (positional) | Show task details (title, status, agent, trust level, description, thread) |
| `update-status <id> <status>` | task_id, status, `--agent-name` | Transition task status via state machine |
| `send-message <id> <content>` | task_id, content, `--author / -a`, `--type` | Post message to task thread |
| `delete <id>` | task_id | Soft-delete task |
| `restore <id>` | task_id, `--mode` (previous/beginning) | Restore deleted task |
| `approve <id>` | task_id | Approve human_approved review |
| `deny <id>` | task_id, `--reason` | Deny human_approved review |
| `pause <id>` | task_id | Pause running task |
| `resume <id>` | task_id | Resume paused task |
| `update-title <id> <title>` | task_id, title | Edit task title |
| `update-description <id>` | task_id, `--description` | Edit task description |
| `update-tags <id>` | task_id, `--tags` (comma-separated) | Update task tags |

All commands output plain text by default. `--json` flag on `list` and `get` outputs JSON for programmatic use.

### Part 2: SKILL.md

Location: `vendor/nanobot/nanobot/skills/mc/SKILL.md`

Contents:
- Frontmatter with name, description, metadata (requires `nanobot` binary)
- State machine reference (valid transitions)
- Trust level + supervision mode matrix
- Command reference with examples
- Common workflow recipes

### Architecture

```
Telegram msg → nanobot agent → exec("nanobot mc tasks ...") → mc/cli.py → ConvexBridge → Convex
```

- Same `ConvexBridge` used by executor/orchestrator
- Same `_get_bridge()` helper already in mc/cli.py
- Public mutations for user-facing actions (create, approve, deny, delete, restore)
- Internal mutations for status transitions (updateStatus) — requires admin key
- Task IDs are Convex _id strings (e.g., "jd7abc123xyz")

### State Machine Reference

```
inbox → assigned, planning
assigned → in_progress, assigned
in_progress → review, done, assigned
review → done, inbox, assigned, in_progress, planning
planning → failed, review, ready, in_progress
ready → in_progress, planning, failed
failed → planning
done → assigned
retrying → in_progress, crashed
crashed → inbox, assigned

Universal targets (from any state): retrying, crashed, deleted
```

### Trust Levels

| Trust Level | Review After Completion |
|-------------|----------------------|
| autonomous | No review needed |
| agent_reviewed | Peer agent reviews |
| human_approved | Human must approve/deny |

### Supervision Modes

| Mode | Behavior |
|------|----------|
| autonomous | Agent executes immediately |
| supervised | Agent generates plan → user approves → then executes |

### Manual Tasks

- `isManual: true` → appears on human board
- Can be dragged between statuses freely (bypasses state machine)
- No agent assignment
- Use for human-only tasks

## Implementation Plan

1. Extend `mc/cli.py` `tasks_app` with all new commands
2. Enhance existing `create` and `list` commands
3. Create `vendor/nanobot/nanobot/skills/mc/SKILL.md`
4. Test all commands manually against running Convex instance
5. Verify skill loads correctly in nanobot agent context

## Files to Modify

- `mc/cli.py` — extend tasks_app with new commands
- `vendor/nanobot/nanobot/skills/mc/SKILL.md` — new skill file (create)
