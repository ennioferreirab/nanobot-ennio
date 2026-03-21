/**
 * Integration Mappings — Pure Logic
 *
 * Shared lookup and validation utilities for integrationMappings table.
 * These are pure TypeScript helpers — NOT Convex functions.
 */

import type { Doc, Id } from "../_generated/dataModel";

// ---------------------------------------------------------------------------
// Minimal DB context types
// ---------------------------------------------------------------------------

export type MappingQueryCtx = {
  db: {
    query: (table: "integrationMappings") => {
      withIndex: (
        indexName: string,
        rangeFn: (q: unknown) => unknown,
      ) => {
        first: () => Promise<Doc<"integrationMappings"> | null>;
        collect: () => Promise<Doc<"integrationMappings">[]>;
      };
    };
  };
};

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Look up a mapping by configId + externalType + externalId.
 * Returns null if not found.
 */
export async function findMappingByExternal(
  ctx: MappingQueryCtx,
  params: {
    configId: Id<"integrationConfigs">;
    externalType: string;
    externalId: string;
  },
): Promise<Doc<"integrationMappings"> | null> {
  return await ctx.db
    .query("integrationMappings")
    .withIndex("by_config_external", (q) =>
      (q as { eq: (field: string, value: unknown) => unknown })
        .eq("configId", params.configId)
        // @ts-expect-error: chained index builder — Convex types require cast
        .eq("externalType", params.externalType)
        // @ts-expect-error: chained index builder — Convex types require cast
        .eq("externalId", params.externalId),
    )
    .first();
}

/**
 * Look up a mapping by configId + internalType + internalId.
 * Returns null if not found.
 */
export async function findMappingByInternal(
  ctx: MappingQueryCtx,
  params: {
    configId: Id<"integrationConfigs">;
    internalType: string;
    internalId: string;
  },
): Promise<Doc<"integrationMappings"> | null> {
  return await ctx.db
    .query("integrationMappings")
    .withIndex("by_config_internal", (q) =>
      (q as { eq: (field: string, value: unknown) => unknown })
        .eq("configId", params.configId)
        // @ts-expect-error: chained index builder — Convex types require cast
        .eq("internalType", params.internalType)
        // @ts-expect-error: chained index builder — Convex types require cast
        .eq("internalId", params.internalId),
    )
    .first();
}
