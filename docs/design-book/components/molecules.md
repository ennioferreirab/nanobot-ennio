# Molecules — Composed Components

Molecules combine 2+ atoms into a reusable pattern. Each molecule listed here replaces duplicated code found across the codebase.

---

## TagChip

**Level**: Molecule
**Currently duplicated in**: TaskCard, TaskDetailHeader, TaskDetailConfigTab, TaskInput, SearchBar, TagsPanel (6 files)
**Purpose**: Colored dot + label in a rounded pill. Used for task tags.

### Props

```ts
interface TagChipProps {
  color: 'blue' | 'green' | 'red' | 'amber' | 'violet' | 'pink' | 'orange' | 'teal';
  label: string;
  onRemove?: () => void;   // shows X button
  size?: 'sm' | 'default';
  className?: string;
}
```

### Visual Spec

```
┌──────────────────────┐
│ ● label           ✕  │
└──────────────────────┘
```

| Element | Token | Value |
|---------|-------|-------|
| Container | `bg-[--tag-{color}-muted]` | Tinted bg |
| Container radius | `--radius-full` | `rounded-full` |
| Container padding | — | `px-2 py-0.5` |
| Dot | `bg-[--tag-{color}]` | Solid color circle |
| Dot size | — | `h-1.5 w-1.5 rounded-full` |
| Label | `text-[--tag-{color}-foreground]` | `text-[--text-micro] (11px) font-medium` |
| Remove (X) | `text-[--tag-{color}-foreground]/50` | `h-3 w-3`, hover: full opacity |
| Gap | — | `gap-1.5` |

### Size Variant

| Size | Padding | Font | Dot |
|------|---------|------|-----|
| `sm` | `px-1.5 py-0` | 10px | `h-1 w-1` |
| `default` | `px-2 py-0.5` | 11px | `h-1.5 w-1.5` |

### States
- Default: as above
- Hover (when `onRemove`): X icon appears/brightens
- No focus/active (not interactive unless removable)

---

## StatusBadge

**Level**: Molecule
**Currently duplicated in**: TaskCard, StepCard, FlowStepNode, KanbanColumn, DoneTasksSheet, TrashBinSheet (6+ files)
**Purpose**: A badge that displays task/step status using centralized status tokens.

### Props

```ts
interface StatusBadgeProps {
  status: 'inbox' | 'assigned' | 'in_progress' | 'review' | 'retrying' | 'done' | 'crashed' | 'deleted' |
          'planned' | 'running' | 'completed' | 'blocked' | 'waiting_human';
  size?: 'sm' | 'default';
  className?: string;
}
```

### Visual Spec

```
┌──────────────┐
│  status text  │
└──────────────┘
```

| Element | Token |
|---------|-------|
| Background | `--status-{mapped}-muted` |
| Text | `--status-{mapped}-foreground` |
| Font | `--text-micro` (11px), `font-medium`, `uppercase` |
| Padding | `px-2 py-0.5` |
| Radius | `--radius-sm` (4px) |

### Status Mapping

| Input Status | Maps To | Color Family |
|-------------|---------|-------------|
| inbox | inbox | violet |
| assigned | assigned | cyan |
| in_progress, running | progress | blue |
| review, retrying, blocked, waiting_human | review | amber |
| done, completed | done | green |
| crashed | error | red |
| deleted | deleted | gray |

### Dot Variant

Optional leading dot (colored circle) for inline usage:

```tsx
<StatusBadge status="done" dot />
// renders: ● done
```

---

## InlineConfirm

**Level**: Molecule
**Currently duplicated in**: TaskCard, StepCard, KanbanColumn (3 files)
**Purpose**: Animated expand bar asking "Are you sure?" with confirm/cancel buttons.

### Props

```ts
interface InlineConfirmProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  message?: string;          // default: "Are you sure?"
  confirmLabel?: string;     // default: "Yes"
  cancelLabel?: string;      // default: "No"
  variant?: 'destructive' | 'warning';  // default: destructive
}
```

### Visual Spec

```
┌─────────────────────────────────────┐
│  Are you sure?      [No]    [Yes]  │
└─────────────────────────────────────┘
```

| Element | Token |
|---------|-------|
| Container bg | `--destructive/10` or `--warning/10` |
| Container border-top | `--destructive/20` or `--warning/20` |
| Container padding | `px-3 py-2` |
| Message | `text-[--text-small] text-[--foreground]` |
| Confirm button | `variant="destructive"` or `variant="warning"`, `size="sm"` |
| Cancel button | `variant="ghost" size="sm"` |

### Animation

**Requires `AnimatePresence` wrapper** (this is the fix for the broken exit animations):

```tsx
<AnimatePresence>
  {open && (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
    >
      {/* content */}
    </motion.div>
  )}
</AnimatePresence>
```

