# Hook Factory Design — Single Dispatcher + Convention-Based Handlers

## Context

Replace the current bash hook scripts with a Python-based hook factory that provides:
- **Intelligent routing**: single dispatcher receives all Claude Code events, routes to handlers
- **Rich context**: shared session state across events (active skill, active plan, agent tracking)
- **Extensibility**: new handler = new `.py` file in `mc/hooks/handlers/`, zero config changes

## Architecture

```
Claude Code Event (JSON on stdin)
        │
        ▼
mc/hooks/dispatcher.py          ← single entry point for ALL events
        │
        ├── loads mc/hooks/config.py (settings)
        ├── loads mc/hooks/context.py (shared session state)
        ├── discovers mc/hooks/handlers/*.py (convention-based)
        │
        ▼
Handler classes declare which events they handle:
  plan_tracker.py   → PostToolUse/Write, TaskCompleted
  skill_tracker.py  → PostToolUse/Skill
  plan_capture.py   → PostToolUse/ExitPlanMode
  agent_tracker.py  → SubagentStart, SubagentStop
```

## Components

### 1. Dispatcher (`mc/hooks/dispatcher.py`)

Entry point. Registered ONCE per event type in `.claude/settings.local.json`.

```python
#!/usr/bin/env python3
"""Central hook dispatcher — routes Claude Code events to handlers."""

def main():
    payload = json.load(sys.stdin)
    event_name = payload.get("hook_event_name", "")
    matcher_value = payload.get("tool_name", "")  # for tool events

    # Load shared context
    ctx = HookContext.load(payload["session_id"])

    # Discover and run matching handlers
    results = []
    for handler_cls in discover_handlers():
        if handler_cls.matches(event_name, matcher_value):
            handler = handler_cls(ctx, payload)
            result = handler.handle()
            if result:
                results.append(result)

    # Merge context updates
    ctx.save()

    # Output combined additionalContext
    if results:
        combined = "; ".join(results)
        json.dump({
            "hookSpecificOutput": {
                "hookEventName": event_name,
                "additionalContext": combined
            }
        }, sys.stdout)
```

### 2. Handler Base Class (`mc/hooks/handler.py`)

```python
class BaseHandler:
    """Base class for hook handlers."""

    # Subclasses declare events: list of (event_name, matcher_or_None)
    events: list[tuple[str, str | None]] = []

    def __init__(self, ctx: HookContext, payload: dict):
        self.ctx = ctx
        self.payload = payload

    @classmethod
    def matches(cls, event_name: str, matcher_value: str) -> bool:
        for ev, m in cls.events:
            if ev == event_name:
                if m is None or m == matcher_value:
                    return True
        return False

    def handle(self) -> str | None:
        """Execute handler logic. Return additionalContext string or None."""
        raise NotImplementedError
```

### 3. Session Context (`mc/hooks/context.py`)

Persisted state across events within a session.

```python
class HookContext:
    """Shared state across hook invocations for a session."""

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.active_skill: str | None = None      # last skill invoked
        self.active_plan: str | None = None        # plan file being tracked
        self.active_agents: dict[str, dict] = {}   # agent_id -> {type, started_at}
        self.tracker_dir: str = ".claude/plan-tracker"
        self.plan_pattern: str = "docs/plans/*.md"

    @classmethod
    def load(cls, session_id: str) -> "HookContext":
        """Load from .claude/hook-state/<session_id>.json or create new."""
        ...

    def save(self):
        """Persist to disk."""
        ...
```

State file: `.claude/hook-state/<session_id>.json`

### 4. Handler Discovery (`mc/hooks/discovery.py`)

Convention-based: scan `mc/hooks/handlers/*.py`, import each, find subclasses of `BaseHandler`.

```python
def discover_handlers() -> list[type[BaseHandler]]:
    """Auto-discover handler classes from mc/hooks/handlers/."""
    handlers_dir = Path(__file__).parent / "handlers"
    result = []
    for py_file in sorted(handlers_dir.glob("*.py")):
        if py_file.name.startswith("_"):
            continue
        spec = importlib.util.spec_from_file_location(py_file.stem, py_file)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        for obj in vars(mod).values():
            if (isinstance(obj, type)
                and issubclass(obj, BaseHandler)
                and obj is not BaseHandler):
                result.append(obj)
    return result
```

### 5. Handlers (in `mc/hooks/handlers/`)

#### `plan_tracker.py` — PostToolUse/Write + TaskCompleted
Port of existing bash scripts. Parses `### Task N:` from plan markdown, computes parallel groups, tracks completion.

#### `skill_tracker.py` — PostToolUse/Skill
Captures which skill was invoked. Updates `ctx.active_skill`. Returns context like "Active skill: executing-plans".

#### `plan_capture.py` — PostToolUse/ExitPlanMode
Captures when a plan exits plan mode (approved). Links `ctx.active_plan` to the plan being executed.

#### `agent_tracker.py` — SubagentStart + SubagentStop
Tracks spawned agents. Updates `ctx.active_agents`. Reports "Agent explorer started for plan X" / "Agent completed, 3/5 tasks done".

## Hook Registration

`.claude/settings.local.json` registers the dispatcher for each event type:

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

## File Structure

```
mc/hooks/
├── __init__.py
├── dispatcher.py          # Entry point (called from settings.local.json)
├── handler.py             # BaseHandler class
├── context.py             # HookContext (shared session state)
├── discovery.py           # Convention-based handler discovery
├── config.py              # Hook configuration (plan patterns, tracker dir)
└── handlers/
    ├── __init__.py
    ├── plan_tracker.py    # Port of parse-plan-steps.sh + mark-step-complete.sh
    ├── skill_tracker.py   # Captures skill invocations
    ├── plan_capture.py    # Captures plan approval (ExitPlanMode)
    └── agent_tracker.py   # Tracks subagent lifecycle
```

## Migration

1. Old bash scripts (`parse-plan-steps.sh`, `mark-step-complete.sh`) are replaced by `plan_tracker.py`
2. `config.env` is replaced by `config.py`
3. Existing tracker JSONs in `.claude/plan-tracker/` remain compatible
4. Old bash scripts can be deleted after migration

## Edge Cases

- **No handlers match**: dispatcher exits 0 silently (no output)
- **Handler error**: log to stderr, continue with other handlers, exit 0
- **Missing context file**: create fresh context
- **Session state cleanup**: context files older than 24h are auto-pruned on load
- **Concurrent invocations**: file locking on context.json via `fcntl.flock`

## Non-Goals

- No daemon/long-running process
- No database — all state is JSON files
- No network calls from hooks
- No modification of Claude Code behavior (hooks are observational + context injection)
