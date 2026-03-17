# Skill-First Squad Authoring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `Create Squad` terminal-only and skills-first, remove the old squad authoring path, align the local `skill-creator` to Anthropic's `skill-creator` standard, and let squad authoring create missing skills before publishing.

**Architecture:** Keep the dashboard shell thin and terminal-backed, move squad intelligence into `/create-squad-mc`, define a unified skill standard from Anthropic upstream plus a Mission Control overlay, and validate the final squad graph before publish. Remove the old squad shared-authoring code only where it is squad-specific so agent creation is not accidentally broken.

**Tech Stack:** Next.js route handlers, Convex mutations, local Claude/Codex skills under user home, dashboard terminal integration, Vitest, pytest, curl/http APIs.

---

### Task 1: Record the approved design and implementation references

**Files:**
- Create: `docs/plans/2026-03-16-skill-first-squad-authoring-design.md`
- Create: `docs/plans/2026-03-16-skill-first-squad-authoring-implementation-plan.md`
- Reference: `docs/plans/2026-03-15-agent-squad-unification-design.md`
- Reference: `docs/plans/2026-03-15-agent-soul-and-model-authoring-design.md`
- Reference: `docs/plans/2026-03-14-llm-first-authoring-remediation-plan.md`

**Step 1: Verify related design context exists**

Run:
```bash
rg -n "authoring|skill-creator|create-squad-mc|soul" docs/plans _bmad-output/implementation-artifacts -S
```

Expected: existing design and story files are listed.

**Step 2: Save the approved design**

Write the design doc capturing:
- terminal-only squad authoring
- skills-first discovery
- Anthropic skill-standard alignment
- naming, soul, and skill requirements
- missing-skill creation flow

**Step 3: Save this implementation plan**

Ensure the plan references exact file paths and keeps scope limited to squad authoring plus skill-standard unification.

**Step 4: Commit docs**

```bash
git add docs/plans/2026-03-16-skill-first-squad-authoring-design.md docs/plans/2026-03-16-skill-first-squad-authoring-implementation-plan.md
git commit -m "docs: define skill-first squad authoring plan"
```

### Task 2: Study Anthropic's `skill-creator` and write the gap analysis

**Files:**
- Create: `docs/plans/2026-03-16-anthropic-skill-creator-gap-analysis.md`
- Reference: `/tmp/anthropics-skills-codex-42340/skills/skill-creator/SKILL.md`
- Reference: `/tmp/anthropics-skills-codex-42340/skills/skill-creator/references/schemas.md`
- Reference: `/tmp/anthropics-skills-codex-42340/skills/skill-creator/scripts/quick_validate.py`
- Reference: `/tmp/anthropics-skills-codex-42340/skills/skill-creator/scripts/run_eval.py`
- Reference: `/Users/ennio/.codex/skills/.system/skill-creator/SKILL.md`

**Step 1: Read the upstream structure**

Run:
```bash
find /tmp/anthropics-skills-codex-42340/skills/skill-creator -maxdepth 3 -type f | sort
```

Expected: `SKILL.md`, `references/`, `scripts/`, `agents/`, `eval-viewer/` are present.

**Step 2: Document upstream anatomy**

Write down:
- required structure
- optional structure
- workflow stages
- eval and validation support
- what should become mandatory locally

**Step 3: Compare with our local skill-creator**

Document:
- what our local skill-creator already does
- what it lacks
- what must be aligned
- what MC-specific overlay we need

**Step 4: Commit the gap analysis**

```bash
git add docs/plans/2026-03-16-anthropic-skill-creator-gap-analysis.md
git commit -m "docs: add anthropic skill creator gap analysis"
```

### Task 3: Add or update the story artifact before code changes

