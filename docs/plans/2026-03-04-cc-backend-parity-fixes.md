# CC Backend Parity Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three CC backend gaps: skill availability checking, cron tool via MCP, and media attachments in send_message.

**Architecture:** Each fix adds a thin layer to the existing MCP bridge ↔ IPC server pipeline. Fix 4 (skill availability) is workspace-only. Fix 3 (cron) and Fix 1 (media) extend the IPC protocol by adding/modifying handlers and tool schemas.

**Tech Stack:** Python, asyncio, Unix sockets (IPC), MCP protocol, pytest

---

### Task 1: Add skill availability check to CC workspace manager

**Files:**
- Modify: `vendor/claude-code/claude_code/workspace.py` (method `_map_skills`, around line 353)
- Test: `tests/cc/test_workspace.py`

**Step 1: Write the failing test**

In `tests/cc/test_workspace.py`, add a new test class at the end:

```python
class TestSkillAvailabilityCheck:
    def test_unavailable_skill_not_symlinked(self, tmp_path: Path) -> None:
        """Skills with unmet requirements should not be symlinked."""
        # Create a skill with a requires.bins dependency that doesn't exist
        vendor_dir = tmp_path / "vendor-skills"
        skill_dir = vendor_dir / "needs-missing-bin"
        skill_dir.mkdir(parents=True)
        (skill_dir / "SKILL.md").write_text(
            '---\nname: needs-missing-bin\ndescription: Needs a missing binary\n'
            'metadata: \'{"nanobot":{"requires":{"bins":["__nonexistent_binary_xyz__"]}}}\'\n---\n'
            '# Skill that needs a missing binary\n'
        )

        manager = CCWorkspaceManager(workspace_root=tmp_path, vendor_skills_dir=vendor_dir)
        agent = _make_agent(skills=["needs-missing-bin"])
        ctx = manager.prepare("test-agent", agent, "task123")

        link = ctx.cwd / ".claude" / "skills" / "needs-missing-bin"
        assert not link.exists(), "Skill with unmet requirements should not be symlinked"

    def test_available_skill_still_symlinked(self, tmp_path: Path) -> None:
        """Skills with met requirements should still be symlinked normally."""
        vendor_dir = tmp_path / "vendor-skills"
        skill_dir = vendor_dir / "no-deps"
        skill_dir.mkdir(parents=True)
        (skill_dir / "SKILL.md").write_text(
            '---\nname: no-deps\ndescription: No dependencies\n---\n'
            '# Skill with no deps\n'
        )

        manager = CCWorkspaceManager(workspace_root=tmp_path, vendor_skills_dir=vendor_dir)
        agent = _make_agent(skills=["no-deps"])
        ctx = manager.prepare("test-agent", agent, "task123")

        link = ctx.cwd / ".claude" / "skills" / "no-deps"
        assert link.is_symlink(), "Skill with no requirements should be symlinked"

    def test_unavailable_skill_logged_as_warning(
        self, tmp_path: Path, caplog: pytest.LogCaptureFixture
    ) -> None:
        """Unavailable skills should produce a warning log."""
        vendor_dir = tmp_path / "vendor-skills"
        skill_dir = vendor_dir / "needs-bin"
        skill_dir.mkdir(parents=True)
        (skill_dir / "SKILL.md").write_text(
            '---\nname: needs-bin\ndescription: Needs binary\n'
            'metadata: \'{"nanobot":{"requires":{"bins":["__nonexistent_xyz__"]}}}\'\n---\n'
            '# Skill\n'
        )

        manager = CCWorkspaceManager(workspace_root=tmp_path, vendor_skills_dir=vendor_dir)
        agent = _make_agent(skills=["needs-bin"])

        with caplog.at_level(logging.WARNING, logger="claude_code.workspace"):
            manager.prepare("test-agent", agent, "task123")

        assert any("needs-bin" in r.message and "unavailable" in r.message.lower()
                    for r in caplog.records if r.levelno == logging.WARNING)
```

**Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/cc/test_workspace.py::TestSkillAvailabilityCheck -v`
Expected: FAIL — skills are currently symlinked regardless of availability

**Step 3: Implement the fix**

In `vendor/claude-code/claude_code/workspace.py`, modify `_map_skills()`. After finding the skill target (line ~359) and before creating the symlink, add an availability check:

```python
    def _map_skills(self, workspace: Path, skills: list[str]) -> None:
        """Create symlinks under .claude/skills/ for each requested skill.

        Search order (first match wins):
          1. workspace/skills/<skill_name>
          2. self._root/workspace/skills/<skill_name>
          3. vendor builtin: vendor/nanobot/nanobot/skills/<skill_name>

        Skills with unmet requirements (missing CLI binaries or env vars)
        are skipped with a warning.
        """
        skills_dir = workspace / ".claude" / "skills"
        skills_dir.mkdir(parents=True, exist_ok=True)

        # Clean up existing broken symlinks
        for entry in skills_dir.iterdir():
            if entry.is_symlink() and not entry.resolve().exists():
                logger.debug("Removing broken symlink: %s", entry)
                entry.unlink()

        # Lazy-load SkillsLoader for availability checks
        _loader = None
        try:
            from nanobot.agent.skills import SkillsLoader
            _loader = SkillsLoader(
                workspace,
                global_skills_dir=self._root / "workspace" / "skills",
                builtin_skills_dir=self._vendor_skills,
            )
        except ImportError:
            pass  # No availability check if SkillsLoader unavailable

        for skill_name in skills:
            # C2: Validate skill name to prevent path traversal
            if "/" in skill_name or skill_name.startswith("."):
                logger.warning("Skipping invalid skill name: %s", skill_name)
                continue

            target = self._find_skill(workspace, skill_name)
            if target is None:
                logger.warning("Skill '%s' not found in any search location — skipping", skill_name)
                continue

            # Check skill availability (bins/env requirements)
            if _loader and not _loader.is_skill_available(skill_name):
                missing = _loader.get_missing_requirements(skill_name) or "unknown"
                logger.warning(
                    "Skill '%s' is unavailable (missing: %s) — skipping symlink",
                    skill_name, missing,
                )
                continue

            link_path = skills_dir / skill_name
            # Remove stale symlink pointing elsewhere before re-creating
            if link_path.is_symlink():
                if link_path.resolve() == target.resolve():
                    continue  # Already correct
                link_path.unlink()
            elif link_path.exists():
                logger.warning(
                    "Skill path '%s' exists as a non-symlink — skipping symlink creation",
                    link_path,
                )
                continue

            link_path.symlink_to(target)
            logger.debug("Mapped skill '%s' → %s", skill_name, target)
```

The key change: after `target = self._find_skill(...)` succeeds, we check `_loader.is_skill_available(skill_name)` before creating the symlink. If it fails, we log a warning and `continue`.

**Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/cc/test_workspace.py -v`
Expected: ALL PASS (both new and existing tests)

**Step 5: Commit**

```bash
git add vendor/claude-code/claude_code/workspace.py tests/cc/test_workspace.py
git commit -m "fix(cc): skip unavailable skills in CC workspace mapping"
```

---

### Task 2: Add cron tool to MCP bridge and IPC server

**Files:**
- Modify: `vendor/claude-code/claude_code/mcp_bridge.py` (add tool definition + handler)
- Modify: `vendor/claude-code/claude_code/ipc_server.py` (add cron handler + constructor param)
- Modify: `vendor/claude-code/claude_code/workspace.py` (update `_MCP_TOOLS_GUIDE`)
- Modify: `mc/executor.py` (pass cron_service to MCSocketServer — 2 locations)
- Test: `tests/cc/test_mcp_bridge.py` (new test class)
- Test: new file `tests/cc/test_ipc_cron.py` (IPC handler tests)

**Step 1: Write the failing test for MCP bridge**

In `tests/cc/test_mcp_bridge.py`, add at the end:

