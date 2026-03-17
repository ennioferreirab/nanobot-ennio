# Agent and Squad Unification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `agents` the only canonical agent identity so squads and workflows reference registered global agents instead of squad-local `agentSpecs`.

**Architecture:** Remove the squad-specific agent identity from Convex and UI flows. `Create Squad` should resolve proposed members against `agents`, create missing global agents, and store only `agentIds` in squad and workflow records. Runtime launch should resolve `agentId -> agent.name` directly.

**Tech Stack:** Convex, Next.js App Router, React 19, TypeScript, Python, Vitest, pytest, Mission Control runtime

---

## References

- Design: `docs/plans/2026-03-15-agent-squad-unification-design.md`
- Architecture: `docs/ARCHITECTURE.md`
- Current squad publish path: `dashboard/convex/lib/squadGraphPublisher.ts`
- Current mission launch path: `dashboard/convex/lib/squadMissionLaunch.ts`
- Current squad detail hook: `dashboard/features/agents/hooks/useSquadDetailData.ts`
- Story prerequisite: create or confirm an implementation-ready story in `_bmad-output/implementation-artifacts/` before coding

## Execution Setup

- Execute in a dedicated git worktree from the repository root.
- Suggested branch label: `agentSquadUnification`. If the branch is created via Codex tooling, use `codex/agentSquadUnification`.
- Keep app validation on the full MC stack with `PORT=3001 uv run nanobot mc start`.
- Do not validate this work with frontend-only `npm run dev`.

## Delivery Order

1. Lock the target model in tests and schema.
2. Change squad publish to reuse or create canonical `agents`.
3. Switch squad detail and workflow data reads to global agents.
4. Switch mission launch and execution-plan compilation to `agentId`.
5. Remove the obsolete squad `agentSpecs` path and run full guardrails.

### Task 0: Create or confirm the story artifact

**Files:**
- Create or confirm: `_bmad-output/implementation-artifacts/<story-file>.md`
- Reference: `docs/plans/2026-03-15-agent-squad-unification-design.md`
- Reference: `docs/plans/2026-03-15-agent-squad-unification-implementation-plan.md`

**Step 1: Ensure there is an implementation-ready story**

Write or confirm a story that states:

- every squad member must be a registered global agent
- squads reference agents instead of owning child specs
- editing from squad context updates the global agent

**Step 2: Stop implementation if the story does not exist**

Run:

```bash
rg --files _bmad-output/implementation-artifacts | rg 'agent|squad'
```

Expected: either an existing story clearly covers this work, or a new one is created before coding starts.

**Step 3: Commit the story artifact if created**

```bash
git add _bmad-output/implementation-artifacts/<story-file>.md
git commit -m "docs: add agent and squad unification story"
```

### Task 1: Replace squad and workflow agent references in the schema

**Files:**
- Modify: `dashboard/convex/schema.ts`
- Modify: `dashboard/convex/squadSpecs.ts`
- Modify: `dashboard/convex/workflowSpecs.ts`
- Modify: `dashboard/convex/schema.test.ts`
- Modify: `dashboard/convex/squadSpecs.test.ts`
- Modify: `dashboard/convex/workflowSpecs.test.ts`

**Step 1: Write the failing schema tests**

Add tests that prove:

- `squadSpecs` validates `agentIds: Id<"agents">[]`
- `workflowSpecs.steps` validates `agentId: Id<"agents">`
- the old `agentSpecIds` and `agentSpecId` fields are no longer part of the canonical squad path

Example assertion shape:

```ts
expect(squadDocument.agentIds).toEqual(["agent-1"]);
expect(workflowStep.agentId).toBe("agent-1");
expect("agentSpecIds" in squadDocument).toBe(false);
```

**Step 2: Run the targeted tests and confirm they fail**

```bash
cd dashboard
npm run test -- convex/schema.test.ts convex/squadSpecs.test.ts convex/workflowSpecs.test.ts
```

Expected: FAIL because the schema and tests still use `agentSpecIds` and `agentSpecId`.

**Step 3: Implement the schema switch**

Make the minimal schema changes:

- replace `agentSpecIds` with `agentIds` in `squadSpecs`
- replace `agentSpecId` with `agentId` in `workflowSpecs.steps`
- update mutations, validators, and tests to the new fields

