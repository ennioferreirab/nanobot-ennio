"""Unit tests for mc.bridge.subscriptions module."""

import asyncio
from unittest.mock import MagicMock

import pytest

from mc.bridge.subscriptions import SubscriptionManager


class MockAsyncSubscription:
    """Mock that yields results then waits forever (simulating a live subscription)."""

    def __init__(self, results):
        self._results = list(results)
        self._index = 0
        self._wait_event = asyncio.Event()

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self._index < len(self._results):
            result = self._results[self._index]
            self._index += 1
            return result
        # Block forever after exhausting results (simulates idle subscription)
        await self._wait_event.wait()
        raise StopAsyncIteration

    def unsubscribe(self):
        pass


class MockErrorSubscription:
    """Mock subscription whose __anext__ always raises an exception."""

    def __init__(self, exc):
        self._exc = exc

    def __aiter__(self):
        return self

    async def __anext__(self):
        raise self._exc


class TestSubscriptionManager:
    def test_subscribe_yields_converted_results(self):
        """subscribe() converts camelCase keys to snake_case."""
        client = MagicMock()
        client.raw_client.subscribe.return_value = iter(
            [
                [{"_id": "1", "assignedAgent": "bob"}],
                [{"_id": "1", "assignedAgent": "alice"}],
            ]
        )

        manager = SubscriptionManager(client)
        results = list(manager.subscribe("tasks:list"))

        assert len(results) == 2
        assert results[0][0]["id"] == "1"
        assert results[0][0]["assigned_agent"] == "bob"
        assert results[1][0]["assigned_agent"] == "alice"

    def test_subscribe_converts_args(self):
        """subscribe() converts snake_case args to camelCase."""
        client = MagicMock()
        client.raw_client.subscribe.return_value = iter([])

        manager = SubscriptionManager(client)
        list(manager.subscribe("messages:listByTask", {"task_id": "abc"}))

        client.raw_client.subscribe.assert_called_once_with(
            "messages:listByTask", {"taskId": "abc"}
        )

    def test_subscribe_empty(self):
        """subscribe() handles empty result."""
        client = MagicMock()
        client.raw_client.subscribe.return_value = iter([])

        manager = SubscriptionManager(client)
        results = list(manager.subscribe("tasks:list"))
        assert results == []

    @pytest.mark.asyncio
    async def test_async_subscribe_waits_while_controller_is_sleeping(self):
        """Subscription still delivers results during sleep and wakes controller via record_work_found()."""
        from mc.runtime.sleep_controller import RuntimeSleepController

        client = MagicMock()
        subscription = MockAsyncSubscription([[{"assignedAgent": "bob"}]])
        client.raw_client.subscribe.return_value = subscription

        controller = RuntimeSleepController(client)
        await controller.initialize()
        await controller.apply_manual_mode("sleep")

        manager = SubscriptionManager(client)
        queue = manager.async_subscribe(
            "tasks:list",
            poll_interval=0.01,
            sleep_controller=controller,
        )

        # Subscription should deliver the result and wake the controller
        result = await asyncio.wait_for(queue.get(), timeout=1.0)

        assert result == [{"assigned_agent": "bob"}]
        assert controller.mode == "active"

    @pytest.mark.asyncio
    async def test_non_empty_sleep_sync_wakes_controller(self):
        """A non-empty subscription result during sleep should wake the shared controller."""
        from mc.runtime.sleep_controller import RuntimeSleepController

        client = MagicMock()
        subscription = MockAsyncSubscription([[{"assignedAgent": "task_1"}]])
        client.raw_client.subscribe.return_value = subscription

        controller = RuntimeSleepController(
            client,
            sleep_poll_interval_seconds=0.01,
        )
        await controller.initialize()
        await controller.apply_manual_mode("sleep")

        manager = SubscriptionManager(client)
        queue = manager.async_subscribe(
            "tasks:list",
            poll_interval=0.01,
            sleep_controller=controller,
        )

        result = await asyncio.wait_for(queue.get(), timeout=1.0)

        assert result == [{"assigned_agent": "task_1"}]
        assert controller.mode == "active"

    @pytest.mark.asyncio
    async def test_subscribe_loop_creates_real_subscription(self):
        """_subscribe_loop calls raw_client.subscribe with camelCase args."""
        client = MagicMock()
        subscription = MockAsyncSubscription([{"someValue": 1}])
        client.raw_client.subscribe.return_value = subscription

        manager = SubscriptionManager(client)
        queue = manager.async_subscribe("tasks:listByStatus", {"task_status": "pending"})

        await asyncio.wait_for(queue.get(), timeout=1.0)

        client.raw_client.subscribe.assert_called_once_with(
            "tasks:listByStatus", {"taskStatus": "pending"}
        )

    @pytest.mark.asyncio
    async def test_subscribe_loop_converts_results_to_snake_case(self):
        """_subscribe_loop converts camelCase result keys to snake_case before queuing."""
        client = MagicMock()
        subscription = MockAsyncSubscription([{"assignedAgent": "alice", "taskId": "t1"}])
        client.raw_client.subscribe.return_value = subscription

        manager = SubscriptionManager(client)
        queue = manager.async_subscribe("tasks:list")

        result = await asyncio.wait_for(queue.get(), timeout=1.0)

        assert result == {"assigned_agent": "alice", "task_id": "t1"}

    @pytest.mark.asyncio
    async def test_subscribe_loop_deduplicates_results(self):
        """_subscribe_loop only queues a result when it differs from the last."""
        client = MagicMock()
        same = {"status": "ok"}
        subscription = MockAsyncSubscription([same, same, {"status": "changed"}])
        client.raw_client.subscribe.return_value = subscription

        manager = SubscriptionManager(client)
        queue = manager.async_subscribe("tasks:list")

        first = await asyncio.wait_for(queue.get(), timeout=1.0)
        second = await asyncio.wait_for(queue.get(), timeout=1.0)

        assert first == {"status": "ok"}
        assert second == {"status": "changed"}
        # Queue should now be empty (duplicate was skipped)
        assert queue.empty()

    @pytest.mark.asyncio
    async def test_subscribe_loop_reconnects_on_error(self):
        """_subscribe_loop reconnects when the subscription raises an error."""
        client = MagicMock()

        first_sub = MockErrorSubscription(RuntimeError("connection lost"))
        second_sub = MockAsyncSubscription([{"value": 42}])

        client.raw_client.subscribe.side_effect = [first_sub, second_sub]

        manager = SubscriptionManager(client)

        # Patch asyncio.sleep to avoid real delay during reconnect backoff
        original_sleep = asyncio.sleep

        async def fast_sleep(delay):
            await original_sleep(0)

        import unittest.mock as mock

        with mock.patch("mc.bridge.subscriptions.asyncio.sleep", side_effect=fast_sleep):
            queue = manager.async_subscribe("tasks:list")
            result = await asyncio.wait_for(queue.get(), timeout=2.0)

        assert result == {"value": 42}
        assert client.raw_client.subscribe.call_count == 2

    @pytest.mark.asyncio
    async def test_subscribe_loop_gives_up_after_max_errors(self):
        """_subscribe_loop pushes an error dict to queue after max_errors consecutive failures."""
        client = MagicMock()

        # Every subscribe call returns a subscription that immediately raises
        client.raw_client.subscribe.side_effect = RuntimeError("fatal error")

        manager = SubscriptionManager(client)

        original_sleep = asyncio.sleep

        async def fast_sleep(delay):
            await original_sleep(0)

        import unittest.mock as mock

        with mock.patch("mc.bridge.subscriptions.asyncio.sleep", side_effect=fast_sleep):
            queue = manager.async_subscribe("tasks:list")
            result = await asyncio.wait_for(queue.get(), timeout=5.0)

        assert result["_error"] is True
        assert "fatal error" in result["message"]
        assert client.raw_client.subscribe.call_count == 10
