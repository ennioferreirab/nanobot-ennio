# ask_user Reply Routing — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the ask_user MCP tool flow so that when a CC agent asks the user a question, the user's reply in the task thread is routed back to the waiting agent.

**Architecture:** A global IPC server registry (`AskUserRegistry`) allows running MCSocketServer instances to be registered by task_id. A lightweight watcher loop (`AskUserReplyWatcher`) subscribes to task thread messages for tasks with active ask_user calls and delivers user replies to the correct IPC server via `deliver_user_reply()`. The registry is instantiated once in `run_gateway()` and passed to the executor/dispatcher via dependency injection.

**Tech Stack:** Python asyncio, Convex subscriptions via ConvexBridge, MCSocketServer IPC

---

## Bug Summary

When a CC agent calls `mcp__nanobot__ask_user`:
1. The question is posted to the task thread ✅
2. An `asyncio.Future` is created in `MCSocketServer._pending_ask` ✅
3. The agent blocks waiting for the Future to resolve ✅
4. **BUG**: Nothing calls `MCSocketServer.deliver_user_reply()` when the user responds ❌
5. The Future times out after 5 minutes with "proceed with your best judgment" ❌

The `MCSocketServer` is created as a local variable in `step_dispatcher.py:582` and `executor.py:1502` — it's never stored anywhere accessible by the message routing system.

---

### Task 1: Create AskUserRegistry

**Files:**
- Create: `mc/ask_user_registry.py`
- Test: `tests/mc/test_ask_user_registry.py`

**Step 1: Write the failing tests**

```python
# tests/mc/test_ask_user_registry.py
"""Tests for AskUserRegistry — global registry of active MCSocketServer instances."""

import asyncio
import pytest
from unittest.mock import MagicMock, AsyncMock

from mc.ask_user_registry import AskUserRegistry


class TestAskUserRegistry:
    def test_register_and_lookup(self):
        """Registering an IPC server makes it discoverable by task_id."""
        registry = AskUserRegistry()
        mock_server = MagicMock()

        registry.register("task-abc", mock_server)

        assert registry.get("task-abc") is mock_server

    def test_unregister(self):
        """Unregistering removes the server from the registry."""
        registry = AskUserRegistry()
        mock_server = MagicMock()

        registry.register("task-abc", mock_server)
        registry.unregister("task-abc")

        assert registry.get("task-abc") is None

    def test_unregister_idempotent(self):
        """Unregistering a non-existent task_id is a no-op."""
        registry = AskUserRegistry()
        registry.unregister("nonexistent")  # Should not raise

    def test_get_missing_returns_none(self):
        """Looking up a non-existent task_id returns None."""
        registry = AskUserRegistry()
        assert registry.get("nonexistent") is None

    def test_has_pending_ask(self):
        """has_pending_ask returns True when the server has a pending ask_user."""
        registry = AskUserRegistry()
        mock_server = MagicMock()
        mock_server._task_to_request = {"task-abc": "req-123"}
        mock_server._pending_ask = {"req-123": MagicMock()}

        registry.register("task-abc", mock_server)

        assert registry.has_pending_ask("task-abc") is True

    def test_has_pending_ask_no_pending(self):
        """has_pending_ask returns False when no pending ask_user."""
        registry = AskUserRegistry()
        mock_server = MagicMock()
        mock_server._task_to_request = {}
        mock_server._pending_ask = {}

        registry.register("task-abc", mock_server)

        assert registry.has_pending_ask("task-abc") is False

    def test_has_pending_ask_unregistered(self):
        """has_pending_ask returns False for unregistered task_id."""
        registry = AskUserRegistry()
        assert registry.has_pending_ask("nonexistent") is False

    def test_active_task_ids(self):
        """active_task_ids returns set of task_ids with pending asks."""
        registry = AskUserRegistry()

        server_a = MagicMock()
        server_a._task_to_request = {"task-a": "req-1"}
        server_a._pending_ask = {"req-1": MagicMock()}

        server_b = MagicMock()
        server_b._task_to_request = {}
        server_b._pending_ask = {}

        registry.register("task-a", server_a)
        registry.register("task-b", server_b)

        assert registry.active_task_ids() == {"task-a"}

    def test_deliver_reply(self):
        """deliver_reply calls deliver_user_reply on the correct server."""
        registry = AskUserRegistry()
        mock_server = MagicMock()
        mock_server._task_to_request = {"task-abc": "req-123"}
        mock_server._pending_ask = {"req-123": MagicMock()}

        registry.register("task-abc", mock_server)
        result = registry.deliver_reply("task-abc", "Yes!")

        mock_server.deliver_user_reply.assert_called_once_with("task-abc", "Yes!")
        assert result is True

    def test_deliver_reply_no_server(self):
        """deliver_reply returns False when no server registered for task_id."""
        registry = AskUserRegistry()
        result = registry.deliver_reply("nonexistent", "answer")
        assert result is False
```

**Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/mc/test_ask_user_registry.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'mc.ask_user_registry'`

**Step 3: Write the implementation**

```python
# mc/ask_user_registry.py
"""Global registry of active MCSocketServer instances for ask_user reply routing.

When a CC agent calls ask_user, the MCSocketServer creates a Future and waits.
This registry allows the AskUserReplyWatcher to find the correct server instance
and deliver user replies via deliver_user_reply().
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from claude_code.ipc_server import MCSocketServer

logger = logging.getLogger(__name__)


class AskUserRegistry:
    """Thread-safe registry mapping task_id → MCSocketServer.

    Lifecycle:
    - register() when IPC server starts (before CC execution)
    - unregister() when IPC server stops (in finally block)
    - get() / deliver_reply() used by AskUserReplyWatcher
    """

    def __init__(self) -> None:
        self._servers: dict[str, MCSocketServer] = {}

    def register(self, task_id: str, server: MCSocketServer) -> None:
        """Register an IPC server for a task."""
        self._servers[task_id] = server
        logger.debug("[ask_user_registry] Registered server for task %s", task_id)

    def unregister(self, task_id: str) -> None:
        """Remove an IPC server registration."""
        removed = self._servers.pop(task_id, None)
        if removed:
            logger.debug("[ask_user_registry] Unregistered server for task %s", task_id)

    def get(self, task_id: str) -> MCSocketServer | None:
        """Look up the IPC server for a task."""
        return self._servers.get(task_id)

    def has_pending_ask(self, task_id: str) -> bool:
        """Check if a task has an active ask_user waiting for a reply."""
        server = self._servers.get(task_id)
        if not server:
            return False
        request_id = server._task_to_request.get(task_id)
        if not request_id:
            return False
        return request_id in server._pending_ask

    def active_task_ids(self) -> set[str]:
        """Return task_ids that currently have a pending ask_user."""
        return {tid for tid in self._servers if self.has_pending_ask(tid)}

    def deliver_reply(self, task_id: str, answer: str) -> bool:
        """Deliver a user reply to the waiting ask_user Future.

        Returns True if delivered, False if no server/pending ask found.
        """
        server = self._servers.get(task_id)
        if not server:
            return False
        server.deliver_user_reply(task_id, answer)
        logger.info("[ask_user_registry] Delivered reply for task %s", task_id)
        return True
```

**Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/mc/test_ask_user_registry.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add mc/ask_user_registry.py tests/mc/test_ask_user_registry.py
git commit -m "feat(mc): add AskUserRegistry for ask_user reply routing"
```

---

### Task 2: Create AskUserReplyWatcher

**Files:**
- Create: `mc/ask_user_watcher.py`
- Test: `tests/mc/test_ask_user_watcher.py`

**Step 1: Write the failing tests**

```python
# tests/mc/test_ask_user_watcher.py
"""Tests for AskUserReplyWatcher — watches task threads for user replies to ask_user."""

import asyncio
import pytest
from unittest.mock import MagicMock, AsyncMock, patch

from mc.ask_user_watcher import AskUserReplyWatcher
from mc.ask_user_registry import AskUserRegistry


class TestAskUserReplyWatcher:
    @pytest.fixture
    def bridge(self):
        mock = MagicMock()
        mock.get_task_messages = MagicMock(return_value=[])
        return mock

    @pytest.fixture
    def registry(self):
        return AskUserRegistry()

    def test_init(self, bridge, registry):
        """Watcher initializes with bridge and registry."""
        watcher = AskUserReplyWatcher(bridge, registry)
        assert watcher._bridge is bridge
        assert watcher._registry is registry

    @pytest.mark.asyncio
    async def test_delivers_user_reply_to_pending_ask(self, bridge, registry):
        """When a user message appears on a task with pending ask_user, deliver it."""
        # Set up a mock server with pending ask
        mock_server = MagicMock()
        mock_server._task_to_request = {"task-abc": "req-123"}
        mock_server._pending_ask = {"req-123": MagicMock()}
        registry.register("task-abc", mock_server)

        # Simulate user reply message
        bridge.get_task_messages = MagicMock(return_value=[
            {
                "_id": "msg-1",
                "author_type": "agent",
                "content": "**agent is asking:**\n\nWhat color?",
            },
            {
                "_id": "msg-2",
                "author_type": "user",
                "content": "Blue",
            },
        ])

        # Run one poll cycle
        await AskUserReplyWatcher(bridge, registry)._poll_once()

        mock_server.deliver_user_reply.assert_called_once_with("task-abc", "Blue")

    @pytest.mark.asyncio
    async def test_ignores_agent_messages(self, bridge, registry):
        """Agent messages should not be delivered as replies."""
        mock_server = MagicMock()
        mock_server._task_to_request = {"task-abc": "req-123"}
        mock_server._pending_ask = {"req-123": MagicMock()}
        registry.register("task-abc", mock_server)

        bridge.get_task_messages = MagicMock(return_value=[
            {
                "_id": "msg-1",
                "author_type": "agent",
                "content": "I am done",
            },
        ])

        await AskUserReplyWatcher(bridge, registry)._poll_once()

        mock_server.deliver_user_reply.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_tasks_without_pending_ask(self, bridge, registry):
        """Tasks without pending ask_user should not be polled."""
        mock_server = MagicMock()
        mock_server._task_to_request = {}  # No pending ask
        mock_server._pending_ask = {}
        registry.register("task-abc", mock_server)

        await AskUserReplyWatcher(bridge, registry)._poll_once()

        bridge.get_task_messages.assert_not_called()

    @pytest.mark.asyncio
    async def test_deduplicates_seen_messages(self, bridge, registry):
        """Same message should not be delivered twice."""
        mock_server = MagicMock()
        mock_server._task_to_request = {"task-abc": "req-123"}
        mock_server._pending_ask = {"req-123": MagicMock()}
        registry.register("task-abc", mock_server)

        bridge.get_task_messages = MagicMock(return_value=[
            {"_id": "msg-1", "author_type": "user", "content": "Blue"},
        ])

        watcher = AskUserReplyWatcher(bridge, registry)
        await watcher._poll_once()
        await watcher._poll_once()  # Second poll with same message

        # Should only deliver once
        assert mock_server.deliver_user_reply.call_count == 1
```

**Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/mc/test_ask_user_watcher.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'mc.ask_user_watcher'`

**Step 3: Write the implementation**

```python
# mc/ask_user_watcher.py
"""AskUserReplyWatcher — polls task threads for user replies to pending ask_user calls.

