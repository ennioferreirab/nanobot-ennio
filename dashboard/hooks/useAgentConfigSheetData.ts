"use client";

import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";

export function useAgentConfigSheetData(agentName: string | null) {
  const agent = useQuery(
    api.agents.getByName,
    agentName ? { name: agentName } : "skip",
  );
  const updateConfig = useMutation(api.agents.updateConfig);
  const setEnabled = useMutation(api.agents.setEnabled);
  const rawConnectedModels = useQuery(api.settings.get, {
    key: "connected_models",
  });
  const rawModelTiers = useQuery(api.settings.get, { key: "model_tiers" });

  const connectedModels: string[] = useMemo(() => {
    if (!rawConnectedModels) return [];
    try {
      const parsed = JSON.parse(rawConnectedModels);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [rawConnectedModels]);

  const modelTiers: Record<string, string | null> = useMemo(() => {
    if (!rawModelTiers) return {};
    try {
      const parsed = JSON.parse(rawModelTiers);
      return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }, [rawModelTiers]);

  return {
    agent,
    updateConfig,
    setEnabled,
    connectedModels,
    modelTiers,
  };
}
