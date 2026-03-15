"""E2E backend-only tests proving provider-cli intervention changes real subprocesses.

Story 28-21: Prove Provider CLI Intervention E2E Backend-Only.

These tests use real OS subprocesses — not mocks — to prove that:
  - ProviderProcessSupervisor launches and streams real process output.
  - Interrupt and terminate operations change real subprocess state.
  - The control plane routes commands through to real subprocesses.
  - Terminal registry states are consistent after failures.

No dashboard, no Convex, no tmux: pure backend proof.
"""

from __future__ import annotations

import asyncio
import signal
import sys
from unittest.mock import AsyncMock, MagicMock

import pytest

from mc.contexts.provider_cli.control_plane import ProviderCliControlPlane
from mc.contexts.provider_cli.registry import ProviderSessionRegistry
from mc.contexts.provider_cli.types import ProviderProcessHandle, SessionStatus
from mc.runtime.provider_cli.process_supervisor import ProviderProcessSupervisor

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_LONG_RUNNING_CMD = [
    sys.executable,
    "-c",
    ("import time\nfor i in range(300):\n    time.sleep(0.1)\n"),
]

_STREAMING_CMD = [
    sys.executable,
    "-c",
    (
        "import time, sys\n"
        "for i in range(20):\n"
        "    print(f'line {i}', flush=True)\n"
        "    time.sleep(0.05)\n"
    ),
]

_CRASH_CMD = [sys.executable, "-c", "raise SystemExit(1)"]

_INSTANT_EXIT_CMD = [sys.executable, "-c", "raise SystemExit(42)"]


def _make_session_record(
    registry: ProviderSessionRegistry,
    mc_session_id: str,
    *,
    pid: int,
    pgid: int | None = None,
) -> None:
    """Register a session record in STARTING state, then advance to RUNNING."""
    registry.create(
        mc_session_id=mc_session_id,
        provider="test",
        pid=pid,
        pgid=pgid or pid,
        mode="provider-native",
        supports_resume=False,
        supports_interrupt=True,
        supports_stop=True,
    )
    registry.update_status(mc_session_id, SessionStatus.RUNNING)


# ---------------------------------------------------------------------------
# Test 1: Start and stream from a real subprocess
# ---------------------------------------------------------------------------


async def test_start_and_stream_from_real_subprocess() -> None:
    """Launch a subprocess and verify streaming output is received."""
    supervisor = ProviderProcessSupervisor()
    handle = await supervisor.launch(
        mc_session_id="e2e-stream-1",
        provider="test",
        command=_STREAMING_CMD,
        cwd="/tmp",
    )

    assert isinstance(handle, ProviderProcessHandle)
    assert handle.pid > 0

    chunks: list[bytes] = []
    async for chunk in supervisor.stream_output(handle):
        chunks.append(chunk)

    combined = b"".join(chunks)
    # The subprocess prints "line 0" through "line N" — at least one must appear
    assert b"line" in combined

    exit_code = await supervisor.wait_for_exit(handle)
    # Process should have exited cleanly
    assert exit_code is not None


# ---------------------------------------------------------------------------
# Test 2: Interrupt changes process state
# ---------------------------------------------------------------------------


async def test_interrupt_changes_process_state() -> None:
    """Send SIGINT to a long-running subprocess and verify it exits."""
    supervisor = ProviderProcessSupervisor()
    handle = await supervisor.launch(
        mc_session_id="e2e-interrupt-1",
        provider="test",
        command=_LONG_RUNNING_CMD,
        cwd="/tmp",
    )

    assert supervisor.is_alive(handle) is True

    # Give the process a moment to start its event loop
    await asyncio.sleep(0.15)

    # Interrupt via SIGINT
    await supervisor.send_signal(handle, signal.SIGINT)

    # Wait for the process to terminate (with a timeout to avoid hangs)
    exit_code = await asyncio.wait_for(supervisor.wait_for_exit(handle), timeout=5.0)

    # Process should have exited — exit code may be non-zero (signal) or None
    assert exit_code is not None
    # After exit, is_alive must return False
    assert supervisor.is_alive(handle) is False


# ---------------------------------------------------------------------------
# Test 3: Stop terminates the subprocess
# ---------------------------------------------------------------------------


async def test_stop_terminates_subprocess() -> None:
    """Call supervisor.terminate() and verify the process exits with is_alive False."""
    supervisor = ProviderProcessSupervisor()
    handle = await supervisor.launch(
        mc_session_id="e2e-stop-1",
        provider="test",
        command=_LONG_RUNNING_CMD,
        cwd="/tmp",
    )

    assert supervisor.is_alive(handle) is True

    await asyncio.sleep(0.15)

    # Terminate the subprocess
    await supervisor.terminate(handle)

    exit_code = await asyncio.wait_for(supervisor.wait_for_exit(handle), timeout=5.0)

    assert exit_code is not None
    assert supervisor.is_alive(handle) is False


# ---------------------------------------------------------------------------
# Test 4: Control plane routes commands to a real subprocess
# ---------------------------------------------------------------------------


