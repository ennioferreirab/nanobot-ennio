# Fix pytest Memory Leak & Stuck Processes

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent pytest processes from leaking memory (40GB+) and becoming unkillable stuck processes.

**Architecture:** Three defensive layers: (1) pytest-timeout as a hard safety net, (2) lazy asyncio.Queue initialization in MessageBus to fix the event-loop root cause, (3) cleanup of stale test file and addition of asyncio cleanup fixtures.

**Tech Stack:** Python, pytest, pytest-timeout, asyncio, uv

---

### Task 1: Add pytest-timeout as safety net

**Files:**
- Modify: `pyproject.toml:50-54` (dev deps) and `pyproject.toml:96-98` (pytest config)

**Step 1: Add pytest-timeout dependency**

In `pyproject.toml`, add `pytest-timeout` to the dev dependencies:

```toml
[project.optional-dependencies]
dev = [
    "pytest>=9.0.0,<10.0.0",
    "pytest-asyncio>=1.3.0,<2.0.0",
    "pytest-timeout>=2.3.0,<3.0.0",
    "ruff>=0.1.0",
]
```

Also add it to the `[dependency-groups]` dev section:

```toml
[dependency-groups]
dev = [
    "pytest-asyncio>=1.3.0",
    "pytest-timeout>=2.3.0",
]
```

**Step 2: Configure global timeout in pytest options**

In `pyproject.toml`, update `[tool.pytest.ini_options]`:

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
timeout = 60
```

**Step 3: Install the new dependency**

Run: `uv sync --group dev`
Expected: resolves and installs pytest-timeout

**Step 4: Verify timeout works**

Run: `uv run pytest tests/mc/test_task_state_machine.py -v --timeout=5`
Expected: PASS (tests complete well under 5s)

**Step 5: Commit**

```bash
git add pyproject.toml uv.lock
git commit -m "fix: add pytest-timeout to prevent stuck test processes

Adds a 60-second global timeout for all tests. Previously, stuck tests
could run indefinitely, leaking 40GB+ of RAM and becoming unkillable."
```

---

### Task 2: Fix MessageBus lazy queue initialization

**Files:**
- Modify: `nanobot/bus/queue.py:16-18`
- Test: `tests/mc/test_message_bus.py` (create)

**Step 1: Write the failing test**

Create `tests/mc/test_message_bus.py`:

```python
"""Tests for MessageBus lazy queue initialization."""

import asyncio

import pytest

from nanobot.bus.queue import MessageBus


class TestMessageBusInit:
    """MessageBus can be created outside an async context."""

    def test_create_without_event_loop(self) -> None:
        """MessageBus() should not require a running event loop."""
        bus = MessageBus()
        assert bus is not None

    def test_queues_not_created_on_init(self) -> None:
        """Queues should be lazily created, not in __init__."""
        bus = MessageBus()
        # Internal attrs should be None before first async access
        assert bus._inbound is None
        assert bus._outbound is None

    @pytest.mark.asyncio
    async def test_inbound_queue_created_on_access(self) -> None:
        """Inbound queue is created on first async access."""
        bus = MessageBus()
        assert bus._inbound is None
        # Access via property triggers creation
        q = bus.inbound
        assert isinstance(q, asyncio.Queue)

    @pytest.mark.asyncio
    async def test_outbound_queue_created_on_access(self) -> None:
        """Outbound queue is created on first async access."""
        bus = MessageBus()
        assert bus._outbound is None
        q = bus.outbound
        assert isinstance(q, asyncio.Queue)

    @pytest.mark.asyncio
    async def test_queue_reused_on_subsequent_access(self) -> None:
        """Same queue instance returned on repeated access."""
        bus = MessageBus()
        q1 = bus.inbound
        q2 = bus.inbound
        assert q1 is q2

    @pytest.mark.asyncio
    async def test_publish_consume_roundtrip(self) -> None:
        """Messages flow through the bus correctly with lazy init."""
        from nanobot.bus.events import InboundMessage

        bus = MessageBus()
        msg = InboundMessage(
            channel="test",
            chat_id="c1",
            sender="user",
            content="hello",
        )
        await bus.publish_inbound(msg)
        received = await bus.consume_inbound()
        assert received.content == "hello"

    @pytest.mark.asyncio
    async def test_qsize_works_before_and_after_init(self) -> None:
        """Queue size properties work with lazy initialization."""
        bus = MessageBus()
        assert bus.inbound_size == 0
        assert bus.outbound_size == 0
