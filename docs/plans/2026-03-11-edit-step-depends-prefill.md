# Edit Step Depends Prefill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Pre-fill and allow editing of the `Depends` field when a user clicks an existing step in the execution plan canvas.

**Architecture:** Extend the existing edit flow instead of creating a parallel dependency editor. `ExecutionPlanTab` will pass the step's current dependencies and the list of eligible sibling steps into `EditStepForm`, and the save path will persist `blockedBy` updates in both review and live modes.

**Tech Stack:** React, Next.js client components, Vitest, Testing Library, Convex mutations

---

### Task 1: Write the failing regression test

**Files:**
- Modify: `dashboard/components/ExecutionPlanTab.test.tsx`

**Step 1: Write the failing test**

Add a test that:
- renders a review-mode plan with at least two steps,
- opens edit mode by clicking an existing step,
- verifies the dependency trigger reflects the current dependency selection,
- changes the dependency selection,
- saves and asserts `onLocalPlanChange` receives the updated `blockedBy`.

**Step 2: Run test to verify it fails**

Run: `npm test -- ExecutionPlanTab.test.tsx`
Expected: FAIL because `EditStepForm` does not yet expose or persist dependencies.

### Task 2: Implement minimal dependency editing support

**Files:**
- Modify: `dashboard/components/EditStepForm.tsx`
- Modify: `dashboard/features/tasks/components/ExecutionPlanTab.tsx`

**Step 1: Add dependency UI + state to EditStepForm**

Mirror the existing dependency picker pattern from `AddStepForm`:
- accept existing steps and default selected dependency ids,
- initialize local `blockedByIds`,
- exclude the current step from the selectable dependency list,
- include the selected ids in `onSave`.

**Step 2: Wire the edit flow in ExecutionPlanTab**

- include `blockedBy` on the computed `editingStep`,
- pass dependency options into `EditStepForm`,
- update review-mode `localPlan` and live-mode `updateStep` mutation with dependency changes.

**Step 3: Run test to verify it passes**

Run: `npm test -- ExecutionPlanTab.test.tsx`
Expected: PASS

### Task 3: Verify surrounding plan UI suites

**Files:**
- Test: `dashboard/components/ExecutionPlanTab.test.tsx`
- Test: `dashboard/components/TaskDetailSheet.test.tsx`
- Test: `dashboard/features/tasks/components/PlanReviewPanel.test.tsx`

**Step 1: Re-run focused verification**

Run: `npm test -- ExecutionPlanTab.test.tsx TaskDetailSheet.test.tsx PlanReviewPanel.test.tsx`
Expected: PASS
