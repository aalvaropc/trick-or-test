import { describe, expect, it } from "vitest";
import { computeSuiteTimeLimit } from "../../src/core/suite-time-limit.js";

describe("computeSuiteTimeLimit", () => {
  it("5.15 a zero baseline yields the 5000 ms floor", () => {
    expect(computeSuiteTimeLimit(0)).toBe(5000);
  });

  it("5.15 a typical baseline yields baseline * 1.5 + 5000", () => {
    expect(computeSuiteTimeLimit(10000)).toBe(20000);
  });

  it("5.15 timeoutMs set to 0 is used as is", () => {
    expect(computeSuiteTimeLimit(10000, 0)).toBe(0);
  });

  it("5.15 timeoutMs smaller than the formula wins", () => {
    expect(computeSuiteTimeLimit(10000, 1000)).toBe(1000);
  });

  it("5.15 timeoutMs larger than the formula wins", () => {
    expect(computeSuiteTimeLimit(10000, 60000)).toBe(60000);
  });
});
