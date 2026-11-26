import { describe, expect, it } from "vitest";
import { attachClaims, computeClaimOutcome } from "../../src/core/claims.js";
import type {
  BaselineTest,
  Criterion,
  CriterionId,
  MutantId,
  MutantResult,
  MutantStatus,
  TestId,
} from "../../src/core/types.js";

function criterion(requirement: number, index: number): Criterion {
  return {
    id: `${requirement}.${index}` as CriterionId,
    requirement,
    criterion: index,
    text: `text ${requirement}.${index}`,
    line: requirement * 10 + index,
  };
}

const criteria: Criterion[] = [criterion(1, 1), criterion(2, 1), criterion(3, 1), criterion(4, 1)];

const T = (name: string) => `test/a.test.ts::${name}` as TestId;
const mine = T("mine");
const other = T("other");

let counter = 0;
function mutant(
  requirement: string | undefined,
  status: MutantStatus,
  killingTests: TestId[] = [],
): MutantResult {
  counter += 1;
  return {
    id: `m-${counter}` as MutantId,
    species: requirement === undefined ? "Unclassified" : "Oathbreaker",
    status,
    ...(requirement === undefined ? {} : { requirement: requirement as CriterionId }),
    killingTests,
  };
}

describe("computeClaimOutcome", () => {
  it("11.11 held when the test is among the killing tests of every valid Spec_Mutant", () => {
    const results = [mutant("1.1", "Killed", [mine]), mutant("1.1", "Killed", [other, mine])];
    expect(computeClaimOutcome(mine, "1.1", criteria, results)).toEqual({
      criterion: "1.1",
      outcome: "held",
    });
  });

  it("11.11 not-held with otherTestsKilledAll set when another test killed every valid Spec_Mutant", () => {
    const results = [mutant("1.1", "Killed", [mine, other]), mutant("1.1", "Killed", [other])];
    expect(computeClaimOutcome(mine, "1.1", criteria, results)).toEqual({
      criterion: "1.1",
      outcome: "not-held",
      otherTestsKilledAll: true,
    });
  });

  it("11.11 not-held without otherTestsKilledAll when one Spec_Mutant survives", () => {
    const results = [mutant("1.1", "Killed", [other]), mutant("1.1", "Survived")];
    expect(computeClaimOutcome(mine, "1.1", criteria, results)).toEqual({
      criterion: "1.1",
      outcome: "not-held",
      otherTestsKilledAll: false,
    });
  });

  it("11.11 a Timeout mutant counts as killed by others", () => {
    const results = [mutant("1.1", "Killed", [other]), mutant("1.1", "Timeout")];
    expect(computeClaimOutcome(mine, "1.1", criteria, results)).toEqual({
      criterion: "1.1",
      outcome: "not-held",
      otherTestsKilledAll: true,
    });
  });

  it("11.11 a Timeout mutant is not killed by this test", () => {
    const results = [mutant("1.1", "Killed", [mine]), mutant("1.1", "Timeout")];
    expect(computeClaimOutcome(mine, "1.1", criteria, results).outcome).toBe("not-held");
  });

  it("11.11 unchecked for a criterion with no Spec_Mutant", () => {
    expect(computeClaimOutcome(mine, "2.1", criteria, [mutant("1.1", "Killed", [mine])])).toEqual({
      criterion: "2.1",
      outcome: "unchecked",
    });
  });

  it("11.11 unchecked for a skipped criterion, which has no valid Spec_Mutant", () => {
    // A skipped criterion appears in the results with no mutant at all.
    expect(computeClaimOutcome(mine, "3.1", criteria, []).outcome).toBe("unchecked");
  });

  it("7.6 unchecked when every Spec_Mutant is Ghost, InvalidWitness, CompileError or NotApplicable", () => {
    const results = [
      mutant("1.1", "Ghost"),
      mutant("1.1", "InvalidWitness"),
      mutant("1.1", "CompileError"),
      mutant("1.1", "NotApplicable"),
    ];
    expect(computeClaimOutcome(mine, "1.1", criteria, results).outcome).toBe("unchecked");
  });

  it("7.6 invalid Spec_Mutants do not change a held outcome", () => {
    const results = [mutant("1.1", "Killed", [mine]), mutant("1.1", "Ghost")];
    expect(computeClaimOutcome(mine, "1.1", criteria, results).outcome).toBe("held");
  });

  it("11.11 unknown-criterion for an id the spec lacks", () => {
    expect(computeClaimOutcome(mine, "9.9", criteria, [])).toEqual({
      criterion: "9.9",
      outcome: "unknown-criterion",
    });
  });

  it("11.11 strays change nothing", () => {
    const base = [mutant("1.1", "Killed", [mine])];
    const withStray = [
      ...base,
      mutant(undefined, "Survived"),
      mutant(undefined, "Killed", [other]),
    ];
    expect(computeClaimOutcome(mine, "1.1", criteria, withStray)).toEqual(
      computeClaimOutcome(mine, "1.1", criteria, base),
    );
  });
});

describe("attachClaims", () => {
  const results = [
    mutant("1.1", "Killed", [mine]),
    mutant("2.1", "Killed", [other]),
    mutant("3.1", "Killed", [other]),
    mutant("3.1", "Survived"),
  ];
  const tests: BaselineTest[] = [
    { id: mine, kind: "example" },
    { id: other, kind: "property" },
    { id: T("none"), kind: "example" },
  ];
  const ids = new Map<TestId, string[]>([
    [mine, ["1.1", "2.1", "3.1", "4.1", "9.9"]],
    [other, ["2.1"]],
  ]);

  it("11.12 claimCounts sums to the total and the notHeld sub-counts sum to notHeld", () => {
    const { baselineTests, claimCounts } = attachClaims(tests, ids, criteria, results);
    expect(claimCounts).toEqual({
      total: 6,
      held: 2,
      notHeld: 2,
      unchecked: 1,
      unknownCriterion: 1,
      notHeldOthersKilledAll: 1,
      notHeldOthersDidNot: 1,
    });
    const claims = baselineTests.flatMap((t) => t.claims ?? []);
    expect(claims.length).toBe(claimCounts.total);
    expect(
      claimCounts.held + claimCounts.notHeld + claimCounts.unchecked + claimCounts.unknownCriterion,
    ).toBe(claimCounts.total);
    expect(claimCounts.notHeldOthersKilledAll + claimCounts.notHeldOthersDidNot).toBe(
      claimCounts.notHeld,
    );
  });

  it("11.12 claims keep the order of the ids and sit on the right test", () => {
    const { baselineTests } = attachClaims(tests, ids, criteria, results);
    expect(baselineTests[0]?.claims?.map((c) => c.criterion)).toEqual([
      "1.1",
      "2.1",
      "3.1",
      "4.1",
      "9.9",
    ]);
    expect(baselineTests[1]?.claims).toEqual([{ criterion: "2.1", outcome: "held" }]);
  });

  it("11.12 a test with no claim has no claims key", () => {
    const { baselineTests } = attachClaims(tests, new Map([[T("none"), []]]), criteria, results);
    for (const entry of baselineTests) expect("claims" in entry).toBe(false);
  });

  it("11.12 no claims at all gives zero counts", () => {
    const { claimCounts } = attachClaims(tests, new Map(), criteria, results);
    expect(claimCounts).toEqual({
      total: 0,
      held: 0,
      notHeld: 0,
      unchecked: 0,
      unknownCriterion: 0,
      notHeldOthersKilledAll: 0,
      notHeldOthersDidNot: 0,
    });
  });
});
