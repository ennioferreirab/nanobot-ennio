"""Runtime home compatibility helpers."""

from __future__ import annotations

import logging
import os
from pathlib import Path

OPEN_CONTROL_HOME_ENV = "OPEN_CONTROL_HOME"
NANOBOT_HOME_ENV = "NANOBOT_HOME"
LEGACY_RUNTIME_HOME = ".nanobot"

_logger = logging.getLogger(__name__)
_resolved: Path | None = None
_resolved_from_env: str | None = None


def get_runtime_home() -> Path:
    """Return the configured runtime home with Open Control compatibility."""
    global _resolved, _resolved_from_env
    current_env = os.environ.get(OPEN_CONTROL_HOME_ENV) or os.environ.get(NANOBOT_HOME_ENV)
    if _resolved is not None and _resolved_from_env == current_env:
        return _resolved

    for env_name in (OPEN_CONTROL_HOME_ENV, NANOBOT_HOME_ENV):
        configured = os.environ.get(env_name)
        if configured:
            _resolved = Path(configured).expanduser()
            _resolved_from_env = configured
            _logger.info("Runtime home resolved to: %s (source: %s)", _resolved, env_name)
            return _resolved

    _resolved = Path.home() / LEGACY_RUNTIME_HOME
    _resolved_from_env = None
    _logger.info("Runtime home resolved to: %s (source: default)", _resolved)
    return _resolved


def get_runtime_path(*parts: str) -> Path:
    """Return a path rooted at the configured runtime home."""
    return get_runtime_home().joinpath(*parts)


def get_agents_dir() -> Path:
    """Return the agents directory."""
    return get_runtime_path("agents")


def get_boards_dir() -> Path:
    """Return the boards directory."""
    return get_runtime_path("boards")


def get_tasks_dir() -> Path:
    """Return the tasks directory."""
    return get_runtime_path("tasks")


def get_workspace_dir() -> Path:
    """Return the shared workspace directory."""
    return get_runtime_path("workspace")


def get_config_path() -> Path:
    """Return the provider config path."""
    return get_runtime_path("config.json")


def get_secrets_path() -> Path:
    """Return the secrets file path."""
    return get_runtime_path("secrets.json")
