# Agent Spec V2 / Workflow Spec V1 / Review Spec V1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build canonical spec-driven authoring for agents and squads, compile those specs into the existing runtime `agents` projection, migrate the current agent catalog into Spec V2, and ship the new `Create Agent | Create Squad` flow plus the `Squads` sidebar section without breaking current Mission Control runtime behavior.

**Architecture:** Keep authoring truth in new Convex spec tables and pure TypeScript compiler helpers. Preserve the Python runtime, local `config.yaml`, and `SOUL.md` flow by publishing compiled projections into `agents` and hardening the sync layer so local YAML can no longer become the authoring source of truth for compiled agents. Keep the Kanban lifecycle intact and only add `workMode` plus squad/workflow references for later execution.

**Tech Stack:** Convex schema/mutations/queries, Next.js App Router APIs, React 19 + Vitest, Python backend + pytest, YAML/SOUL sync, Playwright CLI, existing Mission Control bridge/sync infrastructure.

---

## References

- Design: `docs/plans/2026-03-13-agent-spec-v2-workflow-v1-review-spec-v1-design.md`
- Wave plan: `docs/plans/2026-03-13-agent-spec-v2-workflow-v1-review-spec-v1-wave-plan.md`
- Remediation note: `docs/plans/2026-03-14-llm-first-authoring-remediation-plan.md`
- Story artifact: `_bmad-output/implementation-artifacts/tech-spec-agent-spec-v2-workflow-v1-review-v1.md`
- Story artifact: `_bmad-output/implementation-artifacts/tech-spec-agent-spec-v2-foundation.md`
- Story artifact: `_bmad-output/implementation-artifacts/tech-spec-agent-spec-v2-projection-publishing.md`
- Story artifact: `_bmad-output/implementation-artifacts/tech-spec-agent-spec-v2-sync-hardening-and-migration.md`
- Story artifact: `_bmad-output/implementation-artifacts/tech-spec-agent-spec-v2-authoring-assist-and-create-agent.md`
- Story artifact: `_bmad-output/implementation-artifacts/tech-spec-squad-spec-v1-create-squad-and-library.md`
- Story artifact: `_bmad-output/implementation-artifacts/tech-spec-agent-spec-v2-stabilization-and-rollout.md`
- Execution context: repository root on the approved initiative branch label `agentSpecV2-workflowV1-reviewV1`

### Task 1: Preflight The Initiative Boundary

**Files:**
- Confirm: `_bmad-output/implementation-artifacts/tech-spec-agent-spec-v2-workflow-v1-review-v1.md`
- Confirm: `_bmad-output/implementation-artifacts/tech-spec-agent-spec-v2-foundation.md`
- Confirm: `_bmad-output/implementation-artifacts/tech-spec-agent-spec-v2-projection-publishing.md`
- Confirm: `_bmad-output/implementation-artifacts/tech-spec-agent-spec-v2-sync-hardening-and-migration.md`
- Confirm: `_bmad-output/implementation-artifacts/tech-spec-agent-spec-v2-authoring-assist-and-create-agent.md`
- Confirm: `_bmad-output/implementation-artifacts/tech-spec-squad-spec-v1-create-squad-and-library.md`
- Confirm: `_bmad-output/implementation-artifacts/tech-spec-agent-spec-v2-stabilization-and-rollout.md`
- Test: `docs/plans/2026-03-13-agent-spec-v2-workflow-v1-review-spec-v1-design.md`
- Test: `docs/plans/2026-03-13-agent-spec-v2-workflow-v1-review-spec-v1.md`

**Step 1: Confirm the story artifact exists**

Confirm the full story set exists under `_bmad-output/implementation-artifacts/` and that each story maps cleanly to one wave in the wave plan. If any story is missing, create it before touching code and link it back to the design doc above.

**Step 2: Verify the working branch and workspace**

Run:

```bash
pwd
git branch --show-current
git status --short
```

Expected:
- current directory is `/Users/ennio/Documents/nanobot-ennio`
- current branch matches the approved initiative branch label
- no unrelated destructive operations are pending

**Step 3: Re-read the design and list the no-regression rules**

Capture these constraints in the story notes before implementation:
- `agents` becomes a runtime projection, not authoring truth
- squads are blueprints, not auto-running tasks
- memory stays board-scoped
- Kanban remains the lifecycle surface

