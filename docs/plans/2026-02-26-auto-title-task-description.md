# Auto-Title + Task Description Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add description field to task creation, with optional AI-generated titles using the standard-low tier model.

**Architecture:** Global setting `auto_title_enabled` controls whether TaskInput shows a title field or auto-generates it. Tasks created with `autoTitle: true` get a placeholder title; the gateway orchestrator generates the real title via the standard-low tier LLM before planning. Agent dispatch formats task as `<title>...</title><description>...</description>`.

**Tech Stack:** Convex (schema, mutations), React (TaskInput, SettingsPanel), Python (orchestrator, executor, provider_factory)

---

### Task 1: Schema — add autoTitle field to tasks

**Files:**
- Modify: `dashboard/convex/schema.ts:55` (after `isFavorite`)

**Step 1: Add the field**

In `dashboard/convex/schema.ts`, add after line 55 (`isFavorite: v.optional(v.boolean()),`):

```ts
autoTitle: v.optional(v.boolean()),
```

**Step 2: Run Convex codegen to verify schema compiles**

Run: `cd dashboard && npx convex dev --once`
Expected: Schema pushes without errors.

**Step 3: Commit**

```bash
git add dashboard/convex/schema.ts
git commit -m "feat: add autoTitle field to tasks schema"
```

---

### Task 2: Mutation — add autoTitle to create args + add updateTitle mutation

**Files:**
- Modify: `dashboard/convex/tasks.ts:94-115` (create mutation args)
- Modify: `dashboard/convex/tasks.ts` (add new updateTitle mutation at end)

**Step 1: Add autoTitle to create mutation args**

In `dashboard/convex/tasks.ts`, in the `create` mutation args block (after `cronParentTaskId` at line ~104), add:

```ts
autoTitle: v.optional(v.boolean()),
```

In the handler, after the `...(args.files ? { files: args.files } : {})` spread (line ~161), add:

```ts
...(args.autoTitle ? { autoTitle: true } : {}),
```

**Step 2: Add updateTitle mutation**

Append to `dashboard/convex/tasks.ts`:

```ts
/**
 * Update a task's title. Used by the gateway auto-title generator.
 */
export const updateTitle = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new ConvexError("Task not found");
    await ctx.db.patch(args.taskId, {
      title: args.title,
      autoTitle: undefined,
      updatedAt: new Date().toISOString(),
    });
  },
});
```

**Step 3: Run Convex codegen**

Run: `cd dashboard && npx convex dev --once`
Expected: Compiles without errors.

**Step 4: Commit**

```bash
git add dashboard/convex/tasks.ts
git commit -m "feat: add autoTitle to create args + updateTitle mutation"
```

---

### Task 3: Settings — Auto Title toggle in SettingsPanel

**Files:**
- Modify: `dashboard/components/SettingsPanel.tsx:19-23` (add default)
- Modify: `dashboard/components/SettingsPanel.tsx:177-179` (add toggle before Separator before ModelTierSettings)

**Step 1: Add default**

In `dashboard/components/SettingsPanel.tsx`, add to the `DEFAULTS` object (line ~19):

```ts
auto_title_enabled: "false",
```

**Step 2: Add toggle UI**

Import `Switch` from shadcn:

```ts
import { Switch } from "@/components/ui/switch";
```

Before the `<Separator />` that precedes `<ModelTierSettings />` (line ~179), add:

```tsx
<div className="flex items-center justify-between">
  <div className="space-y-0.5">
    <label className="text-sm font-medium">Auto Title</label>
    <p className="text-xs text-muted-foreground">
      Generate task titles automatically using AI
    </p>
  </div>
  <div className="flex items-center gap-2">
    {savedFields["auto_title_enabled"] && (
      <Check className="h-4 w-4 text-green-500 transition-opacity" />
    )}
    <Switch
      checked={getValue("auto_title_enabled") === "true"}
      onCheckedChange={(checked) =>
        handleSave("auto_title_enabled", checked ? "true" : "false")
      }
    />
  </div>
</div>
```

**Step 3: Verify Switch component exists**

Run: `ls dashboard/components/ui/switch.tsx`
If missing, run: `cd dashboard && npx shadcn@latest add switch`

