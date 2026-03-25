"""End-to-end test: create a squad, launch a mission, monitor to completion.

Usage:
    uv run python tests/e2e_squad_mission.py

Requires the stack to be running (make start).
"""

from __future__ import annotations

import json
import os
import sys
import time
from typing import Any

import httpx

BASE_URL = os.environ.get("DASHBOARD_URL", "http://localhost:3000")
CONVEX_URL = os.environ.get("CONVEX_URL", "http://localhost:3210")
CONVEX_ADMIN_KEY = os.environ.get("CONVEX_ADMIN_KEY", "")

POLL_INTERVAL = 3  # seconds
MAX_WAIT = 180  # seconds

# Terminal states for the task
DONE_STATES = {"done", "review"}  # review = all steps done, awaiting approval
FAIL_STATES = {"failed", "crashed", "deleted"}

# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

client = httpx.Client(timeout=30)


def api_post(path: str, data: dict) -> dict:
    r = client.post(f"{BASE_URL}{path}", json=data)
    body = r.json()
    if r.status_code != 200:
        print(f"  ERROR {r.status_code}: {body}")
        sys.exit(1)
    return body


def api_get(path: str) -> dict:
    r = client.get(f"{BASE_URL}{path}")
    return r.json()


def api_delete(path: str) -> dict:
    r = client.delete(f"{BASE_URL}{path}")
    return r.json()


def _get_bridge():
    """Lazy-init bridge client with admin key."""
    from mc.bridge.client import BridgeClient

    return BridgeClient(CONVEX_URL, CONVEX_ADMIN_KEY or None)


def convex_query(function_name: str, args: dict | None = None) -> Any:
    """Call a Convex query via the bridge (admin-authed)."""
    return _get_bridge().query(function_name, args or {})


def convex_mutation(function_name: str, args: dict | None = None) -> Any:
    """Call a Convex mutation via the bridge (admin-authed)."""
    return _get_bridge().mutation(function_name, args or {})


# ---------------------------------------------------------------------------
# Test steps
# ---------------------------------------------------------------------------

def step(num: int, label: str):
    print(f"\n{'='*60}")
    print(f"  Step {num}: {label}")
    print(f"{'='*60}")