**Files:**
- Create or modify: `_bmad-output/implementation-artifacts/tech-spec-skill-first-squad-authoring-and-skill-standard.md`
- Reference: `_bmad-output/implementation-artifacts/tech-spec-chat-first-create-squad-and-graph-persistence.md`
- Reference: `_bmad-output/implementation-artifacts/tech-spec-agent-soul-and-model-authoring.md`

**Step 1: Write the story**

Capture:
- terminal-only `Create Squad`
- removal of old squad shared-authoring
- skills-first discovery
- Anthropic-aligned skill standard
- local `skill-creator` update
- missing-skill creation

**Step 2: Include acceptance criteria**

At minimum:
- no alternate squad authoring path remains
- discovery covers required skills and patterns
- new agents include prompt/model/skills/soul
- naming convention applies
- missing skills can be created from the flow
- local `skill-creator` follows the unified standard

**Step 3: Commit the story**

```bash
git add _bmad-output/implementation-artifacts/tech-spec-skill-first-squad-authoring-and-skill-standard.md
git commit -m "docs: add skill-first squad authoring story"
```

### Task 4: Remove the old squad shared-authoring path

**Files:**
- Delete or retire: `dashboard/app/api/authoring/squad-wizard/route.ts`
- Delete or retire: `dashboard/app/api/authoring/squad-wizard/route.test.ts`
- Modify: `dashboard/features/agents/hooks/useAuthoringSession.ts`
- Modify: `dashboard/features/agents/lib/authoringContract.ts`
- Modify: `mc/contexts/agents/authoring_assist.py`
- Modify: tests that still assume squad authoring uses the shared authoring engine

**Step 1: Write failing tests describing the intended state**

Add or update tests so they fail if:
- squad creation still references `/api/authoring/squad-wizard`
- squad authoring still depends on shared squad contract code

**Step 2: Run the focused tests to confirm failure**

Run:
```bash
npm run test -- features/agents/hooks/useAuthoringSession.test.tsx app/api/authoring/squad-wizard/route.test.ts
```

Expected: failure because the old path still exists.

**Step 3: Remove squad-specific code**

Make the minimal changes to:
- remove the squad endpoint
- remove squad mode from shared hook/contract only if it is no longer needed
- leave agent authoring intact

**Step 4: Re-run focused tests**

Run:
```bash
npm run test -- features/agents/hooks/useAuthoringSession.test.tsx
```

Expected: pass with updated scope.

**Step 5: Commit**

```bash
git add dashboard/app/api/authoring/squad-wizard/route.ts dashboard/app/api/authoring/squad-wizard/route.test.ts dashboard/features/agents/hooks/useAuthoringSession.ts dashboard/features/agents/lib/authoringContract.ts mc/contexts/agents/authoring_assist.py
git commit -m "refactor: remove old squad shared authoring path"
```

### Task 5: Expand squad authoring context for skills-first discovery

**Files:**
- Modify: `dashboard/app/api/specs/squad/context/route.ts`
- Modify: `dashboard/app/api/specs/squad/context/route.test.ts`
- Modify or add tests for any helper used to assemble skill metadata

**Step 1: Write failing tests**

Add assertions for the context payload to include enough information for:
- installed skills
- available skills
- skill descriptions/categories if supported
- models
- reusable agents with skill metadata

**Step 2: Run tests to confirm failure**

Run:
```bash
npm run test -- app/api/specs/squad/context/route.test.ts
```

Expected: fail because the route does not yet provide the richer skill-oriented contract.

**Step 3: Implement the route changes**

Keep the route MC-native and return only the data required by `/create-squad-mc`.

**Step 4: Re-run tests**

Run:
```bash
npm run test -- app/api/specs/squad/context/route.test.ts
```

Expected: pass.

**Step 5: Commit**

```bash
git add dashboard/app/api/specs/squad/context/route.ts dashboard/app/api/specs/squad/context/route.test.ts
git commit -m "feat: expose skill-first squad authoring context"
```

### Task 6: Rewrite `/create-squad-mc` around skills-first discovery

