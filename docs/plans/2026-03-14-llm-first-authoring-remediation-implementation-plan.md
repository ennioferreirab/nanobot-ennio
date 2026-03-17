# LLM-First Authoring Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current manual create-agent and create-squad primary flows with architect-style, LLM-first conversations that build structured drafts and persist complete agent and squad blueprints correctly.

**Architecture:** Execute the remediation in waves. First, build a shared authoring engine and unified draft-graph contract across Python and dashboard layers. Then migrate `Create Agent` to a chat-first shell, followed by `Create Squad` plus full graph persistence for child `agentSpecs`, `workflowSpecs`, and optional `reviewSpecs`, and finally validate that previewed structure matches persisted records in the real MC stack.

**Tech Stack:** Python, pytest, Next.js App Router, React 19, Convex, Vitest, Playwright CLI, Mission Control runtime, YAML/runtime projection bridge

---

## References

- Diagnosis: `docs/plans/2026-03-14-llm-first-authoring-remediation-plan.md`
- Wave plan: `docs/plans/2026-03-14-llm-first-authoring-wave-plan.md`
- Story artifact: `_bmad-output/implementation-artifacts/tech-spec-llm-first-authoring-remediation.md`
- Story artifact: `_bmad-output/implementation-artifacts/tech-spec-authoring-engine-and-draft-graph-foundation.md`
- Story artifact: `_bmad-output/implementation-artifacts/tech-spec-chat-first-create-agent.md`
- Story artifact: `_bmad-output/implementation-artifacts/tech-spec-chat-first-create-squad-and-graph-persistence.md`
- Story artifact: `_bmad-output/implementation-artifacts/tech-spec-llm-first-authoring-stabilization-and-rollout.md`

## Execution Setup

- Execute this plan in a dedicated git worktree from the repository root, not in the main checkout.
- Use the initiative branch label `agentSpecV2-workflowV1-reviewV1`. If the branch is created through Codex tooling, use the required prefixed branch name `codex/agentSpecV2-workflowV1-reviewV1`.
- Keep all commands anchored at the worktree root unless a step explicitly changes into `dashboard/`.
- For app validation, start the full Mission Control stack from the worktree root with `PORT=3001 uv run nanobot mc start`.
- Do not validate this remediation against `cd dashboard && npm run dev`; that bypasses the MC gateway and can hide authoring and persistence bugs.

## Problems This Plan Fixes

1. `Create Agent` is still form-first, so the intended architect-style LLM flow is not the real product behavior.
2. `Create Squad` is still form-first and its main publish path persists only a squad shell, which drops child agents and workflows.
3. The backend authoring contract is too shallow, because squad state is stored as flat phase strings rather than a structured draft graph.
4. Frontend and backend authoring semantics have drifted, which makes the flow fragile and causes preview and persistence mismatches.

## Delivery Order

1. Unify the authoring contract and graph model before touching either main wizard shell.
2. Land the chat-first `Create Agent` flow first so the shared engine is exercised on the simpler path.
3. Fix squad graph persistence before replacing the squad UI shell, so the new UX does not sit on broken saves.
4. Finish with real-stack validation that proves the saved squad detail matches the previewed structure.

### Task 1: Build the shared authoring engine and draft-graph contract

**Files:**
- Modify: `mc/contexts/agents/authoring_assist.py`
- Modify: `tests/mc/contexts/agents/test_authoring_assist.py`
- Modify: `dashboard/app/api/authoring/agent-wizard/route.ts`
- Modify: `dashboard/app/api/authoring/agent-wizard/route.test.ts`
- Modify: `dashboard/app/api/authoring/squad-wizard/route.ts`
- Modify: `dashboard/app/api/authoring/squad-wizard/route.test.ts`
- Create: `dashboard/features/agents/lib/authoringContract.ts`
- Create: `dashboard/features/agents/lib/authoringContract.test.ts`
- Create: `dashboard/features/agents/hooks/useAuthoringSession.ts`
- Create: `dashboard/features/agents/hooks/useAuthoringSession.test.tsx`

**Step 1: Write the failing contract tests**

