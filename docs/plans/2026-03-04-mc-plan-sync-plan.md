# MC Plan Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Hook handler that syncs CC plan detection and step completion to Mission Control via IPC direct Unix socket communication.

**Architecture:** New `MCPlanSyncHandler` discovers MC connection from `.mcp.json` in the CC workspace, uses a synchronous IPC client (`SyncIPCClient`) to call `report_progress` on the MC socket server. No vendor code changes.

**Tech Stack:** Python stdlib `socket` module, existing hook factory (`mc/hooks/`), existing IPC protocol (JSON-RPC over Unix socket).

---

### Task 1: Create SyncIPCClient

**Files:**
- Create: `mc/hooks/ipc_sync.py`
- Test: `tests/mc/test_mc_plan_sync.py`

**Step 1: Write the failing test**

Create `tests/mc/test_mc_plan_sync.py` with this initial content:

```python
"""Tests for MC plan sync: SyncIPCClient + MCPlanSyncHandler."""
from __future__ import annotations

import json
import os
import socket
import threading
from pathlib import Path
from unittest.mock import patch

import pytest


# ---------------------------------------------------------------------------
# SyncIPCClient tests
# ---------------------------------------------------------------------------

class TestSyncIPCClient:
    """Tests for the synchronous IPC client."""

    def test_request_sends_json_rpc_and_returns_response(self, tmp_path):
        """Client sends JSON-RPC request and parses response."""
        sock_path = str(tmp_path / "test.sock")

        # Start a mock IPC server
        server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        server.bind(sock_path)
        server.listen(1)

        def handle():
            conn, _ = server.accept()
            data = b""
            while b"\n" not in data:
                data += conn.recv(4096)
            request = json.loads(data.decode())
            assert request["method"] == "report_progress"
            assert request["params"]["message"] == "hello"
            response = json.dumps({"status": "Progress reported"}) + "\n"
            conn.sendall(response.encode())
            conn.close()
            server.close()

        t = threading.Thread(target=handle)
        t.start()

        from mc.hooks.ipc_sync import SyncIPCClient
        client = SyncIPCClient(sock_path)
        result = client.request("report_progress", {"message": "hello"})
        assert result == {"status": "Progress reported"}
        t.join(timeout=5)

    def test_request_raises_connection_error_when_no_socket(self, tmp_path):
        """Client raises ConnectionError when socket doesn't exist."""
        from mc.hooks.ipc_sync import SyncIPCClient
        client = SyncIPCClient(str(tmp_path / "nonexistent.sock"))
        with pytest.raises(ConnectionError):
            client.request("report_progress", {"message": "hello"})

    def test_request_raises_connection_error_on_timeout(self, tmp_path):
        """Client raises ConnectionError when server doesn't respond."""
        sock_path = str(tmp_path / "timeout.sock")
        server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        server.bind(sock_path)
        server.listen(1)

        def handle():
            conn, _ = server.accept()
            import time
            time.sleep(10)  # Don't respond
            conn.close()
            server.close()

        t = threading.Thread(target=handle, daemon=True)
        t.start()

        from mc.hooks.ipc_sync import SyncIPCClient
        client = SyncIPCClient(sock_path, timeout=0.5)
        with pytest.raises(ConnectionError):
            client.request("report_progress", {"message": "hello"})
```

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/test_mc_plan_sync.py::TestSyncIPCClient -v --timeout=30`
Expected: FAIL with `ModuleNotFoundError: No module named 'mc.hooks.ipc_sync'`

**Step 3: Write minimal implementation**

Create `mc/hooks/ipc_sync.py`:

```python
"""Synchronous IPC client for hook-to-MC communication.

Hooks run as blocking shell commands (not async), so they need a synchronous
client. This uses stdlib socket module — same JSON-RPC protocol as the async
MCSocketClient in vendor/claude-code/claude_code/ipc_client.py.
"""
from __future__ import annotations

import json
import socket as _socket
from typing import Any


