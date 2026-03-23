import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

const markdownRenderSpy = vi.hoisted(() => vi.fn());

vi.mock("@/components/MarkdownRenderer", () => ({
  MarkdownRenderer: ({ content, className }: { content: string; className?: string }) => {
    markdownRenderSpy(content, className);
    return (
      <div data-testid="markdown-renderer-stub" className={className}>
        {content}
      </div>
    );
  },
}));

import { ThreadMessage } from "@/features/thread/components/ThreadMessage";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  markdownRenderSpy.mockClear();
});

// Minimal message shape matching Doc<"messages">
function makeMessage(overrides: Record<string, unknown>) {
  return {
    _id: "msg1" as never,
    _creationTime: 1000,
    taskId: "task1" as never,
    authorName: "lead-agent",
    authorType: "system" as const,
    content: "Hello from Lead Agent",
    messageType: "system_event" as const,
    timestamp: "2026-01-01T12:00:00Z",
    ...overrides,
  };
}

// Story 7.3, Task 6.4: lead_agent_chat messages render with indigo style
describe("ThreadMessage — lead_agent_chat", () => {
  it("does not rerender markdown when only unrelated step references change", () => {
    const message = makeMessage({
      type: "lead_agent_chat",
      content: "Stable markdown body",
    });
    const firstSteps = [{ _id: "step-a", title: "First title" }] as never;
    const secondSteps = [{ _id: "step-b", title: "Different title" }] as never;

    const { rerender } = render(<ThreadMessage message={message as never} steps={firstSteps} />);
    expect(markdownRenderSpy).toHaveBeenCalledTimes(1);

    rerender(<ThreadMessage message={{ ...message } as never} steps={secondSteps} />);

    expect(markdownRenderSpy).toHaveBeenCalledTimes(1);
  });

  it("renders 'Lead Agent' label for lead_agent_chat type", () => {
    const message = makeMessage({ type: "lead_agent_chat" });
    render(<ThreadMessage message={message as never} />);
    expect(screen.getByText("Lead Agent")).toBeInTheDocument();
  });

  it("renders the message content", () => {
    const message = makeMessage({
      type: "lead_agent_chat",
      content: "I updated the plan as requested.",
    });
    render(<ThreadMessage message={message as never} />);
    expect(screen.getByText("I updated the plan as requested.")).toBeInTheDocument();
  });

  it("renders the author name", () => {
    const message = makeMessage({
      type: "lead_agent_chat",
      authorName: "lead-agent",
    });
    render(<ThreadMessage message={message as never} />);
    expect(screen.getByText("lead-agent")).toBeInTheDocument();
  });
});

describe("ThreadMessage — user_message", () => {
  it("opens artifact callback when generated file is clicked", () => {
    const onArtifactClick = vi.fn();
    const message = makeMessage({
      type: "step_completion",
      artifacts: [{ path: "/output/result.md", action: "created" as const }],
    });

    render(<ThreadMessage message={message as never} onArtifactClick={onArtifactClick} />);

    fireEvent.click(screen.getByRole("button", { name: "/output/result.md" }));

    expect(onArtifactClick).toHaveBeenCalledWith("/output/result.md", "task1");
  });
});

describe("ThreadMessage — system_error", () => {
  it("renders the system error content", () => {
    const message = makeMessage({
      type: "system_error",
      authorType: "system" as const,
      content: "Pipeline failed",
    });
    render(<ThreadMessage message={message as never} />);
    expect(screen.getByText("Pipeline failed")).toBeInTheDocument();
  });
});