Add tests that prove:
- both agent and squad flows use canonical phases: `discovery`, `proposal`, `refinement`, `approval`
- squad responses return graph patches, not flat `team_design` / `workflow_design` strings
- responses include `assistant_message`, `draft_graph_patch`, `unresolved_questions`, `preview`, `readiness`
- the dashboard-side contract parser accepts the backend payload without ad-hoc phase mapping

Use small fixture payloads such as:

```ts
{
  phase: "proposal",
  draft_graph_patch: {
    squad: { outcome: "Grow an expert personal brand" },
    agents: [{ key: "researcher", role: "Researcher" }],
    workflows: [{ key: "default", steps: [] }]
  }
}
```

**Step 2: Run the targeted tests and confirm they fail**

Run:

```bash
uv run pytest tests/mc/contexts/agents/test_authoring_assist.py
cd dashboard
npm run test -- app/api/authoring/agent-wizard/route.test.ts app/api/authoring/squad-wizard/route.test.ts features/agents/lib/authoringContract.test.ts features/agents/hooks/useAuthoringSession.test.tsx
```

Expected: FAIL because the backend still returns shallow phase strings and the shared contract does not exist yet.

**Step 3: Implement the shared contract and canonical phase model**

In Python, replace the squad response model with structured graph patches and canonical phases. In TypeScript, add a shared contract module that defines:

```ts
export type AuthoringPhase = "discovery" | "proposal" | "refinement" | "approval";

export interface AuthoringResponse<TPatch> {
  assistantMessage: string;
  phase: AuthoringPhase;
  draftGraphPatch: TPatch;
  unresolvedQuestions: string[];
  preview: Record<string, unknown>;
  readiness: number;
}
```

`useAuthoringSession.ts` should become the shared hook that stores:
- transcript
- current phase
- merged draft graph
- in-flight request state

**Step 4: Re-run the targeted tests**

Run:

```bash
uv run pytest tests/mc/contexts/agents/test_authoring_assist.py
cd dashboard
npm run test -- app/api/authoring/agent-wizard/route.test.ts app/api/authoring/squad-wizard/route.test.ts features/agents/lib/authoringContract.test.ts features/agents/hooks/useAuthoringSession.test.tsx
```

Expected: PASS.

**Step 5: Run formatting, lint, and commit**

Run:

```bash
uv run ruff format --check mc/contexts/agents/authoring_assist.py tests/mc/contexts/agents/test_authoring_assist.py
uv run ruff check mc/contexts/agents/authoring_assist.py tests/mc/contexts/agents/test_authoring_assist.py
cd dashboard
npm run format:file:check -- app/api/authoring/agent-wizard/route.ts app/api/authoring/agent-wizard/route.test.ts app/api/authoring/squad-wizard/route.ts app/api/authoring/squad-wizard/route.test.ts features/agents/lib/authoringContract.ts features/agents/lib/authoringContract.test.ts features/agents/hooks/useAuthoringSession.ts features/agents/hooks/useAuthoringSession.test.tsx
npm run lint:file -- app/api/authoring/agent-wizard/route.ts app/api/authoring/agent-wizard/route.test.ts app/api/authoring/squad-wizard/route.ts app/api/authoring/squad-wizard/route.test.ts features/agents/lib/authoringContract.ts features/agents/lib/authoringContract.test.ts features/agents/hooks/useAuthoringSession.ts features/agents/hooks/useAuthoringSession.test.tsx
git add mc/contexts/agents/authoring_assist.py tests/mc/contexts/agents/test_authoring_assist.py dashboard/app/api/authoring/agent-wizard/route.ts dashboard/app/api/authoring/agent-wizard/route.test.ts dashboard/app/api/authoring/squad-wizard/route.ts dashboard/app/api/authoring/squad-wizard/route.test.ts dashboard/features/agents/lib/authoringContract.ts dashboard/features/agents/lib/authoringContract.test.ts dashboard/features/agents/hooks/useAuthoringSession.ts dashboard/features/agents/hooks/useAuthoringSession.test.tsx
git commit -m "feat: add shared llm authoring engine contract"
```

### Task 2: Replace Create Agent with a chat-first authoring shell

