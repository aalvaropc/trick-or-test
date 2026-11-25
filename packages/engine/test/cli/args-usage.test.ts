import { describe, expect, it } from "vitest";
import { USAGE_TEXT } from "../../src/cli/args.js";

describe("usage text", () => {
  it("9.16 describes --spec as the one spec a run attacks", () => {
    const line = USAGE_TEXT.split("\n").find((l) => l.trim().startsWith("--spec"));
    expect(line).toContain("The spec to attack (required when the project has more than one)");
    expect(USAGE_TEXT).not.toContain("every spec with requirements.md");
  });
});
