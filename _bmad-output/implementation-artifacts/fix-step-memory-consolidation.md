# Story: Fix memory consolidation for step executions

Status: ready-for-dev

## Story

As a platform operator,
I want agent memory to consolidate after step executions,
so that agents build persistent memory across tasks and the dashboard can display MEMORY.md/HISTORY.md.

## Problem

The dashboard shows 404 errors when fetching agent memory files:
```
/api/agents/identity-designer/memory/HISTORY.md → 404
/api/agents/identity-designer/memory/MEMORY.md  → 404
```

**Root cause:** `StepDispatcher._execute_step()` in `mc/contexts/execution/step_dispatcher.py` never sets `session_boundary_reason` on the `ExecutionRequest`. The post-execution consolidation hooks in `mc/application/execution/post_processing.py` gate on this field — when it's `None`, they skip with `"no_session_boundary"`.

Since most agent work flows through step dispatch (not direct task execution), memory consolidation effectively never runs for CC backend agents.

**Where `session_boundary_reason` IS set today:**
- `mc/contexts/execution/executor.py:519` → `"task_completion"`
- `mc/runtime/workers/review.py:118` → `"task_review"`
- `mc/contexts/conversation/mentions/handler.py:261` → `"mention"`

**Where it's MISSING:**
- `mc/contexts/execution/step_dispatcher.py` — `build_step_context()` builds the request but never sets `session_boundary_reason`

## Expected Behavior

After a step completes execution:
1. The post-execution hook detects `session_boundary_reason="step_completion"`
2. `consolidate_task_output()` runs in the background
3. `MEMORY.md` and `HISTORY.md` are created/updated in the agent's memory workspace
4. The dashboard API returns 200 with memory content instead of 404

## Acceptance Criteria

1. Step executions trigger memory consolidation via the existing post-execution hooks
2. The consolidation log event shows `action="consolidated"` instead of `action="skipped"` / `skip_reason="no_session_boundary"`
3. Existing tests continue to pass

## Tasks / Subtasks

- [ ] Task 1 (AC: #1): Add `req.session_boundary_reason = "step_completion"` in `step_dispatcher.py`
  - [ ] Add the line after `req = await ctx_builder.build_step_context(task_id, step)` (line 641) and before `req.runner_type = resolve_step_runner_type(req)` (line 669)

## Dev Notes

- This is a one-line fix following the exact same pattern as `executor.py:519` and `review.py:118`
- The consolidation infrastructure is already fully built — task-level execution already consolidates correctly
- The fix enables the existing hooks to fire for step executions

### References

- [Source: mc/contexts/execution/step_dispatcher.py#_execute_step] — missing boundary reason
- [Source: mc/application/execution/post_processing.py#cc_task_memory_consolidation_hook] — guard that skips consolidation
- [Source: mc/memory/service.py#consolidate_task_output] — consolidation implementation
- [Source: mc/contexts/execution/executor.py:519] — reference pattern for task_completion

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### File List

- `mc/contexts/execution/step_dispatcher.py`