**Files:**
- Modify: `dashboard/features/agents/components/AgentAuthoringWizard.tsx`
- Modify: `dashboard/features/agents/components/AgentAuthoringWizard.test.tsx`
- Modify: `dashboard/features/agents/hooks/useCreateAuthoringDraft.ts`
- Create: `dashboard/features/agents/components/AuthoringConversationPanel.tsx`
- Create: `dashboard/features/agents/components/AuthoringConversationPanel.test.tsx`
- Create: `dashboard/features/agents/components/AuthoringPreviewPanel.tsx`
- Create: `dashboard/features/agents/components/AuthoringPreviewPanel.test.tsx`

**Step 1: Write the failing UI tests**

Add tests that prove:
- `Create Agent` renders a conversation transcript and composer instead of the current long manual form
- the component posts user replies through `useAuthoringSession`
- the preview panel updates from `draftGraphPatch`
- manual field editing, if kept at all, is secondary and not the main first-render surface

**Step 2: Run the targeted dashboard tests and confirm they fail**

Run:

```bash
cd dashboard
npm run test -- features/agents/components/AgentAuthoringWizard.test.tsx features/agents/components/AuthoringConversationPanel.test.tsx features/agents/components/AuthoringPreviewPanel.test.tsx
```

Expected: FAIL because `AgentAuthoringWizard` is still form-first.

**Step 3: Implement the chat-first shell**

Refactor `AgentAuthoringWizard.tsx` so it becomes a thin shell around:
- `AuthoringConversationPanel`
- `AuthoringPreviewPanel`
- `useAuthoringSession`

Keep approval explicit. The publish action should still flow through `useCreateAuthoringDraft.ts`, but that hook should now publish the merged draft graph rather than a form snapshot.

**Step 4: Re-run the targeted dashboard tests**

Run:

```bash
cd dashboard
npm run test -- features/agents/components/AgentAuthoringWizard.test.tsx features/agents/components/AuthoringConversationPanel.test.tsx features/agents/components/AuthoringPreviewPanel.test.tsx
```

Expected: PASS.

**Step 5: Run dashboard guardrails and commit**

Run:

```bash
cd dashboard
npm run format:file:check -- features/agents/components/AgentAuthoringWizard.tsx features/agents/components/AgentAuthoringWizard.test.tsx features/agents/hooks/useCreateAuthoringDraft.ts features/agents/components/AuthoringConversationPanel.tsx features/agents/components/AuthoringConversationPanel.test.tsx features/agents/components/AuthoringPreviewPanel.tsx features/agents/components/AuthoringPreviewPanel.test.tsx
npm run lint:file -- features/agents/components/AgentAuthoringWizard.tsx features/agents/components/AgentAuthoringWizard.test.tsx features/agents/hooks/useCreateAuthoringDraft.ts features/agents/components/AuthoringConversationPanel.tsx features/agents/components/AuthoringConversationPanel.test.tsx features/agents/components/AuthoringPreviewPanel.tsx features/agents/components/AuthoringPreviewPanel.test.tsx
npm run test:architecture
git add dashboard/features/agents/components/AgentAuthoringWizard.tsx dashboard/features/agents/components/AgentAuthoringWizard.test.tsx dashboard/features/agents/hooks/useCreateAuthoringDraft.ts dashboard/features/agents/components/AuthoringConversationPanel.tsx dashboard/features/agents/components/AuthoringConversationPanel.test.tsx dashboard/features/agents/components/AuthoringPreviewPanel.tsx dashboard/features/agents/components/AuthoringPreviewPanel.test.tsx
git commit -m "feat: make create agent chat-first"
```

### Task 3: Add squad graph publish orchestration before changing the squad UI

**Files:**
- Modify: `dashboard/convex/squadSpecs.ts`
- Modify: `dashboard/convex/squadSpecs.test.ts`
- Modify: `dashboard/convex/agentSpecs.ts`
- Modify: `dashboard/convex/workflowSpecs.ts`
- Modify: `dashboard/convex/reviewSpecs.ts`
- Create: `dashboard/convex/lib/squadGraphPublisher.ts`
- Create: `dashboard/convex/lib/squadGraphPublisher.test.ts`
- Modify: `dashboard/features/agents/hooks/useCreateSquadDraft.ts`
- Create: `dashboard/features/agents/hooks/useCreateSquadDraft.test.tsx`

