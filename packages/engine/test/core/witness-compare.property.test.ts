// Property 22: A witness timeout is a difference, not a kill. Validates: Requirements 5.6, 5.7, 5.8, 5.11, 5.12, 5.16
import fc from "fast-check";
import { describe, it } from "vitest";
import {
  compareOutcomes,
  compareWitnessOutcome,
  matchesExpectation,
  type WitnessExpectation,
  type WitnessOutcome,
} from "../../src/core/witness-compare.js";

const jsonValue = fc.oneof(
  fc.jsonValue(),
  fc.constantFrom<unknown>(0, -0, 10000, 9999, 10001, "", [], {}, null, [0], [-0], { a: 0 }),
);

/** Same JSON form, different object key order (recursively). */
function reorderKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reorderKeys);
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).reverse();
    return Object.fromEntries(entries.map(([k, v]) => [k, reorderKeys(v)]));
  }
  return value;
}

/** Replaces zeros by negative zero everywhere; JSON form is unchanged. */
function negateZeros(value: unknown): unknown {
  if (value === 0) return -0;
  if (Array.isArray(value)) return value.map(negateZeros);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, negateZeros(v)]));
  }
  return value;
}

const message = fc.string({ maxLength: 30 });
const className = fc.oneof(
  fc.constantFrom("RangeError", "TypeError", "Error", "InvalidInputError", ""),
  fc.string({ maxLength: 15 }),
);

const valueOutcome = jsonValue.map((value): WitnessOutcome => ({ kind: "value", value }));
const errorOutcome = className.map((name): WitnessOutcome => ({ kind: "error", className: name }));
const timeoutOutcome = message.map((m): WitnessOutcome => ({ kind: "timeout", message: m }));
const noOutcome = message.map((m): WitnessOutcome => ({ kind: "no-outcome", message: m }));

const anyOutcome = fc.oneof(valueOutcome, errorOutcome, timeoutOutcome, noOutcome);
const nonTimeoutOutcome = fc.oneof(valueOutcome, errorOutcome, noOutcome);
const unmatchableOutcome = fc.oneof(timeoutOutcome, noOutcome);

const expectation = fc.oneof(
  jsonValue.map((expected): WitnessExpectation => ({ expected })),
  className.map((expectedError): WitnessExpectation => ({ expectedError })),
);

const FORBIDDEN_STATUSES = new Set<unknown>(["Timeout", "Killed"]);

describe("Property 22: A witness timeout is a difference, not a kill", () => {
  it("5.16 a mutated timeout against a non-timeout original is different", () => {
    fc.assert(
      fc.property(nonTimeoutOutcome, timeoutOutcome, (original, mutated) => {
        return compareOutcomes(original, mutated) === "different";
      }),
    );
  });

  it("5.16 a timeout on the original against a non-timeout mutant is different", () => {
    fc.assert(
      fc.property(timeoutOutcome, nonTimeoutOutcome, (original, mutated) => {
        return compareOutcomes(original, mutated) === "different";
      }),
    );
  });

  it("5.6 value outcomes with equal JSON form are the same, ignoring key order", () => {
    fc.assert(
      fc.property(jsonValue, (value) => {
        return (
          compareOutcomes(
            { kind: "value", value },
            { kind: "value", value: reorderKeys(value) },
          ) === "same"
        );
      }),
    );
  });

  it("5.6 value outcomes that differ only in negative zero are the same", () => {
    fc.assert(
      fc.property(jsonValue, (value) => {
        return (
          compareOutcomes(
            { kind: "value", value },
            { kind: "value", value: negateZeros(value) },
          ) === "same"
        );
      }),
    );
  });

  it("5.7 error outcomes with the same class name are the same", () => {
    fc.assert(
      fc.property(className, (name) => {
        return (
          compareOutcomes(
            { kind: "error", className: name },
            { kind: "error", className: name },
          ) === "same"
        );
      }),
    );
  });

  it("5.7 every outcome is the same as itself", () => {
    fc.assert(fc.property(anyOutcome, (outcome) => compareOutcomes(outcome, outcome) === "same"));
  });

  it("5.8 outcomes of different kinds are different", () => {
    fc.assert(
      fc.property(anyOutcome, anyOutcome, (original, mutated) => {
        if (original.kind === mutated.kind) return true;
        return compareOutcomes(original, mutated) === "different";
      }),
    );
  });

  it("5.11 a timeout or no-outcome never matches any expectation", () => {
    fc.assert(
      fc.property(expectation, unmatchableOutcome, (expected, actual) => {
        return matchesExpectation(expected, actual) === false;
      }),
    );
  });

  it("5.12 a timeout or no-outcome is a mismatch for compareWitnessOutcome", () => {
    fc.assert(
      fc.property(expectation, unmatchableOutcome, (expected, actual) => {
        return compareWitnessOutcome(expected, actual) === "mismatch";
      }),
    );
  });

  it("5.11 an expected value matches an observed value of equal JSON form", () => {
    fc.assert(
      fc.property(jsonValue, (value) => {
        return matchesExpectation(
          { expected: value },
          { kind: "value", value: reorderKeys(negateZeros(value)) },
        );
      }),
    );
  });

  it("5.16 no function of the witness stage returns the status Timeout or Killed", () => {
    fc.assert(
      fc.property(expectation, anyOutcome, anyOutcome, (expected, original, mutated) => {
        const results: unknown[] = [
          compareOutcomes(original, mutated),
          compareWitnessOutcome(expected, mutated),
          matchesExpectation(expected, mutated),
        ];
        return results.every((result) => !FORBIDDEN_STATUSES.has(result));
      }),
    );
  });
});
