# Hook Factory Implementation Plan

## Reference
- Design: `docs/plans/2026-03-04-hook-factory-design.md`

---

### Task 1: Core Framework (handler.py, config.py, context.py, discovery.py)

**Files to create:**
- `mc/hooks/__init__.py` — empty
- `mc/hooks/handler.py` — BaseHandler class
- `mc/hooks/config.py` — HookConfig dataclass with plan_pattern, tracker_dir, state_dir
- `mc/hooks/context.py` — HookContext class with load/save, file locking, auto-prune
- `mc/hooks/discovery.py` — discover_handlers() function

**handler.py details:**
```python
from __future__ import annotations
import fnmatch
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from .context import HookContext

class BaseHandler:
    events: list[tuple[str, str | None]] = []

    def __init__(self, ctx: HookContext, payload: dict) -> None:
        self.ctx = ctx
        self.payload = payload

    @classmethod
    def matches(cls, event_name: str, matcher_value: str) -> bool:
        for ev, m in cls.events:
            if ev == event_name and (m is None or m == matcher_value):
                return True
        return False

    def handle(self) -> str | None:
        raise NotImplementedError
```

**config.py details:**
```python
from dataclasses import dataclass
from pathlib import Path

@dataclass(frozen=True)
class HookConfig:
    plan_pattern: str = "docs/plans/*.md"
    tracker_dir: str = ".claude/plan-tracker"
    state_dir: str = ".claude/hook-state"

def get_config() -> HookConfig:
    return HookConfig()

def get_project_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent
```

**context.py details:**
- HookContext with fields: session_id, active_skill, active_plan, active_agents (dict)
- load(session_id) reads from state_dir/<session_id>.json or creates new
- save() writes to disk with fcntl.flock for concurrency safety
- auto-prune: on load, delete state files older than 24h
- to_dict() / from_dict() for serialization