**Files:**
- Modify: `/Users/ennio/.claude/skills/create-squad-mc/SKILL.md`
- Modify, if mirrored in Codex as part of stack standardization: matching local skill file if one exists
- Reference: `/tmp/opensquad-codex-20744/templates/_opensquad/core/architect.agent.yaml`

**Step 1: Update the phase model**

Restructure the skill to cover:
- intent
- capability discovery
- skill discovery
- pattern discovery
- agent design
- workflow design
- validation
- publish

**Step 2: Add naming convention rules**

Require memorable alliterative display names for new agents while preserving slug-safe `name`.

**Step 3: Make `prompt`, `model`, `skills`, and `soul` explicit**

Require the skill to collect and summarize all four for every new agent.

**Step 4: Add missing-skill detection**

Teach the skill to:
- detect required missing skills
- explain the gap
- offer to create the skill now

**Step 5: Add final validation checklist**

Before publish, the skill should validate:
- agent completeness
- skill availability
- workflow integrity

**Step 6: Commit**

```bash
git add /Users/ennio/.claude/skills/create-squad-mc/SKILL.md
git commit -m "feat: make create squad skill skills-first"
```

### Task 7: Align the local `skill-creator` to the unified standard

**Files:**
- Modify: `/Users/ennio/.codex/skills/.system/skill-creator/SKILL.md`
- Modify any local bundled references/scripts needed for parity
- Optionally mirror to Claude-side local skill if the stack expects both surfaces
- Reference: `/tmp/anthropics-skills-codex-42340/skills/skill-creator/SKILL.md`

**Step 1: Write the failing validation target**

Create a checklist or tests that fail if the local skill-creator:
- does not describe Anthropic-style anatomy
- does not mention `references/`, `scripts/`, `agents/`, validation, and eval loops
- does not explain the unified local overlay

**Step 2: Update the skill body**

Bring the local skill-creator into alignment with the upstream structure while adding MC-specific guidance only where necessary.

**Step 3: Add or update helper references/scripts if needed**

Only add bundled resources if the local skill genuinely needs them.

**Step 4: Re-run the validation checklist**

Use a lightweight local check or review against the gap-analysis document.

**Step 5: Commit**

```bash
git add /Users/ennio/.codex/skills/.system/skill-creator/SKILL.md
git commit -m "feat: align local skill creator to anthropic standard"
```

### Task 8: Add a server-side squad graph validator

**Files:**
- Modify: `dashboard/convex/lib/squadGraphPublisher.ts`
- Modify or create: `dashboard/convex/lib/squadGraphValidator.ts`
- Modify: `dashboard/convex/lib/squadGraphPublisher.test.ts`
- Modify: `dashboard/convex/squadSpecs.test.ts`
- Modify: `dashboard/app/api/specs/squad/route.ts`

**Step 1: Write failing tests**

Cover blocking cases:
- new agent missing prompt/model/skills/soul
- unknown `agentKey`
- missing required skill
- invalid naming
- invalid review step contract

**Step 2: Run tests to verify failure**

Run:
```bash
npm run test -- convex/lib/squadGraphPublisher.test.ts convex/squadSpecs.test.ts
```

Expected: fail because these validations do not yet exist.

**Step 3: Implement the validator**

Keep it reusable from both:
- the publish route
- the publish mutation/publisher layer

**Step 4: Re-run tests**

Run:
```bash
npm run test -- convex/lib/squadGraphPublisher.test.ts convex/squadSpecs.test.ts
```

Expected: pass.

**Step 5: Commit**

```bash
git add dashboard/convex/lib/squadGraphPublisher.ts dashboard/convex/lib/squadGraphValidator.ts dashboard/convex/lib/squadGraphPublisher.test.ts dashboard/convex/squadSpecs.test.ts dashboard/app/api/specs/squad/route.ts
git commit -m "feat: validate skill-first squad graph before publish"
```

