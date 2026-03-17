# Convex Function Calls Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce Convex function call volume by eliminating global steps subscription and replacing full table scans with indexed queries.

**Architecture:** Three targeted changes — two backend (replace `collect()` with indexed queries in `steps.listByBoard` and `tasks.listByBoard`) and one frontend (scope `steps.listAll` subscription in KanbanBoard to the active board using `steps.listByBoard`).

**Tech Stack:** Convex (TypeScript backend), Next.js React (frontend), vitest (tests)

---

## Task 1: Fix `steps.listByBoard` backend — use indexes instead of full scans

**Files:**
- Modify: `dashboard/convex/steps.ts:192-218`

**Context:**
Current code does `ctx.db.query("tasks").collect()` + `ctx.db.query("steps").collect()` — two full table scans.
The schema has `by_boardId` on tasks and `by_taskId` on steps. Use them.

**Step 1: Open the file and find `listByBoard`**

Read `dashboard/convex/steps.ts` lines 192–218.

**Step 2: Replace the `listByBoard` handler**

Replace lines 192–218 with:

```typescript
export const listByBoard = query({
  args: {
    boardId: v.id("boards"),
    includeNoBoardId: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Use by_boardId index instead of full tasks scan
    const boardTasks = await ctx.db
      .query("tasks")
      .withIndex("by_boardId", (q) => q.eq("boardId", args.boardId))
      .filter((q) => q.neq(q.field("status"), "deleted"))
      .collect();

    const taskIds: Set<Id<"tasks">> = new Set(boardTasks.map((t) => t._id));

    // Orphan tasks (no boardId) — needed for the default board
    if (args.includeNoBoardId) {
      const NON_DELETED_STATUSES = [
        "planning", "ready", "failed", "inbox", "assigned",
        "in_progress", "review", "done", "retrying", "crashed",
      ] as const;
      for (const status of NON_DELETED_STATUSES) {
        const batch = await ctx.db
          .query("tasks")
          .withIndex("by_status", (q) => q.eq("status", status))
          .filter((q) => q.eq(q.field("boardId"), undefined))
          .collect();
        for (const task of batch) {
          taskIds.add(task._id);
        }
      }
    }

    if (taskIds.size === 0) return [];

    // Use by_taskId index per task instead of full steps scan
    const stepBatches = await Promise.all(
      Array.from(taskIds).map((taskId) =>
        ctx.db
          .query("steps")
          .withIndex("by_taskId", (q) => q.eq("taskId", taskId))
          .collect()
      )
    );
    return stepBatches.flat();
  },
});
```

**Step 3: Verify TypeScript compiles**

```bash
cd dashboard && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to steps.ts.

**Step 4: Commit**

```bash
git add dashboard/convex/steps.ts
git commit -m "perf(convex): fix steps.listByBoard to use indexes instead of full table scans"
```

---

## Task 2: Fix `tasks.listByBoard` — remove full scan in `includeNoBoardId` branch

**Files:**
- Modify: `dashboard/convex/tasks.ts:234-256`

**Context:**
The `includeNoBoardId: true` branch at line 247 does `ctx.db.query("tasks").collect()` — reads every task to find orphans. Replace with status-indexed queries.

**Step 1: Open the file and find `listByBoard`**

Read `dashboard/convex/tasks.ts` lines 234–256.

**Step 2: Replace the `listByBoard` handler**

Replace lines 234–256 with:

```typescript
export const listByBoard = query({
  args: {
    boardId: v.id("boards"),
    includeNoBoardId: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const boardTasks = await ctx.db
      .query("tasks")
      .withIndex("by_boardId", (q) => q.eq("boardId", args.boardId))
      .collect();

    let result = boardTasks.filter((t) => t.status !== "deleted");

    if (args.includeNoBoardId) {
      const NON_DELETED_STATUSES = [
        "planning", "ready", "failed", "inbox", "assigned",
        "in_progress", "review", "done", "retrying", "crashed",
      ] as const;
      const ids = new Set(result.map((t) => t._id));
      for (const status of NON_DELETED_STATUSES) {
        const batch = await ctx.db
          .query("tasks")
          .withIndex("by_status", (q) => q.eq("status", status))
          .filter((q) => q.eq(q.field("boardId"), undefined))
          .collect();
        for (const task of batch) {
          if (!ids.has(task._id)) {
            result.push(task);
            ids.add(task._id);
          }
        }
      }
    }

    return result;
  },
});
```

**Step 3: Verify TypeScript compiles**

```bash
cd dashboard && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

**Step 4: Commit**

```bash
git add dashboard/convex/tasks.ts
git commit -m "perf(convex): fix tasks.listByBoard to use status index for orphan tasks"
```

---

## Task 3: Scope steps subscription in KanbanBoard

**Files:**
- Modify: `dashboard/components/KanbanBoard.tsx:87`

**Context:**
Line 87: `const allStepsResult = useQuery(api.steps.listAll);` — always active, no skip.
When `activeBoardId` is set (the common case), subscribe only to steps for that board.
When no board is selected, fall back to `listAll`.

**Step 1: Read KanbanBoard.tsx**

Read `dashboard/components/KanbanBoard.tsx` lines 53–215.

**Step 2: Replace line 87 — scope the steps subscription**

Replace:
```tsx
const allStepsResult = useQuery(api.steps.listAll);
```

With:
```tsx
const boardStepsResult = useQuery(
  api.steps.listByBoard,
  activeBoardId
    ? { boardId: activeBoardId, includeNoBoardId: isDefaultBoard }
    : "skip"
);
const globalStepsResult = useQuery(
  api.steps.listAll,
  activeBoardId ? "skip" : {}
);
const allStepsResult = activeBoardId ? boardStepsResult : globalStepsResult;
```

**Step 3: Verify the loading guard still works**

Line 212 checks `allStepsResult === undefined`. With the new code, `allStepsResult` is either `boardStepsResult` or `globalStepsResult`, both of which are `undefined` while loading and a `Doc<"steps">[]` when ready. No change needed to the guard.

**Step 4: Verify TypeScript compiles**

```bash
cd dashboard && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

**Step 5: Start dev server and smoke test**

```bash
cd dashboard && npm run dev
```

- Open the board in browser
- Verify tasks and steps render correctly
- Verify step status indicators appear on task cards
- Switch boards and confirm steps update correctly
- Confirm no console errors

**Step 6: Commit**

```bash
git add dashboard/components/KanbanBoard.tsx
git commit -m "perf(dashboard): scope steps subscription to active board in KanbanBoard"
```

---

## Verification

After all tasks:

```bash
cd dashboard && npx tsc --noEmit
```

Expected: zero errors.

Open dashboard in browser, run `npx convex dev` and check logs for any query errors.
