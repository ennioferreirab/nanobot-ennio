"""
Crash Handler — marks tasks as crashed when agent execution fails.

Extracted from mc.gateway so that executor can depend on it without importing
the gateway composition root.

Implements FR38 (crashed status with error log).
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from mc.bridge import ConvexBridge

logger = logging.getLogger(__name__)


class AgentGateway:
    """Marks tasks as crashed when agent execution fails.

    Agents already have internal retries — if they fail, the task is broken.
    Transitions directly to "crashed" with error details in the thread.
    """

    def __init__(self, bridge: ConvexBridge) -> None:
        self._bridge = bridge

    async def handle_agent_crash(self, agent_name: str, task_id: str, error: Exception) -> None:
        """Handle an agent crash by marking the task as crashed.

        Args:
            agent_name: Name of the crashed agent.
            task_id: Convex task _id the agent was working on.
            error: The exception that caused the crash.
        """
        error_msg = f"{type(error).__name__}: {error}"

        logger.error(
            "[gateway] Agent '%s' crashed on task %s — marking as crashed.",
            agent_name,
            task_id,
        )

        await asyncio.to_thread(
            self._bridge.update_task_status,
            task_id,
            "crashed",
            agent_name,
            f"Agent {agent_name} crashed. Task marked as crashed.",
        )

        await asyncio.to_thread(
            self._bridge.send_message,
            task_id,
            "System",
            "system",
            (
                f"Agent crash:\n```\n{error_msg}\n```\n"
                "Task marked as crashed. Use 'Retry from Beginning' to try again."
            ),
            "system_event",
        )


CrashRecoveryService = AgentGateway

__all__ = ["AgentGateway", "CrashRecoveryService"]
