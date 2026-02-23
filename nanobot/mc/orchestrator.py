"""
Task Orchestrator — Lead Agent capability matching, inbox routing, execution
planning, and review routing.

Subscribes to inbox tasks and routes them to the best-matching agent based
on skill tag overlap with task keywords. For multi-step tasks, creates
structured execution plans with dependency tracking and parallel dispatch.

Implements FR19 (capability matching), FR20 (fallback self-execution),
FR2 (explicit assignment), FR21 (execution planning), FR22 (parallel dispatch),
FR23 (auto-unblock dependent tasks).

Also handles review transitions (Story 5.2 / FR27).
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import TYPE_CHECKING, Any

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

if TYPE_CHECKING:
    from nanobot.mc.bridge import ConvexBridge

logger = logging.getLogger(__name__)

STOPWORDS = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been",
    "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "and", "or", "but", "not", "this", "that", "it", "my", "your",
}

LEAD_AGENT_NAME = "lead-agent"

# Patterns that indicate a task has multiple steps
STEP_INDICATORS = [
    r"\d+\.\s",                                    # "1. Do X"
    r"\b(?:first|then|after|next|finally)\b",        # sequence words
    r"(?:step \d+)",                                # "step 1"
    r"\n-\s",                                       # "- Do X" (bullet list)
]


def is_multi_step(title: str, description: str | None = None) -> bool:
    """Heuristic: does this task need an execution plan?"""
    text = f"{title} {description or ''}"
    return any(re.search(pat, text, re.IGNORECASE) for pat in STEP_INDICATORS)


def _parse_steps(title: str, description: str | None) -> list[str]:
    """Extract individual step descriptions from task text.

    Handles numbered lists (1. ..., 2. ...) and bullet lists (- ...).
    Falls back to splitting on sequence keywords (first/then/after/next/finally).
    """
    text = f"{title} {description or ''}"

    # Try numbered list: "1. Do X 2. Do Y 3. Do Z"
    numbered = re.split(r"\d+\.\s+", text)
    numbered = [s.strip() for s in numbered if s.strip()]
    if len(numbered) > 1:
        return numbered

    # Try bullet list (newline-delimited)
    if "\n- " in text:
        bullets = re.split(r"\n-\s+", text)
        bullets = [s.strip() for s in bullets if s.strip()]
        if len(bullets) > 1:
            return bullets

    # Try sequence keywords: split on then/after/next/finally
    parts = re.split(r"\b(?:then|after that|next|finally)\b", text, flags=re.IGNORECASE)
    parts = [s.strip().rstrip(",").strip() for s in parts if s.strip()]
    # Remove leading "first" from the first part
    if parts and re.match(r"^first\b", parts[0], re.IGNORECASE):
        parts[0] = re.sub(r"^first\s+", "", parts[0], flags=re.IGNORECASE).strip()
    if len(parts) > 1:
        return parts

    return []


def _detect_dependencies(steps: list[ExecutionPlanStep]) -> None:
    """Analyze step descriptions to infer sequential dependencies.

    If step B references keywords from step A (like "summary" referencing
    a prior "write summary" step), mark B as depending on A.
    Simple heuristic: if step text contains "review", "check", "verify",
    "combine", or "merge", it likely depends on all prior steps.
    """
    review_words = {"review", "check", "verify", "combine", "merge", "finalize", "compile"}
    for i, step in enumerate(steps):
        step_words = set(step.description.lower().split())
        if step_words & review_words and i > 0:
            step.depends_on = [s.step_id for s in steps[:i]]


def _assign_parallel_groups(steps: list[ExecutionPlanStep]) -> None:
    """Group independent steps (no dependencies) into parallel groups."""
    group_counter = 0
    # Steps with no dependencies that are at the "root" level
    independent = [s for s in steps if not s.depends_on]
    if len(independent) > 1:
        group_label = f"group_{group_counter}"
        for s in independent:
            s.parallel_group = group_label

    # Also group steps that share the same set of dependencies
    dep_groups: dict[tuple[str, ...], list[ExecutionPlanStep]] = {}
    for s in steps:
        if s.depends_on:
            key = tuple(sorted(s.depends_on))
            dep_groups.setdefault(key, []).append(s)
    for group_steps in dep_groups.values():
        if len(group_steps) > 1:
            group_counter += 1
            group_label = f"group_{group_counter}"
            for s in group_steps:
                s.parallel_group = group_label


def get_ready_steps(plan: ExecutionPlan) -> list[ExecutionPlanStep]:
    """Find steps that are ready to execute (all deps met, status pending)."""
    completed_ids = {s.step_id for s in plan.steps if s.status == "completed"}
    ready = []
    for step in plan.steps:
        if step.status != "pending":
            continue
        if all(dep in completed_ids for dep in step.depends_on):
            ready.append(step)
    return ready


def extract_keywords(title: str, description: str | None = None) -> list[str]:
    """Extract meaningful keywords from task text.

    Tokenizes on non-alphanumeric characters, removes stopwords and
    tokens shorter than 3 characters.
    """
    text = title.lower()
    if description:
        text += " " + description.lower()
    tokens = re.split(r"[^a-z0-9]+", text)
    return [t for t in tokens if t and len(t) > 2 and t not in STOPWORDS]


def score_agent(agent: AgentData, keywords: list[str]) -> float:
    """Score an agent based on skill tag overlap with task keywords.

    Exact matches score 1.0 per keyword. Partial matches (keyword
    contained in skill or vice versa) score 0.5 each.
    """
    if not agent.skills or not keywords:
        return 0.0
    agent_skills_lower = {s.lower() for s in agent.skills}
    score = 0.0
    for kw in keywords:
        if kw in agent_skills_lower:
            score += 1.0
            continue
        for skill in agent_skills_lower:
            if kw in skill or skill in kw:
                score += 0.5
                break
    return score


class TaskOrchestrator:
    """Routes inbox tasks and handles review transitions."""

    def __init__(self, bridge: ConvexBridge) -> None:
        self._bridge = bridge
        self._lead_agent_name = LEAD_AGENT_NAME
        self._known_inbox_ids: set[str] = set()
        self._known_review_task_ids: set[str] = set()

    async def start_routing_loop(self) -> None:
        """Subscribe to inbox tasks and route them as they arrive.

        Uses bridge.async_subscribe() which runs the blocking Convex
        subscription in a dedicated thread and feeds updates into an
        asyncio.Queue — no event-loop blocking.

        Deduplicates tasks by ID to avoid re-routing stale subscription
        data. Wraps each task processing in try/except to prevent a
        single error from crashing the entire loop.
        """
        logger.info("[orchestrator] Starting inbox routing loop")

        queue = self._bridge.async_subscribe(
            "tasks:listByStatus", {"status": "inbox"}
        )

        while True:
            tasks = await queue.get()
            if tasks is None:
                continue
            # Prune IDs no longer in inbox so tasks can re-enter
            # inbox (e.g. after retry) and be re-processed.
            current_ids = {t.get("id") for t in tasks if t.get("id")}
            self._known_inbox_ids &= current_ids
            for task_data in tasks:
                task_id = task_data.get("id")
                if not task_id or task_id in self._known_inbox_ids:
                    continue
                self._known_inbox_ids.add(task_id)
                try:
                    await self._process_inbox_task(task_data)
                except Exception:
                    logger.warning(
                        "[orchestrator] Error processing inbox task %s",
                        task_id,
                        exc_info=True,
                    )

    async def _process_inbox_task(self, task_data: dict[str, Any]) -> None:
        """Route a single inbox task to the best agent."""
        task_id = task_data.get("id")
        title = task_data.get("title", "")
        description = task_data.get("description")
        assigned_agent = task_data.get("assigned_agent")

        if not task_id:
            logger.warning("[orchestrator] Skipping task with no id: %s", task_data)
            return

        if assigned_agent:
            # Explicit assignment — respect it, just transition to assigned.
            # Activity event is written by the Convex tasks:updateStatus mutation.
            logger.info(
                "[orchestrator] Task '%s' has explicit assignment to '%s'",
                title, assigned_agent,
            )
            await asyncio.to_thread(
                self._bridge.update_task_status,
                task_id, TaskStatus.ASSIGNED, assigned_agent,
                f"Task '{title}' assigned to {assigned_agent} (explicit)",
            )
            return

        # Fetch all agents and score them (filter extra Convex fields)
        from nanobot.mc.gateway import filter_agent_fields

        agents_data = await asyncio.to_thread(self._bridge.list_agents)
        agents = [AgentData(**filter_agent_fields(a)) for a in agents_data]
        # Filter out disabled agents before capability matching (AC #7)
        agents = [a for a in agents if a.enabled is not False]

        keywords = extract_keywords(title, description)
        scored = [(agent, score_agent(agent, keywords)) for agent in agents]
        scored.sort(key=lambda x: x[1], reverse=True)

        # Check for multi-step task — create execution plan (FR21)
        plan = self._create_execution_plan(title, description, agents)

        if plan is not None:
            logger.info(
                "[orchestrator] Multi-step task '%s': creating %d-step plan",
                title,
                len(plan.steps),
            )
            await self._store_execution_plan(task_id, plan)
            summary = self._plan_summary(plan)
            # Activity event is written by the Convex tasks:updateStatus mutation.
            await asyncio.to_thread(
                self._bridge.update_task_status,
                task_id,
                TaskStatus.ASSIGNED,
                self._lead_agent_name,
                summary,
            )
            # Dispatch initially ready steps
            await self._dispatch_ready_steps(task_id, plan)
            return

        if scored and scored[0][1] > 0:
            best_agent = scored[0][0]
            logger.info(
                "[orchestrator] Routing task '%s' to '%s' (score=%.1f)",
                title, best_agent.name, scored[0][1],
            )
            # Activity event is written by the Convex tasks:updateStatus mutation.
            await asyncio.to_thread(
                self._bridge.update_task_status,
                task_id, TaskStatus.ASSIGNED, best_agent.name,
                f"Lead Agent assigned '{title}' to {best_agent.name}",
            )
        else:
            # Fallback: Lead Agent executes directly (FR20)
            logger.info(
                "[orchestrator] No matching agent for task '%s'. "
                "Lead Agent will execute directly.",
                title,
            )
            # Activity event is written by the Convex tasks:updateStatus mutation.
            await asyncio.to_thread(
                self._bridge.update_task_status,
                task_id, TaskStatus.ASSIGNED, self._lead_agent_name,
                "No specialist found. Lead Agent executing directly.",
            )

    # ------------------------------------------------------------------
    # Execution planning (Story 4.2 / FR21, FR22, FR23)
    # ------------------------------------------------------------------

    def _create_execution_plan(
        self,
        title: str,
        description: str | None,
        agents: list[AgentData],
    ) -> ExecutionPlan | None:
        """Create an execution plan for a multi-step task.

        Returns None for simple single-step tasks.
        """
        if not is_multi_step(title, description):
            return None

        step_texts = _parse_steps(title, description)
        if len(step_texts) < 2:
            return None

        steps: list[ExecutionPlanStep] = []
        for i, text in enumerate(step_texts):
            step_id = f"step_{i + 1}"
            # Assign best agent per step using scoring from Story 4.1
            keywords = extract_keywords(text)
            scored = [(a, score_agent(a, keywords)) for a in agents]
            scored.sort(key=lambda x: x[1], reverse=True)
            assigned = scored[0][0].name if scored and scored[0][1] > 0 else None
            steps.append(ExecutionPlanStep(
                step_id=step_id,
                description=text,
                assigned_agent=assigned,
            ))

        _detect_dependencies(steps)
        _assign_parallel_groups(steps)

        return ExecutionPlan(steps=steps)

    async def _store_execution_plan(
        self, task_id: str, plan: ExecutionPlan
    ) -> None:
        """Store the execution plan on the task document in Convex."""
        await asyncio.to_thread(
            self._bridge.update_execution_plan,
            task_id,
            plan.to_dict(),
        )

    def _plan_summary(self, plan: ExecutionPlan) -> str:
        """Generate a human-readable summary of the plan for activity events."""
        total = len(plan.steps)
        parallel = sum(1 for s in plan.steps if s.parallel_group is not None)
        blocking = sum(1 for s in plan.steps if s.depends_on)
        return f"Created {total}-step plan: {parallel} parallel + {blocking} blocking"

    async def _dispatch_ready_steps(
        self, task_id: str, plan: ExecutionPlan
    ) -> None:
        """Dispatch all steps that are ready to execute.

        Ready steps have all dependencies completed and status pending.
        Parallel steps are dispatched simultaneously via asyncio.gather().
        """
        ready = get_ready_steps(plan)
        if not ready:
            return

        async def _dispatch_one(step: ExecutionPlanStep) -> None:
            step.status = "in_progress"
            logger.info(
                "[orchestrator] Dispatching step '%s' on task %s",
                step.step_id,
                task_id,
            )
            await asyncio.to_thread(
                self._bridge.create_activity,
                ActivityEventType.TASK_STARTED,
                f"Step {step.step_id} started: {step.description}",
                task_id,
                step.assigned_agent,
            )

        # Dispatch all ready steps in parallel (FR22)
        await asyncio.gather(*[_dispatch_one(s) for s in ready])

        # Persist updated plan status
        await self._store_execution_plan(task_id, plan)

    async def complete_step(
        self,
        task_id: str,
        plan: ExecutionPlan,
        step_id: str,
        trust_level: str = TrustLevel.AUTONOMOUS,
    ) -> None:
        """Mark a step as completed, dispatch dependents, and finalize if all done.

        Args:
            task_id: Convex task _id.
            plan: The current ExecutionPlan (will be mutated in place).
            step_id: The step_id to mark completed.
            trust_level: Task trust level for determining final transition.
        """
        for step in plan.steps:
            if step.step_id == step_id:
                step.status = "completed"
                break

        # Dispatch any newly-unblocked steps
        await self._dispatch_ready_steps(task_id, plan)

        # Check if all steps are done
        if all(s.status == "completed" for s in plan.steps):
            final_status = (
                TaskStatus.DONE
                if trust_level == TrustLevel.AUTONOMOUS
                else TaskStatus.REVIEW
            )
            # Activity event is written by the Convex tasks:updateStatus mutation.
            await asyncio.to_thread(
                self._bridge.update_task_status,
                task_id,
                final_status,
            )

    # ------------------------------------------------------------------
    # Review routing (Story 5.2 / FR27)
    # ------------------------------------------------------------------

    async def start_review_routing_loop(self) -> None:
        """Subscribe to review tasks and handle review transitions.

        Uses bridge.async_subscribe() which runs the blocking Convex
        subscription in a dedicated thread and feeds updates into an
        asyncio.Queue — no event-loop blocking.
        Tracks already-processed task IDs to avoid re-handling.
        """
        logger.info("[orchestrator] Starting review routing loop")

        queue = self._bridge.async_subscribe(
            "tasks:listByStatus", {"status": "review"}
        )

        while True:
            tasks = await queue.get()
            if tasks is None:
                continue
            for task_data in tasks:
                task_id = task_data.get("id")
                if not task_id or task_id in self._known_review_task_ids:
                    continue
                self._known_review_task_ids.add(task_id)
                await self._handle_review_transition(task_id, task_data)

    async def _handle_review_transition(
        self, task_id: str, task: dict[str, Any]
    ) -> None:
        """Handle a task entering review state.

        - If reviewers are configured, send a targeted system message and
          create a review_requested activity event (FR27).
        - If no reviewers and trust_level is autonomous, auto-complete to done.
        - If no reviewers and trust_level is human_approved, create a
          hitl_requested activity event.
        """
        reviewers: list[str] = task.get("reviewers") or []
        trust_level = task.get("trust_level", TrustLevel.AUTONOMOUS)
        title = task.get("title", "Untitled")

        if not reviewers and trust_level == TrustLevel.AUTONOMOUS:
            logger.info(
                "[orchestrator] Task '%s' is autonomous with no reviewers — "
                "auto-completing to done.",
                title,
            )
            await asyncio.to_thread(
                self._bridge.update_task_status,
                task_id,
                TaskStatus.DONE,
            )
            return

        if reviewers:
            reviewer_names = ", ".join(reviewers)
            logger.info(
                "[orchestrator] Routing review for task '%s' to: %s",
                title,
                reviewer_names,
            )
            await asyncio.to_thread(
                self._bridge.send_message,
                task_id,
                "system",
                AuthorType.SYSTEM,
                f"Review requested. Awaiting review from: {reviewer_names}",
                MessageType.SYSTEM_EVENT,
            )
            await asyncio.to_thread(
                self._bridge.create_activity,
                ActivityEventType.REVIEW_REQUESTED,
                f"Review requested from {reviewer_names} for '{title}'",
                task_id,
            )

        if trust_level == TrustLevel.HUMAN_APPROVED and not reviewers:
            logger.info(
                "[orchestrator] Human approval requested for task '%s'.",
                title,
            )
            await asyncio.to_thread(
                self._bridge.create_activity,
                ActivityEventType.HITL_REQUESTED,
                f"Human approval requested for '{title}'",
                task_id,
            )

    # ------------------------------------------------------------------
    # Agent message sending (Story 5.2 / FR26)
    # ------------------------------------------------------------------

    async def send_agent_message(
        self,
        task_id: str,
        agent_name: str,
        content: str,
        message_type: str = MessageType.WORK,
    ) -> Any:
        """Send a task-scoped message on behalf of an agent.

        Wraps bridge.send_message() with proper author type and logging.
        The bridge's retry logic (Story 1.4) ensures delivery reliability (NFR9).
        """
        logger.info(
            "[orchestrator] Agent '%s' sending message on task %s",
            agent_name,
            task_id,
        )
        result = await asyncio.to_thread(
            self._bridge.send_message,
            task_id,
            agent_name,
            AuthorType.AGENT,
            content,
            message_type,
        )
        return result

    # ------------------------------------------------------------------
    # Review feedback flow (Story 5.3 / FR28-FR30)
    # ------------------------------------------------------------------

    async def handle_review_feedback(
        self, task_id: str, reviewer_name: str, feedback: str
    ) -> None:
        """Handle reviewer feedback on a task (FR28).

        Sends a review_feedback message and creates a review_feedback activity
        event. The task remains in "review" state -- no backward transition (FR29).
        """
        logger.info(
            "[orchestrator] Reviewer '%s' providing feedback on task %s",
            reviewer_name,
            task_id,
        )
        await asyncio.to_thread(
            self._bridge.send_message,
            task_id,
            reviewer_name,
            AuthorType.AGENT,
            feedback,
            MessageType.REVIEW_FEEDBACK,
        )
        task = await asyncio.to_thread(
            self._bridge.query, "tasks:getById", {"task_id": task_id}
        )
        title = task.get("title", "Untitled") if task else "Untitled"
        await asyncio.to_thread(
            self._bridge.create_activity,
            ActivityEventType.REVIEW_FEEDBACK,
            f"{reviewer_name} provided feedback on '{title}'",
            task_id,
            reviewer_name,
        )

    async def handle_agent_revision(
        self, task_id: str, agent_name: str, content: str
    ) -> None:
        """Handle an agent's revision in response to review feedback (FR29).

        Sends a "work" message for the revision. The task remains in "review"
        state throughout the revision cycle -- no backward transition.
        """
        logger.info(
            "[orchestrator] Agent '%s' submitting revision on task %s",
            agent_name,
            task_id,
        )
        await asyncio.to_thread(
            self._bridge.send_message,
            task_id,
            agent_name,
            AuthorType.AGENT,
            content,
            MessageType.WORK,
        )

    async def handle_review_approval(
        self, task_id: str, reviewer_name: str
    ) -> None:
        """Handle reviewer approval of a task (FR30).

        Sends an approval message and creates a review_approved activity event.
        Checks trust level:
        - agent_reviewed: transitions task to "done"
        - human_approved: creates hitl_requested event, task stays in "review"
        """
        logger.info(
            "[orchestrator] Reviewer '%s' approving task %s",
            reviewer_name,
            task_id,
        )
        await asyncio.to_thread(
            self._bridge.send_message,
            task_id,
            reviewer_name,
            AuthorType.AGENT,
            f"Approved by {reviewer_name}",
            MessageType.APPROVAL,
        )
        task = await asyncio.to_thread(
            self._bridge.query, "tasks:getById", {"task_id": task_id}
        )
        title = task.get("title", "Untitled") if task else "Untitled"
        trust_level = (
            task.get("trust_level", TrustLevel.AUTONOMOUS)
            if task
            else TrustLevel.AUTONOMOUS
        )

        await asyncio.to_thread(
            self._bridge.create_activity,
            ActivityEventType.REVIEW_APPROVED,
            f"{reviewer_name} approved '{title}'",
            task_id,
            reviewer_name,
        )

        if trust_level == TrustLevel.AGENT_REVIEWED:
            await asyncio.to_thread(
                self._bridge.update_task_status,
                task_id,
                TaskStatus.DONE,
                reviewer_name,
            )
        elif trust_level == TrustLevel.HUMAN_APPROVED:
            await asyncio.to_thread(
                self._bridge.send_message,
                task_id,
                "system",
                AuthorType.SYSTEM,
                "Agent review passed. Awaiting human approval.",
                MessageType.SYSTEM_EVENT,
            )
            await asyncio.to_thread(
                self._bridge.create_activity,
                ActivityEventType.HITL_REQUESTED,
                f"Human approval requested for '{title}'",
                task_id,
            )
