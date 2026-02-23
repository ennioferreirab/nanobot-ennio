"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Bot } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AgentSidebarItem } from "@/components/AgentSidebarItem";
import { AgentConfigSheet } from "@/components/AgentConfigSheet";

export function AgentSidebar() {
  const agents = useQuery(api.agents.list);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  return (
    <>
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-1">
          <Bot className="h-5 w-5 shrink-0 text-sidebar-foreground/70" />
          <span className="truncate text-sm font-semibold text-sidebar-foreground">
            Agents
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Registered</SidebarGroupLabel>
          {agents === undefined ? null : agents.length === 0 ? (
            <p className="px-2 py-4 text-xs text-muted-foreground">
              No agents found. Add a YAML config to{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                ~/.nanobot/agents/
              </code>
            </p>
          ) : (
            <SidebarMenu>
              {agents.map((agent) => (
                <AgentSidebarItem
                  key={agent._id}
                  agent={agent}
                  onClick={() => setSelectedAgent(agent.name)}
                />
              ))}
            </SidebarMenu>
          )}
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarTrigger />
      </SidebarFooter>
    </Sidebar>
    <AgentConfigSheet
      agentName={selectedAgent}
      onClose={() => setSelectedAgent(null)}
    />
    </>
  );
}
