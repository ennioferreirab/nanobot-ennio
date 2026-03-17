# Waiting Human Review Column Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep human steps visible and actionable in the Review column without moving the parent task into `review`.

**Architecture:** The primary fix stays in the Convex step mutation layer: moving a human step to `waiting_human` must keep the parent task `in_progress`. A small board fallback keeps existing stuck tasks actionable by still rendering `waiting_human` step groups even if the parent task is already `review`.

**Tech Stack:** Convex mutations, React hooks, TypeScript, Vitest

---

### Task 1: Backend Waiting Human Semantics

**Files:**
- Modify: `dashboard/convex/steps.ts`
- Test: `dashboard/convex/steps.test.ts`

**Step 1: Write the failing test**

Add a test proving `manualMoveStep(..., "waiting_human")` keeps the parent task in `in_progress`.

**Step 2: Run test to verify it fails**

Run: `cd /Users/ennio/Documents/nanobot-ennio/dashboard && npx vitest run convex/steps.test.ts`
Expected: FAIL on the new waiting-human assertion.

**Step 3: Write minimal implementation**

Adjust the human parent-task status derivation so `waiting_human` does not push the task to `review`.

**Step 4: Run test to verify it passes**

Run: `cd /Users/ennio/Documents/nanobot-ennio/dashboard && npx vitest run convex/steps.test.ts`
Expected: PASS

### Task 2: Board Fallback For Existing Stuck Tasks

**Files:**
- Modify: `dashboard/hooks/useBoardColumns.ts`
- Test: `dashboard/hooks/useBoardColumns.test.ts`

**Step 1: Write the failing test**

Add a test proving a `waiting_human` step still appears as a step group in Review even when the parent task is already `review`.

**Step 2: Run test to verify it fails**

Run: `cd /Users/ennio/Documents/nanobot-ennio/dashboard && npx vitest run hooks/useBoardColumns.test.ts`
Expected: FAIL on the new review-task waiting-human regression.

**Step 3: Write minimal implementation**

Allow `waiting_human` steps to bypass the current “skip review tasks” filter.

**Step 4: Run test to verify it passes**

Run: `cd /Users/ennio/Documents/nanobot-ennio/dashboard && npx vitest run hooks/useBoardColumns.test.ts`
Expected: PASS

### Task 3: Regression Verification

**Files:**
- Test: `dashboard/convex/steps.test.ts`
- Test: `dashboard/hooks/useBoardColumns.test.ts`
- Test: `dashboard/components/StepCard.test.tsx`

**Step 1: Run focused regression suite**

Run: `cd /Users/ennio/Documents/nanobot-ennio/dashboard && npx vitest run convex/steps.test.ts hooks/useBoardColumns.test.ts components/StepCard.test.tsx`

**Step 2: Check formatting**

Run: `cd /Users/ennio/Documents/nanobot-ennio/dashboard && npx prettier --check convex/steps.ts convex/steps.test.ts hooks/useBoardColumns.ts hooks/useBoardColumns.test.ts`
