# Atoms — Primitive Components

Base building blocks. Each atom is a single UI element that cannot be broken down further.

---

## Button

**Level**: Atom
**File**: `components/ui/button.tsx`
**Current**: 6 variants (default, destructive, outline, secondary, ghost, link). 4 sizes. `link` never used. 12+ instances override default with hardcoded green for approve/success actions.
**Changes**: Add `success` and `warning` variants. Remove `link`. All green button overrides become `variant="success"`. All amber/orange overrides become `variant="warning"`.

### Variants

| Variant | Background | Text | Border | Hover | Use Case |
|---------|-----------|------|--------|-------|----------|
| `default` | `--primary` (#2383e2) | `--primary-foreground` (white) | none | bg 90% opacity | Primary CTA: Create, Save, Send |
| `secondary` | `--secondary` (#222) | `--secondary-foreground` (#eee) | none | bg lightens | Secondary actions: Cancel, Close |
| `destructive` | `--destructive` (#da3633) | white | none | bg 90% opacity | Danger: Delete, Deny, Remove |
| `success` | `--success` (#2ea043) | white | none | bg 90% opacity | **NEW** — Approve, Resume, Start, Confirm |
| `warning` | `--warning` (#d29922) | white | none | bg 90% opacity | **NEW** — Retry, Pause, Review actions |
| `outline` | transparent | `--foreground` | `--border` | bg `--accent` | Download, tertiary actions |
| `ghost` | transparent | `--foreground` | none | bg `--accent` | Icon buttons, subtle actions |

### Sizes

| Size | Height | Padding H | Font | Icon | Tailwind |
|------|--------|-----------|------|------|----------|
| `sm` | 32px | 12px | `--text-small` (13px) | 14px | `h-8 px-3 text-sm` |
| `default` | 36px | 16px | `--text-body` (15px) | 16px | `h-9 px-4` |
| `lg` | 40px | 20px | `--text-body` (15px) | 18px | `h-10 px-5` |
| `icon` | 36px | 0 | — | 16px | `h-9 w-9` |
| `icon-sm` | 28px | 0 | — | 14px | `h-7 w-7` |

### States

| State | Change | Duration |
|-------|--------|----------|
| hover | Background opacity 90% | `--duration-fast` (100ms) |
| active | `scale(0.98)` | `--duration-fast` (100ms) |
| focus-visible | `ring-2 ring-[--ring] ring-offset-2 ring-offset-[--background]` | instant |
| disabled | `opacity-50`, `pointer-events-none` | — |
| loading | Icon replaced with `Loader2 animate-spin`, text stays | — |

### Radius
Default: `--radius` (8px) via `rounded-lg`

### Dark Mode
No special adjustments — tokens handle it.

### Accessibility
- Focus ring visible in both themes
- `aria-disabled` when disabled (not just `disabled` attr)
- Icon-only buttons require `aria-label`
- Loading state: add `aria-busy="true"`

---

## Badge

**Level**: Atom
**File**: `components/ui/badge.tsx`
**Current**: 4 variants (default, secondary, destructive, outline). `destructive` never used. Status badges hardcoded per-component.
**Changes**: Add `success`, `warning`, `info` variants. Add `status` variant that accepts a `status` prop and reads from `--status-*` tokens. Remove `destructive` (use outline + destructive color if needed).

### Variants

| Variant | Background | Text | Border | Use Case |
|---------|-----------|------|--------|----------|
| `default` | `--primary` | `--primary-foreground` | none | General labels |
| `secondary` | `--secondary` | `--secondary-foreground` | none | Counts, metadata (column count, file count) |
| `outline` | transparent | `--foreground` | `--border` | Step numbers, subtle labels, paused/awaiting |
| `success` | `--success/15%` | `--success` | none | **NEW** — Done, completed, approved |
| `warning` | `--warning/15%` | `--warning` | none | **NEW** — Review, retrying, attention |
| `info` | `--info/15%` | `--info` | none | **NEW** — Informational, assigned |

### Status Badge (special variant)

A dedicated variant for task/step/agent status that reads from centralized tokens:

```tsx
<Badge variant="status" status="done" />     // green
<Badge variant="status" status="review" />   // amber
<Badge variant="status" status="inbox" />    // violet
<Badge variant="status" status="error" />    // red
```

Implementation:
```tsx
status === "done"    → bg: --status-done-muted, text: --status-done-foreground
status === "review"  → bg: --status-review-muted, text: --status-review-foreground
// ... etc for all 7 statuses
```

### Size
Single size: `px-2.5 py-0.5 text-[--text-micro] (11px) font-medium rounded-[--radius-sm] (4px)`

### Accessibility
- `aria-label` should describe status in words, not just show color
- No interactive states (badges are not clickable)

---

## Input

**Level**: Atom
**File**: `components/ui/input.tsx`
**Current**: Single size (h-9). No error state. No size variants.
**Changes**: Add size variants. Add error state. Improve focus styling.

### Sizes

| Size | Height | Font | Padding | Use |
|------|--------|------|---------|-----|
| `sm` | 32px | `--text-small` (13px) | px-2.5 | Compact forms, filters |
| `default` | 36px | `--text-body` (15px) | px-3 | Default forms |
| `lg` | 40px | `--text-body` (15px) | px-4 | Prominent inputs, search |

### States

| State | Styling |
|-------|---------|
| default | `border-[--input] bg-transparent` |
| hover | `border-[--foreground]/20` |
| focus | `ring-2 ring-[--ring] border-transparent` |
| error | `border-[--destructive] ring-[--destructive]/20` + `aria-invalid="true"` |
| disabled | `opacity-50 cursor-not-allowed` |
| placeholder | `text-[--muted-foreground]` |

### Radius
`--radius-md` (6px) — slightly smaller than buttons to visually differentiate.

---

## Textarea

**Level**: Atom
**File**: `components/ui/textarea.tsx`
**Current**: Fixed min-height 60px. No size variants.
**Changes**: Match Input sizing/styling. Add auto-resize option.

### Sizes

| Size | Min Height | Font | Padding |
|------|-----------|------|---------|
| `sm` | 60px | `--text-small` | p-2.5 |
| `default` | 80px | `--text-body` | p-3 |
| `lg` | 120px | `--text-body` | p-4 |

States: Same as Input.
Radius: `--radius-md` (6px).

---

## Avatar

**Level**: Atom
**File**: `components/ui/avatar.tsx`
**Current**: Fixed `h-10 w-10`. Color assigned by hash in AgentSidebarItem.
**Changes**: Add size scale. Standardize color assignment.

### Sizes

| Size | Dimensions | Font | Use |
|------|-----------|------|-----|
| `xs` | 24px | 10px | Inline mentions, compact lists |
| `sm` | 32px | 12px | Sidebar items, card metadata |
| `md` | 40px | 14px | Default, sheet headers |
| `lg` | 48px | 16px | Agent config header |
| `xl` | 64px | 20px | Profile views (future) |

### Color Assignment

8-color palette based on name hash:

```ts
const AVATAR_COLORS = [
  'hsl(211 73% 51%)',  // blue
  'hsl(262 83% 58%)',  // violet
  'hsl(330 81% 55%)',  // pink
  'hsl(24 90% 50%)',   // orange
  'hsl(142 52% 45%)',  // green
  'hsl(187 72% 45%)',  // cyan
  'hsl(39 72% 49%)',   // amber
  'hsl(0 72% 50%)',    // red
];
```

### Structure
- Circle: `rounded-full overflow-hidden`
- Initials: 2 characters, uppercase, `font-semibold`, white text
- Image: `aspect-square object-cover`
- Fallback: `bg-muted flex items-center justify-center`

---

## Checkbox

**Level**: Atom
**File**: `components/ui/checkbox.tsx`
**Current**: `h-4 w-4`, primary border/fill. Works fine.
**Changes**: Minimal — ensure focus ring matches system. Size stays at 16px.

### States
| State | Styling |
|-------|---------|
| unchecked | `border-[--border]` |
| checked | `bg-[--primary] border-[--primary] text-white` |
| hover | `border-[--foreground]/30` |
| focus-visible | `ring-2 ring-[--ring]` |
| disabled | `opacity-50` |

---

## Switch

**Level**: Atom
**File**: `components/ui/switch.tsx`
**Current**: `h-5 w-9`, primary colors. Works fine.
**Changes**: Minimal — match focus ring.

### States
| State | Track | Thumb |
|-------|-------|-------|
| off | `bg-[--input]` | white, left |
| on | `bg-[--primary]` | white, right (translate-x-4) |
| focus-visible | `ring-2 ring-[--ring]` | — |
| disabled | `opacity-50` | — |

---

## Select

**Level**: Atom
**File**: `components/ui/select.tsx`
**Current**: Height h-9, chevron down indicator. Works with Radix.
**Changes**: Match Input sizing system. Add `sm`/`lg` variants.

Sizes: Same as Input (sm: 32px, default: 36px, lg: 40px).
Trigger radius: `--radius-md` (6px).
Content radius: `--radius-lg` (8px).

---

## Separator

**Level**: Atom
**File**: `components/ui/separator.tsx`
**Current**: `bg-border`. Works perfectly.
**Changes**: None.

---

## Tabs

**Level**: Atom
**File**: `components/ui/tabs.tsx`
**Current**: h-9 list, rounded-lg, muted bg. Active tab has background + shadow.
**Changes**: Refine typography. Active tab more prominent.

### Styling

| Element | Styling |
|---------|---------|
| TabsList | `bg-[--muted] rounded-[--radius-lg] p-1` |
| TabsTrigger (default) | `text-[--muted-foreground] text-[--text-small] font-medium px-3 py-1.5` |
| TabsTrigger (active) | `bg-[--background] text-[--foreground] shadow-sm font-semibold` |
| TabsTrigger (hover) | `text-[--foreground]/70` |
| TabsContent | `mt-3` |

---

## Tooltip

**Level**: Atom
**File**: `components/ui/tooltip.tsx`
**Current**: `bg-primary px-3 py-1.5 text-xs`. Works fine.
**Changes**: Use `--muted` bg instead of `--primary` for less visual weight.

| Element | Styling |
|---------|---------|
| Content | `bg-[--foreground] text-[--background] rounded-[--radius-md] px-3 py-1.5 text-[--text-micro] shadow-md` |

Inverted colors (light tooltip on dark, dark on light) for maximum contrast.

---

## Skeleton

**Level**: Atom
**File**: `components/ui/skeleton.tsx`
**Current**: `animate-pulse rounded-md bg-primary/10`. Works fine.
**Changes**: Use `bg-[--muted]` for consistency.

```css
.skeleton {
  background: hsl(var(--muted));
  border-radius: var(--radius-md);
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
```
