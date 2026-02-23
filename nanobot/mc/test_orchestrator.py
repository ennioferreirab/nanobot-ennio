"""Unit tests for the Task Orchestrator (capability matching, inbox routing,
execution planning, review routing)."""

from __future__ import annotations

import asyncio
from unittest.mock import MagicMock, call, patch

import pytest

from nanobot.mc.orchestrator import (
    LEAD_AGENT_NAME,
    TaskOrchestrator,
    extract_keywords,
    get_ready_steps,
    is_multi_step,
    score_agent,
)
from nanobot.mc.types import (
    AgentData,
    ActivityEventType,
    AuthorType,
    ExecutionPlan,
    ExecutionPlanStep,
    MessageType,
    TaskStatus,
    TrustLevel,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_agent(name: str, skills: list[str] | None = None) -> AgentData:
    """Create an AgentData instance for testing."""
    return AgentData(
        name=name,
        display_name=name.replace("-", " ").title(),
        role="Test Agent",
        skills=skills or [],
    )


def _make_bridge() -> MagicMock:
    """Create a mock ConvexBridge with orchestrator-relevant methods."""
    bridge = MagicMock()
    bridge.update_task_status.return_value = None
    bridge.create_activity.return_value = None
    bridge.send_message.return_value = None
    bridge.list_agents.return_value = []
    bridge.subscribe.return_value = iter([])
    return bridge


def _make_task(
    task_id: str = "task123",
    title: str = "Test task",
    description: str | None = None,
    assigned_agent: str | None = None,
    status: str = "inbox",
    trust_level: str = "autonomous",
    reviewers: list[str] | None = None,
) -> dict:
    """Create a task dict as returned by the bridge."""
    return {
        "id": task_id,
        "title": title,
        "description": description,
        "assigned_agent": assigned_agent,
        "status": status,
        "trust_level": trust_level,
        "reviewers": reviewers,
        "created_at": "2025-01-01T00:00:00Z",
        "updated_at": "2025-01-01T00:00:00Z",
    }


# ---------------------------------------------------------------------------
# Test: Keyword Extraction
# ---------------------------------------------------------------------------

class TestExtractKeywords:
    """Tests for extract_keywords()."""

    def test_basic_extraction(self) -> None:
        keywords = extract_keywords("Fix login bug")
        assert "fix" in keywords
        assert "login" in keywords
        assert "bug" in keywords

    def test_stopwords_removed(self) -> None:
        keywords = extract_keywords("This is a test for the system")
        assert "this" not in keywords
        assert "the" not in keywords
        assert "for" not in keywords
        assert "test" in keywords
        assert "system" in keywords

    def test_short_tokens_removed(self) -> None:
        keywords = extract_keywords("Go to DB and fix it")
        assert "go" not in keywords
        assert "to" not in keywords
        assert "db" not in keywords
        assert "fix" in keywords

    def test_description_included(self) -> None:
        keywords = extract_keywords("Fix bug", "The login page crashes on submit")
        assert "login" in keywords
        assert "page" in keywords
        assert "crashes" in keywords
        assert "submit" in keywords

    def test_none_description(self) -> None:
        keywords = extract_keywords("Verify boletos vencendo", None)
        assert "verify" in keywords
        assert "boletos" in keywords
        assert "vencendo" in keywords

    def test_special_characters_split(self) -> None:
        keywords = extract_keywords("fix-login_bug/issue#123")
        assert "fix" in keywords
        assert "login" in keywords
        assert "bug" in keywords
        assert "issue" in keywords
        assert "123" in keywords

    def test_empty_title(self) -> None:
        keywords = extract_keywords("")
        assert keywords == []

    def test_case_insensitive(self) -> None:
        keywords = extract_keywords("FIX Login BUG")
        assert "fix" in keywords
        assert "login" in keywords
        assert "bug" in keywords


# ---------------------------------------------------------------------------
# Test: Agent Scoring
# ---------------------------------------------------------------------------

class TestScoreAgent:
    """Tests for score_agent()."""

    def test_exact_skill_match(self) -> None:
        agent = _make_agent("dev", skills=["coding", "debugging"])
        score = score_agent(agent, ["coding"])
        assert score >= 1.0

    def test_no_skill_match(self) -> None:
        agent = _make_agent("dev", skills=["coding", "debugging"])
        score = score_agent(agent, ["cooking", "painting"])
        assert score == 0.0

    def test_partial_match_keyword_in_skill(self) -> None:
        agent = _make_agent("dev", skills=["financial-analysis"])
        score = score_agent(agent, ["financial"])
        # "financial" is contained in "financial-analysis"
        assert score > 0.0

    def test_partial_match_skill_in_keyword(self) -> None:
        agent = _make_agent("dev", skills=["code"])
        score = score_agent(agent, ["codebase"])
        # "code" is contained in "codebase"
        assert score > 0.0

    def test_no_skills_returns_zero(self) -> None:
        agent = _make_agent("dev", skills=[])
        score = score_agent(agent, ["coding"])
        assert score == 0.0

    def test_no_keywords_returns_zero(self) -> None:
        agent = _make_agent("dev", skills=["coding"])
        score = score_agent(agent, [])
        assert score == 0.0

    def test_multiple_matches_accumulate(self) -> None:
        agent = _make_agent("dev", skills=["coding", "testing", "debugging"])
        score = score_agent(agent, ["coding", "testing"])
        assert score >= 2.0

    def test_agent_with_higher_overlap_scores_higher(self) -> None:
        agent_a = _make_agent("narrow", skills=["coding"])
        agent_b = _make_agent("broad", skills=["coding", "testing", "debugging"])
        keywords = ["coding", "testing", "debugging"]
        assert score_agent(agent_b, keywords) > score_agent(agent_a, keywords)

    def test_case_insensitive_skills(self) -> None:
        agent = _make_agent("dev", skills=["Coding", "TESTING"])
        score = score_agent(agent, ["coding", "testing"])
        assert score >= 2.0


# ---------------------------------------------------------------------------
# Test: Routing — best agent selected
# ---------------------------------------------------------------------------

class TestRouting:
    """Tests for TaskOrchestrator._process_inbox_task routing logic."""

    @pytest.mark.asyncio
    async def test_routes_to_best_matching_agent(self) -> None:
        bridge = _make_bridge()
        bridge.list_agents.return_value = [
            {"name": "finance-agent", "display_name": "Finance Agent",
             "role": "Financial", "skills": ["financial", "boletos"]},
            {"name": "dev-agent", "display_name": "Dev Agent",
             "role": "Developer", "skills": ["coding", "debugging"]},
        ]

        orchestrator = TaskOrchestrator(bridge)
        task = _make_task(title="Verificar boletos vencendo")

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator._process_inbox_task(task)

        bridge.update_task_status.assert_called_once()
        call_args = bridge.update_task_status.call_args
        assert call_args[0][0] == "task123"  # task_id
        assert call_args[0][1] == TaskStatus.ASSIGNED
        assert call_args[0][2] == "finance-agent"

    @pytest.mark.asyncio
    async def test_fallback_to_lead_agent_when_no_match(self) -> None:
        bridge = _make_bridge()
        bridge.list_agents.return_value = [
            {"name": "finance-agent", "display_name": "Finance Agent",
             "role": "Financial", "skills": ["financial", "boletos"]},
        ]

        orchestrator = TaskOrchestrator(bridge)
        task = _make_task(title="Translate document to Japanese")

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator._process_inbox_task(task)

        bridge.update_task_status.assert_called_once()
        call_args = bridge.update_task_status.call_args
        assert call_args[0][2] == LEAD_AGENT_NAME

        # Verify fallback activity message
        bridge.create_activity.assert_called_once()
        activity_args = bridge.create_activity.call_args
        assert "No specialist found" in activity_args[0][1]

    @pytest.mark.asyncio
    async def test_explicit_assignment_respected(self) -> None:
        bridge = _make_bridge()
        orchestrator = TaskOrchestrator(bridge)
        task = _make_task(
            title="Some task",
            assigned_agent="secretario",
        )

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator._process_inbox_task(task)

        # Should NOT call list_agents (no re-routing)
        bridge.list_agents.assert_not_called()

        # Should transition to assigned with the explicit agent
        bridge.update_task_status.assert_called_once()
        call_args = bridge.update_task_status.call_args
        assert call_args[0][2] == "secretario"

    @pytest.mark.asyncio
    async def test_activity_event_created_on_routing(self) -> None:
        bridge = _make_bridge()
        bridge.list_agents.return_value = [
            {"name": "dev-agent", "display_name": "Dev Agent",
             "role": "Developer", "skills": ["coding"]},
        ]

        orchestrator = TaskOrchestrator(bridge)
        task = _make_task(title="Fix coding bug")

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator._process_inbox_task(task)

        bridge.create_activity.assert_called_once()
        activity_args = bridge.create_activity.call_args
        assert activity_args[0][0] == ActivityEventType.TASK_ASSIGNED
        assert "dev-agent" in activity_args[0][1]

    @pytest.mark.asyncio
    async def test_activity_event_created_on_explicit_assignment(self) -> None:
        bridge = _make_bridge()
        orchestrator = TaskOrchestrator(bridge)
        task = _make_task(title="Do thing", assigned_agent="my-agent")

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator._process_inbox_task(task)

        bridge.create_activity.assert_called_once()
        activity_args = bridge.create_activity.call_args
        assert activity_args[0][0] == ActivityEventType.TASK_ASSIGNED

    @pytest.mark.asyncio
    async def test_skips_task_without_id(self) -> None:
        bridge = _make_bridge()
        orchestrator = TaskOrchestrator(bridge)
        task = {"title": "No id task", "status": "inbox"}

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator._process_inbox_task(task)

        bridge.update_task_status.assert_not_called()
        bridge.create_activity.assert_not_called()

    @pytest.mark.asyncio
    async def test_no_agents_falls_back_to_lead(self) -> None:
        bridge = _make_bridge()
        bridge.list_agents.return_value = []

        orchestrator = TaskOrchestrator(bridge)
        task = _make_task(title="Do something")

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator._process_inbox_task(task)

        call_args = bridge.update_task_status.call_args
        assert call_args[0][2] == LEAD_AGENT_NAME


# ---------------------------------------------------------------------------
# Test: Concurrent routing
# ---------------------------------------------------------------------------

class TestConcurrentRouting:
    """Tests for handling multiple concurrent tasks (NFR11)."""

    @pytest.mark.asyncio
    async def test_multiple_tasks_routed_independently(self) -> None:
        bridge = _make_bridge()
        bridge.list_agents.return_value = [
            {"name": "finance-agent", "display_name": "Finance Agent",
             "role": "Financial", "skills": ["financial", "boletos"]},
            {"name": "dev-agent", "display_name": "Dev Agent",
             "role": "Developer", "skills": ["coding", "debugging"]},
            {"name": "translator", "display_name": "Translator",
             "role": "Translation", "skills": ["translation", "japanese"]},
        ]

        orchestrator = TaskOrchestrator(bridge)
        tasks = [
            _make_task(task_id="t1", title="Verificar boletos"),
            _make_task(task_id="t2", title="Fix coding bug"),
            _make_task(task_id="t3", title="Translate to Japanese"),
            _make_task(task_id="t4", title="Unknown random task"),
        ]

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            for task in tasks:
                await orchestrator._process_inbox_task(task)

        assert bridge.update_task_status.call_count == 4
        assert bridge.create_activity.call_count == 4

        # Verify each task got the right agent
        calls = bridge.update_task_status.call_args_list
        assigned_agents = {c[0][0]: c[0][2] for c in calls}
        assert assigned_agents["t1"] == "finance-agent"
        assert assigned_agents["t2"] == "dev-agent"
        assert assigned_agents["t3"] == "translator"
        assert assigned_agents["t4"] == LEAD_AGENT_NAME


# ---------------------------------------------------------------------------
# Test: Routing loop
# ---------------------------------------------------------------------------

class TestRoutingLoop:
    """Tests for the start_routing_loop subscription-based loop."""

    @pytest.mark.asyncio
    async def test_routing_loop_processes_subscription_batches(self) -> None:
        bridge = _make_bridge()
        bridge.list_agents.return_value = [
            {"name": "dev-agent", "display_name": "Dev Agent",
             "role": "Developer", "skills": ["coding"]},
        ]

        # Simulate two subscription updates: first with 1 task, then 1 more
        batch1 = [_make_task(task_id="t1", title="Fix coding issue")]
        batch2 = [_make_task(task_id="t2", title="Another coding task")]
        bridge.subscribe.return_value = iter([batch1, batch2])

        orchestrator = TaskOrchestrator(bridge)

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator.start_routing_loop()

        assert bridge.update_task_status.call_count == 2

    @pytest.mark.asyncio
    async def test_routing_loop_skips_none(self) -> None:
        bridge = _make_bridge()
        bridge.subscribe.return_value = iter([None, []])

        orchestrator = TaskOrchestrator(bridge)

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator.start_routing_loop()

        bridge.update_task_status.assert_not_called()


# ---------------------------------------------------------------------------
# Test: Execution Plan types (Story 4.2)
# ---------------------------------------------------------------------------

class TestExecutionPlanTypes:
    """Tests for ExecutionPlan and ExecutionPlanStep dataclasses."""

    def test_plan_to_dict_camel_case(self) -> None:
        plan = ExecutionPlan(steps=[
            ExecutionPlanStep(step_id="step_1", description="Do A"),
            ExecutionPlanStep(step_id="step_2", description="Do B", depends_on=["step_1"]),
        ])
        d = plan.to_dict()
        assert d["steps"][0]["stepId"] == "step_1"
        assert d["steps"][1]["dependsOn"] == ["step_1"]
        assert "createdAt" in d

    def test_plan_from_dict_camel(self) -> None:
        data = {
            "steps": [
                {"stepId": "s1", "description": "A", "status": "completed"},
                {"stepId": "s2", "description": "B", "dependsOn": ["s1"]},
            ],
            "createdAt": "2025-01-01T00:00:00Z",
        }
        plan = ExecutionPlan.from_dict(data)
        assert len(plan.steps) == 2
        assert plan.steps[0].step_id == "s1"
        assert plan.steps[0].status == "completed"
        assert plan.steps[1].depends_on == ["s1"]

    def test_plan_from_dict_snake(self) -> None:
        data = {
            "steps": [
                {"step_id": "s1", "description": "A", "depends_on": [], "status": "pending"},
            ],
            "created_at": "2025-01-01T00:00:00Z",
        }
        plan = ExecutionPlan.from_dict(data)
        assert plan.steps[0].step_id == "s1"

    def test_roundtrip(self) -> None:
        original = ExecutionPlan(steps=[
            ExecutionPlanStep(
                step_id="step_1", description="Research",
                assigned_agent="researcher", parallel_group="group_0",
            ),
            ExecutionPlanStep(
                step_id="step_2", description="Write",
                assigned_agent="writer", parallel_group="group_0",
            ),
            ExecutionPlanStep(
                step_id="step_3", description="Review",
                depends_on=["step_1", "step_2"],
            ),
        ])
        d = original.to_dict()
        restored = ExecutionPlan.from_dict(d)
        assert len(restored.steps) == 3
        assert restored.steps[2].depends_on == ["step_1", "step_2"]


# ---------------------------------------------------------------------------
# Test: Multi-step detection (Story 4.2)
# ---------------------------------------------------------------------------

class TestMultiStepDetection:
    """Tests for is_multi_step() heuristic."""

    def test_numbered_list(self) -> None:
        assert is_multi_step("1. Research 2. Write 3. Review") is True

    def test_sequence_keywords(self) -> None:
        assert is_multi_step("First research the topic then write a summary") is True

    def test_bullet_list(self) -> None:
        assert is_multi_step("Tasks:\n- Research\n- Write") is True

    def test_step_keyword(self) -> None:
        assert is_multi_step("Complete step 1 and step 2") is True

    def test_simple_task_no_plan(self) -> None:
        assert is_multi_step("Check my email") is False

    def test_single_word(self) -> None:
        assert is_multi_step("Deploy") is False

    def test_description_checked(self) -> None:
        assert is_multi_step("Complex task", "1. Do A 2. Do B") is True


# ---------------------------------------------------------------------------
# Test: Execution plan creation (Story 4.2)
# ---------------------------------------------------------------------------

class TestPlanCreation:
    """Tests for TaskOrchestrator._create_execution_plan()."""

    def test_multi_step_creates_plan(self) -> None:
        bridge = _make_bridge()
        orchestrator = TaskOrchestrator(bridge)
        agents = [
            _make_agent("researcher", skills=["research"]),
            _make_agent("writer", skills=["writing"]),
        ]
        plan = orchestrator._create_execution_plan(
            "1. Research AI trends 2. Write summary 3. Review the summary",
            None,
            agents,
        )
        assert plan is not None
        assert len(plan.steps) == 3
        assert plan.steps[0].step_id == "step_1"
        assert plan.steps[1].step_id == "step_2"
        assert plan.steps[2].step_id == "step_3"

    def test_single_step_returns_none(self) -> None:
        bridge = _make_bridge()
        orchestrator = TaskOrchestrator(bridge)
        plan = orchestrator._create_execution_plan("Check my email", None, [])
        assert plan is None

    def test_dependency_detection(self) -> None:
        bridge = _make_bridge()
        orchestrator = TaskOrchestrator(bridge)
        agents = [_make_agent("generic", skills=["research", "writing"])]
        plan = orchestrator._create_execution_plan(
            "1. Research AI trends 2. Write summary 3. Review the summary",
            None,
            agents,
        )
        assert plan is not None
        # Step 3 ("Review") should depend on prior steps
        assert len(plan.steps[2].depends_on) > 0
        assert "step_1" in plan.steps[2].depends_on
        assert "step_2" in plan.steps[2].depends_on

    def test_parallel_group_for_independent_steps(self) -> None:
        bridge = _make_bridge()
        orchestrator = TaskOrchestrator(bridge)
        agents = [_make_agent("generic", skills=["research", "writing"])]
        plan = orchestrator._create_execution_plan(
            "1. Research AI trends 2. Write summary 3. Review the summary",
            None,
            agents,
        )
        assert plan is not None
        # Steps 1 and 2 are independent — should share a parallel group
        assert plan.steps[0].parallel_group is not None
        assert plan.steps[0].parallel_group == plan.steps[1].parallel_group

    def test_agent_assignment_per_step(self) -> None:
        bridge = _make_bridge()
        orchestrator = TaskOrchestrator(bridge)
        agents = [
            _make_agent("researcher", skills=["research", "trends"]),
            _make_agent("writer", skills=["writing", "summary"]),
        ]
        plan = orchestrator._create_execution_plan(
            "1. Research AI trends 2. Write summary 3. Review the summary",
            None,
            agents,
        )
        assert plan is not None
        assert plan.steps[0].assigned_agent == "researcher"
        assert plan.steps[1].assigned_agent == "writer"


# ---------------------------------------------------------------------------
# Test: Ready step detection (Story 4.2)
# ---------------------------------------------------------------------------

class TestGetReadySteps:
    """Tests for get_ready_steps()."""

    def test_initial_no_deps(self) -> None:
        plan = ExecutionPlan(steps=[
            ExecutionPlanStep(step_id="s1", description="A"),
            ExecutionPlanStep(step_id="s2", description="B"),
        ])
        ready = get_ready_steps(plan)
        assert len(ready) == 2

    def test_blocked_step_not_ready(self) -> None:
        plan = ExecutionPlan(steps=[
            ExecutionPlanStep(step_id="s1", description="A"),
            ExecutionPlanStep(step_id="s2", description="B", depends_on=["s1"]),
        ])
        ready = get_ready_steps(plan)
        assert len(ready) == 1
        assert ready[0].step_id == "s1"

    def test_unblocked_after_dep_completed(self) -> None:
        plan = ExecutionPlan(steps=[
            ExecutionPlanStep(step_id="s1", description="A", status="completed"),
            ExecutionPlanStep(step_id="s2", description="B", depends_on=["s1"]),
        ])
        ready = get_ready_steps(plan)
        assert len(ready) == 1
        assert ready[0].step_id == "s2"

    def test_in_progress_not_ready(self) -> None:
        plan = ExecutionPlan(steps=[
            ExecutionPlanStep(step_id="s1", description="A", status="in_progress"),
        ])
        ready = get_ready_steps(plan)
        assert len(ready) == 0

    def test_all_completed(self) -> None:
        plan = ExecutionPlan(steps=[
            ExecutionPlanStep(step_id="s1", description="A", status="completed"),
            ExecutionPlanStep(step_id="s2", description="B", status="completed"),
        ])
        ready = get_ready_steps(plan)
        assert len(ready) == 0


# ---------------------------------------------------------------------------
# Test: Step dispatch (Story 4.2)
# ---------------------------------------------------------------------------

class TestStepDispatch:
    """Tests for dispatch and completion of execution plan steps."""

    @pytest.mark.asyncio
    async def test_dispatch_fires_when_deps_met(self) -> None:
        bridge = _make_bridge()
        bridge.update_execution_plan.return_value = None
        orchestrator = TaskOrchestrator(bridge)
        plan = ExecutionPlan(steps=[
            ExecutionPlanStep(step_id="s1", description="A"),
            ExecutionPlanStep(step_id="s2", description="B", depends_on=["s1"]),
        ])

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator._dispatch_ready_steps("task1", plan)

        # Only s1 should be dispatched (s2 is blocked)
        assert plan.steps[0].status == "in_progress"
        assert plan.steps[1].status == "pending"
        # Activity created for dispatched step
        assert bridge.create_activity.call_count == 1

    @pytest.mark.asyncio
    async def test_parallel_dispatch_multiple(self) -> None:
        bridge = _make_bridge()
        bridge.update_execution_plan.return_value = None
        orchestrator = TaskOrchestrator(bridge)
        plan = ExecutionPlan(steps=[
            ExecutionPlanStep(step_id="s1", description="A", parallel_group="g0"),
            ExecutionPlanStep(step_id="s2", description="B", parallel_group="g0"),
            ExecutionPlanStep(step_id="s3", description="C", depends_on=["s1", "s2"]),
        ])

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator._dispatch_ready_steps("task1", plan)

        # Both s1 and s2 dispatched simultaneously
        assert plan.steps[0].status == "in_progress"
        assert plan.steps[1].status == "in_progress"
        assert plan.steps[2].status == "pending"
        assert bridge.create_activity.call_count == 2

    @pytest.mark.asyncio
    async def test_complete_step_triggers_dependents(self) -> None:
        bridge = _make_bridge()
        bridge.update_execution_plan.return_value = None
        orchestrator = TaskOrchestrator(bridge)
        plan = ExecutionPlan(steps=[
            ExecutionPlanStep(step_id="s1", description="A", status="in_progress"),
            ExecutionPlanStep(step_id="s2", description="B", depends_on=["s1"]),
        ])

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator.complete_step("task1", plan, "s1")

        # s1 completed, s2 dispatched
        assert plan.steps[0].status == "completed"
        assert plan.steps[1].status == "in_progress"

    @pytest.mark.asyncio
    async def test_all_steps_complete_transitions_task(self) -> None:
        bridge = _make_bridge()
        bridge.update_execution_plan.return_value = None
        orchestrator = TaskOrchestrator(bridge)
        plan = ExecutionPlan(steps=[
            ExecutionPlanStep(step_id="s1", description="A", status="completed"),
            ExecutionPlanStep(step_id="s2", description="B", status="in_progress"),
        ])

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator.complete_step("task1", plan, "s2", TrustLevel.AUTONOMOUS)

        # Task should transition to done
        bridge.update_task_status.assert_called_once_with("task1", TaskStatus.DONE)
        # Completion activity created
        activity_calls = [c for c in bridge.create_activity.call_args_list
                          if c[0][0] == ActivityEventType.TASK_COMPLETED]
        assert len(activity_calls) == 1

    @pytest.mark.asyncio
    async def test_all_steps_complete_review_if_not_autonomous(self) -> None:
        bridge = _make_bridge()
        bridge.update_execution_plan.return_value = None
        orchestrator = TaskOrchestrator(bridge)
        plan = ExecutionPlan(steps=[
            ExecutionPlanStep(step_id="s1", description="A", status="in_progress"),
        ])

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator.complete_step(
                "task1", plan, "s1", TrustLevel.HUMAN_APPROVED
            )

        bridge.update_task_status.assert_called_once_with("task1", TaskStatus.REVIEW)


# ---------------------------------------------------------------------------
# Test: Inbox routing with execution plan (Story 4.2)
# ---------------------------------------------------------------------------

class TestRoutingWithPlan:
    """Tests for multi-step task routing via _process_inbox_task."""

    @pytest.mark.asyncio
    async def test_multi_step_task_creates_plan_and_dispatches(self) -> None:
        bridge = _make_bridge()
        bridge.update_execution_plan.return_value = None
        bridge.list_agents.return_value = [
            {"name": "researcher", "display_name": "Researcher",
             "role": "Research", "skills": ["research", "trends"]},
            {"name": "writer", "display_name": "Writer",
             "role": "Writing", "skills": ["writing", "summary"]},
        ]
        orchestrator = TaskOrchestrator(bridge)
        task = _make_task(
            title="1. Research AI trends 2. Write summary 3. Review the summary",
        )

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator._process_inbox_task(task)

        # Execution plan stored
        bridge.update_execution_plan.assert_called()
        plan_arg = bridge.update_execution_plan.call_args[0][1]
        assert len(plan_arg["steps"]) == 3

        # Task assigned to lead-agent (multi-step tasks are orchestrated by lead)
        status_call = bridge.update_task_status.call_args_list[0]
        assert status_call[0][1] == TaskStatus.ASSIGNED
        assert status_call[0][2] == LEAD_AGENT_NAME

        # Plan summary in activity
        activity_calls = bridge.create_activity.call_args_list
        plan_activity = [c for c in activity_calls
                         if c[0][0] == ActivityEventType.TASK_ASSIGNED]
        assert len(plan_activity) >= 1
        assert "plan" in plan_activity[0][0][1].lower()

    @pytest.mark.asyncio
    async def test_simple_task_no_plan(self) -> None:
        bridge = _make_bridge()
        bridge.list_agents.return_value = [
            {"name": "dev-agent", "display_name": "Dev Agent",
             "role": "Developer", "skills": ["coding"]},
        ]
        orchestrator = TaskOrchestrator(bridge)
        task = _make_task(title="Fix coding bug")

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator._process_inbox_task(task)

        # No execution plan stored
        bridge.update_execution_plan.assert_not_called()
        # Normal routing to best agent
        call_args = bridge.update_task_status.call_args
        assert call_args[0][2] == "dev-agent"


# ---------------------------------------------------------------------------
# Test: Review routing (Story 5.2)
# ---------------------------------------------------------------------------

class TestReviewRouting:
    """Tests for review transition handling (FR27)."""

    @pytest.mark.asyncio
    async def test_review_with_reviewers_sends_message_and_activity(self) -> None:
        """When a task with reviewers transitions to review, a system message
        and review_requested activity are created (targeted, not broadcast)."""
        bridge = _make_bridge()
        orchestrator = TaskOrchestrator(bridge)
        task = _make_task(
            task_id="t1",
            title="Verify boletos",
            status="review",
            trust_level="agent_reviewed",
            reviewers=["secretario"],
        )

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator._handle_review_transition("t1", task)

        # System message sent to the task thread
        bridge.send_message.assert_called_once_with(
            "t1",
            "system",
            AuthorType.SYSTEM,
            "Review requested. Awaiting review from: secretario",
            MessageType.SYSTEM_EVENT,
        )

        # Activity event created
        bridge.create_activity.assert_called_once_with(
            ActivityEventType.REVIEW_REQUESTED,
            "Review requested from secretario for 'Verify boletos'",
            "t1",
        )

    @pytest.mark.asyncio
    async def test_review_with_multiple_reviewers(self) -> None:
        """Multiple reviewer names are comma-joined in the message."""
        bridge = _make_bridge()
        orchestrator = TaskOrchestrator(bridge)
        task = _make_task(
            task_id="t2",
            title="Budget report",
            status="review",
            trust_level="agent_reviewed",
            reviewers=["secretario", "financeiro"],
        )

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator._handle_review_transition("t2", task)

        msg_args = bridge.send_message.call_args
        assert "secretario, financeiro" in msg_args[0][3]

        act_args = bridge.create_activity.call_args
        assert "secretario, financeiro" in act_args[0][1]

    @pytest.mark.asyncio
    async def test_autonomous_no_reviewers_auto_completes(self) -> None:
        """Autonomous task with no reviewers skips review, transitions to done."""
        bridge = _make_bridge()
        orchestrator = TaskOrchestrator(bridge)
        task = _make_task(
            task_id="t3",
            title="Auto task",
            status="review",
            trust_level="autonomous",
            reviewers=None,
        )

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator._handle_review_transition("t3", task)

        bridge.update_task_status.assert_called_once_with("t3", TaskStatus.DONE)
        bridge.send_message.assert_not_called()
        bridge.create_activity.assert_not_called()

    @pytest.mark.asyncio
    async def test_human_approved_no_reviewers_creates_hitl_event(self) -> None:
        """Human-approved task without reviewers creates hitl_requested event."""
        bridge = _make_bridge()
        orchestrator = TaskOrchestrator(bridge)
        task = _make_task(
            task_id="t4",
            title="Sensitive task",
            status="review",
            trust_level="human_approved",
            reviewers=None,
        )

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator._handle_review_transition("t4", task)

        bridge.create_activity.assert_called_once_with(
            ActivityEventType.HITL_REQUESTED,
            "Human approval requested for 'Sensitive task'",
            "t4",
        )
        bridge.send_message.assert_not_called()
        bridge.update_task_status.assert_not_called()

    @pytest.mark.asyncio
    async def test_review_routing_only_targets_configured_reviewers(self) -> None:
        """Review routing does NOT broadcast — only configured reviewers are named."""
        bridge = _make_bridge()
        orchestrator = TaskOrchestrator(bridge)
        task = _make_task(
            task_id="t5",
            title="Targeted review",
            status="review",
            trust_level="agent_reviewed",
            reviewers=["secretario"],
        )

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator._handle_review_transition("t5", task)

        # Verify only "secretario" is mentioned, not other agents
        msg_content = bridge.send_message.call_args[0][3]
        assert "secretario" in msg_content
        # No broadcast — send_message called exactly once with targeted content
        assert bridge.send_message.call_count == 1

    @pytest.mark.asyncio
    async def test_review_routing_loop_deduplicates(self) -> None:
        """The review routing loop does not re-process tasks already handled."""
        bridge = _make_bridge()
        task = _make_task(
            task_id="t6",
            title="Dedup task",
            status="review",
            trust_level="agent_reviewed",
            reviewers=["reviewer-1"],
        )
        # Simulate two subscription updates containing the same task
        bridge.subscribe.return_value = iter([[task], [task]])

        orchestrator = TaskOrchestrator(bridge)

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator.start_review_routing_loop()

        # Should only handle the task once
        assert bridge.send_message.call_count == 1
        assert bridge.create_activity.call_count == 1

    @pytest.mark.asyncio
    async def test_review_routing_loop_skips_none(self) -> None:
        """Review routing loop gracefully handles None subscription updates."""
        bridge = _make_bridge()
        bridge.subscribe.return_value = iter([None, []])

        orchestrator = TaskOrchestrator(bridge)

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator.start_review_routing_loop()

        bridge.send_message.assert_not_called()


# ---------------------------------------------------------------------------
# Test: Agent message sending (Story 5.2)
# ---------------------------------------------------------------------------

class TestAgentMessageSending:
    """Tests for TaskOrchestrator.send_agent_message()."""

    @pytest.mark.asyncio
    async def test_send_agent_message_calls_bridge(self) -> None:
        """send_agent_message wraps bridge.send_message with agent author type."""
        bridge = _make_bridge()
        orchestrator = TaskOrchestrator(bridge)

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator.send_agent_message(
                task_id="t1",
                agent_name="financeiro",
                content="Work completed on boletos.",
            )

        bridge.send_message.assert_called_once_with(
            "t1",
            "financeiro",
            AuthorType.AGENT,
            "Work completed on boletos.",
            MessageType.WORK,
        )

    @pytest.mark.asyncio
    async def test_send_agent_message_custom_type(self) -> None:
        """send_agent_message accepts a custom message_type."""
        bridge = _make_bridge()
        orchestrator = TaskOrchestrator(bridge)

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator.send_agent_message(
                task_id="t2",
                agent_name="reviewer",
                content="Looks good.",
                message_type=MessageType.REVIEW_FEEDBACK,
            )

        bridge.send_message.assert_called_once_with(
            "t2",
            "reviewer",
            AuthorType.AGENT,
            "Looks good.",
            MessageType.REVIEW_FEEDBACK,
        )


# ---------------------------------------------------------------------------
# Test: Review feedback flow (Story 5.3)
# ---------------------------------------------------------------------------

class TestReviewFeedbackFlow:
    """Tests for review feedback, revision cycles, and approval (FR28-FR30)."""

    @pytest.mark.asyncio
    async def test_review_feedback_creates_message_and_activity(self) -> None:
        """Reviewer feedback creates a review_feedback message and activity event."""
        bridge = _make_bridge()
        bridge.query.return_value = {"title": "Fix boletos", "trust_level": "agent_reviewed"}
        orchestrator = TaskOrchestrator(bridge)

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator.handle_review_feedback(
                task_id="t1",
                reviewer_name="secretario",
                feedback="Missing validation on line 42.",
            )

        bridge.send_message.assert_called_once_with(
            "t1",
            "secretario",
            AuthorType.AGENT,
            "Missing validation on line 42.",
            MessageType.REVIEW_FEEDBACK,
        )
        bridge.create_activity.assert_called_once_with(
            ActivityEventType.REVIEW_FEEDBACK,
            "secretario provided feedback on 'Fix boletos'",
            "t1",
            "secretario",
        )

    @pytest.mark.asyncio
    async def test_task_stays_in_review_after_feedback(self) -> None:
        """Task status is NOT changed by feedback -- no backward transition (FR29)."""
        bridge = _make_bridge()
        bridge.query.return_value = {"title": "Task", "trust_level": "agent_reviewed"}
        orchestrator = TaskOrchestrator(bridge)

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator.handle_review_feedback("t1", "reviewer", "Needs work")

        bridge.update_task_status.assert_not_called()

    @pytest.mark.asyncio
    async def test_agent_revision_creates_work_message(self) -> None:
        """Agent revision creates a 'work' message (not review_feedback)."""
        bridge = _make_bridge()
        orchestrator = TaskOrchestrator(bridge)

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator.handle_agent_revision(
                task_id="t1",
                agent_name="financeiro",
                content="Fixed validation on line 42.",
            )

        bridge.send_message.assert_called_once_with(
            "t1",
            "financeiro",
            AuthorType.AGENT,
            "Fixed validation on line 42.",
            MessageType.WORK,
        )

    @pytest.mark.asyncio
    async def test_multiple_feedback_revision_cycles(self) -> None:
        """Multiple feedback-revision cycles keep task in review (FR29)."""
        bridge = _make_bridge()
        bridge.query.return_value = {"title": "Task", "trust_level": "agent_reviewed"}
        orchestrator = TaskOrchestrator(bridge)

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            # Cycle 1: feedback + revision
            await orchestrator.handle_review_feedback("t1", "reviewer", "Issue A")
            await orchestrator.handle_agent_revision("t1", "agent", "Fix A")
            # Cycle 2: feedback + revision
            await orchestrator.handle_review_feedback("t1", "reviewer", "Issue B")
            await orchestrator.handle_agent_revision("t1", "agent", "Fix B")

        # 2 review_feedback + 2 work messages = 4 total
        assert bridge.send_message.call_count == 4
        # No status changes during the entire cycle
        bridge.update_task_status.assert_not_called()

    @pytest.mark.asyncio
    async def test_approval_with_agent_reviewed_transitions_to_done(self) -> None:
        """Approval with agent_reviewed trust level transitions task to done (FR30)."""
        bridge = _make_bridge()
        bridge.query.return_value = {"title": "Fix boletos", "trust_level": "agent_reviewed"}
        orchestrator = TaskOrchestrator(bridge)

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator.handle_review_approval("t1", "secretario")

        # Approval message
        bridge.send_message.assert_called_once_with(
            "t1",
            "secretario",
            AuthorType.AGENT,
            "Approved by secretario",
            MessageType.APPROVAL,
        )
        # Activity event
        bridge.create_activity.assert_called_once_with(
            ActivityEventType.REVIEW_APPROVED,
            "secretario approved 'Fix boletos'",
            "t1",
            "secretario",
        )
        # Task transitions to done
        bridge.update_task_status.assert_called_once_with(
            "t1", TaskStatus.DONE, "secretario",
        )

    @pytest.mark.asyncio
    async def test_approval_with_human_approved_stays_in_review(self) -> None:
        """Approval with human_approved trust level stays in review with hitl event."""
        bridge = _make_bridge()
        bridge.query.return_value = {"title": "Sensitive task", "trust_level": "human_approved"}
        orchestrator = TaskOrchestrator(bridge)

        with patch("nanobot.mc.orchestrator.asyncio.to_thread", new=_sync_call):
            await orchestrator.handle_review_approval("t1", "secretario")

        # No task status change -- stays in review for human gate
        bridge.update_task_status.assert_not_called()

        # Approval message + system message about HITL
        assert bridge.send_message.call_count == 2
        system_msg = bridge.send_message.call_args_list[1]
        assert system_msg[0][3] == "Agent review passed. Awaiting human approval."
        assert system_msg[0][4] == MessageType.SYSTEM_EVENT

        # review_approved + hitl_requested activity events
        assert bridge.create_activity.call_count == 2
        activity_calls = bridge.create_activity.call_args_list
        assert activity_calls[0][0][0] == ActivityEventType.REVIEW_APPROVED
        assert activity_calls[1][0][0] == ActivityEventType.HITL_REQUESTED


# ---------------------------------------------------------------------------
# Async helper — runs the function synchronously for testing
# ---------------------------------------------------------------------------

async def _sync_call(func, *args, **kwargs):
    """Replace asyncio.to_thread with a synchronous call for unit tests."""
    return func(*args, **kwargs)
