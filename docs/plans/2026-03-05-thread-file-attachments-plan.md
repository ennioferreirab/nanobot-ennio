# Thread File Attachments — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to attach documents (PDF, images, code, text) to individual thread messages, with files visible in the thread, accessible in the Files tab, and available to agents as context.

**Architecture:** Extend the existing file upload infrastructure (filesystem + Convex metadata) to support per-message file references. Files are uploaded to `~/.nanobot/tasks/{taskId}/attachments/` via the existing API, registered in both `task.files` (Files tab) and `message.fileAttachments` (thread context). A shared `useFileUpload` hook and `FileChip` component eliminate duplication with `StepFileAttachment`.

**Tech Stack:** Convex (schema + mutations), Next.js API routes, React (components + hooks), Python (MC thread context builder)

---

### Task 1: Schema — Add `fileAttachments` to Messages Table

**Files:**
- Modify: `dashboard/convex/schema.ts:109-147`
- Modify: `dashboard/convex/messages.ts:1-75`

**Step 1: Add `fileAttachments` field to messages schema**

In `dashboard/convex/schema.ts`, add after the `artifacts` field (line 145), before `timestamp`:

```typescript
    fileAttachments: v.optional(v.array(v.object({
      name: v.string(),
      type: v.string(),
      size: v.number(),
    }))),
```

**Step 2: Add validator and update `create` mutation in `messages.ts`**

Add a validator at the top of `dashboard/convex/messages.ts` (after line 25):

```typescript
/** Validator for file attachments on user messages. */
const fileAttachmentsValidator = v.optional(v.array(v.object({
  name: v.string(),
  type: v.string(),
  size: v.number(),
})));
```

Update the `create` internal mutation args (line 60) to include:

```typescript
    fileAttachments: fileAttachmentsValidator,
```

Update the `create` handler (line 63) to include `fileAttachments` in the insert:

```typescript
    handler: async (ctx, args) => {
      return await ctx.db.insert("messages", {
        taskId: args.taskId,
        authorName: args.authorName,
        authorType: args.authorType,
        content: args.content,
        messageType: args.messageType,
        timestamp: args.timestamp,
        type: args.type,
        stepId: args.stepId,
        artifacts: args.artifacts,
        fileAttachments: args.fileAttachments,
      });
    },
```

**Step 3: Run Convex dev to verify schema pushes**

Run: `cd dashboard && npx convex dev --once`
Expected: Schema pushed successfully, no errors.

**Step 4: Commit**

```bash
git add dashboard/convex/schema.ts dashboard/convex/messages.ts
git commit -m "feat: add fileAttachments field to messages schema"
```

---

### Task 2: Mutations — Accept `fileAttachments` in User-Facing Mutations

**Files:**
- Modify: `dashboard/convex/messages.ts:198-361`

**Step 1: Update `postUserPlanMessage` mutation**

Add `fileAttachments` arg (line 201):

```typescript
  args: {
    taskId: v.id("tasks"),
    content: v.string(),
    fileAttachments: fileAttachmentsValidator,
  },
```

Add to the `db.insert` call (line 221):

```typescript
      fileAttachments: args.fileAttachments,
```

**Step 2: Update `postComment` mutation**

Add `fileAttachments` arg (line 249):

```typescript
  args: {
    taskId: v.id("tasks"),
    content: v.string(),
    authorName: v.optional(v.string()),
    fileAttachments: fileAttachmentsValidator,
  },
```

Add to the `db.insert` call (line 265):

```typescript
      fileAttachments: args.fileAttachments,
```

**Step 3: Update `sendThreadMessage` mutation**

Add `fileAttachments` arg (line 295):

```typescript
  args: {
    taskId: v.id("tasks"),
    content: v.string(),
    agentName: v.string(),
    fileAttachments: fileAttachmentsValidator,
  },
```

Add to the `db.insert` call (line 317):

```typescript
      fileAttachments: args.fileAttachments,
```

**Step 4: Verify schema pushes**

Run: `cd dashboard && npx convex dev --once`
Expected: No errors.

**Step 5: Commit**

```bash
git add dashboard/convex/messages.ts
git commit -m "feat: accept fileAttachments in user message mutations"
```

---

### Task 3: Upload API — Add Size Validation

**Files:**
- Modify: `dashboard/app/api/tasks/[taskId]/files/route.ts:49-81`

**Step 1: Add size limit constant and validation**

Add constant at top of file (after line 5):

```typescript
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
```

Add size check inside the `for` loop, after `if (!(value instanceof File)) continue;` (line 50):

