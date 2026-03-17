# MC Task Management Skill + CLI Extension — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the `nanobot mc tasks` CLI with full CRUD commands and create a nanobot skill (SKILL.md) that teaches the agent how to use them.

**Architecture:** Add new typer commands to `mc/cli.py` `tasks_app` group, each wrapping ConvexBridge calls. Create `vendor/nanobot/nanobot/skills/mc/SKILL.md` as a concise reference.

**Tech Stack:** Python (typer, rich), Convex (mutations/queries via ConvexBridge)

---

### Task 1: Enhance `tasks create` with trust/supervision flags

**Files:**
- Modify: `mc/cli.py:728-757` (existing `tasks_create` command)

**Step 1: Write the code**

Replace the existing `tasks_create` function with enhanced version:

```python
@tasks_app.command("create")
def tasks_create(
    title: str = typer.Argument(None, help="Task title"),
    description: str = typer.Option(None, "--description", "-d", help="Task description"),
    tags: str = typer.Option(None, "--tags", "-t", help="Comma-separated tags"),
    trust_level: str = typer.Option(
        "autonomous", "--trust-level",
        help="Trust level: autonomous | agent_reviewed | human_approved",
    ),
    supervision_mode: str = typer.Option(
        "autonomous", "--supervision-mode",
        help="Supervision mode: autonomous | supervised",
    ),
    is_manual: bool = typer.Option(False, "--manual", help="Create as manual/human task"),
    assigned_agent: str = typer.Option(None, "--agent", "-a", help="Agent to assign"),
    source_agent: str = typer.Option(None, "--source", help="Source agent name"),
):
    """Create a new task."""
    if title is None:
        title = typer.prompt("Task title")

    # Validate trust_level
    valid_trust = {"autonomous", "agent_reviewed", "human_approved"}
    if trust_level not in valid_trust:
        console.print(f"[red]Invalid trust level: {trust_level}. Must be one of: {', '.join(valid_trust)}[/red]")
        raise typer.Exit(1)

    # Validate supervision_mode
    valid_supervision = {"autonomous", "supervised"}
    if supervision_mode not in valid_supervision:
        console.print(f"[red]Invalid supervision mode: {supervision_mode}. Must be one of: {', '.join(valid_supervision)}[/red]")
        raise typer.Exit(1)

    bridge = _get_bridge()
    try:
        tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else None
        args: dict = {"title": title}
        if description:
            args["description"] = description
        if tag_list:
            args["tags"] = tag_list
        if trust_level != "autonomous":
            args["trustLevel"] = trust_level
        if supervision_mode != "autonomous":
            args["supervisionMode"] = supervision_mode
        if is_manual:
            args["isManual"] = True
        if assigned_agent:
            args["assignedAgent"] = assigned_agent
        if source_agent:
            args["sourceAgent"] = source_agent
        task_id = bridge.mutation("tasks:create", args)
        console.print(f"[green]Task created:[/green] {title}")
        console.print(f"  ID: {task_id}")
        console.print(f"  Status: inbox")
        if is_manual:
            console.print("  Type: manual (human task)")
        if trust_level != "autonomous":
            console.print(f"  Trust: {trust_level}")
        if assigned_agent:
            console.print(f"  Agent: {assigned_agent}")
    finally:
        bridge.close()
```

**Step 2: Test manually**

```bash
uv run nanobot mc tasks create "Test task" -d "Testing" --trust-level human_approved
uv run nanobot mc tasks create "Manual task" --manual
```

**Step 3: Commit**

```bash
git add mc/cli.py
git commit -m "feat(mc-cli): enhance tasks create with trust/supervision/manual flags"
```

---

### Task 2: Enhance `tasks list` with status filter and JSON output

**Files:**
- Modify: `mc/cli.py:760-811` (existing `tasks_list` command)

**Step 1: Write the code**

Replace existing `tasks_list`:

