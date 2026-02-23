import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { TaskDetailSheet } from "./TaskDetailSheet";
import { ThreadMessage } from "./ThreadMessage";

// Mock convex/react
const mockUseQuery = vi.fn();
const mockMutationFn = vi.fn().mockResolvedValue(undefined);
vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: () => mockMutationFn,
}));

const baseTask = {
  _id: "task1" as never,
  _creationTime: 1000,
  title: "Implement feature X",
  description: "Build the feature",
  status: "in_progress" as const,
  assignedAgent: "agent-alpha",
  trustLevel: "autonomous" as const,
  tags: ["frontend"],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const baseMessage = {
  _id: "msg1" as never,
  _creationTime: 1000,
  taskId: "task1" as never,
  authorName: "agent-alpha",
  authorType: "agent" as const,
  content: "Starting work on feature X",
  messageType: "work" as const,
  timestamp: "2026-01-01T12:00:00Z",
};

describe("TaskDetailSheet", () => {
  afterEach(() => {
    cleanup();
    mockUseQuery.mockReset();
    mockMutationFn.mockClear();
  });

  it("renders task title and status badge when open", () => {
    mockUseQuery.mockImplementation((_query: unknown, args: unknown) => {
      if (args && typeof args === "object" && "taskId" in args) {
        // Could be either getById or listByTask
        // Return task for the first call, messages for the second
        return undefined;
      }
      return undefined;
    });
    // Simulate: first useQuery call returns task, second returns messages
    mockUseQuery
      .mockReturnValueOnce(baseTask) // getById
      .mockReturnValueOnce([]); // listByTask

    render(
      <TaskDetailSheet taskId={"task1" as never} onClose={() => {}} />,
    );

    expect(screen.getByText("Implement feature X")).toBeInTheDocument();
    expect(screen.getByText("in progress")).toBeInTheDocument();
  });

  it("renders assigned agent name", () => {
    mockUseQuery
      .mockReturnValueOnce(baseTask)
      .mockReturnValueOnce([]);

    render(
      <TaskDetailSheet taskId={"task1" as never} onClose={() => {}} />,
    );

    expect(screen.getByText("agent-alpha")).toBeInTheDocument();
  });

  it("shows empty thread placeholder when no messages", () => {
    mockUseQuery
      .mockReturnValueOnce(baseTask)
      .mockReturnValueOnce([]);

    render(
      <TaskDetailSheet taskId={"task1" as never} onClose={() => {}} />,
    );

    expect(
      screen.getByText("No messages yet. Agent activity will appear here."),
    ).toBeInTheDocument();
  });

  it("renders messages in the thread tab", () => {
    mockUseQuery
      .mockReturnValueOnce(baseTask)
      .mockReturnValueOnce([baseMessage]);

    render(
      <TaskDetailSheet taskId={"task1" as never} onClose={() => {}} />,
    );

    expect(
      screen.getByText("Starting work on feature X"),
    ).toBeInTheDocument();
  });

  it("does not render sheet content when taskId is null", () => {
    render(<TaskDetailSheet taskId={null} onClose={() => {}} />);

    expect(
      screen.queryByText("Implement feature X"),
    ).not.toBeInTheDocument();
  });

  // --- Story 6.1: Approve button in sheet header ---

  it("shows Approve button in header for human_approved tasks in review", () => {
    const reviewTask = {
      ...baseTask,
      status: "review" as const,
      trustLevel: "human_approved" as const,
    };
    mockUseQuery
      .mockReturnValueOnce(reviewTask)
      .mockReturnValueOnce([]);

    render(
      <TaskDetailSheet taskId={"task1" as never} onClose={() => {}} />,
    );

    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  });

  it("does not show Approve button for autonomous tasks in review", () => {
    const reviewTask = {
      ...baseTask,
      status: "review" as const,
      trustLevel: "autonomous" as const,
    };
    mockUseQuery
      .mockReturnValueOnce(reviewTask)
      .mockReturnValueOnce([]);

    render(
      <TaskDetailSheet taskId={"task1" as never} onClose={() => {}} />,
    );

    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  // --- Story 6.4: Retry from Beginning button ---

  it("shows Retry from Beginning button for crashed tasks", () => {
    const crashedTask = {
      ...baseTask,
      status: "crashed" as const,
    };
    mockUseQuery
      .mockReturnValueOnce(crashedTask)
      .mockReturnValueOnce([]);

    render(
      <TaskDetailSheet taskId={"task1" as never} onClose={() => {}} />,
    );

    expect(
      screen.getByRole("button", { name: "Retry from Beginning" }),
    ).toBeInTheDocument();
  });

  it("does not show Retry from Beginning button for non-crashed tasks", () => {
    mockUseQuery
      .mockReturnValueOnce(baseTask) // in_progress
      .mockReturnValueOnce([]);

    render(
      <TaskDetailSheet taskId={"task1" as never} onClose={() => {}} />,
    );

    expect(
      screen.queryByRole("button", { name: "Retry from Beginning" }),
    ).not.toBeInTheDocument();
  });

  it("calls retry mutation when Retry from Beginning is clicked", () => {
    const crashedTask = {
      ...baseTask,
      status: "crashed" as const,
    };
    mockUseQuery
      .mockReturnValueOnce(crashedTask)
      .mockReturnValueOnce([]);

    render(
      <TaskDetailSheet taskId={"task1" as never} onClose={() => {}} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry from Beginning" }));
    expect(mockMutationFn).toHaveBeenCalledWith({ taskId: "task1" });
  });
});

describe("ThreadMessage", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders agent message with white background", () => {
    const { container } = render(<ThreadMessage message={baseMessage} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("bg-background");
  });

  it("renders user message with blue-50 background", () => {
    const userMsg = {
      ...baseMessage,
      authorType: "user" as const,
      authorName: "human-user",
    };
    const { container } = render(<ThreadMessage message={userMsg} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("bg-blue-50");
  });

  it("renders system message with gray-50 background and italic text", () => {
    const sysMsg = {
      ...baseMessage,
      authorType: "system" as const,
      authorName: "System",
      messageType: "system_event" as const,
      content: "Task status changed",
    };
    const { container } = render(<ThreadMessage message={sysMsg} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("bg-muted");
    expect(screen.getByText("Task status changed").className).toContain(
      "italic",
    );
  });

  it("renders review_feedback message with amber-50 background", () => {
    const reviewMsg = {
      ...baseMessage,
      messageType: "review_feedback" as const,
      content: "Needs refactoring",
    };
    const { container } = render(<ThreadMessage message={reviewMsg} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("bg-amber-50");
  });

  it("renders approval message with green-50 background", () => {
    const approvalMsg = {
      ...baseMessage,
      messageType: "approval" as const,
      content: "Approved",
    };
    const { container } = render(<ThreadMessage message={approvalMsg} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("bg-green-50");
  });

  it("renders denial message with red-50 background", () => {
    const denialMsg = {
      ...baseMessage,
      messageType: "denial" as const,
      content: "Denied",
    };
    const { container } = render(<ThreadMessage message={denialMsg} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("bg-red-50");
  });

  it("renders author name and content", () => {
    render(<ThreadMessage message={baseMessage} />);
    expect(screen.getByText("agent-alpha")).toBeInTheDocument();
    expect(
      screen.getByText("Starting work on feature X"),
    ).toBeInTheDocument();
  });
});
