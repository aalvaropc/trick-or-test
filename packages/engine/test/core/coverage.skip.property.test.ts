// Property 12: Skip is not attack. Validates: Requirements 4.8, 4.9, 7.3, 7.4, 7.5
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computeCoverage } from "../../src/core/coverage.js";
import {
  checkCrossFileRules,
  type LoadedSkipEntry,
  type LoadedSpecMutant,
} from "../../src/core/spec-mutants.js";
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

const reasonArb = fc.oneof(
  fc.constant(""),
  fc.constantFrom(" ", "\t", "  \n"),
  fc.string({ minLength: 1 }),
);

const scenarioArb = fc.integer({ min: 1, max: 8 }).chain((n) => {
  const criteria: Criterion[] = Array.from({ length: n }, (_, i) => ({
    id: `${i + 1}.1` as CriterionId,
    requirement: i + 1,
    criterion: 1,
    text: `criterion ${i + 1}`,
    line: i + 1,
  }));
  const idArb = fc.constantFrom(...criteria.map((c) => c.id));
  return fc
    .record({
      mutants: fc.array(fc.record({ requirement: idArb, status: fc.constantFrom(...STATUSES) }), {
        maxLength: 15,
      }),
      skips: fc.array(fc.record({ requirement: idArb, reason: reasonArb }), { maxLength: 12 }),
    })
    .map(({ mutants, skips }) => ({ criteria, mutants, skips }));
});

describe("Property 12: Skip is not attack", () => {
  it("12.1 a criterion with a valid Spec_Mutant is never skipped, and a skip on it is a load error", () => {
    fc.assert(
      fc.property(scenarioArb, ({ criteria, mutants, skips }) => {
        const results: MutantResult[] = mutants.map((m, i) => ({
          id: `m${i}` as MutantId,
          species: "Unclassified",
          status: m.status,
          requirement: m.requirement,
          killingTests: [],
        }));
        const loadedMutants: LoadedSpecMutant[] = mutants.map((m, i) => ({
          filePath: `mutants/m${i}.json`,
          mutant: {
            id: `m${i}` as MutantId,
            requirement: m.requirement,
            file: "src/a.ts",
            original: "a",
            mutated: "b",
            why: "w",
            witness: { from: "src/a.ts", export: "f", args: [], expected: 0 },
          },
        }));
        const loadedSkips: LoadedSkipEntry[] = skips.map((entry, index) => ({
          filePath: "skip.json",
          index,
          entry: entry as SkipEntry,
        }));

        const validIds = new Set(
          results.filter((r) => VALID.has(r.status)).map((r) => r.requirement),
        );
        const attackedIds = new Set(mutants.map((m) => m.requirement));
        const { coverage } = computeCoverage(criteria, results, skips);
        for (const e of coverage) {
          if (validIds.has(e.criterion)) expect(e.status).not.toBe("skipped");
        }

        const errors = checkCrossFileRules(loadedMutants, loadedSkips, criteria);
        for (const [index, entry] of skips.entries()) {
          const flagged = (field: string) =>
            errors.some((er) => er.filePath === "skip.json" && er.field === field);
          if (entry.reason.trim() === "") expect(flagged(`${index}.reason`)).toBe(true);
          if (attackedIds.has(entry.requirement))
            expect(flagged(`${index}.requirement`)).toBe(true);
        }
      }),
    );
  });

  it("12.2 when the cross-file rules accept the skip entries, every skipped criterion has a non-empty reason", () => {
    fc.assert(
      fc.property(scenarioArb, ({ criteria, mutants, skips }) => {
        const loadedMutants: LoadedSpecMutant[] = mutants.map((m, i) => ({
          filePath: `mutants/m${i}.json`,
          mutant: {
            id: `m${i}` as MutantId,
            requirement: m.requirement,
            file: "src/a.ts",
            original: "a",
            mutated: "b",
            why: "w",
            witness: { from: "src/a.ts", export: "f", args: [], expected: 0 },
          },
        }));
        const loadedSkips: LoadedSkipEntry[] = skips.map((entry, index) => ({
          filePath: "skip.json",
          index,
          entry: entry as SkipEntry,
        }));
        const errors = checkCrossFileRules(loadedMutants, loadedSkips, criteria);
        fc.pre(errors.length === 0);

        const results: MutantResult[] = mutants.map((m, i) => ({
          id: `m${i}` as MutantId,
          species: "Unclassified",
          status: m.status,
          requirement: m.requirement,
          killingTests: [],
        }));
        const { coverage } = computeCoverage(criteria, results, skips);
        for (const e of coverage) {
          if (e.status === "skipped") {
            expect(e.reason).toBeDefined();
            expect((e.reason ?? "").trim()).not.toBe("");
          }
        }
      }),
    );
  });
});
