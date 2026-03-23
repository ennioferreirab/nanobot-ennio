import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ArtifactRenderer, type Artifact } from "./ArtifactRenderer";

describe("ArtifactRenderer", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing when artifacts array is empty", () => {
    const { container } = render(<ArtifactRenderer artifacts={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders file path and action badge for a created artifact", () => {
    const artifacts: Artifact[] = [
      {
        path: "/output/invoice-summary.csv",
        action: "created",
        description: "Structured CSV with 47 invoice entries",
      },
    ];

    render(<ArtifactRenderer artifacts={artifacts} />);

    expect(screen.getByText("/output/invoice-summary.csv")).toBeInTheDocument();
    expect(screen.getByText("created")).toBeInTheDocument();
    expect(screen.getByText("Structured CSV with 47 invoice entries")).toBeInTheDocument();
  });

  it("renders an action badge for modified artifacts", () => {
    const artifacts: Artifact[] = [
      { path: "/src/existing.ts", action: "modified", diff: "- old\n+ new" },
    ];

    render(<ArtifactRenderer artifacts={artifacts} />);

    expect(screen.getByText("modified")).toBeInTheDocument();
  });

  it("renders description for created files", () => {
    const artifacts: Artifact[] = [
      {
        path: "/docs/README.md",
        action: "created",
        description: "Project documentation",
      },
    ];

    render(<ArtifactRenderer artifacts={artifacts} />);

    expect(screen.getByText("Project documentation")).toBeInTheDocument();
  });

  it("does not render description when absent", () => {
    const artifacts: Artifact[] = [{ path: "/src/file.ts", action: "created" }];

    render(<ArtifactRenderer artifacts={artifacts} />);

    // Should only render path and badge, no description
    expect(screen.queryByText(/^undefined$/)).not.toBeInTheDocument();
  });

  it("renders collapsible diff toggle for modified files with diff", () => {
    const artifacts: Artifact[] = [
      {
        path: "/src/modified.ts",
        action: "modified",
        diff: "- const x = 1;\n+ const x = 2;",
      },
    ];

    render(<ArtifactRenderer artifacts={artifacts} />);

    expect(screen.getByText("Show diff")).toBeInTheDocument();
  });

  it("does not render diff toggle for modified files without diff", () => {
    const artifacts: Artifact[] = [{ path: "/src/modified.ts", action: "modified" }];

    render(<ArtifactRenderer artifacts={artifacts} />);

    expect(screen.queryByText("Show diff")).not.toBeInTheDocument();
  });

  it("does not render diff toggle for created files even with diff field", () => {
    const artifacts: Artifact[] = [
      {
        path: "/src/new.ts",
        action: "created",
        diff: "+ added content",
      },
    ];

    render(<ArtifactRenderer artifacts={artifacts} />);

    // diff toggle is only shown for modified action
    expect(screen.queryByText("Show diff")).not.toBeInTheDocument();
  });

  it("expands and collapses diff on click", () => {
    const artifacts: Artifact[] = [
      {
        path: "/src/modified.ts",
        action: "modified",
        diff: "- const x = 1;\n+ const x = 2;",
      },
    ];

    render(<ArtifactRenderer artifacts={artifacts} />);

    const trigger = screen.getByText("Show diff");
    fireEvent.click(trigger);
    expect(screen.getByText("Hide diff")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Hide diff"));
    expect(screen.getByText("Show diff")).toBeInTheDocument();
  });

  it("renders multiple artifacts", () => {
    const artifacts: Artifact[] = [
      { path: "/output/file1.csv", action: "created" },
      { path: "/output/file2.xlsx", action: "modified", diff: "- a\n+ b" },
      { path: "/output/old.txt", action: "deleted" },
    ];

    render(<ArtifactRenderer artifacts={artifacts} />);

    expect(screen.getByText("/output/file1.csv")).toBeInTheDocument();
    expect(screen.getByText("/output/file2.xlsx")).toBeInTheDocument();
    expect(screen.getByText("/output/old.txt")).toBeInTheDocument();
    expect(screen.getByText("created")).toBeInTheDocument();
    expect(screen.getByText("modified")).toBeInTheDocument();
    expect(screen.getByText("deleted")).toBeInTheDocument();
  });

  it("calls onArtifactClick when the artifact path is clicked", () => {
    const onArtifactClick = vi.fn();
    const artifacts: Artifact[] = [{ path: "/output/report.md", action: "created" }];

    render(<ArtifactRenderer artifacts={artifacts} onArtifactClick={onArtifactClick} />);

    fireEvent.click(screen.getByRole("button", { name: "/output/report.md" }));

    expect(onArtifactClick).toHaveBeenCalledWith(artifacts[0]);
  });
});
