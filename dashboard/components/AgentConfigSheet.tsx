"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Check, Lock } from "lucide-react";
import { SkillsSelector } from "@/components/SkillsSelector";
import { getAvatarColor, getInitials } from "@/components/AgentSidebarItem";
import type { AgentStatus } from "@/lib/constants";

const STATUS_DOT_STYLES: Record<string, string> = {
  active: "bg-blue-500",
  idle: "bg-muted-foreground",
  crashed: "bg-red-500",
};

interface AgentConfigSheetProps {
  agentName: string | null;
  onClose: () => void;
}

interface FormErrors {
  role?: string;
  prompt?: string;
}

export function AgentConfigSheet({ agentName, onClose }: AgentConfigSheetProps) {
  const agent = useQuery(
    api.agents.getByName,
    agentName ? { name: agentName } : "skip",
  );
  const updateConfig = useMutation(api.agents.updateConfig);
  const setEnabled = useMutation(api.agents.setEnabled);

  // Form state
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("");
  const [prompt, setPrompt] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [enabled, setEnabledState] = useState(true);

  // UI state
  const [errors, setErrors] = useState<FormErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  // Initialize form from agent data
  useEffect(() => {
    if (agent) {
      setDisplayName(agent.displayName);
      setRole(agent.role);
      setPrompt(agent.prompt || "");
      setSkills(agent.skills);
      setModel(agent.model || "");
      setEnabledState(agent.enabled !== false);
      setErrors({});
      setSaveError(null);
      setShowSuccess(false);
    }
  }, [agent]);

  // Dirty state detection
  const isDirty = useMemo(() => {
    if (!agent) return false;
    return (
      displayName !== agent.displayName ||
      role !== agent.role ||
      prompt !== (agent.prompt || "") ||
      JSON.stringify(skills) !== JSON.stringify(agent.skills) ||
      model !== (agent.model || "") ||
      enabled !== (agent.enabled !== false)
    );
  }, [agent, displayName, role, prompt, skills, model, enabled]);

  // Validation
  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {};
    if (!role.trim()) {
      newErrors.role = "Agent role cannot be empty.";
    }
    if (!prompt.trim()) {
      newErrors.prompt = "Agent prompt cannot be empty.";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [role, prompt]);

  const handleSave = useCallback(async () => {
    if (!validate() || !agentName) return;
    setSaveError(null);

    try {
      await updateConfig({
        name: agentName,
        displayName,
        role,
        prompt,
        skills,
        model: model || undefined,
      });

      // Persist enabled state change if it differs from server
      if (agent && enabled !== (agent.enabled !== false)) {
        await setEnabled({ agentName: agent.name, enabled });
      }

      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 1500);
    } catch {
      setSaveError("Failed to save. Please try again.");
    }
  }, [agentName, agent, displayName, role, prompt, skills, model, enabled, validate, updateConfig, setEnabled]);

  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowDiscardDialog(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const handleDiscard = useCallback(() => {
    setShowDiscardDialog(false);
    onClose();
  }, [onClose]);

  const isLoaded = agent != null && typeof agent === "object" && "name" in agent;
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <>
      <Sheet open={!!agentName} onOpenChange={(open) => !open && handleClose()}>
        <SheetContent side="right" className="w-[480px] sm:w-[480px] flex flex-col p-0">
          {isLoaded ? (
            <>
              <SheetHeader className="px-6 pt-6 pb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium text-white ${getAvatarColor(agent.name)}`}
                  >
                    {getInitials(agent.displayName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <SheetTitle className="text-lg font-semibold">
                      {agent.displayName}
                    </SheetTitle>
                    <SheetDescription asChild>
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${agent.enabled === false ? "bg-red-500" : (STATUS_DOT_STYLES[agent.status as AgentStatus] || STATUS_DOT_STYLES.idle)}`}
                        />
                        <span className="text-xs">{agent.enabled === false ? "Deactivated" : agent.status}</span>
                      </div>
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <Separator />

              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {saveError && (
                  <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
                    <p className="text-sm text-destructive">{saveError}</p>
                  </div>
                )}

                {/* Active toggle */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label htmlFor="agent-enabled-toggle" className="text-sm font-medium">
                      {enabled ? "Active" : "Deactivated"}
                    </label>
                    <Switch
                      id="agent-enabled-toggle"
                      checked={enabled}
                      onCheckedChange={(checked) => setEnabledState(checked)}
                    />
                  </div>
                  {!enabled && (
                    <p className="text-xs text-muted-foreground">
                      This agent will not receive new tasks
                    </p>
                  )}
                </div>

                {/* Name (read-only) */}
                <div className="space-y-1">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    Name
                    <Lock className="h-3 w-3 text-muted-foreground" />
                  </label>
                  <Input
                    value={agent.name}
                    disabled
                    className="bg-muted"
                  />
                </div>

                {/* Display Name */}
                <div className="space-y-1">
                  <label className="text-sm font-medium">Display Name</label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>

                {/* Role */}
                <div className="space-y-1">
                  <label className="text-sm font-medium">Role</label>
                  <Input
                    value={role}
                    onChange={(e) => {
                      setRole(e.target.value);
                      if (errors.role) setErrors((prev) => ({ ...prev, role: undefined }));
                    }}
                    onBlur={() => {
                      if (!role.trim()) setErrors((prev) => ({ ...prev, role: "Agent role cannot be empty." }));
                    }}
                    className={errors.role ? "border-red-500" : ""}
                  />
                  {errors.role && (
                    <p className="text-xs text-red-500">{errors.role}</p>
                  )}
                </div>

                {/* Prompt */}
                <div className="space-y-1">
                  <label className="text-sm font-medium">Prompt</label>
                  <Textarea
                    value={prompt}
                    onChange={(e) => {
                      setPrompt(e.target.value);
                      if (errors.prompt) setErrors((prev) => ({ ...prev, prompt: undefined }));
                    }}
                    onBlur={() => {
                      if (!prompt.trim()) setErrors((prev) => ({ ...prev, prompt: "Agent prompt cannot be empty." }));
                    }}
                    className={`font-mono min-h-[150px] resize-y ${errors.prompt ? "border-red-500" : ""}`}
                    rows={6}
                  />
                  {errors.prompt && (
                    <p className="text-xs text-red-500">{errors.prompt}</p>
                  )}
                </div>

                {/* Model */}
                <div className="space-y-1">
                  <label className="text-sm font-medium">Model</label>
                  <Input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="System default (claude-sonnet-4-6)"
                  />
                </div>

                {/* Skills */}
                <SkillsSelector selected={skills} onChange={setSkills} />
              </div>

              <Separator />

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 px-6 py-4">
                <Button
                  variant="outline"
                  onClick={handleClose}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!isDirty || hasErrors}
                >
                  {showSuccess ? (
                    <span className="flex items-center gap-1.5">
                      <Check className="h-4 w-4 text-green-500" />
                      Saved
                    </span>
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
            </>
          ) : agentName ? (
            <SheetHeader className="px-6 pt-6 pb-4">
              <SheetTitle className="text-lg font-semibold">Loading...</SheetTitle>
              <SheetDescription>Loading agent configuration</SheetDescription>
            </SheetHeader>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to close without saving?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscard}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
