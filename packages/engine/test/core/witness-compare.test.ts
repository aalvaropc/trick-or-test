import { describe, expect, it } from "vitest";
import { compareWitnessOutcome } from "../../src/core/witness-compare.js";

const value = (v: unknown) => ({ kind: "value", value: v }) as const;
const error = (className: string) => ({ kind: "error", className }) as const;

describe("compareWitnessOutcome", () => {
  it("5.12 equal values match", () => {
    expect(compareWitnessOutcome({ expected: 42 }, value(42))).toBe("match");
    expect(compareWitnessOutcome({ expected: "a" }, value("a"))).toBe("match");
    expect(compareWitnessOutcome({ expected: null }, value(null))).toBe("match");
  });

  it("5.12 unequal values mismatch", () => {
    expect(compareWitnessOutcome({ expected: 42 }, value(43))).toBe("mismatch");
    expect(compareWitnessOutcome({ expected: 1 }, value("1"))).toBe("mismatch");
    expect(compareWitnessOutcome({ expected: null }, value({}))).toBe("mismatch");
  });

  it("5.12 object key order does not matter", () => {
    expect(compareWitnessOutcome({ expected: { a: 1, b: 2 } }, value({ b: 2, a: 1 }))).toBe(
      "match",
    );
    expect(compareWitnessOutcome({ expected: { a: 1 } }, value({ a: 1, b: 2 }))).toBe("mismatch");
  });

  it("5.12 nested arrays are compared structurally and in order", () => {
    expect(
      compareWitnessOutcome({ expected: [1, [2, { x: [3] }]] }, value([1, [2, { x: [3] }]])),
    ).toBe("match");
    expect(compareWitnessOutcome({ expected: [1, 2] }, value([2, 1]))).toBe("mismatch");
    expect(compareWitnessOutcome({ expected: [1, [2]] }, value([1, [3]]))).toBe("mismatch");
    expect(compareWitnessOutcome({ expected: [] }, value({}))).toBe("mismatch");
  });

  it("5.12 -0 equals 0", () => {
    expect(compareWitnessOutcome({ expected: -0 }, value(0))).toBe("match");
    expect(compareWitnessOutcome({ expected: 0 }, value(-0))).toBe("match");
  });

  it("5.12 -0 equals 0 inside an array and an object", () => {
    expect(compareWitnessOutcome({ expected: [1, -0] }, value([1, 0]))).toBe("match");
    expect(compareWitnessOutcome({ expected: { a: -0 } }, value({ a: 0 }))).toBe("match");
  });

  it("5.12 undefined object members are dropped by the JSON form", () => {
    expect(compareWitnessOutcome({ expected: { a: 1 } }, value({ a: 1, b: undefined }))).toBe(
      "match",
    );
    expect(compareWitnessOutcome({ expected: { a: undefined } }, value({}))).toBe("match");
  });

  it("5.12 a top-level undefined does not throw", () => {
    expect(compareWitnessOutcome({ expected: undefined }, value(undefined))).toBe("match");
    expect(compareWitnessOutcome({ expected: undefined }, value(null))).toBe("mismatch");
  });

  it("5.6 expectedError matches an error with the same class name", () => {
    expect(compareWitnessOutcome({ expectedError: "RangeError" }, error("RangeError"))).toBe(
      "match",
    );
  });

  it("5.6 expectedError mismatches an error with a different class name", () => {
    expect(compareWitnessOutcome({ expectedError: "RangeError" }, error("TypeError"))).toBe(
      "mismatch",
    );
  });

  it("5.6 an expected value versus an actual error mismatches", () => {
    expect(compareWitnessOutcome({ expected: 1 }, error("Error"))).toBe("mismatch");
  });

  it("5.6 an expected error versus an actual value mismatches", () => {
    expect(compareWitnessOutcome({ expectedError: "Error" }, value("Error"))).toBe("mismatch");
  });
});