**Step 4: Verify in browser**

Open Settings panel — the Auto Title toggle should appear. Toggle it on/off and verify it persists.

**Step 5: Commit**

```bash
git add dashboard/components/SettingsPanel.tsx
git commit -m "feat: add Auto Title toggle to settings"
```

---

### Task 4: UI — Add description textarea + auto-title logic to TaskInput

**Files:**
- Modify: `dashboard/components/TaskInput.tsx`

**Step 1: Add state and settings query**

Add state for description and read the auto-title setting. Near the existing state declarations (line ~32):

```tsx
const [description, setDescription] = useState("");
```

Add settings query after the existing queries (line ~47):

```tsx
const autoTitleSetting = useQuery(api.settings.get, { key: "auto_title_enabled" });
const isAutoTitle = autoTitleSetting === "true";
```

**Step 2: Update handleSubmit**

Replace the current `handleSubmit` function (lines 49-129) to handle both modes:

```tsx
const handleSubmit = async () => {
  if (isAutoTitle) {
    // Auto-title mode: description is required
    const trimmedDesc = description.trim();
    if (!trimmedDesc) {
      setError("Task description required");
      return;
    }
    setError("");

    const placeholderTitle = trimmedDesc.length > 80
      ? trimmedDesc.substring(0, 80) + "..."
      : trimmedDesc;

    const args: {
      title: string;
      description?: string;
      autoTitle?: boolean;
      tags?: string[];
      assignedAgent?: string;
      trustLevel?: string;
      supervisionMode?: "autonomous" | "supervised";
      reviewers?: string[];
      isManual?: boolean;
      boardId?: Id<"boards">;
      files?: Array<{ name: string; type: string; size: number; subfolder: string; uploadedAt: string }>;
    } = {
      title: placeholderTitle,
      description: trimmedDesc,
      autoTitle: true,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
      boardId: activeBoardId ?? undefined,
    };
    if (isManual) {
      args.isManual = true;
      args.supervisionMode = "autonomous";
    } else {
      args.supervisionMode = supervisionMode;
      if (selectedAgent && selectedAgent !== "auto") {
        args.assignedAgent = selectedAgent;
      }
      if (trustLevel !== "autonomous") {
        args.trustLevel = trustLevel;
      }
      if (selectedReviewers.length > 0) {
        args.reviewers = selectedReviewers;
      }
    }
    if (pendingFiles.length > 0) {
      args.files = pendingFiles.map((f) => ({
        name: f.name,
        type: f.type || "application/octet-stream",
        size: f.size,
        subfolder: "attachments",
        uploadedAt: new Date().toISOString(),
      }));
    }

    try {
      const taskId = await createTask(args);
      setDescription("");
      setSelectedAgent("");
      setTrustLevel("autonomous");
      setSupervisionMode("autonomous");
      setSelectedReviewers([]);
      setIsExpanded(false);

      if (pendingFiles.length > 0) {
        const formData = new FormData();
        for (const file of pendingFiles) {
          formData.append("files", file, file.name);
        }
        try {
          const res = await fetch(`/api/tasks/${taskId}/files`, {
            method: "POST",
            body: formData,
          });
          if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
          setPendingFiles([]);
        } catch {
          setError("Task created, but file upload to disk failed. Please retry.");
        }
      }
    } catch {
      setError("Failed to create task. Please try again.");
    }
  } else {
    // Manual title mode: title required, description optional
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Task title required");
      return;
    }
    setError("");

    const args: {
      title: string;
      description?: string;
      tags?: string[];
      assignedAgent?: string;
      trustLevel?: string;
      supervisionMode?: "autonomous" | "supervised";
      reviewers?: string[];
      isManual?: boolean;
      boardId?: Id<"boards">;
      files?: Array<{ name: string; type: string; size: number; subfolder: string; uploadedAt: string }>;
    } = {
      title: trimmed,
      description: description.trim() || undefined,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
      boardId: activeBoardId ?? undefined,
    };
    if (isManual) {
      args.isManual = true;
      args.supervisionMode = "autonomous";
    } else {
      args.supervisionMode = supervisionMode;
      if (selectedAgent && selectedAgent !== "auto") {
        args.assignedAgent = selectedAgent;
      }
      if (trustLevel !== "autonomous") {
        args.trustLevel = trustLevel;
      }
      if (selectedReviewers.length > 0) {
        args.reviewers = selectedReviewers;
      }
    }
    if (pendingFiles.length > 0) {
      args.files = pendingFiles.map((f) => ({
        name: f.name,
        type: f.type || "application/octet-stream",
        size: f.size,
        subfolder: "attachments",
        uploadedAt: new Date().toISOString(),
      }));
    }

    try {
      const taskId = await createTask(args);
      setTitle("");
      setDescription("");
      setSelectedAgent("");
      setTrustLevel("autonomous");
      setSupervisionMode("autonomous");
      setSelectedReviewers([]);
      setIsExpanded(false);

      if (pendingFiles.length > 0) {
        const formData = new FormData();
        for (const file of pendingFiles) {
          formData.append("files", file, file.name);
        }
        try {
          const res = await fetch(`/api/tasks/${taskId}/files`, {
            method: "POST",
            body: formData,
          });
          if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
          setPendingFiles([]);
        } catch {
          setError("Task created, but file upload to disk failed. Please retry.");
        }
      }
    } catch {
      setError("Failed to create task. Please try again.");
    }
  }
};
```

