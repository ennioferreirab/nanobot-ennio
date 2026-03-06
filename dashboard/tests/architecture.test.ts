/**
 * Architecture guardrail tests for the dashboard.
 *
 * These tests scan source files for import patterns that violate
 * architectural rules. They prevent accidental coupling regressions
 * and document the intended module boundaries.
 *
 * Rules:
 * 1. Feature components (KanbanBoard, TaskDetailSheet) must use hooks
 *    instead of directly importing useQuery/useMutation from convex/react.
 * 2. Hook files must not import UI components (no upward deps).
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const DASHBOARD_ROOT = path.resolve(__dirname, "..");

function readFileIfExists(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function fileContainsDirectConvexImport(content: string): boolean {
  const importRegex =
    /import\s+\{[^}]*(useQuery|useMutation)[^}]*\}\s+from\s+["']convex\/react["']/;
  return importRegex.test(content);
}

describe("Architecture: Hook files must not import UI components", () => {
  it("hooks/ directory files should not import from components/", () => {
    const hooksDir = path.join(DASHBOARD_ROOT, "hooks");
    if (!fs.existsSync(hooksDir)) {
      return;
    }

    const hookFiles = fs
      .readdirSync(hooksDir)
      .filter((f: string) => f.endsWith(".ts") || f.endsWith(".tsx"))
      .filter((f: string) => !f.includes(".test."));

    for (const hookFile of hookFiles) {
      const content = fs.readFileSync(
        path.join(hooksDir, hookFile),
        "utf-8",
      );
      // Allow imports from context providers (e.g. BoardContext) —
      // these are shared state hooks that happen to live in components/
      const lines = content.split("\n").filter(
        (line: string) =>
          /from\s+["']@?\.?\.?\/?components\//.test(line) &&
          !/Context["']/.test(line)
      );
      const componentImports = lines.length > 0 ? lines : null;
      expect(
        componentImports,
        `hooks/${hookFile} imports from components/ -- hooks must not depend on UI components`,
      ).toBeNull();
    }
  });
});

describe("Architecture: Feature components must use hooks, not direct Convex imports", () => {
  it("KanbanBoard.tsx should not directly import useQuery/useMutation from convex/react", () => {
    const filePath = path.join(DASHBOARD_ROOT, "components", "KanbanBoard.tsx");
    const content = readFileIfExists(filePath);
    if (!content) return;
    expect(
      fileContainsDirectConvexImport(content),
      "KanbanBoard.tsx must use hooks (useBoardView, useBoardFilters, useBoardColumns) instead of direct useQuery/useMutation",
    ).toBe(false);
  });

  it("TaskDetailSheet.tsx should not directly import useQuery/useMutation from convex/react", () => {
    const filePath = path.join(DASHBOARD_ROOT, "components", "TaskDetailSheet.tsx");
    const content = readFileIfExists(filePath);
    if (!content) return;
    expect(
      fileContainsDirectConvexImport(content),
      "TaskDetailSheet.tsx must use hooks (useTaskDetailView, useTaskDetailActions, etc.) instead of direct useQuery/useMutation",
    ).toBe(false);
  });
});
