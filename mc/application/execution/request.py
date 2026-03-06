"""Execution request and result value objects for the execution engine.

Story 16.1 — Foundation types that the ExecutionEngine (16.2) consumes
and produces. These decouple callers (executor, step_dispatcher) from
the engine internals.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class RunnerType(str, Enum):
    """Which backend runs the agent work."""

    NANOBOT = "nanobot"
    CLAUDE_CODE = "claude-code"
    HUMAN = "human"


class ErrorCategory(str, Enum):
    """Normalized error categories for centralized handling."""

    TIER = "tier"
    PROVIDER = "provider"
    RUNNER = "runner"
    WORKFLOW = "workflow"


@dataclass
class ExecutionRequest:
    """All inputs needed to execute a task or step.

    The engine inspects ``runner_type`` to select the correct strategy.
    """

    task_id: str
    title: str
    agent_name: str

    runner_type: RunnerType = RunnerType.NANOBOT

    description: str | None = None
    agent_prompt: str | None = None
    agent_model: str | None = None
    agent_skills: list[str] | None = None
    reasoning_level: str | None = None

    trust_level: str = "autonomous"
    board_name: str | None = None
    memory_workspace: str | None = None

    step_id: str | None = None
    task_data: dict[str, Any] = field(default_factory=dict)

    # Pre-computed session key (for nanobot)
    session_key: str | None = None


@dataclass
class ExecutionResult:
    """Outcome of an execution run.

    Carries enough data for post-execution steps (memory consolidation,
    artifact sync, session finalization) without needing the caller to
    know which runner was used.
    """

    success: bool
    output: str = ""

    # Error details (populated on failure)
    error_category: ErrorCategory | None = None
    error_message: str | None = None

    # Runner-specific metadata
    cost_usd: float = 0.0
    session_id: str | None = None
    artifacts: list[dict[str, Any]] = field(default_factory=list)

    # For human strategy: the target status transition
    transition_status: str | None = None