```python
@tasks_app.command("list")
def tasks_list(
    status_filter: str = typer.Option(None, "--status", "-s", help="Filter by status"),
    json_output: bool = typer.Option(False, "--json", help="Output as JSON"),
):
    """List all tasks."""
    import json as json_mod

    bridge = _get_bridge()
    try:
        if status_filter:
            tasks = bridge.query("tasks:listByStatus", {"status": status_filter})
        else:
            tasks = bridge.query("tasks:list")
        if not tasks:
            if json_output:
                console.print("[]")
            else:
                console.print("No tasks found.")
            return

        if json_output:
            # Output JSON for programmatic consumption
            output = []
            for task in tasks:
                output.append({
                    "id": task.get("id"),
                    "title": task.get("title"),
                    "status": task.get("status"),
                    "assigned_agent": task.get("assigned_agent"),
                    "trust_level": task.get("trust_level"),
                    "supervision_mode": task.get("supervision_mode"),
                    "is_manual": task.get("is_manual"),
                    "created_at": task.get("created_at"),
                    "tags": task.get("tags"),
                })
            console.print(json_mod.dumps(output, indent=2))
            return

        status_order = [
            "inbox", "assigned", "in_progress", "review",
            "done", "retrying", "crashed",
        ]
        tasks.sort(
            key=lambda t: (
                status_order.index(t.get("status", "inbox"))
                if t.get("status", "inbox") in status_order
                else len(status_order)
            )
        )

        table = Table(title="Tasks")
        table.add_column("ID", style="dim", max_width=16)
        table.add_column("Status", style="bold")
        table.add_column("Title", max_width=40)
        table.add_column("Agent")
        table.add_column("Trust")
        table.add_column("Created")

        for task in tasks:
            status_val = task.get("status", "unknown")
            color = _get_status_color(status_val)
            title_text = task.get("title", "Untitled")
            if len(title_text) > 40:
                title_text = title_text[:37] + "..."
            agent = task.get("assigned_agent") or "-"
            trust = task.get("trust_level", "autonomous")
            created = (task.get("created_at") or "")[:10]
            task_id = task.get("id", "")
            # Show last 12 chars of ID for readability
            short_id = task_id[-12:] if len(task_id) > 12 else task_id

            table.add_row(
                short_id,
                f"[{color}]{status_val}[/{color}]",
                title_text,
                agent,
                trust,
                created,
            )

        console.print(table)
    finally:
        bridge.close()
```

**Step 2: Test manually**

```bash
uv run nanobot mc tasks list
uv run nanobot mc tasks list --status inbox
uv run nanobot mc tasks list --json
```

**Step 3: Commit**

```bash
git add mc/cli.py
git commit -m "feat(mc-cli): enhance tasks list with status filter and JSON output"
```

---

### Task 3: Add `tasks get` command

**Files:**
- Modify: `mc/cli.py` (add after `tasks_list`)

**Step 1: Write the code**

```python
@tasks_app.command("get")
def tasks_get(
    task_id: str = typer.Argument(..., help="Task ID"),
    json_output: bool = typer.Option(False, "--json", help="Output as JSON"),
):
    """Show task details."""
    import json as json_mod

    bridge = _get_bridge()
    try:
        task = bridge.query("tasks:getById", {"task_id": task_id})
        if not task:
            console.print(f"[red]Task not found: {task_id}[/red]")
            raise typer.Exit(1)

        if json_output:
            console.print(json_mod.dumps(task, indent=2))
            return

        console.print(f"[bold]{task.get('title', 'Untitled')}[/bold]")
        console.print()
        status_val = task.get("status", "unknown")
        color = _get_status_color(status_val)
        console.print(f"  ID:          {task.get('id', task_id)}")
        console.print(f"  Status:      [{color}]{status_val}[/{color}]")
        console.print(f"  Agent:       {task.get('assigned_agent') or '-'}")
        console.print(f"  Trust:       {task.get('trust_level', 'autonomous')}")
        console.print(f"  Supervision: {task.get('supervision_mode', 'autonomous')}")
        console.print(f"  Manual:      {task.get('is_manual', False)}")
        console.print(f"  Created:     {task.get('created_at', '-')}")
        console.print(f"  Updated:     {task.get('updated_at', '-')}")
        tags = task.get("tags")
        if tags:
            console.print(f"  Tags:        {', '.join(tags)}")
        desc = task.get("description")
        if desc:
            console.print(f"\n  Description:\n  {desc}")

        # Show thread messages
        messages = bridge.query("messages:listByTask", {"task_id": task_id})
        if messages:
            console.print(f"\n[bold]Thread ({len(messages)} messages):[/bold]")
            for msg in messages[-10:]:  # Show last 10 messages
                author = msg.get("author_name", "?")
                content = msg.get("content", "")
                ts = (msg.get("timestamp") or "")[:16]
                if len(content) > 200:
                    content = content[:197] + "..."
                console.print(f"  [{ts}] {author}: {content}")
            if len(messages) > 10:
                console.print(f"  ... and {len(messages) - 10} older messages")
    finally:
        bridge.close()
```

