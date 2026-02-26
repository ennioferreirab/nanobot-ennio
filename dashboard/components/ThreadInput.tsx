"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Doc } from "../convex/_generated/dataModel";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SendHorizontal, RotateCcw } from "lucide-react";

interface ThreadInputProps {
  task: Doc<"tasks">;
  onMessageSent?: () => void;
}

// Statuses where the user cannot interact with the task thread at all.
// Note: "in_progress" and "review" (awaitingKickoff) are NOT blocked — users
// can send plan-chat messages to the Lead Agent in those states (Story 7.3).
const BLOCKED_STATUSES = ["retrying"];

export function ThreadInput({ task, onMessageSent }: ThreadInputProps) {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState("");
  const [selectedAgent, setSelectedAgent] = useState(
    task.assignedAgent ?? ""
  );

  const sendMessage = useMutation(api.messages.sendThreadMessage);
  const postPlanMessage = useMutation(api.messages.postUserPlanMessage);
  const restoreTask = useMutation(api.tasks.restore);
  const agents = useQuery(api.agents.list);
  const board = useQuery(
    api.boards.getById,
    task.boardId ? { boardId: task.boardId } : "skip"
  );

  // Sync selectedAgent when task.assignedAgent changes (H3 fix: useEffect instead of render-time setState)
  useEffect(() => {
    if (task.assignedAgent && !isSubmitting) {
      setSelectedAgent(task.assignedAgent);
    }
  }, [task.assignedAgent, isSubmitting]);

  // Don't render for manual tasks
  if (task.isManual) return null;

  // Plan-chat mode: task is in_progress, or review+awaitingKickoff.
  // In this mode the user can chat with the Lead Agent to modify the plan.
  // We use postUserPlanMessage (no status transition, no plan clear).
  const taskAny = task as any;
  const isPlanChatMode =
    task.status === "in_progress" ||
    (task.status === "review" && taskAny.awaitingKickoff === true);

  const isBlocked = BLOCKED_STATUSES.includes(task.status);
  const canSend = content.trim().length > 0 && !isSubmitting && (isPlanChatMode || !!selectedAgent);

  // Filter agents by board's enabledAgents (empty = all agents eligible)
  const enabledAgentNames = board?.enabledAgents ?? [];
  const filteredAgents = agents?.filter((a) => {
    if (!a.enabled) return false;
    if (a.isSystem) return true;
    if (enabledAgentNames.length === 0) return true;
    return enabledAgentNames.includes(a.name);
  });

  const handleSend = async () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    if (!isPlanChatMode && !selectedAgent) return;
    setIsSubmitting(true);
    setError("");
    try {
      if (isPlanChatMode) {
        // Plan-chat: just post the message, Lead Agent subscription handles it
        await postPlanMessage({ taskId: task._id, content: trimmed });
      } else {
        await sendMessage({
          taskId: task._id,
          content: trimmed,
          agentName: selectedAgent,
        });
      }
      setContent("");
      onMessageSent?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) handleSend();
    }
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    setError("");
    try {
      await restoreTask({ taskId: task._id, mode: "previous" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore task.");
    } finally {
      setIsRestoring(false);
    }
  };

  if (task.status === "deleted") {
    return (
      <div className="px-6 py-3 border-t space-y-2">
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Task is in trash. Restore to send a message?
          </p>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7"
            onClick={handleRestore}
            disabled={isRestoring}
          >
            <RotateCcw className="h-3 w-3 mr-1.5" />
            {isRestoring ? "Restoring..." : "Restore"}
          </Button>
        </div>
      </div>
    );
  }

  if (isBlocked) {
    return (
      <div className="px-6 py-3 border-t bg-muted/30">
        <p className="text-xs text-muted-foreground text-center">
          Agent is currently working...
        </p>
      </div>
    );
  }

  // Plan-chat mode: simplified input addressed to the Lead Agent
  if (isPlanChatMode) {
    return (
      <div className="px-6 py-3 border-t space-y-2">
        {error && (
          <p className="text-xs text-red-500">{error}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Ask the Lead Agent to modify the plan...
        </p>
        <div className="flex gap-2">
          <Textarea
            placeholder="e.g. Add a step to write tests, or remove the deployment step..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            className="text-sm min-h-[80px] max-h-[160px] resize-none"
            disabled={isSubmitting}
          />
          <Button
            size="icon"
            variant="default"
            className="h-[80px] w-10 shrink-0"
            onClick={handleSend}
            disabled={!canSend}
          >
            <SendHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-3 border-t space-y-2">
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
      <div className="flex items-center gap-2">
        <Select value={selectedAgent} onValueChange={setSelectedAgent}>
          <SelectTrigger className="w-[180px] h-7 text-xs">
            <SelectValue placeholder="Select agent" />
          </SelectTrigger>
          <SelectContent>
            {filteredAgents?.map((agent) => (
              <SelectItem key={agent._id} value={agent.name} className="text-xs">
                {agent.displayName || agent.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2">
        <Textarea
          placeholder="Send a message to the agent..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          className="text-sm min-h-[80px] max-h-[160px] resize-none"
          disabled={isSubmitting}
        />
        <Button
          size="icon"
          variant="default"
          className="h-[80px] w-10 shrink-0"
          onClick={handleSend}
          disabled={!canSend}
        >
          <SendHorizontal className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
