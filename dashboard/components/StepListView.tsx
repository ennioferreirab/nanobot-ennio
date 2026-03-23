"use client";

import { cn } from "@/lib/utils";
import { getInitials, getAvatarColor } from "@/lib/agentUtils";

export interface StepListStep {
  stepId: string;
  title?: string;
  description: string;
  status?: string;
  assignedAgent?: string;
  duration?: string;
  errorMessage?: string;
  parallelGroup?: string | number;
  isLiveStep?: boolean;
}

interface StepListViewProps {
  steps: StepListStep[];
  onStepClick?: (stepId: string) => void;
  className?: string;
}

/* ── Status indicator ── */

function StatusIndicator({ status }: { status?: string }) {
  const s = status ?? "planned";

  if (s === "completed") {
    return (
      <div className="flex-shrink-0 w-5 flex items-center justify-center">
        <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path
              d="M1 4L3.5 6.5L9 1"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    );
  }

  if (s === "running" || s === "in_progress") {
    return (
      <div className="flex-shrink-0 w-5 flex items-center justify-center">
        <div className="relative w-4 h-4 animate-pulse">
          {/* outer ring */}
          <div className="absolute inset-0 rounded-full border-2 border-blue-500" />
          {/* inner filled dot */}
          <div className="absolute inset-[3px] rounded-full bg-blue-500" />
        </div>
      </div>
    );
  }

  if (s === "failed" || s === "crashed" || s === "error") {
    return (
      <div className="flex-shrink-0 w-5 flex items-center justify-center">
        <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1 1L7 7M7 1L1 7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    );
  }

  if (s === "blocked") {
    return (
      <div className="flex-shrink-0 w-5 flex items-center justify-center">
        <div className="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
          <svg width="8" height="9" viewBox="0 0 8 9" fill="none">
            <rect x="1" y="4" width="6" height="4.5" rx="0.75" fill="white" />
            <path
              d="M2 4V2.5C2 1.672 2.895 1 4 1C5.105 1 6 1.672 6 2.5V4"
              stroke="white"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>
    );
  }

  if (s === "waiting_human") {
    return (
      <div className="flex-shrink-0 w-5 flex items-center justify-center">
        <div className="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
          <svg width="8" height="9" viewBox="0 0 8 9" fill="none">
            <circle cx="4" cy="2.5" r="1.5" fill="white" />
            <path
              d="M1 8C1 6.343 2.343 5 4 5C5.657 5 7 6.343 7 8"
              stroke="white"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>
    );
  }

  // planned / default: gray outline circle
  return (
    <div className="flex-shrink-0 w-5 flex items-center justify-center">
      <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/40" />
    </div>
  );
}

/* ── Agent avatar ── */

function AgentAvatar({ name }: { name: string }) {
  const initials = getInitials(name);
  const colorClass = getAvatarColor(name);
  return (
    <div
      className={cn(
        "flex-shrink-0 w-[18px] h-[18px] rounded-full flex items-center justify-center text-white",
        colorClass,
      )}
      style={{ fontSize: "8px", fontWeight: 600, lineHeight: 1 }}
      title={name}
    >
      {initials}
    </div>
  );
}

/* ── Duration badge ── */

function DurationLabel({ duration, status }: { duration?: string; status?: string }) {
  const s = status ?? "planned";
  const isRunning = s === "running" || s === "in_progress";

  if (isRunning) {
    return (
      <span className="font-mono text-[11px] text-blue-500 whitespace-nowrap">Running...</span>
    );
  }
  if (!duration) return null;
  return (
    <span className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
      {duration}
    </span>
  );
}

/* ── Title color by status ── */

function titleColorClass(status?: string): string {
  const s = status ?? "planned";
  if (s === "completed") return "text-foreground/70";
  if (s === "running" || s === "in_progress") return "text-foreground font-medium";
  return "text-muted-foreground";
}

/* ── Connector ── */

function Connector({ currentStatus, nextStatus }: { currentStatus?: string; nextStatus?: string }) {
  const currentCompleted = currentStatus === "completed";
  const nextCompleted = nextStatus === "completed";
  const nextRunning = nextStatus === "running" || nextStatus === "in_progress";

  return (
    <div className="flex justify-center py-0">
      <div
        className={cn(
          "w-0.5 h-4",
          currentCompleted && nextCompleted
            ? "bg-green-500"
            : currentCompleted && nextRunning
              ? "bg-blue-500"
              : "bg-border",
        )}
      />
    </div>
  );
}

/* ── Parallel label ── */

function ParallelLabel() {
  return (
    <div className="flex items-center gap-2 py-2">
      <div className="flex-1 border-t border-dashed border-muted-foreground/30" />
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
        PARALLEL
      </span>
      <div className="flex-1 border-t border-dashed border-muted-foreground/30" />
    </div>
  );
}

/* ── Step card ── */

