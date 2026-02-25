import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ExecutionPlanTab } from "./ExecutionPlanTab";

afterEach(() => {
  cleanup();
});

const makeStep = (overrides: Record<string, unknown> = {}) => ({
  stepId: "step-1",
  title: undefined as string | undefined,
  description: "Analyze requirements",
  assignedAgent: undefined as string | undefined,
  dependsOn: [] as string[],
  blockedBy: undefined as string[] | undefined,
  parallelGroup: undefined as string | number | undefined,
  status: "pending",
  order: undefined as number | undefined,
  errorMessage: undefined as string | undefined,
  ...overrides,
});

describe("ExecutionPlanTab", () => {
  it("shows direct execution message when plan is null", () => {
    render(<ExecutionPlanTab executionPlan={null} />);
    expect(screen.getByText(/Direct execution/)).toBeInTheDocument();
  });

  it("shows generating message when planning and plan is not ready", () => {
    const { container } = render(<ExecutionPlanTab executionPlan={null} isPlanning />);
    expect(screen.getByText("Generating execution plan...")).toBeInTheDocument();
    expect(screen.queryByText(/Direct execution/)).not.toBeInTheDocument();
    expect(container.querySelector("svg.animate-spin")).toBeInTheDocument();
  });

  it("shows direct execution message when plan is undefined", () => {
    render(<ExecutionPlanTab executionPlan={undefined} />);
    expect(screen.getByText(/Direct execution/)).toBeInTheDocument();
  });

  it("shows direct execution message when steps array is empty", () => {
    render(<ExecutionPlanTab executionPlan={{ steps: [], createdAt: "2026-01-01" }} />);
    expect(screen.getByText(/Direct execution/)).toBeInTheDocument();
  });

  it("renders all step descriptions for a 3-step plan", () => {
    const plan = {
      steps: [
        makeStep({ stepId: "s1", description: "Analyze requirements" }),
        makeStep({ stepId: "s2", description: "Implement feature" }),
        makeStep({ stepId: "s3", description: "Write tests" }),
      ],
      createdAt: "2026-01-01",
    };
    render(<ExecutionPlanTab executionPlan={plan} />);
    expect(screen.getByText("Analyze requirements")).toBeInTheDocument();
    expect(screen.getByText("Implement feature")).toBeInTheDocument();
    expect(screen.getByText("Write tests")).toBeInTheDocument();
  });

  it("shows progress count", () => {
    const plan = {
      steps: [
        makeStep({ stepId: "s1", status: "completed" }),
        makeStep({ stepId: "s2", status: "in_progress" }),
        makeStep({ stepId: "s3", status: "pending" }),
      ],
      createdAt: "2026-01-01",
    };
    render(<ExecutionPlanTab executionPlan={plan} />);
    expect(screen.getByText("1/3 steps completed")).toBeInTheDocument();
  });

  it("renders correct status icon classes for completed steps", () => {
    const plan = {
      steps: [
        makeStep({ stepId: "s1", status: "completed", description: "Done step" }),
      ],
      createdAt: "2026-01-01",
    };
    const { container } = render(<ExecutionPlanTab executionPlan={plan} />);
    const svg = container.querySelector("svg");
    expect(svg?.classList.contains("text-green-500")).toBe(true);
  });

  it("renders correct status icon classes for in_progress steps", () => {
    const plan = {
      steps: [
        makeStep({ stepId: "s1", status: "in_progress", description: "Working" }),
      ],
      createdAt: "2026-01-01",
    };
    const { container } = render(<ExecutionPlanTab executionPlan={plan} />);
    const svg = container.querySelector("svg");
    expect(svg?.classList.contains("text-blue-500")).toBe(true);
    expect(svg?.classList.contains("animate-spin")).toBe(true);
  });

  it("renders correct status icon classes for failed steps", () => {
    const plan = {
      steps: [
        makeStep({ stepId: "s1", status: "failed", description: "Broken" }),
      ],
      createdAt: "2026-01-01",
    };
    const { container } = render(<ExecutionPlanTab executionPlan={plan} />);
    const svg = container.querySelector("svg");
    expect(svg?.classList.contains("text-red-500")).toBe(true);
  });

  it("renders correct status icon classes for pending steps", () => {
    const plan = {
      steps: [
        makeStep({ stepId: "s1", status: "pending", description: "Waiting" }),
      ],
      createdAt: "2026-01-01",
    };
    const { container } = render(<ExecutionPlanTab executionPlan={plan} />);
    const svg = container.querySelector("svg");
    expect(svg?.classList.contains("text-muted-foreground")).toBe(true);
  });

  it("renders parallel group label for grouped steps", () => {
    const plan = {
      steps: [
        makeStep({ stepId: "s1", parallelGroup: "group-a", description: "Step A1" }),
        makeStep({ stepId: "s2", parallelGroup: "group-a", description: "Step A2" }),
      ],
      createdAt: "2026-01-01",
    };
    render(<ExecutionPlanTab executionPlan={plan} />);
    expect(screen.getByText("Parallel")).toBeInTheDocument();
  });

  it("renders assigned agent name", () => {
    const plan = {
      steps: [
        makeStep({ stepId: "s1", assignedAgent: "code-monkey" }),
      ],
      createdAt: "2026-01-01",
    };
    render(<ExecutionPlanTab executionPlan={plan} />);
    expect(screen.getByText("code-monkey")).toBeInTheDocument();
  });

  it("applies dependency indentation for steps with dependsOn", () => {
    const plan = {
      steps: [
        makeStep({ stepId: "s1", description: "First" }),
        makeStep({ stepId: "s2", description: "Second", dependsOn: ["s1"] }),
      ],
      createdAt: "2026-01-01",
    };
    const { container } = render(<ExecutionPlanTab executionPlan={plan} />);
    const indented = container.querySelector(".border-l-2.border-border");
    expect(indented).toBeInTheDocument();
  });

  it("renders parallel steps inside a visual lane", () => {
    const plan = {
      steps: [
        makeStep({ stepId: "s1", parallelGroup: 1, description: "Plan" }),
        makeStep({ stepId: "s2", parallelGroup: 1, description: "Implement" }),
        makeStep({ stepId: "s3", description: "Review" }),
      ],
      createdAt: "2026-01-01",
    };
    render(<ExecutionPlanTab executionPlan={plan} />);
    const lane = screen.getByTestId("parallel-group-1");
    expect(lane).toBeInTheDocument();
    expect(lane.querySelector(".flex.flex-row")).toBeInTheDocument();
    expect(screen.getByText("Group 1")).toBeInTheDocument();
  });

  it("renders dependency labels using step numbers", () => {
    const plan = {
      steps: [
        makeStep({ stepId: "s1", description: "First" }),
        makeStep({ stepId: "s2", description: "Second", blockedBy: ["s1"] }),
      ],
      createdAt: "2026-01-01",
    };
    render(<ExecutionPlanTab executionPlan={plan} />);
    expect(screen.getByText("depends on: Step 1")).toBeInTheDocument();
  });

  it("maps architecture statuses to expected icon colors", () => {
    const plan = {
      steps: [
        makeStep({ stepId: "planned", status: "planned", description: "Planned" }),
        makeStep({ stepId: "assigned", status: "assigned", description: "Assigned" }),
        makeStep({ stepId: "blocked", status: "blocked", description: "Blocked" }),
        makeStep({ stepId: "running", status: "running", description: "Running" }),
        makeStep({ stepId: "completed", status: "completed", description: "Completed" }),
        makeStep({ stepId: "crashed", status: "crashed", description: "Crashed" }),
      ],
      createdAt: "2026-01-01",
    };
    render(<ExecutionPlanTab executionPlan={plan} />);
    expect(screen.getByTestId("step-status-icon-planned").getAttribute("class")).toContain("text-muted-foreground");
    expect(screen.getByTestId("step-status-icon-assigned").getAttribute("class")).toContain("text-cyan-500");
    expect(screen.getByTestId("step-status-icon-blocked").getAttribute("class")).toContain("text-amber-500");
    expect(screen.getByTestId("step-status-icon-running").getAttribute("class")).toContain("text-blue-500");
    expect(screen.getByTestId("step-status-icon-running").getAttribute("class")).toContain("animate-spin");
    expect(screen.getByTestId("step-status-icon-completed").getAttribute("class")).toContain("text-green-500");
    expect(screen.getByTestId("step-status-icon-crashed").getAttribute("class")).toContain("text-red-500");
  });

  it("renders title and description when both are provided", () => {
    const plan = {
      steps: [
        makeStep({
          stepId: "s1",
          title: "Step title",
          description: "Step details",
        }),
      ],
      createdAt: "2026-01-01",
    };
    render(<ExecutionPlanTab executionPlan={plan} />);
    expect(screen.getByText("Step title")).toBeInTheDocument();
    expect(screen.getByText("Step details")).toBeInTheDocument();
  });

  it("defaults missing step status to planned without crashing", () => {
    const plan = {
      steps: [
        makeStep({
          stepId: "s1",
          title: "No status",
          description: "Status omitted",
          status: undefined,
        }),
      ],
      createdAt: "2026-01-01",
    };
    render(<ExecutionPlanTab executionPlan={plan} />);
    expect(screen.getByText("No status")).toBeInTheDocument();
    expect(screen.getByText("Planned")).toBeInTheDocument();
    expect(screen.getByTestId("step-status-icon-s1").getAttribute("class")).toContain("text-muted-foreground");
  });

  it("prefers live step status over execution plan snapshot status", () => {
    const plan = {
      steps: [
        makeStep({
          stepId: "s1",
          title: "Draft copy",
          description: "Snapshot",
          status: "planned",
          order: 1,
        }),
      ],
      createdAt: "2026-01-01",
    };
    render(
      <ExecutionPlanTab
        executionPlan={plan}
        liveSteps={[
          {
            _id: "live-1",
            title: "Draft copy",
            description: "Live",
            assignedAgent: "writer",
            status: "running",
            parallelGroup: 0,
            order: 1,
          },
        ]}
      />
    );
    expect(screen.getByTestId("step-status-icon-s1").getAttribute("class")).toContain("text-blue-500");
    expect(screen.getByTestId("step-status-icon-s1").getAttribute("class")).toContain("animate-spin");
  });

  it("maps live blockedBy ids to plan step numbers in dependency labels", () => {
    const plan = {
      steps: [
        makeStep({
          stepId: "s1",
          title: "First",
          description: "First step",
          status: "planned",
          order: 1,
        }),
        makeStep({
          stepId: "s2",
          title: "Second",
          description: "Second step",
          status: "planned",
          dependsOn: [],
          blockedBy: [],
          order: 2,
        }),
      ],
      createdAt: "2026-01-01",
    };
    render(
      <ExecutionPlanTab
        executionPlan={plan}
        liveSteps={[
          {
            _id: "live-step-1",
            title: "First",
            description: "First step",
            assignedAgent: "agent-a",
            status: "completed",
            parallelGroup: 1,
            order: 1,
          },
          {
            _id: "live-step-2",
            title: "Second",
            description: "Second step",
            assignedAgent: "agent-b",
            status: "blocked",
            blockedBy: ["live-step-1"],
            parallelGroup: 2,
            order: 2,
          },
        ]}
      />
    );
    expect(screen.getByText("depends on: Step 1")).toBeInTheDocument();
  });
});
