# Conversation Tabs Open At Bottom Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make both the main `Thread` tab and the `Lead Agent Conversation` view open directly at the bottom of their message history.

**Architecture:** Reuse the existing end-of-list sentinels instead of manipulating scroll containers directly. Add explicit "tab/view opened" effects that jump instantly to the bottom, while keeping the existing smooth auto-scroll behavior for newly arriving messages.

**Tech Stack:** React, Next.js client components, Radix Tabs/ScrollArea, Vitest, Testing Library

---

### Task 1: Write failing tests for open-at-bottom behavior

**Files:**
- Modify: `dashboard/components/TaskDetailSheet.test.tsx`
- Modify: `dashboard/features/tasks/components/PlanReviewPanel.test.tsx`

**Step 1: Add the Thread tab regression test**

Write a test that:
- renders a task with thread messages,
- switches away from `Thread`,
- switches back to `Thread`,
- asserts the thread sentinel was scrolled into view immediately on tab open.

**Step 2: Add the Lead Agent Conversation regression test**

Write a test that:
- mounts `PlanReviewPanel` with timeline messages,
- asserts the end sentinel is scrolled into view immediately on mount/open,
- keeps the existing smooth-scroll assertion for newly added messages.

**Step 3: Run tests to verify they fail**

Run: `npm test -- TaskDetailSheet.test.tsx PlanReviewPanel.test.tsx`
Expected: FAIL because tab/view opening does not currently force an immediate bottom alignment.

### Task 2: Implement minimal tab-open bottom alignment

**Files:**
- Modify: `dashboard/features/tasks/components/TaskDetailSheet.tsx`
- Modify: `dashboard/features/tasks/components/PlanReviewPanel.tsx`

**Step 1: Update Thread tab behavior**

Add an effect in `TaskDetailSheet` that watches `activeTab` and, when the tab becomes `thread`, calls the existing thread sentinel scroll without smooth behavior.

**Step 2: Update Lead Agent Conversation mount behavior**

Split `PlanReviewPanel` scrolling into:
- an initial mount/open effect that scrolls immediately to bottom,
- a subsequent message-count effect that keeps smooth scrolling for new messages only.

**Step 3: Run tests to verify they pass**

Run: `npm test -- TaskDetailSheet.test.tsx PlanReviewPanel.test.tsx`
Expected: PASS

### Task 3: Verify the related suites

**Files:**
- Test: `dashboard/components/TaskDetailSheet.test.tsx`
- Test: `dashboard/features/tasks/components/PlanReviewPanel.test.tsx`
- Test: `dashboard/components/ExecutionPlanTab.test.tsx`
- Test: `dashboard/components/AddStepForm.test.tsx`

**Step 1: Re-run focused verification**

Run: `npm test -- ExecutionPlanTab.test.tsx TaskDetailSheet.test.tsx PlanReviewPanel.test.tsx AddStepForm.test.tsx`
Expected: PASS
