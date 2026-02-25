import { describe, expect, it } from "vitest";

import {
  batchCreate,
  findBlockedStepsReadyToUnblock,
  isValidStepTransition,
  isValidStepStatus,
  resolveBlockedByIds,
  resolveInitialStepStatus,
} from "./steps";

describe("isValidStepStatus", () => {
  it("accepts all supported step statuses", () => {
    expect(isValidStepStatus("planned")).toBe(true);
    expect(isValidStepStatus("assigned")).toBe(true);
    expect(isValidStepStatus("running")).toBe(true);
    expect(isValidStepStatus("completed")).toBe(true);
    expect(isValidStepStatus("crashed")).toBe(true);
    expect(isValidStepStatus("blocked")).toBe(true);
  });

  it("rejects unsupported step statuses", () => {
    expect(isValidStepStatus("inbox")).toBe(false);
    expect(isValidStepStatus("done")).toBe(false);
    expect(isValidStepStatus("failed")).toBe(false);
  });
});

describe("findBlockedStepsReadyToUnblock", () => {
  it("returns blocked steps whose blockers are all completed", () => {
    const steps = [
      { _id: "s1", status: "completed" },
      { _id: "s2", status: "completed" },
      { _id: "s3", status: "blocked", blockedBy: ["s1", "s2"] },
      { _id: "s4", status: "blocked", blockedBy: ["s1"] },
      { _id: "s5", status: "assigned", blockedBy: ["s1"] },
    ];

    const ready = findBlockedStepsReadyToUnblock(
      steps as Parameters<typeof findBlockedStepsReadyToUnblock>[0]
    );

    expect(ready).toEqual(["s3", "s4"]);
  });

  it("does not return blocked steps with incomplete blockers", () => {
    const steps = [
      { _id: "s1", status: "completed" },
      { _id: "s2", status: "running" },
      { _id: "s3", status: "blocked", blockedBy: ["s1", "s2"] },
      { _id: "s4", status: "blocked", blockedBy: ["s2"] },
    ];

    const ready = findBlockedStepsReadyToUnblock(
      steps as Parameters<typeof findBlockedStepsReadyToUnblock>[0]
    );

    expect(ready).toEqual([]);
  });
});

describe("resolveInitialStepStatus", () => {
  it("defaults to blocked when dependencies exist", () => {
    expect(resolveInitialStepStatus(undefined, 2)).toBe("blocked");
  });

  it("defaults to assigned when no dependencies exist", () => {
    expect(resolveInitialStepStatus(undefined, 0)).toBe("assigned");
  });

  it("throws when blockedBy is non-empty and status is not blocked", () => {
    expect(() => resolveInitialStepStatus("assigned", 1)).toThrow(
      /must use status 'blocked'/
    );
  });

  it("throws when status is blocked but there are no dependencies", () => {
    expect(() => resolveInitialStepStatus("blocked", 0)).toThrow(
      /requires at least one dependency/
    );
  });
});

describe("isValidStepTransition", () => {
  it("allows valid transitions", () => {
    expect(isValidStepTransition("planned", "assigned")).toBe(true);
    expect(isValidStepTransition("blocked", "assigned")).toBe(true);
    expect(isValidStepTransition("running", "completed")).toBe(true);
    expect(isValidStepTransition("crashed", "assigned")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(isValidStepTransition("completed", "running")).toBe(false);
    expect(isValidStepTransition("assigned", "planned")).toBe(false);
    expect(isValidStepTransition("inbox", "assigned")).toBe(false);
  });
});

describe("resolveBlockedByIds", () => {
  it("maps blockedBy temp IDs to real step IDs", () => {
    const mapped = resolveBlockedByIds(["step_1", "step_2"], {
      step_1: "real-1" as any,
      step_2: "real-2" as any,
    });
    expect(mapped).toEqual(["real-1", "real-2"]);
  });

  it("throws when a dependency temp ID is unknown", () => {
    expect(() => resolveBlockedByIds(["missing"], {} as any)).toThrow(
      /Unknown blockedByTempId dependency/
    );
  });
});

describe("batchCreate", () => {
  function getHandler() {
    return (batchCreate as unknown as {
      _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<string[]>;
    })._handler;
  }

  it("creates steps and patches blockedBy dependencies atomically", async () => {
    const handler = getHandler();

    const records = new Map<string, any>();
    let stepCounter = 0;

    const ctx = {
      db: {
        get: async (id: string) => {
          if (id === "task-1") {
            return { _id: "task-1", title: "Task" };
          }
          return records.get(id) ?? null;
        },
        insert: async (table: string, value: Record<string, unknown>) => {
          if (table === "steps") {
            stepCounter += 1;
            const stepId = `step-${stepCounter}`;
            records.set(stepId, { _id: stepId, ...value });
            return stepId;
          }
          return `activity-${Math.random()}`;
        },
        patch: async (id: string, value: Record<string, unknown>) => {
          const current = records.get(id);
          records.set(id, { ...current, ...value });
        },
      },
    };

    const created = await handler(ctx, {
      taskId: "task-1",
      steps: [
        {
          tempId: "step_1",
          title: "First",
          description: "First step",
          assignedAgent: "general-agent",
          blockedByTempIds: [],
          parallelGroup: 1,
          order: 1,
        },
        {
          tempId: "step_2",
          title: "Second",
          description: "Second step",
          assignedAgent: "general-agent",
          blockedByTempIds: ["step_1"],
          parallelGroup: 2,
          order: 2,
        },
      ],
    });

    expect(created).toEqual(["step-1", "step-2"]);
    expect(records.get("step-1").status).toBe("assigned");
    expect(records.get("step-2").status).toBe("blocked");
    expect(records.get("step-2").blockedBy).toEqual(["step-1"]);
  });

  it("rejects unknown dependency temp IDs", async () => {
    const handler = getHandler();

    const ctx = {
      db: {
        get: async () => ({ _id: "task-1", title: "Task" }),
        insert: async () => "step-1",
        patch: async () => undefined,
      },
    };

    await expect(
      handler(ctx, {
        taskId: "task-1",
        steps: [
          {
            tempId: "step_1",
            title: "Only",
            description: "Only step",
            assignedAgent: "general-agent",
            blockedByTempIds: ["missing"],
            parallelGroup: 1,
            order: 1,
          },
        ],
      })
    ).rejects.toThrow(/unknown dependency/i);
  });
});
