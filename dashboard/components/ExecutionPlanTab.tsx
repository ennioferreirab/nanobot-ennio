"use client";

import { useMemo } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDot,
  Loader2,
  Lock,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { STATUS_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export interface ExecutionPlanStep {
  stepId?: string;
  tempId?: string;
  title?: string;
  description: string;
  assignedAgent?: string;
  dependsOn?: string[];
  blockedBy?: string[];
  parallelGroup?: string | number;
  status?: string;
  order?: number;
  errorMessage?: string;
}

interface LiveStep {
  _id: string;
  title: string;
  description: string;
  assignedAgent: string;
  status: string;
  blockedBy?: string[];
  parallelGroup: number;
  order: number;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
}

interface ExecutionPlanTabProps {
  executionPlan:
    | { steps: ExecutionPlanStep[]; createdAt?: string; generatedAt?: string }
    | null
    | undefined;
  liveSteps?: LiveStep[];
  isPlanning?: boolean;
}

interface NormalizedStep {
  stepId: string;
  title?: string;
  description: string;
  assignedAgent?: string;
  dependencies: string[];
  parallelGroup?: string | number;
  status: string;
  order: number;
  errorMessage?: string;
}

interface StepGroup {
  parallelGroup?: string | number;
  steps: NormalizedStep[];
}

interface StepStatusMeta {
  badgeText: string;
  iconColorClass: string;
  badgeClass: string;
  rowClass: string;
  runningPulse?: boolean;
  icon: "completed" | "running" | "failed" | "blocked" | "assigned" | "pending";
}

function normalizeStatus(status: string | null | undefined): string {
  if (typeof status !== "string") {
    return "planned";
  }
  const normalized = status.trim().toLowerCase();
  return normalized || "planned";
}

function getStatusMeta(status: string): StepStatusMeta {
  const normalized = normalizeStatus(status);

  switch (normalized) {
    case "assigned":
      return {
        badgeText: "Assigned",
        iconColorClass: "text-cyan-500",
        badgeClass: `${STATUS_COLORS.assigned.bg} ${STATUS_COLORS.assigned.text}`,
        rowClass: "opacity-100",
        icon: "assigned",
      };
    case "blocked":
      return {
        badgeText: "Blocked",
        iconColorClass: "text-amber-500",
        badgeClass: `${STATUS_COLORS.review.bg} ${STATUS_COLORS.review.text}`,
        rowClass: "opacity-70",
        icon: "blocked",
      };
    case "running":
      return {
        badgeText: "Running",
        iconColorClass: "text-blue-500",
        badgeClass: `${STATUS_COLORS.in_progress.bg} ${STATUS_COLORS.in_progress.text}`,
        rowClass: "opacity-100",
        runningPulse: true,
        icon: "running",
      };
    case "in_progress":
      return {
        badgeText: "In Progress",
        iconColorClass: "text-blue-500",
        badgeClass: `${STATUS_COLORS.in_progress.bg} ${STATUS_COLORS.in_progress.text}`,
        rowClass: "opacity-100",
        runningPulse: true,
        icon: "running",
      };
    case "completed":
      return {
        badgeText: "Done",
        iconColorClass: "text-green-500",
        badgeClass: `${STATUS_COLORS.done.bg} ${STATUS_COLORS.done.text}`,
        rowClass: "opacity-70",
        icon: "completed",
      };
    case "crashed":
      return {
        badgeText: "Crashed",
        iconColorClass: "text-red-500",
        badgeClass: `${STATUS_COLORS.crashed.bg} ${STATUS_COLORS.crashed.text}`,
        rowClass: "opacity-100",
        icon: "failed",
      };
    case "failed":
      return {
        badgeText: "Failed",
        iconColorClass: "text-red-500",
        badgeClass: `${STATUS_COLORS.crashed.bg} ${STATUS_COLORS.crashed.text}`,
        rowClass: "opacity-100",
        icon: "failed",
      };
    case "planned":
      return {
        badgeText: "Planned",
        iconColorClass: "text-muted-foreground",
        badgeClass: "bg-muted text-muted-foreground",
        rowClass: "opacity-70",
        icon: "pending",
      };
    case "pending":
    default:
      return {
        badgeText: "Pending",
        iconColorClass: "text-muted-foreground",
        badgeClass: "bg-muted text-muted-foreground",
        rowClass: "opacity-70",
        icon: "pending",
      };
  }
}

function getDependencyIds(step: ExecutionPlanStep): string[] {
  return (step.blockedBy ?? step.dependsOn ?? []).map((id) => String(id));
}

function normalizePlanSteps(planSteps: ExecutionPlanStep[]): NormalizedStep[] {
  return planSteps
    .map((step, index) => ({ step, index }))
    .sort((a, b) => {
      const aOrder = a.step.order ?? a.index + 1;
      const bOrder = b.step.order ?? b.index + 1;
      return aOrder - bOrder;
    })
    .map(({ step }, index) => ({
      stepId: String(step.stepId ?? step.tempId ?? `step-${index + 1}`),
      title: step.title,
      description: step.description,
      assignedAgent: step.assignedAgent,
      dependencies: getDependencyIds(step),
      parallelGroup: step.parallelGroup,
      status: normalizeStatus(step.status),
      order: step.order ?? index + 1,
      errorMessage: step.errorMessage,
    }));
}

function mergeStepsWithLiveData(
  planSteps: NormalizedStep[],
  liveSteps: LiveStep[] | undefined
): NormalizedStep[] {
  if (!liveSteps || liveSteps.length === 0) {
    return planSteps;
  }

  const byOrder = new Map<number, LiveStep>();
  const byTitle = new Map<string, LiveStep>();
  const byDescription = new Map<string, LiveStep>();
  const byLiveId = new Map<string, LiveStep>();

  for (const liveStep of liveSteps) {
    byOrder.set(liveStep.order, liveStep);
    byTitle.set(liveStep.title, liveStep);
    byDescription.set(liveStep.description, liveStep);
    byLiveId.set(liveStep._id, liveStep);
  }

  const matched = planSteps.map((planStep) => {
    const liveStep =
      byOrder.get(planStep.order) ??
      (planStep.title ? byTitle.get(planStep.title) : undefined) ??
      byDescription.get(planStep.description);
    return { planStep, liveStep };
  });

  const planIdByLiveId = new Map<string, string>();
  const planIdByOrder = new Map<number, string>();
  for (const { planStep, liveStep } of matched) {
    planIdByOrder.set(planStep.order, planStep.stepId);
    if (liveStep?._id) {
      planIdByLiveId.set(liveStep._id, planStep.stepId);
    }
  }

  const resolveDependencyId = (dependencyId: string): string => {
    const mappedById = planIdByLiveId.get(dependencyId);
    if (mappedById) {
      return mappedById;
    }

    const dependencyLiveStep = byLiveId.get(dependencyId);
    if (!dependencyLiveStep) {
      return dependencyId;
    }

    return planIdByOrder.get(dependencyLiveStep.order) ?? dependencyId;
  };

  return matched.map(({ planStep, liveStep }) => {
    if (!liveStep) {
      return planStep;
    }

    return {
      ...planStep,
      title: liveStep.title ?? planStep.title,
      description: liveStep.description || planStep.description,
      assignedAgent: liveStep.assignedAgent || planStep.assignedAgent,
      dependencies:
        planStep.dependencies.length > 0
          ? planStep.dependencies
          : (liveStep.blockedBy ?? []).map((id) =>
              resolveDependencyId(String(id))
            ),
      parallelGroup: liveStep.parallelGroup ?? planStep.parallelGroup,
      status: normalizeStatus(liveStep.status) || planStep.status,
      order: liveStep.order ?? planStep.order,
      errorMessage: liveStep.errorMessage ?? planStep.errorMessage,
    };
  });
}

function groupConsecutiveSteps(steps: NormalizedStep[]): StepGroup[] {
  const groups: StepGroup[] = [];

  for (const step of steps) {
    const hasParallelGroup =
      step.parallelGroup !== undefined &&
      step.parallelGroup !== null &&
      String(step.parallelGroup).length > 0;

    if (!hasParallelGroup) {
      groups.push({ steps: [step] });
      continue;
    }

    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.parallelGroup === step.parallelGroup) {
      lastGroup.steps.push(step);
      continue;
    }

    groups.push({ parallelGroup: step.parallelGroup, steps: [step] });
  }

  return groups;
}

