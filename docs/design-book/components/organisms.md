# Organisms — Complex Components

Organisms combine atoms and molecules into complete interface sections. Each organism represents a significant piece of the UI with its own internal logic.

---

## StatusCard (base for TaskCard + StepCard)

**Level**: Organism
**Replaces pattern in**: TaskCard (332 lines), StepCard (261 lines)
**Purpose**: Card with accent left border, status badge, title, metadata, and actions. Both TaskCard and StepCard share ~70% of their structure.

### Props

```ts
interface StatusCardProps {
  title: string;
  description?: string;
  status: string;
  tags?: TagChipProps[];
  accentColor: string;           // CSS variable for left border
  progress?: { current: number; total: number };
  metadata?: React.ReactNode;    // agent name, file count, etc.
  actions?: React.ReactNode;     // star, delete, expand buttons
  onDelete?: () => void;         // triggers InlineConfirm
  onClick?: () => void;
  isDraggable?: boolean;
  layoutId?: string;
  className?: string;
}
```

### Visual Spec

```
┌───────────────────────────────────────┐
│▌ Title text here              ☆ 👤 ▾ │  accent left border (3px)
│▌ Description clamp 2 lines...        │
│▌ [tag-chip] [tag-chip]               │
│▌ ● status   3/5 steps         🗑    │
│▌ ▓▓▓▓▓▓▓▓░░░░░  60%                 │  progress bar (if applicable)
└───────────────────────────────────────┘
```

### Token Mapping

| Element | Token | Value |
|---------|-------|-------|
| Container bg | `--card` | `#191919` dark / `#f9f9f9` light |
| Container border | `--border` | Subtle, all sides |
| Left accent | `--status-{status}` | 3px solid |
| Radius | `--radius-lg` | 8px |
| Padding | `p-3` | 12px |
| Gap (internal) | `gap-2` | 8px |
| Title | `--text-body` / `font-semibold` | 15px / 600 |
| Description | `--text-small` / `--muted-foreground` | 13px, 2-line clamp |
| Shadow (default) | none | — |
| Shadow (hover) | `--shadow-sm` | Subtle lift |
| Transition | `transition-shadow` | `--duration-fast` |

### Progress Bar

```
Container: h-1.5 rounded-full bg-[--muted]
Fill:      h-full rounded-full bg-[--status-{status}] transition-[width] duration-300
```

### Delete Flow
1. User clicks trash icon
2. `InlineConfirm` molecule animates open below the card content
3. "Yes" triggers `onDelete`, "No" closes confirm
4. **AnimatePresence** wraps the InlineConfirm

### Drag State
- While dragging: `opacity-50`, layout animation disabled
- Drop target: `ring-2 ring-[--primary]/30`

### TaskCard (extends StatusCard)

Additional features specific to tasks:
- Favorite star (toggle, yellow when active)
- Agent assignment indicator (AgentAvatar `xs` + name)
- HITL badge (if human-in-the-loop)
- Stalled/Crashed badges
- Inline rejection UI (TextArea + send)

### StepCard (extends StatusCard)

Additional features specific to steps:
- Parent task name (link)
- Agent initials avatar (square, not circle)
- "Accept" / "Mark Done" buttons for human steps
- Blocked-by indicator

---

## KanbanColumn

**Level**: Organism
**File**: `components/KanbanColumn.tsx` (319 lines)
**Purpose**: Single column in the kanban board containing StatusCards.

### Visual Spec

```
┌────────────────────────────┐
│ ● Column Name           5  │  colored dot + title + count badge
├────────────────────────────┤
│                            │
│  ┌ StatusCard ──────────┐  │
│  └──────────────────────┘  │
│  gap-3                     │
│  ┌ StatusCard ──────────┐  │
│  └──────────────────────┘  │
│                            │
│  ┌ StatusCard ──────────┐  │
│  └──────────────────────┘  │
│                            │
└────────────────────────────┘
```

| Element | Token |
|---------|-------|
| Container bg | `--card` at 40% opacity (subtle surface) |
| Container border | `--border` at 70% opacity |
| Container radius | `--radius-lg` (8px) |
| Header | `--text-heading` (16px) / `font-semibold` |
| Count badge | Badge `secondary` variant |
| Status dot | 8px circle, `--status-{column}` color |
| Card gap | `gap-3` (12px) |
| Padding | `p-3` (12px) |
| Scroll | Hidden scrollbar, native overflow-y-auto |
| Mobile | `w-[85vw] snap-center` |

