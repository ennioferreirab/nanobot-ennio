# Thread Markdown Selection And Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix broken text selection in rendered markdown inside the thread and document viewer, and stop the thread conversation container from exceeding its horizontal bounds.

**Architecture:** Remove persistent transform-based positioning from the dialog shell used by the document viewer, avoid transform-based animation on live thread messages, and tighten width constraints around markdown/thread containers so wide content stays contained while preserving local horizontal scroll for tables/code blocks.

**Tech Stack:** Next.js, React 19, Radix UI, Tailwind CSS, Vitest, Testing Library

---

### Task 1: Add regression coverage for the structural constraints

**Files:**
- Create: `dashboard/components/MarkdownRenderer.test.tsx`
- Modify: `dashboard/components/ThreadMessage.test.tsx`
- Create: `dashboard/components/ui/dialog.test.tsx`

**Step 1: Write the failing tests**

- Assert `MarkdownRenderer` exposes a width-constrained, text-selectable root shell.
- Assert `ThreadMessage` uses a full-width constrained wrapper.
- Assert `DialogContent` no longer carries persistent translate-based centering classes.

**Step 2: Run tests to verify they fail**

Run: `npm test -- MarkdownRenderer.test.tsx ThreadMessage.test.tsx ui/dialog.test.tsx`

Expected: one or more assertions fail against the current shells/classes.

### Task 2: Apply the minimal UI fixes

**Files:**
- Modify: `dashboard/components/MarkdownRenderer.tsx`
- Modify: `dashboard/components/viewers/MarkdownViewer.tsx`
- Modify: `dashboard/components/ui/dialog.tsx`
- Modify: `dashboard/features/thread/components/ThreadMessage.tsx`
- Modify: `dashboard/features/tasks/components/TaskDetailSheet.tsx`
- Modify: `dashboard/features/thread/components/ThreadInput.tsx`

**Step 1: Implement the minimal code changes**

- Add explicit `w-full`, `min-w-0`, `max-w-full`, and `select-text` safeguards where rendered markdown lives.
- Center dialog content without persistent `translate` positioning.
- Remove transform-based `y` animation from live thread message entry.
- Add a shared max-width wrapper for live thread content and composer layout.

**Step 2: Run targeted tests**

Run: `npm test -- MarkdownRenderer.test.tsx ThreadMessage.test.tsx ui/dialog.test.tsx MarkdownViewer.test.tsx DocumentViewerModal.test.tsx`

Expected: all targeted tests pass.

### Task 3: Verify no regression in the task detail thread shell

**Files:**
- Modify if needed: `dashboard/features/tasks/components/TaskDetailSheet.tsx`

**Step 1: Run focused task detail regression tests**

Run: `npm test -- TaskDetailSheet.test.tsx`

Expected: thread-related task detail tests remain green.
