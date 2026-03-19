"""Unified filter for provider CLI events before they reach the activity log.

Events matched here are internal provider lifecycle noise that carries no
useful information for the dashboard Live panel.  They are silently dropped
before being written to Convex, keeping the activity log clean.

To suppress a new event pattern, add an entry to the appropriate set below.
"""

from __future__ import annotations

from mc.contexts.provider_cli.types import ParsedCliEvent

# ---------------------------------------------------------------------------
# Claude Code — system subtypes that are pure lifecycle noise
# ---------------------------------------------------------------------------
_CLAUDE_CODE_NOISE_SUBTYPES: frozenset[str] = frozenset(
    {
        "task_progress",
        "task_started",
        "task_notification",
    }
)

# ---------------------------------------------------------------------------
# Generic event kinds to suppress regardless of provider
# ---------------------------------------------------------------------------
_SUPPRESSED_KINDS: frozenset[str] = frozenset()


def should_suppress_activity_event(event: ParsedCliEvent) -> bool:
    """Return True if the event should NOT be written to the activity log."""
    if event.kind in _SUPPRESSED_KINDS:
        return True

    metadata = event.metadata or {}

    # Claude Code system subtypes
    if metadata.get("source_type") == "system":
        subtype = metadata.get("source_subtype") or metadata.get("subtype") or ""
        if subtype in _CLAUDE_CODE_NOISE_SUBTYPES:
            return True

    return False