```python
class TestCronTool:
    async def test_cron_list_returns_jobs(self):
        """cron tool with action=list returns job listing from IPC."""
        import claude_code.mcp_bridge as bridge_mod

        mock_ipc = _make_mock_ipc({"cron": {"result": "No scheduled jobs."}})

        with patch.object(bridge_mod, "_ipc_client", mock_ipc):
            result = await bridge_mod.call_tool(
                "cron", {"action": "list"}
            )

        assert "No scheduled jobs" in result[0].text

    async def test_cron_add_returns_confirmation(self):
        """cron tool with action=add returns job creation confirmation."""
        import claude_code.mcp_bridge as bridge_mod

        mock_ipc = _make_mock_ipc(
            {"cron": {"result": "Created job 'daily report' (id: abc123)"}}
        )

        with patch.object(bridge_mod, "_ipc_client", mock_ipc):
            result = await bridge_mod.call_tool(
                "cron",
                {
                    "action": "add",
                    "message": "daily report",
                    "cron_expr": "0 9 * * *",
                },
            )

        assert "Created job" in result[0].text

    async def test_cron_remove_returns_confirmation(self):
        """cron tool with action=remove returns removal confirmation."""
        import claude_code.mcp_bridge as bridge_mod

        mock_ipc = _make_mock_ipc({"cron": {"result": "Removed job abc123"}})

        with patch.object(bridge_mod, "_ipc_client", mock_ipc):
            result = await bridge_mod.call_tool(
                "cron", {"action": "remove", "job_id": "abc123"}
            )

        assert "Removed job" in result[0].text

    async def test_cron_ipc_failure(self):
        """cron tool handles ConnectionError gracefully."""
        import claude_code.mcp_bridge as bridge_mod

        async def failing_request(method, params):
            raise ConnectionError("socket not found")

        mock_ipc = MagicMock()
        mock_ipc.request = failing_request

        with patch.object(bridge_mod, "_ipc_client", mock_ipc):
            result = await bridge_mod.call_tool("cron", {"action": "list"})

        assert "Mission Control not reachable" in result[0].text

    async def test_cron_in_tool_list(self):
        """list_tools includes the cron tool."""
        import claude_code.mcp_bridge as bridge_mod

        tools = await bridge_mod.list_tools()
        names = {t.name for t in tools}
        assert "cron" in names
```

**Step 2: Write the failing test for IPC handler**

Create `tests/cc/test_ipc_cron.py`:

```python
"""Unit tests for the cron IPC handler in MCSocketServer."""

from __future__ import annotations

import asyncio
from unittest.mock import MagicMock

import pytest

from claude_code.ipc_server import MCSocketServer

pytestmark = pytest.mark.asyncio


def _make_mock_cron_service(jobs: list | None = None):
    """Create a mock CronService."""
    mock = MagicMock()
    mock.list_jobs.return_value = jobs or []

    def add_job(**kwargs):
        job = MagicMock()
        job.name = kwargs.get("name", "test")
        job.id = "mock-job-id"
        return job

    mock.add_job.side_effect = add_job
    mock.remove_job.return_value = True
    return mock


class TestCronHandler:
    async def test_list_empty(self):
        cron = _make_mock_cron_service()
        server = MCSocketServer(None, None, cron_service=cron)
        result = await server._handle_cron(action="list", agent_name="test", task_id="t1")
        assert "No scheduled jobs" in result["result"]

    async def test_list_with_jobs(self):
        job = MagicMock()
        job.name = "daily check"
        job.id = "j1"
        job.schedule.kind = "cron"
        cron = _make_mock_cron_service(jobs=[job])
        server = MCSocketServer(None, None, cron_service=cron)
        result = await server._handle_cron(action="list", agent_name="test", task_id="t1")
        assert "daily check" in result["result"]

    async def test_add_job(self):
        cron = _make_mock_cron_service()
        server = MCSocketServer(None, None, cron_service=cron)
        result = await server._handle_cron(
            action="add",
            message="remind me",
            cron_expr="0 9 * * *",
            agent_name="test",
            task_id="t1",
        )
        assert "Created job" in result["result"]
        cron.add_job.assert_called_once()

    async def test_remove_job(self):
        cron = _make_mock_cron_service()
        server = MCSocketServer(None, None, cron_service=cron)
        result = await server._handle_cron(
            action="remove",
            job_id="j1",
            agent_name="test",
            task_id="t1",
        )
        assert "Removed" in result["result"]

    async def test_no_cron_service(self):
        server = MCSocketServer(None, None, cron_service=None)
        result = await server._handle_cron(action="list", agent_name="test", task_id="t1")
        assert "error" in result

    async def test_add_missing_message(self):
        cron = _make_mock_cron_service()
        server = MCSocketServer(None, None, cron_service=cron)
        result = await server._handle_cron(action="add", agent_name="test", task_id="t1")
        assert "error" in result
```

**Step 3: Run tests to verify they fail**

Run: `uv run pytest tests/cc/test_mcp_bridge.py::TestCronTool tests/cc/test_ipc_cron.py -v`
Expected: FAIL — cron tool doesn't exist yet

**Step 4: Implement the cron tool in mcp_bridge.py**

In `vendor/claude-code/claude_code/mcp_bridge.py`, add the cron tool definition to `list_tools()` (after the `report_progress` Tool, before the closing `]`):

