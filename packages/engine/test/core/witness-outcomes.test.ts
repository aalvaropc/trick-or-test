import { describe, expect, it } from "vitest";
import {
  compareOutcomes,
  matchesExpectation,
  type WitnessOutcome,
} from "../../src/core/witness-compare.js";

const value = (v: unknown): WitnessOutcome => ({ kind: "value", value: v });
const error = (className: string): WitnessOutcome => ({ kind: "error", className });
const timeout: WitnessOutcome = { kind: "timeout", message: "timed out" };
const noOutcome: WitnessOutcome = { kind: "no-outcome", message: "nothing recorded" };

describe("compareOutcomes", () => {
  it("5.16 timeout on the mutated code against a value original is different", () => {
    expect(compareOutcomes(value(5), timeout)).toBe("different");
  });

  it("5.16 timeout on both is same", () => {
    expect(compareOutcomes(timeout, { kind: "timeout", message: "other" })).toBe("same");
  });

  it("5.16 timeout on the original only is different", () => {
    expect(compareOutcomes(timeout, value(5))).toBe("different");
  });

  it("5.16 no-outcome against a value is different", () => {
    expect(compareOutcomes(noOutcome, value(5))).toBe("different");
    expect(compareOutcomes(value(5), noOutcome)).toBe("different");
  });

  it("5.7 equal values are same", () => {
    expect(compareOutcomes(value({ a: 1, b: [2] }), value({ b: [2], a: 1 }))).toBe("same");
  });

  it("5.7 unequal values are different", () => {
    expect(compareOutcomes(value(100), value(101))).toBe("different");
  });

  it("5.7 -0 equals 0", () => {
    expect(compareOutcomes(value(-0), value(0))).toBe("same");
  });

  it("5.7 undefined members are dropped", () => {
    expect(compareOutcomes(value({ a: 1, b: undefined }), value({ a: 1 }))).toBe("same");
  });

  it("5.12 errors with the same className are same", () => {
    expect(compareOutcomes(error("RangeError"), error("RangeError"))).toBe("same");
  });

  it("5.12 errors with different classNames are different", () => {
    expect(compareOutcomes(error("RangeError"), error("TypeError"))).toBe("different");
  });
});

describe("matchesExpectation", () => {
  it("5.6 a value equal to the expectation matches", () => {
    expect(matchesExpectation({ expected: 7 }, value(7))).toBe(true);
  });

  it("5.6 -0 matches an expected 0", () => {
    expect(matchesExpectation({ expected: 0 }, value(-0))).toBe(true);
  });

  it("5.12 an error with the expected className matches", () => {
    expect(matchesExpectation({ expectedError: "RangeError" }, error("RangeError"))).toBe(true);
    expect(matchesExpectation({ expectedError: "RangeError" }, error("TypeError"))).toBe(false);
  });

  it("5.16 timeout never matches an expectation", () => {
    expect(matchesExpectation({ expected: 7 }, timeout)).toBe(false);
    expect(matchesExpectation({ expectedError: "RangeError" }, timeout)).toBe(false);
  });

  it("5.16 no-outcome never matches an expectation", () => {
    expect(matchesExpectation({ expected: undefined }, noOutcome)).toBe(false);
    expect(matchesExpectation({ expectedError: "RangeError" }, noOutcome)).toBe(false);
  });
});
