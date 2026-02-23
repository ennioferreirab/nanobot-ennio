"""
Task Executor — picks up assigned tasks and runs agent work.

Extracted from orchestrator.py per NFR21 (500-line module limit).
Subscribes to assigned tasks, transitions them to in_progress,
runs the nanobot agent loop, and handles completion/crash.

Implements AC #3 (assigned → in_progress), AC #4 (task execution and
completion), and AC #8 (dual logging via activity events).
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any

from nanobot.mc.gateway import AgentGateway
from nanobot.mc.types import (
    ActivityEventType,
    AuthorType,
    MessageType,
    TaskStatus,
    TrustLevel,
)

if TYPE_CHECKING:
    from nanobot.mc.bridge import ConvexBridge

logger = logging.getLogger(__name__)


def _collect_provider_error_types() -> tuple[type[Exception], ...]:
    """Collect provider-specific exception types for targeted catching.

    Returns a tuple of exception classes that represent provider/OAuth
    errors (as opposed to agent runtime errors). These are caught
    separately in _execute_task so they get surfaced with actionable
    instructions instead of being buried in generic crash handling.
    """
    from nanobot.mc.provider_factory import ProviderError

    types: list[type[Exception]] = [ProviderError]
    try:
        from nanobot.providers.anthropic_oauth import AnthropicOAuthExpired

        types.append(AnthropicOAuthExpired)
    except ImportError:
        pass
    return tuple(types)


_PROVIDER_ERRORS = _collect_provider_error_types()


def _provider_error_action(exc: Exception) -> str:
    """Extract a user-facing action string from a provider error.

    For ProviderError the action is explicit. For AnthropicOAuthExpired
    the message itself contains the command. Falls back to a generic hint.
    """
    from nanobot.mc.provider_factory import ProviderError

    if isinstance(exc, ProviderError) and exc.action:
        return exc.action
    # AnthropicOAuthExpired messages include "Run: nanobot provider login ..."
    msg = str(exc)
    if "Run:" in msg:
        return msg[msg.index("Run:") :]
    return "Check provider configuration in ~/.nanobot/config.json"


def _make_provider(model: str | None = None):
    """Create the LLM provider from the user's nanobot config.

    Delegates to the shared provider_factory.create_provider() to avoid
    duplication with nanobot/cli/commands.py.
    """
    from nanobot.mc.provider_factory import create_provider

    return create_provider(model)


async def _run_agent_on_task(
    agent_name: str,
    agent_prompt: str | None,
    agent_model: str | None,
    task_title: str,
    task_description: str | None,
) -> str:
    """Run the nanobot agent loop on a task and return the result.

    Uses AgentLoop.process_direct() with the agent's system prompt and model.
    The task title + description become the message input.
    """
    from nanobot.agent.loop import AgentLoop
    from nanobot.bus.queue import MessageBus

    workspace = Path.home() / ".nanobot" / "agents" / agent_name
    workspace.mkdir(parents=True, exist_ok=True)

    # Build the message from task title + description
    message = task_title
    if task_description:
        message += f"\n\n{task_description}"

    # Prefix with agent system prompt if available (ContextBuilder reads
    # bootstrap files from workspace, but the YAML prompt isn't a bootstrap
    # file — so we include it in the message content).
    if agent_prompt:
        message = f"[System instructions]\n{agent_prompt}\n\n[Task]\n{message}"

    # Create provider from user config (respects OAuth, API keys, etc.)
    provider, resolved_model = _make_provider(agent_model)

    bus = MessageBus()
    loop = AgentLoop(
        bus=bus,
        provider=provider,
        workspace=workspace,
        model=resolved_model,
    )

    result = await loop.process_direct(
        content=message,
        session_key=f"mc:task:{agent_name}",
        channel="mc",
        chat_id=agent_name,
    )
    return result


class TaskExecutor:
    """Picks up assigned tasks and runs agent execution."""

    def __init__(self, bridge: ConvexBridge) -> None:
        self._bridge = bridge
        self._agent_gateway = AgentGateway(bridge)
        self._known_assigned_ids: set[str] = set()

    async def start_execution_loop(self) -> None:
        """Subscribe to assigned tasks and execute them as they arrive.

        Uses bridge.async_subscribe() which runs the blocking Convex
        subscription in a dedicated thread and feeds updates into an
        asyncio.Queue — no event-loop blocking.
        Tasks are dispatched concurrently via asyncio.create_task() to
        satisfy NFR2 (< 5s pickup latency).
        """
        logger.info("[executor] Starting execution loop")

        queue = self._bridge.async_subscribe(
            "tasks:listByStatus", {"status": "assigned"}
        )

        while True:
            tasks = await queue.get()
            if tasks is None:
                continue
            for task_data in tasks:
                task_id = task_data.get("id")
                if not task_id or task_id in self._known_assigned_ids:
                    continue
                self._known_assigned_ids.add(task_id)
                asyncio.create_task(self._pickup_task(task_data))

    async def _pickup_task(self, task_data: dict[str, Any]) -> None:
        """Transition assigned task to in_progress and start execution."""
        task_id = task_data["id"]
        title = task_data.get("title", "Untitled")
        description = task_data.get("description")
        agent_name = task_data.get("assigned_agent", "lead-agent")
        trust_level = task_data.get("trust_level", TrustLevel.AUTONOMOUS)

        # Transition to in_progress.
        # Activity event (task_started) is written by the Convex
        # tasks:updateStatus mutation — no duplicate create_activity here.
        await asyncio.to_thread(
            self._bridge.update_task_status,
            task_id,
            TaskStatus.IN_PROGRESS,
            agent_name,
            f"Agent {agent_name} started work on '{title}'",
        )

        # Write system message to task thread (messages are separate from activities)
        await asyncio.to_thread(
            self._bridge.send_message,
            task_id,
            "System",
            AuthorType.SYSTEM,
            f"Agent {agent_name} has started work on this task.",
            MessageType.SYSTEM_EVENT,
        )

        logger.info(
            "[executor] Task '%s' picked up by '%s' — now in_progress",
            title, agent_name,
        )

        # Execute the task
        await self._execute_task(task_id, title, description, agent_name, trust_level)

    def _load_agent_config(self, agent_name: str) -> tuple[str | None, str | None]:
        """Load prompt and model from the agent's YAML config file.

        Returns:
            Tuple of (prompt, model). Either may be None if not configured.
        """
        from nanobot.mc.gateway import AGENTS_DIR
        from nanobot.mc.yaml_validator import validate_agent_file

        config_file = AGENTS_DIR / agent_name / "config.yaml"
        if not config_file.exists():
            return None, None

        result = validate_agent_file(config_file)
        if isinstance(result, list):
            # Validation errors — use defaults
            logger.warning(
                "[executor] Agent '%s' config invalid: %s", agent_name, result
            )
            return None, None

        return result.prompt, result.model

    async def _handle_provider_error(
        self,
        task_id: str,
        title: str,
        agent_name: str,
        exc: Exception,
    ) -> None:
        """Surface provider/OAuth errors prominently.

        Instead of burying the error through generic crash handling, this
        writes a clear system message with the actionable command the user
        needs to run, AND creates a system_error activity event so it
        shows up in the dashboard activity feed.
        """
        action = _provider_error_action(exc)
        error_class = type(exc).__name__
        user_message = (
            f"Provider error: {error_class}: {exc}\n\n"
            f"Action: {action}"
        )

        logger.error(
            "[executor] Provider error on task '%s': %s. Action: %s",
            title, exc, action,
        )

        # Write system message to task thread with clear instructions
        try:
            await asyncio.to_thread(
                self._bridge.send_message,
                task_id,
                "System",
                AuthorType.SYSTEM,
                user_message,
                MessageType.SYSTEM_EVENT,
            )
        except Exception:
            logger.exception("[executor] Failed to write provider error message")

        # Create system_error activity event for the dashboard feed
        try:
            await asyncio.to_thread(
                self._bridge.create_activity,
                ActivityEventType.SYSTEM_ERROR,
                f"Provider error on '{title}': {error_class}. {action}",
                task_id,
                agent_name,
            )
        except Exception:
            logger.exception("[executor] Failed to create provider error activity")

        # Transition task to crashed (provider errors should not auto-retry)
        try:
            await asyncio.to_thread(
                self._bridge.update_task_status,
                task_id,
                TaskStatus.CRASHED,
                agent_name,
                f"Provider error: {error_class}",
            )
        except Exception:
            logger.exception("[executor] Failed to crash task after provider error")

    async def _execute_task(
        self,
        task_id: str,
        title: str,
        description: str | None,
        agent_name: str,
        trust_level: str,
    ) -> None:
        """Run the agent on the task and handle completion or crash."""
        # Load agent prompt and model from YAML config
        agent_prompt, agent_model = self._load_agent_config(agent_name)

        try:
            result = await _run_agent_on_task(
                agent_name=agent_name,
                agent_prompt=agent_prompt,
                agent_model=agent_model,
                task_title=title,
                task_description=description,
            )

            # Write agent output as a work message
            await asyncio.to_thread(
                self._bridge.send_message,
                task_id,
                agent_name,
                AuthorType.AGENT,
                result,
                MessageType.WORK,
            )

            # Determine final status based on trust level
            if trust_level == TrustLevel.AUTONOMOUS:
                final_status = TaskStatus.DONE
            else:
                final_status = TaskStatus.REVIEW

            # Activity event (task_completed) is written by the Convex
            # tasks:updateStatus mutation — no duplicate create_activity here.
            await asyncio.to_thread(
                self._bridge.update_task_status,
                task_id,
                final_status,
                agent_name,
                f"Agent {agent_name} completed task '{title}'",
            )

            # Clear retry count on success
            self._agent_gateway.clear_retry_count(task_id)

            logger.info(
                "[executor] Task '%s' completed by '%s' → %s",
                title, agent_name, final_status,
            )

        except _PROVIDER_ERRORS as exc:
            # Provider/OAuth errors get surfaced with clear actionable message
            await self._handle_provider_error(task_id, title, agent_name, exc)

        except Exception as exc:
            logger.error(
                "[executor] Agent '%s' crashed on task '%s': %s",
                agent_name, title, exc,
            )
            await self._agent_gateway.handle_agent_crash(agent_name, task_id, exc)
        finally:
            # Allow re-pickup if task returns to assigned (e.g. after retry)
            self._known_assigned_ids.discard(task_id)
