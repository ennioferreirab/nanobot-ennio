"""Tests for TagAttributesCache TTL behavior."""

from __future__ import annotations

import time
from unittest.mock import MagicMock

from mc.bridge.tag_attributes_cache import TagAttributesCache


class TestTagAttributesCache:
    """Test TTL-based caching for tag attributes queries."""

    def test_cache_hit_within_ttl(self) -> None:
        """Cached value is returned without querying Convex on subsequent calls."""
        bridge = MagicMock()
        bridge.query.return_value = [{"name": "priority"}]
        cache = TagAttributesCache(bridge, ttl_seconds=60)

        first = cache.get()
        second = cache.get()

        assert first == [{"name": "priority"}]
        assert second == [{"name": "priority"}]
        assert bridge.query.call_count == 1

    def test_cache_miss_after_ttl(self) -> None:
        """Expired entries trigger a new Convex query."""
        bridge = MagicMock()
        bridge.query.return_value = [{"name": "old"}]
        cache = TagAttributesCache(bridge, ttl_seconds=0.01)

        first = cache.get()
        assert first == [{"name": "old"}]

        time.sleep(0.02)

        bridge.query.return_value = [{"name": "new"}]
        second = cache.get()

        assert second == [{"name": "new"}]
        assert bridge.query.call_count == 2

    def test_returns_stale_on_query_failure(self) -> None:
        """On query failure, returns stale cached value if available."""
        bridge = MagicMock()
        bridge.query.return_value = [{"name": "cached"}]
        cache = TagAttributesCache(bridge, ttl_seconds=0.01)

        first = cache.get()
        assert first == [{"name": "cached"}]

        time.sleep(0.02)
        bridge.query.side_effect = RuntimeError("Convex down")

        second = cache.get()
        assert second == [{"name": "cached"}]

    def test_returns_empty_on_first_query_failure(self) -> None:
        """On first query failure with no stale data, returns empty list."""
        bridge = MagicMock()
        bridge.query.side_effect = RuntimeError("Convex down")
        cache = TagAttributesCache(bridge, ttl_seconds=60)

        result = cache.get()
        assert result == []

    def test_invalidate_forces_refresh(self) -> None:
        """Invalidating forces re-query on next get."""
        bridge = MagicMock()
        bridge.query.return_value = [{"name": "first"}]
        cache = TagAttributesCache(bridge, ttl_seconds=60)

        cache.get()
        bridge.query.return_value = [{"name": "second"}]
        cache.invalidate()
        result = cache.get()

        assert result == [{"name": "second"}]
        assert bridge.query.call_count == 2

    def test_non_list_result_not_cached(self) -> None:
        """Non-list query results are not cached."""
        bridge = MagicMock()
        bridge.query.return_value = None
        cache = TagAttributesCache(bridge, ttl_seconds=60)

        result = cache.get()
        assert result == []

        bridge.query.return_value = [{"name": "real"}]
        result = cache.get()
        assert result == [{"name": "real"}]
        assert bridge.query.call_count == 2
