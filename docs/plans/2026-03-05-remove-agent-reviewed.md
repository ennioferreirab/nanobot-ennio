# Remove `agent_reviewed` Trust Level — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the `agent_reviewed` trust level, simplifying the system to only `autonomous` and `human_approved`.

**Architecture:** Delete `agent_reviewed` from every enum, schema, constant, UI toggle, and branching logic. Migrate existing Convex documents with `trustLevel: "agent_reviewed"` to `"human_approved"`. Remove the `auto_review` task mode from the dashboard UI (2-state toggle: autonomous ↔ supervised).

**Tech Stack:** Python (mc/), TypeScript (dashboard/ — Convex + React), pytest, vitest

---

### Task 1: Python Backend — Remove `AGENT_REVIEWED` from `TrustLevel` enum

**Files:**
- Modify: `mc/types.py:108`
- Modify: `mc/cli_config.py:116`

**Step 1: Remove the enum member**

In `mc/types.py`, delete line 108 (`AGENT_REVIEWED = "agent_reviewed"`):

```python
class TrustLevel(StrEnum):
    """Trust levels for task oversight. Matches Convex tasks.trustLevel union type."""
    AUTONOMOUS = "autonomous"
    HUMAN_APPROVED = "human_approved"
```

**Step 2: Update CLI help text**

In `mc/cli_config.py:116`, change the help string:

```python
    trust_level: str = typer.Option(
        None,
        "--trust-level",
        help="Trust level: autonomous|human_approved",
    ),
```

**Step 3: Run Python tests to check for breakage**

Run: `uv run pytest tests/mc/ -x -q 2>&1 | head -40`
Expected: Some test failures in `test_gateway.py` (addressed in Task 4).

**Step 4: Commit**

```bash
git add mc/types.py mc/cli_config.py
git commit -m "refactor: remove AGENT_REVIEWED from TrustLevel enum and CLI help"
```

---

### Task 2: Python Backend — Simplify orchestrator review approval logic

**Files:**
- Modify: `mc/orchestrator.py:861-882`

**Step 1: Remove the `agent_reviewed` branch**

In `mc/orchestrator.py`, replace lines 861-882. The `AGENT_REVIEWED` branch auto-completed to done; with it gone, non-autonomous always means human approval:

```python
        if trust_level == TrustLevel.HUMAN_APPROVED:
            await asyncio.to_thread(
                self._bridge.send_message,
                task_id,
                "system",
                AuthorType.SYSTEM,
                "Agent review passed. Awaiting human approval.",
                MessageType.SYSTEM_EVENT,
            )
            await asyncio.to_thread(
                self._bridge.create_activity,
                ActivityEventType.HITL_REQUESTED,
                f"Human approval requested for '{title}'",
                task_id,
            )
        else:
            # autonomous — mark done directly
            await asyncio.to_thread(
                self._bridge.update_task_status,
                task_id,
                TaskStatus.DONE,
                reviewer_name,
            )
```

**Step 2: Commit**

```bash
git add mc/orchestrator.py
git commit -m "refactor: remove agent_reviewed branch from review approval logic"
```

---

### Task 3: Python Tests — Update gateway/executor tests

**Files:**
- Modify: `tests/mc/test_gateway.py:588-609`
- Modify: `tests/mc/test_gateway.py:845-858`

**Step 1: Replace `test_agent_reviewed_transitions_to_review` (lines 588-609)**

Rename and change to test `human_approved` transitions to review:

```python
    @pytest.mark.asyncio
    async def test_human_approved_transitions_to_review(self):
        """human_approved trust level should transition to 'review'."""
        from mc.executor import TaskExecutor

        mock_bridge = MagicMock()
        mock_bridge.update_task_status = MagicMock()
        mock_bridge.send_message = MagicMock()
        mock_bridge.create_activity = MagicMock()
        mock_bridge.get_agent_by_name = MagicMock(return_value=None)

        executor = TaskExecutor(mock_bridge)

        with patch("mc.executor._run_agent_on_task", new_callable=AsyncMock, return_value=("Reviewed", "mock_session_key", MagicMock())), \
             patch.object(executor, "_load_agent_config", return_value=(None, None, None)), \
             patch("asyncio.to_thread", side_effect=_to_thread_passthrough):
            await executor._execute_task(
                "task_006", "Reviewed task", "For review", "review-agent", "human_approved"
            )

        mock_bridge.update_task_status.assert_any_call(
            "task_006", "review", "review-agent", unittest_any_string()
        )
```

**Step 2: Update review transition test (lines 845-858)**

Change `trust_level` from `"agent_reviewed"` to `"human_approved"`:

```python
        task_data = {
            "title": "Review me",
            "reviewers": ["reviewer-agent"],
            "trust_level": "human_approved",
        }
```

