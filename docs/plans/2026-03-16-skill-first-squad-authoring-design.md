# Skill-First Squad Authoring Design

**Date:** 2026-03-16

**Objective:** Consolidate squad creation in Mission Control around the terminal-driven `/create-squad-mc` flow, remove the parallel squad authoring path, and make squad design explicitly skills-first using a unified skill standard aligned with Anthropic's `skill-creator`.

## Approved Product Direction

The following decisions are now treated as product direction:

1. `Create Squad` is terminal-only. The real flow is the interactive terminal launched from the dashboard and driven by `/create-squad-mc`.
2. The old squad-specific shared authoring path is removed rather than maintained as a fallback.
3. Squad discovery becomes skills-first:
   - discover the outcome
   - discover the capabilities required
   - discover the skills required to realize those capabilities
   - design agents around those skills and patterns
4. Every new squad agent must explicitly carry:
   - `prompt`
   - `model`
   - `skills`
   - `soul`
5. New agents follow a memorable display-name convention inspired by Opensquad while keeping safe slugs for persisted identifiers.
6. Missing skills should be creatable from the squad flow using a local `skill-creator` aligned to the public Anthropic `skill-creator` standard.
7. Our stack adopts a unified skill standard based on Anthropic upstream plus explicit Mission Control extensions.

## Problem Statement

The current codebase still reflects two competing ideas of squad creation:

- the dashboard opens a terminal-backed wizard via `/create-squad-mc`
- older specs and code still describe a shared squad authoring engine via `/api/authoring/squad-wizard`

That split creates product ambiguity, duplicate maintenance surface, and inconsistent evolution. At the same time, the current `/create-squad-mc` flow is still relatively shallow compared with the desired operating model:

- it is not explicitly skills-first
- it does not treat missing skills as first-class authoring gaps
- it does not share a unified skill creation standard with the local `skill-creator`
- it does not yet enforce richer naming, soul, and skill conventions as part of squad design

## Target Experience

### 1. One canonical squad creation path

From the dashboard, `Create Squad` opens the terminal and only the terminal. The user speaks to an architect-style flow powered by `/create-squad-mc`. No parallel squad authoring API/session contract remains in the product for squad creation.

### 2. Skills-first discovery

The architect does not jump straight to agent roles. It first determines:

- what result the user wants
- what capabilities are required
- what patterns and quality rules apply
- what skills must exist for those capabilities to be credible

Only then does it propose the roster, reusing existing agents and existing skills when possible.

### 3. Agent design with explicit runtime contract

Each newly created squad agent is designed as a fully specified MC runtime participant:

- stable slug
- human-friendly display name
- prompt
- model
- skills list
- soul

Nothing important is left implicit.

### 4. Skill gaps are resolvable inside authoring

If the squad needs a skill that does not exist, the architect treats that as a first-class gap:

- identify the missing skill
- explain why it is needed
- ask whether to create it now
- invoke the local `skill-creator` flow using the unified skill standard
- install/register the skill
- continue squad authoring with the newly available capability

### 5. Unified skill standard across the stack

Mission Control adopts Anthropic's `skill-creator` as the upstream model for skill anatomy and workflow:

- `SKILL.md`
- `references/`
- `scripts/`
- `agents/`
- evaluation and iteration support

Our local stack may extend that standard, but it should not casually diverge from it.

## Architecture Decisions

### Decision A: Terminal-only squad authoring

The canonical squad authoring surface is:

- dashboard shell: `dashboard/features/agents/components/SquadAuthoringWizard.tsx`
- terminal runtime: `dashboard/features/agents/components/AgentTerminal.tsx`
- authoring logic: `/Users/ennio/.claude/skills/create-squad-mc/SKILL.md`

The old squad shared-authoring flow is removed from active product scope:

- `dashboard/app/api/authoring/squad-wizard/route.ts`
- squad usage in `dashboard/features/agents/hooks/useAuthoringSession.ts`
- squad-specific shared authoring contract pieces that only served that path
- squad-specific backend authoring helpers that are no longer needed after removal

Agent authoring can remain independent for now. This initiative removes the parallel squad flow only.

### Decision B: Skills-first authoring model

`/create-squad-mc` becomes an architect for skills-enabled systems, not just a roster form. Its phases should become:

1. intent and success criteria
2. capability discovery
3. skill discovery and gap analysis
4. pattern and quality-rule discovery
5. agent composition and reuse
6. workflow and review design
7. validation
8. publish

