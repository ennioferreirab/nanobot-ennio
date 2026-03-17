# Epic 26 Hotspot Follow-Up Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish the most valuable optional cleanup left after Epic 25 by shrinking the remaining frontend/backend hotspots and reducing avoidable Convex coupling in shared dashboard code.

**Architecture:** Preserve the current architecture. Tighten existing boundaries instead of introducing new layers. `features/*` remains the dashboard ownership model, Convex remains the dashboard data boundary, and backend layering remains runtime/contexts/application/domain/infrastructure/bridge.

**Tech Stack:** Next.js, React, TypeScript, Convex, Vitest, Python, pytest

---

### Task 1: Story 26.1 Dashboard Convex Task Hotspot

**Files:**
- Modify: `/Users/ennio/Documents/nanobot-ennio/dashboard/convex/tasks.ts`
- Create/modify:
  - `/Users/ennio/Documents/nanobot-ennio/dashboard/convex/lib/`
- Test:
  - `/Users/ennio/Documents/nanobot-ennio/dashboard/convex/tasks.test.ts`
  - `/Users/ennio/Documents/nanobot-ennio/dashboard/tests/architecture.test.ts`

**Steps:**
1. Add a failing guardrail or focused test for the next seam to leave `tasks.ts`.
2. Split one cohesive task responsibility cluster at a time into `dashboard/convex/lib/*`.
3. Keep the top-level `api.tasks.*` contract stable.
4. Re-run focused task tests after each extraction.
5. Re-run `npm run typecheck` and `npm run test:architecture`.

### Task 2: Story 26.2 Dashboard Shared Convex Coupling Cleanup

**Files:**
- Modify likely shared/root components and hooks under:
  - `/Users/ennio/Documents/nanobot-ennio/dashboard/components/`
  - `/Users/ennio/Documents/nanobot-ennio/dashboard/hooks/`
  - `/Users/ennio/Documents/nanobot-ennio/dashboard/features/*/hooks/`
- Test:
  - `/Users/ennio/Documents/nanobot-ennio/dashboard/tests/architecture.test.ts`
  - focused component/hook Vitest files for touched owners

**Steps:**
1. Lock the next shared/root coupling targets with failing architecture assertions.
2. Move clearly feature-owned Convex access into feature hooks.
3. Keep shared/root components as renderers or minimal shells.
4. Re-run focused dashboard tests and the architecture suite.

### Task 3: Story 26.3 Backend Executor and Bridge Hotspots

**Files:**
- Modify:
  - `/Users/ennio/Documents/nanobot-ennio/mc/contexts/execution/executor.py`
  - `/Users/ennio/Documents/nanobot-ennio/mc/bridge/__init__.py`
- Create/modify likely under:
  - `/Users/ennio/Documents/nanobot-ennio/mc/contexts/execution/`
  - `/Users/ennio/Documents/nanobot-ennio/mc/bridge/`
- Test:
  - `/Users/ennio/Documents/nanobot-ennio/tests/mc/test_architecture.py`
  - focused executor/bridge tests under `/Users/ennio/Documents/nanobot-ennio/tests/mc/`

**Steps:**
1. Add failing architecture assertions for the next backend seams to leave the hotspot modules.
2. Extract one cohesive responsibility cluster from `executor.py`.
3. Extract one cohesive façade/helper cluster from `bridge/__init__.py`.
4. Re-run focused backend tests after each extraction.
5. Re-run `uv run pytest tests/mc -q` at story/epic exit.

### Task 4: Epic 26 Exit Gate

**Files:**
- Modify tracking/story artifacts under `/Users/ennio/Documents/nanobot-ennio/_bmad-output/implementation-artifacts/`

**Steps:**
1. Re-run full dashboard verification.
2. Re-run full backend verification.
3. Record verification evidence in the stories.
4. Update sprint tracking.
