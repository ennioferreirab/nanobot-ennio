# Agent Spec V2 / Workflow Spec V1 / Review Spec V1 Wave Plan

**Date:** 2026-03-13

**Goal:** Roll out canonical spec-driven authoring for agents and squads in safe waves that preserve the current runtime, board-scoped memory, and Kanban lifecycle while replacing YAML-centric authoring with structured drafts and compiled projections.

**Execution Context:** Work from the repository root at `/Users/ennio/Documents/nanobot-ennio`. The requested initiative label is `agentSpecV2-workflowV1-reviewV1`. If the branch is created through Codex tooling, use `codex/agentSpecV2-workflowV1-reviewV1` to satisfy branch-prefix requirements.

**Detailed Plan:** `docs/plans/2026-03-13-agent-spec-v2-workflow-v1-review-spec-v1.md`

---

## Story Decomposition

- `tech-spec-agent-spec-v2-foundation`
- `tech-spec-agent-spec-v2-projection-publishing`
- `tech-spec-agent-spec-v2-sync-hardening-and-migration`
- `tech-spec-agent-spec-v2-authoring-assist-and-create-agent`
- `tech-spec-squad-spec-v1-create-squad-and-library`
- `tech-spec-agent-spec-v2-stabilization-and-rollout`

These stories are tracked under `_bmad-output/implementation-artifacts/` and map one-to-one to the waves below.

## Cross-Wave Directives

### Canonical truth

- Authoring truth lives in specs, not in `agents`, not in `config.yaml`, and not
  in ad-hoc prompt strings.
- Local runtime files are projections and must stay downstream of publish.

### Memory integrity

- Specs are reusable across boards.
- Execution memory remains board-scoped for both agents and squads.
- Do not add shortcuts that allow one board's working memory to bleed into
  another board because the blueprint is shared.

### Workflow scope discipline

- Keep v1 workflow structure lean.
- Do not turn this initiative into a generalized workflow engine.
- `Run Squad` is explicitly out of scope for these waves.

### Validation discipline

- Use TDD inside each wave.
- Use the full MC stack via `uv run nanobot mc start` for end-to-end validation.
- Do not treat `cd dashboard && npm run dev` as sufficient validation.
- Use `playwright-cli` rather than Playwright MCP unless a later request says
  otherwise.

### Migration discipline

- Snapshot before migration and keep the backfill rerunnable.
- Fix compiler or migration defaults instead of hand-patching many generated
  outputs.
- Keep compatibility temporary; do not let a “hybrid forever” state emerge.

### Review discipline

- Every wave closes with focused tests, architecture guardrails, and a review
  pass before the next wave starts.
- Stop if a wave introduces sync ambiguity between specs and projections.

## Wave 0: Preconditions and Baseline

**Objective:** Freeze the implementation boundary and make sure the execution
environment is explicit before touching schema, sync, or UI.

**Included artifacts:**
- `docs/plans/2026-03-13-agent-spec-v2-workflow-v1-review-spec-v1-design.md`
- `docs/plans/2026-03-13-agent-spec-v2-workflow-v1-review-spec-v1.md`
- `_bmad-output/implementation-artifacts/tech-spec-agent-spec-v2-workflow-v1-review-v1.md`

**Entry gate:**
- story artifacts exist
- design exists
- detailed plan exists
- branch/workspace strategy is explicit

**Core work:**
- confirm the branch context
- capture the no-regression rules in the story notes
- confirm the baseline test commands and startup path

**Care points:**
- do not start coding from a frontend-only server
- do not treat the requested branch label as a reason to bypass the `codex/`
  prefix if tooling creates the branch

**Exit gate:**
- all planning artifacts are present and linked
- the team can name the first coding wave unambiguously

## Wave 1: Canonical Spec Foundation

**Story:** `tech-spec-agent-spec-v2-foundation.md`

**Objective:** Introduce the canonical schema for specs, workflows, reviews, and
board bindings without changing current execution behavior.

**Scope:**
- new Convex tables and validators
- optional task scaffolding fields
- minimal draft/publish-safe storage helpers

**Must not do:**
- no create wizard yet
- no runtime file generation rewrite yet
- no task materialization changes
- no `Run Squad`

**Key risks:**
- over-modeling the schema too early
- introducing task behavior changes while only trying to add scaffolding

**Mitigations:**
- keep workflow structure narrow
- make new task fields optional and inert
- test schema shape directly before wiring consumers

**Verification gate:**
- focused Convex schema/function tests
- dashboard format/lint for touched files

**Exit gate:**
- the new canonical entities exist and are test-covered
- current task flows behave exactly as before

## Wave 2: Projection Publishing

**Story:** `tech-spec-agent-spec-v2-projection-publishing.md`

**Objective:** Compile specs into runtime-safe projections so the existing
runtime can continue operating unchanged at the execution boundary.

**Scope:**
- pure compiler
- publish mutations
- projection metadata
- projection-backed `config.yaml` and `SOUL.md` materialization

**Must not do:**
- no authoring UI overhaul yet
- no migration yet
- no runtime prompt hand-editing shortcuts outside the compiler

**Key risks:**
- prompt compilation can regress current runtime quality
- `agents` may accidentally become a mixed authoring/runtime document again