**discovery.py details:**
- discover_handlers() scans mc/hooks/handlers/*.py
- Uses importlib.util.spec_from_file_location to import
- Collects all BaseHandler subclasses
- Caches result in module-level variable (handlers don't change during a single invocation)

**Verification:** `uv run python -c "from mc.hooks.handler import BaseHandler; from mc.hooks.config import get_config, get_project_root; from mc.hooks.context import HookContext; from mc.hooks.discovery import discover_handlers; print('OK')"` should print OK.

---

### Task 2: Dispatcher Entry Point (dispatcher.py)

**Files to create:**
- `mc/hooks/dispatcher.py` — main() function, callable as script

**Logic:**
1. Read JSON from stdin
2. Extract hook_event_name, tool_name (if present)
3. Load HookContext for the session
4. Call discover_handlers()
5. For each matching handler: instantiate, call handle(), collect results
6. Wrap handler errors in try/except — log to stderr, continue
7. Save context
8. If any results: output combined additionalContext JSON to stdout
9. Exit 0 always (never block)

**Script header:**
```python
#!/usr/bin/env python3
"""Central hook dispatcher for Claude Code events."""
```

Make executable. Add `if __name__ == "__main__": main()` block.

**Verification:** `echo '{"hook_event_name":"PostToolUse","tool_name":"Bash","session_id":"test","cwd":"/tmp"}' | uv run python mc/hooks/dispatcher.py` should exit 0 with no output (no handlers match Bash).

---

### Task 3: Plan Tracker Handler (handlers/plan_tracker.py)

**Files to create:**
- `mc/hooks/handlers/__init__.py` — empty
- `mc/hooks/handlers/plan_tracker.py`

**Port from:** existing `parse-plan-steps.sh` and `mark-step-complete.sh` logic into one handler class.

**Class: PlanTrackerHandler(BaseHandler)**
```python
events = [("PostToolUse", "Write"), ("TaskCompleted", None)]
```

**handle() logic:**
- If event is PostToolUse/Write:
  - Extract file_path from payload.tool_input
  - Check if matches config.plan_pattern using fnmatch
  - If not: return None
  - Get content from payload.tool_input.content or read from disk
  - Parse markdown: find `### Task N: Name` headers and `**Blocked by:** Task X, Y`
  - Compute parallel groups via topological BFS
  - If tracker exists: preserve completed statuses
  - Write tracker JSON to config.tracker_dir/<basename>.json
  - Update ctx.active_plan
  - Return "Plan tracker created: N tasks. Parallel groups: ..."

- If event is TaskCompleted:
  - Extract task subject from payload (payload.get("task_subject") or payload.get("task", {}).get("subject"))
  - Try regex `Task (\d+)` for ID, fallback name match
  - Scan tracker files, find matching step
  - If not found or already completed: return None
  - Mark step completed, recalculate unblocked
  - Return "Step N 'Name' completed. Progress: X/Y done. Now unblocked: ..."

**Tracker JSON format (same as existing):**
```json
{
  "plan_file": "docs/plans/...",
  "created_at": "ISO8601",
  "steps": [{"id": 1, "name": "...", "order": 1, "status": "pending", "blocked_by": [], "parallel_group": 1}]
}
```

**Verification:** Create test plan, simulate PostToolUse event via stdin, check tracker JSON. Simulate TaskCompleted, check step marked.

---

### Task 4: Skill Tracker Handler (handlers/skill_tracker.py)

**Class: SkillTrackerHandler(BaseHandler)**
```python
events = [("PostToolUse", "Skill")]
```

**handle() logic:**
- Extract skill name from payload.tool_input (the "skill" field)
- Update ctx.active_skill = skill_name
- Return "Active skill: {skill_name}"

---

### Task 5: Plan Capture Handler (handlers/plan_capture.py)

**Class: PlanCaptureHandler(BaseHandler)**
```python
events = [("PostToolUse", "ExitPlanMode")]
```

**handle() logic:**
- When ExitPlanMode fires, the plan has been approved
- Check if ctx.active_plan is set (from a recent Write to docs/plans/)
- If set: return "Plan approved: {ctx.active_plan}"
- If not: scan tracker dir for most recently modified tracker, set ctx.active_plan
- Return context string

---

### Task 6: Agent Tracker Handler (handlers/agent_tracker.py)

**Class: AgentTrackerHandler(BaseHandler)**
```python
events = [("SubagentStart", None), ("SubagentStop", None)]
```

**handle() logic:**
- SubagentStart:
  - Add to ctx.active_agents: {agent_id: {type, started_at}}
  - Return "Agent '{type}' started ({len(ctx.active_agents)} active)"

- SubagentStop:
  - Remove from ctx.active_agents
  - Return "Agent '{type}' stopped ({len(ctx.active_agents)} remaining)"

---

### Task 7: Hook Registration + Migration

**Files to modify:**
- `.claude/settings.local.json` — replace bash hooks with dispatcher

**New settings.local.json hooks section:**
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Skill|ExitPlanMode",
        "hooks": [{"type": "command", "command": "uv run python mc/hooks/dispatcher.py"}]
      }
    ],
    "TaskCompleted": [
      {
        "hooks": [{"type": "command", "command": "uv run python mc/hooks/dispatcher.py"}]
      }
    ],
    "SubagentStart": [
      {
        "hooks": [{"type": "command", "command": "uv run python mc/hooks/dispatcher.py"}]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [{"type": "command", "command": "uv run python mc/hooks/dispatcher.py"}]
      }
    ]
  }
}
```

**Migration:**
- Delete `mc/hooks/parse-plan-steps.sh`
- Delete `mc/hooks/mark-step-complete.sh`
- Delete `mc/hooks/config.env`
- Keep existing `.claude/plan-tracker/` data (compatible)

---

### Task 8: End-to-End Verification

1. Create test plan `docs/plans/2026-03-04-test-hook-factory.md` with 3 tasks (one blocked)
2. Simulate PostToolUse/Write → verify tracker JSON created
3. Simulate PostToolUse/Skill → verify context updated
4. Simulate TaskCompleted → verify step marked, unblocked reported
5. Simulate SubagentStart/Stop → verify agent tracking
6. Clean up test artifacts
