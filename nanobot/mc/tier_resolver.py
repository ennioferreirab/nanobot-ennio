"""Model tier resolver — maps tier references to concrete model strings.

Tier references use the format ``tier:<tier-name>`` (e.g. ``tier:standard-high``).
The resolver fetches the ``model_tiers`` setting from Convex, caches it for 60s,
and returns the mapped model string.

Story 11.1 — AC #3.
"""

from __future__ import annotations

import json
import logging
import time
from typing import TYPE_CHECKING

from nanobot.mc.types import extract_tier_name, is_tier_reference

if TYPE_CHECKING:
    from nanobot.mc.bridge import ConvexBridge

logger = logging.getLogger(__name__)


class TierResolver:
    """Resolves ``tier:`` prefixed model strings to concrete model identifiers.

    Uses the ``model_tiers`` key in the Convex settings table. Results are
    cached for ``CACHE_TTL`` seconds to avoid repeated queries.
    """

    CACHE_TTL = 60.0

    def __init__(self, bridge: ConvexBridge) -> None:
        self._bridge = bridge
        self._cache: dict[str, str | None] = {}
        self._cache_time: float = 0.0

    def _refresh_cache(self) -> None:
        """Fetch model_tiers from Convex and update the local cache."""
        raw = self._bridge.query("settings:get", {"key": "model_tiers"})
        if raw is None:
            self._cache = {}
            self._cache_time = time.monotonic()
            return

        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                self._cache = parsed
            else:
                logger.warning("[tier_resolver] model_tiers is not a dict: %s", type(parsed))
                self._cache = {}
        except (json.JSONDecodeError, TypeError) as exc:
            logger.warning("[tier_resolver] Failed to parse model_tiers: %s", exc)
            self._cache = {}

        self._cache_time = time.monotonic()

    def resolve_model(self, model: str | None) -> str | None:
        """Resolve a model string, handling tier references transparently.

        - If model is None or empty, returns None.
        - If model is NOT a tier reference, returns it unchanged (pass-through).
        - If model IS a tier reference, resolves via cached settings lookup.

        Raises:
            ValueError: If the tier is null, unknown, or settings are missing.
        """
        if not model:
            return None

        if not is_tier_reference(model):
            return model

        tier_name = extract_tier_name(model)
        if tier_name is None:
            raise ValueError(f"Unknown tier: '{model[len('tier:'):]}'")

        # Refresh cache if stale
        if time.monotonic() - self._cache_time > self.CACHE_TTL:
            self._refresh_cache()

        if not self._cache:
            raise ValueError(
                f"Tier '{tier_name}' is not configured (model_tiers setting is missing or empty)"
            )

        if tier_name not in self._cache:
            raise ValueError(f"Unknown tier: '{tier_name}'")

        resolved = self._cache[tier_name]
        if resolved is None:
            raise ValueError(
                f"Tier '{tier_name}' is not configured (set to null)"
            )

        return resolved

    def invalidate_cache(self) -> None:
        """Force a refresh on the next resolve_model() call."""
        self._cache_time = 0.0