**Step 3: Update handleKeyDown for textarea**

The existing `handleKeyDown` triggers submit on Enter. For a textarea, we want Shift+Enter for newlines and plain Enter for submit:

```tsx
const handleKeyDown = (e: React.KeyboardEvent) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSubmit();
  }
};
```

**Step 4: Update the JSX — conditionally show title input or textarea**

Replace the existing input section (the `<div className="flex-1">` block at lines ~158-170) with:

```tsx
<div className="flex-1 space-y-1.5">
  {!isAutoTitle && (
    <Input
      placeholder="Task title..."
      value={title}
      onChange={(e) => {
        setTitle(e.target.value);
        setError("");
      }}
      onKeyDown={handleKeyDown}
      className={error && !title.trim() ? "border-red-500" : ""}
    />
  )}
  <textarea
    placeholder={isAutoTitle ? "Describe your task..." : "Description (optional)..."}
    value={description}
    onChange={(e) => {
      setDescription(e.target.value);
      setError("");
    }}
    onKeyDown={handleKeyDown}
    rows={isAutoTitle ? 2 : 1}
    className={`flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none ${
      error && isAutoTitle && !description.trim() ? "border-red-500" : ""
    }`}
  />
  {error && <p className="text-xs text-red-500">{error}</p>}
</div>
```

**Step 5: Verify in browser**

- Toggle Auto Title OFF in settings: should see Title input + Description textarea
- Toggle Auto Title ON: should see only Description textarea (title input hidden)
- Submit with empty description (auto mode): should show error
- Submit with text: should create task

**Step 6: Commit**

```bash
git add dashboard/components/TaskInput.tsx
git commit -m "feat: add description textarea and auto-title mode to TaskInput"
```

---

### Task 5: Python — auto-title generation in orchestrator

**Files:**
- Modify: `nanobot/mc/orchestrator.py:75-145` (in `_process_planning_task`)
- Create: `tests/mc/test_auto_title.py`

**Step 1: Write the test**

Create `tests/mc/test_auto_title.py`:

```python
"""Tests for auto-title generation in the orchestrator."""

import json
from unittest.mock import MagicMock, patch, AsyncMock

import pytest

from nanobot.mc.orchestrator import generate_auto_title


@pytest.mark.asyncio
async def test_generate_auto_title_calls_llm_with_low_tier():
    """Auto-title uses the standard-low model from settings."""
    mock_bridge = MagicMock()
    mock_bridge.query.return_value = json.dumps({
        "standard-low": "anthropic/claude-haiku-3-5",
        "standard-medium": "anthropic/claude-sonnet-4-6",
        "standard-high": "anthropic/claude-opus-4-6",
    })

    mock_provider = MagicMock()
    mock_provider.chat.return_value = MagicMock(content="Fix login validation bug")

    with patch(
        "nanobot.mc.orchestrator.create_provider",
        return_value=(mock_provider, "anthropic/claude-haiku-3-5"),
    ) as mock_create:
        result = await generate_auto_title(
            mock_bridge,
            "When users try to log in with an email that contains special characters "
            "like + or dots, the validation rejects them even though they are valid "
            "RFC 5322 email addresses. This needs to be fixed in the auth module.",
        )

    assert result == "Fix login validation bug"
    mock_bridge.query.assert_called_once_with("settings:get", {"key": "model_tiers"})
    mock_create.assert_called_once_with(model="anthropic/claude-haiku-3-5")
    mock_provider.chat.assert_called_once()
    call_args = mock_provider.chat.call_args
    assert call_args.kwargs["max_tokens"] == 60


@pytest.mark.asyncio
async def test_generate_auto_title_fallback_on_missing_tier():
    """If standard-low tier is not configured, returns None (no title generated)."""
    mock_bridge = MagicMock()
    mock_bridge.query.return_value = json.dumps({
        "standard-low": None,
        "standard-medium": "anthropic/claude-sonnet-4-6",
    })

    result = await generate_auto_title(mock_bridge, "Some task description")
    assert result is None


@pytest.mark.asyncio
async def test_generate_auto_title_fallback_on_no_settings():
    """If model_tiers setting doesn't exist, returns None."""
    mock_bridge = MagicMock()
    mock_bridge.query.return_value = None

    result = await generate_auto_title(mock_bridge, "Some task description")
    assert result is None


@pytest.mark.asyncio
async def test_generate_auto_title_strips_quotes():
    """LLM response with surrounding quotes should be cleaned."""
    mock_bridge = MagicMock()
    mock_bridge.query.return_value = json.dumps({
        "standard-low": "anthropic/claude-haiku-3-5",
    })

    mock_provider = MagicMock()
    mock_provider.chat.return_value = MagicMock(content='"Fix the login bug"')

    with patch(
        "nanobot.mc.orchestrator.create_provider",
        return_value=(mock_provider, "anthropic/claude-haiku-3-5"),
    ):
        result = await generate_auto_title(mock_bridge, "description")

    assert result == "Fix the login bug"
```

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/test_auto_title.py -v`
Expected: FAIL with `ImportError: cannot import name 'generate_auto_title'`

**Step 3: Implement generate_auto_title function**

In `nanobot/mc/orchestrator.py`, add the import at the top (after existing imports, line ~12):

```python
import json
```

Add the function before the `TaskOrchestrator` class:

```python
AUTO_TITLE_PROMPT = (
    "Generate a concise title (max 10 words) for this task. "
    "Return ONLY the title text, nothing else.\n\n"
    "Task description: {description}"
)


async def generate_auto_title(
    bridge: "ConvexBridge",
    description: str,
) -> str | None:
    """Generate a concise title from a task description using the standard-low tier model.

    Reads the model_tiers setting to resolve the standard-low model,
    calls the LLM, and returns the generated title string.

    Returns None if the standard-low tier is not configured or LLM fails.
    """
    from nanobot.mc.provider_factory import create_provider

    # Read model_tiers setting
    raw_tiers = bridge.query("settings:get", {"key": "model_tiers"})
    if not raw_tiers:
        logger.warning("[orchestrator] No model_tiers setting — skipping auto-title")
        return None

    tiers = json.loads(raw_tiers)
    low_model = tiers.get("standard-low")
    if not low_model:
        logger.warning("[orchestrator] standard-low tier not configured — skipping auto-title")
        return None

    try:
        provider, resolved_model = create_provider(model=low_model)
        response = provider.chat(
            model=resolved_model,
            messages=[
                {"role": "user", "content": AUTO_TITLE_PROMPT.format(description=description)},
            ],
            temperature=0.3,
            max_tokens=60,
        )
        title = (response.content or "").strip().strip('"').strip("'")
        if not title:
            return None
        return title
    except Exception:
        logger.exception("[orchestrator] Auto-title generation failed")
        return None
```

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/mc/test_auto_title.py -v`
Expected: All 4 tests PASS.

**Step 5: Wire auto-title into _process_planning_task**