**Mitigations:**
- make the compiler pure and testable
- keep authoring fields out of `agents`
- compare compiled prompt structure carefully against current expectations

**Verification gate:**
- focused compiler tests
- focused projection publish tests
- runtime file materialization route tests

**Exit gate:**
- publish writes versioned projections
- runtime files can be generated from projections
- the executor still consumes the same downstream contract

## Wave 3: Sync Hardening and Migration

**Story:** `tech-spec-agent-spec-v2-sync-hardening-and-migration.md`

**Objective:** Prevent local YAML drift from overriding canonical specs and
backfill the current catalog into Spec V2 safely.

**Scope:**
- new spec-aware bridge repository methods
- sync-service protections
- migration/backfill module
- rerunnable development-time backfill

**Must not do:**
- no hand migration of many agents
- no silent skip of broken migrations
- no squad migration complexity; squads are new-native

**Key risks:**
- accidental double source of truth during migration
- migration quality is poor because defaults are underspecified
- sync keeps treating local YAML as authoritative

**Mitigations:**
- guard sync explicitly against projection-backed overwrite paths
- make migration defaults explicit and test-covered
- keep backfill rerunnable and inspectable

**Verification gate:**
- focused pytest suites for bridge, sync, and migration
- Python guardrail suite

**Exit gate:**
- current agents can be represented as specs
- compiled agents are protected from local overwrite drift

## Wave 4: Deep Create Agent Authoring

**Story:** `tech-spec-agent-spec-v2-authoring-assist-and-create-agent.md`

**Objective:** Replace the shallow YAML-centric agent creation flow with a
chat-first, LLM-first architect flow.

**Scope:**
- structured authoring assistant
- chat-first `Create Agent` shell
- live preview and approval
- publish to spec plus projection

**Must not do:**
- no raw YAML-first UI
- no manual phase form as the primary experience
- no prompt-only flow disguised as a wizard
- no premature squad authoring complexity in the agent path

**Key risks:**
- the assistant may regress into generic chat with weak structure
- wizard state may drift from stored draft state

**Mitigations:**
- require structured draft deltas from the backend
- keep phase progression explicit
- keep a visible preview panel throughout the flow

**Verification gate:**
- focused backend assist tests
- focused dashboard wizard tests
- architecture guardrails for feature ownership

**Exit gate:**
- a user can create an agent without touching YAML
- publishing produces canonical spec + runtime projection

## Wave 5: Create Squad, Workflows, and Squads Library

**Story:** `tech-spec-squad-spec-v1-create-squad-and-library.md`

**Objective:** Add the squad blueprint authoring flow as an architect-style
conversation and the reusable squad library surface without introducing runtime
execution yet.

**Scope:**
- unified create chooser
- `Create Squad` architect conversation
- `Squads` sidebar section above `Agents`
- squad detail and board bindings
- multi-workflow authoring
- full blueprint graph persistence

**Must not do:**
- no task creation on squad save
- no hidden `Run Squad`
- no manual form-first squad creation flow
- no duplication of squad blueprints just to vary workflows

**Key risks:**
- the squad UI becomes a second task system instead of a blueprint library
- board binding semantics become ambiguous with memory isolation

**Mitigations:**
- keep squad objects clearly labeled as blueprints
- keep bindings separate from execution
- reflect board-scoped memory rule in both model and UI text
- persist child `agentSpecs` and `workflowSpecs` as part of the publish path

**Verification gate:**
- focused squad-creation tests
- sidebar/library tests
- binding tests

**Exit gate:**
- squads are visible, reusable, and board-bindable
- the create entry point supports both `Create Agent` and `Create Squad`

## Wave 6: Stabilization and Rollout Gates

**Story:** `tech-spec-agent-spec-v2-stabilization-and-rollout.md`

**Objective:** Validate the integrated system end to end, run the migration on
the current catalog, and document the follow-up boundary before runtime squad
execution work begins.

**Scope:**
- migration execution
- full baseline verification
- full-stack startup validation
- browser validation through `playwright-cli`
- follow-up and caveat documentation

**Must not do:**
- no new feature scope beyond stabilization
- no silent acceptance of migration defects
- no rollout claim without the full MC stack validation

**Key risks:**
- integration regressions only visible in the full stack
- migration appears to work in tests but fails on the real current catalog
- pressure to sneak `Run Squad` into the stabilization wave

**Mitigations:**
- run the real migration against the current catalog
- validate through the supported startup path
- explicitly list `Run Squad` as a later story

**Verification gate:**
- Python baseline checks
- dashboard lint/architecture checks
- full MC stack manual/browser validation
- review pass on the integrated diff

**Exit gate:**
- migrated current catalog
- validated create agent/squad flows
- validated new sidebar behavior
- documented remaining follow-ups clearly

## Recommended Execution Rhythm

1. Finish one wave completely before starting the next.
2. Keep commits wave-scoped.
3. Request review at the end of every wave, not only at the end of the whole
   initiative.
4. If a wave uncovers a design mismatch, update the design and wave plan before
   proceeding.

## Explicit Follow-Ups After This Program

- `Run Squad` and workflow-to-task materialization
- workflow execution graph handling in the runtime
- richer review execution and return-step automation during runtime
- optional squad-level operational analytics and template cloning
