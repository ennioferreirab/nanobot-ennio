import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { useMutation, useQuery } from "convex/react";

import { TaskInput } from "../../components/TaskInput";

vi.mock("@/components/ui/select", async () => import("../mocks/select-mock"));

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("../../convex/_generated/api", () => ({
  api: {
    tasks: { create: "tasks:create" },
    taskTags: { list: "taskTags:list" },
    tagAttributes: { list: "tagAttributes:list" },
    tagAttributeValues: { upsert: "tagAttributeValues:upsert" },
    settings: { get: "settings:get" },
  },
}));

vi.mock("@/hooks/useSelectableAgents", () => ({
  useSelectableAgents: () => [],
}));

vi.mock("@/components/BoardContext", () => ({
  useBoard: () => ({
    activeBoardId: undefined,
  }),
}));

const SAMPLE_TAGS = [
  { _id: "t1", name: "bug", color: "red" },
  { _id: "t2", name: "feature", color: "blue" },
];

const mockUseMutation = useMutation as unknown as ReturnType<typeof vi.fn>;
const mockUseQuery = useQuery as unknown as ReturnType<typeof vi.fn>;
const mockCreateTask = vi.fn();

describe("TaskInput tag selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateTask.mockResolvedValue("task-123");
    mockUseMutation.mockImplementation((ref: string) => {
      if (ref === "tasks:create") return mockCreateTask;
      return vi.fn().mockResolvedValue(undefined);
    });
    mockUseQuery.mockImplementation((ref: string, args?: { key?: string }) => {
      if (ref === "taskTags:list") return SAMPLE_TAGS;
      if (ref === "tagAttributes:list") return [];
      if (ref === "settings:get" && args?.key === "auto_title_enabled") {
        return "false";
      }
      return undefined;
    });
  });

  it("shows tag chips without extra expansion UI", () => {
    render(<TaskInput />);

    expect(screen.getByRole("button", { name: "bug" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "feature" })).toBeInTheDocument();
  });

  it("shows no tag chips when no tags are configured", () => {
    mockUseQuery.mockImplementation((ref: string, args?: { key?: string }) => {
      if (ref === "taskTags:list") return [];
      if (ref === "tagAttributes:list") return [];
      if (ref === "settings:get" && args?.key === "auto_title_enabled") {
        return "false";
      }
      return undefined;
    });

    render(<TaskInput />);
    expect(screen.queryByRole("button", { name: "bug" })).not.toBeInTheDocument();
  });

  it("passes selected tags to createTask", async () => {
    const user = userEvent.setup();
    render(<TaskInput />);

    await user.type(screen.getByPlaceholderText("Task title..."), "Fix login issue");
    await user.click(screen.getByRole("button", { name: "bug" }));
    await user.click(screen.getByText("Create"));

    await waitFor(() => {
      expect(mockCreateTask).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ["bug"] })
      );
    });
  });

  it("omits tags when none are selected", async () => {
    const user = userEvent.setup();
    render(<TaskInput />);

    await user.type(screen.getByPlaceholderText("Task title..."), "Clean task");
    await user.click(screen.getByText("Create"));

    await waitFor(() => {
      expect(mockCreateTask).toHaveBeenCalledWith(
        expect.objectContaining({ tags: undefined })
      );
    });
  });

  it("resets selected tags after a successful submission", async () => {
    const user = userEvent.setup();
    render(<TaskInput />);

    const bugChip = screen.getByRole("button", { name: "bug" });
    await user.click(bugChip);
    expect(bugChip).toHaveAttribute("aria-pressed", "true");

    await user.type(screen.getByPlaceholderText("Task title..."), "Reset tags");
    await user.click(screen.getByText("Create"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Task title...")).toHaveValue("");
    });
    expect(screen.getByRole("button", { name: "bug" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("clears selected tags when switching to manual mode", () => {
    render(<TaskInput />);

    const bugChip = screen.getByRole("button", { name: "bug" });
    fireEvent.click(bugChip);
    expect(bugChip).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: /Switch to manual mode/i }));
    fireEvent.click(screen.getByRole("button", { name: /Switch to AI mode/i }));

    expect(screen.getByRole("button", { name: "bug" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });
});
