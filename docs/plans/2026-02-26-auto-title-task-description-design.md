# Auto-Title + Task Description

## Problem
Task creation only has a title field. Users need to add descriptions, and want AI-generated titles from descriptions using the configured low-tier model.

## Design

### Flow
1. User enables "Auto Title" globally in Settings
2. TaskInput shows only a description textarea (title field hidden)
3. On submit: task created instantly with truncated placeholder title + full description + `autoTitle: true`
4. Gateway orchestrator detects `autoTitle`, calls standard-low tier LLM to generate concise title
5. Title patched back to Convex — dashboard updates reactively
6. Orchestrator continues normal planning flow with the real title

### Schema Change
- Add `autoTitle: v.optional(v.boolean())` to tasks table

### Settings
- New key: `auto_title_enabled` (string `"true"/"false"`, default `"false"`)
- Toggle in SettingsPanel

### UI (TaskInput.tsx)
- Read `auto_title_enabled` from settings query
- **Auto Title ON**: hide title input, show textarea for description
  - Submit: `title = description.slice(0, 80) + "..."`, `description = fullText`, `autoTitle = true`
- **Auto Title OFF**: show title input + description textarea
  - Submit: `title = titleValue`, `description = descValue`

### Gateway (orchestrator.py)
- In `_process_planning_task()`, before calling planner:
  - If `autoTitle == true`: resolve `standard-low` model from `model_tiers` setting, call LLM, patch title
  - Then continue with normal planning

### Agent Dispatch Format (executor.py)
- In `_run_agent_on_task()`:
  - When description exists: `<title>{title}</title>\n<description>{description}</description>`
  - When no description: just `{title}` (backward compatible)

### No New Infrastructure
- No new HTTP endpoints
- No new Convex tables
- No new subscriptions
- Uses existing orchestrator flow + bridge mutations
