"""Tests for the on_cron_job delivery path inside run_gateway()."""

from __future__ import annotations

import asyncio
import os
import signal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from nanobot.cron.types import CronJob, CronPayload, CronSchedule


def _make_cron_job(
    *,
    deliver: bool = False,
    channel: str | None = None,
    to: str | None = None,
    task_id: str | None = None,
    message: str = "hello",
) -> CronJob:
    """Helper to build a CronJob with the given payload fields."""
    return CronJob(
        id="job1",
        name="test-job",
        enabled=True,
        schedule=CronSchedule(kind="every", every_ms=60_000),
        payload=CronPayload(
            kind="agent_turn",
            message=message,
            deliver=deliver,
            channel=channel,
            to=to,
            task_id=task_id,
        ),
    )


async def _run_gateway_and_capture(captured: dict) -> None:
    """Run run_gateway() with all dependencies mocked, capture the on_job callback."""
    from nanobot.mc.gateway import run_gateway

    # Build mock cron service that captures the on_job callback assignment
    mock_cron = MagicMock()
    mock_cron.start = AsyncMock()
    mock_cron.stop = MagicMock()
    mock_cron.status = MagicMock(return_value={"jobs": 0})

    def _set_on_job(fn):
        captured["on_job"] = fn

    type(mock_cron).on_job = property(
        fget=lambda self: captured.get("on_job"),
        fset=lambda self, fn: _set_on_job(fn),
    )
    mock_cron_cls = MagicMock(return_value=mock_cron)

    # Build mock MessageBus with AsyncMock publish_outbound
    mock_bus = MagicMock()
    mock_bus.publish_outbound = AsyncMock()
    mock_bus_cls = MagicMock(return_value=mock_bus)
    captured["bus"] = mock_bus

    # Build mock bridge
    mock_bridge = MagicMock()
    mock_bridge.mutation = MagicMock(return_value=None)
    mock_bridge.query = MagicMock(return_value=None)
    captured["bridge"] = mock_bridge

    # Channel manager mock
    mock_channels_instance = MagicMock()
    mock_channels_instance.start_all = AsyncMock()
    mock_channels_instance.stop_all = AsyncMock()
    mock_channels_instance.enabled_channels = []
    mock_channel_manager_cls = MagicMock(return_value=mock_channels_instance)

    mock_mc_channel = MagicMock()

    # Orchestrator mock
    mock_orch_instance = MagicMock()
    mock_orch_instance.start_routing_loop = AsyncMock()
    mock_orch_instance.start_review_routing_loop = AsyncMock()
    mock_orch_instance.start_kickoff_watch_loop = AsyncMock()
    mock_orch_instance.start_inbox_routing_loop = AsyncMock()

    # Timeout checker mock
    mock_tc_instance = MagicMock()
    mock_tc_instance.start = AsyncMock()

    # Executor mock
    mock_exec_instance = MagicMock()
    mock_exec_instance.start_execution_loop = AsyncMock()

    # Chat handler mock
    mock_chat_instance = MagicMock()
    mock_chat_instance.run = AsyncMock()

    async def trigger_stop():
        await asyncio.sleep(0.05)
        os.kill(os.getpid(), signal.SIGTERM)

    stop_task = asyncio.create_task(trigger_stop())

    with patch("nanobot.mc.gateway.TaskOrchestrator", return_value=mock_orch_instance), \
         patch("nanobot.mc.gateway.TimeoutChecker", return_value=mock_tc_instance), \
         patch("nanobot.mc.executor.TaskExecutor", return_value=mock_exec_instance), \
         patch("nanobot.mc.chat_handler.ChatHandler", return_value=mock_chat_instance), \
         patch("nanobot.channels.manager.ChannelManager", mock_channel_manager_cls), \
         patch("nanobot.config.loader.load_config"), \
         patch("nanobot.bus.queue.MessageBus", mock_bus_cls), \
         patch("nanobot.channels.mission_control.MissionControlChannel", return_value=mock_mc_channel), \
         patch("nanobot.cron.service.CronService", mock_cron_cls), \
         patch("nanobot.mc.gateway._run_plan_negotiation_manager", new_callable=lambda: lambda *a, **kw: AsyncMock()()):
        try:
            await run_gateway(mock_bridge)
        except SystemExit:
            pass
        finally:
            stop_task.cancel()
            try:
                await stop_task
            except asyncio.CancelledError:
                pass


class TestOnCronJobDelivery:
    """Tests for the on_cron_job nested function inside run_gateway()."""

    @pytest.mark.asyncio
    async def test_cron_job_with_deliver_publishes_outbound(self):
        """Job with deliver=True, channel, and to → bus.publish_outbound called."""
        captured: dict = {}
        await _run_gateway_and_capture(captured)

        on_job = captured.get("on_job")
        assert on_job is not None, "on_job callback was not captured"

        job = _make_cron_job(deliver=True, channel="telegram", to="123", message="hi")
        await on_job(job)

        bus = captured["bus"]
        bus.publish_outbound.assert_called_once()
        outbound_msg = bus.publish_outbound.call_args[0][0]
        assert outbound_msg.channel == "telegram"
        assert outbound_msg.chat_id == "123"
        assert "hi" in outbound_msg.content

    @pytest.mark.asyncio
    async def test_cron_job_deliver_skipped_when_task_fails(self):
        """When task creation raises, publish_outbound should NOT be called."""
        captured: dict = {}
        await _run_gateway_and_capture(captured)

        on_job = captured.get("on_job")
        assert on_job is not None

        # Make bridge.mutation raise so task_handled stays False
        captured["bridge"].mutation = MagicMock(side_effect=RuntimeError("db error"))

        job = _make_cron_job(deliver=True, channel="telegram", to="123")
        await on_job(job)

        captured["bus"].publish_outbound.assert_not_called()

    @pytest.mark.asyncio
    async def test_cron_job_mc_channel_with_task_id_skips_delivery(self):
        """Job with channel='mc' and task_id set → publish_outbound NOT called."""
        captured: dict = {}
        await _run_gateway_and_capture(captured)

        on_job = captured.get("on_job")
        assert on_job is not None

        # bridge.query returns a task so _requeue_cron_task can succeed
        captured["bridge"].query = MagicMock(
            return_value={"_id": "t1", "status": "idle", "assigned_agent": "nanobot"}
        )
        captured["bridge"].send_message = MagicMock()
        captured["bridge"].update_task_status = MagicMock()

        job = _make_cron_job(deliver=True, channel="mc", to="t1", task_id="t1")
        await on_job(job)

        captured["bus"].publish_outbound.assert_not_called()

    @pytest.mark.asyncio
    async def test_cron_job_deliver_false_skips_outbound(self):
        """Job with deliver=False → publish_outbound NOT called even if channel/to are set."""
        captured: dict = {}
        await _run_gateway_and_capture(captured)

        on_job = captured.get("on_job")
        assert on_job is not None

        job = _make_cron_job(deliver=False, channel="telegram", to="123")
        await on_job(job)

        captured["bus"].publish_outbound.assert_not_called()
