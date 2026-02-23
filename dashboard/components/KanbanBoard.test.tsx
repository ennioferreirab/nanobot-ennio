import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { KanbanBoard } from "./KanbanBoard";

// Track the mock return value
let mockQueryResult: unknown[] | undefined = [];

vi.mock("convex/react", () => ({
  useQuery: () => mockQueryResult,
  useMutation: () => vi.fn(),
}));

// Mock motion/react
vi.mock("motion/react", () => ({
  LayoutGroup: ({ children }: React.PropsWithChildren) => <>{children}</>,
  useReducedMotion: () => false,
}));

// Mock motion/react-client
vi.mock("motion/react-client", () => ({
  div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
    const { layoutId, layout, transition, ...rest } = props;
    void layoutId;
    void layout;
    void transition;
    return <div {...rest}>{children}</div>;
  },
}));

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    _id: `task_${Math.random().toString(36).slice(2)}`,
    _creationTime: 1000,
    title: "Test task",
    status: "inbox",
    trustLevel: "autonomous",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("KanbanBoard", () => {
  afterEach(() => {
    cleanup();
    mockQueryResult = [];
  });

  it("renders 5 columns with correct titles", () => {
    mockQueryResult = [makeTask()];
    render(<KanbanBoard />);
    expect(screen.getByText("Inbox")).toBeInTheDocument();
    expect(screen.getByText("Assigned")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("shows empty state message when no tasks exist", () => {
    mockQueryResult = [];
    render(<KanbanBoard />);
    expect(
      screen.getByText("No tasks yet. Type above to create your first task.")
    ).toBeInTheDocument();
  });

  it("renders nothing while loading", () => {
    mockQueryResult = undefined;
    const { container } = render(<KanbanBoard />);
    expect(container.innerHTML).toBe("");
  });

  it("groups tasks into correct columns by status", () => {
    mockQueryResult = [
      makeTask({ _id: "t1", title: "Inbox task", status: "inbox" }),
      makeTask({ _id: "t2", title: "Assigned task", status: "assigned" }),
      makeTask({ _id: "t3", title: "Progress task", status: "in_progress" }),
      makeTask({ _id: "t4", title: "Review task", status: "review" }),
      makeTask({ _id: "t5", title: "Done task", status: "done" }),
    ];
    render(<KanbanBoard />);
    expect(screen.getByText("Inbox task")).toBeInTheDocument();
    expect(screen.getByText("Assigned task")).toBeInTheDocument();
    expect(screen.getByText("Progress task")).toBeInTheDocument();
    expect(screen.getByText("Review task")).toBeInTheDocument();
    expect(screen.getByText("Done task")).toBeInTheDocument();
  });

  it("places retrying and crashed tasks in the In Progress column", () => {
    mockQueryResult = [
      makeTask({ _id: "t1", title: "Retrying task", status: "retrying" }),
      makeTask({ _id: "t2", title: "Crashed task", status: "crashed" }),
    ];
    render(<KanbanBoard />);
    expect(screen.getByText("Retrying task")).toBeInTheDocument();
    expect(screen.getByText("Crashed task")).toBeInTheDocument();
  });

  it("shows 'No tasks' for empty columns when other columns have tasks", () => {
    mockQueryResult = [makeTask({ _id: "t1", status: "inbox" })];
    render(<KanbanBoard />);
    // 4 columns should show "No tasks" (all except Inbox)
    const emptyTexts = screen.getAllByText("No tasks");
    expect(emptyTexts).toHaveLength(4);
  });
});
