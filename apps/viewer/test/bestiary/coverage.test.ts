import type { Verdict } from "trick-or-test/report";
import { describe, expect, it } from "vitest";
import { computeCoverageView } from "../../src/bestiary/coverage.js";
import type { Mutant, RunModel } from "../../src/loader/run-model.js";

const survivor = (id: string, requirement: string): Mutant =>
  ({ id, requirement, state: "survivor" }) as unknown as Mutant;

const run = (coverage: unknown[], mutants: Mutant[] = []): RunModel =>
  ({
    report: {},
    verdict: { coverage } as unknown as Verdict,
    history: [],
    ignoredVerdictEntryCount: 0,
    mutants,
  }) as unknown as RunModel;

describe("computeCoverageView", () => {
  it("6.2 returns one entry per coverage list entry, labelled with the criterion id", () => {
    const view = computeCoverageView(
      run([
        { criterion: "1.1", status: "guarded" },
        { criterion: "1.2", status: "unattacked" },
        { criterion: "1.3", status: "weird" },
      ]),
    );
    expect(view.map((e) => e.criterion)).toEqual(["1.1", "1.2", "1.3"]);
  });

  it("6.3 reports a guarded criterion as guarded", () => {
    expect(computeCoverageView(run([{ criterion: "1.1", status: "guarded" }]))).toEqual([
      { criterion: "1.1", status: "guarded" },
    ]);
  });

  it("6.4 reports an unguarded criterion with its surviving Spec_Mutants", () => {
    const a = survivor("a", "1.1");
    const view = computeCoverageView(
      run([{ criterion: "1.1", status: "unguarded" }], [a, survivor("b", "1.2")]),
    );
    expect(view).toEqual([{ criterion: "1.1", status: "unguarded", survivors: [a] }]);
  });

  it("6.4 never reports a criterion with a surviving Spec_Mutant as guarded", () => {
    const view = computeCoverageView(
      run([{ criterion: "1.1", status: "guarded" }], [survivor("a", "1.1")]),
    );
    expect(view[0]?.status).toBe("unguarded");
  });

  it("6.5 reports an unattacked criterion", () => {
    expect(computeCoverageView(run([{ criterion: "1.1", status: "unattacked" }]))).toEqual([
      { criterion: "1.1", status: "unattacked" },
    ]);
  });

  it("6.6 reports a skipped criterion with its skip reason", () => {
    expect(
      computeCoverageView(run([{ criterion: "1.1", status: "skipped", reason: "not testable" }])),
    ).toEqual([{ criterion: "1.1", status: "skipped", reason: "not testable" }]);
  });

  it("6.7 reports an unknown status as unrecognised and keeps the remaining entries", () => {
    const view = computeCoverageView(
      run([
        { criterion: "1.1", status: "bogus" },
        { criterion: "1.2", status: "guarded" },
      ]),
    );
    expect(view).toEqual([
      { criterion: "1.1", status: "unrecognised", rawStatus: "bogus" },
      { criterion: "1.2", status: "guarded" },
    ]);
  });

  it("6.16 seal count equals coverage list length", () => {
    const coverage = [
      { criterion: "1.1", status: "guarded" },
      { criterion: "1.2", status: "unguarded" },
      { criterion: "1.3", status: "skipped", reason: "r" },
      { criterion: "1.4", status: "nope" },
    ];
    expect(computeCoverageView(run(coverage))).toHaveLength(coverage.length);
  });
});