### Task 9: Connect missing-skill creation into the squad flow

**Files:**
- Modify: `/Users/ennio/.claude/skills/create-squad-mc/SKILL.md`
- Modify: `/Users/ennio/.codex/skills/.system/skill-creator/SKILL.md`
- Add any local integration helpers only if strictly necessary

**Step 1: Design the handoff contract**

Document how `/create-squad-mc` hands off to the local `skill-creator` when a required skill is missing.

**Step 2: Implement the handoff instructions**

Make the squad skill:
- pause squad design
- create/install the missing skill
- resume squad design with the resolved skill

**Step 3: Add a reproducible walkthrough test or scripted validation**

At minimum, validate one scenario:
- required skill missing
- skill is created
- skill is referenced by the new agent
- publish succeeds

**Step 4: Commit**

```bash
git add /Users/ennio/.claude/skills/create-squad-mc/SKILL.md /Users/ennio/.codex/skills/.system/skill-creator/SKILL.md
git commit -m "feat: connect missing skill creation to squad authoring"
```

### Task 10: Run formatting, tests, and real-flow verification

**Files:**
- Verify all files touched in prior tasks

**Step 1: Run dashboard formatting and lint checks**

Run:
```bash
npm run format:file:check -- app/api/specs/squad/context/route.ts app/api/specs/squad/context/route.test.ts app/api/specs/squad/route.ts convex/lib/squadGraphPublisher.ts convex/lib/squadGraphValidator.ts convex/lib/squadGraphPublisher.test.ts convex/squadSpecs.ts convex/squadSpecs.test.ts features/agents/hooks/useAuthoringSession.ts features/agents/lib/authoringContract.ts
```

Run:
```bash
npm run lint:file -- app/api/specs/squad/context/route.ts app/api/specs/squad/context/route.test.ts app/api/specs/squad/route.ts convex/lib/squadGraphPublisher.ts convex/lib/squadGraphValidator.ts convex/lib/squadGraphPublisher.test.ts convex/squadSpecs.ts convex/squadSpecs.test.ts features/agents/hooks/useAuthoringSession.ts features/agents/lib/authoringContract.ts
```

Expected: pass.

**Step 2: Run focused tests**

Run:
```bash
npm run test -- app/api/specs/squad/context/route.test.ts convex/lib/squadGraphPublisher.test.ts convex/squadSpecs.test.ts features/agents/hooks/useAuthoringSession.test.tsx
```

Expected: pass.

**Step 3: Run dashboard architecture guardrail**

Run:
```bash
npm run test:architecture
```

Expected: pass.

**Step 4: Verify the real terminal flow through the full MC stack**

From a worktree root:
```bash
cp dashboard/.env.local .worktrees/codex/<branch>/dashboard/.env.local
cd .worktrees/codex/<branch>
PORT=3001 uv run nanobot mc start
```

Then validate:
- `Create Squad` opens the terminal-backed flow
- no old squad shared-authoring path is exercised
- discovery covers skills and patterns
- new agent names follow the naming convention
- missing skills can be created or the flow blocks clearly
- publish only succeeds with complete prompt/model/skills/soul data

**Step 5: Commit verification-safe changes**

```bash
git add <touched files>
git commit -m "feat: land skill-first squad authoring"
```

### Task 11: Request review and capture rollout notes

**Files:**
- Create or modify: `docs/plans/2026-03-16-skill-first-squad-authoring-rollout-notes.md`

**Step 1: Request code review**

Use the repo's review workflow after implementation stabilizes.

**Step 2: Record rollout notes**

Capture:
- removed legacy squad authoring pieces
- Anthropic alignment choices
- local overlay decisions
- known migration risks for older local skills

**Step 3: Commit**

```bash
git add docs/plans/2026-03-16-skill-first-squad-authoring-rollout-notes.md
git commit -m "docs: add skill-first squad authoring rollout notes"
```
