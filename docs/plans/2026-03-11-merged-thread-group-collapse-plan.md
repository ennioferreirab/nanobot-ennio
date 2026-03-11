# Merged Thread Group Collapse Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users collapse the entire sticky merged-thread group from the Thread tab while keeping the header visible and the live thread feed unchanged.

**Architecture:** The change stays local to the task detail sheet UI. A single React state controls whether the sticky merged-thread block renders only its header or the full list of merged-source thread sections. The live-message list and scroll sentinel remain untouched.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, Testing Library

---

### Task 1: Lock The Group Toggle In Tests

**Files:**
- Modify: `dashboard/components/TaskDetailSheet.test.tsx`

**Step 1: Write the failing test**

Add a test that renders merged source threads, verifies the group is expanded by default, clicks `Collapse`, confirms the source thread labels disappear while the sticky header remains, then clicks `Expand` and confirms they return.

**Step 2: Run test to verify it fails**

Run: `cd /Users/ennio/Documents/nanobot-ennio/dashboard && npx vitest run components/TaskDetailSheet.test.tsx`
Expected: FAIL because the sticky header has no group toggle yet.

**Step 3: Write minimal implementation**

Add local collapsed state, render a sticky header row with a toggle button, and conditionally render the merged-source thread list when expanded.

**Step 4: Run test to verify it passes**

Run: `cd /Users/ennio/Documents/nanobot-ennio/dashboard && npx vitest run components/TaskDetailSheet.test.tsx`
Expected: PASS

### Task 2: Verification

**Files:**
- Test: `dashboard/components/TaskDetailSheet.test.tsx`
- Modify: `dashboard/features/tasks/components/TaskDetailSheet.tsx`

**Step 1: Run focused regression suite**

Run: `cd /Users/ennio/Documents/nanobot-ennio/dashboard && npx vitest run components/TaskDetailSheet.test.tsx`

**Step 2: Check formatting**

Run: `cd /Users/ennio/Documents/nanobot-ennio/dashboard && npx prettier --check features/tasks/components/TaskDetailSheet.tsx components/TaskDetailSheet.test.tsx`
