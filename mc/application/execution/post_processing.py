"""Shared post-execution hooks for the ExecutionEngine."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from mc.application.execution.background_tasks import create_background_task
from mc.application.execution.engine import ExecutionEngine
from mc.application.execution.request import (
    ExecutionRequest,
    ExecutionResult,
    RunnerType,
)
from mc.application.execution.runtime import relocate_invalid_memory_files
from mc.application.execution.strategies.claude_code import (
    ClaudeCodeRunnerStrategy,
)
from mc.application.execution.strategies.human import HumanRunnerStrategy
from mc.application.execution.strategies.nanobot import NanobotRunnerStrategy

logger = logging.getLogger(__name__)


async def relocate_invalid_memory_hook(
    request: ExecutionRequest,
    result: ExecutionResult,
) -> None:
    """Relocate invalid memory files after a runner touched the workspace."""
    if result.memory_workspace is None:
        return

    await asyncio.to_thread(
        relocate_invalid_memory_files,
        request.task_id,
        result.memory_workspace,
    )


async def nanobot_memory_consolidation_hook(
    request: ExecutionRequest,
    result: ExecutionResult,
) -> None:
    """End the nanobot task session in the background after execution."""
    if result.session_loop is None or not result.session_id:
        return

    async def _consolidate() -> None:
        try:
            await result.session_loop.end_task_session(result.session_id)
            logger.info(
                "[execution] Memory consolidation done for task '%s' session '%s'",
                request.task_id,
                result.session_id,
            )
        except Exception:
            logger.warning(
                "[execution] Memory consolidation failed for task '%s' session '%s'",
                request.task_id,
                result.session_id,
                exc_info=True,
            )

    create_background_task(_consolidate())


def build_execution_engine(
    *,
    bridge: Any | None = None,
    cron_service: Any | None = None,
    ask_user_registry: Any | None = None,
) -> ExecutionEngine:
    """Create the canonical execution engine used by production runtime paths."""
    return ExecutionEngine(
        strategies={
            RunnerType.NANOBOT: NanobotRunnerStrategy(),
            RunnerType.CLAUDE_CODE: ClaudeCodeRunnerStrategy(
                bridge=bridge,
                cron_service=cron_service,
                ask_user_registry=ask_user_registry,
            ),
            RunnerType.HUMAN: HumanRunnerStrategy(),
        },
        post_execution_hooks=[
            relocate_invalid_memory_hook,
            nanobot_memory_consolidation_hook,
        ],
    )
