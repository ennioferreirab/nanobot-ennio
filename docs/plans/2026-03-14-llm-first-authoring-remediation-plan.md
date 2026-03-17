# LLM-First Agent and Squad Authoring Remediation Plan

**Date:** 2026-03-14

**Goal:** Replace the current manual, phase-form-driven authoring flow with a chat-first, LLM-driven architect flow that can discover intent, build a structured draft graph for agents and squads, and persist all related records correctly.

## Current Findings

### 1. The current `Create Squad` UI is manual, not LLM-driven

`dashboard/features/agents/components/SquadAuthoringWizard.tsx` renders a
traditional phase form and never calls the squad authoring API route. The user
is filling fields directly instead of being guided by an architect-style
conversation.

### 2. The current `Create Squad` publish path drops child entities

`dashboard/features/agents/hooks/useCreateSquadDraft.ts` publishes only a
`squadSpec` and hardcodes `agentSpecIds: []`. It does not create:

- `agentSpecs`
- `workflowSpecs`
- `reviewSpecs`

This is why the squad detail view shows no agents and no workflows even after
the user completed the wizard.

### 3. The current squad assist backend is too shallow even if it were wired

`mc/contexts/agents/authoring_assist.py` currently stores each squad phase as a
single string field like `team_design` or `workflow_design`. That is not rich
enough to synthesize:

- a concrete agent list
- workflow steps with ownership
- review structures
- unresolved follow-up questions

### 4. The current `Create Agent` flow is also still manual in practice

`dashboard/features/agents/components/AgentAuthoringWizard.tsx` is also
form-first and does not drive authoring through the `agent-wizard` route. So
the desired “same powerful LLM as create agent” behavior is not actually
delivered yet.

### 5. Phase names and ownership are misaligned across layers

The UI uses phases such as:

- `outcome`
- `team-design`
- `workflow-design`
- `variants`
- `review-approval`

while the backend uses:

- `team_design`
- `workflow_design`
- `review_design`
- `approval`

This encourages ad-hoc mapping and brittle integration.

## Product Direction

The correct target is not “better forms.” The correct target is an
**Architect-style authoring session** for both agent and squad creation:

- chat-first
- LLM-led discovery
- dynamic follow-up questions
- live structured preview on the side
- manual edit only as a fallback or secondary affordance

This should feel closer to Opensquad's architect flow than to a traditional
multi-step form, but broader in domain support because Mission Control is not
only for design/content squads.

## Required Behavior

### Agent creation

The system should:

1. ask coherent discovery questions
2. infer and refine agent structure dynamically
3. keep a live structured preview of the resulting spec
4. ask only targeted follow-ups for missing or ambiguous fields
5. publish the final `agentSpec` plus runtime projection

### Squad creation

The system should:

1. ask about the actual outcome first
2. infer which roles or agents are needed
3. propose a squad structure back to the user
4. refine the proposed agents and workflows dynamically
5. build a real graph:
   - squad
   - agents
   - workflows
   - review rules
6. publish all linked records, not just the squad shell

## Revised Architecture

### 1. One shared authoring engine

Create a shared server-side authoring engine for both `Create Agent` and
`Create Squad`.

Responsibilities:

- maintain conversation state
- maintain structured draft graph state
- compute unresolved gaps
- choose the next best question
- decide when the graph is ready to publish

### 2. Chat-first UI shell

Replace the current phase-form primary UI with:

- chat transcript on the left
- live preview or outline on the right
- optional “Edit details” affordance only after the LLM has already proposed
  structure

Manual forms can still exist, but only as secondary editing surfaces.

### 3. Structured draft graph instead of flat strings

For squads, the draft state must hold a graph, not just phase text:

```ts
type SquadDraftGraph = {
  squad: {
    name?: string;
    displayName?: string;
    description?: string;
    outcome?: string;
    constraints?: string[];
    successSignals?: string[];
  };
  agents: Array<{
    key: string;
    name?: string;
    role?: string;
    purpose?: string;
    responsibilities?: string[];
    skills?: string[];
  }>;
  workflows: Array<{
    key: string;
    name?: string;
    description?: string;
    steps: Array<{
      key: string;
      title?: string;
      type?: "agent" | "human" | "checkpoint" | "review" | "system";
      agentKey?: string;
      description?: string;
      dependsOn?: string[];
      onReject?: string;
    }>;
    exitCriteria?: string[];
  }>;
  review?: {
    criteria?: string[];
    vetoes?: string[];
    threshold?: string;
  };
  unresolvedQuestions: string[];
};
```

### 4. Publish orchestration layer

Publishing a squad must become a coordinated flow:

1. create child `agentSpecs`
2. create `reviewSpec` if needed
3. create `squadSpec` with linked `agentSpecIds`
4. create child `workflowSpecs` linked to the squad and resolved agent IDs
5. set `defaultWorkflowSpecId`
6. optionally bind to boards later

The UI must never call a “create only the squad shell” mutation for the main
publish path.

### 5. Unified phase model

Use one canonical phase model per flow and mirror it across UI and backend.

Suggested squad phases:

- `discovery`
- `proposal`
- `refinement`
- `approval`

Suggested agent phases:

- `discovery`
- `proposal`
- `refinement`
- `approval`

These phases are better suited to an LLM-led architect flow than
form-oriented labels like `variants` or `review-approval`.

## Recommended Remediation Sequence

### Phase A: Stop extending the manual wizard

- Do not add more fields to the current squad form
- Do not patch the current form-first flow as the long-term solution
- Treat the current manual wizard as transitional code

### Phase B: Implement the shared authoring session contract

The backend response should look like:

```json
{
  "assistant_message": "Here's the squad shape I'm inferring...",
  "phase": "proposal",
  "draft_graph_patch": {
    "squad": { "outcome": "..." },
    "agents": [{ "key": "researcher", "role": "Researcher" }],
    "workflows": [{ "key": "default", "steps": [] }]
  },
  "preview": {
    "title": "Content Strategy Squad",
    "agents_count": 3,
    "workflows_count": 1
  },
  "unresolved_questions": [
    "Should review be mandatory before publish?"
  ],
  "readiness": 0.52,
  "recommended_next_action": "ask_followup"
}
```

### Phase C: Rewrite the UI around chat plus preview

- one shared authoring shell
- separate agent or squad modes
- chat-first interaction
- preview panel updates from `draft_graph_patch`
- explicit approval action before publish

### Phase D: Replace publish with graph persistence

- add a publish mutation or orchestrator that can persist all children
- return created IDs so the UI can open the final squad detail view correctly

### Phase E: Validate against the real bug

Manual validation must prove:

1. after a squad conversation, the saved squad shows real agent count
2. the saved squad shows real workflow count
3. the default workflow is attached
4. the preview shown during chat matches the persisted records

## Explicit Recommendation

Do not “improve the manual squad wizard.”

Replace it with:

- one architect-style authoring engine
- one chat-first shell
- one publish orchestrator that persists the full graph

That is the shortest path to matching the desired product behavior and fixing
the persistence bug at the same time.
