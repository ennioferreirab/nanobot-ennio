# Epic 26 Hotspot Follow-Up Design

## Goal

Finish the highest-value optional cleanup still left after Epic 25:

1. reduce the last oversized frontend Convex task module
2. reduce residual `convex/react` coupling in shared/root dashboard components
3. reduce the two remaining backend hotspots with the highest cross-cutting impact

## Scope

This epic is not another architectural migration. The current architecture direction stays the same.

The work is explicitly incremental:

- keep feature-first ownership in the dashboard
- keep Convex as the dashboard data boundary
- keep backend layering as `runtime -> contexts -> application/domain/infrastructure/bridge`

The goal is to simplify and tighten existing boundaries, not add new abstraction layers.

## Target Outcomes

### 1. `dashboard/convex/tasks.ts` Stops Being the Main Frontend God File

`dashboard/convex/tasks.ts` still owns too many unrelated responsibilities. The next split should isolate:

- remaining read-model helpers
- restore/archive/history behavior not yet extracted
- mutation flows that are cohesive but still embedded in the top-level file

The public `api.tasks.*` surface should remain stable. The split should happen behind that contract.

### 2. Shared/Root Dashboard Components Stop Talking to Convex Directly Where Avoidable

The dashboard still has shared/root components that import `convex/react` directly. Some of that is legitimate, but some of it is just leftover coupling.

This epic should move clearly feature-owned data/mutation access out of shared/root components and into feature hooks. The remaining shared components should either:

- be pure UI/rendering components
- or be explicit shell components with minimal boundary responsibilities

### 3. Backend Hotspots Keep Shrinking

`mc/contexts/execution/executor.py` and `mc/bridge/__init__.py` are still the largest remaining backend hotspots.

The next cleanup should prefer extractions with real cohesion:

- executor: isolate completion/error-handling/output sync seams that do not belong in the main orchestrating class body
- bridge: extract logically grouped façade helpers into internal owners without changing the external bridge contract yet

## Story Breakdown

### Story 26.1

Reduce the remaining hotspot in `dashboard/convex/tasks.ts`.

### Story 26.2

Reduce residual `convex/react` coupling in shared/root dashboard components and hooks where ownership is clearly feature-specific.

### Story 26.3

Reduce the backend hotspots in `executor.py` and `bridge/__init__.py` with test-first extraction.

## Non-Goals

- no public API redesign of Convex function names
- no rewrite of dashboard shared UI primitives
- no backend bridge replacement or repository-layer rewrite
- no speculative abstraction just to reduce line count

## Verification Strategy

- architecture tests first for new seams where appropriate
- focused red/green cycles for each extracted responsibility
- dashboard:
  - `npm run typecheck`
  - `npm run test:architecture`
  - focused Vitest during each story
  - full `npm run test` at epic exit
- backend:
  - focused executor/bridge tests during each story
  - full `uv run pytest tests/mc -q` at epic exit
