"""Tests for enriched context in handle_mention().

Verifies that handle_mention injects task metadata, uses ThreadContextBuilder
with max_messages=20, includes execution plan summary, and removes
_build_mention_context entirely.

Story 13.2: Full Context for Mentioned Agents.
"""

from __future__ import annotations

import inspect
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import mc.mention_handler as handler_module
from mc.mention_handler import handle_mention


@pytest.fixture
def mock_bridge():
    """Create a mock ConvexBridge with get_task and get_task_messages."""
    bridge = MagicMock()
    bridge.get_task_messages.return_value = [
        {
            "author_name": "User",
            "author_type": "user",
            "message_type": "user_message",
            "content": "Please help with this task.",
        },
    ]
    bridge.get_task.return_value = {
        "title": "Research AI safety",
        "description": "Investigate alignment techniques",
        "status": "in_progress",
        "assigned_agent": "researcher",
        "tags": ["ai", "safety"],
        "board_name": "Sprint 1",
        "execution_plan": {
            "steps": [
                {"title": "Literature review", "status": "completed"},
                {"title": "Summarize findings", "status": "in_progress"},
            ]
        },
        "files": [
            {
                "name": "reference.pdf",
                "description": "Key paper",
                "subfolder": "attachments",
            },
        ],
    }
    bridge.send_message.return_value = None
    bridge.create_activity.return_value = None
    return bridge


def _make_mock_config(prompt="You are a helpful researcher."):
    """Create a mock agent config result."""
    mock_config = MagicMock()
    mock_config.prompt = prompt
    mock_config.model = "gpt-4"
    mock_config.skills = []
    mock_config.display_name = "Researcher"
    return mock_config


@pytest.fixture
def _mock_agent_env():
    """Mock all external dependencies used inside handle_mention.

    Since handle_mention uses local imports (from mc.gateway import AGENTS_DIR, etc.),
    we must patch the source modules, not mc.mention_handler attributes.
    """
    mock_config = _make_mock_config()

    mock_agents_dir = MagicMock()
    # AGENTS_DIR / agent_name / "config.yaml" — must return a path with exists()=True
    mock_config_path = MagicMock()
    mock_config_path.exists.return_value = True
    mock_agent_dir = MagicMock()
    mock_agent_dir.__truediv__ = MagicMock(return_value=mock_config_path)
    mock_agent_dir.mkdir = MagicMock()
    mock_agents_dir.__truediv__ = MagicMock(return_value=mock_agent_dir)

    with (
        patch(
            "mc.mention_handler._known_agent_names",
            return_value={"researcher"},
        ),
        patch("mc.gateway.AGENTS_DIR", mock_agents_dir),
        patch(
            "mc.yaml_validator.validate_agent_file",
            return_value=mock_config,
        ),
        patch("mc.orientation.load_orientation", return_value=None),
        patch("mc.types.is_tier_reference", return_value=False),
    ):
        yield mock_config


def _run_with_capture(mock_bridge, mock_env, extra_patches=None):
    """Helper to run handle_mention and capture the full_message sent to the agent.

    Returns the captured content string.
    """
    import asyncio

    captured_message = {}

    async def mock_process_direct(**kwargs):
        captured_message["content"] = kwargs.get("content", "")
        return "Agent response"

    mock_loop = MagicMock()
    mock_loop.process_direct = mock_process_direct
    mock_loop.tools = {}

    patches = {
        "mc.provider_factory.create_provider": MagicMock(
            return_value=("prov", "model")
        ),
        "nanobot.agent.loop.AgentLoop": MagicMock(return_value=mock_loop),
        "nanobot.bus.queue.MessageBus": MagicMock(),
    }
    if extra_patches:
        patches.update(extra_patches)

    async def _run():
        with patch.dict("sys.modules", {}):
            ctx_managers = [patch(k, v) for k, v in patches.items()]
            # Apply all patches
            for cm in ctx_managers:
                cm.start()
            try:
                await handle_mention(
                    bridge=mock_bridge,
                    task_id="task123",
                    agent_name="researcher",
                    query="What about alignment?",
                    caller_message_content="@researcher What about alignment?",
                    task_title="Research AI safety",
                )
            finally:
                for cm in ctx_managers:
                    cm.stop()

    asyncio.get_event_loop().run_until_complete(_run())
    return captured_message.get("content", "")


