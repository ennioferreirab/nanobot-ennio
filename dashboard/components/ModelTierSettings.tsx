"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Check, Loader2 } from "lucide-react";

const TIER_ORDER = [
  "standard-low",
  "standard-medium",
  "standard-high",
  "reasoning-low",
  "reasoning-medium",
  "reasoning-high",
] as const;

type TierName = (typeof TIER_ORDER)[number];

const TIER_LABELS: Record<TierName, string> = {
  "standard-low": "Standard Low",
  "standard-medium": "Standard Medium",
  "standard-high": "Standard High",
  "reasoning-low": "Reasoning Low",
  "reasoning-medium": "Reasoning Medium",
  "reasoning-high": "Reasoning High",
};

const NONE_VALUE = "__none__";

function isReasoningTier(tier: TierName): boolean {
  return tier.startsWith("reasoning-");
}

export function ModelTierSettings() {
  const rawTiers = useQuery(api.settings.get, { key: "model_tiers" });
  const rawModels = useQuery(api.settings.get, { key: "connected_models" });
  const setSetting = useMutation(api.settings.set);

  const [editedTiers, setEditedTiers] = useState<Record<string, string | null>>(
    {},
  );
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Parse settings
  const tiers: Record<string, string | null> = rawTiers
    ? JSON.parse(rawTiers)
    : {};
  const connectedModels: string[] = rawModels ? JSON.parse(rawModels) : [];

  // Sync edited state when server data loads
  useEffect(() => {
    if (rawTiers) {
      setEditedTiers(JSON.parse(rawTiers));
      setIsDirty(false);
    }
  }, [rawTiers]);

  const handleTierChange = useCallback(
    (tier: TierName, value: string) => {
      const resolvedValue = value === NONE_VALUE ? null : value;
      setEditedTiers((prev) => ({ ...prev, [tier]: resolvedValue }));
      setIsDirty(true);
      setSaved(false);
    },
    [],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await setSetting({
        key: "model_tiers",
        value: JSON.stringify(editedTiers),
      });
      setIsDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [setSetting, editedTiers]);

  const isLoading = rawTiers === undefined || rawModels === undefined;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading model tiers...
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h3 className="text-base font-semibold">Model Tiers</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Map tier levels to connected models. Agents configured with a tier
          reference (e.g. <code>tier:standard-high</code>) will use the mapped
          model.
        </p>
      </div>

      <Separator />

      <div className="space-y-4">
        {TIER_ORDER.map((tier) => {
          const currentValue = editedTiers[tier];
          const selectValue =
            currentValue === null || currentValue === undefined
              ? NONE_VALUE
              : currentValue;

          return (
            <div key={tier} className="flex items-center gap-4">
              <span className="text-sm font-medium w-40 shrink-0">
                {TIER_LABELS[tier]}
              </span>
              <Select
                value={selectValue}
                onValueChange={(val) => handleTierChange(tier, val)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {isReasoningTier(tier) && (
                    <SelectItem value={NONE_VALUE}>
                      None (not available)
                    </SelectItem>
                  )}
                  {connectedModels.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button onClick={handleSave} disabled={!isDirty || saving} size="sm">
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save Tiers
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-green-600">
            <Check className="h-4 w-4" />
            Saved
          </span>
        )}
      </div>
    </div>
  );
}
