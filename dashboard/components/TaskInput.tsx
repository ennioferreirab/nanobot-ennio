"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown } from "lucide-react";

export function TaskInput() {
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [trustLevel, setTrustLevel] = useState<string>("autonomous");
  const [selectedReviewers, setSelectedReviewers] = useState<string[]>([]);

  const createTask = useMutation(api.tasks.create);
  const agents = useQuery(api.agents.list);

  const handleSubmit = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Task description required");
      return;
    }
    setError("");

    // Parse tags from comma-separated values after # symbol
    let taskTitle = trimmed;
    let tags: string[] | undefined;
    const hashIndex = trimmed.indexOf("#");
    if (hashIndex !== -1) {
      taskTitle = trimmed.substring(0, hashIndex).trim();
      const tagString = trimmed.substring(hashIndex + 1);
      tags = tagString
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    }

    // If tag parsing consumed the entire title, reject as empty
    if (!taskTitle) {
      setError("Task description required");
      return;
    }

    const args: {
      title: string;
      tags?: string[];
      assignedAgent?: string;
      trustLevel?: string;
      reviewers?: string[];
    } = {
      title: taskTitle,
      tags,
    };
    if (selectedAgent && selectedAgent !== "auto") {
      args.assignedAgent = selectedAgent;
    }
    if (trustLevel !== "autonomous") {
      args.trustLevel = trustLevel;
    }
    if (selectedReviewers.length > 0) {
      args.reviewers = selectedReviewers;
    }

    try {
      await createTask(args);
      setTitle("");
      setSelectedAgent("");
      setTrustLevel("autonomous");
      setSelectedReviewers([]);
      setIsExpanded(false);
    } catch {
      setError("Failed to create task. Please try again.");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit();
    }
  };

  const showReviewerSection = trustLevel !== "autonomous";

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            placeholder="Create a new task..."
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setError("");
            }}
            onKeyDown={handleKeyDown}
            className={error ? "border-red-500" : ""}
          />
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>
        <Button onClick={handleSubmit}>Create</Button>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Toggle options">
            <ChevronDown
              className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="mt-2 p-3 border rounded-md space-y-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground whitespace-nowrap">
              Agent:
            </label>
            <Select value={selectedAgent} onValueChange={setSelectedAgent}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Auto (Lead Agent)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (Lead Agent)</SelectItem>
                {agents?.map((agent) => (
                  <SelectItem
                    key={agent.name}
                    value={agent.name}
                    disabled={agent.enabled === false}
                    className={agent.enabled === false ? "text-muted-foreground opacity-60" : ""}
                  >
                    {agent.displayName}{agent.enabled === false ? " (Deactivated)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-medium">Trust Level</label>
            <Select
              value={trustLevel}
              onValueChange={(val) => {
                setTrustLevel(val);
                if (val === "autonomous") setSelectedReviewers([]);
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="autonomous">Autonomous</SelectItem>
                <SelectItem value="agent_reviewed">Agent Reviewed</SelectItem>
                <SelectItem value="human_approved">Human Approved</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {showReviewerSection && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground font-medium">Reviewers</label>
              <div className="space-y-1.5">
                {agents?.map((agent) => (
                  <div key={agent.name} className="flex items-center gap-2">
                    <Checkbox
                      id={`reviewer-${agent.name}`}
                      checked={selectedReviewers.includes(agent.name)}
                      onCheckedChange={(checked) => {
                        setSelectedReviewers((prev) =>
                          checked
                            ? [...prev, agent.name]
                            : prev.filter((r) => r !== agent.name)
                        );
                      }}
                    />
                    <label
                      htmlFor={`reviewer-${agent.name}`}
                      className="text-sm cursor-pointer"
                    >
                      {agent.displayName || agent.name}
                    </label>
                  </div>
                ))}
              </div>

              {trustLevel === "human_approved" && (
                <div className="flex items-center gap-2 mt-2">
                  <Checkbox
                    id="human-approval-gate"
                    checked={true}
                    disabled
                  />
                  <label
                    htmlFor="human-approval-gate"
                    className="text-sm text-muted-foreground"
                  >
                    Require human approval
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
