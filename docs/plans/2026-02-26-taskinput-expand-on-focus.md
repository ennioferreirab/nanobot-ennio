# TaskInput Expand-on-Focus Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single-line `<Input>` in `TaskInput` with a dual-element pattern that shows a truncated div when blurred and an absolutely-positioned expanding textarea when focused.

**Architecture:** A `isFocused` boolean state swaps between a styled `<div>` (ellipsis truncation) and a `<textarea>` (position absolute, z-index 50, auto-grows via scrollHeight). The wrapper div keeps a fixed 36px height in the flex layout so no layout shift occurs on focus. The textarea overlays the kanban board below.

**Tech Stack:** React (useState, useRef, useEffect), Tailwind CSS, existing TaskInput component

---

### Task 1: Add isFocused state and textarea ref

**Files:**
- Modify: `dashboard/components/TaskInput.tsx`

**Step 1: Add the new state and ref** at the top of the `TaskInput` function, after existing state declarations (around line 42):

```tsx
const [isFocused, setIsFocused] = useState(false);
const textareaRef = useRef<HTMLTextAreaElement>(null);
```

Make sure `useRef` is already imported — it is (line 3). No new imports needed.

**Step 2: Verify the file compiles** by running:
```bash
cd dashboard && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors (or only pre-existing errors unrelated to TaskInput).

**Step 3: Commit**
```bash
git add dashboard/components/TaskInput.tsx
git commit -m "feat(task-input): add isFocused state and textarea ref"
```

---

### Task 2: Replace `<Input>` with dual div/textarea

**Files:**
- Modify: `dashboard/components/TaskInput.tsx:158-169`

**Step 1: Find the current input block.** It looks like this (around line 158):

```tsx
<div className="flex-1">
  <Input
    placeholder="Create a new task..."
    value={title}
    onChange={(e) => {
      setTitle(e.target.value);
      setError("");
    }}
    onKeyDown={handleKeyDown}
    className={error ? "border-red-500" : ""}
  />
  {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
</div>
```

**Step 2: Replace that block** with the dual-element pattern:

```tsx
<div className="relative flex-1" style={{ height: 36 }}>
  {isFocused ? (
    <textarea
      ref={textareaRef}
      placeholder="Create a new task..."
      value={title}
      onChange={(e) => {
        setTitle(e.target.value);
        setError("");
        // Auto-grow
        const el = e.target;
        el.style.height = "auto";
        el.style.height = el.scrollHeight + "px";
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSubmit();
        }
        if (e.key === "Escape") {
          textareaRef.current?.blur();
        }
      }}
      onBlur={() => setIsFocused(false)}
      rows={1}
      className={`absolute top-0 left-0 right-0 z-50 min-h-[36px] w-full resize-none rounded-md border bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring ${
        error ? "border-red-500" : "border-input"
      }`}
      style={{ height: 36 }}
    />
  ) : (
    <div
      role="textbox"
      aria-label="Create a new task"
      tabIndex={0}
      onClick={() => setIsFocused(true)}
      onFocus={() => setIsFocused(true)}
      className={`flex h-[36px] cursor-text items-center rounded-md border px-3 py-1.5 text-sm ${
        error ? "border-red-500" : "border-input"
      } ${title ? "text-foreground" : "text-muted-foreground"} overflow-hidden whitespace-nowrap`}
      style={{ textOverflow: "ellipsis" }}
    >
      {title || "Create a new task..."}
    </div>
  )}
  {error && <p className="absolute top-[38px] left-0 text-xs text-red-500">{error}</p>}