**Step 2: Test manually**

```bash
uv run nanobot mc tasks list --json  # get a task ID
uv run nanobot mc tasks get <task_id>
uv run nanobot mc tasks get <task_id> --json
```

**Step 3: Commit**

```bash
git add mc/cli.py
git commit -m "feat(mc-cli): add tasks get command with thread display"
```

---

### Task 4: Add `tasks update-status` command

**Files:**
- Modify: `mc/cli.py` (add after `tasks_get`)

**Step 1: Write the code**

```python
@tasks_app.command("update-status")
def tasks_update_status(
    task_id: str = typer.Argument(..., help="Task ID"),
    new_status: str = typer.Argument(..., help="New status"),
    agent_name: str = typer.Option(None, "--agent", "-a", help="Agent name (for assigned status)"),
):
    """Change task status (follows state machine rules)."""
    valid_statuses = {
        "planning", "ready", "failed", "inbox", "assigned",
        "in_progress", "review", "done", "retrying", "crashed", "deleted",
    }
    if new_status not in valid_statuses:
        console.print(f"[red]Invalid status: {new_status}[/red]")
        console.print(f"Valid: {', '.join(sorted(valid_statuses))}")
        raise typer.Exit(1)

    bridge = _get_bridge()
    try:
        args: dict = {"task_id": task_id, "status": new_status}
        if agent_name:
            args["agent_name"] = agent_name
        bridge.mutation("tasks:updateStatus", args)
        console.print(f"[green]Task status updated to {new_status}[/green]")
    except Exception as e:
        console.print(f"[red]Failed: {e}[/red]")
        raise typer.Exit(1)
    finally:
        bridge.close()
```

**Step 2: Test manually**

```bash
uv run nanobot mc tasks update-status <task_id> assigned --agent lead-agent
```

**Step 3: Commit**

```bash
git add mc/cli.py
git commit -m "feat(mc-cli): add tasks update-status command"
```

---

### Task 5: Add `tasks send-message` command

**Files:**
- Modify: `mc/cli.py` (add after `tasks_update_status`)

**Step 1: Write the code**

```python
@tasks_app.command("send-message")
def tasks_send_message(
    task_id: str = typer.Argument(..., help="Task ID"),
    content: str = typer.Argument(..., help="Message content"),
    author: str = typer.Option("User", "--author", "-a", help="Author name"),
):
    """Post a comment to the task thread."""
    bridge = _get_bridge()
    try:
        bridge.mutation("messages:postComment", {
            "taskId": task_id,
            "content": content,
            "authorName": author,
        })
        console.print(f"[green]Message posted to task thread[/green]")
    except Exception as e:
        console.print(f"[red]Failed: {e}[/red]")
        raise typer.Exit(1)
    finally:
        bridge.close()
```

Note: Uses `messages:postComment` (public mutation) which creates a comment without status transitions. For status-changing messages (sendThreadMessage), the dashboard UI handles that.

**Step 2: Test manually**

```bash
uv run nanobot mc tasks send-message <task_id> "Hello from CLI"
```

