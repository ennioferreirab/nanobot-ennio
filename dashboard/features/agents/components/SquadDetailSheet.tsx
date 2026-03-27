"use client";

import { useEffect, useMemo, useState } from "react";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  BookOpen,
  ChevronDown,
  FileText,
  Pencil,
  Play,
  Settings,
  Shield,
  Users,
  X,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useSquadDetailData } from "@/features/agents/hooks/useSquadDetailData";
import { useUpdatePublishedSquad } from "@/features/agents/hooks/useUpdatePublishedSquad";
import { AgentConfigSheet } from "@/features/agents/components/AgentConfigSheet";
import { SkillDetailDialog } from "@/features/agents/components/SkillDetailDialog";
import { RunSquadMissionDialog } from "./RunSquadMissionDialog";
import { SquadWorkflowCanvas } from "@/features/agents/components/SquadWorkflowCanvas";
import type { EditableWorkflow } from "@/features/agents/components/SquadWorkflowEditor";
import { getInitials, getAvatarColor } from "@/lib/agentUtils";

interface SquadDetailSheetProps {
  squadId: Id<"squadSpecs"> | null;
  boardId?: Id<"boards">;
  focusWorkflowId?: Id<"workflowSpecs"> | null;
  onClose: () => void;
  onMissionLaunched?: (taskId: Id<"tasks">) => void;
}

type EditableSquadDraft = {
  squad: {
    name: string;
    displayName: string | undefined;
    description: string;
    outcome: string;
  };
  reviewPolicy: string;
  workflows: EditableWorkflow[];
};

type SquadViewMode = "workflow" | "agents";

function buildDraft(
  squad: Doc<"squadSpecs">,
  workflows: Doc<"workflowSpecs">[],
  agents: Doc<"agents">[],
): EditableSquadDraft {
  const squadWithReviewPolicy = squad as Doc<"squadSpecs"> & {
    reviewPolicy?: string;
  };
  const agentIdToName = new Map(agents.map((agent) => [agent._id, agent.name]));
  return {
    squad: {
      name: squad.name,
      displayName: squad.displayName,
      description: squad.description ?? "",
      outcome: squad.outcome ?? "",
    },
    reviewPolicy: squadWithReviewPolicy.reviewPolicy ?? "",
    workflows: workflows.map((workflow, workflowIndex) => ({
      id: String(workflow._id),
      key: `workflow-${workflowIndex + 1}`,
      name: workflow.name,
      exitCriteria: workflow.exitCriteria ?? "",
      steps: workflow.steps.map((step) => ({
        id: step.id,
        title: step.title,
        type: step.type,
        description: step.description ?? "",
        agentKey: step.agentId ? agentIdToName.get(step.agentId) : undefined,
        reviewSpecId: step.reviewSpecId ? String(step.reviewSpecId) : undefined,
        onReject: step.onReject ?? undefined,
        dependsOn: step.dependsOn ?? [],
      })),
    })),
  };
}

/** Builds a map from agent name to an array of step titles assigned to that agent. */
function buildAgentStepMap(
  workflows: EditableWorkflow[],
): Map<string, { stepNumber: number; title: string }[]> {
  const map = new Map<string, { stepNumber: number; title: string }[]>();
  for (const workflow of workflows) {
    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      if (step.agentKey) {
        const existing = map.get(step.agentKey) ?? [];
        existing.push({ stepNumber: i + 1, title: step.title });
        map.set(step.agentKey, existing);
      }
    }
  }
  return map;
}