</div>
```

**Important notes on the replacement:**
- `onKeyDown` changes: `Enter` (without Shift) submits, `Shift+Enter` inserts newline, `Escape` blurs/collapses
- The existing `handleKeyDown` on the old `<Input>` only handled `Enter` — the new textarea handler replaces it inline
- Remove the `import { Input }` line if Input is no longer used elsewhere in the file (check first with grep)

**Step 3: Check if `Input` import is still needed**
```bash
grep -n "Input" dashboard/components/TaskInput.tsx
```
If `<Input` only appears in the block you just replaced, remove it from the import on line 7.

**Step 4: Verify compilation**
```bash
cd dashboard && npx tsc --noEmit 2>&1 | head -20
```
Expected: no new errors.

**Step 5: Commit**
```bash
git add dashboard/components/TaskInput.tsx
git commit -m "feat(task-input): dual div/textarea expand-on-focus pattern"
```

---

### Task 3: Auto-focus textarea when switching to focused state

**Files:**
- Modify: `dashboard/components/TaskInput.tsx`

**Step 1: Add a `useEffect`** to focus the textarea whenever `isFocused` becomes `true`. Add this after the existing refs/state block:

```tsx
useEffect(() => {
  if (isFocused && textareaRef.current) {
    const el = textareaRef.current;
    el.focus();
    // Set cursor at end of existing text
    el.setSelectionRange(el.value.length, el.value.length);
    // Trigger initial auto-grow in case there's existing text
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }
}, [isFocused]);
```

**Step 2: Verify compilation**
```bash
cd dashboard && npx tsc --noEmit 2>&1 | head -20
```

**Step 3: Manual test in browser**
- Run `cd dashboard && npm run dev`
- Click the task input → textarea appears, cursor at end
- Type a long text (>80 chars) → textarea grows downward, overlays kanban
- Press Escape → collapses, div shows truncated text with ellipsis
- Click div again → textarea re-opens with cursor at end
- Press Enter → task submits, input clears, collapses

**Step 4: Commit**
```bash
git add dashboard/components/TaskInput.tsx
git commit -m "feat(task-input): auto-focus textarea and restore cursor position"
```

---

### Task 4: Reset after submit

**Files:**
- Modify: `dashboard/components/TaskInput.tsx:100-108`

**Step 1: Find `handleSubmit` success block** (around line 100). After `setTitle("")`, add:

```tsx
setIsFocused(false);
```

This ensures the component collapses after a successful submit (currently `setIsExpanded(false)` is set — keep that too).

**Step 2: Also reset textarea height.** The textarea is unmounted on blur so no explicit height reset is needed — it will start fresh next time.

**Step 3: Verify compilation and manual test**
- Submit a task → input collapses back to placeholder div
- Submit with Enter while textarea is focused → same result

**Step 4: Commit**
```bash
git add dashboard/components/TaskInput.tsx
git commit -m "feat(task-input): collapse on successful submit"
```

---

### Task 5: Final polish — background and z-index

**Files:**
- Modify: `dashboard/components/TaskInput.tsx`

**Step 1: Ensure textarea has `focus-visible` ring and solid background.**

The textarea className already has `bg-background` from Task 2. Verify the Tailwind token resolves correctly in the dark/light theme by checking `tailwind.config.js` or `globals.css` for `--background` custom property.

```bash
grep -n "background" dashboard/app/globals.css | head -10
```

If `bg-background` is defined (it will be in a shadcn/ui project), no change needed.

**Step 2: Add a subtle `box-shadow` to the expanded textarea** so it visually floats above the content. Update the textarea `className` to include `shadow-md` (replace `shadow-sm`):

```tsx
className={`absolute top-0 left-0 right-0 z-50 min-h-[36px] w-full resize-none rounded-md border bg-background px-3 py-1.5 text-sm shadow-md focus:outline-none focus:ring-1 focus:ring-ring ...`}
```

**Step 3: Verify there's no z-index conflict** with other overlapping elements (the Options collapsible is below in the DOM and doesn't overlap; the sidebar and activity panel use fixed/sticky positioning which is fine).

**Step 4: Final manual test checklist**
- [ ] Click input → expands, overlays kanban
- [ ] Type multiline → grows downward
- [ ] Blur (click elsewhere) → collapses, first line shows with `...`
- [ ] Tab navigation works (div has `tabIndex={0}`, onFocus triggers expansion)
- [ ] Escape collapses
- [ ] Enter submits (without newline)
- [ ] Shift+Enter inserts newline
- [ ] Error message still appears (shown absolute below input)
- [ ] Dark mode: background covers content below
- [ ] Tag chips below still clickable when textarea is not focused

**Step 5: Commit**
```bash
git add dashboard/components/TaskInput.tsx
git commit -m "feat(task-input): polish shadow and verify z-index layering"
```
