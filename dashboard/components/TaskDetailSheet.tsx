"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ThreadMessage } from "./ThreadMessage";
import { ExecutionPlanTab } from "./ExecutionPlanTab";
import { STATUS_COLORS, type TaskStatus } from "@/lib/constants";
import { InlineRejection } from "./InlineRejection";

interface TaskDetailSheetProps {
  taskId: Id<"tasks"> | null;
  onClose: () => void;
}

export function TaskDetailSheet({ taskId, onClose }: TaskDetailSheetProps) {
  const task = useQuery(
    api.tasks.getById,
    taskId ? { taskId } : "skip",
  );
  const messages = useQuery(
    api.messages.listByTask,
    taskId ? { taskId } : "skip",
  );
  const approveMutation = useMutation(api.tasks.approve);
  const retryMutation = useMutation(api.tasks.retry);
  const [showRejection, setShowRejection] = useState(false);

  // Guard: task must be a valid document (not undefined, null, or a non-object from test mocks)
  const isTaskLoaded = task != null && typeof task === "object" && "status" in task;

  const colors = isTaskLoaded
    ? STATUS_COLORS[task.status as TaskStatus] ?? STATUS_COLORS.inbox
    : null;

  return (
    <Sheet open={!!taskId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[480px] sm:w-[480px] flex flex-col p-0">
        {isTaskLoaded ? (
          <>
            <SheetHeader className="px-6 pt-6 pb-4">
              <SheetTitle className="text-lg font-semibold pr-6">
                {task.title}
              </SheetTitle>
              <SheetDescription asChild>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`text-xs ${colors?.bg} ${colors?.text} border-0`}
                  >
                    {task.status.replaceAll("_", " ")}
                  </Badge>
                  {task.assignedAgent && (
                    <span className="text-xs text-muted-foreground">
                      {task.assignedAgent}
                    </span>
                  )}
                  {task.status === "review" &&
                    task.trustLevel === "human_approved" && (
                      <>
                        <Button
                          variant="default"
                          size="sm"
                          className="bg-green-500 hover:bg-green-600 text-white text-xs h-7 px-2"
                          onClick={() => {
                            approveMutation({ taskId: task._id });
                            onClose();
                          }}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="text-xs h-7 px-2"
                          onClick={() => setShowRejection((prev) => !prev)}
                        >
                          Deny
                        </Button>
                      </>
                    )}
                  {task.status === "crashed" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-amber-500 text-amber-700 hover:bg-amber-50 text-xs"
                      onClick={async () => {
                        await retryMutation({ taskId: task._id });
                        onClose();
                      }}
                    >
                      Retry from Beginning
                    </Button>
                  )}
                </div>
              </SheetDescription>
              {showRejection && taskId && (
                <div className="pt-2">
                  <InlineRejection
                    taskId={taskId}
                    onClose={() => setShowRejection(false)}
                  />
                </div>
              )}
            </SheetHeader>

            <Separator />

            <Tabs defaultValue="thread" className="flex-1 flex flex-col min-h-0">
              <TabsList className="mx-6 mt-4">
                <TabsTrigger value="thread">Thread</TabsTrigger>
                <TabsTrigger value="plan">Execution Plan</TabsTrigger>
                <TabsTrigger value="config">Config</TabsTrigger>
              </TabsList>

              <TabsContent value="thread" className="flex-1 min-h-0 m-0">
                <ScrollArea className="h-full px-6 py-4">
                  {messages === undefined ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Loading messages...
                    </p>
                  ) : messages.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No messages yet. Agent activity will appear here.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {messages.map((msg) => (
                        <ThreadMessage key={msg._id} message={msg} />
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="plan" className="flex-1 min-h-0 m-0 px-6 py-4">
                <ExecutionPlanTab executionPlan={(task as any).executionPlan ?? null} />
              </TabsContent>

              <TabsContent value="config" className="flex-1 min-h-0 m-0 px-6 py-4">
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Trust Level
                    </h4>
                    <p className="text-sm text-foreground mt-1">
                      {task.trustLevel.replaceAll("_", " ")}
                    </p>
                  </div>
                  {task.reviewers && task.reviewers.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Reviewers
                      </h4>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {task.reviewers.map((reviewer) => (
                          <Badge key={reviewer} variant="secondary" className="text-xs">
                            {reviewer}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {task.taskTimeout != null && (
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Task Timeout
                      </h4>
                      <p className="text-sm text-foreground mt-1">
                        {task.taskTimeout}s
                      </p>
                    </div>
                  )}
                  {task.interAgentTimeout != null && (
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Inter-Agent Timeout
                      </h4>
                      <p className="text-sm text-foreground mt-1">
                        {task.interAgentTimeout}s
                      </p>
                    </div>
                  )}
                  {task.description && (
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Description
                      </h4>
                      <p className="text-sm text-foreground mt-1">
                        {task.description}
                      </p>
                    </div>
                  )}
                  {task.tags && task.tags.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Tags
                      </h4>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {task.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </>
        ) : taskId ? (
          <>
            <SheetHeader className="px-6 pt-6 pb-4">
              <SheetTitle className="text-lg font-semibold">Loading...</SheetTitle>
              <SheetDescription>Loading task details</SheetDescription>
            </SheetHeader>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
