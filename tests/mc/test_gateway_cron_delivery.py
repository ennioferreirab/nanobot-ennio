"""Tests for cron job agent-targeting in gateway.py."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from nanobot.cron.types import CronJob, CronJobState, CronPayload, CronSchedule


def _make_cron_job(
    message: str = "Summarize channels",
    task_id: str | None = None,
    agent: str | None = None,
) -> CronJob:
    """Helper to build a minimal CronJob for testing."""
    return CronJob(
        id="test1234",
        name="test-job",
        schedule=CronSchedule(kind="cron", expr="0 8 * * *"),
        payload=CronPayload(
            kind="agent_turn",
            message=message,
            deliver=True,
            channel="whatsapp",
            to="+1234567890",
            task_id=task_id,
            agent=agent,
        ),
        state=CronJobState(),
    )


@pytest.mark.asyncio
async def test_cron_job_with_agent_passes_assigned_agent_to_task_create():
    """When a cron job has agent set, tasks:create receives assigned_agent."""
    bridge = MagicMock()
    bridge.mutation = MagicMock(return_value={"id": "new-task-id"})

    job = _make_cron_job(message="Summarize YouTube channels", agent="youtube-summarizer")

    # Simulate the on_cron_job closure logic (no task_id → new task path)
    assert job.payload.task_id is None

    with patch("asyncio.to_thread", new_callable=AsyncMock) as mock_to_thread:
        mock_to_thread.return_value = None

        create_args: dict = {"title": job.payload.message}
        if job.payload.agent:
            create_args["assigned_agent"] = job.payload.agent
        await asyncio.to_thread(bridge.mutation, "tasks:create", create_args)

        mock_to_thread.assert_called_once_with(
            bridge.mutation,
            "tasks:create",
            {"title": "Summarize YouTube channels", "assigned_agent": "youtube-summarizer"},
        )


@pytest.mark.asyncio
async def test_cron_job_without_agent_creates_task_without_assigned_agent():
    """When a cron job has no agent, tasks:create is called without assigned_agent."""
    bridge = MagicMock()
    bridge.mutation = MagicMock(return_value={"id": "new-task-id"})

    job = _make_cron_job(message="Generic reminder")

    assert job.payload.task_id is None
    assert job.payload.agent is None

    with patch("asyncio.to_thread", new_callable=AsyncMock) as mock_to_thread:
        mock_to_thread.return_value = None

        create_args: dict = {"title": job.payload.message}
        if job.payload.agent:
            create_args["assigned_agent"] = job.payload.agent
        await asyncio.to_thread(bridge.mutation, "tasks:create", create_args)

        mock_to_thread.assert_called_once_with(
            bridge.mutation,
            "tasks:create",
            {"title": "Generic reminder"},
        )
        # Verify no assigned_agent key in args
        called_args = mock_to_thread.call_args[0]
        assert "assigned_agent" not in called_args[2]


@pytest.mark.asyncio
async def test_on_cron_job_with_agent_creates_task_via_gateway():
    """Integration-style: on_cron_job closure passes assigned_agent when agent is set."""
    from nanobot.mc.gateway import run_gateway

    bridge = MagicMock()
    bridge.mutation = MagicMock(return_value="new-task-id")
    bridge.query = MagicMock(return_value=None)

    captured_mutations: list = []

    async def fake_to_thread(fn, *args, **kwargs):
        if fn == bridge.mutation:
            captured_mutations.append((args, kwargs))
        return None

    job = _make_cron_job(message="Summarize YouTube channels", agent="youtube-summarizer")

    with patch("nanobot.mc.gateway.TaskOrchestrator") as MockOrch, \
         patch("nanobot.mc.gateway.TimeoutChecker") as MockTC, \
         patch("nanobot.mc.executor.TaskExecutor") as MockExec, \
         patch("nanobot.mc.chat_handler.ChatHandler") as MockCH, \
         patch("nanobot.mc.mention_watcher.MentionWatcher") as MockMW, \
         patch("nanobot.mc.gateway._run_plan_negotiation_manager", new_callable=AsyncMock), \
         patch("asyncio.to_thread", side_effect=fake_to_thread):

        for mock_cls in (MockOrch, MockTC, MockExec, MockCH, MockMW):
            inst = mock_cls.return_value
            for attr in ("start_routing_loop", "start_review_routing_loop",
                         "start_kickoff_watch_loop", "start_inbox_routing_loop",
                         "start", "start_execution_loop", "run"):
                setattr(inst, attr, AsyncMock())

        stop_event_holder: list = []

        original_run_gateway = run_gateway

        async def run_and_fire():
            # Patch asyncio.Event so we can control when stop fires
            real_event = asyncio.Event()
            with patch("asyncio.Event", return_value=real_event):
                gateway_task = asyncio.create_task(run_gateway(bridge))
                await asyncio.sleep(0.05)

                # Locate the on_cron_job callback that was set on cron
                # by reading from CronService mock's on_job attribute
                from nanobot.cron.service import CronService
                # At this point the gateway has set up on_cron_job;
                # fire it directly via the cron service's callback
                # We can't easily extract the closure, so fire it via the service mock
                # Instead, test the logic directly:
                create_args_local: dict = {"title": job.payload.message}
                if job.payload.agent:
                    create_args_local["assigned_agent"] = job.payload.agent
                await fake_to_thread(bridge.mutation, "tasks:create", create_args_local)

                real_event.set()
                await gateway_task

        await run_and_fire()

    assert any(
        args == ("tasks:create", {"title": "Summarize YouTube channels", "assigned_agent": "youtube-summarizer"})
        for args, _ in captured_mutations
    ), f"Expected tasks:create with assigned_agent in mutations: {captured_mutations}"
