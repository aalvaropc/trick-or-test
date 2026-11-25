// Property 10: Single-run attribution. Validates: Requirements 6.1, 6.2
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ClassifiedTest } from "../../src/core/kill-classification.js";
import { computeKillClass } from "../../src/core/kill-classification.js";
import type { KillClass } from "../../src/core/types.js";

const testArb: fc.Arbitrary<ClassifiedTest> = fc.record({
  kind: fc.constantFrom("example" as const, "property" as const),
});

/** Class derived from a hypothetical example-only run plus a property-only run. */
const classFromSeparateRuns = (tests: readonly ClassifiedTest[]): KillClass => {
  const exampleRun = tests.filter((t) => t.kind === "example");
  const propertyRun = tests.filter((t) => t.kind === "property");
  const killedByExamples = computeKillClass(exampleRun) === "examples-only";
  const killedByProperties = computeKillClass(propertyRun) === "properties-only";
  if (killedByExamples && killedByProperties) return "both";
  if (killedByExamples) return "examples-only";
  if (killedByProperties) return "properties-only";
  return "unattributed";
};

describe("kill-classification single-run property", () => {
  it("6.1, 6.2 the combined-run class equals the class from separate example-only and property-only runs", () => {
    fc.assert(
      fc.property(fc.array(testArb, { maxLength: 10 }), (tests) => {
        expect(computeKillClass(tests)).toBe(classFromSeparateRuns(tests));
      }),
    );
  });
});
