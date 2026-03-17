# Merged Task Status Cascade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist merged child tasks to `done` when the merged parent finishes, and restore each child to its pre-merge status when the merged parent is deleted.

**Architecture:** The status inheritance is implemented in Convex task mutations. Each merged child stores its pre-merge status snapshot on the child itself, the parent completion path cascades `done` to linked children, and parent deletion restores children from that snapshot while clearing the merge lock.

**Tech Stack:** Convex mutations, TypeScript, Vitest

---

### Task 1: Persist Child Merge Snapshots

**Files:**
- Modify: `dashboard/convex/schema.ts`
- Modify: `dashboard/convex/tasks.ts`
- Test: `dashboard/convex/tasks.test.ts`

**Step 1: Write the failing tests**

Add tests proving:
- merged child tasks store their pre-merge status snapshot
- merged parent completion cascades `done` to child tasks
- merged parent delete restores child tasks from the snapshot

**Step 2: Run test to verify it fails**

Run: `cd /Users/ennio/Documents/nanobot-ennio/dashboard && npx vitest run convex/tasks.test.ts`
Expected: FAIL on the new merge cascade assertions.

**Step 3: Write minimal implementation**

Add a child snapshot field and use it in:
- `createMergedTask`
- merged-parent completion path
- `softDelete`

**Step 4: Run test to verify it passes**

Run: `cd /Users/ennio/Documents/nanobot-ennio/dashboard && npx vitest run convex/tasks.test.ts`
Expected: PASS

### Task 2: Regression Verification

**Files:**
- Test: `dashboard/convex/tasks.test.ts`

**Step 1: Run focused regression suite**

Run: `cd /Users/ennio/Documents/nanobot-ennio/dashboard && npx vitest run convex/tasks.test.ts`

**Step 2: Check formatting**

Run: `cd /Users/ennio/Documents/nanobot-ennio/dashboard && npx prettier --check convex/tasks.ts convex/tasks.test.ts convex/schema.ts`