```typescript
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File "${file.name}" exceeds 10MB limit` },
        { status: 413 },
      );
    }
```

**Step 2: Commit**

```bash
git add dashboard/app/api/tasks/[taskId]/files/route.ts
git commit -m "feat: add 10MB file size limit to upload endpoint"
```

---

### Task 4: Shared Components — `FileChip` and `useFileUpload`

**Files:**
- Create: `dashboard/components/FileChip.tsx`
- Create: `dashboard/hooks/useFileUpload.ts`
- Modify: `dashboard/components/StepFileAttachment.tsx`

**Step 1: Create `FileChip` component**

Create `dashboard/components/FileChip.tsx`:

```tsx
"use client";

import {
  File,
  FileCode,
  FileText,
  Image,
  X,
} from "lucide-react";

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"]);
const CODE_EXTS = new Set([
  ".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".rs", ".java", ".sh",
]);

function getFileIconType(name: string): "pdf" | "image" | "code" | "generic" {
  const dotIdx = name.lastIndexOf(".");
  if (dotIdx === -1) return "generic";
  const ext = name.slice(dotIdx).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if (IMAGE_EXTS.has(ext)) return "image";
  if (CODE_EXTS.has(ext)) return "code";
  return "generic";
}

function FileIcon({ name }: { name: string }) {
  const iconType = getFileIconType(name);
  const cls = "h-3 w-3 text-muted-foreground";
  switch (iconType) {
    case "pdf":
      return <FileText className={cls} />;
    case "image":
      return <Image className={cls} />;
    case "code":
      return <FileCode className={cls} />;
    default:
      return <File className={cls} />;
  }
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileChipProps {
  name: string;
  size?: number;
  onRemove?: () => void;
  href?: string;
}

export function FileChip({ name, size, onRemove, href }: FileChipProps) {
  const content = (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <FileIcon name={name} />
      <span className="min-w-0 truncate" title={name}>
        {name}
      </span>
      {size != null && (
        <span className="text-muted-foreground/60 shrink-0">
          {humanSize(size)}
        </span>
      )}
      {onRemove && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${name}`}
          className="shrink-0 hover:text-destructive transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">
        {content}
      </a>
    );
  }

  return content;
}
```

**Step 2: Create `useFileUpload` hook**

Create `dashboard/hooks/useFileUpload.ts`:

```typescript
"use client";

import { useState, useRef, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES_PER_BATCH = 5;

export interface UploadedFile {
  name: string;
  type: string;
  size: number;
  subfolder: string;
  uploadedAt: string;
}

export interface PendingFile {
  file: File;
  name: string;
  size: number;
  type: string;
}

export function useFileUpload(taskId: string) {
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addTaskFiles = useMutation(api.tasks.addTaskFiles);

  const addFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    setUploadError("");

    const errors: string[] = [];
    const valid: PendingFile[] = [];

    for (const file of fileArray) {
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`"${file.name}" exceeds 10MB limit`);
        continue;
      }
      valid.push({ file, name: file.name, size: file.size, type: file.type });
    }

    setPendingFiles((prev) => {
      const combined = [...prev, ...valid];
      if (combined.length > MAX_FILES_PER_BATCH) {
        errors.push(`Max ${MAX_FILES_PER_BATCH} files per message`);
        return combined.slice(0, MAX_FILES_PER_BATCH);
      }
      return combined;
    });

    if (errors.length > 0) {
      setUploadError(errors.join(". "));
    }
  }, []);

  const removePendingFile = useCallback((name: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.name !== name));
    setUploadError("");
  }, []);

  const uploadAll = useCallback(async (): Promise<UploadedFile[]> => {
    if (pendingFiles.length === 0) return [];

    setIsUploading(true);
    setUploadError("");

    try {
      const formData = new FormData();
      for (const pf of pendingFiles) {
        formData.append("files", pf.file, pf.name);
      }

      const res = await fetch(`/api/tasks/${taskId}/files`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Upload failed: ${res.status}`);
      }

      const { files: uploadedFiles } = await res.json();

      // Register at task level (Files tab)
      await addTaskFiles({
        taskId: taskId as Id<"tasks">,
        files: uploadedFiles,
      });

      setPendingFiles([]);
      return uploadedFiles;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setUploadError(msg);
      throw err;
    } finally {
      setIsUploading(false);
    }
  }, [pendingFiles, taskId, addTaskFiles]);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const clearPending = useCallback(() => {
    setPendingFiles([]);
    setUploadError("");
  }, []);

  return {
    pendingFiles,
    isUploading,
    uploadError,
    fileInputRef,
    addFiles,
    removePendingFile,
    uploadAll,
    openFilePicker,
    clearPending,
  };
}
```

**Step 3: Refactor `StepFileAttachment` to use shared components**

Replace the content of `dashboard/components/StepFileAttachment.tsx` with:

```tsx
"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Loader2, Paperclip } from "lucide-react";
import { FileChip } from "./FileChip";

