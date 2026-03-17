# Epic 25 Architecture Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish the highest-value remaining architecture cleanup by removing residual dashboard ownership ambiguity and reducing the main frontend/backend god files.

**Architecture:** This plan keeps the current architecture direction intact. It does not introduce another migration layer. Instead, it sharpens existing boundaries: root dashboard components become thinner, task-specific data logic is split from oversized Convex/UI modules, and backend execution orchestration is reduced to clearer internal owners.

**Tech Stack:** Next.js, React, TypeScript, Convex, Vitest, Playwright, Python, pytest

---

### Task 1: Story 25.1 Dashboard Root Ownership Cleanup

**Files:**
- Modify: `/Users/ennio/Documents/nanobot-ennio/dashboard/components/AgentSidebar.tsx`
- Modify: `/Users/ennio/Documents/nanobot-ennio/dashboard/components/ActivityFeedPanel.tsx`
- Modify: `/Users/ennio/Documents/nanobot-ennio/dashboard/components/TerminalBoard.tsx`
- Likely modify: `/Users/ennio/Documents/nanobot-ennio/dashboard/components/BoardSelector.tsx`
- Likely modify: `/Users/ennio/Documents/nanobot-ennio/dashboard/components/DoneTasksSheet.tsx`
- Likely modify: `/Users/ennio/Documents/nanobot-ennio/dashboard/components/TrashBinSheet.tsx`
- Create/modify feature hooks under:
  - `/Users/ennio/Documents/nanobot-ennio/dashboard/features/agents/hooks/`
  - `/Users/ennio/Documents/nanobot-ennio/dashboard/features/activity/hooks/`
  - `/Users/ennio/Documents/nanobot-ennio/dashboard/features/terminal/hooks/`
  - `/Users/ennio/Documents/nanobot-ennio/dashboard/features/boards/hooks/`
  - `/Users/ennio/Documents/nanobot-ennio/dashboard/features/tasks/hooks/`
- Test:
  - `/Users/ennio/Documents/nanobot-ennio/dashboard/tests/architecture.test.ts`
  - existing component and hook tests for touched owners

**Steps:**
1. Write or tighten failing architecture tests for components that should no longer own direct feature data/mutations.
2. Run the focused dashboard architecture test to confirm red.
3. Extract direct Convex access/state into feature-owned hooks where ownership is clearly feature-specific.
4. Keep shared shell behavior in root components only if it is genuinely cross-feature.
5. Run focused Vitest suites for each touched shell/feature component.
6. Run `npm run test:architecture`.
7. Commit.

### Task 2: Story 25.2 Frontend Hotspot Reduction

**Files:**
- Modify: `/Users/ennio/Documents/nanobot-ennio/dashboard/convex/tasks.ts`
- Modify: `/Users/ennio/Documents/nanobot-ennio/dashboard/features/tasks/components/TaskDetailSheet.tsx`
- Create/modify under:
  - `/Users/ennio/Documents/nanobot-ennio/dashboard/convex/lib/`
  - `/Users/ennio/Documents/nanobot-ennio/dashboard/features/tasks/components/`
  - `/Users/ennio/Documents/nanobot-ennio/dashboard/features/tasks/hooks/`
- Test:
  - `/Users/ennio/Documents/nanobot-ennio/dashboard/convex/tasks.test.ts`
  - `/Users/ennio/Documents/nanobot-ennio/dashboard/features/tasks/components/TaskDetailSheet.test.tsx`
  - task-related component/hook tests

**Steps:**
1. Write a failing test or guardrail for the new seam to be extracted from `tasks.ts` or `TaskDetailSheet.tsx`.
2. Run the focused test to verify red.
3. Extract one cohesive responsibility at a time from `tasks.ts` into `dashboard/convex/lib/*`.
4. Extract one cohesive tab/section/presenter responsibility at a time from `TaskDetailSheet.tsx`.
5. Re-run focused tests after each extraction cluster.
6. Run `npm run typecheck`, `npm run test`, and `npm run test:architecture`.
7. Commit.

### Task 3: Story 25.3 Backend Executor Reduction

**Files:**
- Modify: `/Users/ennio/Documents/nanobot-ennio/mc/contexts/execution/executor.py`
- Likely create/modify under:
  - `/Users/ennio/Documents/nanobot-ennio/mc/contexts/execution/`
  - `/Users/ennio/Documents/nanobot-ennio/mc/application/execution/`
- Test:
  - focused executor tests under `/Users/ennio/Documents/nanobot-ennio/tests/mc/`
  - `/Users/ennio/Documents/nanobot-ennio/tests/mc/test_architecture.py`

**Steps:**
1. Identify the next two highest-cohesion seams still embedded in `executor.py`.
2. Add or tighten failing tests for those seams or boundary expectations.
3. Run the focused executor/backend architecture tests to confirm red.
4. Extract the seams into explicit owners without changing public behavior.
5. Re-run focused executor tests until green.
6. Run `uv run pytest tests/mc -q` or the agreed focused slice if the story is intentionally scoped.
7. Commit.

### Task 4: Epic 25 Exit Gate

**Files:**
- Modify tracking/story artifacts as needed under `/Users/ennio/Documents/nanobot-ennio/_bmad-output/implementation-artifacts/`

**Steps:**
1. Run `/code-review` after each story.
2. Re-run final dashboard and backend guardrails.
3. Record verification evidence in the story artifacts.
4. Update sprint tracking to reflect story completion.

Plan complete and saved to `/Users/ennio/Documents/nanobot-ennio/docs/plans/2026-03-12-epic-25-architecture-cleanup-plan.md`.
