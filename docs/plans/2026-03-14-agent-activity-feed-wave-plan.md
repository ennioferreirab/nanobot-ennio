# Agent Activity Feed Wave Plan

**Date:** 2026-03-14

**Goal:** Add a structured, real-time activity feed for agent sessions using
the existing hooks → IPC → Convex pipeline. Phase 1 only — no inline
approve/reject.

**Design:** `docs/plans/2026-03-14-agent-activity-feed-design.md`

---

## Story Decomposition

- `29-1-add-session-activity-log-convex-table.md`
- `29-2-enrich-supervisor-with-activity-log-writes.md`
- `29-3-build-agent-activity-feed-component.md`
- `29-4-wire-activity-feed-into-chat-and-task-detail.md`

## Wave 0: Preconditions

**Entry gate:**
- Design spec approved
- Existing supervision pipeline works (hooks flow to Convex)
- Stories 28.1–28.7 merged (provider CLI types available for reference)

## Wave 1: Data Layer

**Stories:** 29.1, 29.2

**Objective:** Persist structured supervision events so the frontend can query
them.

**29.1** adds the Convex table (`sessionActivityLog`) with `append` mutation
and `listForSession` query.

**29.2** enriches the Python supervisor to call `sessionActivityLog:append`
after each supervision event.

**Sequencing:** 29.1 must land before 29.2 because the supervisor calls the
Convex mutation that 29.1 creates.

**Verification:**
- Convex schema deploys successfully
- `append` mutation test: seq increments monotonically
- `listForSession` test: returns events ordered by seq
- Supervisor test: `handle_event()` calls `sessionActivityLog:append` with
  correct fields
- Run existing supervisor tests to verify no regressions

**Exit gate:** Events persist to Convex when hooks fire.

## Wave 2: Activity Feed UI

**Stories:** 29.3

**Objective:** Build the React component that displays the activity feed.

**29.3** creates `AgentActivityFeed` + `useAgentActivity` hook. Can be
developed in isolation with mock Convex data.

**Verification:**
- Component tests: all event kinds render correctly
- Component tests: empty state renders
- Component tests: Interrupt/Stop buttons present
- Dashboard lint and format pass

**Exit gate:** Component renders correctly with mocked data.

## Wave 3: Integration and Wiring

**Stories:** 29.4

**Objective:** Wire the feed into the real UI surfaces.

**29.4** integrates `AgentActivityFeed` into `ChatPanel` and `TaskDetailSheet`.

**Verification:**
- Integration tests: feed appears in chat context
- Integration tests: feed appears in task detail context
- Full-stack validation via `uv run nanobot mc start`
- Architecture doc updated

**Exit gate:** Agent activity is visible in both chat and task detail when an
interactive session is active.

## Delivery Guidance

1. Wave 1 is the foundation — get the data flowing first.
2. Wave 2 can start in parallel with Wave 1 using mock data.
3. Wave 3 requires both Wave 1 and Wave 2 to be merged.
4. Total scope is ~300 lines of new code across 4 stories.
5. Phase 2 (inline approvals) is a separate initiative after Phase 1 ships.

## Concerns and Preocupações

### Convex deployment
Adding a new table requires a Convex schema push. If the schema is deployed
to production while the supervisor hasn't been updated yet, that's fine — the
table will just be empty. The reverse (supervisor writing to a table that
doesn't exist) will cause runtime errors. **Deploy schema first.**

### Event volume during development
When testing locally, events will accumulate. The 500-event query limit
prevents the frontend from choking, but the table will grow. The cleanup job
is not in Phase 1 scope. For local dev, manual table clearing is acceptable.

### Metadata variability
The Hook Metadata Contract (in the design spec) documents which fields each
hook event carries. But Claude Code could change its hook payload format in
future versions. The supervisor enrichment uses `.get()` with fallbacks, so
missing fields degrade gracefully to `null` — the UI shows fallback text.

### Regression risk on supervisor
Story 29.2 modifies `InteractiveExecutionSupervisor.handle_event()`, which is
a hot path. The change is additive (one extra mutation call after the existing
flow), but must not break the existing `record_supervision` behavior. Run the
full existing test suite before and after.

### TaskDetailSheet migration
Story 29.4 touches `TaskDetailSheet`, which is a large, complex component.
The change should be minimal — add `AgentActivityFeed` alongside the existing
terminal panel, not replace it in Phase 1. Full terminal panel removal is
deferred to a follow-up when the activity feed is proven.
