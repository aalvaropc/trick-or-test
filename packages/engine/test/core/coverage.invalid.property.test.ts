// Property 3: No invalid mutant is counted. Validates: Requirements 7.6, 7.7
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computeCoverage } from "../../src/core/coverage.js";
import type {
  Criterion,
  CriterionId,
  MutantId,
  MutantResult,
  MutantStatus,
} from "../../src/core/types.js";

const INVALID: MutantStatus[] = ["Ghost", "InvalidWitness", "CompileError", "NotApplicable"];
const VALID: MutantStatus[] = ["Killed", "Survived", "Timeout"];

const criteria: Criterion[] = ["1.1", "1.2", "2.1", "2.2"].map((id) => {
  const [r, c] = id.split(".").map(Number) as [number, number];
  return { id: id as CriterionId, requirement: r, criterion: c, text: id, line: 1 };
});

const mutantResult = (statuses: MutantStatus[]) =>
  fc
    .array(
      fc.record({
        status: fc.constantFrom(...statuses),
        requirement: fc.option(fc.constantFrom(...criteria.map((c) => c.id)), { nil: undefined }),
      }),
      { maxLength: 20 },
    )
    .map((items) =>
      items.map(
        (item, i): MutantResult => ({
          id: `m${i}` as MutantId,
          species: "Unclassified",
          status: item.status,
          ...(item.requirement === undefined ? {} : { requirement: item.requirement }),
          killingTests: [],
        }),
      ),
    );

describe("Property 3: No invalid mutant is counted", () => {
  it("7.6 invalid Spec_Mutants never add to the surviving count and never change coverage", () => {
    fc.assert(
      fc.property(mutantResult(VALID), mutantResult(INVALID), (valid, invalid) => {
        // Keep ids unique across both lists.
        const extra = invalid.map((m) => ({ ...m, id: `x${m.id}` as MutantId }));
        const base = computeCoverage(criteria, valid, []);
        const mixed = computeCoverage(criteria, [...valid, ...extra], []);
        const expected = valid.filter(
          (m) => m.requirement !== undefined && m.status === "Survived",
        );
        expect(base.survivingSpecMutants).toBe(expected.length);
        expect(mixed.survivingSpecMutants).toBe(base.survivingSpecMutants);
        expect(mixed.coverage).toEqual(base.coverage);
      }),
    );
  });

  it("7.7 a criterion whose only Spec_Mutants are invalid is neither guarded nor unguarded", () => {
    fc.assert(
      fc.property(mutantResult(INVALID), (invalid) => {
        const summary = computeCoverage(criteria, invalid, []);
        expect(summary.survivingSpecMutants).toBe(0);
        for (const entry of summary.coverage) expect(entry.status).toBe("unattacked");
      }),
    );
  });
});