export interface StepFileAttachmentProps {
  stepTempId: string;
  attachedFiles: string[];
  taskId: string;
  onFilesAttached: (stepTempId: string, fileNames: string[]) => void;
  onFileRemoved: (stepTempId: string, fileName: string) => void;
}

export function StepFileAttachment({
  stepTempId,
  attachedFiles,
  taskId,
  onFilesAttached,
  onFileRemoved,
}: StepFileAttachmentProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const addTaskFiles = useMutation(api.tasks.addTaskFiles);

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    e.target.value = "";

    setIsUploading(true);
    setUploadError("");

    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append("files", file, file.name);
      }
      const res = await fetch(`/api/tasks/${taskId}/files`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      const { files: uploadedFiles } = await res.json();

      await addTaskFiles({
        taskId: taskId as Id<"tasks">,
        files: uploadedFiles,
      });

      const newFileNames: string[] = uploadedFiles.map(
        (f: { name: string }) => f.name
      );
      const existingNames = new Set(attachedFiles);
      const uniqueNewNames = newFileNames.filter(
        (name) => !existingNames.has(name)
      );
      if (uniqueNewNames.length > 0) {
        onFilesAttached(stepTempId, uniqueNewNames);
      }
    } catch {
      setUploadError("Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="mt-2 space-y-1">
      {attachedFiles.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {attachedFiles.map((fileName) => (
            <FileChip
              key={fileName}
              name={fileName}
              onRemove={() => onFileRemoved(stepTempId, fileName)}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileChange}
          aria-label="Attach files to step"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={handleAttachClick}
          disabled={isUploading}
          className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          {isUploading ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Paperclip className="h-3 w-3 mr-1" />
          )}
          Attach
        </Button>
        {uploadError && (
          <span className="text-xs text-red-500">{uploadError}</span>
        )}
      </div>
    </div>
  );
}
```

**Step 4: Verify dashboard builds**

Run: `cd dashboard && npx next build`
Expected: No build errors.

**Step 5: Commit**

```bash
git add dashboard/components/FileChip.tsx dashboard/hooks/useFileUpload.ts dashboard/components/StepFileAttachment.tsx
git commit -m "feat: extract shared FileChip component and useFileUpload hook"
```

---

### Task 5: ThreadInput — File Attachment UI (Clip Button + Drag & Drop)

**Files:**
- Modify: `dashboard/components/ThreadInput.tsx`

**Step 1: Add imports and integrate `useFileUpload`**

Add imports at the top of `ThreadInput.tsx`:

```typescript
import { Paperclip, Loader2 } from "lucide-react";
import { FileChip } from "./FileChip";
import { useFileUpload } from "@/hooks/useFileUpload";
```

Update the existing lucide import to include `Paperclip` and `Loader2` (merge with existing icons on line 16).

Inside the `ThreadInput` component (after line 49, the mutation declarations), add:

```typescript
  const {
    pendingFiles,
    isUploading,
    uploadError: fileUploadError,
    fileInputRef,
    addFiles,
    removePendingFile,
    uploadAll,
    openFilePicker,
    clearPending,
  } = useFileUpload(task._id);

  const [isDragOver, setIsDragOver] = useState(false);
```

**Step 2: Update `handleSend` to upload files before sending message**

Replace the `handleSend` function (lines 156-197) with:

```typescript
  const handleSend = async () => {
    const trimmed = content.trim();
    if (!trimmed && pendingFiles.length === 0) return;

    // Parse @mentions
    let agentForSubmit = selectedAgent;
    const mentionMatches = trimmed.match(/@(\w[\w-]*)/g);
    if (mentionMatches && filteredAgents) {
      const lastMention = mentionMatches[mentionMatches.length - 1].slice(1);
      if (filteredAgents.some((a) => a.name === lastMention)) {
        agentForSubmit = lastMention;
        setSelectedAgent(lastMention);
      }
    }

    if (inputMode !== "comment" && !isPlanChatMode && !isInProgress && !agentForSubmit) return;
    setIsSubmitting(true);
    setError("");
    try {
      // Upload pending files first
      let fileAttachments: { name: string; type: string; size: number }[] | undefined;
      if (pendingFiles.length > 0) {
        const uploaded = await uploadAll();
        fileAttachments = uploaded.map((f) => ({
          name: f.name,
          type: f.type,
          size: f.size,
        }));
      }

      const messageContent = trimmed || "(files attached)";

      if (inputMode === "comment") {
        await postComment({ taskId: task._id, content: messageContent, fileAttachments });
      } else if (isPlanChatMode || isInProgress) {
        await postPlanMessage({ taskId: task._id, content: messageContent, fileAttachments });
      } else {
        await sendMessage({
          taskId: task._id,
          content: messageContent,
          agentName: agentForSubmit,
          fileAttachments,
        });
      }
      setContent("");
      clearPending();
      onMessageSent?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };
```

**Step 3: Add drag & drop handlers**

Add these handlers after the `handleKeyDown` function:

```typescript
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      addFiles(files);
    }
    e.target.value = "";
  }, [addFiles]);