### Task 2: Add Canonical Spec Storage In Convex

**Files:**
- Modify: `dashboard/convex/schema.ts`
- Modify: `dashboard/convex/schema.test.ts`
- Create: `dashboard/convex/agentSpecs.ts`
- Create: `dashboard/convex/agentSpecs.test.ts`
- Create: `dashboard/convex/squadSpecs.ts`
- Create: `dashboard/convex/squadSpecs.test.ts`
- Create: `dashboard/convex/workflowSpecs.ts`
- Create: `dashboard/convex/workflowSpecs.test.ts`
- Create: `dashboard/convex/reviewSpecs.ts`
- Create: `dashboard/convex/reviewSpecs.test.ts`
- Create: `dashboard/convex/boardSquadBindings.ts`
- Create: `dashboard/convex/boardSquadBindings.test.ts`

**Step 1: Write the failing schema and mutation tests**

Cover at least these behaviors:
- `agentSpecs` accepts rich authoring sections and status/version metadata
- `squadSpecs` supports many workflows plus an optional `defaultWorkflowSpecId`
- `workflowSpecs` belong to one squad and carry steps, ownership, exit criteria, and `onReject`
- `reviewSpecs` store rubric criteria, weights, veto conditions, and approval policy
- `boardSquadBindings` allow one squad to be enabled on many boards
- `tasks` gains optional `workMode`, `squadSpecId`, and `workflowSpecId`

**Step 2: Run the targeted dashboard tests and confirm they fail first**

Run:

```bash
cd dashboard
npm run test -- convex/schema.test.ts convex/agentSpecs.test.ts convex/squadSpecs.test.ts convex/workflowSpecs.test.ts convex/reviewSpecs.test.ts convex/boardSquadBindings.test.ts
```

Expected: FAIL because the new validators/modules do not exist yet.

**Step 3: Implement the new tables and minimal CRUD/publish-safe mutations**

Requirements:
- keep the schema camelCase to match current Convex style
- make all spec entities versioned and status-aware
- keep spec documents as the only authoring truth
- add task fields only as optional scaffolding, without changing current task behavior yet

**Step 4: Regenerate Convex types and rerun the tests**

Run:

```bash
cd dashboard
npx convex codegen
npm run test -- convex/schema.test.ts convex/agentSpecs.test.ts convex/squadSpecs.test.ts convex/workflowSpecs.test.ts convex/reviewSpecs.test.ts convex/boardSquadBindings.test.ts
```

Expected: PASS.

**Step 5: Run formatting and lint for touched dashboard files**

Run:

```bash
cd dashboard
npm run format:file:check -- convex/schema.ts convex/schema.test.ts convex/agentSpecs.ts convex/agentSpecs.test.ts convex/squadSpecs.ts convex/squadSpecs.test.ts convex/workflowSpecs.ts convex/workflowSpecs.test.ts convex/reviewSpecs.ts convex/reviewSpecs.test.ts convex/boardSquadBindings.ts convex/boardSquadBindings.test.ts
npm run lint:file -- convex/schema.ts convex/schema.test.ts convex/agentSpecs.ts convex/agentSpecs.test.ts convex/squadSpecs.ts convex/squadSpecs.test.ts convex/workflowSpecs.ts convex/workflowSpecs.test.ts convex/reviewSpecs.ts convex/reviewSpecs.test.ts convex/boardSquadBindings.ts convex/boardSquadBindings.test.ts
```

**Step 6: Commit**

```bash
git add dashboard/convex/schema.ts dashboard/convex/schema.test.ts dashboard/convex/agentSpecs.ts dashboard/convex/agentSpecs.test.ts dashboard/convex/squadSpecs.ts dashboard/convex/squadSpecs.test.ts dashboard/convex/workflowSpecs.ts dashboard/convex/workflowSpecs.test.ts dashboard/convex/reviewSpecs.ts dashboard/convex/reviewSpecs.test.ts dashboard/convex/boardSquadBindings.ts dashboard/convex/boardSquadBindings.test.ts
git commit -m "feat: add canonical agent and squad spec storage"
```

### Task 3: Build The Spec Compiler And Publish Runtime Projections

**Files:**
- Create: `dashboard/convex/lib/specCompiler.ts`
- Create: `dashboard/convex/lib/specCompiler.test.ts`
- Modify: `dashboard/convex/agents.ts`
- Modify: `dashboard/convex/agents.test.ts`
- Modify: `dashboard/convex/schema.ts`

