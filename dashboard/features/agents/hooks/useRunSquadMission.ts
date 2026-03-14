"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export interface RunSquadMissionArgs {
  squadSpecId: Id<"squadSpecs">;
  workflowSpecId: Id<"workflowSpecs">;
  boardId: Id<"boards">;
  title: string;
  description?: string;
}

export interface UseRunSquadMissionResult {
  isLaunching: boolean;
  error: Error | null;
  effectiveWorkflowId: Id<"workflowSpecs"> | null | undefined;
  launch: (args: RunSquadMissionArgs) => Promise<Id<"tasks"> | null>;
}

export function useRunSquadMission(
  boardId: Id<"boards"> | null,
  squadSpecId: Id<"squadSpecs"> | null,
): UseRunSquadMissionResult {
  const [isLaunching, setIsLaunching] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const launchMutation = useMutation(api.tasks.launchMission);

  const effectiveWorkflowId = useQuery(
    api.boardSquadBindings.getEffectiveWorkflowId,
    boardId && squadSpecId ? { boardId, squadSpecId } : "skip",
  );

  const launch = async (args: RunSquadMissionArgs): Promise<Id<"tasks"> | null> => {
    setIsLaunching(true);
    setError(null);
    try {
      const taskId = await launchMutation(args);
      return taskId;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      console.error("[useRunSquadMission] launch failed:", e);
      setError(e);
      return null;
    } finally {
      setIsLaunching(false);
    }
  };

  return {
    isLaunching,
    error,
    effectiveWorkflowId: boardId && squadSpecId ? effectiveWorkflowId : null,
    launch,
  };
}