### Decision C: Unified skill standard based on Anthropic upstream

We will explicitly study Anthropic's `skills/skill-creator` before adapting the local skill stack. The local standard should preserve upstream-compatible anatomy where possible and define Mission Control-specific additions only where required.

Recommended policy:

- Anthropic upstream is the contract reference
- Mission Control defines a thin overlay for local runtime needs
- local `skill-creator` is updated to emit and iterate against that unified standard

### Decision D: Naming convention for newly created agents

For newly created squad agents:

- `displayName` follows a memorable, human, alliterative convention inspired by Opensquad
- `name` remains a machine-safe slug derived from the chosen display name or approved technical identifier

For reused agents:

- preserve the existing `name`
- preserve the existing `displayName` unless the user explicitly wants a rename strategy

### Decision E: Explicit agent contract

For every newly created agent, the final authoring payload must carry:

- `prompt`
- `model`
- `skills`
- `soul`

This becomes both a conversation rule and a validation rule.

## Required Context Expansion

The squad authoring context route must evolve from a simple roster/model helper into a skills-first discovery surface.

Current useful data:

- active agents
- installed/available skills
- connected models

Needed additions:

- stronger skill metadata for discovery
- installed-vs-missing distinction
- enough catalog data to recommend relevant skills
- local skill standard metadata if needed for creation/install flows

The architect should be able to answer:

- which relevant skills already exist
- which skills are probably needed
- which skills are missing
- whether the missing skill should be created now

## Validation Model

Before publish, the final blueprint should be validated against MC-native rules, not filesystem rules.

Blocking errors:

- missing `prompt` / `model` / `skills` / `soul` on a new agent
- workflow references an unknown `agentKey`
- required skill is missing and was not created
- invalid squad or agent slug
- structurally invalid workflow dependencies

Warnings:

- no reviewer/review policy where one would normally be expected
- weak or empty soul
- suspiciously broad agent role
- duplicated responsibilities across agents

## Scope Boundaries

### In scope

- remove the old squad shared-authoring path
- make `/create-squad-mc` canonical and skills-first
- expand squad context to support skills-first discovery
- enforce naming/soul/skills/model rules for new agents
- study and adapt Anthropic `skill-creator`
- update local `skill-creator` to the unified standard
- allow missing-skill creation from squad authoring

### Out of scope for this phase

- changing the agent creation flow unless needed for shared skill-standard compatibility
- replacing all existing local skills immediately
- building a full new dashboard UX outside the terminal flow
- redesigning runtime execution semantics for squads

## Delivery Strategy

### Phase 1: Upstream study and standard definition

Study Anthropic `skill-creator`, document the contract, and define our local overlay.

### Phase 2: Remove the old squad authoring path

Delete the parallel squad authoring surface and update docs/tests accordingly.

### Phase 3: Rebuild `/create-squad-mc` around skills-first discovery

Add capability discovery, skills discovery, pattern discovery, naming rules, and explicit soul/skills/model collection.

### Phase 4: Update the local `skill-creator`

Bring the local skill-creator into alignment with the unified standard.

### Phase 5: Connect missing-skill creation back into squad authoring

Let `create-squad-mc` detect missing skills and hand off to the updated skill-creator flow.

### Phase 6: Add validation and rollout checks

Ensure publish is blocked on incomplete skill/agent contracts and verify the real terminal flow end to end.

## Key Risks

1. Over-coupling squad authoring to an immature skill catalog.
2. Creating skills and publishing squads in one conversational flow without clear rollback boundaries.
3. Accidentally deleting authoring code still used by agent creation.
4. Diverging from Anthropic upstream so quickly that the “unified standard” becomes local-only again.

## Recommended Mitigations

1. Land the standard-definition phase first, before changing runtime behavior.
2. Keep squad-flow removal tightly scoped to squad-specific code.
3. Treat skill creation as an explicit subflow with clear success/failure states.
4. Add contract tests for skill metadata, squad validation, and skill-gap handling.

## Success Criteria

This initiative is successful when:

1. `Create Squad` has exactly one real path in product behavior.
2. Squad discovery is explicitly skills-first.
3. New squad agents always publish with prompt/model/skills/soul.
4. New agent naming follows the agreed memorable naming convention.
5. The local `skill-creator` is aligned to the Anthropic skill model.
6. Missing required skills can be created from the squad flow.
7. Publish is blocked when the final blueprint is missing mandatory skill/agent contract data.