**Step 1: Write the failing compiler tests**

Cover at least these behaviors:
- compiling `Agent Spec V2` produces a runtime-safe `agents` payload
- prompt compilation assembles identity, responsibilities, non-goals, style, quality rules, tool policy, and output contract
- publish stores `compiledFromSpecId`, `compiledFromVersion`, and `compiledAt`
- publishing a squad can compile each child agent into runtime projections without materializing a task

**Step 2: Run the targeted tests and confirm failure**

Run:

```bash
cd dashboard
npm run test -- convex/lib/specCompiler.test.ts convex/agents.test.ts
```

Expected: FAIL because the compiler and projection metadata do not exist yet.

**Step 3: Implement the pure compiler and projection-aware publish mutations**

Requirements:
- keep the compiler pure inside `dashboard/convex/lib`
- compile structured authoring sections into the flat runtime prompt string
- generate runtime `soul` content from spec data when needed
- extend `agents` only with projection metadata, not authoring sections
- keep `config.yaml` concerns out of the compiler itself

**Step 4: Rerun codegen and the targeted tests**

Run:

```bash
cd dashboard
npx convex codegen
npm run test -- convex/lib/specCompiler.test.ts convex/agents.test.ts
```

Expected: PASS.

**Step 5: Run formatting and lint for touched compiler files**

Run:

```bash
cd dashboard
npm run format:file:check -- convex/lib/specCompiler.ts convex/lib/specCompiler.test.ts convex/agents.ts convex/agents.test.ts convex/schema.ts
npm run lint:file -- convex/lib/specCompiler.ts convex/lib/specCompiler.test.ts convex/agents.ts convex/agents.test.ts convex/schema.ts
```

**Step 6: Commit**

```bash
git add dashboard/convex/lib/specCompiler.ts dashboard/convex/lib/specCompiler.test.ts dashboard/convex/agents.ts dashboard/convex/agents.test.ts dashboard/convex/schema.ts
git commit -m "feat: compile specs into runtime agent projections"
```

### Task 4: Harden Python Sync So Projections Stay Authoritative

**Files:**
- Create: `mc/bridge/repositories/specs.py`
- Create: `tests/mc/bridge/test_specs_repository.py`
- Modify: `mc/bridge/repositories/__init__.py`
- Modify: `mc/bridge/facade_mixins.py`
- Modify: `mc/bridge/__init__.py`
- Modify: `mc/contexts/agents/sync.py`
- Modify: `tests/mc/services/test_agent_sync.py`
- Modify: `tests/mc/test_write_back.py`

**Step 1: Write the failing Python tests**

Cover at least these behaviors:
- the bridge exposes first-class methods for creating/publishing specs and bindings
- `AgentSyncService` does not let local `config.yaml` overwrite a compiled projection-backed agent
- write-back still materializes `config.yaml` and `SOUL.md` from the runtime projection
- uncompiled or legacy agents still sync safely during the migration window

**Step 2: Run the targeted pytest selection and confirm failure**

Run:

```bash
uv run pytest tests/mc/bridge/test_specs_repository.py tests/mc/services/test_agent_sync.py tests/mc/test_write_back.py
```

Expected: FAIL because the repository and sync guardrails do not exist yet.

**Step 3: Implement the bridge repository and sync protections**

Requirements:
- keep Convex access inside `mc/bridge/*`
- add façade methods instead of raw client calls in migration code
- query existing runtime agent docs before local YAML re-upsert
- skip or strictly limit local-upsert behavior when an agent has projection metadata

**Step 4: Rerun the targeted pytest selection**

Run:

```bash
uv run pytest tests/mc/bridge/test_specs_repository.py tests/mc/services/test_agent_sync.py tests/mc/test_write_back.py
```

Expected: PASS.

**Step 5: Run Python formatting, lint, and guardrails**

Run:

```bash
uv run ruff format --check mc/bridge/repositories/specs.py mc/bridge/repositories/__init__.py mc/bridge/facade_mixins.py mc/bridge/__init__.py mc/contexts/agents/sync.py tests/mc/bridge/test_specs_repository.py tests/mc/services/test_agent_sync.py tests/mc/test_write_back.py
uv run ruff check mc/bridge/repositories/specs.py mc/bridge/repositories/__init__.py mc/bridge/facade_mixins.py mc/bridge/__init__.py mc/contexts/agents/sync.py tests/mc/bridge/test_specs_repository.py tests/mc/services/test_agent_sync.py tests/mc/test_write_back.py
uv run pytest tests/mc/test_architecture.py tests/mc/test_module_reorganization.py tests/mc/infrastructure/test_boundary.py
```

