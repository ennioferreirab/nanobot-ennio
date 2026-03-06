"""Tests for ExecutionRequest and ExecutionResult value objects."""

from mc.application.execution.request import (
    ErrorCategory,
    ExecutionRequest,
    ExecutionResult,
    RunnerType,
)


class TestRunnerType:
    def test_nanobot_value(self) -> None:
        assert RunnerType.NANOBOT.value == "nanobot"

    def test_claude_code_value(self) -> None:
        assert RunnerType.CLAUDE_CODE.value == "claude-code"

    def test_human_value(self) -> None:
        assert RunnerType.HUMAN.value == "human"


class TestErrorCategory:
    def test_all_categories(self) -> None:
        assert ErrorCategory.TIER.value == "tier"
        assert ErrorCategory.PROVIDER.value == "provider"
        assert ErrorCategory.RUNNER.value == "runner"
        assert ErrorCategory.WORKFLOW.value == "workflow"


class TestExecutionRequest:
    def test_minimal_request(self) -> None:
        req = ExecutionRequest(
            task_id="task_123",
            title="Test Task",
            agent_name="nanobot",
        )
        assert req.task_id == "task_123"
        assert req.title == "Test Task"
        assert req.agent_name == "nanobot"
        assert req.runner_type == RunnerType.NANOBOT
        assert req.description is None
        assert req.agent_prompt is None
        assert req.agent_model is None
        assert req.agent_skills is None
        assert req.reasoning_level is None
        assert req.trust_level == "autonomous"
        assert req.board_name is None
        assert req.memory_workspace is None
        assert req.step_id is None
        assert req.task_data == {}
        assert req.session_key is None

    def test_full_request(self) -> None:
        req = ExecutionRequest(
            task_id="task_456",
            title="Full Task",
            agent_name="writer",
            runner_type=RunnerType.CLAUDE_CODE,
            description="Write a report",
            agent_prompt="You are a writer.",
            agent_model="cc/claude-sonnet-4-20250514",
            agent_skills=["writing", "research"],
            reasoning_level="medium",
            trust_level="human_approved",
            board_name="dev-board",
            memory_workspace="/tmp/memory",
            step_id="step_789",
            task_data={"board_id": "board_1"},
            session_key="mc:task:writer:task_456",
        )
        assert req.runner_type == RunnerType.CLAUDE_CODE
        assert req.agent_skills == ["writing", "research"]
        assert req.step_id == "step_789"

    def test_human_request(self) -> None:
        req = ExecutionRequest(
            task_id="task_human",
            title="Human Review",
            agent_name="reviewer",
            runner_type=RunnerType.HUMAN,
        )
        assert req.runner_type == RunnerType.HUMAN


class TestExecutionResult:
    def test_success_result(self) -> None:
        result = ExecutionResult(success=True, output="Done!")
        assert result.success is True
        assert result.output == "Done!"
        assert result.error_category is None
        assert result.error_message is None
        assert result.cost_usd == 0.0
        assert result.session_id is None
        assert result.artifacts == []
        assert result.transition_status is None

    def test_error_result(self) -> None:
        result = ExecutionResult(
            success=False,
            error_category=ErrorCategory.PROVIDER,
            error_message="OAuth expired",
        )
        assert result.success is False
        assert result.error_category == ErrorCategory.PROVIDER
        assert result.error_message == "OAuth expired"

    def test_result_with_metadata(self) -> None:
        result = ExecutionResult(
            success=True,
            output="All done",
            cost_usd=0.0534,
            session_id="sess_abc123",
            artifacts=[{"path": "output/report.pdf", "action": "created"}],
        )
        assert result.cost_usd == 0.0534
        assert result.session_id == "sess_abc123"
        assert len(result.artifacts) == 1

    def test_transition_status(self) -> None:
        result = ExecutionResult(
            success=True,
            output="Waiting for human.",
            transition_status="waiting_human",
        )
        assert result.transition_status == "waiting_human"