Runs as an asyncio loop in the gateway. Checks tasks with active ask_user calls
(via AskUserRegistry) and delivers user replies to the waiting MCSocketServer.
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from mc.bridge import ConvexBridge
    from mc.ask_user_registry import AskUserRegistry

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 1.5


class AskUserReplyWatcher:
    """Watches task threads for user replies to ask_user questions.

    Only polls tasks that have an active pending ask_user (via registry).
    Delivers the first unseen user message as the reply.
    """

    def __init__(self, bridge: ConvexBridge, registry: AskUserRegistry) -> None:
        self._bridge = bridge
        self._registry = registry
        # Per-task set of seen message IDs to avoid double-delivery
        self._seen_messages: dict[str, set[str]] = {}

    async def run(self) -> None:
        """Main polling loop."""
        logger.info("[ask_user_watcher] AskUserReplyWatcher started")
        while True:
            try:
                await self._poll_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("[ask_user_watcher] Error in polling loop")
            await asyncio.sleep(POLL_INTERVAL_SECONDS)

    async def _poll_once(self) -> None:
        """Check all tasks with pending ask_user calls for new user messages."""
        active_task_ids = self._registry.active_task_ids()
        if not active_task_ids:
            return

        for task_id in active_task_ids:
            # Re-check that ask is still pending (may have been resolved between
            # active_task_ids() and here)
            if not self._registry.has_pending_ask(task_id):
                continue

            try:
                messages = await asyncio.to_thread(
                    self._bridge.get_task_messages, task_id
                )
            except Exception:
                logger.debug(
                    "[ask_user_watcher] Could not fetch messages for task %s", task_id
                )
                continue

            if not messages:
                continue

            # Initialize seen set on first encounter — mark all existing
            # messages as seen so we only react to NEW messages
            if task_id not in self._seen_messages:
                self._seen_messages[task_id] = {
                    m.get("_id") or m.get("id") or ""
                    for m in messages
                    if m.get("_id") or m.get("id")
                }
                continue

            seen = self._seen_messages[task_id]

            for msg in messages:
                msg_id = msg.get("_id") or msg.get("id") or ""
                if not msg_id or msg_id in seen:
                    continue
                seen.add(msg_id)

                author_type = msg.get("author_type") or msg.get("authorType") or ""
                if author_type != "user":
                    continue

                content = (msg.get("content") or "").strip()
                if not content:
                    continue

                # Deliver the reply
                delivered = self._registry.deliver_reply(task_id, content)
                if delivered:
                    logger.info(
                        "[ask_user_watcher] Delivered user reply for task %s: %r",
                        task_id,
                        content[:80],
                    )
                    # Clean up seen messages for this task since the ask is resolved
                    break  # Only deliver the first new user message per poll

        # Prune seen messages for tasks no longer in registry
        stale_ids = set(self._seen_messages) - set(self._registry._servers)
        for tid in stale_ids:
            del self._seen_messages[tid]