**Step 6: Commit**

```bash
git add mc/bridge/repositories/specs.py tests/mc/bridge/test_specs_repository.py mc/bridge/repositories/__init__.py mc/bridge/facade_mixins.py mc/bridge/__init__.py mc/contexts/agents/sync.py tests/mc/services/test_agent_sync.py tests/mc/test_write_back.py
git commit -m "feat: protect runtime projections during agent sync"
```

### Task 5: Add A Backfill Path For Existing Agents

**Files:**
- Create: `mc/contexts/agents/spec_migration.py`
- Create: `tests/mc/contexts/agents/test_spec_migration.py`
- Modify: `mc/cli/agents.py`

**Step 1: Write the failing migration tests**

Cover at least these behaviors:
- legacy `config.yaml` + `SOUL.md` become a valid `Agent Spec V2` payload
- current prompt text is split into structured seed sections instead of discarded
- migration fills defaults for missing responsibilities, non-goals, quality rules, and review policy
- migration publishes the new runtime projection after creating the spec

**Step 2: Run the targeted pytest selection and confirm failure**

Run:

```bash
uv run pytest tests/mc/contexts/agents/test_spec_migration.py
```

Expected: FAIL because the migration module does not exist yet.

**Step 3: Implement the migration module and CLI entrypoint**

Requirements:
- reuse the existing YAML validator instead of reparsing ad hoc
- read legacy `SOUL.md` when present
- create specs through the new bridge repository, not direct Convex calls
- make the migration idempotent enough to rerun during development

**Step 4: Rerun the targeted pytest selection**

Run:

```bash
uv run pytest tests/mc/contexts/agents/test_spec_migration.py
```

Expected: PASS.

**Step 5: Smoke-run the migration in dry-run or fixture mode**

Run:

```bash
uv run python -m mc.contexts.agents.spec_migration --help
```

Expected: the command exposes a documented entrypoint for importing existing agents.

**Step 6: Commit**

```bash
git add mc/contexts/agents/spec_migration.py tests/mc/contexts/agents/test_spec_migration.py mc/cli/agents.py
git commit -m "feat: add agent spec v2 migration path"
```

### Task 6: Replace YAML Assist With Structured Authoring Assist

**Files:**
- Create: `mc/contexts/agents/authoring_assist.py`
- Create: `tests/mc/contexts/agents/test_authoring_assist.py`
- Create: `dashboard/app/api/authoring/agent-wizard/route.ts`
- Create: `dashboard/app/api/authoring/agent-wizard/route.test.ts`
- Create: `dashboard/app/api/authoring/squad-wizard/route.ts`
- Create: `dashboard/app/api/authoring/squad-wizard/route.test.ts`
- Modify: `dashboard/app/api/agents/assist/route.ts`

**Step 1: Write the failing backend and route tests**

Cover at least these behaviors:
- agent wizard responses return the next deep question plus a structured draft patch
- squad wizard responses can refine agents, workflows, and review policy together
- the contract returns readiness, summary sections, and recommended next phase
- the legacy YAML-only route is retired or delegated so the old flow cannot drift back into the UI

**Step 2: Run the targeted tests and confirm failure**

Run:

```bash
uv run pytest tests/mc/contexts/agents/test_authoring_assist.py
cd dashboard
npm run test -- app/api/authoring/agent-wizard/route.test.ts app/api/authoring/squad-wizard/route.test.ts
```

Expected: FAIL because the structured assist flow does not exist yet.

**Step 3: Implement the structured authoring assistant**

Requirements:
- move the prompt logic out of YAML generation and into spec-draft generation
- keep the Python LLM helper focused on structured outputs, phase progression, and question generation
- expose separate API routes for agent and squad authoring
- return structured JSON, never raw YAML

**Step 4: Rerun the targeted tests**

Run:

```bash
uv run pytest tests/mc/contexts/agents/test_authoring_assist.py
cd dashboard
npm run test -- app/api/authoring/agent-wizard/route.test.ts app/api/authoring/squad-wizard/route.test.ts
```

