"use client";

import { useMutation } from "convex/react";

import { api } from "@/convex/_generated/api";

export function useStepCardActions() {
  return {
    deleteStep: useMutation(api.steps.deleteStep),
    acceptHumanStep: useMutation(api.steps.acceptHumanStep),
    manualMoveStep: useMutation(api.steps.manualMoveStep),
  };
}
