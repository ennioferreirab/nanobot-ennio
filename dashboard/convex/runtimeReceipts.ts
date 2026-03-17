import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

type ReceiptReadCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;
type ReceiptWriteCtx = Pick<MutationCtx, "db">;

type RuntimeReceiptRecord = { response?: unknown };

function getReceiptQuery(ctx: ReceiptReadCtx | ReceiptWriteCtx) {
  const db = ctx.db as {
    query?: (table: "runtimeReceipts") => {
      withIndex: (
        indexName: "by_idempotencyKey",
        apply: (q: { eq: (field: "idempotencyKey", value: string) => unknown }) => unknown,
      ) => {
        first?: () => Promise<RuntimeReceiptRecord | null>;
      };
    };
  };
  return db.query?.("runtimeReceipts");
}

export async function getRuntimeReceipt<T>(
  ctx: ReceiptReadCtx,
  idempotencyKey: string | undefined,
): Promise<T | null> {
  if (!idempotencyKey) {
    return null;
  }
  const receiptQuery = getReceiptQuery(ctx);
  const receipt = receiptQuery
    ? await receiptQuery
        .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey))
        .first?.()
    : null;
  return (receipt?.response as T | undefined) ?? null;
}

export async function storeRuntimeReceipt(
  ctx: ReceiptWriteCtx,
  args: {
    idempotencyKey: string | undefined;
    scope: string;
    entityType?: string;
    entityId?: string;
    response: unknown;
  },
): Promise<void> {
  if (!args.idempotencyKey) {
    return;
  }
  const receiptQuery = getReceiptQuery(ctx);
  if (!receiptQuery) {
    return;
  }

  const existing = await receiptQuery
    .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey!))
    .first?.();
  if (existing) {
    return;
  }

  const timestamp = new Date().toISOString();
  await ctx.db.insert("runtimeReceipts", {
    idempotencyKey: args.idempotencyKey,
    scope: args.scope,
    entityType: args.entityType,
    entityId: args.entityId,
    response: args.response,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export const getByIdempotencyKey = query({
  args: { idempotencyKey: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("runtimeReceipts")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
  },
});

export const create = internalMutation({
  args: {
    idempotencyKey: v.string(),
    scope: v.string(),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    response: v.any(),
  },
  handler: async (ctx, args) => {
    await storeRuntimeReceipt(ctx, args);
  },
});
