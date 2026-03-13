import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listByBoard = query({
  args: { boardId: v.id("boards") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("boardSquadBindings")
      .withIndex("by_boardId", (q) => q.eq("boardId", args.boardId))
      .collect();
  },
});

export const listBySquad = query({
  args: { squadSpecId: v.id("squadSpecs") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("boardSquadBindings")
      .withIndex("by_squadSpecId", (q) => q.eq("squadSpecId", args.squadSpecId))
      .collect();
  },
});

export const upsert = mutation({
  args: {
    boardId: v.id("boards"),
    squadSpecId: v.id("squadSpecs"),
    enabled: v.boolean(),
    defaultWorkflowSpecIdOverride: v.optional(v.id("workflowSpecs")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("boardSquadBindings")
      .withIndex("by_boardId_squadSpecId", (q) =>
        q.eq("boardId", args.boardId).eq("squadSpecId", args.squadSpecId),
      )
      .first();

    const now = new Date().toISOString();

    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        defaultWorkflowSpecIdOverride: args.defaultWorkflowSpecIdOverride,
        updatedAt: now,
      });
      return existing._id;
    }

    return ctx.db.insert("boardSquadBindings", {
      boardId: args.boardId,
      squadSpecId: args.squadSpecId,
      enabled: args.enabled,
      defaultWorkflowSpecIdOverride: args.defaultWorkflowSpecIdOverride,
      createdAt: now,
      updatedAt: now,
    });
  },
});
