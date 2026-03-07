"use client";

import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";

export function useTaskInputData() {
  const createTask = useMutation(api.tasks.create);
  const predefinedTags = useQuery(api.taskTags.list);
  const allAttributes = useQuery(api.tagAttributes.list);
  const upsertAttrValue = useMutation(api.tagAttributeValues.upsert);
  const autoTitleSetting = useQuery(api.settings.get, {
    key: "auto_title_enabled",
  });

  return {
    createTask,
    predefinedTags,
    allAttributes,
    upsertAttrValue,
    isAutoTitle: autoTitleSetting === "true",
  };
}