class SyncIPCClient:
    """Synchronous client for the MC IPC server over a Unix socket."""

    def __init__(self, socket_path: str, timeout: float = 5.0) -> None:
        self._path = socket_path
        self._timeout = timeout

    def request(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        """Send a JSON-RPC-style request and return the response.

        Raises:
            ConnectionError: If the socket cannot be reached or times out.
        """
        sock = _socket.socket(_socket.AF_UNIX, _socket.SOCK_STREAM)
        sock.settimeout(self._timeout)
        try:
            sock.connect(self._path)
        except (FileNotFoundError, ConnectionRefusedError, OSError) as exc:
            sock.close()
            raise ConnectionError(
                f"Cannot connect to MC IPC socket at {self._path}: {exc}"
            ) from exc

        try:
            payload = json.dumps({"method": method, "params": params}) + "\n"
            sock.sendall(payload.encode())

            data = b""
            while b"\n" not in data:
                try:
                    chunk = sock.recv(4096)
                except _socket.timeout as exc:
                    raise ConnectionError(
                        f"MC IPC socket timed out after {self._timeout}s"
                    ) from exc
                if not chunk:
                    raise ConnectionError(
                        "MC IPC server closed connection without response"
                    )
                data += chunk

            return json.loads(data.decode())
        finally:
            sock.close()
```

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/mc/test_mc_plan_sync.py::TestSyncIPCClient -v --timeout=30`
Expected: 3 PASSED

**Step 5: Commit**

```bash
git add mc/hooks/ipc_sync.py tests/mc/test_mc_plan_sync.py
git commit -m "feat(hooks): add SyncIPCClient for hook-to-MC communication"
```

---

### Task 2: Extract Reusable Parse Functions from PlanTrackerHandler

**Blocked by:** None

**Files:**
- Modify: `mc/hooks/handlers/plan_tracker.py`
- Test: `tests/mc/test_hook_factory.py` (existing tests must still pass)

**Step 1: Add test to verify extracted functions work standalone**

Append to `tests/mc/test_mc_plan_sync.py`:

```python
# ---------------------------------------------------------------------------
# Plan parsing extraction tests
# ---------------------------------------------------------------------------

class TestPlanParsingFunctions:
    """Verify extracted parsing functions work standalone."""

    def test_parse_tasks_extracts_ids_names_blockers(self):
        from mc.hooks.handlers.plan_tracker import parse_plan_tasks
        content = (
            "# Plan\n\n"
            "### Task 1: Schema Setup\n\nSome text\n\n"
            "### Task 2: API Layer\n\n**Blocked by:** Task 1\n\n"
            "### Task 3: Frontend\n\n**Blocked by:** Task 1, Task 2\n"
        )
        tasks = parse_plan_tasks(content)
        assert len(tasks) == 3
        assert tasks[0] == {"id": 1, "name": "Schema Setup", "blocked_by": []}
        assert tasks[1] == {"id": 2, "name": "API Layer", "blocked_by": [1]}
        assert tasks[2] == {"id": 3, "name": "Frontend", "blocked_by": [1, 2]}

    def test_compute_parallel_groups_assigns_groups(self):
        from mc.hooks.handlers.plan_tracker import compute_parallel_groups
        tasks = [
            {"id": 1, "name": "A", "blocked_by": []},
            {"id": 2, "name": "B", "blocked_by": []},
            {"id": 3, "name": "C", "blocked_by": [1, 2]},
        ]
        steps = compute_parallel_groups(tasks)
        assert steps[0]["parallel_group"] == 1
        assert steps[1]["parallel_group"] == 1
        assert steps[2]["parallel_group"] == 2

    def test_is_plan_file_matches_pattern(self, tmp_path):
        from mc.hooks.handlers.plan_tracker import is_plan_file
        with patch("mc.hooks.handlers.plan_tracker.get_project_root", return_value=tmp_path):
            assert is_plan_file(str(tmp_path / "docs" / "plans" / "my-plan.md")) is True
            assert is_plan_file(str(tmp_path / "src" / "main.py")) is False
```

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/test_mc_plan_sync.py::TestPlanParsingFunctions -v --timeout=30`
Expected: FAIL with `ImportError: cannot import name 'parse_plan_tasks'`

**Step 3: Refactor plan_tracker.py to expose module-level functions**

In `mc/hooks/handlers/plan_tracker.py`, convert `_parse_tasks`, `_compute_parallel_groups`, and add `is_plan_file` as module-level functions. The class methods become thin wrappers.

Replace `_parse_tasks` and `_compute_parallel_groups` `@staticmethod` definitions with module-level functions, and update the class to call them:

```python
# Add these as module-level functions (move from class, rename without underscore prefix):

def parse_plan_tasks(content: str) -> list[dict]:
    """Parse ### Task N: Name headers and **Blocked by:** annotations from markdown."""
    tasks: list[dict] = []
    current: dict | None = None

    for line in content.splitlines():
        m = re.match(r"^###\s+Task\s+(\d+):\s+(.+)", line)
        if m:
            if current is not None:
                tasks.append(current)
            current = {
                "id": int(m.group(1)),
                "name": m.group(2).strip(),
                "blocked_by": [],
            }
            continue

        if current is not None:
            b = re.match(r"^\*\*Blocked by:\*\*\s+(.+)", line.strip())
            if b:
                ids = [int(x) for x in re.findall(r"Task\s+(\d+)", b.group(1))]
                current["blocked_by"] = ids

    if current is not None:
        tasks.append(current)
    return tasks


def compute_parallel_groups(tasks: list[dict]) -> list[dict]:
    """Assign parallel execution groups via topological BFS."""
    by_id = {t["id"]: t for t in tasks}
    all_ids = set(by_id.keys())
    group_of: dict[int, int] = {}
    remaining = set(all_ids)
    group_num = 1

    while remaining:
        ready = []
        for tid in sorted(remaining):
            blocked_by = [b for b in by_id[tid]["blocked_by"] if b in all_ids]
            if all(b not in remaining for b in blocked_by):
                ready.append(tid)
        if not ready:
            for tid in sorted(remaining):
                group_of[tid] = group_num
            break
        for tid in ready:
            group_of[tid] = group_num
            remaining.remove(tid)
        group_num += 1

    steps = []
    for i, t in enumerate(tasks):
        steps.append({
            "id": t["id"],
            "name": t["name"],
            "order": i + 1,
            "status": "pending",
            "blocked_by": t["blocked_by"],
            "parallel_group": group_of.get(t["id"], 1),
        })
    return steps


def is_plan_file(file_path: str) -> bool:
    """Check if a file path matches the plan pattern."""
    root = get_project_root()
    root_str = str(root)
    rel_path = file_path
    if file_path.startswith(root_str):
        rel_path = file_path[len(root_str):].lstrip("/")
    config = get_config()
    return fnmatch.fnmatch(rel_path, config.plan_pattern)
```

Then update the class to call these functions:

```python
class PlanTrackerHandler(BaseHandler):
    # ... _handle_write calls parse_plan_tasks(content) and compute_parallel_groups(tasks)
    # ... _handle_task_completed stays the same
    # Remove the @staticmethod _parse_tasks and _compute_parallel_groups methods
```

**Step 4: Run ALL tests to verify nothing broke**

Run: `uv run pytest tests/mc/test_mc_plan_sync.py::TestPlanParsingFunctions tests/mc/test_hook_factory.py -v --timeout=120`
Expected: All tests PASS (existing plan_tracker tests + new extraction tests)

**Step 5: Commit**

```bash
git add mc/hooks/handlers/plan_tracker.py tests/mc/test_mc_plan_sync.py
git commit -m "refactor(hooks): extract plan parsing as module-level functions for reuse"
```

---

### Task 3: Create MCPlanSyncHandler — MC Context Discovery

**Blocked by:** Task 1

**Files:**
- Create: `mc/hooks/handlers/mc_plan_sync.py`
- Test: `tests/mc/test_mc_plan_sync.py`

**Step 1: Write the failing tests**

Append to `tests/mc/test_mc_plan_sync.py`:

```python
# ---------------------------------------------------------------------------
# MC context discovery tests
# ---------------------------------------------------------------------------

class TestMCContextDiscovery:
    """Tests for _discover_mc_context in MCPlanSyncHandler."""

    def _make_handler(self, payload):
        from mc.hooks.handlers.mc_plan_sync import MCPlanSyncHandler
        from mc.hooks.context import HookContext
        ctx = HookContext("test-session")
        return MCPlanSyncHandler(ctx, payload)

    def test_returns_none_when_no_mcp_json_and_no_env(self, tmp_path):
        """No MC context available — should return None."""
        handler = self._make_handler({"cwd": str(tmp_path)})
        assert handler._discover_mc_context() is None

    def test_reads_mcp_json_from_cwd(self, tmp_path):
        """Discovers MC context from .mcp.json in cwd."""
        sock_path = str(tmp_path / "mc.sock")
        # Create a fake socket file so exists() check passes
        Path(sock_path).touch()

        mcp_config = {
            "mcpServers": {
                "nanobot": {
                    "command": "uv",
                    "args": ["run", "python", "-m", "claude_code.mcp_bridge"],
                    "env": {
                        "MC_SOCKET_PATH": sock_path,
                        "AGENT_NAME": "test-agent",
                        "TASK_ID": "task-123",
                    },
                }
            }
        }
        (tmp_path / ".mcp.json").write_text(json.dumps(mcp_config))

        handler = self._make_handler({"cwd": str(tmp_path)})
        mc_ctx = handler._discover_mc_context()
        assert mc_ctx is not None
        assert mc_ctx["socket_path"] == sock_path
        assert mc_ctx["agent_name"] == "test-agent"
        assert mc_ctx["task_id"] == "task-123"

    def test_env_var_takes_precedence(self, tmp_path):
        """MC_SOCKET_PATH env var is preferred over .mcp.json."""
        sock_path = str(tmp_path / "env.sock")
        Path(sock_path).touch()

        with patch.dict(os.environ, {
            "MC_SOCKET_PATH": sock_path,
            "AGENT_NAME": "env-agent",
            "TASK_ID": "env-task",
        }):
            handler = self._make_handler({"cwd": str(tmp_path)})
            mc_ctx = handler._discover_mc_context()
            assert mc_ctx is not None
            assert mc_ctx["socket_path"] == sock_path
            assert mc_ctx["agent_name"] == "env-agent"

    def test_returns_none_when_socket_file_missing(self, tmp_path):
        """Socket path in .mcp.json but file doesn't exist — no MC."""
        mcp_config = {
            "mcpServers": {
                "nanobot": {
                    "env": {
                        "MC_SOCKET_PATH": "/tmp/nonexistent.sock",
                        "AGENT_NAME": "agent",
                        "TASK_ID": "task",
                    },
                }
            }
        }
        (tmp_path / ".mcp.json").write_text(json.dumps(mcp_config))

        handler = self._make_handler({"cwd": str(tmp_path)})
        assert handler._discover_mc_context() is None
```

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/test_mc_plan_sync.py::TestMCContextDiscovery -v --timeout=30`
Expected: FAIL with `ModuleNotFoundError: No module named 'mc.hooks.handlers.mc_plan_sync'`

**Step 3: Write MCPlanSyncHandler with _discover_mc_context**

Create `mc/hooks/handlers/mc_plan_sync.py`:

```python
"""MC Plan Sync — reports plan detection and step completion to Mission Control.

Discovers MC connection from .mcp.json in the CC workspace, then uses
SyncIPCClient to call report_progress on the MC IPC server.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

from ..handler import BaseHandler

logger = logging.getLogger(__name__)


class MCPlanSyncHandler(BaseHandler):
    """Syncs plan events to Mission Control via IPC."""

    events = [("PostToolUse", "Write"), ("TaskCompleted", None)]

    def handle(self) -> str | None:
        mc_ctx = self._discover_mc_context()
        if not mc_ctx:
            return None  # Not in MC-managed session

        event = self.payload.get("hook_event_name", "")
        if event == "PostToolUse":
            return self._handle_plan_write(mc_ctx)
        elif event == "TaskCompleted":
            return self._handle_task_completed(mc_ctx)
        return None

    def _discover_mc_context(self) -> dict[str, Any] | None:
        """Try to find MC connection info from env vars or .mcp.json.

        Returns dict with socket_path, agent_name, task_id, or None.
        """
        # 1. Environment variables (explicit override)
        socket_path = os.environ.get("MC_SOCKET_PATH")
        if socket_path and Path(socket_path).exists():
            return {
                "socket_path": socket_path,
                "agent_name": os.environ.get("AGENT_NAME", "agent"),
                "task_id": os.environ.get("TASK_ID"),
            }

        # 2. Read .mcp.json from CC workspace (cwd)
        cwd = self.payload.get("cwd", "")
        if cwd:
            mcp_json = Path(cwd) / ".mcp.json"
            if mcp_json.is_file():
                try:
                    config = json.loads(mcp_json.read_text())
                    env = (
                        config
                        .get("mcpServers", {})
                        .get("nanobot", {})
                        .get("env", {})
                    )
                    sp = env.get("MC_SOCKET_PATH")
                    if sp and Path(sp).exists():
                        return {
                            "socket_path": sp,
                            "agent_name": env.get("AGENT_NAME", "agent"),
                            "task_id": env.get("TASK_ID"),
                        }
                except (json.JSONDecodeError, OSError):
                    pass

        return None

    def _handle_plan_write(self, mc_ctx: dict[str, Any]) -> str | None:
        # Placeholder — implemented in Task 4
        return None

    def _handle_task_completed(self, mc_ctx: dict[str, Any]) -> str | None:
        # Placeholder — implemented in Task 5
        return None
```

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/mc/test_mc_plan_sync.py::TestMCContextDiscovery -v --timeout=30`
Expected: 4 PASSED

**Step 5: Commit**

```bash
git add mc/hooks/handlers/mc_plan_sync.py tests/mc/test_mc_plan_sync.py
git commit -m "feat(hooks): add MCPlanSyncHandler with MC context discovery"
```

---

### Task 4: Implement Plan Write Sync

**Blocked by:** Task 1, Task 2, Task 3

**Files:**
- Modify: `mc/hooks/handlers/mc_plan_sync.py`
- Test: `tests/mc/test_mc_plan_sync.py`

**Step 1: Write the failing tests**

Append to `tests/mc/test_mc_plan_sync.py`:

```python
# ---------------------------------------------------------------------------
# Plan write sync tests
# ---------------------------------------------------------------------------

class TestPlanWriteSync:
    """Tests for _handle_plan_write in MCPlanSyncHandler."""

    def _make_handler(self, payload, tmp_path):
        from mc.hooks.handlers.mc_plan_sync import MCPlanSyncHandler
        from mc.hooks.context import HookContext
        ctx = HookContext("test-session")
        handler = MCPlanSyncHandler(ctx, payload)
        return handler

    def test_reports_plan_to_mc_via_ipc(self, tmp_path):
        """When a plan file is written, report_progress is called."""
        plan_content = (
            "# Plan\n\n"
            "### Task 1: Setup\n\nDo stuff\n\n"
            "### Task 2: Build\n\n**Blocked by:** Task 1\n"
        )
        payload = {
            "hook_event_name": "PostToolUse",
            "tool_name": "Write",
            "cwd": str(tmp_path),
            "session_id": "test-session",
            "tool_input": {
                "file_path": str(tmp_path / "docs" / "plans" / "my-plan.md"),
                "content": plan_content,
            },
        }
        handler = self._make_handler(payload, tmp_path)
        mc_ctx = {
            "socket_path": "/tmp/fake.sock",
            "agent_name": "test-agent",
            "task_id": "task-123",
        }

        ipc_calls = []

        def mock_request(method, params):
            ipc_calls.append((method, params))
            return {"status": "Progress reported"}

        with (
            patch("mc.hooks.handlers.mc_plan_sync.SyncIPCClient") as MockClient,
            patch("mc.hooks.handlers.mc_plan_sync.is_plan_file", return_value=True),
        ):
            MockClient.return_value.request = mock_request
            result = handler._handle_plan_write(mc_ctx)

        assert result is not None
        assert "2 tasks" in result
        assert len(ipc_calls) == 1
        assert ipc_calls[0][0] == "report_progress"
        assert "task-123" in str(ipc_calls[0][1].get("task_id", ""))

    def test_skips_non_plan_files(self, tmp_path):
        """Non-plan files are silently ignored."""
        payload = {
            "hook_event_name": "PostToolUse",
            "tool_name": "Write",
            "cwd": str(tmp_path),
            "session_id": "test-session",
            "tool_input": {
                "file_path": str(tmp_path / "src" / "main.py"),
                "content": "print('hello')",
            },
        }
        handler = self._make_handler(payload, tmp_path)
        mc_ctx = {"socket_path": "/tmp/fake.sock", "agent_name": "a", "task_id": "t"}

        with patch("mc.hooks.handlers.mc_plan_sync.is_plan_file", return_value=False):
            result = handler._handle_plan_write(mc_ctx)
        assert result is None

    def test_survives_ipc_failure(self, tmp_path):
        """IPC failure is non-fatal — returns None, doesn't raise."""
        plan_content = "### Task 1: Setup\n\nDo stuff\n"
        payload = {
            "hook_event_name": "PostToolUse",
            "tool_name": "Write",
            "cwd": str(tmp_path),
            "session_id": "test-session",
            "tool_input": {
                "file_path": str(tmp_path / "docs" / "plans" / "plan.md"),
                "content": plan_content,
            },
        }
        handler = self._make_handler(payload, tmp_path)
        mc_ctx = {"socket_path": "/tmp/fake.sock", "agent_name": "a", "task_id": "t"}

        with (
            patch("mc.hooks.handlers.mc_plan_sync.SyncIPCClient") as MockClient,
            patch("mc.hooks.handlers.mc_plan_sync.is_plan_file", return_value=True),
        ):
            MockClient.return_value.request.side_effect = ConnectionError("nope")
            result = handler._handle_plan_write(mc_ctx)

        # Should still return the summary (IPC failure is non-fatal)
        assert result is not None
        assert "1 task" in result
```

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/test_mc_plan_sync.py::TestPlanWriteSync -v --timeout=30`
Expected: FAIL (methods return None / missing imports)

**Step 3: Implement _handle_plan_write**

In `mc/hooks/handlers/mc_plan_sync.py`, add imports and implement the method:

```python
# Add at top of file, after existing imports:
from .plan_tracker import is_plan_file, parse_plan_tasks, compute_parallel_groups
from ..ipc_sync import SyncIPCClient
```

Replace the placeholder `_handle_plan_write`:

```python
    def _handle_plan_write(self, mc_ctx: dict[str, Any]) -> str | None:
        """Parse plan from written file and report structure to MC."""
        tool_input = self.payload.get("tool_input", {})
        file_path = tool_input.get("file_path", "")

        if not file_path or not is_plan_file(file_path):
            return None

        content = tool_input.get("content", "")
        if not content:
            try:
                content = Path(file_path).read_text()
            except OSError:
                return None

        tasks = parse_plan_tasks(content)
        if not tasks:
            return None

        steps = compute_parallel_groups(tasks)
        total = len(steps)

        # Build human-readable summary
        groups: dict[int, list[int]] = {}
        for s in steps:
            groups.setdefault(s["parallel_group"], []).append(s["id"])
        group_desc = ", ".join(
            f"group {g}: [{','.join(str(i) for i in ids)}]"
            for g, ids in sorted(groups.items())
        )
        task_word = "task" if total == 1 else "tasks"
        summary = f"Plan detected: {total} {task_word} in {len(groups)} parallel group(s). {group_desc}"

        # Report to MC (non-fatal)
        try:
            ipc = SyncIPCClient(mc_ctx["socket_path"])
            ipc.request("report_progress", {
                "message": summary,
                "agent_name": mc_ctx["agent_name"],
                "task_id": mc_ctx.get("task_id"),
            })
        except (ConnectionError, OSError) as exc:
            logger.debug("MC plan sync: IPC failed (non-fatal): %s", exc)

        return summary
```

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/mc/test_mc_plan_sync.py::TestPlanWriteSync -v --timeout=30`
Expected: 3 PASSED

**Step 5: Commit**

```bash
git add mc/hooks/handlers/mc_plan_sync.py tests/mc/test_mc_plan_sync.py
git commit -m "feat(hooks): implement plan write sync to MC via IPC"
```

---

### Task 5: Implement Task Completed Sync

**Blocked by:** Task 1, Task 3

**Files:**
- Modify: `mc/hooks/handlers/mc_plan_sync.py`
- Test: `tests/mc/test_mc_plan_sync.py`

**Step 1: Write the failing tests**

Append to `tests/mc/test_mc_plan_sync.py`:

```python
# ---------------------------------------------------------------------------
# Task completed sync tests
# ---------------------------------------------------------------------------

@pytest.fixture()
def tracker_setup(tmp_path):
    """Create a tracker JSON for task completion tests."""
    tracker_dir = tmp_path / ".claude" / "plan-tracker"
    tracker_dir.mkdir(parents=True)
    tracker = {
        "plan_file": "docs/plans/my-plan.md",
        "created_at": "2026-03-04T12:00:00Z",
        "steps": [
            {"id": 1, "name": "Setup", "order": 1, "status": "completed",
             "blocked_by": [], "parallel_group": 1},
            {"id": 2, "name": "Build API", "order": 2, "status": "pending",
             "blocked_by": [1], "parallel_group": 2},
            {"id": 3, "name": "Frontend", "order": 3, "status": "pending",
             "blocked_by": [1, 2], "parallel_group": 3},
        ],
    }
    tracker_path = tracker_dir / "my-plan.json"
    tracker_path.write_text(json.dumps(tracker, indent=2))
    return tmp_path, tracker_dir, tracker_path


class TestTaskCompletedSync:
    """Tests for _handle_task_completed in MCPlanSyncHandler."""

    def _make_handler(self, payload):
        from mc.hooks.handlers.mc_plan_sync import MCPlanSyncHandler
        from mc.hooks.context import HookContext
        ctx = HookContext("test-session")
        return MCPlanSyncHandler(ctx, payload)

    def test_reports_step_completion_to_mc(self, tracker_setup):
        """Completing a task reports progress via IPC."""
        tmp_path, tracker_dir, tracker_path = tracker_setup
        payload = {
            "hook_event_name": "TaskCompleted",
            "session_id": "test-session",
            "cwd": str(tmp_path),
            "task": {"subject": "Task 2: Build API"},
        }
        handler = self._make_handler(payload)
        mc_ctx = {"socket_path": "/tmp/fake.sock", "agent_name": "a", "task_id": "t"}

        ipc_calls = []

        def mock_request(method, params):
            ipc_calls.append((method, params))
            return {"status": "Progress reported"}

        from mc.hooks.config import HookConfig
        config = HookConfig(tracker_dir=".claude/plan-tracker")

        with (
            patch("mc.hooks.handlers.mc_plan_sync.SyncIPCClient") as MockClient,
            patch("mc.hooks.handlers.mc_plan_sync.get_project_root", return_value=tmp_path),
            patch("mc.hooks.handlers.mc_plan_sync.get_config", return_value=config),
        ):
            MockClient.return_value.request = mock_request
            result = handler._handle_task_completed(mc_ctx)

        assert result is not None
        assert "Build API" in result
        assert "2/3" in result
        assert len(ipc_calls) == 1
        assert ipc_calls[0][0] == "report_progress"

    def test_no_match_returns_none(self, tracker_setup):
        """Task that doesn't match any step is ignored."""
        tmp_path, _, _ = tracker_setup
        payload = {
            "hook_event_name": "TaskCompleted",
            "session_id": "test-session",
            "cwd": str(tmp_path),
            "task": {"subject": "Unrelated task"},
        }
        handler = self._make_handler(payload)
        mc_ctx = {"socket_path": "/tmp/fake.sock", "agent_name": "a", "task_id": "t"}

        from mc.hooks.config import HookConfig
        config = HookConfig(tracker_dir=".claude/plan-tracker")

        with (
            patch("mc.hooks.handlers.mc_plan_sync.get_project_root", return_value=tmp_path),
            patch("mc.hooks.handlers.mc_plan_sync.get_config", return_value=config),
        ):
            result = handler._handle_task_completed(mc_ctx)
        assert result is None

    def test_survives_ipc_failure_on_completion(self, tracker_setup):
        """IPC failure during step completion is non-fatal."""
        tmp_path, _, _ = tracker_setup
        payload = {
            "hook_event_name": "TaskCompleted",
            "session_id": "test-session",
            "cwd": str(tmp_path),
            "task": {"subject": "Task 2: Build API"},
        }
        handler = self._make_handler(payload)
        mc_ctx = {"socket_path": "/tmp/fake.sock", "agent_name": "a", "task_id": "t"}

        from mc.hooks.config import HookConfig
        config = HookConfig(tracker_dir=".claude/plan-tracker")

        with (
            patch("mc.hooks.handlers.mc_plan_sync.SyncIPCClient") as MockClient,
            patch("mc.hooks.handlers.mc_plan_sync.get_project_root", return_value=tmp_path),
            patch("mc.hooks.handlers.mc_plan_sync.get_config", return_value=config),
        ):
            MockClient.return_value.request.side_effect = ConnectionError("nope")
            result = handler._handle_task_completed(mc_ctx)

        # Summary still returned even if IPC fails
        assert result is not None
        assert "Build API" in result
```

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/test_mc_plan_sync.py::TestTaskCompletedSync -v --timeout=30`
Expected: FAIL (method returns None)

**Step 3: Implement _handle_task_completed**

In `mc/hooks/handlers/mc_plan_sync.py`, add imports and implement:

```python
# Add to imports at top:
from ..config import get_config, get_project_root
```

Replace the placeholder `_handle_task_completed`:

```python
    def _handle_task_completed(self, mc_ctx: dict[str, Any]) -> str | None:
        """Match completed task to a plan step and report progress to MC."""
        import re

        subject = (
            self.payload.get("task_subject", "")
            or self.payload.get("task", {}).get("subject", "")
        )
        if not subject:
            return None

        # Try numeric ID match
        m = re.search(r"Task\s+(\d+)", subject)
        task_id = int(m.group(1)) if m else None

        config = get_config()
        root = get_project_root()
        tracker_dir = root / config.tracker_dir

        if not tracker_dir.is_dir():
            return None

        for tracker_path in sorted(tracker_dir.glob("*.json")):
            try:
                data = json.loads(tracker_path.read_text())
            except (json.JSONDecodeError, OSError):
                continue

            matched_step = None
            for step in data.get("steps", []):
                if task_id is not None and step["id"] == task_id:
                    matched_step = step
                    break
                elif task_id is None and step["name"].lower() in subject.lower():
                    matched_step = step
                    break

            if matched_step is None or matched_step["status"] == "completed":
                continue

            # Build progress summary
            done_ids = {s["id"] for s in data["steps"] if s["status"] == "completed"}
            done_ids.add(matched_step["id"])  # Include this one
            total = len(data["steps"])
            done_count = len(done_ids)

            unblocked = []
            for s in data["steps"]:
                if (
                    s["status"] == "pending"
                    and s["id"] != matched_step["id"]
                    and s["blocked_by"]
                    and all(b in done_ids for b in s["blocked_by"])
                ):
                    unblocked.append(f"Task {s['id']}")

            summary = (
                f"Step {matched_step['id']} '{matched_step['name']}' completed. "
                f"Progress: {done_count}/{total} done."
            )
            if unblocked:
                summary += f" Now unblocked: {', '.join(unblocked)}"

            # Report to MC (non-fatal)
            try:
                ipc = SyncIPCClient(mc_ctx["socket_path"])
                ipc.request("report_progress", {
                    "message": summary,
                    "agent_name": mc_ctx["agent_name"],
                    "task_id": mc_ctx.get("task_id"),
                })
            except (ConnectionError, OSError) as exc:
                logger.debug("MC plan sync: IPC failed (non-fatal): %s", exc)

            return summary

        return None
```

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/mc/test_mc_plan_sync.py::TestTaskCompletedSync -v --timeout=30`
Expected: 3 PASSED

**Step 5: Commit**

```bash
git add mc/hooks/handlers/mc_plan_sync.py tests/mc/test_mc_plan_sync.py
git commit -m "feat(hooks): implement task completed sync to MC via IPC"
```

---

### Task 6: Full Integration Test + Verify All Tests Pass

**Blocked by:** Task 1, Task 2, Task 3, Task 4, Task 5

**Files:**
- Test: `tests/mc/test_mc_plan_sync.py`

**Step 1: Write integration test via dispatcher**

Append to `tests/mc/test_mc_plan_sync.py`:

```python
# ---------------------------------------------------------------------------
# Integration: full dispatch test
# ---------------------------------------------------------------------------

class TestMCPlanSyncIntegration:
    """End-to-end test through the dispatcher."""

    def test_plan_write_dispatches_to_both_handlers(self, tmp_path):
        """PostToolUse/Write dispatches to both PlanTracker AND MCPlanSync."""
        from mc.hooks.dispatcher import _dispatch
        from mc.hooks.config import HookConfig

        plan_content = "### Task 1: Setup\n\n### Task 2: Build\n\n**Blocked by:** Task 1\n"
        plans_dir = tmp_path / "docs" / "plans"
        plans_dir.mkdir(parents=True)
        tracker_dir = tmp_path / ".claude" / "plan-tracker"
        tracker_dir.mkdir(parents=True)
        state_dir = tmp_path / ".claude" / "hook-state"
        state_dir.mkdir(parents=True)

        config = HookConfig(
            plan_pattern="docs/plans/*.md",
            tracker_dir=".claude/plan-tracker",
            state_dir=".claude/hook-state",
        )

        payload = {
            "hook_event_name": "PostToolUse",
            "tool_name": "Write",
            "session_id": "integration-test",
            "cwd": str(tmp_path),
            "tool_input": {
                "file_path": str(tmp_path / "docs" / "plans" / "test-plan.md"),
                "content": plan_content,
            },
        }

        # MCPlanSync should detect no MC context and silently skip
        # PlanTracker should create the tracker JSON
        import mc.hooks.discovery as disc
        disc._cache = None  # Reset handler cache

        with (
            patch("mc.hooks.config.get_project_root", return_value=tmp_path),
            patch("mc.hooks.config.get_config", return_value=config),
            patch("mc.hooks.context.get_project_root", return_value=tmp_path),
            patch("mc.hooks.context.get_config", return_value=config),
            patch("mc.hooks.handlers.plan_tracker.get_project_root", return_value=tmp_path),
            patch("mc.hooks.handlers.plan_tracker.get_config", return_value=config),
            patch("mc.hooks.handlers.plan_capture.get_project_root", return_value=tmp_path),
            patch("mc.hooks.handlers.plan_capture.get_config", return_value=config),
        ):
            result = _dispatch(payload)

        # PlanTracker should have created a tracker file
        assert (tracker_dir / "test-plan.json").exists()
        # Result should contain PlanTracker output
        assert result is not None
        parsed = json.loads(result)
        assert "Plan tracker created" in parsed["hookSpecificOutput"]["additionalContext"]
```

**Step 2: Run all tests**

Run: `uv run pytest tests/mc/test_mc_plan_sync.py tests/mc/test_hook_factory.py -v --timeout=120`
Expected: ALL PASSED

**Step 3: Commit**

```bash
git add tests/mc/test_mc_plan_sync.py
git commit -m "test(hooks): add MC plan sync integration test"
```

---

### Task 7: Reset Discovery Cache in Tests

**Blocked by:** Task 6

**Files:**
- Modify: `tests/mc/test_mc_plan_sync.py`
- Modify: `mc/hooks/discovery.py`

This task handles a known issue: `discover_handlers()` uses a module-level `_cache`. When `mc_plan_sync.py` is added, the cache from `test_hook_factory.py` may not include it (or vice versa). Add a `reset_cache()` helper.

**Step 1: Add reset function to discovery.py**

```python
def reset_cache() -> None:
    """Reset the handler cache. Used in tests."""
    global _cache
    _cache = None
```

**Step 2: Use it in test fixtures**

Add `import mc.hooks.discovery as disc` to both test files, and call `disc.reset_cache()` at the start of any test that uses `_dispatch()`.

**Step 3: Run all tests**

Run: `uv run pytest tests/mc/test_mc_plan_sync.py tests/mc/test_hook_factory.py -v --timeout=120`
Expected: ALL PASSED

**Step 4: Commit**

```bash
git add mc/hooks/discovery.py tests/mc/test_mc_plan_sync.py tests/mc/test_hook_factory.py
git commit -m "fix(hooks): add discovery cache reset for test isolation"
```

---

## Verification Checklist

After all tasks complete:

1. `uv run pytest tests/mc/test_mc_plan_sync.py -v --timeout=60` — all new tests pass
2. `uv run pytest tests/mc/test_hook_factory.py -v --timeout=120` — existing tests still pass
3. `uv run pytest tests/mc/ -v --timeout=120` — no regressions in MC test suite
4. Manual check: `ls mc/hooks/handlers/` shows `mc_plan_sync.py` alongside existing handlers
5. Manual check: `ls mc/hooks/ipc_sync.py` exists
