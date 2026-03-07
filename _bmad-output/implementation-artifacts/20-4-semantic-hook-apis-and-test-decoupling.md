# Story 20.4: Semantic Hook APIs and Test Decoupling

Status: ready-for-dev

## Story

As a **maintainer**,
I want feature hooks to provide semantic APIs instead of raw Convex pass-throughs,
so that component tests mock hooks instead of Convex internals, completing the Wave 5 decoupling.

## Acceptance Criteria

### AC1: Feature Hooks Provide Semantic APIs

**Given** the 6 feature hooks currently return raw `useMutation()`/`useQuery()` results
**When** the refactoring is complete
**Then** each hook returns a semantic API:
- `useTaskInputData` returns `{ createTask(args): Promise, predefinedTags, ... }` not raw mutation references
- `useAgentConfigSheetData` returns `{ updateConfig(args): Promise, ... }`
- `useTagsPanelData` returns `{ createTag(args): Promise, removeTag(id): Promise, ... }`
- `useSearchBarFilters` returns typed filter data
- `useStepCardActions` returns `{ deleteStep(id): Promise, acceptHumanStep(id): Promise, ... }`
- `useAgentSidebarItemState` returns typed state
**And** Convex is an implementation detail hidden inside the hook

### AC2: Component Tests Mock Hooks

**Given** component tests currently mock `convex/react` with deep Convex setup
**When** the test migration is complete
**Then** component tests mock the feature hook:
```typescript
vi.mock("@/hooks/useTaskInputData", () => ({
  useTaskInputData: () => ({ createTask: vi.fn(), predefinedTags: [] })
}));
```
**And** no component test imports or mocks `convex/react` directly
**And** no component test references Convex API paths

### AC3: Hook Tests Cover Convex Integration

**Given** hooks now hide Convex details
**When** hook tests are written
**Then** each feature hook has a dedicated test file
**And** hook tests verify the Convex integration (which queries/mutations are called)
**And** this is the only place Convex mocks appear

### AC4: Architecture Guardrail

**Given** the decoupling is complete
**When** a guardrail test is added
**Then** component test files (*.test.tsx) in `dashboard/components/` cannot import from `convex/react`
**And** the guardrail runs in the test suite

### AC5: Target Components

**Given** the 6 target components
**When** the refactoring is complete
**Then** all 6 are fully decoupled:
1. TaskInput
2. AgentConfigSheet
3. TagsPanel
4. SearchBar
5. StepCard
6. AgentSidebarItem

## Tasks / Subtasks

- [ ] **Task 1: Refactor useTaskInputData to semantic API** (AC: #1)
  - [ ] 1.1 Read `dashboard/hooks/useTaskInputData.ts` (67 lines)
  - [ ] 1.2 Wrap useMutation returns in async functions
  - [ ] 1.3 Define explicit return type interface
  - [ ] 1.4 Create `dashboard/hooks/__tests__/useTaskInputData.test.ts`

- [ ] **Task 2: Refactor useAgentConfigSheetData** (AC: #1)
  - [ ] 2.1 Read hook (47 lines), wrap mutations, define return type
  - [ ] 2.2 Create hook test file

- [ ] **Task 3: Refactor useTagsPanelData** (AC: #1)
  - [ ] 3.1 Read hook (25 lines), wrap 7 mutations/queries
  - [ ] 3.2 Create hook test file

- [ ] **Task 4: Refactor useSearchBarFilters** (AC: #1)
  - [ ] 4.1 Read hook (36 lines), type the return value
  - [ ] 4.2 Create hook test file

- [ ] **Task 5: Refactor useStepCardActions** (AC: #1)
  - [ ] 5.1 Read hook (13 lines), wrap 3 mutations
  - [ ] 5.2 Create hook test file

- [ ] **Task 6: Refactor useAgentSidebarItemState** (AC: #1)
  - [ ] 6.1 Read hook (19 lines), type the return value
  - [ ] 6.2 Create hook test file

- [ ] **Task 7: Migrate component tests** (AC: #2)
  - [ ] 7.1 Rewrite TaskInput.test.tsx to mock useTaskInputData
  - [ ] 7.2 Rewrite AgentConfigSheet.test.tsx to mock useAgentConfigSheetData
  - [ ] 7.3 Rewrite TagsPanel.test.tsx to mock useTagsPanelData
  - [ ] 7.4 Rewrite SearchBar.test.tsx to mock useSearchBarFilters
  - [ ] 7.5 Rewrite StepCard.test.tsx to mock useStepCardActions
  - [ ] 7.6 Rewrite AgentSidebarItem.test.tsx to mock useAgentSidebarItemState

- [ ] **Task 8: Add architecture guardrail** (AC: #4)
  - [ ] 8.1 Add test to `dashboard/tests/architecture.test.ts`: component tests cannot import convex/react
  - [ ] 8.2 Verify the guardrail catches violations

- [ ] **Task 9: Final verification** (AC: #5)
  - [ ] 9.1 Run full dashboard test suite
  - [ ] 9.2 Verify all 6 components pass
  - [ ] 9.3 Verify all 6 hook tests pass

## Dev Notes

### Architecture Patterns

**Semantic API pattern:** A hook returns domain-meaningful functions and data, not framework primitives.

```typescript
// BEFORE (pass-through)
export function useStepCardActions() {
  const deleteStep = useMutation(api.steps.remove);
  return { deleteStep };
}

// AFTER (semantic)
export function useStepCardActions() {
  const _deleteStep = useMutation(api.steps.remove);
  return {
    deleteStep: async (stepId: Id<"steps">) => { await _deleteStep({ stepId }); },
  };
}
```

**Test pattern:** Component tests mock the hook, hook tests mock Convex.

```typescript
// Component test -- mocks hook
vi.mock("@/hooks/useStepCardActions", () => ({
  useStepCardActions: () => ({ deleteStep: vi.fn() })
}));

// Hook test -- mocks Convex
vi.mock("convex/react", () => ({ useMutation: vi.fn() }));
```

**Key Files to Read First:**
- All 6 hooks in `dashboard/hooks/`
- All 6 component test files
- `dashboard/tests/architecture.test.ts` -- existing guardrails

### Project Structure Notes

**Files to MODIFY:**
- `dashboard/hooks/useTaskInputData.ts`
- `dashboard/hooks/useAgentConfigSheetData.ts`
- `dashboard/hooks/useTagsPanelData.ts`
- `dashboard/hooks/useSearchBarFilters.ts`
- `dashboard/hooks/useStepCardActions.ts`
- `dashboard/hooks/useAgentSidebarItemState.ts`
- All 6 component test files
- `dashboard/tests/architecture.test.ts`

**Files to CREATE:**
- `dashboard/hooks/__tests__/useTaskInputData.test.ts`
- `dashboard/hooks/__tests__/useAgentConfigSheetData.test.ts`
- `dashboard/hooks/__tests__/useTagsPanelData.test.ts`
- `dashboard/hooks/__tests__/useSearchBarFilters.test.ts`
- `dashboard/hooks/__tests__/useStepCardActions.test.ts`
- `dashboard/hooks/__tests__/useAgentSidebarItemState.test.ts`

### References

- [Source: dashboard/hooks/] -- current feature hooks
- [Source: dashboard/tests/architecture.test.ts] -- existing guardrails
- [Source: docs/ARCHITECTURE.md] -- dashboard architecture section

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
