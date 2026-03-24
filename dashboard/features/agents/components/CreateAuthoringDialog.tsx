"use client";

import { Bot, GitBranch, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface CreateAuthoringDialogProps {
  open: boolean;
  onClose: () => void;
  onSelectAgent: () => void;
  onSelectSquad: () => void;
  onSelectWorkflow: () => void;
}

export function CreateAuthoringDialog({
  open,
  onClose,
  onSelectAgent,
  onSelectSquad,
  onSelectWorkflow,
}: CreateAuthoringDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Create New</DialogTitle>
          <DialogDescription className="sr-only">Choose what you want to create.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <Button
            variant="outline"
            className="flex h-auto flex-col items-center gap-3 p-6"
            onClick={() => {
              onClose();
              onSelectAgent();
            }}
            aria-label="Create Agent"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10">
              <Bot className="h-6 w-6 text-blue-500" />
            </div>
            <p className="font-semibold">Agent</p>
          </Button>
          <Button
            variant="outline"
            className="flex h-auto flex-col items-center gap-3 p-6"
            onClick={() => {
              onClose();
              onSelectSquad();
            }}
            aria-label="Create Squad"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10">
              <Users className="h-6 w-6 text-violet-500" />
            </div>
            <p className="font-semibold">Squad</p>
          </Button>
          <Button
            variant="outline"
            className="flex h-auto flex-col items-center gap-3 p-6"
            onClick={() => {
              onClose();
              onSelectWorkflow();
            }}
            aria-label="Create Workflow"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/10">
              <GitBranch className="h-6 w-6 text-indigo-500" />
            </div>
            <p className="font-semibold">Workflow</p>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
