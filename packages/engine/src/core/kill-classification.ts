import type { TestKind } from "./test-classification.js";
import type { KillClass } from "./types.js";

/** A killing test with its kind (Requirements 6.3-6.5). */
export type ClassifiedTest = { kind: TestKind };

/**
 * Kill class of a mutant from the kinds of the tests that killed it
 * (Requirements 6.6-6.9). An empty list is `unattributed`.
 */
export const computeKillClass = (killingTests: readonly ClassifiedTest[]): KillClass => {
  const hasExample = killingTests.some((t) => t.kind === "example");
  const hasProperty = killingTests.some((t) => t.kind === "property");
  if (hasExample && hasProperty) return "both";
  if (hasExample) return "examples-only";
  if (hasProperty) return "properties-only";
  return "unattributed";
};
