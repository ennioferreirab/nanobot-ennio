# Merged Thread Group Collapse Design

## Summary

Add a single toggle button to the sticky merged-thread header so the entire merged-source group can be collapsed or expanded without affecting the live thread messages below it.

## Decisions

| Decision | Choice |
|----------|--------|
| Toggle scope | Collapse/expand the entire merged-source group |
| Header visibility | Keep the sticky header always visible |
| Default state | Expanded on initial render |
| Button label | `Collapse` when open, `Expand` when closed |
| Data/model changes | None |

## Architecture

The existing sticky merged-thread area already separates old merged-source content from the live thread feed. This change adds one local UI state in `TaskDetailSheet` to gate the visibility of the merged-source list:

1. Keep the sticky container rendered whenever `mergeSourceThreads.length > 0`.
2. Add a compact header row inside that sticky container with a title and a toggle button.
3. Render the per-source `details` list only when the group is expanded.
4. Leave the live thread message container and bottom sentinel unchanged so scroll behavior remains scoped to the current thread.

## Rendering Model

Inside the sticky merged-thread container:

- Header row
  - title describing the hidden content (`Merged threads`)
  - button toggling between `Collapse` and `Expand`
- Conditional body
  - existing `Thread A/B/...` sections only when expanded

When collapsed, the sticky block shrinks to the header only and reserves no extra vertical space.

## Error Handling And UX Notes

- The toggle is local UI state only, so no persistence across task opens is required.
- The button must remain visible in both states so the user can recover from collapsing the group.
- Existing tests that expect `Thread A/B/...` by default still pass because the default state remains expanded.

## Files Touched

| File | Change |
|------|--------|
| `dashboard/features/tasks/components/TaskDetailSheet.tsx` | Add collapsed state and sticky header toggle |
| `dashboard/components/TaskDetailSheet.test.tsx` | Add collapse/expand regression test for the sticky merged-thread group |
