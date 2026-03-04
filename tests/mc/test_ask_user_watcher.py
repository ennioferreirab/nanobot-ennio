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
        watcher = AskUserReplyWatcher(bridge, registry)
        assert watcher._bridge is bridge
        assert watcher._registry is registry

    @pytest.mark.asyncio
    async def test_delivers_user_reply_to_pending_ask(self, bridge, registry):
        mock_server = MagicMock()
        mock_server._task_to_request = {"task-abc": "req-123"}
        mock_server._pending_ask = {"req-123": MagicMock()}
        registry.register("task-abc", mock_server)

        watcher = AskUserReplyWatcher(bridge, registry)

        # First poll: only the agent question exists — seeds the seen set
        bridge.get_task_messages = MagicMock(return_value=[
            {"_id": "msg-1", "author_type": "agent", "content": "**agent is asking:**\n\nWhat color?"},
        ])
        await watcher._poll_once()

        # Second poll: user reply appears
        bridge.get_task_messages = MagicMock(return_value=[
            {"_id": "msg-1", "author_type": "agent", "content": "**agent is asking:**\n\nWhat color?"},
            {"_id": "msg-2", "author_type": "user", "content": "Blue"},
        ])
        await watcher._poll_once()

        mock_server.deliver_user_reply.assert_called_once_with("task-abc", "Blue")

    @pytest.mark.asyncio
    async def test_ignores_agent_messages(self, bridge, registry):
        mock_server = MagicMock()
        mock_server._task_to_request = {"task-abc": "req-123"}
        mock_server._pending_ask = {"req-123": MagicMock()}
        registry.register("task-abc", mock_server)

        bridge.get_task_messages = MagicMock(return_value=[
            {"_id": "msg-1", "author_type": "agent", "content": "I am done"},
        ])

        await AskUserReplyWatcher(bridge, registry)._poll_once()

        mock_server.deliver_user_reply.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_tasks_without_pending_ask(self, bridge, registry):
        mock_server = MagicMock()
        mock_server._task_to_request = {}
        mock_server._pending_ask = {}
        registry.register("task-abc", mock_server)

        await AskUserReplyWatcher(bridge, registry)._poll_once()

        bridge.get_task_messages.assert_not_called()

    @pytest.mark.asyncio
    async def test_deduplicates_seen_messages(self, bridge, registry):
        mock_server = MagicMock()
        mock_server._task_to_request = {"task-abc": "req-123"}
        mock_server._pending_ask = {"req-123": MagicMock()}
        registry.register("task-abc", mock_server)

        watcher = AskUserReplyWatcher(bridge, registry)

        # First poll: seed seen set (empty thread)
        bridge.get_task_messages = MagicMock(return_value=[])
        await watcher._poll_once()

        # Second poll: user message appears
        bridge.get_task_messages = MagicMock(return_value=[
            {"_id": "msg-1", "author_type": "user", "content": "Blue"},
        ])
        await watcher._poll_once()

        # Third poll: same message still there
        await watcher._poll_once()

        assert mock_server.deliver_user_reply.call_count == 1