```python
        Tool(
            name="cron",
            description=(
                "Schedule reminders and recurring tasks. "
                "Actions: add (create job), list (show jobs), remove (delete job)."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["add", "list", "remove"],
                        "description": "Action to perform.",
                    },
                    "message": {
                        "type": "string",
                        "description": "Reminder message (required for add).",
                    },
                    "every_seconds": {
                        "type": "integer",
                        "description": "Interval in seconds (for recurring tasks).",
                    },
                    "cron_expr": {
                        "type": "string",
                        "description": "Cron expression like '0 9 * * *' (for scheduled tasks).",
                    },
                    "tz": {
                        "type": "string",
                        "description": "IANA timezone for cron expressions (e.g. 'America/Vancouver').",
                    },
                    "at": {
                        "type": "string",
                        "description": "ISO datetime for one-time execution (e.g. '2026-02-12T10:30:00').",
                    },
                    "job_id": {
                        "type": "string",
                        "description": "Job ID (required for remove).",
                    },
                },
                "required": ["action"],
            },
        ),
```

Add the handler in `call_tool()` (before the `else` clause):

```python
    elif name == "cron":
        try:
            result = await ipc.request(
                "cron",
                {
                    "action": arguments["action"],
                    "message": arguments.get("message"),
                    "every_seconds": arguments.get("every_seconds"),
                    "cron_expr": arguments.get("cron_expr"),
                    "tz": arguments.get("tz"),
                    "at": arguments.get("at"),
                    "job_id": arguments.get("job_id"),
                    "agent_name": _get_agent_name(),
                    "task_id": _get_task_id(),
                },
            )
        except ConnectionError:
            return [TextContent(
                type="text",
                text="Mission Control not reachable. Is the gateway running?",
            )]
        if "error" in result:
            return [TextContent(type="text", text=f"Error: {result['error']}")]
        return [TextContent(type="text", text=result.get("result", "Done"))]
```

**Step 5: Implement the cron IPC handler in ipc_server.py**

Modify `MCSocketServer.__init__` to accept an optional `cron_service` parameter:

```python
    def __init__(self, bridge: "ConvexBridge | None", bus: "MessageBus | None",
                 cron_service: Any | None = None) -> None:
        self._bridge = bridge
        self._bus = bus
        self._cron_service = cron_service
        # ... rest unchanged ...

        # Register default handlers
        self.register("ask_user", self._handle_ask_user)
        self.register("send_message", self._handle_send_message)
        self.register("delegate_task", self._handle_delegate_task)
        self.register("ask_agent", self._handle_ask_agent)
        self.register("report_progress", self._handle_report_progress)
        self.register("cron", self._handle_cron)
```

Add the handler method:

```python
    async def _handle_cron(
        self,
        action: str = "list",
        message: str | None = None,
        every_seconds: int | None = None,
        cron_expr: str | None = None,
        tz: str | None = None,
        at: str | None = None,
        job_id: str | None = None,
        agent_name: str = "agent",
        task_id: str | None = None,
    ) -> dict[str, Any]:
        """Proxy cron operations to the CronService."""
        if not self._cron_service:
            return {"error": "Cron service not available."}

        if action == "list":
            jobs = self._cron_service.list_jobs()
            if not jobs:
                return {"result": "No scheduled jobs."}
            lines = [f"- {j.name} (id: {j.id}, {j.schedule.kind})" for j in jobs]
            return {"result": "Scheduled jobs:\n" + "\n".join(lines)}

        elif action == "add":
            if not message:
                return {"error": "message is required for add"}

            from nanobot.cron.types import CronSchedule

            delete_after = False
            if every_seconds:
                schedule = CronSchedule(kind="every", every_ms=every_seconds * 1000)
            elif cron_expr:
                if tz:
                    from zoneinfo import ZoneInfo
                    try:
                        ZoneInfo(tz)
                    except (KeyError, Exception):
                        return {"error": f"Unknown timezone '{tz}'"}
                schedule = CronSchedule(kind="cron", expr=cron_expr, tz=tz)
            elif at:
                from datetime import datetime as _dt
                try:
                    dt = _dt.fromisoformat(at)
                except ValueError:
                    return {"error": f"Invalid ISO datetime: {at}"}
                at_ms = int(dt.timestamp() * 1000)
                schedule = CronSchedule(kind="at", at_ms=at_ms)
                delete_after = True
            else:
                return {"error": "One of every_seconds, cron_expr, or at is required"}

            job = self._cron_service.add_job(
                name=message[:30],
                schedule=schedule,
                message=message,
                deliver=True,
                channel="mc",
                to=agent_name,
                delete_after_run=delete_after,
                task_id=task_id,
                agent=agent_name,
            )
            return {"result": f"Created job '{job.name}' (id: {job.id})"}

        elif action == "remove":
            if not job_id:
                return {"error": "job_id is required for remove"}
            if self._cron_service.remove_job(job_id):
                return {"result": f"Removed job {job_id}"}
            return {"error": f"Job {job_id} not found"}

        return {"error": f"Unknown cron action: {action}"}
```