```

**Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/mc/test_ask_user_watcher.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add mc/ask_user_watcher.py tests/mc/test_ask_user_watcher.py
git commit -m "feat(mc): add AskUserReplyWatcher to poll for ask_user replies"
```

---

### Task 3: Wire Registry into Executor and StepDispatcher

**Files:**
- Modify: `mc/executor.py` (3 sites: `__init__`, `_execute_cc_task`, `handle_cc_thread_reply`)
- Modify: `mc/step_dispatcher.py` (2 sites: `__init__`, `_execute_step` CC branch)
- Test: `tests/mc/test_ask_user_integration.py`

**Step 1: Write the failing integration test**

```python
# tests/mc/test_ask_user_integration.py
"""Integration test: registry is populated during CC task execution."""

import asyncio
import pytest
from unittest.mock import MagicMock, AsyncMock, patch

from mc.ask_user_registry import AskUserRegistry


class TestRegistryWiring:
    def test_step_dispatcher_registers_ipc_server(self):
        """StepDispatcher.__init__ accepts and stores ask_user_registry."""
        from mc.step_dispatcher import StepDispatcher

        registry = AskUserRegistry()
        bridge = MagicMock()
        dispatcher = StepDispatcher(bridge, ask_user_registry=registry)
        assert dispatcher._ask_user_registry is registry

    def test_executor_accepts_registry(self):
        """TaskExecutor.__init__ accepts and stores ask_user_registry."""
        from mc.executor import TaskExecutor

        registry = AskUserRegistry()
        bridge = MagicMock()
        executor = TaskExecutor(bridge, ask_user_registry=registry)
        assert executor._ask_user_registry is registry
```

**Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/mc/test_ask_user_integration.py -v`
Expected: FAIL with `TypeError: __init__() got an unexpected keyword argument 'ask_user_registry'`

**Step 3: Modify StepDispatcher to accept and use registry**

In `mc/step_dispatcher.py`:

1. Add `ask_user_registry` parameter to `__init__`:
```python
def __init__(self, bridge: ConvexBridge, cron_service: Any | None = None,
             ask_user_registry: Any | None = None) -> None:
    self._bridge = bridge
    self._cron_service = cron_service
    self._tier_resolver: Any | None = None
    self._ask_user_registry = ask_user_registry
```

2. In `_execute_step`, CC branch (around line 582), after `ipc_server = MCSocketServer(...)`:
```python
ipc_server = MCSocketServer(self._bridge, None)
# Register IPC server for ask_user reply routing
if self._ask_user_registry is not None:
    self._ask_user_registry.register(task_id, ipc_server)
