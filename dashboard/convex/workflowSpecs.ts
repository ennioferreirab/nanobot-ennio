import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";

import { specStatusValidator, workflowStepTypeValidator } from "./schema";

type WorkflowStepRecord = {
  id: string;
  type: "agent" | "human" | "checkpoint" | "review" | "system";
  agentId?: string;
  reviewSpecId?: string;
  onReject?: string;
};

function validateReviewSteps(steps: WorkflowStepRecord[] | undefined): void {
  for (const step of steps ?? []) {
    if (step.type !== "review") {
      continue;
    }
    if (!step.agentId) {
      throw new ConvexError(`Review step "${step.id}" requires agentId`);
    }
    if (!step.reviewSpecId) {
      throw new ConvexError(`Review step "${step.id}" requires reviewSpecId`);
    }
    if (!step.onReject) {
      throw new ConvexError(`Review step "${step.id}" requires onReject`);
    }
  }
}

export const createDraft = internalMutation({
  args: {
    squadSpecId: v.id("squadSpecs"),
    name: v.string(),
    description: v.optional(v.string()),
    steps: v.optional(
      v.array(
        v.object({
          id: v.string(),
          title: v.string(),
          type: workflowStepTypeValidator,
          agentId: v.optional(v.id("agents")),
          reviewSpecId: v.optional(v.id("reviewSpecs")),
          inputs: v.optional(v.array(v.string())),
          outputs: v.optional(v.array(v.string())),
          dependsOn: v.optional(v.array(v.string())),
          onReject: v.optional(v.string()),
          description: v.optional(v.string()),
        }),
      ),
    ),
    exitCriteria: v.optional(v.string()),
    executionPolicy: v.optional(v.string()),
    onRejectDefault: v.optional(v.string()),
    onReject: v.optional(
      v.object({
        returnToStep: v.string(),
        maxRetries: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    return await ctx.db.insert("workflowSpecs", {
      squadSpecId: args.squadSpecId,
      name: args.name,
      description: args.description,
      steps: args.steps ?? [],
      exitCriteria: args.exitCriteria,
      executionPolicy: args.executionPolicy,
      onRejectDefault: args.onRejectDefault,
      onReject: args.onReject,
      status: "draft",
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const publish = internalMutation({
  args: {
    specId: v.id("workflowSpecs"),
  },
  handler: async (ctx, args) => {
    const spec = await ctx.db.get(args.specId);
    if (!spec) {
      throw new ConvexError(`Workflow spec not found: ${args.specId}`);
    }
    if (spec.status !== "draft") {
      throw new ConvexError("Can only publish specs in draft status");
    }
    validateReviewSteps(spec.steps as WorkflowStepRecord[] | undefined);
    const now = new Date().toISOString();
    await ctx.db.patch(args.specId, {
      status: "published",
      version: spec.version + 1,
      publishedAt: now,
      updatedAt: now,
    });
  },
});

export const listBySquadInternal = internalQuery({
  args: {
    squadSpecId: v.id("squadSpecs"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workflowSpecs")
      .withIndex("by_squadSpecId", (q) => q.eq("squadSpecId", args.squadSpecId))
      .collect();
  },
});

export const getById = internalQuery({
  args: {
    specId: v.id("workflowSpecs"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.specId);
  },
});

export const listBySquad = query({
  args: {
    squadSpecId: v.id("squadSpecs"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workflowSpecs")
      .withIndex("by_squadSpecId", (q) => q.eq("squadSpecId", args.squadSpecId))
      .collect();
  },
});

export const listByStatus = internalQuery({
  args: {
    status: specStatusValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workflowSpecs")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .collect();
  },
});

/**
 * Publish a standalone workflow spec linked to an existing published squad.
 *
 * Accepts agentKey references in steps and resolves them to agentIds from
 * the squad's agent roster. Validates all constraints before inserting.
 *
 * Returns the created workflowSpecId.
 */
export const publishStandalone = mutation({
  args: {
    squadSpecId: v.id("squadSpecs"),
    workflow: v.object({
      name: v.string(),
      steps: v.array(
        v.object({
          id: v.optional(v.string()),
          title: v.string(),
          type: workflowStepTypeValidator,
          agentKey: v.optional(v.string()),
          reviewSpecId: v.optional(v.string()),
          inputs: v.optional(v.array(v.string())),
          outputs: v.optional(v.array(v.string())),
          dependsOn: v.optional(v.array(v.string())),
          onReject: v.optional(v.string()),
          description: v.optional(v.string()),
        }),
      ),
      exitCriteria: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    // Step 1: Load squad and verify it is published
    const squad = await ctx.db.get(args.squadSpecId);
    if (!squad) {
      throw new ConvexError(`Squad spec not found: ${args.squadSpecId}`);
    }
    if (squad.status !== "published") {
      throw new ConvexError(
        `Squad spec must be published to add a workflow. Current status: ${squad.status}`,
      );
    }

    // Step 2: Load all agents from squad's agentIds, build agentName -> agentId map
    const agentIds = (squad.agentIds ?? []) as string[];
    const agentNameToId = new Map<string, string>();

    for (const agentId of agentIds) {
      const agent = await ctx.db.get(agentId as never);
      if (agent && !agent.deletedAt) {
        agentNameToId.set(agent.name as string, agentId);
      }
    }

    // Step 3: Validate each step's agentKey resolves to an agent in the squad
    for (const step of args.workflow.steps) {
      if ((step.type === "agent" || step.type === "review") && step.agentKey !== undefined) {
        if (!agentNameToId.has(step.agentKey)) {
          throw new ConvexError(
            `Step "${step.id ?? step.title}" references agentKey "${step.agentKey}" which is not a member of this squad`,
          );
        }
      }
    }

    // Step 4: Validate review steps have reviewSpecId (verify it exists in DB) and onReject
    for (const step of args.workflow.steps) {
      if (step.type !== "review") {
        continue;
      }
      if (!step.reviewSpecId) {
        throw new ConvexError(`Review step "${step.id ?? step.title}" requires reviewSpecId`);
      }
      const reviewSpec = await ctx.db.get(step.reviewSpecId as never);
      if (!reviewSpec) {
        throw new ConvexError(
          `Review step "${step.id ?? step.title}" references reviewSpecId "${step.reviewSpecId}" which does not exist`,
        );
      }
      if (!step.onReject) {
        throw new ConvexError(`Review step "${step.id ?? step.title}" requires onReject`);
      }
    }

    // Step 5: Transform steps — replace agentKey with resolved agentId, generate step id if not provided
    let stepCounter = 0;
    const resolvedSteps = args.workflow.steps.map((step) => {
      stepCounter += 1;
      const stepId = step.id ?? `step-${stepCounter}`;

      const resolved: Record<string, unknown> = {
        id: stepId,
        title: step.title,
        type: step.type,
      };

      if (step.agentKey !== undefined) {
        const resolvedAgentId = agentNameToId.get(step.agentKey);
        if (resolvedAgentId !== undefined) {
          resolved.agentId = resolvedAgentId;
        }
      }

      if (step.reviewSpecId !== undefined) {
        resolved.reviewSpecId = step.reviewSpecId;
      }
      if (step.onReject !== undefined) {
        resolved.onReject = step.onReject;
      }
      if (step.description !== undefined) {
        resolved.description = step.description;
      }
      if (step.inputs !== undefined) {
        resolved.inputs = step.inputs;
      }
      if (step.outputs !== undefined) {
        resolved.outputs = step.outputs;
      }
      if (step.dependsOn !== undefined && step.dependsOn.length > 0) {
        resolved.dependsOn = step.dependsOn;
      }

      return resolved;
    });

    // Step 6: Insert workflowSpec
    const now = new Date().toISOString();
    const workflowSpecId = await ctx.db.insert("workflowSpecs", {
      squadSpecId: args.squadSpecId,
      name: args.workflow.name,
      steps: resolvedSteps as never,
      exitCriteria: args.workflow.exitCriteria,
      status: "published",
      version: 1,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // Step 7: Return the new workflowSpecId
    return workflowSpecId;
  },
});
