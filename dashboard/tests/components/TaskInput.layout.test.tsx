import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

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
  useSelectableAgents: () => [
    {
      name: "coder",
      displayName: "Coder Agent",
      role: "developer",
      enabled: true,
      status: "idle",
      skills: [],
    },
  ],
}));

vi.mock("@/components/BoardContext", () => ({
  useBoard: () => ({
    activeBoardId: undefined,
  }),
}));

const mockUseMutation = useMutation as unknown as ReturnType<typeof vi.fn>;
const mockUseQuery = useQuery as unknown as ReturnType<typeof vi.fn>;

describe("TaskInput layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMutation.mockReturnValue(vi.fn().mockResolvedValue("task-123"));
    mockUseQuery.mockImplementation((ref: string, args?: { key?: string }) => {
      if (ref === "taskTags:list") return [];
      if (ref === "tagAttributes:list") return [];
      if (ref === "settings:get" && args?.key === "auto_title_enabled") {
        return "false";
      }
      return undefined;
    });
  });

  it("shows AI controls by default", () => {
    render(<TaskInput />);

    expect(screen.getByTitle("Autonomous")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "data-selected-value",
      "auto"
    );
    expect(screen.getByRole("button", { name: /Switch to manual mode/i })).toBeInTheDocument();
  });

  it("switches to manual mode and hides AI-only controls", () => {
    render(<TaskInput />);

    fireEvent.click(screen.getByRole("button", { name: /Switch to manual mode/i }));

    expect(screen.queryByTitle("Autonomous")).not.toBeInTheDocument();
    expect(screen.queryByText("Auto (Lead Agent)")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Switch to AI mode/i })).toBeInTheDocument();
  });

  it("restores AI controls when switching back from manual mode", () => {
    render(<TaskInput />);

    fireEvent.click(screen.getByRole("button", { name: /Switch to manual mode/i }));
    fireEvent.click(screen.getByRole("button", { name: /Switch to AI mode/i }));

    expect(screen.getByTitle("Autonomous")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "data-selected-value",
      "auto"
    );
    expect(screen.getByRole("button", { name: /Switch to manual mode/i })).toBeInTheDocument();
  });

  it("toggles supervision button label between autonomous and supervised", () => {
    render(<TaskInput />);

    fireEvent.click(screen.getByTitle("Autonomous"));
    expect(screen.getByTitle("Supervised")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Supervised"));
    expect(screen.getByTitle("Autonomous")).toBeInTheDocument();
  });

  it("keeps attach and create actions visible in both modes", () => {
    render(<TaskInput />);

    expect(screen.getByText("Create")).toBeInTheDocument();
    expect(screen.getByLabelText("Attach files")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Switch to manual mode/i }));

    expect(screen.getByText("Create")).toBeInTheDocument();
    expect(screen.getByLabelText("Attach files")).toBeInTheDocument();
  });
});
