# Review Follow-up Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the highest-signal regressions and compatibility breaks found in the architecture review without widening scope into unrelated refactors.

**Architecture:** Keep the current incremental refactor direction, but repair unsafe edges where read paths mutate state, UI assumes ideal payloads, and tests still rely on removed compatibility seams. Prefer small, explicit shims over reintroducing old architecture patterns.

**Tech Stack:** Python, pytest, Next.js, React, Convex, Vitest

---

### Task 1: Make memory reads non-destructive

**Files:**
- Modify: `mc/memory/service.py`
- Test: `tests/mc/memory/test_service.py`
- Test: `tests/cc/test_workspace.py`

**Step 1: Write the failing test**
- Add a test proving `create_memory_store()` does not move rogue files out of `memory/`.

**Step 2: Run test to verify it fails**
- Run: `./.venv/bin/pytest tests/mc/memory/test_service.py::TestCreateMemoryStore::test_does_not_mutate_workspace_when_creating_store -v`

**Step 3: Write minimal implementation**
- Remove quarantine side effects from `create_memory_store()`.
- Keep `quarantine_invalid_memory_files()` as an explicit maintenance helper.

**Step 4: Run focused tests**
- Run: `./.venv/bin/pytest tests/mc/memory/test_service.py tests/cc/test_workspace.py -q`

### Task 2: Harden dashboard settings and cron modal

**Files:**
- Modify: `dashboard/components/CronJobsModal.tsx`
- Modify: `dashboard/components/CronJobsModal.test.tsx`
- Modify: `dashboard/components/ModelTierSettings.tsx`
- Modify: `dashboard/components/SettingsPanel.test.tsx`

**Step 1: Write the failing tests**
- Add a cron modal test for a partial `/api/channels` payload.
- Add settings tests covering invalid JSON in model tier values.

**Step 2: Run tests to verify they fail**
- Run: `npm test -- CronJobsModal.test.tsx SettingsPanel.test.tsx`

**Step 3: Write minimal implementation**
- Normalize `enabledChannels` before storing.
- Parse settings values defensively with safe fallbacks.

**Step 4: Run focused tests**
- Run: `npm test -- CronJobsModal.test.tsx SettingsPanel.test.tsx`

### Task 3: Restore minimal compatibility seams for stale tests

**Files:**
- Modify: `mc/mentions/handler.py`
- Modify: `tests/mc/test_mention_handler_context.py`
- Modify: `mc/step_dispatcher.py`

**Step 1: Write/adjust failing tests**
- Update mention-handler tests to patch the current config import path.
- Add a compatibility shim for `ThreadContextBuilder` or equivalent current API.
- Restore `_maybe_inject_orientation` import compatibility in `mc.step_dispatcher`.

**Step 2: Run tests to verify failures are understood**
- Run: `./.venv/bin/pytest tests/mc/test_mention_handler_context.py tests/mc/test_planner.py -q`

**Step 3: Write minimal implementation**
- Keep the current runtime behavior, but expose the compatibility surface the tests still depend on.

**Step 4: Run focused tests**
- Run: `./.venv/bin/pytest tests/mc/test_mention_handler_context.py tests/mc/test_planner.py -q`

### Task 4: Verify the review delta

**Files:**
- No production files expected

**Step 1: Run relevant Python suites**
- Run: `./.venv/bin/pytest tests/mc/memory/test_service.py tests/cc/test_workspace.py tests/mc/test_mention_handler_context.py tests/mc/test_planner.py tests/mc/test_gateway_cron_delivery.py -q`

**Step 2: Run relevant dashboard suites**
- Run: `cd dashboard && npm test -- CronJobsModal.test.tsx SettingsPanel.test.tsx`

**Step 3: Re-run broader sanity checks if focused suites are green**
- Run: `./.venv/bin/pytest -q`
- Run: `cd dashboard && npm test`
