// Property 15: One creature per change. Validates: Requirements 8.15
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  buildMutationReport,
  type ReportMutantInput,
  type SpecReportMutantInput,
} from "../../src/core/report.js";
import type { CriterionId, MutantId, MutantStatus } from "../../src/core/types.js";

const STATUSES: MutantStatus[] = [
  "Killed",
  "Survived",
  "Timeout",
  "Ghost",
  "InvalidWitness",
  "CompileError",
  "NotApplicable",
];

const locationArb = fc
  .record({
    line: fc.integer({ min: 1, max: 50 }),
    column: fc.integer({ min: 1, max: 80 }),
    dLine: fc.integer({ min: 0, max: 3 }),
    dCol: fc.integer({ min: 1, max: 20 }),
  })
  .map(({ line, column, dLine, dCol }) => ({
    start: { line, column },
    end: { line: line + dLine, column: column + dCol },
  }));

const changeArb = fc.record({
  file: fc.constantFrom("src/a.ts", "src/b.ts", "src/c.ts"),
  location: locationArb,
  replacement: fc.string({ maxLength: 8 }),
});

const pairArb = fc.record({
  change: changeArb,
  specStatus: fc.constantFrom(...STATUSES),
  mechStatus: fc.constantFrom(...STATUSES),
  requirement: fc.constantFrom("1.1", "2.3", "8.15").map((s) => s as CriterionId),
});

describe("Property 15: One creature per change", () => {
  it("8.15 a Spec_Mutant and a Mechanical_Mutant making the same change yield exactly one mutant: the Spec_Mutant", () => {
    fc.assert(
      fc.property(fc.array(pairArb, { maxLength: 10 }), (pairs) => {
        // Make every pair's change distinct so that only the intended pairs collide.
        const seen = new Set<string>();
        const unique = pairs.filter((p) => {
          const key = JSON.stringify(p.change);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        const spec: SpecReportMutantInput[] = unique.map((p, i) => ({
          ...p.change,
          id: `oath-${p.requirement}-s${i}` as MutantId,
          status: p.specStatus,
          requirement: p.requirement,
        }));
        const mechanical: ReportMutantInput[] = unique.map((p, i) => ({
          ...p.change,
          id: `mech-${i}` as MutantId,
          status: p.mechStatus,
        }));
        const files = Object.fromEntries(
          ["src/a.ts", "src/b.ts", "src/c.ts"].map((f) => [
            f,
            { language: "typescript", source: "" },
          ]),
        );

        const report = buildMutationReport({ files, mechanical, spec });
        const all = Object.values(report.files).flatMap((f) => f.mutants);

        expect(all).toHaveLength(unique.length);
        expect(all.some((m) => m.id.startsWith("mech-"))).toBe(false);
        for (const [i, p] of unique.entries()) {
          const matches = (report.files[p.change.file]?.mutants ?? []).filter(
            (m) =>
              m.location.start.line === p.change.location.start.line &&
              m.location.start.column === p.change.location.start.column &&
              m.location.end.line === p.change.location.end.line &&
              m.location.end.column === p.change.location.end.column &&
              m.replacement === p.change.replacement,
          );
          expect(matches).toHaveLength(1);
          expect(matches[0]?.id).toBe(`oath-${p.requirement}-s${i}`);
          expect(matches[0]?.requirement).toBe(p.requirement);
          expect(matches[0]?.species).toBe("Oathbreaker");
        }
      }),
    );
  });
});