**Step 3: Commit**

```bash
git add mc/cli.py
git commit -m "feat(mc-cli): add tasks send-message command"
```

---

### Task 6: Add `tasks delete`, `restore`, `approve`, `deny`, `pause`, `resume` commands

**Files:**
- Modify: `mc/cli.py` (add after `tasks_send_message`)

**Step 1: Write the code**

```python
@tasks_app.command("delete")
def tasks_delete(
    task_id: str = typer.Argument(..., help="Task ID"),
):
    """Soft-delete a task."""
    bridge = _get_bridge()
    try:
        bridge.mutation("tasks:softDelete", {"taskId": task_id})
        console.print(f"[green]Task deleted[/green]")
    except Exception as e:
        console.print(f"[red]Failed: {e}[/red]")
        raise typer.Exit(1)
    finally:
        bridge.close()


@tasks_app.command("restore")
def tasks_restore(
    task_id: str = typer.Argument(..., help="Task ID"),
    mode: str = typer.Option(
        "beginning", "--mode", "-m",
        help="Restore mode: previous (n-1 state) | beginning (inbox)",
    ),
):
    """Restore a deleted task."""
    if mode not in ("previous", "beginning"):
        console.print("[red]Mode must be 'previous' or 'beginning'[/red]")
        raise typer.Exit(1)
    bridge = _get_bridge()
    try:
        bridge.mutation("tasks:restore", {"taskId": task_id, "mode": mode})
        console.print(f"[green]Task restored (mode: {mode})[/green]")
    except Exception as e:
        console.print(f"[red]Failed: {e}[/red]")
        raise typer.Exit(1)
    finally:
        bridge.close()


@tasks_app.command("approve")
def tasks_approve(
    task_id: str = typer.Argument(..., help="Task ID"),
    user_name: str = typer.Option("User", "--user", "-u", help="Approver name"),
):
    """Approve a human_approved task in review."""
    bridge = _get_bridge()
    try:
        bridge.mutation("tasks:approve", {"taskId": task_id, "userName": user_name})
        console.print(f"[green]Task approved → done[/green]")
    except Exception as e:
        console.print(f"[red]Failed: {e}[/red]")
        raise typer.Exit(1)
    finally:
        bridge.close()


@tasks_app.command("deny")
def tasks_deny(
    task_id: str = typer.Argument(..., help="Task ID"),
    feedback: str = typer.Argument(..., help="Denial feedback/reason"),
    user_name: str = typer.Option("User", "--user", "-u", help="Reviewer name"),
):
    """Deny a human_approved task in review."""
    bridge = _get_bridge()
    try:
        bridge.mutation("tasks:deny", {
            "taskId": task_id,
            "feedback": feedback,
            "userName": user_name,
        })
        console.print(f"[green]Task denied (stays in review)[/green]")
    except Exception as e:
        console.print(f"[red]Failed: {e}[/red]")
        raise typer.Exit(1)
    finally:
        bridge.close()


@tasks_app.command("pause")
def tasks_pause(
    task_id: str = typer.Argument(..., help="Task ID"),
):
    """Pause a running task (in_progress → review)."""
    bridge = _get_bridge()
    try:
        bridge.mutation("tasks:pauseTask", {"taskId": task_id})
        console.print(f"[green]Task paused[/green]")
    except Exception as e:
        console.print(f"[red]Failed: {e}[/red]")
        raise typer.Exit(1)
    finally:
        bridge.close()


@tasks_app.command("resume")
def tasks_resume(
    task_id: str = typer.Argument(..., help="Task ID"),
):
    """Resume a paused task (review → in_progress)."""
    bridge = _get_bridge()
    try:
        bridge.mutation("tasks:resumeTask", {"taskId": task_id})
        console.print(f"[green]Task resumed[/green]")
    except Exception as e:
        console.print(f"[red]Failed: {e}[/red]")
        raise typer.Exit(1)
    finally:
        bridge.close()
```

**Step 2: Test manually**