Expected: PASS.

**Step 5: Run format/lint for the touched backend and dashboard files**

Run:

```bash
uv run ruff format --check mc/contexts/agents/authoring_assist.py tests/mc/contexts/agents/test_authoring_assist.py
uv run ruff check mc/contexts/agents/authoring_assist.py tests/mc/contexts/agents/test_authoring_assist.py
cd dashboard
npm run format:file:check -- app/api/authoring/agent-wizard/route.ts app/api/authoring/agent-wizard/route.test.ts app/api/authoring/squad-wizard/route.ts app/api/authoring/squad-wizard/route.test.ts app/api/agents/assist/route.ts
npm run lint:file -- app/api/authoring/agent-wizard/route.ts app/api/authoring/agent-wizard/route.test.ts app/api/authoring/squad-wizard/route.ts app/api/authoring/squad-wizard/route.test.ts app/api/agents/assist/route.ts
```

**Step 6: Commit**

```bash
git add mc/contexts/agents/authoring_assist.py tests/mc/contexts/agents/test_authoring_assist.py dashboard/app/api/authoring/agent-wizard/route.ts dashboard/app/api/authoring/agent-wizard/route.test.ts dashboard/app/api/authoring/squad-wizard/route.ts dashboard/app/api/authoring/squad-wizard/route.test.ts dashboard/app/api/agents/assist/route.ts
git commit -m "feat: add structured authoring assist for agents and squads"
```

### Task 7: Ship The New Create Dialog, Wizards, And Squads Library

**Files:**
- Create: `dashboard/features/agents/components/CreateAuthoringDialog.tsx`
- Create: `dashboard/features/agents/components/AgentAuthoringWizard.tsx`
- Create: `dashboard/features/agents/components/SquadAuthoringWizard.tsx`
- Create: `dashboard/features/agents/components/SquadSidebarSection.tsx`
- Create: `dashboard/features/agents/components/SquadDetailSheet.tsx`
- Create: `dashboard/features/agents/hooks/useSquadSidebarData.ts`
- Create: `dashboard/features/agents/hooks/useCreateAuthoringDraft.ts`
- Create: `dashboard/features/agents/components/CreateAuthoringDialog.test.tsx`
- Create: `dashboard/features/agents/components/AgentAuthoringWizard.test.tsx`
- Create: `dashboard/features/agents/components/SquadAuthoringWizard.test.tsx`
- Create: `dashboard/features/agents/components/SquadSidebarSection.test.tsx`
- Create: `dashboard/features/agents/hooks/useSquadSidebarData.test.tsx`
- Modify: `dashboard/features/agents/components/AgentSidebar.tsx`
- Modify: `dashboard/features/agents/hooks/useAgentSidebarData.ts`
- Modify: `dashboard/app/api/agents/create/route.ts`
- Modify: `dashboard/app/api/agents/[agentName]/config/route.test.ts`
- Delete: `dashboard/components/CreateAgentSheet.tsx`

**Step 1: Write the failing UI and route tests**

Cover at least these behaviors:
- the create button opens a chooser with `Create Agent` and `Create Squad`
- agent creation runs through the deep wizard and publishes a spec, not raw YAML
- squad creation collects team design, workflow design, review design, and approval
- a `Squads` section appears above `Agents`
- published projections can still be materialized to local runtime files through the route used by the dashboard

**Step 2: Run the targeted dashboard tests and confirm failure**

Run:

```bash
cd dashboard
npm run test -- features/agents/components/CreateAuthoringDialog.test.tsx features/agents/components/AgentAuthoringWizard.test.tsx features/agents/components/SquadAuthoringWizard.test.tsx features/agents/components/SquadSidebarSection.test.tsx features/agents/hooks/useSquadSidebarData.test.tsx app/api/agents/[agentName]/config/route.test.ts
```

Expected: FAIL because the new components/hooks do not exist yet.

**Step 3: Implement the new creation and library UI**

Requirements:
- keep the new authoring UI inside `dashboard/features/agents/*`
- remove the old YAML-centric sheet from the user flow
- show a live summary panel while the wizard progresses
- surface squad counts, workflow counts, and board bindings in the new `Squads` section
- keep the materialization route projection-oriented rather than authoring-oriented

**Step 4: Rerun the targeted tests**

Run:

```bash
cd dashboard
npm run test -- features/agents/components/CreateAuthoringDialog.test.tsx features/agents/components/AgentAuthoringWizard.test.tsx features/agents/components/SquadAuthoringWizard.test.tsx features/agents/components/SquadSidebarSection.test.tsx features/agents/hooks/useSquadSidebarData.test.tsx app/api/agents/[agentName]/config/route.test.ts
```

Expected: PASS.

**Step 5: Run dashboard formatting, lint, and architecture guardrails**

Run:

```bash
cd dashboard
npm run format:file:check -- features/agents/components/CreateAuthoringDialog.tsx features/agents/components/AgentAuthoringWizard.tsx features/agents/components/SquadAuthoringWizard.tsx features/agents/components/SquadSidebarSection.tsx features/agents/components/SquadDetailSheet.tsx features/agents/hooks/useSquadSidebarData.ts features/agents/hooks/useCreateAuthoringDraft.ts features/agents/components/CreateAuthoringDialog.test.tsx features/agents/components/AgentAuthoringWizard.test.tsx features/agents/components/SquadAuthoringWizard.test.tsx features/agents/components/SquadSidebarSection.test.tsx features/agents/hooks/useSquadSidebarData.test.tsx features/agents/components/AgentSidebar.tsx features/agents/hooks/useAgentSidebarData.ts app/api/agents/create/route.ts app/api/agents/[agentName]/config/route.test.ts
npm run lint:file -- features/agents/components/CreateAuthoringDialog.tsx features/agents/components/AgentAuthoringWizard.tsx features/agents/components/SquadAuthoringWizard.tsx features/agents/components/SquadSidebarSection.tsx features/agents/components/SquadDetailSheet.tsx features/agents/hooks/useSquadSidebarData.ts features/agents/hooks/useCreateAuthoringDraft.ts features/agents/components/CreateAuthoringDialog.test.tsx features/agents/components/AgentAuthoringWizard.test.tsx features/agents/components/SquadAuthoringWizard.test.tsx features/agents/components/SquadSidebarSection.test.tsx features/agents/hooks/useSquadSidebarData.test.tsx features/agents/components/AgentSidebar.tsx features/agents/hooks/useAgentSidebarData.ts app/api/agents/create/route.ts app/api/agents/[agentName]/config/route.test.ts
npm run test:architecture
```

**Step 6: Commit**

```bash
git add dashboard/features/agents/components/CreateAuthoringDialog.tsx dashboard/features/agents/components/AgentAuthoringWizard.tsx dashboard/features/agents/components/SquadAuthoringWizard.tsx dashboard/features/agents/components/SquadSidebarSection.tsx dashboard/features/agents/components/SquadDetailSheet.tsx dashboard/features/agents/hooks/useSquadSidebarData.ts dashboard/features/agents/hooks/useCreateAuthoringDraft.ts dashboard/features/agents/components/CreateAuthoringDialog.test.tsx dashboard/features/agents/components/AgentAuthoringWizard.test.tsx dashboard/features/agents/components/SquadAuthoringWizard.test.tsx dashboard/features/agents/components/SquadSidebarSection.test.tsx dashboard/features/agents/hooks/useSquadSidebarData.test.tsx dashboard/features/agents/components/AgentSidebar.tsx dashboard/features/agents/hooks/useAgentSidebarData.ts dashboard/app/api/agents/create/route.ts dashboard/app/api/agents/[agentName]/config/route.test.ts
git rm dashboard/components/CreateAgentSheet.tsx
git commit -m "feat: add spec-driven agent and squad authoring ui"
```

### Task 8: Add Task Scaffolding, Run The Backfill, And Verify End-To-End

**Files:**
- Modify: `dashboard/convex/tasks.ts`
- Modify: `dashboard/convex/tasks.test.ts`
- Modify: `dashboard/convex/schema.ts`
- Modify: `dashboard/features/agents/components/SquadDetailSheet.tsx`
- Test: `tests/mc/contexts/agents/test_spec_migration.py`
- Test: `dashboard/e2e/dashboard-smoke.spec.ts`

**Step 1: Write the failing task scaffolding tests**

Cover at least these behaviors:
- task creation accepts optional `workMode`, `squadSpecId`, and `workflowSpecId`
- default behavior for existing manual and single-agent tasks is unchanged
- squad detail UI can display or persist board binding choices without creating a task yet