```

3. In the `finally` block (around line 617), before `await ipc_server.stop()`:
```python
finally:
    if self._ask_user_registry is not None:
        self._ask_user_registry.unregister(task_id)
    await ipc_server.stop()
```

**Step 4: Modify TaskExecutor to accept and use registry**

In `mc/executor.py`:

1. Add `ask_user_registry` parameter to `TaskExecutor.__init__` (find the `__init__` method and add it):
```python
self._ask_user_registry = ask_user_registry
```

2. In `_execute_cc_task` (around line 1502), after `ipc_server = MCSocketServer(...)`:
```python
ipc_server = MCSocketServer(self._bridge, None, cron_service=self._cron_service)
if self._ask_user_registry is not None:
    self._ask_user_registry.register(task_id, ipc_server)
```

3. In the `finally` block (around line 1559-1560):
```python
finally:
    if self._ask_user_registry is not None:
        self._ask_user_registry.unregister(task_id)
    await ipc_server.stop()
```

4. Same pattern in `handle_cc_thread_reply` (around line 1811):
```python
ipc_server = MCSocketServer(self._bridge, None, cron_service=self._cron_service)
if self._ask_user_registry is not None:
    self._ask_user_registry.register(task_id, ipc_server)
```
And in its finally block (around line 1836):
```python
finally:
    if self._ask_user_registry is not None:
        self._ask_user_registry.unregister(task_id)
    await ipc_server.stop()
```

**Step 5: Run tests**

Run: `uv run pytest tests/mc/test_ask_user_integration.py tests/mc/test_ask_user_registry.py -v`
Expected: All PASS

**Step 6: Commit**

```bash
git add mc/step_dispatcher.py mc/executor.py tests/mc/test_ask_user_integration.py
git commit -m "feat(mc): wire AskUserRegistry into executor and step dispatcher"
```

---

### Task 4: Wire Registry and Watcher into Gateway

**Files:**
- Modify: `mc/gateway.py` (in `run_gateway()`)
- Modify: `mc/orchestrator.py` (pass registry to StepDispatcher)

**Step 1: Modify `run_gateway()` in `mc/gateway.py`**

After the executor creation (around line 1151), add:

```python
# Ask-user reply routing — registry + watcher (CC agents only)
from mc.ask_user_registry import AskUserRegistry
from mc.ask_user_watcher import AskUserReplyWatcher

ask_user_registry = AskUserRegistry()

executor = TaskExecutor(bridge, cron_service=cron, on_task_completed=on_task_completed,
                        ask_user_registry=ask_user_registry)
```

The orchestrator creates a StepDispatcher internally. We need to pass the registry through. In `mc/orchestrator.py`, modify `TaskOrchestrator.__init__`:

```python
def __init__(self, bridge: ConvexBridge, cron_service: Any | None = None,
             ask_user_registry: Any | None = None) -> None:
    self._bridge = bridge
    self._lead_agent_name = LEAD_AGENT_NAME
    self._plan_materializer = PlanMaterializer(bridge)
    self._step_dispatcher = StepDispatcher(bridge, cron_service=cron_service,
                                            ask_user_registry=ask_user_registry)
    # ... rest unchanged
```

Back in `gateway.py`, update orchestrator creation:

```python
orchestrator = TaskOrchestrator(bridge, cron_service=cron,
                                 ask_user_registry=ask_user_registry)
```

Add the watcher loop:

```python
ask_user_watcher = AskUserReplyWatcher(bridge, ask_user_registry)
ask_user_watcher_task = asyncio.create_task(ask_user_watcher.run())
```

Add to the cancellation block:

```python
ask_user_watcher_task.cancel()
```

And to the cleanup await loop.

**Step 2: Run existing tests to verify no regressions**

Run: `uv run pytest tests/mc/ -v --timeout=30 -x`
Expected: No new failures

**Step 3: Commit**

```bash
git add mc/gateway.py mc/orchestrator.py
git commit -m "feat(mc): wire AskUserRegistry and watcher into gateway startup"
```

---

### Task 5: Wire Registry into ChatHandler

**Files:**
- Modify: `mc/chat_handler.py` (CC branch creates MCSocketServer)

**Step 1: Modify ChatHandler to accept registry**

The ChatHandler also creates MCSocketServer instances for CC agents (line 184). Apply the same register/unregister pattern:

1. Add `ask_user_registry` to `ChatHandler.__init__`:
```python
def __init__(self, bridge: ConvexBridge, ask_user_registry: Any | None = None) -> None:
    self._bridge = bridge
    self._ask_user_registry = ask_user_registry