**Step 3: Run tests**

Run: `uv run pytest tests/mc/test_gateway.py -x -q 2>&1 | head -40`
Expected: Tests pass (or only pre-existing failures remain).

**Step 4: Commit**

```bash
git add tests/mc/test_gateway.py
git commit -m "test: update gateway tests to remove agent_reviewed references"
```

---

### Task 4: Convex Schema — Remove `agent_reviewed` literal

**Files:**
- Modify: `dashboard/convex/schema.ts:41`

**Step 1: Remove the literal**

In `dashboard/convex/schema.ts`, delete line 41 (`v.literal("agent_reviewed"),`):

```typescript
    trustLevel: v.union(
      v.literal("autonomous"),
      v.literal("human_approved"),
    ),
```

**Step 2: Commit**

```bash
git add dashboard/convex/schema.ts
git commit -m "refactor: remove agent_reviewed from Convex schema trustLevel union"
```

---

### Task 5: Convex Mutation — Remove `agent_reviewed` from task creation logic

**Files:**
- Modify: `dashboard/convex/tasks.ts:130-182`

**Step 1: Remove `agent_reviewed` from type cast (lines 132-135)**

```typescript
    const trustLevel = isManual
      ? "autonomous"
      : ((args.trustLevel ?? "autonomous") as
          | "autonomous"
          | "human_approved");
```

**Step 2: Simplify activity description (line 180)**

Replace the ternary with a direct label since only `human_approved` is non-autonomous:

```typescript
    if (!isManual && trustLevel !== "autonomous") {
      description += ` (trust: human approved)`;
    }
```

**Step 3: Commit**

```bash
git add dashboard/convex/tasks.ts
git commit -m "refactor: remove agent_reviewed from task creation mutation"
```

---

### Task 6: Dashboard Constants — Remove `AGENT_REVIEWED`

**Files:**
- Modify: `dashboard/lib/constants.ts:29`

**Step 1: Remove the constant**

```typescript
export const TRUST_LEVEL = {
  AUTONOMOUS: "autonomous",
  HUMAN_APPROVED: "human_approved",
} as const;
```

**Step 2: Commit**

```bash
git add dashboard/lib/constants.ts
git commit -m "refactor: remove AGENT_REVIEWED from dashboard constants"
```

---

### Task 7: TaskCard — Simplify trust level display

**Files:**
- Modify: `dashboard/components/TaskCard.tsx:193-197`

**Step 1: Replace the ternary**

Since non-autonomous is always `human_approved` now:

```tsx
            {task.trustLevel !== "autonomous" && (
              <span className="inline-flex items-center gap-1">
                <RefreshCw className="h-3 w-3 text-amber-500" />
                Human review
              </span>
            )}
```

**Step 2: Commit**

```bash
git add dashboard/components/TaskCard.tsx
git commit -m "refactor: simplify TaskCard trust level display"
```

---

### Task 8: TaskCard Tests — Remove `agent_reviewed` test case

**Files:**
- Modify: `dashboard/components/TaskCard.test.tsx:119-127`

**Step 1: Delete the `agent_reviewed` test**

Delete lines 119-127 (the `"shows review indicator for agent_reviewed tasks"` test). The `"shows HITL badge for human_approved tasks"` test (line 129+) already covers the remaining non-autonomous case.

**Step 2: Run tests**

Run: `cd dashboard && npx vitest run components/TaskCard.test.tsx 2>&1 | tail -20`
Expected: PASS

**Step 3: Commit**

```bash
git add dashboard/components/TaskCard.test.tsx
git commit -m "test: remove agent_reviewed test case from TaskCard tests"
```

---

### Task 9: TaskInput — Remove `auto_review` task mode

**Files:**
- Modify: `dashboard/components/TaskInput.tsx:17-18,33,101-102,185-186,404-419`

**Step 1: Remove `ShieldCheck` import (line 17)**

```tsx
import { Bot, Paperclip, User, X, Eye, Zap } from "lucide-react";
```

Delete line 18 (the `// ShieldCheck used in taskMode=auto_review button` comment).

**Step 2: Simplify taskMode state type (line 33)**

```tsx
  const [taskMode, setTaskMode] = useState<"autonomous" | "supervised">("autonomous");
```

**Step 3: Remove `auto_review` → `agent_reviewed` mapping (lines 101-102 and 185-186)**

In both the Enter-submit and button-submit code paths, remove the `auto_review` line. The remaining logic already handles `supervised`:

```tsx
        args.supervisionMode = taskMode === "supervised" ? "supervised" : "autonomous";
        if (selectedAgent && selectedAgent !== "auto") {
```

