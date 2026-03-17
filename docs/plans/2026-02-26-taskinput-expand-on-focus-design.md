# TaskInput: Expand on Focus Design

**Date:** 2026-02-26

## Goal

When the user focuses the task input field, it expands downward overlaying the content below. When focus is lost, it collapses back to a single truncated line. Clicking the collapsed state re-focuses and expands.

## Behavior

| State    | Visual                                                            |
|----------|-------------------------------------------------------------------|
| Blurred  | Single-line div showing text with `text-overflow: ellipsis`      |
| Focused  | Absolute-positioned textarea expanding downward, overlays kanban |

## Architecture

### Dual-element approach

The input area uses two elements toggled by focus state:

1. **Collapsed (`<div>`)** — styled to match the existing `<Input>`, `cursor: text`, `overflow: hidden`, `white-space: nowrap`, `text-overflow: ellipsis`. Clicking fires `.focus()` on the hidden textarea.

2. **Expanded (`<textarea>`)** — `position: absolute; z-index: 50; top: 0; left: 0; right: 0`, `resize: none`, auto-grows via `scrollHeight` on input. Solid background to cover elements below. Blurs to return to collapsed div.

### DOM structure

```
<div className="relative flex-1" style={{ height: 36px }}>   ← maintains flex row height
  {focused
    ? <textarea position:absolute z-50 top-0 left-0 right-0 autoGrow />
    : <div cursor-text truncate onClick→textarea.focus() />
  }
</div>
```

### State changes

- `isFocused: boolean` — controls which element renders
- `title: string` — shared value between both elements (already exists)
- On div click: set `isFocused = true`, textarea auto-focuses via `useEffect`
- On textarea blur: set `isFocused = false`

### Auto-grow

On every `onChange`, set textarea height:

```ts
const el = textareaRef.current;
el.style.height = "auto";
el.style.height = el.scrollHeight + "px";
```

### Min/Max height

- Min: 36px (matches original Input height)
- Max: uncapped (let it grow as much as needed, user can scroll within the textarea if content is very long — but practically task titles won't be huge)

## Files Changed

- `dashboard/components/TaskInput.tsx` — replace `<Input>` with dual div/textarea pattern

## No changes needed

- `DashboardLayout.tsx` — the parent div has no `overflow: hidden`, so the absolute textarea will naturally overflow down over the kanban board
- All form submission, tag chips, file chips, collapsible options — untouched
