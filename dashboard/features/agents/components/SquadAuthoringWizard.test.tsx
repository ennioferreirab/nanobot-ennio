import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SquadAuthoringWizard } from "./SquadAuthoringWizard";

describe("SquadAuthoringWizard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders squad authoring wizard when open", () => {
    render(<SquadAuthoringWizard open={true} onClose={vi.fn()} onPublished={vi.fn()} />);
    // "Create Squad" title should be visible
    const squadTexts = screen.getAllByText(/squad/i);
    expect(squadTexts.length).toBeGreaterThan(0);
  });

  it("shows Outcome phase as the first step", () => {
    render(<SquadAuthoringWizard open={true} onClose={vi.fn()} onPublished={vi.fn()} />);
    const outcomeElements = screen.getAllByText(/outcome/i);
    expect(outcomeElements.length).toBeGreaterThan(0);
  });

  it("renders a live summary panel", () => {
    render(<SquadAuthoringWizard open={true} onClose={vi.fn()} onPublished={vi.fn()} />);
    expect(screen.getByTestId("squad-spec-summary")).toBeInTheDocument();
  });

  it("shows team design phase indicator", () => {
    render(<SquadAuthoringWizard open={true} onClose={vi.fn()} onPublished={vi.fn()} />);
    // Phase labels are rendered in the phase navigation bar
    expect(screen.getByText("Team Design")).toBeInTheDocument();
  });

  it("shows workflow design phase indicator", () => {
    render(<SquadAuthoringWizard open={true} onClose={vi.fn()} onPublished={vi.fn()} />);
    expect(screen.getByText("Workflow Design")).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", async () => {
    const handleClose = vi.fn();
    render(<SquadAuthoringWizard open={true} onClose={handleClose} onPublished={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(handleClose).toHaveBeenCalled();
  });

  it("allows entering squad display name", async () => {
    render(<SquadAuthoringWizard open={true} onClose={vi.fn()} onPublished={vi.fn()} />);
    // The display name input uses placeholder "squad name (e.g. Review Squad)"
    const displayNameInput = screen.getByPlaceholderText(/review squad/i);
    await userEvent.type(displayNameInput, "Alpha Team");
    expect(displayNameInput).toHaveValue("Alpha Team");
  });

  it("does not render when open=false", () => {
    render(<SquadAuthoringWizard open={false} onClose={vi.fn()} onPublished={vi.fn()} />);
    expect(screen.queryByTestId("squad-spec-summary")).not.toBeInTheDocument();
  });
});