```

**Step 4: Update `canSend` to include pending files**

Update the `canSend` variable (line 87):

```typescript
  const canSend = (content.trim().length > 0 || pendingFiles.length > 0) && !isSubmitting && !isUploading && (inputMode === "comment" || isPlanChatMode || isInProgress || !!selectedAgent);
```

**Step 5: Add file chips + clip button + drag zone to the normal mode JSX**

In the return JSX for the normal mode (starting at line 356), update the composer area. Wrap the textarea `div` (line 378) with drag handlers and add the file UI:

```tsx
      {/* File upload errors */}
      {fileUploadError && (
        <p className="text-xs text-red-500">{fileUploadError}</p>
      )}

      {/* Pending file chips */}
      {pendingFiles.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {pendingFiles.map((pf) => (
            <FileChip
              key={pf.name}
              name={pf.name}
              size={pf.size}
              onRemove={() => removePendingFile(pf.name)}
            />
          ))}
        </div>
      )}

      <div
        className={`flex gap-2 relative ${isDragOver ? "ring-2 ring-primary ring-offset-1 rounded-md" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Textarea
          ref={textareaRef}
          placeholder={inputMode === "comment" ? "Add a comment..." : isInProgress ? "Reply to the thread..." : "Send a message to the agent..."}
          value={content}
          onChange={inputMode === "comment" ? (e) => setContent(e.target.value) : handleTextChange}
          onKeyDown={handleKeyDown}
          onFocus={() => clearTimeout(blurTimeoutRef.current)}
          onBlur={() => {
            blurTimeoutRef.current = setTimeout(() => setMentionQuery(null), 150);
          }}
          className="text-sm min-h-[80px] max-h-[160px] resize-none"
          disabled={isSubmitting}
        />
        <div className="flex flex-col gap-1 shrink-0">
          <Button
            size="icon"
            variant="default"
            className="h-[38px] w-10"
            onClick={handleSend}
            disabled={!canSend}
          >
            <SendHorizontal className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-[38px] w-10"
            onClick={openFilePicker}
            disabled={isSubmitting || isUploading}
            title="Attach files"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </Button>
        </div>
        {inputMode === "agent" && mentionQuery !== null && !isPlanChatMode && !isInProgress && filteredAgents && (
          <AgentMentionAutocomplete
            agents={filteredAgents.map((a) => ({
              name: a.name,
              displayName: a.displayName ?? undefined,
              role: a.role ?? undefined,
            }))}
            query={mentionQuery}
            onSelect={handleMentionSelect}
            onClose={() => setMentionQuery(null)}
            anchorRef={textareaRef}
          />
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
        aria-label="Attach files to message"
      />
```

**Step 6: Apply same pattern to plan-chat mode JSX**

Add the same file chips, clip button, drag zone, and hidden input to the `isPlanChatMode` return block (around line 316). Follow the same structure: error + chips above the textarea, drag wrapper around textarea, clip button beside send button, hidden input at bottom.

**Step 7: Verify dashboard builds**

Run: `cd dashboard && npx next build`
Expected: No build errors.

**Step 8: Commit**

```bash
git add dashboard/components/ThreadInput.tsx
git commit -m "feat: add file attachment UI to ThreadInput (clip + drag & drop)"
```

---

### Task 6: ThreadMessage — Render File Attachment Chips

**Files:**
- Modify: `dashboard/components/ThreadMessage.tsx`

**Step 1: Add import and render file attachments**

Add import at the top:

```typescript
import { FileChip } from "./FileChip";
```

In the `ThreadMessage` component, after the artifacts rendering block (lines 147-156), add:

```tsx
        {/* Render file attachments if present */}
        {message.fileAttachments && message.fileAttachments.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {message.fileAttachments.map((fa) => (
              <FileChip
                key={fa.name}
                name={fa.name}
                size={fa.size}
                href={`/api/tasks/${message.taskId}/files/attachments/${encodeURIComponent(fa.name)}`}
              />
            ))}
          </div>
        )}
```

Note: `message.taskId` is an `Id<"tasks">` which is a string, so it works directly in the URL.

**Step 2: Verify dashboard builds**

Run: `cd dashboard && npx next build`
Expected: No build errors.

**Step 3: Commit**

```bash
git add dashboard/components/ThreadMessage.tsx
git commit -m "feat: render file attachment chips in ThreadMessage"
```

---

### Task 7: MC Backend — Include File Attachments in Thread Context

**Files:**
- Modify: `mc/thread_context.py:175-194`

**Step 1: Update `_format_message` to include file attachments**

In `mc/thread_context.py`, update the `_format_message` method. After the existing logic for `msg_type == "comment"` (line 192), and in the general `else` branch (line 194), add file attachment handling.

Replace the entire `_format_message` method with:

```python
    def _format_message(self, message: dict[str, Any]) -> str:
        """Render a single message including artifacts and file attachments."""
        author = message.get("author_name", "Unknown")
        author_type = message.get("author_type", "system")
        ts = message.get("timestamp", "")
        content = message.get("content", "")
        msg_type = message.get("type")

        # Format file attachments suffix
        file_attachments = message.get("file_attachments") or []
        attachment_suffix = ""
        if file_attachments:
            names = ", ".join(fa.get("name", "unknown") for fa in file_attachments)
            attachment_suffix = f" (attached: {names})"

        if msg_type == "step_completion":
            line = f"{author} [{author_type}] ({ts}) [Step Completion]: {content}"
            artifacts = message.get("artifacts") or []
            if artifacts:
                artifact_str = self._format_artifacts(artifacts)
                if artifact_str:
                    line += "\n" + artifact_str
            return line
        elif msg_type == "comment":
            return f"{author} [Comment]: {content}{attachment_suffix}"
        else:
            return f"{author} [{author_type}] ({ts}): {content}{attachment_suffix}"
```

**Step 2: Run existing thread_context tests**

Run: `uv run pytest tests/mc/test_thread_context.py -v`
Expected: All existing tests pass.

**Step 3: Add test for file attachments in thread context**

Add a test to `tests/mc/test_thread_context.py`:

```python
def test_file_attachments_in_user_message():
    """File attachments are rendered as (attached: ...) suffix."""
    builder = ThreadContextBuilder()
    messages = [
        {
            "author_name": "User",
            "author_type": "user",
            "message_type": "user_message",
            "type": "user_message",
            "content": "Analyze this report",
            "timestamp": "2026-03-05T10:00:00Z",
            "file_attachments": [
                {"name": "report.pdf", "type": "application/pdf", "size": 1024},
                {"name": "data.csv", "type": "text/csv", "size": 512},
            ],
        },
    ]
    result = builder.build(messages)
    assert "(attached: report.pdf, data.csv)" in result
    assert "Analyze this report" in result
```

**Step 4: Run the new test**

Run: `uv run pytest tests/mc/test_thread_context.py::test_file_attachments_in_user_message -v`
Expected: PASS.

**Step 5: Commit**

```bash
git add mc/thread_context.py tests/mc/test_thread_context.py
git commit -m "feat: include file attachments in thread context for agents"
```

---

### Task 8: Integration Smoke Test

**Files:** No new files.

**Step 1: Verify Convex schema is clean**

Run: `cd dashboard && npx convex dev --once`
Expected: Schema pushed, no errors.

**Step 2: Verify dashboard builds**

Run: `cd dashboard && npx next build`
Expected: Build succeeds.

**Step 3: Verify Python tests pass**

Run: `uv run pytest tests/mc/test_thread_context.py -v`
Expected: All tests pass.

**Step 4: Manual smoke test checklist**

1. Open a task thread in the dashboard
2. Click the clip button — file picker opens
3. Select a PDF < 10MB — chip appears below textarea with X to remove
4. Drag an image onto the textarea — chip appears, ring highlight during drag
5. Try a file > 10MB — error message shown
6. Try adding 6 files — error about max 5
7. Send message with 2 files attached — message appears in thread with file chips
8. Click a file chip in the sent message — file opens/downloads in new tab
9. Check the Files tab — attached files appear there too
10. Verify the file chips show in the message with correct icon and size

**Step 5: Final commit (if any adjustments needed)**

```bash
git commit -m "fix: integration adjustments for thread file attachments"
```
