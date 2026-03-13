import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const workflowStepValidator = v.object({
  id: v.string(),
  title: v.string(),
  type: v.union(
    v.literal("agent"),
    v.literal("human"),
    v.literal("checkpoint"),
    v.literal("review"),
    v.literal("system"),
  ),
  agentSpecId: v.optional(v.id("agentSpecs")),
  description: v.optional(v.string()),
  inputs: v.optional(v.array(v.string())),
  outputs: v.optional(v.array(v.string())),
  dependsOn: v.optional(v.array(v.string())),
  onReject: v.optional(v.string()),
});

export const listBySquad = query({
  args: { squadSpecId: v.id("squadSpecs") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("workflowSpecs")
      .withIndex("by_squadSpecId", (q) => q.eq("squadSpecId", args.squadSpecId))
      .collect();
  },
});

export const getById = query({
  args: { id: v.id("workflowSpecs") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    squadSpecId: v.id("squadSpecs"),
    name: v.string(),
    description: v.optional(v.string()),
    steps: v.array(workflowStepValidator),
    exitCriteria: v.optional(v.string()),
    executionPolicy: v.optional(v.string()),
    reviewSpecId: v.optional(v.id("reviewSpecs")),
    onRejectDefault: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    return ctx.db.insert("workflowSpecs", {
      ...args,
      status: "draft",
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  },
});
