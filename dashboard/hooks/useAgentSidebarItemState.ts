"use client";

import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";

export function useAgentSidebarItemState(
  agentName: string,
  enabled: boolean,
) {
  const terminalSessions = useQuery(
    api.terminalSessions.listSessions,
    enabled ? { agentName } : "skip",
  );

  return {
    terminalSessions,
  };
}
