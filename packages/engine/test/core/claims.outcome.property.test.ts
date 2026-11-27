// Property 28: Claim outcomes and counts. Validates: Requirements 7.6, 11.11, 11.12, 11.15
import fc from "fast-check";
import { describe, it } from "vitest";
import { attachClaims } from "../../src/core/claims.js";
import type {
  BaselineTest,
  Criterion,
  CriterionId,
  MutantId,
  MutantResult,
  MutantStatus,
  TestId,
} from "../../src/core/types.js";

// ---------- generators ----------

const CRITERION_IDS = ["1.1", "1.2", "2.1", "2.2", "3.1"];
const UNKNOWN_IDS = ["9.9", "4.1"];
const TEST_IDS = ["test/a.test.ts::t1", "test/a.test.ts::t2", "test/b.test.ts::t3"] as TestId[];
const STATUSES: MutantStatus[] = [
  "Killed",
  "Survived",
  "Timeout",
  "Ghost",
  "InvalidWitness",
  "CompileError",
  "NotApplicable",
];
const VALID: MutantStatus[] = ["Killed", "Survived", "Timeout"];

function makeCriteria(ids: string[]): Criterion[] {
  return ids.map((id, index) => {
    const [requirement, criterion] = id.split(".").map(Number) as [number, number];
    return { id: id as CriterionId, requirement, criterion, text: `text ${id}`, line: index + 1 };
  });
}

/** Every criterion of the spec, a subset of them, so some criteria have no mutant at all. */
const criteriaArb = fc.subarray(CRITERION_IDS, { minLength: 1 }).map((ids) => makeCriteria(ids));

type RawMutant = {
  requirement: string | undefined;
  status: MutantStatus;
  killers: TestId[];
};

const rawMutantArb: fc.Arbitrary<RawMutant> = fc.record({
  // undefined is a stray; the unknown ids are Spec_Mutants of a criterion the spec lacks.
  requirement: fc.oneof(
    { weight: 8, arbitrary: fc.constantFrom(...CRITERION_IDS) },
    { weight: 1, arbitrary: fc.constantFrom(...UNKNOWN_IDS) },
    { weight: 2, arbitrary: fc.constant(undefined) },
  ),
  status: fc.constantFrom(...STATUSES),
  killers: fc.subarray(TEST_IDS),
});

function toResults(raws: RawMutant[]): MutantResult[] {
  return raws.map((raw, index): MutantResult => {
    const killingTests = raw.status === "Killed" ? raw.killers : [];
    return {
      id: `m-${index}` as MutantId,
      species: raw.requirement === undefined ? "Unclassified" : "Oathbreaker",
      status: raw.status,
      ...(raw.requirement === undefined ? {} : { requirement: raw.requirement as CriterionId }),
      killingTests,
    };
  });
}

const resultsArb = fc.array(rawMutantArb, { maxLength: 14 }).map(toResults);

/** Claim ids per test: some tests have none, some repeat an id, some name an unknown criterion. */
const claimIdsArb = fc.array(
  fc.array(fc.constantFrom(...CRITERION_IDS, ...UNKNOWN_IDS), { maxLength: 6 }),
  { minLength: TEST_IDS.length, maxLength: TEST_IDS.length },
);

const inputArb = fc.record({
  criteria: criteriaArb,
  results: resultsArb,
  claimIds: claimIdsArb,
});

type Input = { criteria: Criterion[]; results: MutantResult[]; claimIds: string[][] };

function run(input: Input) {
  const tests: BaselineTest[] = TEST_IDS.map((id) => ({ id, kind: "example" as const }));
  const claimIdsByTest = new Map<TestId, string[]>();
  TEST_IDS.forEach((id, index) => {
    claimIdsByTest.set(id, input.claimIds[index] ?? []);
  });
  return attachClaims(tests, claimIdsByTest, input.criteria, input.results);
}

/** The valid Spec_Mutants of one criterion, written out for the oracle. */
function validOf(criterion: string, results: MutantResult[]): MutantResult[] {
  return results.filter((r) => r.requirement === criterion && VALID.includes(r.status));
}

describe("attachClaims properties", () => {
  it("11.12 the counts sum to the total, which is the number of claims, and the not-held sub-counts sum to notHeld", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const { baselineTests, claimCounts: c } = run(input);
        const claims = baselineTests.flatMap((t) => t.claims ?? []);
        const expectedTotal = input.claimIds.reduce((sum, ids) => sum + ids.length, 0);
        return (
          c.total === claims.length &&
          c.total === expectedTotal &&
          c.held + c.notHeld + c.unchecked + c.unknownCriterion === c.total &&
          c.notHeldOthersKilledAll + c.notHeldOthersDidNot === c.notHeld &&
          c.held === claims.filter((x) => x.outcome === "held").length &&
          c.notHeld === claims.filter((x) => x.outcome === "not-held").length &&
          c.unchecked === claims.filter((x) => x.outcome === "unchecked").length &&
          c.unknownCriterion === claims.filter((x) => x.outcome === "unknown-criterion").length &&
          c.notHeldOthersKilledAll ===
            claims.filter((x) => x.outcome === "not-held" && x.otherTestsKilledAll === true).length
        );
      }),
    );
  });

  it("11.11 held, unchecked and unknown-criterion follow the valid Spec_Mutants of the criterion", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const { baselineTests } = run(input);
        return baselineTests.every((test) =>
          (test.claims ?? []).every((claim) => {
            const known = input.criteria.some((c) => c.id === claim.criterion);
            if (!known) return claim.outcome === "unknown-criterion";
            const valid = validOf(claim.criterion, input.results);
            if (valid.length === 0) return claim.outcome === "unchecked";
            const held = valid.every(
              (m) => m.status === "Killed" && m.killingTests.includes(test.id),
            );
            return (claim.outcome === "held") === held && claim.outcome !== "unchecked";
          }),
        );
      }),
    );
  });

  it("11.11 otherTestsKilledAll exists only on not-held claims and is true only when every valid Spec_Mutant is Timeout or killed by another test", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const { baselineTests } = run(input);
        return baselineTests.every((test) =>
          (test.claims ?? []).every((claim) => {
            if (claim.outcome !== "not-held") return !("otherTestsKilledAll" in claim);
            const valid = validOf(claim.criterion, input.results);
            const othersAll = valid.every(
              (m) =>
                m.status === "Timeout" ||
                (m.status === "Killed" && m.killingTests.some((id) => id !== test.id)),
            );
            return claim.otherTestsKilledAll === othersAll;
          }),
        );
      }),
    );
  });

  it("7.6 Ghost, InvalidWitness, CompileError, NotApplicable mutants and strays never change an outcome", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const onlyValid = input.results.filter(
          (r) => r.requirement !== undefined && VALID.includes(r.status),
        );
        return JSON.stringify(run(input)) === JSON.stringify(run({ ...input, results: onlyValid }));
      }),
    );
  });

  it("11.15 the outcome does not depend on the order of the mutant results", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const reversed = [...input.results].reverse();
        return JSON.stringify(run(input)) === JSON.stringify(run({ ...input, results: reversed }));
      }),
    );
  });

  it("11.12 a test with no claim has no claims key", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const { baselineTests } = run(input);
        return baselineTests.every((test, index) => {
          const ids = input.claimIds[index] ?? [];
          return ids.length === 0 ? !("claims" in test) : test.claims?.length === ids.length;
        });
      }),
    );
  });
});
