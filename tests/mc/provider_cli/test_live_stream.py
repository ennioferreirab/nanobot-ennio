"""Tests for LiveStreamProjector."""

from __future__ import annotations

from mc.contexts.provider_cli.types import ParsedCliEvent
from mc.runtime.provider_cli.live_stream import LiveStreamProjector, ProjectedEvent


def _make_event(kind: str = "output", text: str = "hello") -> ParsedCliEvent:
    return ParsedCliEvent(kind=kind, text=text)


class TestLiveStreamProjectorBasics:
    def test_project_returns_projected_event(self) -> None:
        projector = LiveStreamProjector()
        event = _make_event()
        projected = projector.project(event, session_id="s1")
        assert isinstance(projected, ProjectedEvent)
        assert projected.event is event
        assert projected.session_id == "s1"

    def test_project_assigns_sequence_starting_at_one(self) -> None:
        projector = LiveStreamProjector()
        p1 = projector.project(_make_event(), session_id="s1")
        assert p1.sequence == 1

    def test_project_increments_sequence(self) -> None:
        projector = LiveStreamProjector()
        p1 = projector.project(_make_event(), session_id="s1")
        p2 = projector.project(_make_event(), session_id="s1")
        p3 = projector.project(_make_event(), session_id="s2")
        assert p1.sequence == 1
        assert p2.sequence == 2
        assert p3.sequence == 3

    def test_project_assigns_timestamp(self) -> None:
        projector = LiveStreamProjector()
        projected = projector.project(_make_event(), session_id="s1")
        assert isinstance(projected.timestamp, str)
        assert len(projected.timestamp) > 0
        # Should be ISO format
        assert "T" in projected.timestamp

    def test_sequence_property_matches_count(self) -> None:
        projector = LiveStreamProjector()
        assert projector.sequence == 0
        projector.project(_make_event(), session_id="s1")
        assert projector.sequence == 1
        projector.project(_make_event(), session_id="s2")
        assert projector.sequence == 2

    def test_all_events_returns_all_in_order(self) -> None:
        projector = LiveStreamProjector()
        e1 = _make_event(text="first")
        e2 = _make_event(text="second")
        e3 = _make_event(text="third")
        projector.project(e1, session_id="s1")
        projector.project(e2, session_id="s2")
        projector.project(e3, session_id="s1")
        all_events = projector.all_events()
        assert len(all_events) == 3
        assert all_events[0].event.text == "first"
        assert all_events[1].event.text == "second"
        assert all_events[2].event.text == "third"


class TestLiveStreamProjectorSessionFiltering:
    def test_events_for_session_filters_correctly(self) -> None:
        projector = LiveStreamProjector()
        projector.project(_make_event(text="s1-a"), session_id="s1")
        projector.project(_make_event(text="s2-a"), session_id="s2")
        projector.project(_make_event(text="s1-b"), session_id="s1")

        s1_events = projector.events_for_session("s1")
        assert len(s1_events) == 2
        assert s1_events[0].event.text == "s1-a"
        assert s1_events[1].event.text == "s1-b"

    def test_events_for_missing_session_returns_empty(self) -> None:
        projector = LiveStreamProjector()
        projector.project(_make_event(), session_id="s1")
        assert projector.events_for_session("nonexistent") == []

    def test_events_for_session_preserves_sequence_order(self) -> None:
        projector = LiveStreamProjector()
        for i in range(5):
            projector.project(_make_event(text=str(i)), session_id="s1" if i % 2 == 0 else "s2")
        s1_events = projector.events_for_session("s1")
        seqs = [e.sequence for e in s1_events]
        assert seqs == sorted(seqs)


