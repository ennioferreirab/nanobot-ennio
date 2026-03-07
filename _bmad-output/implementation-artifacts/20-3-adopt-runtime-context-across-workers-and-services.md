# Story 20.3: Adopt RuntimeContext Across Workers and Services

Status: ready-for-dev

## Story

As a **maintainer**,
I want workers and services to receive RuntimeContext instead of bare bridge,
so that dependency injection is standardized and services can access shared configuration without coupling to gateway.

## Acceptance Criteria

### AC1: RuntimeContext Is the Standard Dependency

**Given** `mc/infrastructure/runtime_context.py` defines RuntimeContext (bridge, agents_dir, admin_key, admin_url, services)
**When** the adoption is complete
**Then** all workers in `mc/workers/` accept RuntimeContext in their constructor
**And** all services that currently receive `bridge` directly accept RuntimeContext instead
**And** RuntimeContext is created once in gateway and passed down

### AC2: Gateway Creates RuntimeContext

**Given** the gateway currently creates workers with bare bridge
**When** the adoption is complete
**Then** `mc/gateway.py` creates a single RuntimeContext instance
**And** passes it to all workers and services during composition

### AC3: Workers Use RuntimeContext

**Given** workers in `mc/workers/` (inbox, planning, review, kickoff) receive bare bridge
**When** the adoption is complete
**Then** they receive RuntimeContext
**And** access bridge via `ctx.bridge`
**And** can access agents_dir, admin_key, and shared services via RuntimeContext

### AC4: No Behavior Change

**Given** this is a pure refactoring
**When** the adoption is complete
**Then** all existing tests pass without modification (except constructor signature changes)
**And** runtime behavior is identical

## Tasks / Subtasks

- [ ] **Task 1: Review RuntimeContext definition** (AC: #1)
  - [ ] 1.1 Read `mc/infrastructure/runtime_context.py`
  - [ ] 1.2 Determine if current fields are sufficient or need extension
  - [ ] 1.3 Identify all workers and services that receive bare bridge

- [ ] **Task 2: Update RuntimeContext if needed** (AC: #1)
  - [ ] 2.1 Add any missing fields needed by workers/services
  - [ ] 2.2 Keep it minimal -- only shared concerns

- [ ] **Task 3: Update workers** (AC: #3)
  - [ ] 3.1 Update InboxWorker constructor to accept RuntimeContext
  - [ ] 3.2 Update PlanningWorker constructor
  - [ ] 3.3 Update ReviewWorker constructor
  - [ ] 3.4 Update KickoffResumeWorker constructor
  - [ ] 3.5 Update internal bridge references to `self._ctx.bridge`

- [ ] **Task 4: Update gateway composition** (AC: #2)
  - [ ] 4.1 Create RuntimeContext in gateway
  - [ ] 4.2 Pass RuntimeContext to all workers
  - [ ] 4.3 Pass RuntimeContext to services that need it

- [ ] **Task 5: Update tests** (AC: #4)
  - [ ] 5.1 Update worker test fixtures to provide RuntimeContext
  - [ ] 5.2 Run full test suite
  - [ ] 5.3 Verify no behavior changes

## Dev Notes

### Architecture Patterns

**RuntimeContext is a simple dataclass.** It replaces ad-hoc parameter passing. Workers access `ctx.bridge`, `ctx.agents_dir`, etc. instead of receiving each as separate parameters.

**Minimal scope.** Only convert workers and services that currently receive bridge directly. Don't convert everything at once -- this is the first adoption pass.

**Key Files to Read First:**
- `mc/infrastructure/runtime_context.py` -- current RuntimeContext (39 lines)
- `mc/gateway.py` -- where workers are created
- `mc/workers/inbox.py` -- InboxWorker constructor
- `mc/workers/planning.py` -- PlanningWorker constructor
- `mc/workers/review.py` -- ReviewWorker constructor
- `mc/workers/kickoff.py` -- KickoffResumeWorker constructor

### Project Structure Notes

**Files to MODIFY:**
- `mc/infrastructure/runtime_context.py` -- extend if needed
- `mc/gateway.py` -- create and pass RuntimeContext
- `mc/workers/inbox.py`, `planning.py`, `review.py`, `kickoff.py` -- accept RuntimeContext
- Worker test files

### References

- [Source: mc/infrastructure/runtime_context.py] -- RuntimeContext definition
- [Source: docs/ARCHITECTURE.md] -- infrastructure layer

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