### Collapsible Groups

Within a column, cards can be grouped by tag:

```
▶ tag-name                    5
  ┌ card ┐ ┌ card ┐ ┌ card ┐
```

- Group header: Chevron + tag name + count
- Chevron rotates 90° on expand (`transition-transform --duration-fast`)
- Cards inside group animate in/out with `AnimatePresence`

---

## TaskDetailSheet

**Level**: Organism
**File**: `features/tasks/components/TaskDetailSheet.tsx` (788 lines)
**Purpose**: Full task detail view opened as a right-side sheet.

### Visual Spec

```
┌──────────────────────────────────────────────┐
│ Task Title Here                          ✕   │
│ ● status  Squad: Name  Workflow: name    🗑  │
│ ┌ Description ─────────────────────────────┐ │
│ │ Add description...                    ✏  │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ ┌─ Thread ── Plan ── Config ── Files ──────┐ │
│ │                                          │ │
│ │  [Tab content area]                      │ │
│ │  ScrollArea flex-1                       │ │
│ │                                          │ │
│ │                                          │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ ┌ ThreadInput (when Thread tab active) ────┐ │
│ │ Reply  [agent selector]                  │ │
│ │ ┌ textarea ────────────────── ▶ 📎 ┐    │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

### Token Mapping

| Element | Token |
|---------|-------|
| Sheet width | `w-[90vw] sm:w-[50vw] sm:max-w-none` |
| Sheet bg | `--background` |
| Sheet border | `border-l --border` |
| Title | `--text-title` (22px) / `font-semibold` |
| Status badge | `StatusBadge` molecule |
| Squad/Workflow pills | Badge `outline` variant |
| Tabs | Tabs atom |
| Tab content | `ScrollArea flex-1 px-6 py-4` |

### Tabs

| Tab | Content |
|-----|---------|
| Thread | ThreadMessage list + ThreadInput at bottom |
| Execution Plan | ReactFlow canvas + step counter + view toggle |
| Live | ProviderLiveChatPanel (only when session active) |
| Config | Merge section + trust level + tags |
| Files | File list with upload area |

---

## AgentConfigSheet

**Level**: Organism
**File**: `features/agents/components/AgentConfigSheet.tsx` (1089 lines — decomposition needed)
**Purpose**: Agent configuration editor in a right-side sheet.

### Visual Spec

```
┌──────────────────────────────────┐
│ [Avatar lg]  Agent Name          │
│              ● idle    [Active ◯]│
├──────────────────────────────────┤
│ Name         [input]             │
│ Display Name [input]             │
│ Role         [input]             │
│                                  │
│ Prompt       [textarea]    ✏ Edit│
│                                  │
│ Soul         [textarea]    ✏ Edit│
│                                  │
│ Model        [select ▾]         │
│                                  │
│ Skills       [selected] [+]      │
│ Memory       [preview]           │
├──────────────────────────────────┤
│           [Cancel]  [Save]       │
└──────────────────────────────────┘
```

| Element | Token |
|---------|-------|
| Sheet width | Medium (480px) |
| Avatar | `AgentAvatar` molecule, `lg` size |
| Active toggle | Switch atom |
| Form fields | Input atom (stacked, `gap-4`) |
| Prompt/Soul textarea | Textarea `lg`, `font-mono` |
| Edit link | `text-[--primary] text-[--text-small]` |
| Model select | Select atom |
| Footer | `border-t px-6 py-4 flex justify-end gap-2` |
| Cancel button | Button `secondary` |
| Save button | Button `default` |

### Decomposition Targets

This component should be split into sub-components:
- `AgentConfigHeader` — avatar + name + status + toggle (~80 lines)
- `AgentConfigForm` — name, role, prompt, soul fields (~200 lines)
- `AgentModelSelector` — model + reasoning level + mode (~150 lines)
- `AgentSkillsSection` — skills multi-select (~80 lines)
- `AgentMemoryPreview` — memory/history read-only display (~80 lines)

---

## SquadDetailSheet

**Level**: Organism
**File**: `features/agents/components/SquadDetailSheet.tsx` (528 lines)
**Purpose**: Squad overview with agents, workflow canvas, and actions.

### Visual Spec

```
┌───────────────────────────────────────────────────────────────┐
│ Squad Name  [published]         [Edit Squad] [Run Mission]  ✕ │
│ Description text here                                         │
├───────────────────────────────────────────────────────────────┤
│ Outcome                                                       │
│ Expected outcome description                                  │
│                                                               │
│ Agents (5)                                                    │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                      │
│ │ 🤖 Name  │ │ 🤖 Name  │ │ 🤖 Name  │  agent cards (grid)  │
│ │ Role     │ │ Role     │ │ Role     │                      │
│ │ ▾ skills │ │          │ │          │                      │
│ └──────────┘ └──────────┘ └──────────┘                      │
│                                                               │
│ Workflows  content-creation                                   │
│ ┌─ Workflow ── Steps ── Criteria ────────────────────────────┐│
│ │                                                            ││
│ │  [START] → [Step 1] → [Step 2] ──→ [Step 3] → [END]     ││
│ │                    ↘ [Step 2b] ↗                          ││
│ │                                                            ││
│ └────────────────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────────────┘
```

| Element | Token |
|---------|-------|
| Sheet width | Full (96vw / max-w-6xl) |
| Title | `--text-title` (22px) / `font-semibold` |
| Published badge | Badge `default` |
| Action buttons | Button `outline` (Edit) + Button `default` (Run Mission) |
| Agent cards | `--card` bg, `--border`, `--radius-lg`, Bot icon + name + role |
| Agent grid | `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3` |
| Workflow tabs | Tabs atom (Workflow / Steps / Criteria) |
| Canvas | ReactFlow with FlowStepNode, `--card` bg, `--border` |

---

## TaskListSheet (unifies DoneTasksSheet + TrashBinSheet)

**Level**: Organism
**Replaces**: DoneTasksSheet (131 lines) + TrashBinSheet (128 lines) — ~80% identical
**Purpose**: Generic scrollable list of tasks with action buttons.

### Props

```ts
interface TaskListSheetProps {
  title: string;
  icon: React.ReactNode;
  tasks: Task[];
  emptyMessage: string;
  actions: (task: Task) => React.ReactNode;  // Restore, Delete, etc.
  badge?: (task: Task) => React.ReactNode;   // "On board", "Cleared", prev status
}
```

### Visual Spec

```
┌──────────────────────────────────┐
│ ✓ Done Tasks               30   │
├──────────────────────────────────┤
│ ┌ Task row ────────────────────┐ │
│ │ Title          On board  ↩ 🗑│ │
│ └──────────────────────────────┘ │
│ ┌ Task row ────────────────────┐ │
│ │ Title          Cleared   ↩ 🗑│ │
│ └──────────────────────────────┘ │
│ ...                              │
└──────────────────────────────────┘
```

| Element | Token |
|---------|-------|
| Sheet width | Medium (480px) |
| Header icon | CheckCircle2 (done) or Trash2 (trash) |
| Count badge | Badge `secondary` |
| Task row | `border-b --border`, `px-4 py-3` |
| Title | `--text-body` / `font-medium` |
| Time | `--text-micro` / `--muted-foreground` |
| Restore button | Button `ghost` `icon-sm` with RotateCcw |
| Delete button | Button `ghost` `icon-sm` with Trash2, `hover:text-[--destructive]` |

---

## ActivityFeedPanel

**Level**: Organism
**File**: `features/activity/components/ActivityFeedPanel.tsx` (91 lines)
**Purpose**: Collapsible right-side panel showing real-time events.

### Visual Spec

```
┌────────────────────────────────┐
│ ACTIVITY                    ◀  │  collapse button
├────────────────────────────────┤
│ 12:30 PM                      │
│ ● Agent registered: MC         │
│                                │
│ 12:31 PM                      │
│ ● Task moved to in_progress   │
│                                │
│ 12:32 PM                      │
│ ● Step completed: Research     │
│                                │
│ ...                            │
└────────────────────────────────┘
```

| Element | Token |
|---------|-------|
| Panel width (activity) | 280px |
| Panel width (chats) | 420px |
| Header | `--text-micro` / uppercase / `tracking-wider` / `--muted-foreground` |
| Collapse button | Button `ghost` `icon-sm` |
| Event timestamp | `--text-micro` / `--muted-foreground` |
| Event dot | `h-1.5 w-1.5 rounded-full` / status-colored |
| Event text | `--text-small` |
| Event gap | `gap-3` between events |
| Fade-in | `motion.div` opacity 0→1, `--duration-normal` |
