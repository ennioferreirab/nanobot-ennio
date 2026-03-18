"""Settings repository -- settings-related queries and mutations.

Currently a placeholder for future settings data access methods.
The ConvexBridge does not yet expose dedicated settings methods,
but this module is created as part of the repository pattern
to provide a home for settings-related data access.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from mc.bridge.client import BridgeClientProtocol

logger = logging.getLogger(__name__)


class SettingsRepository:
    """Data access methods for settings in Convex."""

    def __init__(self, client: BridgeClientProtocol):
        self._client = client

    def get_review_loop_limit(self) -> int:
        """Fetch the global review loop limit from settings.

        Returns:
            The configured limit (default 5). 0 means unlimited.
        """
        result = self._client.query("settings:getReviewLoopLimit", {})
        if result is None:
            return 5
        try:
            return int(result)
        except (TypeError, ValueError):
            return 5
