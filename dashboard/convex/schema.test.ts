import { describe, expect, it } from "vitest";

import { taskFileMetadataValidator } from "./schema";

describe("taskFileMetadataValidator", () => {
  it("accepts restoredAt as an optional legacy field", () => {
    expect(taskFileMetadataValidator.kind).toBe("object");
    expect(taskFileMetadataValidator.fields.restoredAt?.kind).toBe("string");
    expect(taskFileMetadataValidator.fields.restoredAt?.isOptional).toBe("optional");
    expect(taskFileMetadataValidator.fields.uploadedAt.isOptional).toBe("required");
  });
});