---

## TerminalHeader

**Level**: Molecule
**Currently duplicated in**: InteractiveTerminalPanel, TerminalPanel, ProviderLiveChatPanel, AgentActivityFeed (4 files)
**Purpose**: Dark terminal-style header bar with agent name, provider, and status indicator.

### Props

```ts
interface TerminalHeaderProps {
  agentName: string;
  provider?: string;
  status: 'active' | 'idle' | 'streaming' | 'completed' | 'error' | 'starting' | 'connecting';
  sessionId?: string;
  onClose?: () => void;
  children?: React.ReactNode;  // extra controls (buttons)
}
```

### Visual Spec

```
┌──────────────────────────────────────────────────────────┐
│  LIVE  @agent-name  provider   ● Streaming  a1b2c3...  ✕│
└──────────────────────────────────────────────────────────┘
```

| Element | Styling |
|---------|---------|
| Container | `bg-zinc-950 border-b border-zinc-800 px-3 py-2 flex items-center justify-between` |
| "LIVE" label | `text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-400` |
| Agent name | `text-xs text-zinc-500` |
| Provider pill | `rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-400` |
| Status dot + label | Color by status (see below) |
| Session ID | `text-zinc-500 text-[11px]` first 16 chars |
| Close button | `ghost` button, `text-zinc-400 hover:text-zinc-100` |

### Status Colors

| Status | Dot | Label | Background |
|--------|-----|-------|-----------|
| active, streaming | `bg-emerald-400` pulse | `text-emerald-300` | `bg-emerald-500/10` |
| completed | `bg-blue-400` | `text-blue-300` | `bg-blue-500/10` |
| error | `bg-red-400` | `text-red-300` | `bg-red-500/10` |
| starting, connecting | `bg-amber-400` pulse | `text-amber-300` | `bg-amber-500/10` |
| idle | `bg-zinc-500` | `text-zinc-400` | `bg-zinc-800` |

**Note**: This component always uses the dark terminal theme (zinc-950) regardless of the app's light/dark mode. This is intentional.

---

## SearchBar

**Level**: Molecule
**File**: `features/search/components/SearchBar.tsx`
**Current**: Search icon + input + filter popover with tag chips. 253 lines.
**Changes**: Use `TagChip` component. Use Input `size="lg"`. Simplify filter popover.

### Visual Spec

```
┌──────────────────────────────────────────────┐
│ 🔍  Search tasks...                     ⚙   │
└──────────────────────────────────────────────┘
  ┌ Filter popover ─────────────────────┐
  │ Tags:  [chip] [chip] [chip]         │
  │ Attributes: [key] = [value] [Apply] │
  └─────────────────────────────────────┘
```

| Element | Token |
|---------|-------|
| Container | Same as Input `lg` |
| Search icon | `text-[--muted-foreground]` 18px |
| Placeholder | `text-[--muted-foreground]` |
| Filter icon | ghost icon button |
| Active filter indicator | ring around filter icon |
| Keyboard shortcut | `/` to focus (show hint in placeholder) |

---

## FileChip

**Level**: Molecule
**File**: `components/FileChip.tsx`
**Current**: Rounded pill with paperclip icon, file name, size, optional remove. 79 lines.
**Changes**: Standardize sizing, use `--radius-full`.

### Visual Spec

```
┌─────────────────────────┐
│ 📎 file.md  2KB     ✕  │
└─────────────────────────┘
```

| Element | Token |
|---------|-------|
| Container | `bg-[--muted] rounded-full px-2.5 py-1 text-[--text-micro]` |
| Icon | File type icon (FileText, Image, FileCode), `14px` |
| Name | `text-[--foreground] font-medium` truncated |
| Size | `text-[--muted-foreground]` |
| Remove | `X` icon, `hover:text-[--destructive]` |
| Gap | `gap-1.5` |

---

## AgentAvatar

**Level**: Molecule
**Purpose**: Avatar circle + status dot. Used throughout the sidebar and cards.

### Props

```ts
interface AgentAvatarProps {
  name: string;
  status?: 'active' | 'idle' | 'crashed';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}
```

### Visual Spec

```
  ┌────┐
  │ MC │ ●  ← status dot
  └────┘
```

| Element | Token |
|---------|-------|
| Circle | Avatar atom with hash-based color |
| Initials | 2 chars, uppercase, white, `font-semibold` |
| Status dot | `h-2 w-2 rounded-full absolute -bottom-0.5 -right-0.5` |
| Dot active | `bg-blue-500 shadow-[0_0_6px_hsl(var(--status-progress)/0.5)]` |
| Dot crashed | `bg-red-500 shadow-[0_0_6px_hsl(var(--status-error)/0.5)]` |
| Dot idle | `bg-[--muted-foreground]` (no glow) |