**Step 4: Re-run the targeted tests**

Run the same command and expect PASS.

**Step 5: Run dashboard guardrails and commit**

```bash
cd dashboard
npm run format:file:check -- convex/schema.ts convex/schema.test.ts convex/squadSpecs.ts convex/squadSpecs.test.ts convex/workflowSpecs.ts convex/workflowSpecs.test.ts
npm run lint:file -- convex/schema.ts convex/schema.test.ts convex/squadSpecs.ts convex/squadSpecs.test.ts convex/workflowSpecs.ts convex/workflowSpecs.test.ts
git add dashboard/convex/schema.ts dashboard/convex/schema.test.ts dashboard/convex/squadSpecs.ts dashboard/convex/squadSpecs.test.ts dashboard/convex/workflowSpecs.ts dashboard/convex/workflowSpecs.test.ts
git commit -m "refactor: switch squads and workflows to canonical agents"
```

### Task 2: Make squad graph publish reuse or create global agents

**Files:**
- Modify: `dashboard/convex/lib/squadGraphPublisher.ts`
- Modify: `dashboard/convex/lib/squadGraphPublisher.test.ts`
- Modify: `dashboard/convex/agents.ts`
- Modify: `dashboard/convex/agents.test.ts`
- Modify: `dashboard/features/agents/hooks/useCreateSquadDraft.ts`

**Step 1: Write the failing publish tests**

Add tests that prove:

- publishing a squad reuses an existing agent when `name` already exists
- publishing a squad creates a new global agent when no registered agent exists
- the published squad stores `agentIds`
- workflow steps store `agentId`
- the publish path does not insert `agentSpecs`

Example assertion shape:

```ts
expect(agentUpserts).toHaveLength(2);
expect(squadInsert.value.agentIds).toEqual(["agents-id-1", "agents-id-2"]);
expect(workflowStep.agentId).toBe("agents-id-1");
expect(agentSpecInserts).toHaveLength(0);
```

**Step 2: Run the targeted tests and confirm they fail**

```bash
cd dashboard
npm run test -- convex/lib/squadGraphPublisher.test.ts convex/agents.test.ts
```

Expected: FAIL because squad publish still inserts `agentSpecs`.

**Step 3: Implement canonical-agent publish**

Recommended implementation:

1. add a small helper in the publish path to query `agents` by `name`
2. reuse the existing agent `_id` when found
3. create a normal global `agents` record when missing
4. build `agentKey -> agentId`
5. persist `agentIds` on the squad and `agentId` on workflow steps

Keep the agent creation payload intentionally small and aligned with the standard global agent contract.

**Step 4: Re-run the targeted tests**

Run the same command and expect PASS.

**Step 5: Run dashboard guardrails and commit**

```bash
cd dashboard
npm run format:file:check -- convex/lib/squadGraphPublisher.ts convex/lib/squadGraphPublisher.test.ts convex/agents.ts convex/agents.test.ts features/agents/hooks/useCreateSquadDraft.ts
npm run lint:file -- convex/lib/squadGraphPublisher.ts convex/lib/squadGraphPublisher.test.ts convex/agents.ts convex/agents.test.ts features/agents/hooks/useCreateSquadDraft.ts
git add dashboard/convex/lib/squadGraphPublisher.ts dashboard/convex/lib/squadGraphPublisher.test.ts dashboard/convex/agents.ts dashboard/convex/agents.test.ts dashboard/features/agents/hooks/useCreateSquadDraft.ts
git commit -m "feat: publish squads against canonical agents"
```

### Task 3: Switch squad detail and editing surfaces to global agents

**Files:**
- Modify: `dashboard/features/agents/hooks/useSquadDetailData.ts`
- Modify: `dashboard/features/agents/hooks/useSquadDetailData.test.tsx`
- Modify: `dashboard/features/agents/components/SquadDetailSheet.tsx`
- Modify: `dashboard/features/agents/components/SquadDetailSheet.test.tsx`
- Modify: `dashboard/convex/agents.ts`

**Step 1: Write the failing UI/data tests**

Add tests that prove:

- squad detail loads `agents` by `agentIds`
- selecting a squad member shows data from the global `agents` record
- edits route through the standard global agent update path

Example assertion shape:

```tsx
expect(result.current.agents?.[0].name).toBe("post-writer");
expect(screen.getByText("Writer")).toBeInTheDocument();
```

**Step 2: Run the targeted tests and confirm they fail**

```bash
cd dashboard
npm run test -- features/agents/hooks/useSquadDetailData.test.tsx features/agents/components/SquadDetailSheet.test.tsx
```

Expected: FAIL because squad detail still queries `agentSpecs`.

**Step 3: Implement the UI/data switch**

Make the minimal changes:

- add or expose a query that returns `agents` by ids
- load squad agents via `agentIds`
- render agent details from global agent fields
- ensure edit actions point at the normal agent config mutation

**Step 4: Re-run the targeted tests**

Run the same command and expect PASS.

**Step 5: Run dashboard guardrails and commit**

```bash
cd dashboard
npm run format:file:check -- convex/agents.ts features/agents/hooks/useSquadDetailData.ts features/agents/hooks/useSquadDetailData.test.tsx features/agents/components/SquadDetailSheet.tsx features/agents/components/SquadDetailSheet.test.tsx
npm run lint:file -- convex/agents.ts features/agents/hooks/useSquadDetailData.ts features/agents/hooks/useSquadDetailData.test.tsx features/agents/components/SquadDetailSheet.tsx features/agents/components/SquadDetailSheet.test.tsx
git add dashboard/convex/agents.ts dashboard/features/agents/hooks/useSquadDetailData.ts dashboard/features/agents/hooks/useSquadDetailData.test.tsx dashboard/features/agents/components/SquadDetailSheet.tsx dashboard/features/agents/components/SquadDetailSheet.test.tsx
git commit -m "refactor: load squad members from global agents"
```

### Task 4: Switch mission launch and workflow compilation to `agentId`

**Files:**
- Modify: `dashboard/convex/lib/squadMissionLaunch.ts`
- Modify: `dashboard/convex/lib/squadMissionLaunch.test.ts`
- Modify: `dashboard/convex/lib/workflowExecutionCompiler.ts`
- Modify: `dashboard/convex/lib/workflowExecutionCompiler.test.ts`
- Modify: `tests/mc/runtime/test_squad_workflow_dispatch.py`

**Step 1: Write the failing launch/compiler tests**

Add tests that prove:

- mission launch resolves agents from `squad.agentIds`
- workflow compilation resolves `step.agentId` to runtime `agent.name`
- missing registered agents fail fast during mission launch

Example assertion shape:

```ts
expect(agentRefs).toEqual([{ agentName: "audience-researcher", agentId: "agent-1" }]);
expect(() => launchSquadMission(...)).toThrow(/Agent not found/);
```

**Step 2: Run the targeted tests and confirm they fail**

```bash
cd dashboard
npm run test -- convex/lib/squadMissionLaunch.test.ts convex/lib/workflowExecutionCompiler.test.ts
uv run pytest tests/mc/runtime/test_squad_workflow_dispatch.py
```

Expected: FAIL because launch still resolves through `agentSpecIds`.

**Step 3: Implement the runtime resolution change**

Recommended implementation:

1. load agents from `squad.agentIds`
2. build `agentId -> agent.name`
3. resolve each workflow step from `agentId`
4. remove the old `agentSpecId` translation path

**Step 4: Re-run the targeted tests**

Run the same commands and expect PASS.

**Step 5: Run guardrails and commit**

```bash
cd dashboard
npm run format:file:check -- convex/lib/squadMissionLaunch.ts convex/lib/squadMissionLaunch.test.ts convex/lib/workflowExecutionCompiler.ts convex/lib/workflowExecutionCompiler.test.ts
npm run lint:file -- convex/lib/squadMissionLaunch.ts convex/lib/squadMissionLaunch.test.ts convex/lib/workflowExecutionCompiler.ts convex/lib/workflowExecutionCompiler.test.ts
uv run ruff format --check tests/mc/runtime/test_squad_workflow_dispatch.py
uv run ruff check tests/mc/runtime/test_squad_workflow_dispatch.py
git add dashboard/convex/lib/squadMissionLaunch.ts dashboard/convex/lib/squadMissionLaunch.test.ts dashboard/convex/lib/workflowExecutionCompiler.ts dashboard/convex/lib/workflowExecutionCompiler.test.ts tests/mc/runtime/test_squad_workflow_dispatch.py
git commit -m "refactor: resolve squad workflows from canonical agents"
```