/* -------------------------------------------------------------------------- */
/*  Agent Card for the Agents grid view                                       */
/* -------------------------------------------------------------------------- */
function AgentCard({
  agent,
  assignedSteps,
  onClickAgent,
  onClickSkill,
}: {
  agent: Doc<"agents">;
  assignedSteps: { stepNumber: number; title: string }[];
  onClickAgent: (name: string) => void;
  onClickSkill: (name: string) => void;
}) {
  const displayLabel = agent.displayName ?? agent.name;
  const initials = getInitials(displayLabel);
  const bgColor = getAvatarColor(agent.name);
  const statusColor =
    agent.status === "active"
      ? "bg-green-500"
      : agent.status === "crashed"
        ? "bg-red-500"
        : "bg-muted-foreground/50";

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5 flex flex-col gap-3 transition-colors hover:border-border/80 cursor-pointer">
      {/* Header row */}
      <button
        type="button"
        onClick={() => onClickAgent(agent.name)}
        className="flex items-center gap-3 text-left w-full"
      >
        <div className={`w-9 h-9 rounded-lg ${bgColor} flex items-center justify-center shrink-0`}>
          <span className="text-xs font-bold text-white">{initials}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{displayLabel}</p>
          <p className="text-xs text-muted-foreground truncate">{agent.role}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <div className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
          <span className="text-[10px] text-muted-foreground">{agent.status}</span>
        </div>
      </button>

      {/* Assigned steps */}
      {assignedSteps.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Assigned Steps
          </span>
          <div className="flex flex-wrap gap-1.5">
            {assignedSteps.map((s) => (
              <div
                key={s.stepNumber}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/5 border border-primary/10"
              >
                <div className="w-3.5 h-3.5 rounded-full bg-primary flex items-center justify-center">
                  <span className="text-[8px] font-bold text-primary-foreground">
                    {s.stepNumber}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">{s.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skills */}
      {agent.skills.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Skills
          </span>
          <div className="flex flex-wrap gap-1">
            {agent.skills.map((skill) => (
              <button
                key={skill}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClickSkill(skill);
                }}
              >
                <Badge
                  variant="secondary"
                  className="text-[10px] font-normal cursor-pointer hover:bg-muted"
                >
                  {skill}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Mobile bottom nav                                                          */
/* -------------------------------------------------------------------------- */
function MobileSquadNav({
  active,
  onChange,
}: {
  active: SquadViewMode;
  onChange: (mode: SquadViewMode) => void;
}) {
  return (
    <div
      role="tablist"
      className="flex sm:hidden items-center justify-around border-t py-2 shrink-0 bg-background"
    >
      <button
        type="button"
        role="tab"
        aria-selected={active === "workflow"}
        onClick={() => onChange("workflow")}
        className={`flex flex-col items-center gap-1 px-4 py-2 min-h-[44px] ${
          active === "workflow" ? "text-primary" : "text-muted-foreground"
        }`}
      >
        <BookOpen className="h-[18px] w-[18px]" />
        <span className="text-[10px] font-semibold uppercase tracking-wide">Workflow</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === "agents"}
        onClick={() => onChange("agents")}
        className={`flex flex-col items-center gap-1 px-4 py-2 min-h-[44px] ${
          active === "agents" ? "text-primary" : "text-muted-foreground"
        }`}
      >
        <Users className="h-[18px] w-[18px]" />
        <span className="text-[10px] font-semibold uppercase tracking-wide">Agents</span>
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Context rail (right panel, desktop only)                                   */
/* -------------------------------------------------------------------------- */
function ContextRail({
  squad,
  agents,
  workflows,
  outcome,
  reviewPolicy,
  isEditing,
  draft,
  initialDraft,
  onDraftChange,
}: {
  squad: Doc<"squadSpecs">;
  agents: Doc<"agents">[];
  workflows: EditableWorkflow[];
  outcome?: string;
  reviewPolicy?: string;
  isEditing: boolean;
  draft: EditableSquadDraft | null;
  initialDraft: EditableSquadDraft | null;
  onDraftChange: (draft: EditableSquadDraft | null) => void;
}) {
  return (
    <div className="hidden md:flex flex-col w-[300px] border-l shrink-0 bg-background">
      {/* Context header */}
      <div className="px-5 py-3 border-b">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Context
        </span>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        {/* Squad info */}
        <div className="px-5 py-4 border-b space-y-2.5">
          <p className="text-sm font-semibold leading-snug">{squad.name}</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-[10px]">
              {agents.length} agent{agents.length !== 1 ? "s" : ""}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {workflows.length} workflow{workflows.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        </div>

        {/* Outcome */}
        <Collapsible defaultOpen={!!outcome}>
          <CollapsibleTrigger className="flex w-full items-center justify-between px-5 py-3 border-b hover:bg-muted/30 transition-colors group">
            <div className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[13px] font-medium">Outcome</span>
            </div>
            <ChevronDown className="h-3 w-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-5 py-3 border-b">
            {isEditing ? (
              <Textarea
                aria-label="Outcome"
                className="min-h-20 text-xs"
                value={(draft ?? initialDraft)?.squad.outcome ?? ""}
                onChange={(e) => {
                  const source = draft ?? initialDraft;
                  if (!source) return;
                  onDraftChange({
                    ...source,
                    squad: { ...source.squad, outcome: e.target.value },
                  });
                }}
              />
            ) : (
              <p className="text-xs text-muted-foreground leading-relaxed">
                {outcome || "No outcome defined."}
              </p>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Review Policy */}
        <Collapsible defaultOpen={!!reviewPolicy}>
          <CollapsibleTrigger className="flex w-full items-center justify-between px-5 py-3 border-b hover:bg-muted/30 transition-colors group">
            <div className="flex items-center gap-2">
              <Shield className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[13px] font-medium">Review Policy</span>
            </div>
            <ChevronDown className="h-3 w-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-5 py-3 border-b">
            {isEditing ? (
              <Textarea
                aria-label="Review Policy"
                className="min-h-20 text-xs"
                value={(draft ?? initialDraft)?.reviewPolicy ?? ""}
                onChange={(e) => {
                  const source = draft ?? initialDraft;
                  if (!source) return;
                  onDraftChange({ ...source, reviewPolicy: e.target.value });
                }}
              />
            ) : (
              <p className="text-xs text-muted-foreground leading-relaxed">
                {reviewPolicy || "No review policy defined."}
              </p>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Exit Criteria */}
        <Collapsible>
          <CollapsibleTrigger className="flex w-full items-center justify-between px-5 py-3 border-b hover:bg-muted/30 transition-colors group">
            <div className="flex items-center gap-2">
              <Settings className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[13px] font-medium">Exit Criteria</span>
            </div>
            <ChevronDown className="h-3 w-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-5 py-3 border-b">
            {isEditing && workflows[0] ? (
              <Textarea
                aria-label="Exit Criteria"
                className="min-h-20 text-xs"
                value={workflows[0].exitCriteria ?? ""}
                onChange={(e) => {
                  const source = draft ?? initialDraft;
                  if (!source) return;
                  onDraftChange({
                    ...source,
                    workflows: source.workflows.map((wf, i) =>
                      i === 0 ? { ...wf, exitCriteria: e.target.value } : wf,
                    ),
                  });
                }}
              />
            ) : (
              <p className="text-xs text-muted-foreground leading-relaxed">
                {workflows[0]?.exitCriteria || "No exit criteria defined."}
              </p>
            )}
          </CollapsibleContent>
        </Collapsible>
      </ScrollArea>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main SquadDetailSheet                                                      */
/* -------------------------------------------------------------------------- */
export function SquadDetailSheet({
  squadId,
  boardId,
  focusWorkflowId,
  onClose,
  onMissionLaunched,
}: SquadDetailSheetProps) {
  const [missionDialogOpen, setMissionDialogOpen] = useState(false);
  const { squad, workflows, agents } = useSquadDetailData(squadId);
  const [isEditing, setIsEditing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditableSquadDraft | null>(null);
  const [editingWorkflowNameId, setEditingWorkflowNameId] = useState<string | null>(null);
  const [selectedOverlayAgentName, setSelectedOverlayAgentName] = useState<string | null>(null);
  const [selectedSkillName, setSelectedSkillName] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<SquadViewMode>("workflow");
  const { isPublishing, publish } = useUpdatePublishedSquad();

  const canRunMission = squad?.status === "published" && !!boardId;
  const loadedAgents = useMemo(() => agents ?? [], [agents]);
  const loadedWorkflows = useMemo(() => workflows ?? [], [workflows]);
  const initialDraft = useMemo(
    () => (squad ? buildDraft(squad, loadedWorkflows, loadedAgents) : null),
    [squad, loadedAgents, loadedWorkflows],
  );

  const visibleWorkflows = useMemo(
    () => (draft ?? initialDraft)?.workflows ?? [],
    [draft, initialDraft],
  );
  const agentStepMap = useMemo(() => buildAgentStepMap(visibleWorkflows), [visibleWorkflows]);

  const handleClose = () => {
    setIsEditing(false);
    setDraft(null);
    setEditingWorkflowNameId(null);
    setSelectedOverlayAgentName(null);
    onClose();
  };

  const handlePublish = async () => {
    if (!squad || !draft) return;

    setPublishError(null);
    try {
      await publish({
        squadSpecId: squad._id,
        graph: {
          squad: {
            name: draft.squad.name,
            displayName: draft.squad.displayName,
            description: draft.squad.description || undefined,
            outcome: draft.squad.outcome || undefined,
          },
          agents: loadedAgents.map((agent) => ({
            key: agent.name,
            name: agent.name,
            role: agent.role,
            displayName: agent.displayName,
            prompt: agent.prompt,
            model: agent.model,
            skills: agent.skills,
            soul: agent.soul,
          })),
          workflows: draft.workflows.map((workflow) => ({
            id: workflow.id as Id<"workflowSpecs">,
            key: workflow.key,
            name: workflow.name,
            exitCriteria: workflow.exitCriteria || undefined,
            steps: workflow.steps.map((step) => ({
              id: step.id,
              type: step.type,
              title: step.title,
              description: step.description || undefined,
              agentKey: step.agentKey || undefined,
              reviewSpecId: step.reviewSpecId || undefined,
              onReject: step.onReject || undefined,
              dependsOn: step.dependsOn.length ? step.dependsOn : [],
            })),
          })),
          reviewPolicy: draft.reviewPolicy || undefined,
        },
      });
      setIsEditing(false);
      setDraft(null);
      setEditingWorkflowNameId(null);
    } catch {
      setPublishError("Failed to publish squad changes.");
    }
  };

  const updateWorkflowDraft = (nextWorkflow: EditableWorkflow) => {
    setDraft((current) => {
      const source = current ?? initialDraft;
      if (!source) return current;
      return {
        ...source,
        workflows: source.workflows.map((candidate) =>
          candidate.id === nextWorkflow.id ? nextWorkflow : candidate,
        ),
      };
    });
  };

  useEffect(() => {
    if (!squadId || !focusWorkflowId) return;

    const frameId = requestAnimationFrame(() => {
      const workflowElement = document.querySelector<HTMLElement>(
        `[data-workflow-id="${focusWorkflowId}"]`,
      );
      workflowElement?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    });

    return () => cancelAnimationFrame(frameId);
  }, [focusWorkflowId, squadId, visibleWorkflows.length]);

  const squadReviewPolicy = (draft ?? initialDraft)?.reviewPolicy;

  return (
    <>
      <Sheet open={!!squadId} onOpenChange={(open) => !open && handleClose()}>
        <SheetContent
          side="right"
          className="w-[96vw] sm:max-w-6xl flex flex-col p-0 overflow-hidden"
          hideClose
        >
          {squad ? (
            <>
              {/* ---- Header ---- */}
              <SheetHeader className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b shrink-0">
                <div className="flex items-center justify-between gap-3">
                  {/* Left: Squad identity */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shrink-0">
                      <Users className="h-3.5 w-3.5 text-white" />
                    </div>
                    <SheetTitle className="text-base font-semibold truncate">
                      {squad.name}
                    </SheetTitle>
                    <Badge
                      variant={squad.status === "published" ? "success" : "secondary"}
                      className="text-[11px] shrink-0"
                    >
                      {squad.status}
                    </Badge>
                    <SheetDescription className="sr-only">Squad detail editor</SheetDescription>
                  </div>

                  {/* Right: Controls */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* View mode toggle (desktop) */}
                    <div
                      role="tablist"
                      className="hidden sm:flex items-center rounded-lg border bg-muted/30 p-0.5"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={viewMode === "workflow"}
                        onClick={() => setViewMode("workflow")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          viewMode === "workflow"
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                        Workflow
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={viewMode === "agents"}
                        onClick={() => setViewMode("agents")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          viewMode === "agents"
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Users className="h-3.5 w-3.5" />
                        Agents
                      </button>
                    </div>

                    <div className="hidden sm:block w-px h-6 bg-border" />

                    {!isEditing && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => {
                          setDraft(initialDraft);
                          setIsEditing(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Edit</span>
                      </Button>
                    )}
                    {isEditing && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setDraft(null);
                            setEditingWorkflowNameId(null);
                            setIsEditing(false);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button size="sm" onClick={handlePublish} disabled={isPublishing}>
                          {isPublishing ? "Publishing..." : "Publish"}
                        </Button>
                      </>
                    )}
                    {canRunMission && !isEditing && (
                      <Button
                        size="sm"
                        variant="success"
                        className="gap-1.5"
                        onClick={() => setMissionDialogOpen(true)}
                      >
                        <Play className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Run Mission</span>
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0"
                      onClick={handleClose}
                      aria-label="Close"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </SheetHeader>

              {/* ---- Body ---- */}
              <div className="flex flex-1 min-h-0">
                {/* Main content area */}
                <div className="flex-1 min-w-0 flex flex-col">
                  {publishError && (
                    <div className="mx-4 sm:mx-6 mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {publishError}
                    </div>
                  )}

                  {/* Workflow view */}
                  {viewMode === "workflow" && (
                    <ScrollArea className="flex-1 min-h-0">
                      <div className="p-4 sm:p-6 space-y-4">
                        {/* Workflow tabs (when multiple workflows) */}
                        {visibleWorkflows.length > 1 && (
                          <div className="flex items-center gap-2 flex-wrap">
                            {visibleWorkflows.map((wf) => (
                              <button
                                key={wf.id}
                                type="button"
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                  focusWorkflowId === wf.id
                                    ? "border-primary bg-primary/5 text-foreground"
                                    : "border-border bg-muted/30 text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                {isEditing && editingWorkflowNameId === wf.id ? (
                                  <Input
                                    aria-label="Workflow name"
                                    className="h-6 text-xs w-32"
                                    autoFocus
                                    value={wf.name}
                                    onBlur={() => setEditingWorkflowNameId(null)}
                                    onChange={(e) =>
                                      updateWorkflowDraft({
                                        ...wf,
                                        name: e.target.value,
                                      })
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") setEditingWorkflowNameId(null);
                                    }}
                                  />
                                ) : (
                                  <span
                                    onDoubleClick={() =>
                                      isEditing && setEditingWorkflowNameId(wf.id)
                                    }
                                  >
                                    {wf.name}
                                  </span>
                                )}
                              </button>
                            ))}
                            {isEditing && (
                              <button
                                type="button"
                                className="w-7 h-7 rounded-lg border border-dashed border-muted-foreground/30 flex items-center justify-center text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                                aria-label="Add workflow"
                              >
                                <span className="text-sm">+</span>
                              </button>
                            )}
                          </div>
                        )}

                        {/* Single workflow name display */}
                        {visibleWorkflows.length === 1 && (
                          <div className="flex items-center gap-2">
                            {isEditing && editingWorkflowNameId === visibleWorkflows[0]?.id ? (
                              <Input
                                aria-label="Workflow name"
                                className="h-8 max-w-xs"
                                autoFocus
                                value={visibleWorkflows[0].name}
                                onBlur={() => setEditingWorkflowNameId(null)}
                                onChange={(e) =>
                                  updateWorkflowDraft({
                                    ...visibleWorkflows[0],
                                    name: e.target.value,
                                  })
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") setEditingWorkflowNameId(null);
                                }}
                              />
                            ) : (
                              <p className="text-sm font-medium text-muted-foreground">
                                {visibleWorkflows[0]?.name}
                              </p>
                            )}
                            {isEditing && (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                aria-label="Edit workflow name"
                                onClick={() => setEditingWorkflowNameId(visibleWorkflows[0].id)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        )}

                        {/* Workflow canvases */}
                        {loadedWorkflows.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No workflows defined yet.</p>
                        ) : (
                          <div className="space-y-4">
                            {visibleWorkflows.map((workflow) => (
                              <div key={workflow.id} data-workflow-id={workflow.id}>
                                <SquadWorkflowCanvas
                                  workflow={workflow}
                                  agents={loadedAgents}
                                  isEditing={isEditing}
                                  showWorkflowNameField={false}
                                  onChange={updateWorkflowDraft}
                                  onSelectAgent={(name) => setSelectedOverlayAgentName(name)}
                                />
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Mobile: Outcome & Review Policy inline */}
                        <div className="md:hidden space-y-4">
                          {((draft ?? initialDraft)?.squad.outcome || squad.outcome) && (
                            <div>
                              <h4 className="text-sm font-semibold mb-1">Outcome</h4>
                              <p className="text-sm text-muted-foreground">
                                {(draft ?? initialDraft)?.squad.outcome ?? squad.outcome}
                              </p>
                            </div>
                          )}
                          {squadReviewPolicy && (
                            <div>
                              <h4 className="text-sm font-semibold mb-1">Review Policy</h4>
                              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                {squadReviewPolicy}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </ScrollArea>
                  )}

                  {/* Agents view */}
                  {viewMode === "agents" && (
                    <ScrollArea className="flex-1 min-h-0">
                      <div className="p-4 sm:p-6">
                        {loadedAgents.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No agents defined yet.</p>
                        ) : (
                          <div
                            data-testid="squad-agent-grid"
                            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
                          >
                            {loadedAgents.map((agent) => (
                              <AgentCard
                                key={agent._id}
                                agent={agent}
                                assignedSteps={agentStepMap.get(agent.name) ?? []}
                                onClickAgent={(name) => setSelectedOverlayAgentName(name)}
                                onClickSkill={(name) => setSelectedSkillName(name)}
                              />
                            ))}
                          </div>
                        )}

                        {/* Mobile: Run Mission button */}
                        {canRunMission && !isEditing && (
                          <div className="sm:hidden mt-4">
                            <Button
                              className="w-full gap-2"
                              variant="success"
                              onClick={() => setMissionDialogOpen(true)}
                            >
                              <Play className="h-4 w-4" />
                              Run Mission
                            </Button>
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  )}
                </div>

                {/* Right context rail (desktop) */}
                <ContextRail
                  squad={squad}
                  agents={loadedAgents}
                  workflows={visibleWorkflows}
                  outcome={squad.outcome}
                  reviewPolicy={squadReviewPolicy}
                  isEditing={isEditing}
                  draft={draft}
                  initialDraft={initialDraft}
                  onDraftChange={setDraft}
                />
              </div>

              {/* Mobile bottom nav */}
              <MobileSquadNav active={viewMode} onChange={setViewMode} />
            </>
          ) : (
            <>
              <SheetHeader className="px-6 pt-6 pb-4 border-b">
                <SheetTitle>Squad details</SheetTitle>
                <SheetDescription>Fetching squad details and workflows.</SheetDescription>
              </SheetHeader>
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Loading squad...</p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {squadId && boardId && squad && (
        <RunSquadMissionDialog
          open={missionDialogOpen}
          onClose={() => setMissionDialogOpen(false)}
          onLaunched={(taskId) => {
            setMissionDialogOpen(false);
            onMissionLaunched?.(taskId);
          }}
          squadSpecId={squadId}
          squadDisplayName={squad.name}
          boardId={boardId}
        />
      )}

      <AgentConfigSheet
        agentName={selectedOverlayAgentName}
        onClose={() => setSelectedOverlayAgentName(null)}
      />

      <SkillDetailDialog skillName={selectedSkillName} onClose={() => setSelectedSkillName(null)} />
    </>
  );
}