class TestHandleMentionTaskMetadata:
    """AC1: Task metadata injected into prompt."""

    @pytest.mark.asyncio
    async def test_injects_task_context_section(
        self, mock_bridge, _mock_agent_env
    ):
        """handle_mention includes [Task Context] with task metadata."""
        captured_message = {}

        async def mock_process_direct(**kwargs):
            captured_message["content"] = kwargs.get("content", "")
            return "Agent response"

        mock_loop = MagicMock()
        mock_loop.process_direct = mock_process_direct
        mock_loop.tools = {}

        with (
            patch(
                "mc.provider_factory.create_provider",
                return_value=("prov", "model"),
            ),
            patch("nanobot.agent.loop.AgentLoop", return_value=mock_loop),
            patch("nanobot.bus.queue.MessageBus"),
        ):
            await handle_mention(
                bridge=mock_bridge,
                task_id="task123",
                agent_name="researcher",
                query="What about alignment?",
                caller_message_content="@researcher What about alignment?",
                task_title="Research AI safety",
            )

        content = captured_message["content"]
        assert "[Task Context]" in content
        assert "Title: Research AI safety" in content
        assert "Description: Investigate alignment techniques" in content
        assert "Status: in_progress" in content
        assert "Assigned Agent: researcher" in content
        assert "Tags: ai, safety" in content
        assert "Board: Sprint 1" in content


class TestHandleMentionThreadContext:
    """AC2: ThreadContextBuilder used with max_messages=20."""

    @pytest.mark.asyncio
    async def test_uses_thread_context_builder(
        self, mock_bridge, _mock_agent_env
    ):
        """handle_mention calls ThreadContextBuilder.build with max_messages=20."""
        captured_args = {}

        class CapturingBuilder:
            def build(self, messages, max_messages=20, **kwargs):
                captured_args["messages"] = messages
                captured_args["max_messages"] = max_messages
                return "[Thread History]\nUser: test message"

        mock_loop = MagicMock()
        mock_loop.process_direct = AsyncMock(return_value="Response")
        mock_loop.tools = {}

        with (
            patch("mc.mention_handler.ThreadContextBuilder", CapturingBuilder),
            patch(
                "mc.provider_factory.create_provider",
                return_value=("prov", "model"),
            ),
            patch("nanobot.agent.loop.AgentLoop", return_value=mock_loop),
            patch("nanobot.bus.queue.MessageBus"),
        ):
            await handle_mention(
                bridge=mock_bridge,
                task_id="task123",
                agent_name="researcher",
                query="help",
                caller_message_content="@researcher help",
                task_title="Test task",
            )

        assert captured_args["max_messages"] == 20


class TestHandleMentionExecutionPlan:
    """AC3: Execution plan summary included/omitted correctly."""

    @pytest.mark.asyncio
    async def test_includes_execution_plan(
        self, mock_bridge, _mock_agent_env
    ):
        """handle_mention includes [Execution Plan] when plan exists."""
        captured_message = {}

        async def mock_process_direct(**kwargs):
            captured_message["content"] = kwargs.get("content", "")
            return "Agent response"

        mock_loop = MagicMock()
        mock_loop.process_direct = mock_process_direct
        mock_loop.tools = {}

        with (
            patch(
                "mc.provider_factory.create_provider",
                return_value=("prov", "model"),
            ),
            patch("nanobot.agent.loop.AgentLoop", return_value=mock_loop),
            patch("nanobot.bus.queue.MessageBus"),
        ):
            await handle_mention(
                bridge=mock_bridge,
                task_id="task123",
                agent_name="researcher",
                query="help",
                caller_message_content="@researcher help",
                task_title="Test task",
            )

        content = captured_message["content"]
        assert "[Execution Plan]" in content
        assert "1. Literature review — completed" in content
        assert "2. Summarize findings — in_progress" in content

    @pytest.mark.asyncio
    async def test_omits_plan_when_absent(
        self, mock_bridge, _mock_agent_env
    ):
        """handle_mention omits [Execution Plan] when no plan exists."""
        mock_bridge.get_task.return_value = {
            "title": "Simple task",
            "status": "in_progress",
        }

        captured_message = {}

        async def mock_process_direct(**kwargs):
            captured_message["content"] = kwargs.get("content", "")
            return "Agent response"

        mock_loop = MagicMock()
        mock_loop.process_direct = mock_process_direct
        mock_loop.tools = {}

        with (
            patch(
                "mc.provider_factory.create_provider",
                return_value=("prov", "model"),
            ),
            patch("nanobot.agent.loop.AgentLoop", return_value=mock_loop),
            patch("nanobot.bus.queue.MessageBus"),
        ):
            await handle_mention(
                bridge=mock_bridge,
                task_id="task123",
                agent_name="researcher",
                query="help",
                caller_message_content="@researcher help",
                task_title="Simple task",
            )

        content = captured_message["content"]
        assert "[Execution Plan]" not in content