**Step 6: Pass cron_service to MCSocketServer in executor.py**

In `mc/executor.py`, two locations where `MCSocketServer` is constructed:

Location 1 — `_execute_cc_task()` (around line 1491):
```python
# BEFORE:
ipc_server = MCSocketServer(self._bridge, None)
# AFTER:
ipc_server = MCSocketServer(self._bridge, None, cron_service=self._cron_service)
```

Location 2 — `handle_cc_thread_reply()` (around line 1800):
```python
# BEFORE:
ipc_server = MCSocketServer(self._bridge, None)
# AFTER:
ipc_server = MCSocketServer(self._bridge, None, cron_service=self._cron_service)
```

**Step 7: Update MCP tools guide in workspace.py**

In `vendor/claude-code/claude_code/workspace.py`, update `_MCP_TOOLS_GUIDE` to include cron:

```python
_MCP_TOOLS_GUIDE = """\
## Available MCP Tools (nanobot server)

Use these tools via the `mcp__nanobot__` prefix:

- **mcp__nanobot__ask_user** — Ask the human user a question and wait for a reply.
- **mcp__nanobot__send_message** — Send a message to another agent or to the task thread.
- **mcp__nanobot__delegate_task** — Delegate a subtask to a specialist agent.
- **mcp__nanobot__ask_agent** — Ask a specific agent a question and get a reply.
- **mcp__nanobot__report_progress** — Report task progress back to Mission Control.
- **mcp__nanobot__cron** — Schedule reminders and recurring tasks (add/list/remove).

> **IMPORTANT**: `AskUserQuestion` does NOT work. You MUST use `mcp__nanobot__ask_user` instead.
"""
```

**Step 8: Run all tests**

Run: `uv run pytest tests/cc/test_mcp_bridge.py tests/cc/test_ipc_cron.py tests/cc/test_workspace.py -v`
Expected: ALL PASS

**Step 9: Commit**

```bash
git add vendor/claude-code/claude_code/mcp_bridge.py vendor/claude-code/claude_code/ipc_server.py vendor/claude-code/claude_code/workspace.py mc/executor.py tests/cc/test_mcp_bridge.py tests/cc/test_ipc_cron.py
git commit -m "feat(cc): add cron tool to MCP bridge for CC backend agents"
```

---

### Task 3: Add media support to send_message MCP tool

**Files:**
- Modify: `vendor/claude-code/claude_code/mcp_bridge.py` (add media param to send_message schema + handler)
- Modify: `vendor/claude-code/claude_code/ipc_server.py` (pass media through to OutboundMessage)
- Test: `tests/cc/test_mcp_bridge.py` (new tests in TestSendMessageTool)
- Test: new file `tests/cc/test_ipc_media.py` (IPC handler media tests)

**Step 1: Write the failing test for MCP bridge**

In `tests/cc/test_mcp_bridge.py`, add to `TestSendMessageTool`:

```python
    async def test_send_message_passes_media(self):
        """send_message includes media paths in IPC params when given."""
        import claude_code.mcp_bridge as bridge_mod

        received: dict = {}

        async def capture(method, params):
            received.update(params)
            return {"status": "Message sent"}

        mock_ipc = MagicMock()
        mock_ipc.request = capture

        with patch.object(bridge_mod, "_ipc_client", mock_ipc):
            await bridge_mod.call_tool(
                "send_message",
                {
                    "content": "here are the results",
                    "media": ["/tmp/output.png", "/tmp/report.pdf"],
                },
            )

        assert received["media"] == ["/tmp/output.png", "/tmp/report.pdf"]
```

**Step 2: Write the failing test for IPC handler**

Create `tests/cc/test_ipc_media.py`:

```python
"""Unit tests for media support in send_message IPC handler."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from claude_code.ipc_server import MCSocketServer

pytestmark = pytest.mark.asyncio


class TestSendMessageMedia:
    async def test_media_passed_to_outbound_message(self):
        """send_message handler passes media paths to OutboundMessage."""
        bus = MagicMock()
        bus.publish_outbound = AsyncMock()

        server = MCSocketServer(None, bus)
        result = await server._handle_send_message(
            content="check this image",
            channel="telegram",
            chat_id="123",
            media=["/tmp/image.png"],
        )

        assert result["status"] == "Message sent"
        bus.publish_outbound.assert_called_once()
        msg = bus.publish_outbound.call_args[0][0]
        assert msg.media == ["/tmp/image.png"]

    async def test_media_defaults_to_empty_list(self):
        """send_message handler defaults media to empty list when not provided."""
        bus = MagicMock()
        bus.publish_outbound = AsyncMock()

        server = MCSocketServer(None, bus)
        result = await server._handle_send_message(
            content="no attachments",
            channel="telegram",
            chat_id="123",
        )

        msg = bus.publish_outbound.call_args[0][0]
        assert msg.media == []
```

**Step 3: Run tests to verify they fail**

Run: `uv run pytest tests/cc/test_mcp_bridge.py::TestSendMessageTool::test_send_message_passes_media tests/cc/test_ipc_media.py -v`
Expected: FAIL — media param not in schema / not passed through

**Step 4: Implement media in mcp_bridge.py**

In `vendor/claude-code/claude_code/mcp_bridge.py`, update the `send_message` tool definition in `list_tools()` to add the media property:

```python
        Tool(
            name="send_message",
            description=(
                "Send a message to the user or a channel. "
                "Use to proactively communicate progress or results."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "content": {"type": "string", "description": "Message body."},
                    "channel": {"type": "string", "description": "Target channel (optional)."},
                    "chat_id": {"type": "string", "description": "Target chat/user ID (optional)."},
                    "media": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional list of file paths to attach (images, audio, documents).",
                    },
                },
                "required": ["content"],
            },
        ),
```

Update the `send_message` handler in `call_tool()` to pass media:

```python
    elif name == "send_message":
        try:
            result = await ipc.request(
                "send_message",
                {
                    "content": arguments["content"],
                    "channel": arguments.get("channel"),
                    "chat_id": arguments.get("chat_id"),
                    "media": arguments.get("media"),
                    "agent_name": AGENT_NAME,
                    "task_id": TASK_ID,
                },
            )
        # ... rest unchanged
```

**Step 5: Implement media in ipc_server.py**

Update `_handle_send_message` to accept and pass through media:

```python
    async def _handle_send_message(
        self,
        content: str,
        channel: str | None = None,
        chat_id: str | None = None,
        media: list[str] | None = None,
        agent_name: str = "agent",
        task_id: str | None = None,
    ) -> dict[str, Any]:
        """Publish an outbound message to the MessageBus."""
        if self._bus and channel and chat_id:
            from nanobot.bus.events import OutboundMessage

            msg = OutboundMessage(
                channel=channel, chat_id=chat_id, content=content,
                media=media or [],
            )
            # ... rest unchanged
```

The only change is adding `media: list[str] | None = None` to the signature and passing `media=media or []` to `OutboundMessage`.

**Step 6: Run all tests**

Run: `uv run pytest tests/cc/test_mcp_bridge.py tests/cc/test_ipc_media.py -v`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add vendor/claude-code/claude_code/mcp_bridge.py vendor/claude-code/claude_code/ipc_server.py tests/cc/test_mcp_bridge.py tests/cc/test_ipc_media.py
git commit -m "feat(cc): add media attachment support to send_message MCP tool"
```

---

### Task 4: Run full test suite and verify no regressions

**Step 1: Run all CC tests**

Run: `uv run pytest tests/cc/ -v`
Expected: ALL PASS

**Step 2: Run all MC executor tests**

Run: `uv run pytest tests/mc/test_executor_cc.py -v`
Expected: ALL PASS (MCSocketServer constructor change is backwards-compatible due to keyword-only arg with default)

**Step 3: Run workspace context tests**

Run: `uv run pytest tests/cc/test_workspace_context.py -v 2>/dev/null; uv run pytest tests/cc/test_workspace.py -v`
Expected: ALL PASS

**Step 4: Final commit (if any fixups needed)**

Only if regressions found — fix and commit.