function StepCard({ step, onClick }: { step: StepListStep; onClick?: (stepId: string) => void }) {
  const s = step.status ?? "planned";
  const isRunning = s === "running" || s === "in_progress";

  return (
    <div
      className={cn(
        "bg-card border rounded-[10px] px-4 py-3 cursor-default",
        isRunning ? "border-primary" : "border-border",
        onClick && "cursor-pointer hover:bg-muted/30 transition-colors",
      )}
      onClick={onClick ? () => onClick(step.stepId) : undefined}
    >
      <div className="flex items-center gap-3 min-w-0">
        <StatusIndicator status={step.status} />

        {/* content */}
        <div className="flex-1 min-w-0">
          <p className={cn("text-[14px] leading-snug truncate", titleColorClass(step.status))}>
            {step.title ?? step.description}
          </p>
          {isRunning && step.title && step.description && step.description !== step.title && (
            <p className="text-[12px] text-muted-foreground truncate mt-0.5">{step.description}</p>
          )}
          {step.errorMessage && (
            <p className="text-xs text-destructive mt-1 font-mono">{step.errorMessage}</p>
          )}
        </div>

        {/* right: avatar + duration */}
        <div className="flex-shrink-0 flex items-center gap-2 ml-2">
          {step.assignedAgent && <AgentAvatar name={step.assignedAgent} />}
          <DurationLabel duration={step.duration} status={step.status} />
        </div>
      </div>

      {/* inset detail for running step */}
      {isRunning && (
        <div className="mt-2 bg-background rounded-md p-2">
          <p className="text-[12px] font-mono text-muted-foreground">
            {step.errorMessage ?? step.description}
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Main component ── */

export function StepListView({ steps, onStepClick, className }: StepListViewProps) {
  if (steps.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">No execution steps</p>;
  }

  // Build render elements: handle parallel groups
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < steps.length) {
    const step = steps[i];
    const pg = step.parallelGroup;

    if (pg !== undefined && pg !== null && steps[i + 1]?.parallelGroup === pg) {
      // Collect the full parallel group
      const groupSteps: StepListStep[] = [];
      while (i < steps.length && steps[i].parallelGroup === pg) {
        groupSteps.push(steps[i]);
        i++;
      }

      elements.push(
        <div key={`parallel-group-${pg}-${i}`}>
          <ParallelLabel />
          <div className="flex gap-3">
            {groupSteps.map((gs) => (
              <div key={gs.stepId} className="flex-1 min-w-0">
                <StepCard step={gs} onClick={onStepClick} />
              </div>
            ))}
          </div>
        </div>,
      );
    } else {
      elements.push(<StepCard key={step.stepId} step={step} onClick={onStepClick} />);
      i++;
    }
  }

  // Interleave connectors between elements
  const withConnectors: React.ReactNode[] = [];
  for (let j = 0; j < elements.length; j++) {
    withConnectors.push(elements[j]);
    if (j < elements.length - 1) {
      withConnectors.push(
        <Connector
          key={`connector-${j}`}
          currentStatus={getLastStatusInGroup(steps, elements, j)}
          nextStatus={getFirstStatusInGroup(steps, elements, j + 1)}
        />,
      );
    }
  }

  return <div className={cn("flex flex-col", className)}>{withConnectors}</div>;
}

/* ── Helpers for connector status resolution ── */

/**
 * Given an element index, find the step index it corresponds to in the steps array.
 * For parallel groups the element spans multiple steps; returns the index of the first.
 */
function resolveIndexForElement(
  steps: StepListStep[],
  elements: React.ReactNode[],
  elementIndex: number,
): number {
  // Walk through elements counting steps consumed
  let consumed = 0;
  for (let k = 0; k < elementIndex; k++) {
    consumed += countStepsInElement(steps, consumed);
  }
  return consumed;
}

function countStepsInElement(steps: StepListStep[], startIdx: number): number {
  if (startIdx >= steps.length) return 1;
  const pg = steps[startIdx].parallelGroup;
  if (pg === undefined || pg === null) return 1;
  // Count consecutive steps with same parallelGroup
  let count = 0;
  let i = startIdx;
  while (i < steps.length && steps[i].parallelGroup === pg) {
    count++;
    i++;
  }
  return count > 1 ? count : 1;
}

/**
 * Get the last step's status for a given element (for parallel groups: use the
 * status of any completed step, else the running step, else the first).
 */
function getLastStatusInGroup(
  steps: StepListStep[],
  elements: React.ReactNode[],
  elementIndex: number,
): string | undefined {
  const startIdx = resolveIndexForElement(steps, elements, elementIndex);
  const count = countStepsInElement(steps, startIdx);
  const groupSteps = steps.slice(startIdx, startIdx + count);
  // For single step
  if (groupSteps.length === 1) return groupSteps[0].status;
  // For parallel: completed if all completed, else running if any running
  if (groupSteps.every((s) => s.status === "completed")) return "completed";
  if (groupSteps.some((s) => s.status === "running" || s.status === "in_progress"))
    return "running";
  return groupSteps[0].status;
}

function getFirstStatusInGroup(
  steps: StepListStep[],
  elements: React.ReactNode[],
  elementIndex: number,
): string | undefined {
  const startIdx = resolveIndexForElement(steps, elements, elementIndex);
  if (startIdx >= steps.length) return undefined;
  const count = countStepsInElement(steps, startIdx);
  const groupSteps = steps.slice(startIdx, startIdx + count);
  if (groupSteps.length === 1) return groupSteps[0].status;
  if (groupSteps.some((s) => s.status === "running" || s.status === "in_progress"))
    return "running";
  if (groupSteps.every((s) => s.status === "completed")) return "completed";
  return groupSteps[0].status;
}
