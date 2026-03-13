import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("reviewSpecs").collect();
  },
});

export const getById = query({
  args: { id: v.id("reviewSpecs") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    scope: v.union(v.literal("agent"), v.literal("workflow"), v.literal("execution")),
    criteria: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        weight: v.number(),
        description: v.optional(v.string()),
      }),
    ),
    vetoConditions: v.optional(v.array(v.string())),
    approvalThreshold: v.number(),
    feedbackContract: v.optional(v.string()),
    reviewerPolicy: v.optional(v.string()),
    rejectionRoutingPolicy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    return ctx.db.insert("reviewSpecs", {
      ...args,
      status: "draft",
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  },
});