**Step 1: Write the failing persistence tests**

Add tests that prove:
- a main squad publish path creates child `agentSpecs`
- it creates child `workflowSpecs`
- it links `agentSpecIds` into the saved `squadSpec`
- it sets `defaultWorkflowSpecId`
- the main publish path never hardcodes `agentSpecIds: []`

Use a small graph fixture like:

```ts
{
  squad: { name: "personal-brand-squad", displayName: "Personal Brand Squad" },
  agents: [
    { key: "researcher", name: "audience-researcher", role: "Researcher" },
    { key: "writer", name: "post-writer", role: "Writer" }
  ],
  workflows: [
    {
      key: "default",
      name: "Default Workflow",
      steps: [
        { key: "research", type: "agent", agentKey: "researcher" },
        { key: "write", type: "agent", agentKey: "writer", dependsOn: ["research"] }
      ]
    }
  ]
}
```

**Step 2: Run the targeted tests and confirm they fail**

Run:

```bash
cd dashboard
npm run test -- convex/squadSpecs.test.ts convex/lib/squadGraphPublisher.test.ts features/agents/hooks/useCreateSquadDraft.test.tsx
```

Expected: FAIL because the current publish path only creates a squad shell.

**Step 3: Implement the graph publisher and hook integration**

Create `squadGraphPublisher.ts` as the single place that:
1. creates child agent specs
2. creates optional review spec
3. creates the squad
4. creates workflows with resolved `agentSpecId`
5. sets the default workflow

Then update `useCreateSquadDraft.ts` so `publishDraft()` calls that orchestrated path instead of `api.squadSpecs.create`.

**Step 4: Re-run the targeted tests**

Run:

```bash
cd dashboard
npm run test -- convex/squadSpecs.test.ts convex/lib/squadGraphPublisher.test.ts features/agents/hooks/useCreateSquadDraft.test.tsx
```

Expected: PASS.

**Step 5: Run formatting/lint and commit**

Run:

```bash
cd dashboard
npm run format:file:check -- convex/squadSpecs.ts convex/squadSpecs.test.ts convex/agentSpecs.ts convex/workflowSpecs.ts convex/reviewSpecs.ts convex/lib/squadGraphPublisher.ts convex/lib/squadGraphPublisher.test.ts features/agents/hooks/useCreateSquadDraft.ts features/agents/hooks/useCreateSquadDraft.test.tsx
npm run lint:file -- convex/squadSpecs.ts convex/squadSpecs.test.ts convex/agentSpecs.ts convex/workflowSpecs.ts convex/reviewSpecs.ts convex/lib/squadGraphPublisher.ts convex/lib/squadGraphPublisher.test.ts features/agents/hooks/useCreateSquadDraft.ts features/agents/hooks/useCreateSquadDraft.test.tsx
git add dashboard/convex/squadSpecs.ts dashboard/convex/squadSpecs.test.ts dashboard/convex/agentSpecs.ts dashboard/convex/workflowSpecs.ts dashboard/convex/reviewSpecs.ts dashboard/convex/lib/squadGraphPublisher.ts dashboard/convex/lib/squadGraphPublisher.test.ts dashboard/features/agents/hooks/useCreateSquadDraft.ts dashboard/features/agents/hooks/useCreateSquadDraft.test.tsx
git commit -m "feat: publish full squad graph"
```

### Task 4: Replace Create Squad with a chat-first shell and validate the detail view

**Files:**
- Modify: `dashboard/features/agents/components/SquadAuthoringWizard.tsx`
- Modify: `dashboard/features/agents/components/SquadAuthoringWizard.test.tsx`
- Modify: `dashboard/features/agents/components/SquadDetailSheet.tsx`
- Create: `dashboard/features/agents/components/SquadDetailSheet.test.tsx`
- Modify: `dashboard/features/agents/hooks/useSquadDetailData.ts`
- Create: `dashboard/features/agents/hooks/useSquadDetailData.test.tsx`
- Modify: `dashboard/features/agents/components/CreateAuthoringDialog.tsx`
- Modify: `dashboard/features/agents/components/CreateAuthoringDialog.test.tsx`

