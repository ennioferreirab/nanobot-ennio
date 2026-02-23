import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ExecutionPlanTab } from "./ExecutionPlanTab";

afterEach(() => {
  cleanup();
});

const makeStep = (overrides: Record<string, unknown> = {}) => ({
  stepId: "step-1",
  description: "Analyze requirements",
  assignedAgent: undefined as string | undefined,
  dependsOn: [] as string[],
  parallelGroup: undefined as string | undefined,
  status: "pending",
  ...overrides,
});

describe("ExecutionPlanTab", () => {
  it("shows direct execution message when plan is null", () => {
    render(<ExecutionPlanTab executionPlan={null} />);
    expect(screen.getByText(/Direct execution/)).toBeInTheDocument();
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
});
