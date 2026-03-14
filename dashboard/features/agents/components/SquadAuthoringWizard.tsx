"use client";

import { useCallback } from "react";
import { Check, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuthoringSession } from "@/features/agents/hooks/useAuthoringSession";
import { useCreateSquadDraft } from "@/features/agents/hooks/useCreateSquadDraft";
import { AuthoringConversationPanel } from "@/features/agents/components/AuthoringConversationPanel";
import type { AuthoringPhase } from "@/features/agents/lib/authoringContract";

interface AgentEntry {
  key?: string;
  name?: string;
  role?: string;
  [key: string]: unknown;
}

interface WorkflowEntry {
  key?: string;
  name?: string;
  steps?: unknown[];
  [key: string]: unknown;
}

interface SquadPreviewPanelProps {
  draftGraph: Record<string, unknown>;
  phase: AuthoringPhase;
}

function SquadPreviewPanel({ draftGraph, phase }: SquadPreviewPanelProps) {
  const squadMeta = draftGraph.squad as Record<string, unknown> | undefined;
  const squadName =
    typeof squadMeta?.displayName === "string"
      ? squadMeta.displayName
      : typeof squadMeta?.name === "string"
        ? squadMeta.name
        : null;
  const agents = Array.isArray(draftGraph.agents) ? (draftGraph.agents as AgentEntry[]) : [];
  const workflows = Array.isArray(draftGraph.workflows)
    ? (draftGraph.workflows as WorkflowEntry[])
    : [];
  const reviewPolicy = typeof draftGraph.reviewPolicy === "string" ? draftGraph.reviewPolicy : null;

  return (
    <div
      data-testid="authoring-preview-panel"
      className="w-56 shrink-0 rounded-lg border bg-muted/30 p-4 text-sm space-y-3"
    >
      <div>
        <p className="font-semibold text-foreground mb-1">Preview</p>
        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground">
          {phase}
        </span>
      </div>

      {squadName && <p className="font-medium text-foreground">{squadName}</p>}

      {agents.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-foreground/70">Agents ({agents.length})</p>
          {agents.slice(0, 3).map((agent, idx) => (
            <div key={idx} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">
                {String(agent.name ?? agent.key ?? `Agent ${idx + 1}`)}
              </span>
              {agent.role && <span className="ml-1">— {String(agent.role)}</span>}
            </div>
          ))}
          {agents.length > 3 && (
            <p className="text-xs text-muted-foreground/70">+{agents.length - 3} more</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No agents defined yet.</p>
      )}

      {workflows.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-foreground/70">Workflows ({workflows.length})</p>
          {workflows.slice(0, 2).map((wf, idx) => (
            <p key={idx} className="text-xs text-muted-foreground truncate">
              {String(wf.name ?? wf.key ?? `Workflow ${idx + 1}`)}
            </p>
          ))}
        </div>
      )}

      {reviewPolicy && (
        <div>
          <p className="text-xs font-medium text-foreground/70">Review Policy</p>
          <p className="text-xs text-muted-foreground line-clamp-2">{reviewPolicy}</p>
        </div>
      )}
    </div>
  );
}

interface SquadAuthoringWizardProps {
  open: boolean;
  onClose: () => void;
  onPublished: (squadName: string) => void;
}

export function SquadAuthoringWizard({ open, onClose, onPublished }: SquadAuthoringWizardProps) {
  const { phase, transcript, draftGraph, isLoading, error, sendMessage } =
    useAuthoringSession("squad");

  const { isSaving, publishDraft } = useCreateSquadDraft();

  const isApproval = phase === "approval";

  const handlePublish = useCallback(async () => {
    const name = await publishDraft(draftGraph);
    if (name) {
      onPublished(name);
      onClose();
    }
  }, [publishDraft, draftGraph, onPublished, onClose]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-4xl p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="text-lg font-semibold">Create Squad</DialogTitle>
          <DialogDescription className="sr-only">
            Chat with the AI to design and publish your squad blueprint. The preview on the right
            updates live as the architect proposes agents and workflows.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-4 p-6 min-h-[420px]">
          <AuthoringConversationPanel
            transcript={transcript}
            isLoading={isLoading}
            error={error}
            onSend={sendMessage}
          />
          <SquadPreviewPanel draftGraph={draftGraph} phase={phase} />
        </div>

        <Separator />
        <div className="flex items-center justify-between px-6 py-4">
          <Button variant="ghost" onClick={onClose} aria-label="Cancel">
            Cancel
          </Button>

          {isApproval && (
            <Button onClick={handlePublish} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Publishing…
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Publish Squad
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
