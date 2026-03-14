"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";

export interface SquadDetailData {
  squad: Doc<"squadSpecs"> | null | undefined;
  workflows: Doc<"workflowSpecs">[] | undefined;
  agents: Doc<"agentSpecs">[] | undefined;
  isLoading: boolean;
}

export function useSquadDetailData(squadId: Id<"squadSpecs"> | null): SquadDetailData {
  const squad = useQuery(api.squadSpecs.getById, squadId ? { id: squadId } : "skip");
  const workflows = useQuery(
    api.workflowSpecs.listBySquad,
    squadId ? { squadSpecId: squadId } : "skip",
  );
  const agentSpecIds = squad?.agentSpecIds ?? [];
  const agents = useQuery(
    api.agentSpecs.listByIds,
    squadId && agentSpecIds.length > 0 ? { ids: agentSpecIds } : "skip",
  );

  const isLoading =
    squadId !== null &&
    (squad === undefined ||
      workflows === undefined ||
      (agentSpecIds.length > 0 && agents === undefined));

  return {
    squad: squad ?? null,
    workflows,
    agents: agentSpecIds.length === 0 ? [] : agents,
    isLoading,
  };
}