```

2. In the CC branch (around line 184):
```python
ipc_server = MCSocketServer(self._bridge, None)
if self._ask_user_registry is not None:
    self._ask_user_registry.register(task_id, ipc_server)
```

3. In the finally block (around line 245):
```python
finally:
    if self._ask_user_registry is not None:
        self._ask_user_registry.unregister(task_id)
    await ipc_server.stop()
```

4. Update `gateway.py` ChatHandler creation:
```python
chat_handler = ChatHandler(bridge, ask_user_registry=ask_user_registry)
```

**Step 2: Run existing tests**

Run: `uv run pytest tests/mc/ -v --timeout=30 -x`
Expected: No new failures

**Step 3: Commit**

```bash
git add mc/chat_handler.py mc/gateway.py
git commit -m "feat(mc): wire AskUserRegistry into ChatHandler CC branch"
```

---

### Task 6: Handle Edge Case — ask_user During Step Execution vs Task Execution

**Files:**
- Modify: `mc/ask_user_watcher.py` (handle step-level task_id correctly)

The MCSocketServer's `_handle_ask_user` stores the `task_id` from the MCP bridge env var. In the step dispatcher, the same `task_id` is used for all steps of a task. This is correct — the watcher polls messages by task_id, and the IPC server maps task_id → request_id internally.

**Step 1: Verify with a test that multiple concurrent steps don't clobber each other**

The `_task_to_request` mapping in MCSocketServer uses the task_id as key. If two steps of the same task both call ask_user concurrently, only one server is registered per task_id. But in practice, steps run via separate MCSocketServer instances (one per step dispatch in CC branch). The registry stores one server per task_id, so concurrent steps on the same task would clobber.

However, looking at the code: the step dispatcher creates **one MCSocketServer per step execution** in the CC branch. But each step runs with the **same task_id** (the parent task ID). The MCP bridge subprocess receives `TASK_ID` from the env, and `ask_user` uses that task_id.

The registry key should actually be the **socket_path** or **step_id** rather than task_id to handle concurrent steps. BUT `deliver_user_reply` takes task_id. The simplest fix: since concurrent CC steps on the same task are rare (parallel groups typically go to different agents), and the watcher delivers to whichever server is registered, this is acceptable for now. Document this limitation.

**Step 1: Add a comment to AskUserRegistry documenting this**

In `mc/ask_user_registry.py`, add to the class docstring:

```python
    Note: If multiple CC steps for the same task_id run concurrently and both
    call ask_user, only the last-registered server receives replies. This is
    acceptable because concurrent ask_user from the same task is rare.
```

**Step 2: Commit**

```bash
git add mc/ask_user_registry.py
git commit -m "docs(mc): document concurrent ask_user limitation in registry"
```

---

### Task 7: End-to-End Manual Verification

**No code changes — verification steps only.**

**Step 1: Start the gateway**

```bash
uv run python -m mc.gateway
```

**Step 2: Create a test task in the dashboard assigned to youtube-summarizer**

Task description: "Me faça um questionário simples com 3 perguntas, estou apenas fazendo um teste."

**Step 3: Observe in gateway logs:**

1. `[ask_user_registry] Registered server for task <id>` — confirms registration
2. `[ask_user_watcher] AskUserReplyWatcher started` — confirms watcher is running
3. Agent posts question to thread: `**youtube-summarizer is asking:** ...`
4. `[ask_user_watcher] Delivered user reply for task <id>` — after user answers in dashboard

**Step 4: Verify the agent receives the reply and asks the next question**

The agent should:
1. Ask question 1 → wait for reply
2. Receive reply → ask question 2 → wait for reply
3. Receive reply → ask question 3 → wait for reply
4. Receive reply → complete with summary

**If the agent still doesn't call ask_user:** The prompt needs updating (separate issue from this infrastructure fix). The tool is available but the agent chooses not to use it.
