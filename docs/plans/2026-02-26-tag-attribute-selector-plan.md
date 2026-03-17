# Tag Attribute Selector — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When a user clicks a tag chip in TaskInput, a popover opens so they can fill in that tag's attribute values before creating the task; TagsPanel gets a per-tag attribute-assignment UI to define which attributes belong to each tag.

**Architecture:** Add optional `attributeIds` array to `taskTags` schema; add `updateAttributeIds` mutation; update TagsPanel to let users link catalog attributes to tags; update TaskInput to show an attribute-value popover on tag selection and upsert saved values after task creation.

**Tech Stack:** Next.js 14 (App Router), Convex (real-time DB + mutations), shadcn/ui (Popover, Input, Select, Badge), TypeScript

---

## Task 1 — Schema: add `attributeIds` to `taskTags`

**Files:**
- Modify: `dashboard/convex/schema.ts:230-233`

**Step 1: Edit schema**

In `dashboard/convex/schema.ts`, change the `taskTags` table definition from:

```typescript
  taskTags: defineTable({
    name: v.string(),
    color: v.string(), // one of: blue|green|red|amber|violet|pink|orange|teal
  }).index("by_name", ["name"]),
```

to:

```typescript
  taskTags: defineTable({
    name: v.string(),
    color: v.string(), // one of: blue|green|red|amber|violet|pink|orange|teal
    attributeIds: v.optional(v.array(v.id("tagAttributes"))),
  }).index("by_name", ["name"]),
```

**Step 2: Verify Convex dev server accepts the change**

Run (in `dashboard/` directory where `package.json` lives):
```bash
npx convex dev --once
```
Expected: no errors. The field is optional so existing rows are unaffected.

**Step 3: Commit**

```bash
git add dashboard/convex/schema.ts
git commit -m "feat(schema): add attributeIds to taskTags"
```

---

## Task 2 — Backend: `updateAttributeIds` mutation

**Files:**
- Modify: `dashboard/convex/taskTags.ts`

**Step 1: Add mutation at the end of the file**

Open `dashboard/convex/taskTags.ts` and append after the `remove` mutation:

```typescript
export const updateAttributeIds = mutation({
  args: {
    tagId: v.id("taskTags"),
    attributeIds: v.array(v.id("tagAttributes")),
  },
  handler: async (ctx, { tagId, attributeIds }) => {
    const tag = await ctx.db.get(tagId);
    if (!tag) throw new ConvexError("Tag not found");
    await ctx.db.patch(tagId, { attributeIds });
  },
});
```

**Step 2: Verify Convex codegen**

```bash
npx convex dev --once
```
Expected: `api.taskTags.updateAttributeIds` now available in generated types.

**Step 3: Commit**

```bash
git add dashboard/convex/taskTags.ts
git commit -m "feat(backend): add updateAttributeIds mutation to taskTags"
```

---

## Task 3 — TagsPanel: per-tag attribute assignment

**Files:**
- Modify: `dashboard/components/TagsPanel.tsx`

**Goal:** Each tag row shows its associated attribute badges with a remove `×`, plus a `+` button that opens a popover to search the attribute catalog and add attributes.

**Step 1: Add new imports**

At the top of `dashboard/components/TagsPanel.tsx`, add to existing imports:

```typescript
import { Plus } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
```

**Step 2: Add state for the attribute-picker popover**

Inside the `TagsPanel` function body, after the existing state declarations, add:

```typescript
const updateTagAttributeIds = useMutation(api.taskTags.updateAttributeIds);
const [openTagId, setOpenTagId] = useState<string | null>(null);
const [attrPickerSearch, setAttrPickerSearch] = useState("");
```

**Step 3: Replace the tag list `<ul>` with the enriched version**

Find the `<ul className="space-y-2">` block (lines ~115-138) and replace it entirely with:

