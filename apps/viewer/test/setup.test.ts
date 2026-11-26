import fc from "fast-check";
import { describe, expect, it } from "vitest";

describe("shared fast-check configuration", () => {
  it("12.10 configures the fixed seed and numRuns globally", () => {
    const config = fc.readConfigureGlobal();
    expect(config.seed).toBe(20261116);
    expect(config.numRuns).toBe(100);
  });
});
