# Tag Attribute Selector — Design

**Date:** 2026-02-26
**Status:** Approved

## Overview

When a user clicks a tag chip in `TaskInput` to select it for task creation, if that tag has associated attributes, a popover opens allowing the user to fill in attribute values **before** creating the task.

This also requires a new UX in `TagsPanel` (Settings) to associate specific attributes from the global catalog to specific tags.

## Future Context

Designed with a future `tag:attribute:value` filter/search in mind. The existing `tagAttributeValues` table already stores `(taskId, tagName, attributeId, value)` — perfect for future filtering queries. The tag→attribute association is purely UX metadata.

---

## Schema Change

Add `attributeIds` to `taskTags`:

```typescript
taskTags: defineTable({
  name: v.string(),
  color: v.string(),
  attributeIds: v.optional(v.array(v.id("tagAttributes"))),
}).index("by_name", ["name"]),
```

No new tables needed. The existing `tagAttributeValues` table handles stored values.

---

## Backend

### `dashboard/convex/taskTags.ts`

- Add `updateAttributeIds` mutation:
  ```typescript
  updateAttributeIds({ tagId: v.id("taskTags"), attributeIds: v.array(v.id("tagAttributes")) })
  ```
  Replaces the full array. Validates that all IDs exist in `tagAttributes`.

- Existing `list` query already returns all tags; the `attributeIds` field is included automatically.

---

## Frontend: TagsPanel

Each tag row in the list gains attribute chips and an add button:

```
● bug    [severity ×]  [priority ×]  [+ attribute]
● feat   (no attributes)             [+ attribute]
```

- Clicking `[+ attribute]` opens a small popover with:
  - Search field to filter the attribute catalog by name
  - Scrollable list of catalog attributes (already-assigned ones are disabled/checked)
  - Clicking an unassigned attribute calls `updateAttributeIds` (appends to array)
- Clicking `×` on an attribute badge calls `updateAttributeIds` (removes from array)

---

## Frontend: TaskInput

### State additions

```typescript
// tagName → attributeId → value (local, pre-creation)
const [tagAttrValues, setTagAttrValues] = useState<
  Record<string, Record<string, string>>
>({});
```

### Tag chip click behavior

1. Toggle tag selection (existing behavior preserved).
2. If tag was **selected** (not deselected) AND has `attributeIds.length > 0`:
   - Open a popover anchored to the chip.
3. If tag was **deselected**: clear `tagAttrValues[tagName]`.

### Popover contents

- Small search field to filter attributes by name (only among this tag's attributes).
- For each attribute matching the search:
  - `text` → `<Input type="text" />`
  - `number` → `<Input type="number" />`
  - `date` → `<Input type="date" />`
  - `select` → `<Select>` with the attribute's options
- Popover closes on click-outside or Escape.

### Visual indicator on chip

When a selected tag has at least one non-empty attribute value, the chip shows a filled dot or subtle badge to communicate "has data".

### Reset on task creation / manual mode toggle

`tagAttrValues` is reset to `{}` after successful task creation and when switching to manual mode.

---

## Task Creation Flow

```
1. createTask({ title, tags, ... })           → returns taskId
2. for each (tagName, attributeId, value)
   where value !== "":
     tagAttributeValues.upsert({
       taskId,
       tagName,
       attributeId,
       value,
     })
```

All `upsert` calls are made in parallel (`Promise.all`) after the task is created.

The `tagAttributeValues.upsert` mutation already exists.

---

## Files Touched

| File | Change |
|------|--------|
| `dashboard/convex/schema.ts` | Add `attributeIds` to `taskTags` |
| `dashboard/convex/taskTags.ts` | Add `updateAttributeIds` mutation |
| `dashboard/components/TagsPanel.tsx` | Per-tag attribute assignment UI |
| `dashboard/components/TaskInput.tsx` | Popover on tag click + post-create upserts |

No new files required.
