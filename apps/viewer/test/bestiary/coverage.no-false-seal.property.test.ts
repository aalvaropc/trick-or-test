// Feature: bestiary-viewer, Property V7: No false seal
import * as fc from "fast-check";
import type { Verdict } from "trick-or-test/report";
import { describe, it } from "vitest";
import { computeCoverageView } from "../../src/bestiary/coverage.js";
import type { Mutant, RunModel } from "../../src/loader/run-model.js";

const criterionArb = fc.constantFrom("1.1", "1.2", "2.1", "2.2", "3.1");
const statusArb = fc.constantFrom("guarded", "unguarded", "unattacked", "skipped", "bogus");
const stateArb = fc.constantFrom("survivor", "killed", "timeout");

const inputArb = fc.record({
  coverage: fc.array(fc.record({ criterion: criterionArb, status: statusArb }), { maxLength: 12 }),
  mutants: fc.array(fc.record({ requirement: criterionArb, state: stateArb }), { maxLength: 20 }),
});

describe("Property V7: No false seal", () => {
  it("never reports a criterion with a surviving Spec_Mutant as guarded", () => {
    // **Validates: Requirements 6.3, 6.4**
    fc.assert(
      fc.property(inputArb, ({ coverage, mutants }) => {
        const model = {
          report: {},
          verdict: { coverage } as unknown as Verdict,
          history: [],
          ignoredVerdictEntryCount: 0,
          mutants: mutants.map((m, i) => ({ id: `m${i}`, ...m }) as unknown as Mutant),
        } as unknown as RunModel;
        const survived = new Set<string>(
          mutants.filter((m) => m.state === "survivor").map((m) => m.requirement),
        );
        return computeCoverageView(model).every(
          (e) => !(survived.has(e.criterion) && e.status === "guarded"),
        );
      }),
    );
  });
});
