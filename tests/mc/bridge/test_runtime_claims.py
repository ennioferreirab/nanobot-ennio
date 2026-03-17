from __future__ import annotations

from unittest.mock import MagicMock

from mc.bridge.runtime_claims import acquire_runtime_claim


def test_acquire_runtime_claim_returns_false_on_unexpected_response() -> None:
    bridge = MagicMock()
    bridge.mutation.return_value = {"claimId": "claim-1"}

    claimed = acquire_runtime_claim(
        bridge,
        claim_kind="review:v1:review:none",
        entity_type="task",
        entity_id="task-1",
    )

    assert claimed is False