```bash
uv run nanobot mc tasks delete <task_id>
uv run nanobot mc tasks restore <task_id> --mode beginning
uv run nanobot mc tasks pause <task_id>
uv run nanobot mc tasks resume <task_id>
```

**Step 3: Commit**

```bash
git add mc/cli.py
git commit -m "feat(mc-cli): add delete, restore, approve, deny, pause, resume commands"
```

---

### Task 7: Add `tasks update-title`, `update-description`, `update-tags` commands

**Files:**
- Modify: `mc/cli.py` (add after task 6 commands)

**Step 1: Write the code**

```python
@tasks_app.command("update-title")
def tasks_update_title(
    task_id: str = typer.Argument(..., help="Task ID"),
    title: str = typer.Argument(..., help="New title"),
):
    """Update a task's title."""
    bridge = _get_bridge()
    try:
        bridge.mutation("tasks:updateTitle", {"taskId": task_id, "title": title})
        console.print(f"[green]Title updated[/green]")
    except Exception as e:
        console.print(f"[red]Failed: {e}[/red]")
        raise typer.Exit(1)
    finally:
        bridge.close()


@tasks_app.command("update-description")
def tasks_update_description(
    task_id: str = typer.Argument(..., help="Task ID"),
    description: str = typer.Argument(..., help="New description"),
):
    """Update a task's description."""
    bridge = _get_bridge()
    try:
        bridge.mutation("tasks:updateDescription", {
            "taskId": task_id,
            "description": description,
        })
        console.print(f"[green]Description updated[/green]")
    except Exception as e:
        console.print(f"[red]Failed: {e}[/red]")
        raise typer.Exit(1)
    finally:
        bridge.close()


@tasks_app.command("update-tags")
def tasks_update_tags(
    task_id: str = typer.Argument(..., help="Task ID"),
    tags: str = typer.Argument(..., help="Comma-separated tags"),
):
    """Update a task's tags."""
    tag_list = [t.strip() for t in tags.split(",") if t.strip()]
    bridge = _get_bridge()
    try:
        bridge.mutation("tasks:updateTags", {"taskId": task_id, "tags": tag_list})
        console.print(f"[green]Tags updated: {', '.join(tag_list)}[/green]")
    except Exception as e:
        console.print(f"[red]Failed: {e}[/red]")
        raise typer.Exit(1)
    finally:
        bridge.close()
```

**Step 2: Test manually**

```bash
uv run nanobot mc tasks update-title <task_id> "New Title"
uv run nanobot mc tasks update-description <task_id> "New description here"
uv run nanobot mc tasks update-tags <task_id> "urgent,backend"
```

**Step 3: Commit**

```bash
git add mc/cli.py
git commit -m "feat(mc-cli): add update-title, update-description, update-tags commands"
```

---

### Task 8: Add `tasks manual-move` command

**Files:**
- Modify: `mc/cli.py`

**Step 1: Write the code**

```python
@tasks_app.command("manual-move")
def tasks_manual_move(
    task_id: str = typer.Argument(..., help="Task ID (must be a manual task)"),
    new_status: str = typer.Argument(..., help="Target status"),
):
    """Move a manual task to any status (bypasses state machine)."""
    valid = {"inbox", "assigned", "in_progress", "review", "done", "retrying", "crashed"}
    if new_status not in valid:
        console.print(f"[red]Invalid status: {new_status}[/red]")
        console.print(f"Valid: {', '.join(sorted(valid))}")
        raise typer.Exit(1)
    bridge = _get_bridge()
    try:
        bridge.mutation("tasks:manualMove", {"taskId": task_id, "newStatus": new_status})
        console.print(f"[green]Manual task moved to {new_status}[/green]")
    except Exception as e:
        console.print(f"[red]Failed: {e}[/red]")
        raise typer.Exit(1)
    finally:
        bridge.close()
```

**Step 2: Test manually**

```bash
uv run nanobot mc tasks create "Human task" --manual
uv run nanobot mc tasks manual-move <task_id> in_progress
```

**Step 3: Commit**