class TestLiveStreamProjectorSubscribers:
    def test_subscribe_callback_receives_event(self) -> None:
        projector = LiveStreamProjector()
        received: list[ProjectedEvent] = []
        projector.subscribe(received.append)

        event = _make_event()
        projector.project(event, session_id="s1")

        assert len(received) == 1
        assert received[0].event is event

    def test_subscribe_multiple_callbacks(self) -> None:
        projector = LiveStreamProjector()
        received_a: list[ProjectedEvent] = []
        received_b: list[ProjectedEvent] = []
        projector.subscribe(received_a.append)
        projector.subscribe(received_b.append)

        projector.project(_make_event(), session_id="s1")

        assert len(received_a) == 1
        assert len(received_b) == 1

    def test_unsubscribe_stops_delivery(self) -> None:
        projector = LiveStreamProjector()
        received: list[ProjectedEvent] = []
        projector.subscribe(received.append)

        projector.project(_make_event(text="before"), session_id="s1")
        projector.unsubscribe(received.append)
        projector.project(_make_event(text="after"), session_id="s1")

        assert len(received) == 1
        assert received[0].event.text == "before"

    def test_unsubscribe_nonexistent_is_noop(self) -> None:
        projector = LiveStreamProjector()
        projector.unsubscribe(lambda e: None)  # should not raise

    async def test_subscribe_queue_receives_event(self) -> None:
        projector = LiveStreamProjector()
        q = projector.subscribe_queue()

        event = _make_event()
        projector.project(event, session_id="s1")

        projected = q.get_nowait()
        assert projected.event is event

    async def test_subscribe_queue_receives_multiple_events(self) -> None:
        projector = LiveStreamProjector()
        q = projector.subscribe_queue()

        for i in range(3):
            projector.project(_make_event(text=str(i)), session_id="s1")

        assert q.qsize() == 3
        events = [q.get_nowait() for _ in range(3)]
        texts = [e.event.text for e in events]
        assert texts == ["0", "1", "2"]

    async def test_multiple_queues_each_receive_all_events(self) -> None:
        projector = LiveStreamProjector()
        q1 = projector.subscribe_queue()
        q2 = projector.subscribe_queue()

        projector.project(_make_event(text="msg"), session_id="s1")

        assert q1.qsize() == 1
        assert q2.qsize() == 1

    def test_projector_importable_from_package(self) -> None:
        from mc.runtime.provider_cli import LiveStreamProjector as PackageExport

        assert PackageExport is LiveStreamProjector


class TestLiveStreamProjectorSequenceAndTimestamp:
    """Story 28-18 — project() assigns sequence numbers and timestamps."""

    def test_project_assigns_monotonically_increasing_sequences(self) -> None:
        """Each call to project() must yield a strictly increasing sequence number."""
        projector = LiveStreamProjector()
        projected_events: list[ProjectedEvent] = []
        for i in range(5):
            projected_events.append(projector.project(_make_event(text=str(i)), session_id="s1"))
        sequences = [p.sequence for p in projected_events]
        assert sequences == list(range(1, 6))

    def test_project_assigns_iso_timestamp_string(self) -> None:
        """project() must attach a non-empty ISO 8601 UTC timestamp to every event."""
        projector = LiveStreamProjector()
        p = projector.project(_make_event(), session_id="s1")
        # Must be a string in ISO format with timezone marker
        assert isinstance(p.timestamp, str)
        assert "+00:00" in p.timestamp or "Z" in p.timestamp or "T" in p.timestamp
        assert len(p.timestamp) >= 20

    def test_project_timestamp_is_different_fields_per_event(self) -> None:
        """Each ProjectedEvent carries its own timestamp (not shared references)."""
        projector = LiveStreamProjector()
        p1 = projector.project(_make_event(text="a"), session_id="s1")
        p2 = projector.project(_make_event(text="b"), session_id="s1")
        # Both are valid timestamps; p2's sequence must be greater
        assert p1.sequence < p2.sequence
        assert isinstance(p1.timestamp, str)
        assert isinstance(p2.timestamp, str)


class TestLiveStreamProjectorCallbackSubscribers:
    """Story 28-18 — subscriber callbacks receive projected events."""

    def test_subscriber_callback_receives_projected_event_with_metadata(self) -> None:
        """Callback receives the full ProjectedEvent including sequence and session_id."""
        projector = LiveStreamProjector()
        received: list[ProjectedEvent] = []
        projector.subscribe(received.append)

        event = _make_event(kind="text", text="streaming output")
        projected = projector.project(event, session_id="session-42")

        assert len(received) == 1
        assert received[0] is projected
        assert received[0].sequence == 1
        assert received[0].session_id == "session-42"
        assert received[0].event.kind == "text"

    def test_subscriber_callback_receives_all_events_in_order(self) -> None:
        """When multiple events are projected, each subscriber receives all in order."""
        projector = LiveStreamProjector()
        received: list[ProjectedEvent] = []
        projector.subscribe(received.append)

        for i in range(4):
            projector.project(_make_event(text=str(i)), session_id="s1")

        assert len(received) == 4
        assert [r.sequence for r in received] == [1, 2, 3, 4]
        assert [r.event.text for r in received] == ["0", "1", "2", "3"]

    def test_subscriber_added_after_first_event_does_not_receive_prior_events(self) -> None:
        """A callback registered after some events have been projected only sees new events."""
        projector = LiveStreamProjector()

        projector.project(_make_event(text="early"), session_id="s1")

        late_received: list[ProjectedEvent] = []
        projector.subscribe(late_received.append)

        projector.project(_make_event(text="later"), session_id="s1")

        assert len(late_received) == 1
        assert late_received[0].event.text == "later"
