# Human Step Free Transitions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow human steps to move freely across statuses while keeping the parent task and execution plan synchronized with the current real step state.

**Architecture:** The change stays in the Convex step mutation layer. `manualMoveStep` becomes the canonical source of truth for human step transitions, updates the matching execution-plan snapshot, and recomputes the parent task status from all live steps after each human move.

**Tech Stack:** Convex mutations, TypeScript, Vitest

---

### Task 1: Free Human Step Transitions

**Files:**
- Modify: `dashboard/convex/steps.ts`
- Test: `dashboard/convex/steps.test.ts`

**Step 1: Write the failing tests**

Add focused tests for:
- `assigned -> completed`
- `running -> assigned`
- parent task recalculation after a human move

**Step 2: Run test to verify it fails**

Run: `cd /Users/ennio/Documents/nanobot-ennio/dashboard && npx vitest run convex/steps.test.ts`
Expected: FAIL on the newly added human-transition assertions.

**Step 3: Write minimal implementation**

Change `manualMoveStep` to:
- accept any human target status supported by the schema
- sync the corresponding `executionPlan.steps[*].status`
- recompute parent task status from current live steps

**Step 4: Run test to verify it passes**

Run: `cd /Users/ennio/Documents/nanobot-ennio/dashboard && npx vitest run convex/steps.test.ts`
Expected: PASS

### Task 2: Regression Verification

**Files:**
- Test: `dashboard/hooks/useBoardColumns.test.ts`
- Test: `dashboard/components/StepCard.test.tsx`

**Step 1: Run focused regression suite**

Run: `cd /Users/ennio/Documents/nanobot-ennio/dashboard && npx vitest run convex/steps.test.ts hooks/useBoardColumns.test.ts components/StepCard.test.tsx`

**Step 2: Check formatting**

Run: `cd /Users/ennio/Documents/nanobot-ennio/dashboard && npx prettier --check convex/steps.ts convex/steps.test.ts`

**Step 3: Fix formatting if needed and rerun**

Run: `cd /Users/ennio/Documents/nanobot-ennio/dashboard && npx prettier --write convex/steps.ts convex/steps.test.ts`