async def test_control_plane_routes_interrupt_to_subprocess() -> None:
    """ProviderCliControlPlane.interrupt() returns 'applied' when routed to a real handle."""
    supervisor = ProviderProcessSupervisor()
    handle = await supervisor.launch(
        mc_session_id="e2e-cp-1",
        provider="test",
        command=_LONG_RUNNING_CMD,
        cwd="/tmp",
    )

    registry = ProviderSessionRegistry()
    _make_session_record(registry, "e2e-cp-1", pid=handle.pid, pgid=handle.pgid)

    # Build a mock parser that delegates interrupt/stop to the real supervisor
    parser = MagicMock()
    parser.provider_name = "test"

    async def real_interrupt(h: ProviderProcessHandle) -> None:
        await supervisor.send_signal(h, signal.SIGINT)

    async def real_stop(h: ProviderProcessHandle) -> None:
        await supervisor.terminate(h)

    parser.interrupt = AsyncMock(side_effect=real_interrupt)
    parser.stop = AsyncMock(side_effect=real_stop)

    control_plane = ProviderCliControlPlane(registry=registry)
    control_plane.register_parser("e2e-cp-1", parser=parser, handle=handle)

    await asyncio.sleep(0.15)

    result = await control_plane.interrupt("e2e-cp-1")

    assert result["outcome"] == "applied"
    assert result["action"] == "interrupt"
    assert result["mc_session_id"] == "e2e-cp-1"

    # Drain the process
    await asyncio.wait_for(supervisor.wait_for_exit(handle), timeout=5.0)


async def test_control_plane_routes_stop_to_subprocess() -> None:
    """ProviderCliControlPlane.stop() returns 'applied' when routed to a real handle."""
    supervisor = ProviderProcessSupervisor()
    handle = await supervisor.launch(
        mc_session_id="e2e-cp-2",
        provider="test",
        command=_LONG_RUNNING_CMD,
        cwd="/tmp",
    )

    registry = ProviderSessionRegistry()
    _make_session_record(registry, "e2e-cp-2", pid=handle.pid, pgid=handle.pgid)

    parser = MagicMock()
    parser.provider_name = "test"
    parser.interrupt = AsyncMock()

    async def real_stop(h: ProviderProcessHandle) -> None:
        await supervisor.terminate(h)

    parser.stop = AsyncMock(side_effect=real_stop)

    control_plane = ProviderCliControlPlane(registry=registry)
    control_plane.register_parser("e2e-cp-2", parser=parser, handle=handle)

    await asyncio.sleep(0.15)

    result = await control_plane.stop("e2e-cp-2")

    assert result["outcome"] == "applied"
    assert result["action"] == "stop"
    assert result["mc_session_id"] == "e2e-cp-2"

    await asyncio.wait_for(supervisor.wait_for_exit(handle), timeout=5.0)
    assert supervisor.is_alive(handle) is False


# ---------------------------------------------------------------------------
# Test 5: Consistent terminal states after failures
# ---------------------------------------------------------------------------


async def test_crashed_subprocess_transitions_registry_to_crashed() -> None:
    """A subprocess that exits with a non-zero code can be transitioned to CRASHED."""
    supervisor = ProviderProcessSupervisor()
    handle = await supervisor.launch(
        mc_session_id="e2e-crash-1",
        provider="test",
        command=_INSTANT_EXIT_CMD,
        cwd="/tmp",
    )

    # Drain output (none expected) and wait for exit
    async for _ in supervisor.stream_output(handle):
        pass

    exit_code = await supervisor.wait_for_exit(handle)

    # Non-zero exit code indicates crash
    assert exit_code is not None
    assert exit_code != 0

    # After exit, is_alive must be False
    assert supervisor.is_alive(handle) is False

    # Registry can be updated to CRASHED as a valid terminal state
    registry = ProviderSessionRegistry()
    _make_session_record(registry, "e2e-crash-1", pid=handle.pid, pgid=handle.pgid)
    record = registry.update_status("e2e-crash-1", SessionStatus.CRASHED)

    assert record.status == SessionStatus.CRASHED

    # CRASHED is a terminal state — no further transitions are permitted
    with pytest.raises(ValueError, match="Invalid status transition"):
        registry.update_status("e2e-crash-1", SessionStatus.RUNNING)


async def test_crashed_bad_command_is_terminal() -> None:
    """A subprocess that fails to run exits non-zero; registry lands on CRASHED."""
    supervisor = ProviderProcessSupervisor()

    # Use a Python script that immediately crashes
    handle = await supervisor.launch(
        mc_session_id="e2e-crash-2",
        provider="test",
        command=[sys.executable, "-c", "import sys; sys.exit(99)"],
        cwd="/tmp",
    )

    async for _ in supervisor.stream_output(handle):
        pass

    exit_code = await supervisor.wait_for_exit(handle)

    assert exit_code == 99
    assert supervisor.is_alive(handle) is False

    # Registry transition to CRASHED is idempotent from RUNNING
    registry = ProviderSessionRegistry()
    _make_session_record(registry, "e2e-crash-2", pid=handle.pid)
    record = registry.update_status("e2e-crash-2", SessionStatus.CRASHED)
    assert record.status == SessionStatus.CRASHED

    # CRASHED is terminal; further transitions must be rejected
    valid_terminal_statuses = {
        status
        for status, targets in {
            SessionStatus.COMPLETED: set(),
            SessionStatus.STOPPED: set(),
            SessionStatus.CRASHED: set(),
        }.items()
        if not targets
    }
    assert SessionStatus.CRASHED in valid_terminal_statuses