```

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/test_message_bus.py -v`
Expected: FAIL (at least `test_queues_not_created_on_init` fails because queues are eagerly created)

**Step 3: Implement lazy queue initialization**

Replace `nanobot/bus/queue.py` content with:

```python
"""Async message queue for decoupled channel-agent communication."""

import asyncio

from nanobot.bus.events import InboundMessage, OutboundMessage


class MessageBus:
    """
    Async message bus that decouples chat channels from the agent core.

    Channels push messages to the inbound queue, and the agent processes
    them and pushes responses to the outbound queue.

    Queues are lazily created on first access to avoid requiring a running
    event loop at instantiation time.
    """

    def __init__(self):
        self._inbound: asyncio.Queue[InboundMessage] | None = None
        self._outbound: asyncio.Queue[OutboundMessage] | None = None

    @property
    def inbound(self) -> asyncio.Queue[InboundMessage]:
        if self._inbound is None:
            self._inbound = asyncio.Queue()
        return self._inbound

    @property
    def outbound(self) -> asyncio.Queue[OutboundMessage]:
        if self._outbound is None:
            self._outbound = asyncio.Queue()
        return self._outbound

    async def publish_inbound(self, msg: InboundMessage) -> None:
        """Publish a message from a channel to the agent."""
        await self.inbound.put(msg)

    async def consume_inbound(self) -> InboundMessage:
        """Consume the next inbound message (blocks until available)."""
        return await self.inbound.get()

    async def publish_outbound(self, msg: OutboundMessage) -> None:
        """Publish a response from the agent to channels."""
        await self.outbound.put(msg)

    async def consume_outbound(self) -> OutboundMessage:
        """Consume the next outbound message (blocks until available)."""
        return await self.outbound.get()

    @property
    def inbound_size(self) -> int:
        """Number of pending inbound messages."""
        if self._inbound is None:
            return 0
        return self._inbound.qsize()

    @property
    def outbound_size(self) -> int:
        """Number of pending outbound messages."""
        if self._outbound is None:
            return 0
        return self._outbound.qsize()
```

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/mc/test_message_bus.py -v`
Expected: ALL PASS

**Step 5: Run full test suite to verify no regressions**

Run: `uv run pytest tests/mc/ -v --timeout=60`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add nanobot/bus/queue.py tests/mc/test_message_bus.py
git commit -m "fix: lazy asyncio.Queue init in MessageBus

Queues are now created on first access instead of in __init__().
This prevents event loop leaks when MessageBus is instantiated
outside an async context (e.g., during test collection)."
```

---

### Task 3: Remove stale test file and add asyncio cleanup

**Files:**
- Delete: `nanobot/mc/test_gateway.py` (stale copy with deprecated asyncio patterns)

**Step 1: Verify the stale file is not imported anywhere**

Run: `grep -rn "nanobot.mc.test_gateway\|from nanobot.mc import test_gateway" . --include="*.py"`
Expected: No matches (file is standalone, not imported)

**Step 2: Verify proper tests exist in tests/mc/**

Run: `wc -l tests/mc/test_gateway.py nanobot/mc/test_gateway.py`
Expected: tests/mc/test_gateway.py is much larger (57KB vs 20KB) — the proper version

**Step 3: Delete the stale file**

```bash
rm nanobot/mc/test_gateway.py
```

**Step 4: Run full test suite to confirm no breakage**

Run: `uv run pytest tests/mc/ -v --timeout=60`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add -A nanobot/mc/test_gateway.py
git commit -m "chore: remove stale nanobot/mc/test_gateway.py

This file was a legacy copy using deprecated asyncio.get_event_loop()
patterns. The proper tests live at tests/mc/test_gateway.py."
```

---

### Task 4: Verify the full fix end-to-end

**Step 1: Run all tests with timeout**

Run: `uv run pytest tests/mc/ -v --timeout=60`
Expected: ALL PASS, no hangs, completes within 60 seconds

**Step 2: Verify no stuck python processes remain**

Run: `ps aux | grep pytest | grep -v grep`
Expected: No orphaned pytest processes

**Step 3: Check memory usage**

Run: `top -l 1 -o mem -n 5 | grep python`
Expected: No python processes using excessive memory