(Same change in both locations — lines ~101-102 and ~185-186. Just delete the `if (taskMode === "auto_review")` line from each.)

**Step 4: Simplify the mode toggle button (lines 404-419)**

Replace the 3-state toggle with a 2-state toggle:

```tsx
                <button
                  type="button"
                  title={taskMode === "autonomous" ? "Autonomous" : "Supervised"}
                  onClick={() =>
                    setTaskMode((prev) =>
                      prev === "autonomous" ? "supervised" : "autonomous"
                    )
                  }
                  className={`inline-flex items-center gap-1.5 rounded-md text-sm font-medium h-9 px-4 transition-all duration-200 ${
                    taskMode === "supervised"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border border-amber-300 dark:border-amber-700"
                      : "border border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  {taskMode === "supervised" ? <Eye className="h-5 w-5" /> : <Zap className="h-5 w-5" />}
                  <span>{taskMode === "supervised" ? "Supervised" : "Autonomous"}</span>
                </button>
```

**Step 5: Commit**

```bash
git add dashboard/components/TaskInput.tsx
git commit -m "refactor: remove auto_review task mode from TaskInput"
```

---

### Task 10: TaskInput Tests — Remove `agent_reviewed` test cases

**Files:**
- Modify: `dashboard/components/TaskInput.test.tsx:269-335`

**Step 1: Delete the 3 agent_reviewed-specific tests**

Delete these tests (lines 269-335):
- `"shows reviewer checkboxes when trust level is agent_reviewed"` (269-282)
- `"hides reviewer section when trust level is changed back to autonomous"` (284-297)
- `"submits with trustLevel and reviewers when configured"` (309-335)

Keep the `"shows human approval checkbox when trust level is human_approved"` test (299-307) — it covers the remaining non-autonomous case.

**Step 2: Run tests**

Run: `cd dashboard && npx vitest run components/TaskInput.test.tsx 2>&1 | tail -20`
Expected: PASS

**Step 3: Commit**

```bash
git add dashboard/components/TaskInput.test.tsx
git commit -m "test: remove agent_reviewed test cases from TaskInput tests"
```

---

### Task 11: Vendor Skill Doc — Remove `agent_reviewed` row

**Files:**
- Modify: `vendor/nanobot/nanobot/skills/mc/SKILL.md:77`

**Step 1: Delete line 77**

Remove the `agent_reviewed` row from the trust level table:

```markdown
## Trust Levels

| Level | Meaning | Use when |
|-------|---------|----------|
| `autonomous` | No review needed (default) | Routine tasks, low risk |
| `human_approved` | Human must approve/deny in review | Critical tasks, deployments |
```

**Step 2: Commit**

```bash
git add vendor/nanobot/nanobot/skills/mc/SKILL.md
git commit -m "docs: remove agent_reviewed from MC skill documentation"
```

---

### Task 12: Convex Data Migration — Convert existing `agent_reviewed` tasks

**Files:**
- Create: `dashboard/convex/migrations.ts`

**Step 1: Write a one-shot migration mutation**

```typescript
import { internalMutation } from "./_generated/server";

/**
 * One-shot migration: convert all tasks with trustLevel "agent_reviewed"
 * to "human_approved". Run once via Convex dashboard, then delete this file.
 */
export const migrateAgentReviewedToHumanApproved = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tasks = await ctx.db.query("tasks").collect();
    let count = 0;
    for (const task of tasks) {
      if ((task as any).trustLevel === "agent_reviewed") {
        await ctx.db.patch(task._id, { trustLevel: "human_approved" as any });
        count++;
      }
    }
    return { migrated: count };
  },
});
```

> **Note:** This migration must run BEFORE deploying the schema change (Task 4) to production. Run it via the Convex dashboard's function runner. After confirming 0 remaining `agent_reviewed` tasks, delete this file.

**Step 2: Commit**

```bash
git add dashboard/convex/migrations.ts
git commit -m "chore: add one-shot migration for agent_reviewed → human_approved"
```

---

### Task 13: Final Verification

**Step 1: Grep for any remaining references**

Run: `grep -r "agent_review" --include="*.py" --include="*.ts" --include="*.tsx" --include="*.md" . | grep -v "_bmad-output/" | grep -v "node_modules/" | grep -v ".md:"`
Expected: No matches (only `_bmad-output/` historical artifacts and the migration file).

**Step 2: Run full Python test suite**

Run: `uv run pytest tests/mc/ -x -q 2>&1 | tail -20`
Expected: Pass (or only pre-existing failures).

**Step 3: Run full dashboard test suite**

Run: `cd dashboard && npx vitest run 2>&1 | tail -20`
Expected: Pass.

**Step 4: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "refactor: complete removal of agent_reviewed trust level"
```