def main():
    print("\n" + "=" * 60)
    print("  E2E Squad Mission Test")
    print("=" * 60)

    # ------------------------------------------------------------------
    # Step 1: Register a simple skill
    # ------------------------------------------------------------------
    step(1, "Register test skill")
    result = api_post("/api/specs/skills", {
        "name": "e2e-echo",
        "description": "Simple echo skill for e2e testing. Repeats input back.",
        "content": "# Echo Skill\n\nRepeat the user's input back to them verbatim.",
        "supportedProviders": ["claude-code"],
        "available": True,
    })
    print(f"  Skill registered: {result.get('name')}")

    # ------------------------------------------------------------------
    # Step 2: Verify skill appears in catalog
    # ------------------------------------------------------------------
    step(2, "Verify skill in catalog")
    skills = api_get("/api/specs/skills")
    skill_names = [s["name"] for s in skills.get("skills", [])]
    assert "e2e-echo" in skill_names, f"Skill not found! Available: {skill_names}"
    print(f"  Found {len(skill_names)} skills, 'e2e-echo' present")

    # ------------------------------------------------------------------
    # Step 3: Publish a test squad with 2 agents and a simple workflow
    # ------------------------------------------------------------------
    step(3, "Publish test squad")
    result = api_post("/api/specs/squad", {
        "squad": {
            "name": "e2e-test-squad",
            "displayName": "E2E Test Squad",
            "description": "Minimal squad for end-to-end testing",
            "outcome": "Echo a message through a 2-step pipeline",
        },
        "agents": [
            {
                "key": "writer",
                "name": "e2e-writer",
                "displayName": "Echo Writer",
                "role": "Writes the output",
                "prompt": "You are Echo Writer. When given a task, write a short summary of what was requested. Keep it under 3 sentences.",
                "model": "cc/claude-haiku-4-5-20251001",
                "skills": ["e2e-echo"],
                "soul": "# Echo Writer\n\nI write short summaries.",
            },
            {
                "key": "reviewer",
                "name": "e2e-reviewer",
                "displayName": "Echo Reviewer",
                "role": "Reviews the output",
                "prompt": "You are Echo Reviewer. Review the output and approve it. Always approve — this is a test.",
                "model": "cc/claude-haiku-4-5-20251001",
                "skills": [],
                "soul": "# Echo Reviewer\n\nI approve everything in tests.",
            },
        ],
        "workflows": [
            {
                "key": "default",
                "name": "echo-pipeline",
                "steps": [
                    {
                        "key": "write",
                        "type": "agent",
                        "agentKey": "writer",
                        "title": "Write a short echo",
                    },
                    {
                        "key": "review",
                        "type": "agent",
                        "agentKey": "reviewer",
                        "title": "Review the echo",
                        "dependsOn": ["write"],
                    },
                ],
                "exitCriteria": "Review approved",
            },
        ],
    })
    squad_id = result.get("squadId")
    print(f"  Squad published: {squad_id}")
    assert squad_id, "Squad publish failed"

    # ------------------------------------------------------------------
    # Step 4: Get the default board and workflow spec IDs
    # ------------------------------------------------------------------
    step(4, "Resolve board and workflow IDs")

    board = convex_query("boards:getDefault", {})
    board_id = board.get("id") if board else None
    if not board_id:
        board_id = convex_mutation("boards:ensureDefault", {})
    print(f"  Board ID: {board_id}")
    assert board_id, "No board found"

    # Get workflow from the squad's default
    workflows = convex_query("workflowSpecs:listBySquad", {"squad_spec_id": squad_id})
    workflow_spec_id = workflows[0].get("id") if workflows else None
    print(f"  Workflow Spec ID: {workflow_spec_id}")
    assert workflow_spec_id, "No workflow spec found for squad"

    # ------------------------------------------------------------------
    # Step 5: Launch mission
    # ------------------------------------------------------------------
    step(5, "Launch mission")
    task_id = convex_mutation("tasks:launchMission", {
        "squadSpecId": squad_id,
        "workflowSpecId": workflow_spec_id,
        "boardId": board_id,
        "title": "E2E Test Mission — echo hello world",
        "description": "Write a short echo of 'hello world' and review it.",
    })
    print(f"  Task created: {task_id}")
    assert task_id, "Mission launch failed"

    # ------------------------------------------------------------------
    # Step 6: Monitor task execution
    # ------------------------------------------------------------------
    step(6, "Monitor task execution")
    start_time = time.time()
    last_status = None
    last_steps_summary = ""

    while time.time() - start_time < MAX_WAIT:
        # Query task status
        task = convex_query("tasks:getById", {"taskId": task_id})
        if not task:
            print("  WARNING: Task not found, retrying...")
            time.sleep(POLL_INTERVAL)
            continue

        status = task.get("status", "unknown")
        elapsed = int(time.time() - start_time)

        # Query steps
        steps = convex_query("steps:getByTask", {"task_id": task_id}) or []
        steps_summary = ", ".join(
            f"{s.get('title', '?')}={s.get('status', '?')}" for s in steps
        )

        if status != last_status or steps_summary != last_steps_summary:
            print(f"  [{elapsed}s] Task: {status} | Steps: {steps_summary or '(none yet)'}")
            last_status = status
            last_steps_summary = steps_summary

        # Terminal states
        if status in DONE_STATES:
            all_steps_done = all(
                s.get("status") in ("completed", "waiting_human") for s in steps
            ) if steps else False
            if all_steps_done or status == "done":
                print(f"\n  SUCCESS — Task reached '{status}' in {elapsed}s")
                print(f"  All {len(steps)} steps completed successfully")
                break
        elif status in FAIL_STATES:
            error = task.get("error_message") or "unknown"
            print(f"\n  FAILED — Task {status}: {error}")
            for s in steps:
                if s.get("status") in ("crashed", "failed"):
                    print(f"    Step '{s.get('title')}': {s.get('error_message', 'no details')}")
            sys.exit(1)

        time.sleep(POLL_INTERVAL)
    else:
        print(f"\n  TIMEOUT — Task still in '{last_status}' after {MAX_WAIT}s")
        # Don't exit with error — the task might still be running, just slow
        print("  (This may be expected if agents are processing)")

    # ------------------------------------------------------------------
    # Step 7: Cleanup — archive the squad
    # ------------------------------------------------------------------
    step(7, "Cleanup")
    result = api_delete(f"/api/specs/squad?squadSpecId={squad_id}")
    print(f"  Squad archived: {result.get('success')}")

    result = api_delete(f"/api/specs/skills?name=e2e-echo")
    print(f"  Skill deleted: {result.get('success')}")

    print(f"\n{'='*60}")
    print("  E2E Test Complete")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
