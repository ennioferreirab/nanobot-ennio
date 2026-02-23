"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Check } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

const DEFAULTS: Record<string, string> = {
  task_timeout_minutes: "30",
  inter_agent_timeout_minutes: "10",
  default_llm_model: "claude-sonnet-4-6",
};

const MODEL_OPTIONS = [
  { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
];

function SettingNumberField({
  label,
  settingKey,
  defaultValue,
  onSave,
  saved,
}: {
  label: string;
  settingKey: string;
  defaultValue: string;
  onSave: (key: string, value: string) => void;
  saved: boolean;
}) {
  const [localValue, setLocalValue] = useState(defaultValue);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalValue(defaultValue);
  }, [defaultValue]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setLocalValue(val);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (val.trim() !== "") {
          onSave(settingKey, val);
        }
      }, 300);
    },
    [onSave, settingKey],
  );

  const handleBlur = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (localValue.trim() !== "") {
      onSave(settingKey, localValue);
    }
  }, [onSave, settingKey, localValue]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium">{label}</label>
        {saved && (
          <Check className="h-4 w-4 text-green-500 transition-opacity" />
        )}
      </div>
      <Input
        type="number"
        min={1}
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
      />
    </div>
  );
}

export function SettingsPanel() {
  const allSettings = useQuery(api.settings.list);
  const setSetting = useMutation(api.settings.set);
  const [savedFields, setSavedFields] = useState<Record<string, boolean>>({});

  const settingsMap: Record<string, string> = {};
  allSettings?.forEach((s) => {
    settingsMap[s.key] = s.value;
  });

  const getValue = (key: string) => settingsMap[key] ?? DEFAULTS[key];

  const handleSave = useCallback(
    async (key: string, value: string) => {
      await setSetting({ key, value });
      setSavedFields((prev) => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setSavedFields((prev) => ({ ...prev, [key]: false }));
      }, 1500);
    },
    [setSetting],
  );

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure global system defaults.
        </p>
      </div>

      <Separator />

      <div className="space-y-1">
        <label className="text-sm font-medium">Theme</label>
        <ThemeToggle />
      </div>

      <Separator />

      <SettingNumberField
        label="Task Timeout (minutes)"
        settingKey="task_timeout_minutes"
        defaultValue={getValue("task_timeout_minutes")}
        onSave={handleSave}
        saved={!!savedFields["task_timeout_minutes"]}
      />

      <SettingNumberField
        label="Inter-Agent Review Timeout (minutes)"
        settingKey="inter_agent_timeout_minutes"
        defaultValue={getValue("inter_agent_timeout_minutes")}
        onSave={handleSave}
        saved={!!savedFields["inter_agent_timeout_minutes"]}
      />

      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Default LLM Model</label>
          {savedFields["default_llm_model"] && (
            <Check className="h-4 w-4 text-green-500 transition-opacity" />
          )}
        </div>
        <Select
          value={getValue("default_llm_model")}
          onValueChange={(val) => handleSave("default_llm_model", val)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODEL_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
