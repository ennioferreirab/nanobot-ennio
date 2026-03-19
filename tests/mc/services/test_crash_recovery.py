"""Tests for CrashRecoveryService — always crash, no auto-retry."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from mc.contexts.execution.crash_recovery import CrashRecoveryService


@pytest.fixture
def bridge() -> MagicMock:
    """Create a mock ConvexBridge."""
    b = MagicMock()
    b.update_task_status = MagicMock()
    b.send_message = MagicMock()
    return b


@pytest.fixture
def service(bridge: MagicMock) -> CrashRecoveryService:
    """Create a CrashRecoveryService instance."""
    return CrashRecoveryService(bridge=bridge)


class TestCrashRecoveryInit:
    """Verify constructor."""

    def test_stores_bridge(self, bridge: MagicMock) -> None:
        svc = CrashRecoveryService(bridge=bridge)
        assert svc._bridge is bridge


class TestHandleAgentCrash:
    """Test handle_agent_crash — always marks as crashed."""

    @pytest.mark.asyncio
    async def test_crash_marks_as_crashed(
        self, service: CrashRecoveryService, bridge: MagicMock
    ) -> None:
        """Crash transitions directly to crashed."""
        error = RuntimeError("Agent crashed")
        await service.handle_agent_crash("test-agent", "task-1", error)

        bridge.update_task_status.assert_called_once()
        call = bridge.update_task_status.call_args[0]
        assert call[1] == "crashed"

    @pytest.mark.asyncio
    async def test_crash_posts_error_message(
        self, service: CrashRecoveryService, bridge: MagicMock
    ) -> None:
        """Crash posts error details to the task thread."""
        error = ValueError("Bad input")
        await service.handle_agent_crash("test-agent", "task-1", error)

        bridge.send_message.assert_called_once()
        msg_content = bridge.send_message.call_args[0][3]
        assert "ValueError: Bad input" in msg_content
        assert "crashed" in msg_content

    @pytest.mark.asyncio
    async def test_repeated_crash_still_crashes(
        self, service: CrashRecoveryService, bridge: MagicMock
    ) -> None:
        """Multiple crashes on same task all transition to crashed."""
        error = RuntimeError("boom")
        await service.handle_agent_crash("agent", "task-1", error)
        bridge.reset_mock()

        await service.handle_agent_crash("agent", "task-1", error)
        call = bridge.update_task_status.call_args[0]
        assert call[1] == "crashed"