```tsx
<ul className="space-y-3">
  {tags.map((tag) => {
    const color = TAG_COLORS[tag.color];
    const assignedIds = tag.attributeIds ?? [];
    const assignedAttrs = (attributes ?? []).filter((a) =>
      assignedIds.includes(a._id)
    );

    const filteredCatalog = (attributes ?? []).filter((a) =>
      a.name.toLowerCase().includes(attrPickerSearch.toLowerCase())
    );

    const handleAddAttr = (attrId: string) => {
      if (assignedIds.includes(attrId as never)) return;
      updateTagAttributeIds({
        tagId: tag._id,
        attributeIds: [...assignedIds, attrId] as never[],
      });
    };

    const handleRemoveAttr = (attrId: string) => {
      updateTagAttributeIds({
        tagId: tag._id,
        attributeIds: assignedIds.filter((id) => id !== attrId) as never[],
      });
    };

    return (
      <li key={tag._id} className="space-y-1.5 py-1">
        {/* Tag header row */}
        <div className="flex items-center gap-3">
          <span
            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${color?.dot ?? "bg-muted"}`}
          />
          <span className="text-sm flex-1">{tag.name}</span>
          <button
            aria-label={`Delete tag ${tag.name}`}
            onClick={() => removeTag({ id: tag._id })}
            className="text-muted-foreground hover:text-red-500 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Assigned attribute chips + add button */}
        <div className="flex flex-wrap gap-1 pl-5">
          {assignedAttrs.map((attr) => (
            <span
              key={attr._id}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-muted text-muted-foreground border border-border"
            >
              {attr.name}
              <button
                aria-label={`Remove attribute ${attr.name} from tag ${tag.name}`}
                onClick={() => handleRemoveAttr(attr._id)}
                className="hover:text-red-500 transition-colors"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}

          {/* Add attribute popover */}
          <Popover
            open={openTagId === tag._id}
            onOpenChange={(open) => {
              setOpenTagId(open ? tag._id : null);
              if (!open) setAttrPickerSearch("");
            }}
          >
            <PopoverTrigger asChild>
              <button
                aria-label={`Add attribute to tag ${tag.name}`}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] border border-dashed border-border text-muted-foreground hover:border-muted-foreground transition-colors"
              >
                <Plus className="h-2.5 w-2.5" />
                attr
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2 space-y-2" align="start">
              <input
                autoFocus
                placeholder="Search attributes..."
                value={attrPickerSearch}
                onChange={(e) => setAttrPickerSearch(e.target.value)}
                className="w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {filteredCatalog.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">
                  No attributes found
                </p>
              ) : (
                <ul className="space-y-0.5 max-h-48 overflow-y-auto">
                  {filteredCatalog.map((attr) => {
                    const isAssigned = assignedIds.includes(attr._id);
                    return (
                      <li key={attr._id}>
                        <button
                          disabled={isAssigned}
                          onClick={() => handleAddAttr(attr._id)}
                          className={`w-full flex items-center justify-between px-2 py-1 rounded text-sm text-left transition-colors ${
                            isAssigned
                              ? "opacity-40 cursor-default"
                              : "hover:bg-accent"
                          }`}
                        >
                          <span>{attr.name}</span>
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0"
                          >
                            {attr.type}
                          </Badge>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </li>
    );
  })}
</ul>
```

**Step 4: Manual smoke test**

- Open the Tags settings panel
- Create a tag (e.g. "bug") and an attribute (e.g. "severity" / type: select / options: low,medium,high)
- Click `+ attr` on the "bug" tag → popover opens, search works, click "severity" → badge appears
- Click `×` on the badge → it disappears
- Convex dev console confirms `attributeIds` is being persisted on the tag document

**Step 5: Commit**

```bash
git add dashboard/components/TagsPanel.tsx
git commit -m "feat(tags-panel): per-tag attribute assignment UI"
```

---

## Task 4 — TaskInput: attribute value popover on tag chip click

**Files:**
- Modify: `dashboard/components/TaskInput.tsx`

**Goal:** When a user clicks a tag chip to select it, if that tag has `attributeIds`, open a Popover anchored to the chip showing search + attribute inputs. Values stored in local state. Visual indicator on chip when values are filled.

**Step 1: Add new imports**

Add to existing imports at the top of `dashboard/components/TaskInput.tsx`:

```typescript
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
```

**Step 2: Add state + query**

Inside the `TaskInput` function, after the existing `useState` declarations:

```typescript
// Attribute values: tagName → attributeId → value (pre-creation)
const [tagAttrValues, setTagAttrValues] = useState<
  Record<string, Record<string, string>>
>({});
const [openAttrPopover, setOpenAttrPopover] = useState<string | null>(null);
const [attrPopoverSearch, setAttrPopoverSearch] = useState("");

const allAttributes = useQuery(api.tagAttributes.list);
const upsertAttrValue = useMutation(api.tagAttributeValues.upsert);
```

**Step 3: Reset `tagAttrValues` in both reset paths**

In `handleSubmit`, the success path (after `await createTask(args)`) already resets `selectedTags` via `setSelectedTags([])`. Add after that line in **both** the `if (isAutoTitle)` and `else` branches:

```typescript
setTagAttrValues({});
setOpenAttrPopover(null);
```

Also in the manual-mode toggle button `onClick`, after `setSelectedTags([])`, add:

```typescript
setTagAttrValues({});
setOpenAttrPopover(null);
```

**Step 4: Replace tag chips section**

Find the tag chips block (lines ~448-483):

```tsx
{/* Tag chips — always visible, no dropdown needed */}
{predefinedTags && predefinedTags.length > 0 && (
  <div className="flex flex-wrap gap-1.5 mt-2">
    {predefinedTags.map((tag) => {
      ...
      <button
        onClick={() =>
          setSelectedTags((prev) =>
            isSelected
              ? prev.filter((t) => t !== tag.name)
              : [...prev, tag.name]
          )
        }
```

Replace the entire chips block (`{/* Tag chips */}` through the closing `</div>`) with:

```tsx
{/* Tag chips — always visible; chips with attributes open an attribute-value popover */}
{predefinedTags && predefinedTags.length > 0 && (
  <div className="flex flex-wrap gap-1.5 mt-2">
    {predefinedTags.map((tag) => {
      const color = TAG_COLORS[tag.color];
      const isSelected = selectedTags.includes(tag.name);
      const hasAttrs = (tag.attributeIds?.length ?? 0) > 0;
      const attrValues = tagAttrValues[tag.name] ?? {};
      const hasFilledValues =
        isSelected && Object.values(attrValues).some((v) => v !== "");

      // Attributes for this tag, resolved from the catalog
      const tagAttrs = hasAttrs
        ? (tag.attributeIds ?? [])
            .map((id) => allAttributes?.find((a) => a._id === id))
            .filter(Boolean)
        : [];

      const filteredTagAttrs = tagAttrs.filter((a) =>
        a!.name.toLowerCase().includes(attrPopoverSearch.toLowerCase())
      );

      return (
        <Popover
          key={tag.name}
          open={openAttrPopover === tag.name}
          onOpenChange={(open) => {
            if (!open) {
              setOpenAttrPopover(null);
              setAttrPopoverSearch("");
            }
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={tag.name}
              aria-pressed={isSelected}
              onClick={() => {
                if (isSelected) {
                  // Deselect: clear values and close popover
                  setSelectedTags((prev) => prev.filter((t) => t !== tag.name));
                  setTagAttrValues((prev) => {
                    const next = { ...prev };
                    delete next[tag.name];
                    return next;
                  });
                  setOpenAttrPopover(null);
                } else {
                  // Select: open popover if tag has attributes
                  setSelectedTags((prev) => [...prev, tag.name]);
                  if (hasAttrs) {
                    setOpenAttrPopover(tag.name);
                    setAttrPopoverSearch("");
                  }
                }
              }}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors cursor-pointer border ${
                isSelected && color
                  ? `${color.bg} ${color.text} border-transparent`
                  : "bg-transparent text-muted-foreground border-border hover:border-muted-foreground"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  isSelected && color ? color.dot : "bg-muted-foreground"
                }`}
              />
              {tag.name}
              {/* Indicator: filled dot when attribute values are set */}
              {hasFilledValues && (
                <span className="w-1 h-1 rounded-full bg-current opacity-60 ml-0.5" />
              )}
            </button>
          </PopoverTrigger>

          {/* Only render popover content if tag has attributes */}
          {hasAttrs && (
            <PopoverContent className="w-64 p-3 space-y-2" align="start">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {tag.name} attributes
              </p>
              {tagAttrs.length > 2 && (
                <input
                  autoFocus
                  placeholder="Search..."
                  value={attrPopoverSearch}
                  onChange={(e) => setAttrPopoverSearch(e.target.value)}
                  className="w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              )}
              <div className="space-y-2">
                {filteredTagAttrs.map((attr) => {
                  if (!attr) return null;
                  const value = attrValues[attr._id] ?? "";
                  const setValue = (v: string) => {
                    setTagAttrValues((prev) => ({
                      ...prev,
                      [tag.name]: {
                        ...(prev[tag.name] ?? {}),
                        [attr._id]: v,
                      },
                    }));
                  };

                  return (
                    <div key={attr._id} className="space-y-1">
                      <label className="text-xs text-muted-foreground">
                        {attr.name}
                      </label>
                      {attr.type === "select" && attr.options ? (
                        <Select value={value} onValueChange={setValue}>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            {attr.options.map((opt) => (
                              <SelectItem key={opt} value={opt}>
                                {opt}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          type={attr.type === "number" ? "number" : attr.type === "date" ? "date" : "text"}
                          value={value}
                          onChange={(e) => setValue(e.target.value)}
                          className="h-8 text-sm"
                          placeholder={
                            attr.type === "number" ? "0" : attr.type === "date" ? "" : "..."
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </PopoverContent>
          )}
        </Popover>
      );
    })}
  </div>
)}
```

**Step 5: Commit**

```bash
git add dashboard/components/TaskInput.tsx
git commit -m "feat(task-input): attribute value popover on tag chip selection"
```

---

## Task 5 — TaskInput: save attribute values after task creation

**Files:**
- Modify: `dashboard/components/TaskInput.tsx`

**Goal:** After `createTask` returns a `taskId`, call `tagAttributeValues.upsert` in parallel for every non-empty value in `tagAttrValues`.

**Step 1: Add the save helper inside `handleSubmit`**

Both branches of `handleSubmit` (autoTitle and manual) call `await createTask(args)` and store the result in `taskId`. After that line in each branch, add this block **before** the existing reset logic:

```typescript
// Save pre-filled tag attribute values
const attrUpserts: Promise<unknown>[] = [];
for (const [tName, attrMap] of Object.entries(tagAttrValues)) {
  for (const [attrId, value] of Object.entries(attrMap)) {
    if (value.trim() !== "") {
      attrUpserts.push(
        upsertAttrValue({
          taskId,
          tagName: tName,
          attributeId: attrId as Id<"tagAttributes">,
          value,
        })
      );
    }
  }
}
await Promise.all(attrUpserts);
```

**Step 2: Manual smoke test end-to-end**

1. In Tags settings: ensure "bug" tag has "severity" attribute (select: low/medium/high)
2. In TaskInput: click "bug" chip → popover opens with "severity" dropdown
3. Select "high" → chip gets a small extra dot indicator
4. Type a task title and click Create
5. Open the created task in TaskDetailSheet → Config tab → Tag Attributes section shows `severity: high` for the "bug" tag
6. Verify in Convex dashboard that `tagAttributeValues` has a record with the correct `taskId`, `tagName="bug"`, and `value="high"`

**Step 3: Commit**

```bash
git add dashboard/components/TaskInput.tsx
git commit -m "feat(task-input): upsert tag attribute values after task creation"
```

---

## Summary of all changed files

| File | What changed |
|------|--------------|
| `dashboard/convex/schema.ts` | Added `attributeIds` to `taskTags` |
| `dashboard/convex/taskTags.ts` | Added `updateAttributeIds` mutation |
| `dashboard/components/TagsPanel.tsx` | Per-tag attribute-assignment UI (badges + popover picker) |
| `dashboard/components/TaskInput.tsx` | Attribute popover on chip select + post-create upsert |
