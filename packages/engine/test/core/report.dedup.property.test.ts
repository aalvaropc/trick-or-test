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

const FILES = ["src/a.ts", "src/b.ts", "src/c.ts"];

type Change = {
  file: string;
  location: { start: { line: number; column: number }; end: { line: number; column: number } };
  replacement: string;
};

const changeKey = (c: Change): string =>
  JSON.stringify([c.file, c.location.start, c.location.end, c.replacement]);

const VARIATIONS = ["end", "start", "file", "replacement"] as const;

function vary(c: Change, how: (typeof VARIATIONS)[number]): Change {
  switch (how) {
    case "end":
      return {
        ...c,
        location: { ...c.location, end: { ...c.location.end, column: c.location.end.column + 1 } },
      };
    case "start":
      return {
        ...c,
        location: {
          ...c.location,
          start: { ...c.location.start, column: c.location.start.column + 100 },
        },
      };
    case "file":
      return { ...c, file: FILES[(FILES.indexOf(c.file) + 1) % FILES.length] as string };
    case "replacement":
      return { ...c, replacement: `${c.replacement}x` };
  }
}

const mixedArb = fc.array(
  fc.record({
    change: changeArb,
    hasTwin: fc.boolean(),
    variation: fc.option(fc.constantFrom(...VARIATIONS), { nil: undefined }),
    specStatus: fc.constantFrom(...STATUSES),
    mechStatus: fc.constantFrom(...STATUSES),
  }),
  { maxLength: 10 },
);

describe("Property 15: One creature per change", () => {
  it("8.15 a Spec_Mutant without a twin is always kept and a Mechanical_Mutant differing in file, span start, span end or replacement is always kept", () => {
    fc.assert(
      fc.property(mixedArb, (items) => {
        const specKeys = new Set<string>();
        const unique = items.filter((p) => {
          const key = changeKey(p.change);
          if (specKeys.has(key)) return false;
          specKeys.add(key);
          return true;
        });

        const spec: SpecReportMutantInput[] = unique.map((p, i) => ({
          ...p.change,
          id: `oath-1.1-s${i}` as MutantId,
          status: p.specStatus,
          requirement: "1.1" as CriterionId,
        }));
        const mechanical: ReportMutantInput[] = [];
        const mechKeys = new Set<string>();
        const keptMechIds: string[] = [];
        for (const [i, p] of unique.entries()) {
          if (p.hasTwin) {
            mechanical.push({
              ...p.change,
              id: `mech-twin-${i}` as MutantId,
              status: p.mechStatus,
            });
          }
          if (p.variation !== undefined) {
            const changed = vary(p.change, p.variation);
            const key = changeKey(changed);
            if (
              specKeys.has(key) ||
              mechKeys.has(key) ||
              (p.hasTwin && key === changeKey(p.change))
            )
              continue;
            mechKeys.add(key);
            const id = `mech-diff-${i}`;
            keptMechIds.push(id);
            mechanical.push({ ...changed, id: id as MutantId, status: p.mechStatus });
          }
        }
        const files = Object.fromEntries(
          FILES.map((f) => [f, { language: "typescript", source: "" }]),
        );

        const report = buildMutationReport({ files, mechanical, spec });
        const ids = new Set(
          Object.values(report.files).flatMap((f) => f.mutants.map((m) => m.id as string)),
        );

        for (const [i] of unique.entries()) expect(ids.has(`oath-1.1-s${i}`)).toBe(true);
        for (const id of keptMechIds) expect(ids.has(id)).toBe(true);
        for (const [i, p] of unique.entries()) {
          if (p.hasTwin) expect(ids.has(`mech-twin-${i}`)).toBe(false);
        }
        expect(ids.size).toBe(unique.length + keptMechIds.length);
      }),
    );
  });

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