**Step 2: Run the targeted tests and confirm failure**

Run:

```bash
cd dashboard
npm run test -- convex/tasks.test.ts
```

Expected: FAIL because the new task fields are not wired through yet.

**Step 3: Implement the minimal task scaffolding only**

Requirements:
- do not implement `Run Squad` yet
- do not change current Kanban status transitions
- keep the new task fields optional and inert until a later workflow-run story

**Step 4: Rerun the targeted task tests**

Run:

```bash
cd dashboard
npm run test -- convex/tasks.test.ts
```

Expected: PASS.

**Step 5: Execute the migration against the current agent catalog**

Run:

```bash
uv run python -m mc.contexts.agents.spec_migration
```

Expected:
- every current agent is recreated as an `Agent Spec V2`
- compiled runtime projections exist in `agents`
- no uncaught exceptions abort the migration

**Step 6: Run the full verification baseline**

Run:

```bash
uv run ruff format --check mc/bridge/repositories/specs.py mc/contexts/agents/sync.py mc/contexts/agents/spec_migration.py mc/contexts/agents/authoring_assist.py tests/mc/bridge/test_specs_repository.py tests/mc/services/test_agent_sync.py tests/mc/contexts/agents/test_spec_migration.py tests/mc/contexts/agents/test_authoring_assist.py
uv run ruff check mc/bridge/repositories/specs.py mc/contexts/agents/sync.py mc/contexts/agents/spec_migration.py mc/contexts/agents/authoring_assist.py tests/mc/bridge/test_specs_repository.py tests/mc/services/test_agent_sync.py tests/mc/contexts/agents/test_spec_migration.py tests/mc/contexts/agents/test_authoring_assist.py
uv run pytest tests/mc/test_architecture.py tests/mc/test_module_reorganization.py tests/mc/infrastructure/test_boundary.py tests/mc/bridge/test_specs_repository.py tests/mc/services/test_agent_sync.py tests/mc/test_write_back.py tests/mc/contexts/agents/test_spec_migration.py tests/mc/contexts/agents/test_authoring_assist.py
cd dashboard
npm run format:file:check -- convex/schema.ts convex/agents.ts convex/agentSpecs.ts convex/squadSpecs.ts convex/workflowSpecs.ts convex/reviewSpecs.ts convex/boardSquadBindings.ts convex/lib/specCompiler.ts convex/tasks.ts features/agents/components/CreateAuthoringDialog.tsx features/agents/components/AgentAuthoringWizard.tsx features/agents/components/SquadAuthoringWizard.tsx features/agents/components/SquadSidebarSection.tsx features/agents/components/SquadDetailSheet.tsx features/agents/hooks/useSquadSidebarData.ts features/agents/hooks/useCreateAuthoringDraft.ts app/api/authoring/agent-wizard/route.ts app/api/authoring/squad-wizard/route.ts app/api/agents/create/route.ts
npm run lint:file -- convex/schema.ts convex/agents.ts convex/agentSpecs.ts convex/squadSpecs.ts convex/workflowSpecs.ts convex/reviewSpecs.ts convex/boardSquadBindings.ts convex/lib/specCompiler.ts convex/tasks.ts features/agents/components/CreateAuthoringDialog.tsx features/agents/components/AgentAuthoringWizard.tsx features/agents/components/SquadAuthoringWizard.tsx features/agents/components/SquadSidebarSection.tsx features/agents/components/SquadDetailSheet.tsx features/agents/hooks/useSquadSidebarData.ts features/agents/hooks/useCreateAuthoringDraft.ts app/api/authoring/agent-wizard/route.ts app/api/authoring/squad-wizard/route.ts app/api/agents/create/route.ts
npm run test:architecture
```

Expected: PASS.

**Step 7: Validate the real app through the full MC stack**

Run from the repository root:

```bash
PORT=3001 uv run nanobot mc start
```

Then validate with `playwright-cli` against `http://localhost:3001`:
- open the new create dialog
- create or simulate an `Agent Spec V2` draft
- create or simulate a squad draft with at least one workflow
- confirm `Squads` appears above `Agents`
- confirm existing tasks/boards still render normally

**Step 8: Request code review and commit the final integration**

After verification, use the local review workflow to request a review pass, address any high-severity findings, then commit:

```bash
git add .
git commit -m "feat: add spec-driven agent and squad authoring foundation"
```