In `nanobot/mc/orchestrator.py`, in `_process_planning_task()` (line ~78), after extracting title and description, add:

```python
# Auto-title: generate a concise title from description if autoTitle is set
if task_data.get("auto_title") and description:
    generated_title = await generate_auto_title(self._bridge, description)
    if generated_title:
        title = generated_title
        # Patch the title back to Convex
        await asyncio.to_thread(
            self._bridge.mutation,
            "tasks:updateTitle",
            {"task_id": task_id, "title": title},
        )
        logger.info(
            "[orchestrator] Auto-generated title for task %s: '%s'",
            task_id,
            title,
        )
```

This goes right after line 79 (`description = task_data.get("description")`) and before the `if not task_id:` check at line 82.

**Step 6: Run full test suite**

Run: `uv run pytest tests/mc/ -v`
Expected: All tests pass (existing + new).

**Step 7: Commit**

```bash
git add nanobot/mc/orchestrator.py tests/mc/test_auto_title.py
git commit -m "feat: auto-title generation using standard-low tier model"
```

---

### Task 6: Agent dispatch — structured title+description format

**Files:**
- Modify: `nanobot/mc/executor.py:126-129`
- Create: `tests/mc/test_structured_dispatch.py`

**Step 1: Write the test**

Create `tests/mc/test_structured_dispatch.py`:

```python
"""Tests for structured task dispatch format (<title>+<description> tags)."""


def test_build_task_message_with_description():
    """When both title and description exist, use structured tags."""
    from nanobot.mc.executor import build_task_message

    result = build_task_message("Fix login bug", "The login form rejects valid emails")
    assert result == "<title>Fix login bug</title>\n<description>The login form rejects valid emails</description>"


def test_build_task_message_without_description():
    """When no description, use plain title (backward compatible)."""
    from nanobot.mc.executor import build_task_message

    result = build_task_message("Fix login bug", None)
    assert result == "Fix login bug"


def test_build_task_message_empty_description():
    """Empty string description treated as no description."""
    from nanobot.mc.executor import build_task_message

    result = build_task_message("Fix login bug", "")
    assert result == "Fix login bug"
```

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/mc/test_structured_dispatch.py -v`
Expected: FAIL with `ImportError: cannot import name 'build_task_message'`

**Step 3: Implement build_task_message and wire it in**

In `nanobot/mc/executor.py`, add the function near the top (before `_run_agent_on_task`, around line ~90):

```python
def build_task_message(title: str, description: str | None) -> str:
    """Build the task message sent to the agent.

    When a description exists, uses structured XML tags so the agent
    can distinguish title from description. Otherwise, plain title
    for backward compatibility.
    """
    if description and description.strip():
        return f"<title>{title}</title>\n<description>{description}</description>"
    return title
```

Then in `_run_agent_on_task()`, replace lines 127-129:

```python
# Build the message from task title + description
message = task_title
if task_description:
    message += f"\n\n{task_description}"
```

With:

```python
# Build the message from task title + description (structured format)
message = build_task_message(task_title, task_description)
```

**Step 4: Run test to verify it passes**

Run: `uv run pytest tests/mc/test_structured_dispatch.py -v`
Expected: All 3 tests PASS.

**Step 5: Run full test suite**

Run: `uv run pytest tests/mc/ -v`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add nanobot/mc/executor.py tests/mc/test_structured_dispatch.py
git commit -m "feat: structured <title>/<description> format for agent dispatch"
```

---

### Task 7: Integration verification

**Step 1: Run all Python tests**

Run: `uv run pytest tests/mc/ -v`
Expected: All pass.

**Step 2: Run Convex codegen**

Run: `cd dashboard && npx convex dev --once`
Expected: No errors.

**Step 3: Manual browser test**

1. Open Settings > toggle Auto Title ON
2. Go to task creation > verify only description textarea shows
3. Type a description > submit > verify task appears with placeholder title
4. (If gateway running) Verify title updates to AI-generated one after ~2s
5. Toggle Auto Title OFF > verify both title input + description textarea appear
6. Create task with both fields > verify both stored correctly

**Step 4: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "chore: integration fixes for auto-title feature"
```