### Task 5: Remove obsolete `agentSpecs` usage from squad flows and run regression checks

**Files:**
- Modify: `dashboard/features/agents/components/SquadDetailSheet.tsx`
- Modify: `dashboard/features/agents/hooks/useCreateSquadDraft.ts`
- Modify: `dashboard/convex/lib/squadGraphPublisher.ts`
- Search and update: `dashboard/`, `tests/`, `docs/`

**Step 1: Write the failing cleanup assertions**

Add or adjust tests that prove:

- squad flows no longer query `agentSpecs`
- squad publish no longer inserts `agentSpecs`
- squad detail no longer renders `Doc<"agentSpecs">`

**Step 2: Run the targeted test suite**

```bash
cd dashboard
npm run test -- convex/lib/squadGraphPublisher.test.ts features/agents/hooks/useSquadDetailData.test.tsx features/agents/components/SquadDetailSheet.test.tsx
```

Expected: PASS after cleanup. If anything still depends on `agentSpecs`, fix it before moving on.

**Step 3: Run full baseline checks for touched files**

```bash
uv run ruff format --check tests/mc/runtime/test_squad_workflow_dispatch.py
uv run ruff check tests/mc/runtime/test_squad_workflow_dispatch.py
uv run pytest tests/mc/test_architecture.py tests/mc/test_module_reorganization.py tests/mc/infrastructure/test_boundary.py
cd dashboard
npm run format:file:check -- convex/schema.ts convex/squadSpecs.ts convex/workflowSpecs.ts convex/agents.ts convex/lib/squadGraphPublisher.ts convex/lib/squadMissionLaunch.ts convex/lib/workflowExecutionCompiler.ts features/agents/hooks/useCreateSquadDraft.ts features/agents/hooks/useSquadDetailData.ts features/agents/components/SquadDetailSheet.tsx
npm run lint:file -- convex/schema.ts convex/squadSpecs.ts convex/workflowSpecs.ts convex/agents.ts convex/lib/squadGraphPublisher.ts convex/lib/squadMissionLaunch.ts convex/lib/workflowExecutionCompiler.ts features/agents/hooks/useCreateSquadDraft.ts features/agents/hooks/useSquadDetailData.ts features/agents/components/SquadDetailSheet.tsx
npm run test:architecture
```

**Step 4: Validate end-to-end in the real stack**

From the worktree root:

```bash
cp dashboard/.env.local .worktrees/codex/agentSquadUnification/dashboard/.env.local
cd .worktrees/codex/agentSquadUnification
PORT=3001 uv run nanobot mc start
```

Validate with Playwright CLI:

- create a squad with two agents
- confirm the agents appear in the normal agent list
- confirm opening the squad shows those same agents
- edit one squad agent and confirm the global agent view reflects the same change
- launch a mission and confirm workflow steps resolve to the registered agent names

**Step 5: Commit the cleanup**

```bash
git add dashboard/convex/schema.ts dashboard/convex/squadSpecs.ts dashboard/convex/workflowSpecs.ts dashboard/convex/agents.ts dashboard/convex/lib/squadGraphPublisher.ts dashboard/convex/lib/squadMissionLaunch.ts dashboard/convex/lib/workflowExecutionCompiler.ts dashboard/features/agents/hooks/useCreateSquadDraft.ts dashboard/features/agents/hooks/useSquadDetailData.ts dashboard/features/agents/components/SquadDetailSheet.tsx tests/mc/runtime/test_squad_workflow_dispatch.py
git commit -m "refactor: unify squads with registered agents"
```

## Open Questions to Resolve During Implementation

- Whether agent lookup during squad publish should fail on a role mismatch for an existing name, or simply reuse the existing global agent.
- Whether deleting a global agent referenced by a squad should be blocked immediately in the mutation layer or only surfaced as a validation error in the UI.
- Whether any remaining `agentSpecs` code should be deleted now or left temporarily if it is still used by non-squad flows.

## Expected Outcome

- Squads only contain registered global agents.
- The same agent can be reused across many squads.
- Editing an agent from a squad updates the shared global agent.
- Mission launch resolves workflow ownership directly from the canonical agent registry.