class TestHandleMentionTaskFiles:
    """AC4: Task file references included/omitted correctly."""

    @pytest.mark.asyncio
    async def test_includes_task_files(
        self, mock_bridge, _mock_agent_env
    ):
        """handle_mention includes [Task Files] when files exist."""
        captured_message = {}

        async def mock_process_direct(**kwargs):
            captured_message["content"] = kwargs.get("content", "")
            return "Agent response"

        mock_loop = MagicMock()
        mock_loop.process_direct = mock_process_direct
        mock_loop.tools = {}

        with (
            patch(
                "mc.provider_factory.create_provider",
                return_value=("prov", "model"),
            ),
            patch("nanobot.agent.loop.AgentLoop", return_value=mock_loop),
            patch("nanobot.bus.queue.MessageBus"),
        ):
            await handle_mention(
                bridge=mock_bridge,
                task_id="task123",
                agent_name="researcher",
                query="help",
                caller_message_content="@researcher help",
                task_title="Test task",
            )

        content = captured_message["content"]
        assert "[Task Files]" in content
        assert "reference.pdf" in content

    @pytest.mark.asyncio
    async def test_omits_files_when_absent(
        self, mock_bridge, _mock_agent_env
    ):
        """handle_mention omits [Task Files] when no files attached."""
        mock_bridge.get_task.return_value = {
            "title": "No files task",
            "status": "in_progress",
        }

        captured_message = {}

        async def mock_process_direct(**kwargs):
            captured_message["content"] = kwargs.get("content", "")
            return "Agent response"

        mock_loop = MagicMock()
        mock_loop.process_direct = mock_process_direct
        mock_loop.tools = {}

        with (
            patch(
                "mc.provider_factory.create_provider",
                return_value=("prov", "model"),
            ),
            patch("nanobot.agent.loop.AgentLoop", return_value=mock_loop),
            patch("nanobot.bus.queue.MessageBus"),
        ):
            await handle_mention(
                bridge=mock_bridge,
                task_id="task123",
                agent_name="researcher",
                query="help",
                caller_message_content="@researcher help",
                task_title="No files task",
            )

        content = captured_message["content"]
        assert "[Task Files]" not in content


class TestBuildMentionContextRemoved:
    """AC2 negative: _build_mention_context is fully removed."""

    def test_no_build_mention_context_function(self):
        """Verify _build_mention_context no longer exists in the module."""
        assert not hasattr(handler_module, "_build_mention_context"), (
            "_build_mention_context should have been removed"
        )

    def test_no_build_mention_context_in_source(self):
        """Verify _build_mention_context is not referenced in handler source."""
        source = inspect.getsource(handler_module)
        assert "_build_mention_context" not in source


class TestHandleMentionPromptStructure:
    """AC5: Prompt structure follows the specified section order."""

    @pytest.mark.asyncio
    async def test_section_order(self, mock_bridge, _mock_agent_env):
        """Sections appear in correct order: System > Mention > Task > Plan > Files."""
        captured_message = {}

        async def mock_process_direct(**kwargs):
            captured_message["content"] = kwargs.get("content", "")
            return "Agent response"

        mock_loop = MagicMock()
        mock_loop.process_direct = mock_process_direct
        mock_loop.tools = {}

        with (
            patch(
                "mc.provider_factory.create_provider",
                return_value=("prov", "model"),
            ),
            patch("nanobot.agent.loop.AgentLoop", return_value=mock_loop),
            patch("nanobot.bus.queue.MessageBus"),
        ):
            await handle_mention(
                bridge=mock_bridge,
                task_id="task123",
                agent_name="researcher",
                query="help",
                caller_message_content="@researcher help",
                task_title="Test task",
            )

        content = captured_message["content"]

        # Verify section order
        sys_idx = content.index("[System instructions]")
        mention_idx = content.index("[Mention]")
        task_idx = content.index("[Task Context]")
        plan_idx = content.index("[Execution Plan]")
        files_idx = content.index("[Task Files]")

        assert sys_idx < mention_idx < task_idx < plan_idx < files_idx

    @pytest.mark.asyncio
    async def test_no_system_instructions_when_prompt_none(
        self, mock_bridge, _mock_agent_env
    ):
        """[System instructions] omitted when agent_prompt is None (nanobot agent)."""
        _mock_agent_env.prompt = None

        captured_message = {}

        async def mock_process_direct(**kwargs):
            captured_message["content"] = kwargs.get("content", "")
            return "Agent response"

        mock_loop = MagicMock()
        mock_loop.process_direct = mock_process_direct
        mock_loop.tools = {}

        with (
            patch(
                "mc.provider_factory.create_provider",
                return_value=("prov", "model"),
            ),
            patch("nanobot.agent.loop.AgentLoop", return_value=mock_loop),
            patch("nanobot.bus.queue.MessageBus"),
        ):
            await handle_mention(
                bridge=mock_bridge,
                task_id="task123",
                agent_name="researcher",
                query="help",
                caller_message_content="@researcher help",
                task_title="Test task",
            )

        content = captured_message["content"]
        assert "[System instructions]" not in content
        assert "[Mention]" in content
