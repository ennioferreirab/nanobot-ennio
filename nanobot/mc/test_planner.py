"""Unit tests for planner execution-plan generation and validation."""

from __future__ import annotations

import json

from nanobot.mc.planner import TaskPlanner, _parse_plan_response
from nanobot.mc.types import AgentData, ExecutionPlan, ExecutionPlanStep, GENERAL_AGENT_NAME, LEAD_AGENT_NAME


def _agent(name: str, skills: list[str] | None = None) -> AgentData:
    return AgentData(
        name=name,
        display_name=name,
        role="Test",
        skills=skills or [],
    )


def test_parse_plan_response_new_execution_plan_fields() -> None:
    raw = json.dumps(
        {
            "steps": [
                {
                    "tempId": "step_1",
                    "title": "Extract data",
                    "description": "Extract invoice data from PDF",
                    "assignedAgent": "finance-agent",
                    "blockedBy": [],
                    "parallelGroup": 1,
                    "order": 1,
                },
                {
                    "tempId": "step_2",
                    "title": "Generate report",
                    "description": "Build summary report",
                    "assignedAgent": "general-agent",
                    "blockedBy": ["step_1"],
                    "parallelGroup": 2,
                    "order": 2,
                },
            ]
        }
    )

    plan = _parse_plan_response(raw)

    assert isinstance(plan, ExecutionPlan)
    assert plan.generated_by == LEAD_AGENT_NAME
    assert len(plan.steps) == 2
    assert plan.steps[0].temp_id == "step_1"
    assert plan.steps[0].title == "Extract data"
    assert plan.steps[0].parallel_group == 1
    assert plan.steps[1].blocked_by == ["step_1"]
    assert plan.steps[1].order == 2


def test_blocked_by_references_are_validated_against_temp_ids() -> None:
    raw = json.dumps(
        {
            "steps": [
                {
                    "tempId": "step_1",
                    "title": "A",
                    "description": "A",
                    "assignedAgent": "general-agent",
                    "blockedBy": [],
                },
                {
                    "tempId": "step_2",
                    "title": "B",
                    "description": "B",
                    "assignedAgent": "general-agent",
                    "blockedBy": ["step_1", "step_99", "step_2"],
                },
            ]
        }
    )

    plan = _parse_plan_response(raw)

    assert plan.steps[1].blocked_by == ["step_1"]


def test_parallel_group_normalization_for_independent_and_dependent_steps() -> None:
    raw = json.dumps(
        {
            "steps": [
                {
                    "tempId": "step_1",
                    "title": "A",
                    "description": "A",
                    "assignedAgent": "general-agent",
                    "blockedBy": [],
                    "parallelGroup": 3,
                },
                {
                    "tempId": "step_2",
                    "title": "B",
                    "description": "B",
                    "assignedAgent": "general-agent",
                    "blockedBy": [],
                    "parallelGroup": 9,
                },
                {
                    "tempId": "step_3",
                    "title": "C",
                    "description": "C",
                    "assignedAgent": "general-agent",
                    "blockedBy": ["step_1", "step_2"],
                    "parallelGroup": 1,
                },
            ]
        }
    )

    plan = _parse_plan_response(raw)

    assert plan.steps[0].parallel_group == plan.steps[1].parallel_group
    assert plan.steps[2].parallel_group > plan.steps[0].parallel_group


def test_missing_order_is_auto_assigned_sequentially() -> None:
    raw = json.dumps(
        {
            "steps": [
                {
                    "tempId": "step_1",
                    "title": "A",
                    "description": "A",
                    "assignedAgent": "general-agent",
                },
                {
                    "tempId": "step_2",
                    "title": "B",
                    "description": "B",
                    "assignedAgent": "general-agent",
                },
            ]
        }
    )

    plan = _parse_plan_response(raw)
    assert [s.order for s in plan.steps] == [1, 2]


def test_invalid_agent_names_fall_back_to_general_agent() -> None:
    planner = TaskPlanner()
    plan = ExecutionPlan(
        steps=[
            ExecutionPlanStep(
                temp_id="step_1",
                title="Do something",
                description="...",
                assigned_agent="nonexistent-agent",
            )
        ]
    )

    planner._validate_agent_names(plan, [_agent("finance-agent", ["finance"])])

    assert plan.steps[0].assigned_agent == GENERAL_AGENT_NAME


def test_lead_agent_is_never_assigned_as_step_executor() -> None:
    planner = TaskPlanner()
    plan = ExecutionPlan(
        steps=[
            ExecutionPlanStep(
                temp_id="step_1",
                title="Do something",
                description="...",
                assigned_agent=LEAD_AGENT_NAME,
            )
        ]
    )

    planner._validate_agent_names(plan, [_agent(LEAD_AGENT_NAME, ["planning"])])

    assert plan.steps[0].assigned_agent == GENERAL_AGENT_NAME


def test_single_step_task_produces_valid_fallback_execution_plan() -> None:
    planner = TaskPlanner()

    plan = planner._fallback_heuristic_plan(
        "remind me to call the dentist", None, [], None
    )

    assert len(plan.steps) == 1
    assert plan.steps[0].temp_id == "step_1"
    assert plan.steps[0].title == "remind me to call the dentist"
    assert plan.steps[0].assigned_agent == GENERAL_AGENT_NAME
    assert plan.steps[0].parallel_group == 1
    assert plan.steps[0].order == 1
    assert plan.generated_by == LEAD_AGENT_NAME


def test_execution_plan_to_dict_uses_camel_case_generated_fields() -> None:
    plan = ExecutionPlan(
        steps=[
            ExecutionPlanStep(
                temp_id="step_1",
                title="Extract data",
                description="Extract invoice data",
                assigned_agent="finance-agent",
                blocked_by=[],
                parallel_group=1,
                order=1,
            ),
            ExecutionPlanStep(
                temp_id="step_2",
                title="Generate report",
                description="Build summary report",
                assigned_agent=GENERAL_AGENT_NAME,
                blocked_by=["step_1"],
                parallel_group=2,
                order=2,
            ),
        ]
    )

    payload = plan.to_dict()

    assert payload["steps"][0]["tempId"] == "step_1"
    assert payload["steps"][0]["title"] == "Extract data"
    assert payload["steps"][1]["blockedBy"] == ["step_1"]
    assert payload["generatedBy"] == LEAD_AGENT_NAME
    assert "generatedAt" in payload
    assert "createdAt" not in payload
    assert "stepId" not in payload["steps"][0]
    assert "dependsOn" not in payload["steps"][0]