```bash
git add mc/cli.py
git commit -m "feat(mc-cli): add manual-move command for human tasks"
```

---

### Task 9: Create MC skill (SKILL.md)

**Files:**
- Create: `vendor/nanobot/nanobot/skills/mc/SKILL.md`

**Step 1: Create skills directory**

```bash
mkdir -p vendor/nanobot/nanobot/skills/mc
```

**Step 2: Write SKILL.md**

```markdown
---
name: mc
description: "Manage Mission Control tasks. Use when user asks to create tasks, check task status, update tasks, send messages to task threads, delete or restore tasks. Keywords: task, tarefa, board, kanban, missão, mission control."
---

# Mission Control Task Management

Use `exec` tool to run `nanobot mc tasks <command>` commands.

## Quick Reference

| Command | What it does |
|---------|-------------|
| `nanobot mc tasks list` | List all tasks |
| `nanobot mc tasks list --status inbox` | Filter by status |
| `nanobot mc tasks list --json` | JSON output (for parsing) |
| `nanobot mc tasks get <id>` | Show task details + thread |
| `nanobot mc tasks get <id> --json` | Task details as JSON |
| `nanobot mc tasks create "Title"` | Create basic task |
| `nanobot mc tasks create "Title" -d "Description"` | With description |
| `nanobot mc tasks create "Title" --manual` | Human/manual task |
| `nanobot mc tasks create "Title" --trust-level human_approved` | Requires human approval |
| `nanobot mc tasks create "Title" --agent secretary` | Assign to agent |
| `nanobot mc tasks update-status <id> <status>` | Change status |
| `nanobot mc tasks update-status <id> assigned --agent lead-agent` | Assign to agent |
| `nanobot mc tasks send-message <id> "content"` | Post comment to thread |
| `nanobot mc tasks update-title <id> "New Title"` | Edit title |
| `nanobot mc tasks update-description <id> "New desc"` | Edit description |
| `nanobot mc tasks update-tags <id> "tag1,tag2"` | Set tags |
| `nanobot mc tasks delete <id>` | Soft-delete |
| `nanobot mc tasks restore <id>` | Restore deleted task |
| `nanobot mc tasks approve <id>` | Approve reviewed task |
| `nanobot mc tasks deny <id> "reason"` | Deny reviewed task |
| `nanobot mc tasks pause <id>` | Pause running task |
| `nanobot mc tasks resume <id>` | Resume paused task |
| `nanobot mc tasks manual-move <id> <status>` | Move manual task anywhere |

## Task Statuses

```
inbox → assigned → in_progress → review → done
```

Full state machine:
- **inbox**: waiting for assignment
- **assigned**: agent assigned, not yet started
- **in_progress**: agent is working
- **review**: waiting for review/approval
- **done**: completed
- **crashed**: agent failed
- **deleted**: soft-deleted (restorable)

## Trust Levels

| Level | Meaning |
|-------|---------|
| `autonomous` | Agent runs freely, no review |
| `agent_reviewed` | Peer agent reviews after completion |
| `human_approved` | Human must approve/deny in review |

## Supervision Modes

| Mode | Meaning |
|------|---------|
| `autonomous` | Agent starts immediately |
| `supervised` | Agent creates plan → user approves → then executes |

## Manual Tasks

Create with `--manual`. These are human-only tasks (no agent assignment). Use `manual-move` to change status freely.

## Common Workflows

### Create a task for an agent
```bash
nanobot mc tasks create "Summarize weekly report" -d "Read emails and create summary" --agent secretary
```

### Create a task that needs my approval
```bash
nanobot mc tasks create "Deploy to production" --trust-level human_approved
```

### Create a personal TODO
```bash
nanobot mc tasks create "Buy groceries" --manual
```

### Check what's happening
```bash
nanobot mc tasks list --status in_progress
```

### Send feedback on a task
```bash
nanobot mc tasks send-message <id> "Please also include the sales numbers"
```

### Approve completed work
```bash
nanobot mc tasks approve <id>
```

## Task IDs

Task IDs are Convex document IDs (e.g., `jd7abc123xyz`). Get them from `nanobot mc tasks list --json` or `nanobot mc tasks list` (ID column).

## Important

- Status changes follow the state machine. Invalid transitions will fail.
- Manual tasks bypass the state machine — use `manual-move` instead of `update-status`.
- `send-message` posts a comment (no status change). For user messages that trigger agent work, use the dashboard thread.
- `delete` is soft-delete. Use `restore` to bring back.
```

