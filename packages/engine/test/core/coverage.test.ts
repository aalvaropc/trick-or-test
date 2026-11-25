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

const crit = (id: string): Criterion => {
  const [r = "0", c = "0"] = id.split(".");
  return {
    id: id as CriterionId,
    requirement: Number(r),
    criterion: Number(c),
    text: "t",
    line: 1,
  };
};
let n = 0;
const mutant = (status: MutantStatus, requirement?: string): MutantResult => ({
  id: `m${n++}` as MutantId,
  species: "Unclassified",
  status,
  ...(requirement === undefined ? {} : { requirement: requirement as CriterionId }),
  killingTests: [],
});
const skip = (requirement: string, reason: string): SkipEntry => ({
  requirement: requirement as CriterionId,
  reason,
});
const statusOf = (r: ReturnType<typeof computeCoverage>, id: string) =>
  r.coverage.find((c) => c.criterion === id);

describe("computeCoverage", () => {
  it("7.1 guarded when every valid mutant is Killed", () => {
    const r = computeCoverage(
      [crit("1.1")],
      [mutant("Killed", "1.1"), mutant("Killed", "1.1")],
      [],
    );
    expect(r.coverage).toEqual([{ criterion: "1.1", status: "guarded" }]);
  });

  it("7.1 all-Timeout criterion is guarded", () => {
    const r = computeCoverage([crit("1.1")], [mutant("Timeout", "1.1")], []);
    expect(statusOf(r, "1.1")?.status).toBe("guarded");
    expect(r.survivingSpecMutants).toBe(0);
  });

  it("7.2 unguarded when a mutant survived, mixed with Killed", () => {
    const r = computeCoverage(
      [crit("2.1")],
      [mutant("Killed", "2.1"), mutant("Survived", "2.1"), mutant("Timeout", "2.1")],
      [],
    );
    expect(statusOf(r, "2.1")?.status).toBe("unguarded");
    expect(r.survivingSpecMutants).toBe(1);
  });

  it("7.3 unattacked with no mutants and no skip entry", () => {
    const r = computeCoverage([crit("3.1")], [], []);
    expect(r.coverage).toEqual([{ criterion: "3.1", status: "unattacked" }]);
  });

  it("7.6 criterion whose only mutants are Ghost or InvalidWitness is unattacked", () => {
    const r = computeCoverage(
      [crit("3.2")],
      [
        mutant("Ghost", "3.2"),
        mutant("InvalidWitness", "3.2"),
        mutant("CompileError", "3.2"),
        mutant("NotApplicable", "3.2"),
      ],
      [],
    );
    expect(statusOf(r, "3.2")?.status).toBe("unattacked");
    expect(r.survivingSpecMutants).toBe(0);
  });

  it("7.4 skipped carries the reason", () => {
    const r = computeCoverage([crit("4.1")], [], [skip("4.1", "needs network")]);
    expect(r.coverage).toEqual([{ criterion: "4.1", status: "skipped", reason: "needs network" }]);
  });

  it("7.5 skip entry is ignored when the criterion has a valid mutant", () => {
    const r = computeCoverage([crit("4.2")], [mutant("Killed", "4.2")], [skip("4.2", "why")]);
    expect(r.coverage).toEqual([{ criterion: "4.2", status: "guarded" }]);
  });

  it("7.5 skip entry applies when the only mutants are invalid", () => {
    const r = computeCoverage([crit("4.3")], [mutant("Ghost", "4.3")], [skip("4.3", "why")]);
    expect(statusOf(r, "4.3")?.status).toBe("skipped");
  });

  it("7.8 assigns exactly one status per criterion in input order", () => {
    const criteria = [crit("1.1"), crit("1.2"), crit("1.3"), crit("1.4")];
    const r = computeCoverage(
      criteria,
      [mutant("Killed", "1.1"), mutant("Survived", "1.2")],
      [skip("1.4", "x")],
    );
    expect(r.coverage.map((c) => [c.criterion, c.status])).toEqual([
      ["1.1", "guarded"],
      ["1.2", "unguarded"],
      ["1.3", "unattacked"],
      ["1.4", "skipped"],
    ]);
  });

  it("7.9 strays are counted apart from the headline", () => {
    const r = computeCoverage(
      [crit("5.1")],
      [mutant("Survived"), mutant("Survived"), mutant("Killed"), mutant("Survived", "5.1")],
      [],
    );
    expect(r.strays).toBe(3);
    expect(r.survivingSpecMutants).toBe(1);
    expect(statusOf(r, "5.1")?.status).toBe("unguarded");
  });

  it("7.10 headline counts only surviving Spec_Mutants", () => {
    const r = computeCoverage(
      [crit("6.1"), crit("6.2")],
      [mutant("Survived", "6.1"), mutant("Survived", "6.2"), mutant("Killed", "6.2")],
      [],
    );
    expect(r.survivingSpecMutants).toBe(2);
  });
});
