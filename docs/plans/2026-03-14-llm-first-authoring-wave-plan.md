# LLM-First Authoring Remediation Wave Plan

**Date:** 2026-03-14

**Goal:** Correct the current authoring direction by replacing the manual
create-agent and create-squad primary flows with architect-style, LLM-first
conversations that build structured drafts and persist complete records.

**Context:** This wave plan is a remediation layer on top of the earlier spec
program. It exists because the current shipped direction is not matching the
intended product behavior and is already showing persistence failures in squad
creation.

**Detailed diagnosis:** `docs/plans/2026-03-14-llm-first-authoring-remediation-plan.md`

---

## Story Decomposition

- `tech-spec-llm-first-authoring-remediation`
- `tech-spec-authoring-engine-and-draft-graph-foundation`
- `tech-spec-chat-first-create-agent`
- `tech-spec-chat-first-create-squad-and-graph-persistence`
- `tech-spec-llm-first-authoring-stabilization-and-rollout`

## Problems Found

### Problem 1: The primary UX is manual

Both `Create Agent` and `Create Squad` are still form-first in the real UI.
That contradicts the desired architect behavior and reduces the LLM to a
secondary or unused layer.

### Problem 2: Squad persistence is incomplete

The main squad publish path currently saves only a squad shell and drops child
entities, which creates empty squad detail views.

### Problem 3: The backend contract is too shallow

The current squad authoring backend stores flat phase strings, which is not
enough to infer and persist a real squad graph.

### Problem 4: Frontend and backend semantics drift

Phase names and authoring semantics are not aligned across layers, which makes
the feature fragile and harder to evolve.

## Solution Principles

1. The primary experience must be chat-first and LLM-first.
2. A shared authoring engine should power both agent and squad creation.
3. The authoring state must be a structured graph, not flat text buckets.
4. Squad publish must persist the full graph, not only the squad shell.
5. Validation must prove that previewed structure matches persisted structure.

## Wave 0: Freeze the Remediation Boundary

**Objective:** Explicitly stop further investment in the current manual primary
flow and align the team on the remediation target.

**Core work:**
- record the diagnosis
- record the new stories
- record the new wave plan

**Must not do:**
- do not add more primary-form fields to the current squad wizard
- do not patch shell-only persistence as the long-term fix

**Exit gate:**
- the remediation plan is documented
- the new story sequence is explicit

## Wave 1: Shared Authoring Engine and Draft Graph Foundation

**Story:** `tech-spec-authoring-engine-and-draft-graph-foundation.md`

**Objective:** Build the shared contract that makes LLM-first flows possible.

**Scope:**
- canonical authoring phases
- shared response contract
- structured graph patches
- unresolved-question semantics

**Problems solved in this wave:**
- shallow backend contract
- frontend/backend phase drift

**Must not do:**
- no final UI migration yet
- no shell-only squad persistence patches

**Key risks:**
- inventing an overcomplicated graph model
- keeping phase semantics vague

**Mitigations:**
- keep the graph narrowly focused on squad, agents, workflows, review
- use only 4 canonical phases

**Exit gate:**
- both agent and squad authoring can advance through the same conceptual model
- the backend can return graph patches rather than flat strings

## Wave 2: Chat-First Create Agent

**Story:** `tech-spec-chat-first-create-agent.md`

**Objective:** Move agent creation to the intended architect-style experience.

**Scope:**
- chat-first create-agent shell
- live preview
- approval and publish

**Problems solved in this wave:**
- manual agent primary UX
- mismatch between promised and actual create-agent behavior

**Must not do:**
- no form-first primary experience
- no YAML-centric fallback as the normal path

**Key risks:**
- chat flow becomes generic and unstructured
- preview drifts from actual draft state

**Mitigations:**
- drive the UI strictly from structured authoring responses
- keep preview derived from the same draft graph

**Exit gate:**
- create-agent is LLM-first in the real UI
- publish path still produces valid runtime projections

## Wave 3: Chat-First Create Squad and Graph Persistence

**Story:** `tech-spec-chat-first-create-squad-and-graph-persistence.md`

**Objective:** Replace the manual squad flow and fix the actual persistence
failure by publishing the full squad graph.

**Scope:**
- chat-first create-squad shell
- dynamic squad proposal and refinement
- full graph persistence
- correct squad detail rendering

**Problems solved in this wave:**
- manual squad primary UX
- dropped child entities on publish
- empty squad detail results

**Must not do:**
- no shell-only `squadSpec` publish from the main path
- no `Run Squad`
- no manual form expansion as a substitute for architect logic

**Key risks:**
- graph persistence order becomes inconsistent
- preview and saved records diverge

**Mitigations:**
- centralize publish orchestration
- validate publish-to-detail correctness explicitly

**Exit gate:**
- saved squads show real agents and workflows
- persisted graph matches previewed graph

## Wave 4: Stabilization and Rollout Gates

**Story:** `tech-spec-llm-first-authoring-stabilization-and-rollout.md`

**Objective:** Prove that the remediation fixed the real product problem and did
not only improve the conversation surface.

**Scope:**
- full-stack validation
- regression checks
- rollout notes

**Problems solved in this wave:**
- false confidence from preview-only validation
- hidden persistence mismatches

**Must not do:**
- no new feature scope
- no rollout claim without checking saved records

**Key risks:**
- real app behavior diverges from unit tests
- old flows remain partially active and mask issues

**Mitigations:**
- validate through `uv run nanobot mc start`
- inspect persisted records and detail sheets directly

**Exit gate:**
- create-agent and create-squad are both LLM-first in the real app
- saved records match previewed structure
- follow-up scope is documented cleanly

## Recommended Sequencing

1. Finish Wave 1 before touching the main UI shells.
2. Land agent remediation before squad remediation so the shared engine gets
   exercised on the simpler path first.
3. Treat squad publish correctness as the main success bar of Wave 3.
4. Do not reopen manual-primary UX after Wave 2 or 3 unless there is a critical
   rollback need.