**Step 3: Commit**

```bash
git add vendor/nanobot/nanobot/skills/mc/SKILL.md
git commit -m "feat(skill): add mc skill for task management via CLI"
```

---

### Task 10: Handle camelCase key issue in CLI commands

**Files:**
- Modify: `mc/cli.py` (adjust commands that call public mutations directly)

**Context:** The ConvexBridge's `mutation()` method converts snake_case keys to camelCase automatically. But for public mutations called with pre-camelCase keys (like `taskId`), they get double-converted. We need to use snake_case keys consistently in CLI code and let the bridge handle conversion.

**Step 1: Audit and fix all mutation calls**

For commands that call public mutations directly (not via bridge helper methods), ensure we pass **snake_case** keys:

- `tasks:create` — already uses camelCase (`taskId`, `assignedAgent`). Since the bridge converts snake to camel, we need to use `task_id`, `assigned_agent`, etc. **BUT** — the existing `tasks_create` function passes `args["assignedAgent"]` which would get double-converted to `assignedAgent` (no change since it's already camel). Let me check the bridge code...

Actually, looking at `_convert_keys_to_camel()`: it converts `assigned_agent` → `assignedAgent`, but `assignedAgent` → `assignedagent` (wrong!). So we MUST pass snake_case keys through the bridge.

Fix all commands:
- `tasks:create`: `assigned_agent`, `source_agent`, `is_manual`, `trust_level`, `supervision_mode`
- `tasks:softDelete`: `task_id` (not `taskId`)
- `tasks:restore`: `task_id`, `mode`
- `tasks:approve`: `task_id`, `user_name`
- `tasks:deny`: `task_id`, `feedback`, `user_name`
- `tasks:pauseTask`: `task_id`
- `tasks:resumeTask`: `task_id`
- `tasks:updateTitle`: `task_id`, `title`
- `tasks:updateDescription`: `task_id`, `description`
- `tasks:updateTags`: `task_id`, `tags`
- `tasks:manualMove`: `task_id`, `new_status`
- `messages:postComment`: `task_id`, `content`, `author_name`

**Step 2: Test a few commands to verify bridge conversion works**

```bash
uv run nanobot mc tasks create "Test bridge conversion" --agent lead-agent
uv run nanobot mc tasks list --json
```

**Step 3: Commit**

```bash
git add mc/cli.py
git commit -m "fix(mc-cli): use snake_case keys for ConvexBridge auto-conversion"
```

---

### Task 11: Final integration test

**Step 1: Run full workflow test**

```bash
# Create tasks of each type
uv run nanobot mc tasks create "Auto task" -d "Test autonomous"
uv run nanobot mc tasks create "Manual task" --manual
uv run nanobot mc tasks create "Supervised task" --trust-level human_approved --supervision-mode supervised

# List and verify
uv run nanobot mc tasks list
uv run nanobot mc tasks list --json

# Get details
uv run nanobot mc tasks get <auto_task_id>

# Send message
uv run nanobot mc tasks send-message <auto_task_id> "Test message"

# Manual task workflow
uv run nanobot mc tasks manual-move <manual_task_id> in_progress
uv run nanobot mc tasks manual-move <manual_task_id> done

# Delete and restore
uv run nanobot mc tasks delete <auto_task_id>
uv run nanobot mc tasks restore <auto_task_id>

# Verify skill loads
cat vendor/nanobot/nanobot/skills/mc/SKILL.md
```

**Step 2: Commit final state**

```bash
git add -A
git commit -m "feat(mc): complete task management CLI + skill"
```
