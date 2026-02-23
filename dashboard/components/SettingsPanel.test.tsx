import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { SettingsPanel } from "./SettingsPanel";

const mockSetMutation = vi.fn().mockResolvedValue(undefined);
let mockQueryResult: Array<{ key: string; value: string }> | undefined = [];

vi.mock("convex/react", () => ({
  useQuery: () => mockQueryResult,
  useMutation: () => mockSetMutation,
}));

describe("SettingsPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockQueryResult = [];
    mockSetMutation.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders with default values when no settings exist", () => {
    render(<SettingsPanel />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Task Timeout (minutes)")).toBeInTheDocument();
    expect(screen.getByText("Inter-Agent Review Timeout (minutes)")).toBeInTheDocument();
    expect(screen.getByText("Default LLM Model")).toBeInTheDocument();

    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs[0]).toHaveValue(30);
    expect(inputs[1]).toHaveValue(10);
  });

  it("renders with saved values from Convex", () => {
    mockQueryResult = [
      { key: "task_timeout_minutes", value: "60" },
      { key: "inter_agent_timeout_minutes", value: "20" },
      { key: "default_llm_model", value: "claude-opus-4-6" },
    ];
    render(<SettingsPanel />);

    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs[0]).toHaveValue(60);
    expect(inputs[1]).toHaveValue(20);
  });

  it("calls set mutation after debounce when changing a number input", async () => {
    render(<SettingsPanel />);

    const inputs = screen.getAllByRole("spinbutton");
    fireEvent.change(inputs[0], { target: { value: "45" } });

    // Mutation should not be called immediately
    expect(mockSetMutation).not.toHaveBeenCalled();

    // Advance past debounce timer
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(mockSetMutation).toHaveBeenCalledWith({
      key: "task_timeout_minutes",
      value: "45",
    });
  });

  it("calls set mutation on blur", async () => {
    render(<SettingsPanel />);

    const inputs = screen.getAllByRole("spinbutton");
    fireEvent.change(inputs[0], { target: { value: "50" } });
    fireEvent.blur(inputs[0]);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockSetMutation).toHaveBeenCalledWith({
      key: "task_timeout_minutes",
      value: "50",
    });
  });

  it("shows green checkmark after save and hides after 1.5s", async () => {
    render(<SettingsPanel />);

    const inputs = screen.getAllByRole("spinbutton");
    fireEvent.change(inputs[0], { target: { value: "45" } });

    // Trigger debounce
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Wait for mutation to resolve
    await act(async () => {
      await Promise.resolve();
    });

    // Checkmark should be visible (Check icon from lucide renders as svg)
    const checks = document.querySelectorAll(".text-green-500");
    expect(checks.length).toBeGreaterThan(0);

    // Advance past fade timeout
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    // Checkmark should be gone
    const checksAfter = document.querySelectorAll(".text-green-500");
    expect(checksAfter.length).toBe(0);
  });

  it("calls set mutation immediately when changing LLM model select", async () => {
    render(<SettingsPanel />);

    // Open the select and pick a model
    const trigger = screen.getByRole("combobox");
    fireEvent.click(trigger);

    const option = screen.getByText("Claude Opus 4.6");
    fireEvent.click(option);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockSetMutation).toHaveBeenCalledWith({
      key: "default_llm_model",
      value: "claude-opus-4-6",
    });
  });
});
