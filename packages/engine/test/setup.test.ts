import fc from "fast-check";
import { describe, expect, it } from "vitest";

describe("fast-check global setup", () => {
  it("10.6 / 10.7 configures a fixed seed and at least 100 runs", () => {
    const config = fc.readConfigureGlobal();
    expect(config.numRuns).toBeGreaterThanOrEqual(100);
    expect(config.seed).toBeTypeOf("number");
  });
});
