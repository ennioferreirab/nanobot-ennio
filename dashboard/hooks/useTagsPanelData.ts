"use client";

import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";

export function useTagsPanelData() {
  const tags = useQuery(api.taskTags.list);
  const createTag = useMutation(api.taskTags.create);
  const removeTag = useMutation(api.taskTags.remove);
  const attributes = useQuery(api.tagAttributes.list);
  const createAttribute = useMutation(api.tagAttributes.create);
  const removeAttribute = useMutation(api.tagAttributes.remove);
  const updateTagAttributeIds = useMutation(api.taskTags.updateAttributeIds);

  return {
    tags,
    createTag,
    removeTag,
    attributes,
    createAttribute,
    removeAttribute,
    updateTagAttributeIds,
  };
}
