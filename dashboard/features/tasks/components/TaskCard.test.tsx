import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Doc } from "@/convex/_generated/dataModel";
import { TaskCard } from "./TaskCard";

vi.mock("@/features/tasks/hooks/useTaskCardActions", () => ({
  useTaskCardActions: () => ({
    approveTask: vi.fn(),
    softDeleteTask: vi.fn(),
    toggleFavoriteTask: vi.fn(),
  }),
}));

// motion/react-client may rely on browser APIs; stub it minimally
vi.mock("motion/react-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react-client")>();
  return {
    ...actual,
    motion: {
      div: ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) => (
        <div {...(rest as React.HTMLAttributes<HTMLDivElement>)}>{children}</div>
      ),
    },
  };
});

vi.mock("motion/react", () => ({
  useReducedMotion: () => false,
}));

function makeTask(overrides: Partial<Doc<"tasks">> = {}): Doc<"tasks"> {
  return {
    _id: "task-1" as unknown as Doc<"tasks">["_id"],
    _creationTime: 1000,
    title: "Test task",
    status: "review" as const,
    isManual: false,
    trustLevel: "autonomous" as const,
    tags: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("TaskCard — showApproveButton logic", () => {
  it("shows Approve button when status=review and isManual=false and awaitingKickoff is absent", () => {
    const task = makeTask({ awaitingKickoff: undefined });
    render(<TaskCard task={task} />);
    expect(screen.getByRole("button", { name: /approve/i })).toBeDefined();
  });

  it("shows Approve button when status=review and isManual=false and awaitingKickoff=false", () => {
    const task = makeTask({ awaitingKickoff: false });
    render(<TaskCard task={task} />);
    expect(screen.getByRole("button", { name: /approve/i })).toBeDefined();
  });

  it("does NOT show Approve button when awaitingKickoff=true", () => {
    const task = makeTask({ awaitingKickoff: true });
    render(<TaskCard task={task} />);
    expect(screen.queryByRole("button", { name: /approve/i })).toBeNull();
  });

  it("does NOT show Approve button when isManual=true (existing behavior)", () => {
    const task = makeTask({ isManual: true });
    render(<TaskCard task={task} />);
    expect(screen.queryByRole("button", { name: /approve/i })).toBeNull();
  });

  it("does NOT show Approve button when status is not review (existing behavior)", () => {
    const task = makeTask({ status: "in_progress" });
    render(<TaskCard task={task} />);
    expect(screen.queryByRole("button", { name: /approve/i })).toBeNull();
  });
});
