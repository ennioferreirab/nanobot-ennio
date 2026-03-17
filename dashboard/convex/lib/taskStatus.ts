import { ConvexError } from "convex/values";

import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

import { applyRequiredTaskTransition } from "./taskTransitions";
import { logActivity } from "./workflowHelpers";

export async function pauseTaskExecution(
  ctx: Pick<MutationCtx, "db">,
  taskId: Id<"tasks">,
  task: Doc<"tasks">,
): Promise<Id<"tasks">> {
  if (task.status !== "in_progress") {
    throw new ConvexError(`Cannot pause task in status '${task.status}'. Expected: in_progress`);
  }

  await applyRequiredTaskTransition(ctx, task, {
    taskId,
    fromStatus: "in_progress",
    toStatus: "review",
    reviewPhase: "execution_pause",
    reason: "User paused task execution",
    idempotencyKey: `task:${String(taskId)}:${task.stateVersion ?? 0}:pause-execution`,
    suppressActivityLog: true,
  });

  await logActivity(ctx, {
    taskId,
    eventType: "review_requested",
    description: "User paused task execution",
    timestamp: new Date().toISOString(),
  });

  return taskId;
}

export async function resumeTaskExecution(
  ctx: Pick<MutationCtx, "db">,
  taskId: Id<"tasks">,
  task: Doc<"tasks">,
  executionPlan: unknown,
): Promise<Id<"tasks">> {
  if (task.status !== "review") {
    throw new ConvexError(`Cannot resume task in status '${task.status}'. Expected: review`);
  }
  if (task.awaitingKickoff === true) {
    throw new ConvexError(
      "Cannot use resumeTask on a pre-kickoff task. Use approveAndKickOff instead.",
    );
  }
  if (task.reviewPhase !== "execution_pause") {
    throw new ConvexError(
      "Cannot use resumeTask on a non-paused review task. Expected reviewPhase=execution_pause.",
    );
  }

  await applyRequiredTaskTransition(ctx, task, {
    taskId,
    fromStatus: "review",
    toStatus: "in_progress",
    reviewPhase: undefined,
    awaitingKickoff: false,
    reason: "User resumed task execution",
    idempotencyKey: `task:${String(taskId)}:${task.stateVersion ?? 0}:resume-execution`,
    suppressActivityLog: true,
  });

  const patch: Record<string, unknown> = {};
  if (executionPlan !== undefined) {
    patch.executionPlan = executionPlan;
  }
  if (Object.keys(patch).length > 0) {
    patch.updatedAt = new Date().toISOString();
    await ctx.db.patch(taskId, patch);
  }

  await logActivity(ctx, {
    taskId,
    eventType: "task_started",
    description: "User resumed task execution",
    timestamp: new Date().toISOString(),
  });

  return taskId;
}

export async function approveKickOffTask(
  ctx: Pick<MutationCtx, "db">,
  taskId: Id<"tasks">,
  task: Doc<"tasks">,
  executionPlan: unknown,
): Promise<Id<"tasks">> {
  if (task.status !== "review") {
    throw new ConvexError(`Cannot kick off task in status '${task.status}'. Expected: review`);
  }
  if (
    task.reviewPhase !== "plan_review" &&
    task.awaitingKickoff !== true &&
    task.isManual !== true
  ) {
    throw new ConvexError("Cannot kick off task: requires awaitingKickoff or isManual");
  }

  const plan = executionPlan ?? task.executionPlan;
  const planGeneratedAt =
    typeof plan === "object" &&
    plan !== null &&
    "generatedAt" in plan &&
    typeof plan.generatedAt === "string"
      ? plan.generatedAt
      : undefined;

  await applyRequiredTaskTransition(ctx, task, {
    taskId,
    fromStatus: "review",
    toStatus: "in_progress",
    reviewPhase: undefined,
    awaitingKickoff: false,
    reason: "User approved plan and kicked off task",
    idempotencyKey: `task:${String(taskId)}:${task.stateVersion ?? 0}:approve-kickoff`,
    suppressActivityLog: true,
  });

  const patch: Record<string, unknown> = {};
  if (executionPlan !== undefined) {
    patch.executionPlan = executionPlan;
  }
  if (Object.keys(patch).length > 0) {
    patch.updatedAt = new Date().toISOString();
    await ctx.db.patch(taskId, patch);
  }

  if (planGeneratedAt) {
    await ctx.db.insert("messages", {
      taskId,
      authorName: "User",
      authorType: "user",
      content: "Approved the execution plan and started the task.",
      messageType: "approval",
      planReview: {
        kind: "decision",
        planGeneratedAt,
        decision: "approved",
      },
      timestamp: new Date().toISOString(),
    });
  }

  const stepCount =
    typeof plan === "object" && plan !== null && "steps" in plan && Array.isArray(plan.steps)
      ? plan.steps.length
      : 0;

  await logActivity(ctx, {
    taskId,
    eventType: "task_started",
    description: `User approved plan and kicked off task (${stepCount} step${stepCount === 1 ? "" : "s"})`,
    timestamp: new Date().toISOString(),
  });

  return taskId;
}
