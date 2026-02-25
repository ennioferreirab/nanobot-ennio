"use client";

import { Badge } from "@/components/ui/badge";
import type { KeyboardEvent } from "react";

interface TaskGroupHeaderProps {
  taskTitle: string;
  stepCount: number;
  onClick?: () => void;
}

export function TaskGroupHeader({
  taskTitle,
  stepCount,
  onClick,
}: TaskGroupHeaderProps) {
  const isInteractive = typeof onClick === "function";
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isInteractive) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className={[
        "flex items-center gap-2 rounded-md bg-muted/60 px-2.5 py-1.5",
        isInteractive
          ? "cursor-pointer transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          : "",
      ].join(" ")}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-label={
        isInteractive ? `Open task: ${taskTitle} (${stepCount} steps)` : undefined
      }
    >
      <h3 className="min-w-0 flex-1 truncate text-xs font-semibold text-muted-foreground">
        {taskTitle}
      </h3>
      <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">
        {stepCount}
      </Badge>
    </div>
  );
}
