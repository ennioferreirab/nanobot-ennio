# Lead Agent Conversation Auto-Scroll Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Lead Agent Conversation panel scroll to the newest message whenever a new conversation message is added.

**Architecture:** Keep the change local to the plan review conversation UI. Add a scroll sentinel at the end of the rendered timeline in the panel and trigger `scrollIntoView` when the filtered conversation message count increases. Cover the behavior with a focused UI test that rerenders the sheet with an additional lead-agent conversation message.

**Tech Stack:** React, Next.js client components, Radix ScrollArea, Vitest, Testing Library

---

### Task 1: Add a failing UI test for conversation auto-scroll

**Files:**
- Modify: `dashboard/components/TaskDetailSheet.test.tsx`
- Test: `dashboard/components/TaskDetailSheet.test.tsx`

**Step 1: Write the failing test**

Add a test that:
- renders the execution plan tab in `Lead Agent Conversation` mode,
- spies on `Element.prototype.scrollIntoView`,
- rerenders with one extra message marked `leadAgentConversation: true`,
- expects the scroll call to happen after the new message appears.

**Step 2: Run test to verify it fails**

Run: `npm test -- TaskDetailSheet.test.tsx`
Expected: FAIL because the panel does not currently trigger a scroll on new timeline messages.

### Task 2: Implement minimal auto-scroll in the panel

**Files:**
- Modify: `dashboard/features/tasks/components/PlanReviewPanel.tsx`

**Step 1: Add minimal implementation**

Add:
- a ref for the end-of-list sentinel,
- a ref storing the previous timeline message count,
- an effect that calls `scrollIntoView({ behavior: "smooth" })` when the count increases,
- a sentinel element after the mapped timeline messages.

**Step 2: Run test to verify it passes**

Run: `npm test -- TaskDetailSheet.test.tsx`
Expected: PASS for the new test and no regressions in nearby panel tests.

### Task 3: Verify the targeted suite

**Files:**
- Test: `dashboard/components/TaskDetailSheet.test.tsx`

**Step 1: Re-run the focused suite**

Run: `npm test -- TaskDetailSheet.test.tsx`
Expected: PASS
