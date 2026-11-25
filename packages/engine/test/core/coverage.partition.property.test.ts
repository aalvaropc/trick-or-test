// Property 4: Coverage partition. Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.8
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computeCoverage } from "../../src/core/coverage.js";
import type {
  Criterion,
  CriterionId,
  MutantId,
  MutantResult,
  MutantStatus,
  SkipEntry,
} from "../../src/core/types.js";

const STATUSES: MutantStatus[] = [
  "Killed",
  "Survived",
  "Timeout",
  "Ghost",
  "InvalidWitness",
  "CompileError",
  "NotApplicable",
];
const VALID = new Set<MutantStatus>(["Killed", "Survived", "Timeout"]);

const criteriaArb = fc.integer({ min: 0, max: 8 }).map((n): Criterion[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${i + 1}.1` as CriterionId,
    requirement: i + 1,
    criterion: 1,
    text: `criterion ${i + 1}`,
    line: i + 1,
  })),
);

const scenarioArb = criteriaArb.chain((criteria) => {
  const ids = criteria.map((c) => c.id);
  const mutantArb = fc.record({
    status: fc.constantFrom(...STATUSES),
    requirement:
      ids.length === 0
        ? fc.constant(undefined)
        : fc.option(fc.constantFrom(...ids), { nil: undefined }),
  });
  return fc
    .tuple(
      fc.array(mutantArb, { maxLength: 25 }),
      fc.array(
        fc.tuple(fc.constantFrom(...(ids.length ? ids : ["1.1" as CriterionId])), fc.string()),
        {
          maxLength: 12,
        },
      ),
    )
    .map(([items, rawSkips]) => {
      const mutants = items.map(
        (item, i): MutantResult => ({
          id: `m${i}` as MutantId,
          species: "Unclassified",
          status: item.status,
          ...(item.requirement === undefined ? {} : { requirement: item.requirement }),
          killingTests: [],
        }),
      );
      const hasValid = new Set(
        mutants
          .filter((m) => m.requirement !== undefined && VALID.has(m.status))
          .map((m) => m.requirement),
      );
      const skips: SkipEntry[] = rawSkips
        .filter(([id]) => ids.includes(id) && !hasValid.has(id))
        .map(([requirement, reason]) => ({ requirement, reason }));
      return { criteria, mutants, skips };
    });
});

describe("Property 4: Coverage partition", () => {
  it("assigns each criterion exactly one status and the four counts sum to the criteria total", () => {
    fc.assert(
      fc.property(scenarioArb, ({ criteria, mutants, skips }) => {
        const { coverage } = computeCoverage(criteria, mutants, skips);
        expect(coverage.map((e) => e.criterion)).toEqual(criteria.map((c) => c.id));
        const counts = { guarded: 0, unguarded: 0, unattacked: 0, skipped: 0 };
        for (const e of coverage) counts[e.status]++;
        expect(counts.guarded + counts.unguarded + counts.unattacked + counts.skipped).toBe(
          criteria.length,
        );
      }),
    );
  });
});
