"""TTL cache for tagAttributes:list queries.

The tag attributes catalog changes rarely (admin-only operations), so a
5-minute TTL is safe and eliminates redundant Convex queries across
context_builder, post_processing, and cc_executor.
"""

from __future__ import annotations

import logging
import time
from typing import Any

logger = logging.getLogger(__name__)

TAG_ATTRIBUTES_TTL_SECONDS = 300  # 5 minutes


class TagAttributesCache:
    """Instance-level TTL cache for the tag attributes catalog.

    Similar to ``SettingsCache`` — stores the full catalog as a single
    cached value with a configurable TTL.

    Args:
        bridge: ConvexBridge instance for querying Convex.
        ttl_seconds: Time-to-live for cached values.
    """

    def __init__(self, bridge: Any, ttl_seconds: float = TAG_ATTRIBUTES_TTL_SECONDS) -> None:
        self._bridge = bridge
        self._ttl = ttl_seconds
        self._cache: list[dict[str, Any]] | None = None
        self._cache_time: float = 0.0

    def get(self) -> list[dict[str, Any]]:
        """Return the tag attribute catalog, using a TTL cache.

        Returns:
            List of tag attribute records (snake_case keys).
        """
        now = time.monotonic()
        if self._cache is not None and now - self._cache_time < self._ttl:
            return self._cache

        try:
            result = self._bridge.query("tagAttributes:list", {})
            if isinstance(result, list):
                self._cache = result
                self._cache_time = now
                return self._cache
        except Exception:
            logger.warning("[tag-attrs-cache] Failed to fetch tagAttributes:list", exc_info=True)

        # Return stale cache if available, otherwise empty
        return self._cache if self._cache is not None else []

    def invalidate(self) -> None:
        """Force a refresh on the next get() call."""
        self._cache = None
        self._cache_time = 0.0