function shouldRenderGroupConnector(currentGroup: StepGroup, nextGroup: StepGroup): boolean {
  const currentIds = new Set(currentGroup.steps.map((step) => step.stepId));
  return nextGroup.steps.some((step) =>
    step.dependencies.some((dependencyId) => currentIds.has(dependencyId))
  );
}

function formatDependencyLabel(
  dependencyIds: string[],
  stepNumberById: Map<string, number>
): string {
  if (dependencyIds.length === 0) {
    return "";
  }

  const labels = dependencyIds.map((dependencyId) => {
    const stepNumber = stepNumberById.get(dependencyId);
    return stepNumber ? `Step ${stepNumber}` : dependencyId;
  });

  return `depends on: ${labels.join(", ")}`;
}

function StepStatusIcon({ status, stepId }: { status: string; stepId: string }) {
  const meta = getStatusMeta(status);
  const className = cn("h-4 w-4", meta.iconColorClass, meta.icon === "running" && "animate-spin");
  const testId = `step-status-icon-${stepId}`;

  switch (meta.icon) {
    case "completed":
      return <CheckCircle2 data-testid={testId} className={className} />;
    case "running":
      return <Loader2 data-testid={testId} className={className} />;
    case "failed":
      return <XCircle data-testid={testId} className={className} />;
    case "blocked":
      return <Lock data-testid={testId} className={className} />;
    case "assigned":
      return <CircleDot data-testid={testId} className={className} />;
    case "pending":
    default:
      return <Circle data-testid={testId} className={className} />;
  }
}

