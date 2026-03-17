# Epic 25 Architecture Cleanup Design

## Goal

Close the highest-value remaining architecture gaps after Epics 22-24 without reopening broad migration work.

The target is narrow:
- finish dashboard ownership cleanup where root components still own feature behavior
- reduce the two clearest frontend hotspots
- reduce the largest backend execution hotspot

## Current Problems

### 1. Dashboard ownership is still hybrid

`dashboard/features/*` is the intended owner model, but some root components in `dashboard/components/*` still own feature state and direct Convex access.

This keeps responsibilities ambiguous and makes shell/shared layers heavier than they should be.

### 2. Frontend still has two strong hotspots

- `dashboard/convex/tasks.ts`
- `dashboard/features/tasks/components/TaskDetailSheet.tsx`

Both files still concentrate too much behavior and make future refactors expensive.

### 3. Backend execution still has one dominant hotspot

- `mc/contexts/execution/executor.py`

It is still the clearest backend god file and remains the main source of execution-path coupling.

## Recommended Approach

Use one short epic with three stories:

1. finish dashboard root ownership cleanup
2. reduce the main frontend hotspots
3. reduce the main backend hotspot

This is preferable to a single large cleanup because the remaining work is already well isolated by boundary.

## Scope

### In Scope

- feature-owned state/data extraction out of dashboard root components where ownership is clearly not shared
- decomposition of `dashboard/convex/tasks.ts`
- further decomposition of `TaskDetailSheet.tsx`
- decomposition of `executor.py`
- architecture guardrail updates where the new boundaries should be enforced

### Out of Scope

- new migration layers
- broad dashboard redesign
- `mc/bridge/__init__.py` full cleanup unless discovered as a necessary follow-on inside the executor split
- unrelated lint/test hygiene

## Target State

### Dashboard

- `dashboard/components/*` acts primarily as shell/shared composition
- feature behavior lives in `dashboard/features/*`
- root UI components avoid direct Convex access unless they are truly shared runtime shells

### Frontend data layer

- `dashboard/convex/tasks.ts` becomes a thinner composition module
- task mutations/read-model helpers move into smaller `dashboard/convex/lib/*` owners

### Backend execution

- `executor.py` keeps orchestration ownership only
- provider plumbing, message building, session handling, artifact/output handling, and background behavior move into smaller internal owners where justified

## Verification

Each story should close with:

- focused unit/component/backend tests
- backend architecture tests where relevant
- `dashboard/tests/architecture.test.ts` where relevant
- `/code-review`
- Playwright only if the story changes critical task flows materially

## Success Criteria

- less ambiguous dashboard ownership
- smaller hotspots with clearer file boundaries
- no regression in current architecture guardrails
- no reintroduction of compatibility wrappers
