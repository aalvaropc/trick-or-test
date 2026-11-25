// Feature: bestiary-viewer, Property V6: Counts are conserved
import * as fc from "fast-check";
import { describe, it } from "vitest";
import {
  computeHeadlineCounts,
  computeKillClassCounts,
  computeSpeciesLegend,
  selectStrays,
} from "../../src/bestiary/counts.js";
import { computeCoverageView } from "../../src/bestiary/coverage.js";
import { buildRunModel } from "../../src/loader/run-model.js";
import type { RawRun } from "../../src/loader/types.js";
import { buildRows } from "../../src/plain-view/columns.js";

const statusArb = fc.constantFrom(
  "Survived",
  "Killed",
  "Timeout",
  "NoCoverage",
  "Ignored",
  "CompileError",
  "RuntimeError",
);
const reasonArb = fc.constantFrom(undefined, "Ghost", "InvalidWitness", "NotApplicable");
const mutatorArb = fc.constantFrom(
  "EqualityOperator",
  "ArithmeticOperator",
  "ConditionalExpression",
  "BlockStatement",
  "MethodExpression",
  "SomethingElse",
);
const criterionArb = fc.constantFrom("1.1", "1.2", "2.1", "3.4");
const killClassArb = fc.constantFrom("examples-only", "properties-only", "both", "unattributed");
const coverageStatusArb = fc.constantFrom("guarded", "unguarded", "unattacked", "skipped", "bogus");

const mutantArb = fc.record({
  status: statusArb,
  statusReason: reasonArb,
  mutatorName: mutatorArb,
  requirement: fc.option(criterionArb, { nil: undefined }),
  verdict: fc.option(
    fc.record({
      status: fc.option(statusArb, { nil: undefined }),
      killClass: fc.option(killClassArb, { nil: undefined }),
      killingTests: fc.array(fc.constantFrom("t1", "t2"), { maxLength: 2 }),
    }),
    { nil: undefined },
  ),
});

const runArb = fc.record({
  mutants: fc.array(mutantArb, { maxLength: 40 }),
  coverage: fc.array(fc.record({ criterion: criterionArb, status: coverageStatusArb }), {
    maxLength: 12,
  }),
  withVerdict: fc.boolean(),
});

describe("Property V6: Counts are conserved", () => {
  it("rows, headline, legend, kill classes and seals agree", () => {
    // **Validates: Requirements 4.11, 6.1, 6.15, 6.16, 9.2, 9.8**
    fc.assert(
      fc.property(runArb, ({ mutants, coverage, withVerdict }) => {
        const reportMutants = mutants.map((m, i) => ({
          id: `m${i}`,
          mutatorName: m.mutatorName,
          status: m.status,
          statusReason: m.statusReason,
          requirement: m.requirement,
          location: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
        }));
        const verdictMutants = mutants.flatMap((m, i) =>
          m.verdict === undefined
            ? []
            : [
                {
                  id: `m${i}`,
                  status: m.verdict.status ?? m.status,
                  killClass: m.verdict.killClass,
                  killingTests: m.verdict.killingTests,
                  requirement: m.requirement,
                },
              ],
        );
        const raw = {
          report: { files: { "a.ts": { source: "a+b", mutants: reportMutants } } },
          verdict: withVerdict ? { coverage, mutants: verdictMutants } : undefined,
          history: [],
          ignoredVerdictEntryCount: 0,
        } as unknown as RawRun;
        const model = buildRunModel(raw);
        const rows = buildRows(model);

        const counted = model.mutants.filter((m) => m.state !== "not-counted");
        const rowsIn = (label: (l: string) => boolean) => rows.filter((r) => label(r.stateLabel));
        const headline = computeHeadlineCounts(model);
        const legend = computeSpeciesLegend(model);
        const kill = computeKillClassCounts(model);
        const strays = selectStrays(model);

        const survivedRows = rowsIn((l) => l === "survived");
        const killedRows = rowsIn((l) => l.startsWith("killed"));
        const darkRows = rowsIn((l) => l === "no test runs this code");
        const ghostRows = rowsIn((l) => l === "ghost, not counted");
        const notCountedRows = rowsIn((l) => l === "not counted");

        const killedWithClass = model.mutants.filter(
          (m) => m.state === "killed" && m.verdictEntry?.killClass !== undefined,
        ).length;

        const seals = withVerdict ? computeCoverageView(model).length : 0;

        return (
          rows.length === model.mutants.length &&
          survivedRows.length + killedRows.length + darkRows.length + ghostRows.length ===
            counted.length &&
          notCountedRows.length === model.mutants.length - counted.length &&
          survivedRows.filter((r) => r.requirement !== undefined).length ===
            headline.survivingSpecMutants &&
          killedRows.filter((r) => r.requirement !== undefined).length ===
            headline.killedSpecMutants &&
          legend.reduce((sum, e) => sum + e.count, 0) === counted.length &&
          kill["examples-only"] + kill["properties-only"] + kill.both + kill.unattributed ===
            killedWithClass &&
          strays.shown.length + strays.remaining ===
            counted.filter((m) => m.requirement === undefined).length &&
          seals === (withVerdict ? coverage.length : 0)
        );
      }),
    );
  });
});
