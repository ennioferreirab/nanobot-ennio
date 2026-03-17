# Markdown Task Images Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make task-generated Markdown render local task images inline in the dashboard, while also guiding agents to emit Markdown that references those images correctly.

**Architecture:** Pass the currently opened Markdown file context into the dashboard viewer so it can resolve relative `img` and `a` paths against the task file API. Add a matching prompt rule in the global nanobot system prompt so agents embed existing task images inline with relative paths instead of listing bare filenames.

**Tech Stack:** Next.js dashboard, React, react-markdown, Vitest, Python pytest

---

### Task 1: Cover relative Markdown asset resolution with tests

**Files:**
- Modify: `dashboard/components/viewers/MarkdownViewer.test.tsx`
- Modify: `dashboard/components/DocumentViewerModal.test.tsx`

**Step 1: Write failing viewer tests**

Add tests asserting that:
- `![alt](./images/chart.png)` resolves to `/api/tasks/<taskId>/files/output/<encoded path>`
- `[link](./artifact.html)` resolves using the current Markdown file directory
- absolute URLs remain unchanged

**Step 2: Write failing modal wiring test**

Add a test asserting `DocumentViewerModal` passes `taskId`, `subfolder`, and current Markdown filename into `MarkdownViewer`.

**Step 3: Run tests to verify they fail**

Run: `npm test -- MarkdownViewer.test.tsx DocumentViewerModal.test.tsx`

Expected: FAIL because `MarkdownViewer` does not yet know the current task/file context.

### Task 2: Implement dashboard-side path resolution

**Files:**
- Modify: `dashboard/components/viewers/MarkdownViewer.tsx`
- Modify: `dashboard/components/DocumentViewerModal.tsx`

**Step 1: Add minimal path resolution helpers**

Implement helper logic to:
- detect relative Markdown paths
- normalize them against the current Markdown file directory
- reject path traversal above the task subfolder root
- build `/api/tasks/.../files/...` URLs with encoded filenames

**Step 2: Wire viewer context through the modal**

Pass the opened Markdown file metadata from `DocumentViewerModal` into `MarkdownViewer`.

**Step 3: Run focused dashboard tests**

Run: `npm test -- MarkdownViewer.test.tsx DocumentViewerModal.test.tsx`

Expected: PASS

### Task 3: Add prompt guidance and verify it

**Files:**
- Modify: `vendor/nanobot/nanobot/agent/context.py`
- Modify: `vendor/nanobot/tests/test_context_prompt_cache.py`

**Step 1: Write failing prompt test**

Assert `build_system_prompt()` includes guidance to:
- embed task-generated images inline in Markdown
- use relative paths
- avoid inventing missing files

**Step 2: Add minimal prompt copy**

Extend the nanobot global guidelines with concise Markdown-image instructions, without changing unrelated prompt structure.

**Step 3: Run focused Python test**

Run: `uv run pytest vendor/nanobot/tests/test_context_prompt_cache.py -q`

Expected: PASS

### Task 4: Final verification

**Files:**
- No code changes

**Step 1: Run all focused checks**

Run:
- `npm test -- MarkdownViewer.test.tsx DocumentViewerModal.test.tsx`
- `uv run pytest vendor/nanobot/tests/test_context_prompt_cache.py -q`

**Step 2: Review diff**

Confirm the change is limited to viewer resolution, viewer wiring, prompt guidance, tests, and the plan doc.