function StepStatusBadge({ status, stepId }: { status: string; stepId: string }) {
  const meta = getStatusMeta(status);

  return (
    <Badge
      data-testid={`step-status-badge-${stepId}`}
      variant="secondary"
      className={cn("text-[10px] font-medium", meta.badgeClass)}
    >
      {meta.badgeText}
    </Badge>
  );
}

function StepCard({
  step,
  stepNumber,
  stepNumberById,
}: {
  step: NormalizedStep;
  stepNumber: number;
  stepNumberById: Map<string, number>;
}) {
  const statusMeta = getStatusMeta(step.status);
  const hasDependencies = step.dependencies.length > 0;
  const dependencyLabel = formatDependencyLabel(step.dependencies, stepNumberById);

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-background p-3",
        statusMeta.rowClass,
        statusMeta.runningPulse && "motion-safe:animate-pulse"
      )}
    >
      <div
        className={cn(
          "flex items-start gap-3",
          hasDependencies && "ml-4 border-l-2 border-border pl-3 relative"
        )}
      >
        {hasDependencies && (
          <span className="absolute -left-[5px] top-2 h-2 w-2 rounded-full bg-border" />
        )}
        <span className="text-xs text-muted-foreground font-mono w-5 pt-0.5">
          {stepNumber}
        </span>
        <StepStatusIcon status={step.status} stepId={step.stepId} />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {step.title && (
                <p className="text-sm font-medium text-foreground">{step.title}</p>
              )}
              <p
                className={cn(
                  "text-sm",
                  step.title ? "text-muted-foreground" : "text-foreground"
                )}
              >
                {step.description}
              </p>
            </div>
            <StepStatusBadge status={step.status} stepId={step.stepId} />
          </div>

          {step.assignedAgent && (
            <p className="text-xs text-muted-foreground">{step.assignedAgent}</p>
          )}

          {hasDependencies && dependencyLabel && (
            <p className="text-xs text-muted-foreground">{dependencyLabel}</p>
          )}

          {(normalizeStatus(step.status) === "crashed" || normalizeStatus(step.status) === "failed") &&
            step.errorMessage && (
              <p className="text-xs text-red-600">{step.errorMessage}</p>
            )}
        </div>
      </div>
    </div>
  );
}

export function ExecutionPlanTab({
  executionPlan,
  liveSteps,
  isPlanning = false,
}: ExecutionPlanTabProps) {
  const steps = useMemo(() => {
    if (!executionPlan?.steps || executionPlan.steps.length === 0) {
      return [];
    }
    const normalizedPlan = normalizePlanSteps(executionPlan.steps);
    return mergeStepsWithLiveData(normalizedPlan, liveSteps);
  }, [executionPlan, liveSteps]);

  const completedCount = steps.filter(
    (step) => normalizeStatus(step.status) === "completed"
  ).length;

  const groups = useMemo(() => groupConsecutiveSteps(steps), [steps]);

  const stepNumberById = useMemo(
    () => new Map(steps.map((step, index) => [step.stepId, index + 1] as const)),
    [steps]
  );

  if (isPlanning && !executionPlan) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
        <p className="text-sm text-muted-foreground">Generating execution plan...</p>
      </div>
    );
  }

  if (!executionPlan || !executionPlan.steps || executionPlan.steps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Direct execution &mdash; no multi-step plan
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">
          {completedCount}/{steps.length} steps completed
        </span>
      </div>

      {groups.map((group, groupIndex) => {
        const isParallelLane =
          group.parallelGroup !== undefined && group.steps.length > 1;

        return (
          <div key={`group-${groupIndex}`} className="space-y-2">
            {isParallelLane ? (
              <div
                data-testid={`parallel-group-${String(group.parallelGroup)}`}
                className="rounded-md border border-border bg-muted/30 p-3"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Badge
                    variant="secondary"
                    className="text-xs bg-blue-50 text-blue-600"
                  >
                    Parallel
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    Group {group.parallelGroup}
                  </Badge>
                </div>
                <div className="flex flex-row flex-wrap gap-3">
                  {group.steps.map((step) => (
                    <div key={step.stepId} className="flex-1 min-w-[220px]">
                      <StepCard
                        step={step}
                        stepNumber={stepNumberById.get(step.stepId) ?? step.order}
                        stepNumberById={stepNumberById}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              group.steps.map((step) => (
                <StepCard
                  key={step.stepId}
                  step={step}
                  stepNumber={stepNumberById.get(step.stepId) ?? step.order}
                  stepNumberById={stepNumberById}
                />
              ))
            )}

            {groupIndex < groups.length - 1 &&
              shouldRenderGroupConnector(group, groups[groupIndex + 1]) && (
                <div className="flex flex-col items-center py-1">
                  <div className="w-px h-4 bg-border" />
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </div>
              )}
          </div>
        );
      })}
    </div>
  );
}