**Step 1: Write the failing UI and detail tests**

Add tests that prove:
- `Create Squad` is chat-first and conversation-driven
- the preview panel updates as the architect proposes agents and workflows
- after publish, `SquadDetailSheet` renders non-empty agent and workflow sections from persisted data
- the create chooser still offers both `Create Agent` and `Create Squad`

**Step 2: Run the targeted tests and confirm they fail**

Run:

```bash
cd dashboard
npm run test -- features/agents/components/SquadAuthoringWizard.test.tsx features/agents/components/SquadDetailSheet.test.tsx features/agents/hooks/useSquadDetailData.test.tsx features/agents/components/CreateAuthoringDialog.test.tsx
```

Expected: FAIL because `SquadAuthoringWizard` is still form-first and the detail view cannot yet prove full persisted graph rendering.

**Step 3: Implement the chat-first squad shell**

Refactor `SquadAuthoringWizard.tsx` into the same conversation/preview architecture as the agent flow. Use the shared authoring engine and the new squad graph publish hook. Update `useSquadDetailData.ts` and `SquadDetailSheet.tsx` so the saved squad reflects the persisted graph clearly.

**Step 4: Re-run the targeted tests**

Run:

```bash
cd dashboard
npm run test -- features/agents/components/SquadAuthoringWizard.test.tsx features/agents/components/SquadDetailSheet.test.tsx features/agents/hooks/useSquadDetailData.test.tsx features/agents/components/CreateAuthoringDialog.test.tsx
```

Expected: PASS.

**Step 5: Run dashboard guardrails and commit**

Run:

```bash
cd dashboard
npm run format:file:check -- features/agents/components/SquadAuthoringWizard.tsx features/agents/components/SquadAuthoringWizard.test.tsx features/agents/components/SquadDetailSheet.tsx features/agents/components/SquadDetailSheet.test.tsx features/agents/hooks/useSquadDetailData.ts features/agents/hooks/useSquadDetailData.test.tsx features/agents/components/CreateAuthoringDialog.tsx features/agents/components/CreateAuthoringDialog.test.tsx
npm run lint:file -- features/agents/components/SquadAuthoringWizard.tsx features/agents/components/SquadAuthoringWizard.test.tsx features/agents/components/SquadDetailSheet.tsx features/agents/components/SquadDetailSheet.test.tsx features/agents/hooks/useSquadDetailData.ts features/agents/hooks/useSquadDetailData.test.tsx features/agents/components/CreateAuthoringDialog.tsx features/agents/components/CreateAuthoringDialog.test.tsx
npm run test:architecture
git add dashboard/features/agents/components/SquadAuthoringWizard.tsx dashboard/features/agents/components/SquadAuthoringWizard.test.tsx dashboard/features/agents/components/SquadDetailSheet.tsx dashboard/features/agents/components/SquadDetailSheet.test.tsx dashboard/features/agents/hooks/useSquadDetailData.ts dashboard/features/agents/hooks/useSquadDetailData.test.tsx dashboard/features/agents/components/CreateAuthoringDialog.tsx dashboard/features/agents/components/CreateAuthoringDialog.test.tsx
git commit -m "feat: make create squad chat-first"
```

### Task 5: Stabilize the remediation and validate against the real bug

**Files:**
- Test: `tests/mc/contexts/agents/test_authoring_assist.py`
- Test: `dashboard/app/api/authoring/agent-wizard/route.test.ts`
- Test: `dashboard/app/api/authoring/squad-wizard/route.test.ts`
- Test: `dashboard/features/agents/components/AgentAuthoringWizard.test.tsx`
- Test: `dashboard/features/agents/components/SquadAuthoringWizard.test.tsx`
- Test: `dashboard/features/agents/components/SquadDetailSheet.test.tsx`
- Test: `dashboard/features/agents/hooks/useCreateSquadDraft.test.tsx`
- Test: `dashboard/features/agents/hooks/useAuthoringSession.test.tsx`
- Test: `dashboard/features/agents/hooks/useSquadDetailData.test.tsx`
- Test: `dashboard/convex/lib/squadGraphPublisher.test.ts`
- Test: `dashboard/e2e/dashboard-smoke.spec.ts`

