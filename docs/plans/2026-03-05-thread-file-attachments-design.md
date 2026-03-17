# Thread File Attachments — Design

## Summary

Allow users to attach documents (PDF, images, code, text files) to individual thread messages. Files are stored using the existing filesystem-based upload infrastructure, referenced both at the message level (for thread context) and task level (for the Files tab).

## Decisions

| Decision | Choice |
|----------|--------|
| Storage | Hybrid — filesystem (`~/.nanobot/tasks/{taskId}/attachments/`) + Convex metadata |
| File types | PDF, images (PNG/JPG/GIF/WebP), docs (TXT/MD/CSV/JSON), code files |
| Size limit | 10MB per file, max 5 files per message |
| Message linking | `fileAttachments` field on `messages` table |
| Task-level visibility | Files also added to `task.files` (appear in Files tab) |
| Composer UX | Clip button + drag & drop |
| Display in thread | Simple chips — icon + name + size, clickable for download |

## Architecture

```
User selects/drags files in ThreadInput
  -> Client-side validation (10MB/file, max 5)
  -> POST /api/tasks/{taskId}/files (existing endpoint)
  -> addTaskFiles() mutation (appears in Files tab)
  -> Message mutation receives fileAttachments metadata
  -> Message saved with file references
  -> ThreadMessage renders file chips
  -> MC thread_context.py includes references in agent context
```

## Schema Change — `messages` table

Add optional field to `dashboard/convex/schema.ts`:

```typescript
fileAttachments: v.optional(v.array(v.object({
  name: v.string(),     // "report.pdf"
  type: v.string(),     // "application/pdf"
  size: v.number(),     // bytes
})))
```

No `storageId` needed — the file lives in `~/.nanobot/tasks/{taskId}/attachments/` and is served by the existing GET route. The message's `taskId` resolves the path.

## Mutations — `messages.ts`

Extend the 3 user-facing mutations to accept optional `fileAttachments`:

- `sendThreadMessage()` — initial message assigning task to agent
- `postUserPlanMessage()` — reply during plan negotiation / in_progress
- `postComment()` — inert comment

Each passes `fileAttachments` through to the internal `create()` mutation.

## Upload API — `route.ts`

Add server-side size validation to the existing POST endpoint:

- Reject files > 10MB with HTTP 413
- No change to storage path or response format

## Frontend — `ThreadInput.tsx`

- Clip button next to send button — opens file picker
- Drag & drop on textarea area — `onDragOver`/`onDrop` handlers
- Preview chips between textarea and send button — icon + name + X to remove
- Max 5 files per message (client-side validation)
- Send flow: upload files -> `addTaskFiles()` -> message mutation with `fileAttachments`

## Frontend — `ThreadMessage.tsx`

- If `message.fileAttachments` present, render chip list below content
- Each chip: icon (reuse `FileIcon` from `StepFileAttachment`) + name + humanized size
- Clickable -> opens `GET /api/tasks/{taskId}/files/attachments/{filename}` in new tab

## Shared Components

Extract from `StepFileAttachment`:

- `useFileUpload(taskId)` hook — upload logic, validation, state management
- `FileChip` component — icon + name + action (X to remove or download link)

Both `ThreadInput` and `StepFileAttachment` reuse these.

## MC Backend — `thread_context.py`

When formatting user messages that have attachments, include file references:

```
[User] (attached: report.pdf, screenshot.png): Analyze this report...
```

The agent already has filesystem access to `attachments/` via `output_enricher.py`.

## Files Touched

| File | Change |
|------|--------|
| `dashboard/convex/schema.ts` | Add `fileAttachments` to messages table |
| `dashboard/convex/messages.ts` | Extend user mutations with `fileAttachments` param |
| `dashboard/app/api/tasks/[taskId]/files/route.ts` | Add 10MB size validation |
| `dashboard/components/ThreadInput.tsx` | Add clip button, drag & drop, file chips |
| `dashboard/components/ThreadMessage.tsx` | Render file attachment chips |
| `dashboard/components/StepFileAttachment.tsx` | Refactor to use shared hook/component |
| `dashboard/components/FileChip.tsx` | New — shared file chip component |
| `dashboard/hooks/useFileUpload.ts` | New — shared upload hook |
| `mc/thread_context.py` | Include file references in message formatting |
