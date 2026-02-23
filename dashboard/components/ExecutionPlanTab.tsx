"use client";

import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ExecutionPlanStep {
  stepId: string;
  description: string;
  assignedAgent?: string;
  dependsOn: string[];
  parallelGroup?: string;
  status: string;
}

interface ExecutionPlanTabProps {
  executionPlan: { steps: ExecutionPlanStep[]; createdAt: string } | null | undefined;
}

function StepStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "in_progress":
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Circle className="h-4 w-4 text-muted-foreground" />;
  }
}

export function ExecutionPlanTab({ executionPlan }: ExecutionPlanTabProps) {
  if (!executionPlan || !executionPlan.steps || executionPlan.steps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Direct execution &mdash; no multi-step plan
      </p>
    );
  }

  const { steps } = executionPlan;
  const completedCount = steps.filter((s) => s.status === "completed").length;

  // Pre-compute which steps should show a parallel group label (no mutation during render)
  const showGroupLabelAt = steps.map((step, index) => {
    if (!step.parallelGroup) return false;
    if (index === 0) return true;
    return steps[index - 1].parallelGroup !== step.parallelGroup;
  });

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-muted-foreground">
          {completedCount}/{steps.length} steps completed
        </span>
      </div>

      {steps.map((step, index) => {
        const showGroupLabel = showGroupLabelAt[index];

        const hasDeps = step.dependsOn && step.dependsOn.length > 0;

        return (
          <div key={step.stepId}>
            {showGroupLabel && (
              <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-600 mb-2">
                Parallel
              </Badge>
            )}
            <div
              className={`flex items-start gap-3 py-2 ${hasDeps ? "ml-4 border-l-2 border-border pl-3" : ""}`}
            >
              <span className="text-xs text-muted-foreground font-mono w-5 pt-0.5">
                {index + 1}
              </span>
              <StepStatusIcon status={step.status} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">{step.description}</p>
                {step.assignedAgent && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {step.assignedAgent}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