**Step 1: Run the full targeted regression suite**

Run:

```bash
uv run pytest tests/mc/contexts/agents/test_authoring_assist.py
cd dashboard
npm run test -- app/api/authoring/agent-wizard/route.test.ts app/api/authoring/squad-wizard/route.test.ts features/agents/components/AgentAuthoringWizard.test.tsx features/agents/components/SquadAuthoringWizard.test.tsx features/agents/components/SquadDetailSheet.test.tsx features/agents/hooks/useCreateSquadDraft.test.tsx features/agents/hooks/useAuthoringSession.test.tsx features/agents/hooks/useSquadDetailData.test.tsx convex/lib/squadGraphPublisher.test.ts
```

Expected: PASS.

**Step 2: Run baseline Python and dashboard guardrails**

Run:

```bash
uv run pytest tests/mc/test_architecture.py tests/mc/test_module_reorganization.py tests/mc/infrastructure/test_boundary.py
cd dashboard
npm run test:architecture
```

Expected: PASS.

**Step 3: Validate the real app through the full MC stack**

Run from the repository root:

```bash
PORT=3001 uv run nanobot mc start
```

Then validate with `playwright-cli` against `http://localhost:3001`:
- open `Create Agent`
- answer at least 2 architect questions
- confirm preview updates and publish works
- open `Create Squad`
- answer enough questions to generate at least 2 agents and 1 workflow
- publish
- open the saved squad detail
- confirm the saved squad shows non-zero agents and non-zero workflows

**Step 4: Run dashboard smoke validation if needed**

Run:

```bash
cd dashboard
npm run test:e2e
```

Expected: PASS or actionable failures tied to the remediation.

**Step 5: Commit the integration wave**

```bash
git add .
git commit -m "feat: ship llm-first authoring remediation"
```

### Task 6: Hands-on playwright-cli validation with screenshots

> **Executor:** The orchestrator (Opus), not a dev agent. This is a manual, visual validation pass.

**Purpose:** Prove that the real UI matches the implementation by simulating actual user flows end-to-end and capturing screenshots at every critical step.

**Step 1: Start the full MC stack**

```bash
PORT=3001 uv run nanobot mc start
```

Do NOT use `cd dashboard && npm run dev`. The full MC stack is the only valid validation environment.

**Step 2: Validate Create Agent flow**

Using `playwright-cli` against `http://localhost:3001`:

1. Navigate to the Create Agent entry point — **screenshot**
2. Confirm the UI is chat-first (conversation panel + preview), not a manual form — **screenshot**
3. Send at least 2 messages to the architect assistant — **screenshot after each response**
4. Confirm the preview panel updates live from draft graph patches — **screenshot**
5. Confirm the phase advances through `discovery` → `proposal` → `refinement` — **screenshot of phase indicator**
6. Approve and publish the agent — **screenshot of publish confirmation**
7. Open the saved agent detail view — **screenshot confirming persisted data is complete**

**Step 3: Validate Create Squad flow**

Using `playwright-cli` against `http://localhost:3001`:

1. Navigate to the Create Squad entry point — **screenshot**
2. Confirm the UI is chat-first, not a manual form — **screenshot**
3. Converse until the architect proposes at least 2 agents and 1 workflow — **screenshot after each response**
4. Confirm the preview panel shows the full squad graph (agents, workflows, review policy) — **screenshot**
5. Approve and publish the squad — **screenshot of publish confirmation**
6. Open the saved squad detail view — **screenshot**
7. Confirm the detail shows **non-zero agents** and **non-zero workflows** (the original bug) — **screenshot with counts highlighted**

**Step 4: Validate Agent Detail from Squad context**

1. From the squad detail, click into one of the child agents — **screenshot**
2. Confirm agent data is complete (role, tools, system prompt present) — **screenshot**

**Step 5: Present all screenshots to the user**

Compile all screenshots in conversation order and present them for visual sign-off. Flag any discrepancy between preview and persisted data.

**Pass criteria:**
- All screenshots show chat-first UI, not form-first
- Preview updates live during conversation
- Published squad detail shows real agent and workflow counts (not empty)
- No `agentSpecIds: []` or missing workflow references in saved records
