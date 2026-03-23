import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ActivityFeed } from "./ActivityFeed";
import type { Doc } from "@/convex/_generated/dataModel";

// Stub scrollTo for jsdom
beforeEach(() => {
  Element.prototype.scrollTo = vi.fn();
});

// Mock convex/react
const mockUseQuery = vi.fn();
vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

// Mock motion/react to render plain divs (avoids animation complexity in tests)
vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial: _initial, animate: _animate, transition: _transition, ...htmlProps } = props;
      return <div {...htmlProps}>{children}</div>;
    },
  },
}));

// Mock ShadCN ScrollArea to render a plain div (avoids Radix internals in tests)
vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
    const { className, ...rest } = props;
    return (
      <div className={className as string} {...rest}>
        {children}
      </div>
    );
  },
}));

type Activity = Doc<"activities">;

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    _id: "act1" as Activity["_id"],
    _creationTime: 1708700000000,
    taskId: undefined,
    agentName: "agent-1",
    eventType: "task_created",
    description: "Created task: Setup CI",
    timestamp: "2026-02-23T14:32:05.000Z",
    ...overrides,
  } as Activity;
}

describe("ActivityFeed", () => {
  afterEach(() => {
    cleanup();
    mockUseQuery.mockReset();
  });

  it("shows empty state when no activities exist", () => {
    mockUseQuery.mockReturnValue([]);
    render(<ActivityFeed />);
    expect(screen.getByText("Waiting for activity...")).toBeInTheDocument();
  });

  it("renders nothing while loading", () => {
    mockUseQuery.mockReturnValue(undefined);
    const { container } = render(<ActivityFeed />);
    expect(container.innerHTML).toBe("");
  });

  it("shows reconnecting message when data disappears after initial load", () => {
    // First render with data to set hadDataRef
    mockUseQuery.mockReturnValue([makeActivity()]);
    const { rerender } = render(<ActivityFeed />);

    // Simulate WebSocket disconnection
    mockUseQuery.mockReturnValue(undefined);
    rerender(<ActivityFeed />);

    expect(screen.getByText("Reconnecting...")).toBeInTheDocument();
  });

  it("renders activities in newest-first order", () => {
    // listRecent returns newest-first (desc order)
    mockUseQuery.mockReturnValue([
      makeActivity({
        _id: "act3" as Activity["_id"],
        timestamp: "2026-02-23T14:34:15.000Z",
        description: "Third event",
      }),
      makeActivity({
        _id: "act2" as Activity["_id"],
        timestamp: "2026-02-23T14:33:10.000Z",
        description: "Second event",
      }),
      makeActivity({
        _id: "act1" as Activity["_id"],
        timestamp: "2026-02-23T14:32:05.000Z",
        description: "First event",
      }),
    ]);
    render(<ActivityFeed />);

    const items = screen.getAllByText(/event/);
    expect(items[0].textContent).toBe("Third event");
    expect(items[1].textContent).toBe("Second event");
    expect(items[2].textContent).toBe("First event");
  });

  it("shows 'Showing last 100 activities' when feed is at capacity", () => {
    const hundredActivities = Array.from({ length: 100 }, (_, i) =>
      makeActivity({
        _id: `act${i}` as Activity["_id"],
        description: `Event ${i}`,
      }),
    );
    mockUseQuery.mockReturnValue(hundredActivities);
    render(<ActivityFeed />);
    expect(screen.getByText("Showing last 100 activities")).toBeInTheDocument();
  });
});
