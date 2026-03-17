"""Tests for ConversationIntentResolver with workflow-only plan_chat (Story 31.4)."""

from unittest.mock import MagicMock

from mc.contexts.conversation.intent import (
    ConversationIntent,
    ConversationIntentResolver,
    _is_negotiable_status,
)


class TestIsNegotiableStatus:
    """Tests for the _is_negotiable_status gate."""

    def test_workflow_task_in_review_with_plan_review_is_negotiable(self):
        task = {"workMode": "ai_workflow", "status": "review", "reviewPhase": "plan_review"}
        assert _is_negotiable_status(task) is True

    def test_workflow_task_in_review_with_awaiting_kickoff_is_negotiable(self):
        task = {"workMode": "ai_workflow", "status": "review", "awaiting_kickoff": True}
        assert _is_negotiable_status(task) is True

    def test_workflow_task_in_progress_with_plan_is_negotiable(self):
        task = {
            "workMode": "ai_workflow",
            "status": "in_progress",
            "executionPlan": {"steps": [{"id": "s1"}]},
        }
        assert _is_negotiable_status(task) is True

    def test_direct_delegate_task_in_review_is_not_negotiable(self):
        task = {"workMode": "direct_delegate", "status": "review", "reviewPhase": "plan_review"}
        assert _is_negotiable_status(task) is False

    def test_direct_delegate_task_in_progress_with_plan_is_not_negotiable(self):
        task = {
            "workMode": "direct_delegate",
            "status": "in_progress",
            "executionPlan": {"steps": [{"id": "s1"}]},
        }
        assert _is_negotiable_status(task) is False

    def test_no_work_mode_is_not_negotiable(self):
        """Legacy tasks without workMode should not enter plan negotiation."""
        task = {"status": "review", "reviewPhase": "plan_review"}
        assert _is_negotiable_status(task) is False

    def test_human_routed_task_is_not_negotiable(self):
        task = {
            "workMode": "direct_delegate",
            "routingMode": "human",
            "status": "review",
            "reviewPhase": "plan_review",
        }
        assert _is_negotiable_status(task) is False


class TestConversationIntentResolverWorkflowScoping:
    """Tests that plan_chat intent only fires for workflow tasks."""

    def test_workflow_task_gets_plan_chat(self):
        bridge = MagicMock()
        resolver = ConversationIntentResolver(bridge=bridge)
        task = {"workMode": "ai_workflow", "status": "review", "awaiting_kickoff": True}
        result = resolver.resolve("adjust the plan", task)
        assert result.intent == ConversationIntent.PLAN_CHAT

    def test_direct_delegate_task_gets_comment_not_plan_chat(self):
        bridge = MagicMock()
        resolver = ConversationIntentResolver(bridge=bridge)
        task = {
            "workMode": "direct_delegate",
            "status": "review",
            "awaiting_kickoff": True,
        }
        result = resolver.resolve("adjust the plan", task)
        assert result.intent != ConversationIntent.PLAN_CHAT

    def test_human_routed_task_gets_comment_not_plan_chat(self):
        bridge = MagicMock()
        resolver = ConversationIntentResolver(bridge=bridge)
        task = {
            "workMode": "direct_delegate",
            "routingMode": "human",
            "status": "review",
            "awaiting_kickoff": True,
        }
        result = resolver.resolve("adjust the plan", task)
        assert result.intent != ConversationIntent.PLAN_CHAT
