# Architecture Convergence Design

**Date:** 2026-03-11

**Objective:** Converge the implemented architecture to the intended feature-first design by eliminating legacy ownership layers, reducing cross-layer coupling, and making the documented boundaries the only boundaries that exist in code.

## Target State

### Backend

- `mc/runtime/*` owns process composition, lifecycle loops, and subscription wiring only.
- `mc/contexts/*` owns all business flows:
  - `conversation`
  - `planning`
  - `execution`
  - `review`
  - `agents`
- `mc/application/*` owns reusable execution machinery that is not itself a business context.
- `mc/domain/*` owns workflow rules, transition logic, and pure policy.
- `mc/infrastructure/*` owns filesystem, provider, bootstrap, and environment details.
- `mc/bridge/*` remains the Convex boundary, but stops acting as a giant shared service locator.

### Frontend

- `dashboard/app/*` owns route shells and top-level composition only.
- `dashboard/features/*` owns UI, hooks, view-models, and feature-local utilities.
- `dashboard/components/ui/*` and `dashboard/components/viewers/*` stay as shared primitives.
- `dashboard/components/*` and `dashboard/hooks/*` stop acting as parallel ownership layers and are either deleted or reduced to primitives only.

## Explicit Non-Goals

- Preserve long-term compatibility shims for legacy namespaces.
- Optimize for minimal short-term disruption.
- Rebuild Mission Control around a new framework or data layer.

## Migration Principles

1. The migration is wave-based, not piecemeal.
2. Each wave has a single architectural objective and a hard exit gate.
3. Temporary compatibility is allowed only inside the active wave and must be removed by the end of the next wave.
4. Tests are the safety net; architecture cleanup is allowed to break internals aggressively.
5. `docs/ARCHITECTURE.md` and the guardrail tests are updated as part of the migration, not after it.

## Ownership Decisions

### Backend

- `mc/ask_user/*` becomes `mc.contexts.conversation.ask_user/*`.
- `mc/mentions/*` becomes `mc.contexts.conversation.mentions/*`.
- `mc/services/conversation*.py` is absorbed into `mc.contexts.conversation/*`.
- `mc/services/agent_sync.py` is absorbed into `mc.contexts.agents/sync.py`.
- `mc/services/crash_recovery.py` is absorbed into `mc.contexts.execution/crash_recovery.py`.
- `mc/services/plan_negotiation.py` is absorbed into `mc.contexts.planning/negotiation.py`.
- `mc/workers/*` is absorbed into `mc.runtime.workers/*` or the owning context if the behavior is not runtime-only.

### Frontend

- `DashboardLayout` becomes a thin shell that composes feature entry points.
- `TaskDetailSheet` is split into feature-owned subcomponents and hooks.
- direct `convex/react` usage is pushed down into feature hooks and view-models, then consolidated behind feature data hooks.
- `dashboard/components/*` wrappers for migrated features are deleted instead of kept as permanent aliases.

## Wave Strategy

### Wave 0

Set up an isolated worktree, record a clean baseline, and freeze new legacy usage with stricter guardrails.

### Wave 1

Make `conversation` the only owner of ask-user and mention flows. Delete the legacy packages after import sites move.

### Wave 2

Collapse `services` and `workers` into canonical owners. `runtime` becomes composition only, not an alternate ownership layer.

### Wave 3

Split `executor`, `gateway`, and `bridge` by responsibility so the central hotspots stop accumulating unrelated concerns.

### Wave 4

Move the dashboard to real feature ownership for `tasks`, `boards`, and `thread`, including the current large shells and direct Convex calls.

### Wave 5

Finish feature ownership for `agents`, `settings`, `search`, `activity`, and `terminal`; slim `app/*` and remove feature wrappers in root `components` and `hooks`.

### Wave 6

Delete all remaining legacy namespaces and compatibility layers, harden guardrails, run full verification, code review, and Playwright smoke coverage.

## Verification Model

Every wave closes with:

1. focused tests for touched modules
2. architecture guardrail tests
3. relevant lint/typecheck suites
4. `/code-review` on the wave diff
5. Playwright smoke validation on the dashboard flow most likely affected by that wave

## Success Criteria

- No imports remain from `mc/services`, `mc/workers`, `mc/ask_user`, `mc/mentions`, or deleted dashboard wrapper modules.
- `dashboard/app/*` composes feature entry points rather than owning feature behavior.
- Feature components do not directly depend on `convex/react` unless explicitly retained as a final approved exception, and the final target is zero such exceptions.
- `mc/bridge/__init__.py`, `mc/runtime/gateway.py`, `mc/contexts/execution/executor.py`, and `dashboard/features/tasks/components/TaskDetailSheet.tsx` are materially reduced and split by responsibility.
- `docs/ARCHITECTURE.md` matches the code without caveats about in-flight ownership.
