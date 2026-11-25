// Property 6: Deterministic ids. Validates: Requirements 4.5, 8.7, 8.13
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computeMutantId } from "../../src/core/mutant-id.js";
import { assignOccurrenceIndexes } from "../../src/core/occurrence.js";
import {
  buildMutationReport,
  type ReportInput,
  type ReportMutantInput,
  type SpecReportMutantInput,
} from "../../src/core/report.js";
import type { CriterionId, MutantId } from "../../src/core/types.js";

type Mechanical = { kind: "mechanical"; file: string; original: string; replacement: string };
type Spec = { kind: "spec"; id: string; file: string; original: string; replacement: string };
type Entry = Mechanical | Spec;

const short = fc.string({ maxLength: 8 });
const mechanical: fc.Arbitrary<Mechanical> = fc.record({
  kind: fc.constant("mechanical" as const),
  file: short,
  original: short,
  replacement: short,
});
const spec: fc.Arbitrary<Spec> = fc.record({
  kind: fc.constant("spec" as const),
  id: fc
    .tuple(
      fc.integer({ min: 1, max: 9 }),
      fc.integer({ min: 1, max: 9 }),
      fc.stringMatching(/^[a-z]{1,6}$/),
    )
    .map(([r, c, slug]) => `oath-${r}.${c}-${slug}`),
  file: short,
  original: short,
  replacement: short,
});

const idOf = (entry: Entry): string =>
  entry.kind === "spec"
    ? entry.id
    : computeMutantId(entry.file, entry.original, entry.replacement, 0);

// A list together with a permutation of the same elements.
const withPermutation = <T>(entries: fc.Arbitrary<T[]>) =>
  entries.chain((list) =>
    fc
      .shuffledSubarray(
        list.map((_, i) => i),
        { minLength: list.length, maxLength: list.length },
      )
      .map((order) => ({ list, shuffled: order.map((i) => list[i] as T) })),
  );

type Located = {
  file: string;
  original: string;
  replacement: string;
  line: number;
  column: number;
};

// Mutants drawn from a few shared (file, original, replacement) groups, all at distinct locations.
const located: fc.Arbitrary<Located[]> = fc
  .uniqueArray(fc.tuple(fc.integer({ min: 1, max: 40 }), fc.integer({ min: 1, max: 20 })), {
    minLength: 1,
    maxLength: 12,
    selector: ([line, column]) => `${line}:${column}`,
  })
  .chain((locs) =>
    fc
      .array(
        fc.record({
          file: fc.constantFrom("a.ts", "b.ts"),
          original: fc.constantFrom("+", "<"),
          replacement: fc.constantFrom("-", ">"),
        }),
        { minLength: locs.length, maxLength: locs.length },
      )
      .map((groups) =>
        locs.map(([line, column], i) => ({
          ...(groups[i] as Omit<Located, "line" | "column">),
          line,
          column,
        })),
      ),
  );

const groupKey = (m: Located): string => JSON.stringify([m.file, m.original, m.replacement]);

const idsOf = (list: Located[]): string[] => {
  const indexes = assignOccurrenceIndexes(list);
  return list.map((m, i) =>
    computeMutantId(m.file, m.original, m.replacement, indexes[i] as number),
  );
};

// Report inputs over two files with a small span space, so mutants share start positions and
// some Mechanical_Mutants make the same change as a Spec_Mutant. Ids are unique per run, as the
// engine guarantees.
const reportFiles: ReportInput["files"] = {
  "src/a.ts": { language: "typescript", source: "a + b" },
  "src/b.ts": { language: "typescript", source: "c < d" },
};
const reportBase = fc.record({
  file: fc.constantFrom("src/a.ts", "src/b.ts"),
  location: fc.record({
    start: fc.record({
      line: fc.integer({ min: 1, max: 3 }),
      column: fc.integer({ min: 1, max: 3 }),
    }),
    end: fc.record({ line: fc.constant(4), column: fc.integer({ min: 1, max: 2 }) }),
  }),
  replacement: fc.constantFrom("-", ">"),
  status: fc.constantFrom(
    "Killed" as const,
    "Survived" as const,
    "Timeout" as const,
    "Ghost" as const,
    "CompileError" as const,
  ),
});
const reportMechanical: fc.Arbitrary<ReportMutantInput[]> = fc
  .array(reportBase, { maxLength: 10 })
  .map((list) => list.map((m, i) => ({ ...m, id: `mech-${i}` as MutantId })));
const reportSpec: fc.Arbitrary<SpecReportMutantInput[]> = fc
  .array(reportBase, { maxLength: 6 })
  .map((list) =>
    list.map((m, i) => ({
      ...m,
      id: `oath-1.${i + 1}-spec` as MutantId,
      requirement: `1.${i + 1}` as CriterionId,
    })),
  );

describe("Property 6: Deterministic ids", () => {
  it("8.7 mutants sharing file, original and replacement at different locations get different ids", () => {
    fc.assert(
      fc.property(located, (list) => {
        const ids = idsOf(list);
        expect(new Set(ids).size).toBe(list.length);
        for (let i = 0; i < list.length; i++) {
          for (let j = i + 1; j < list.length; j++) {
            if (groupKey(list[i] as Located) === groupKey(list[j] as Located)) {
              expect(ids[i]).not.toBe(ids[j]);
            }
          }
        }
      }),
    );
  });

  it("8.13 moving unrelated lines without reordering a group changes no id", () => {
    fc.assert(
      fc.property(
        located,
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 1, max: 100 }),
        (list, pivot, shift) => {
          const moved = list.map((m) => (m.line >= pivot ? { ...m, line: m.line + shift } : m));
          expect(idsOf(moved)).toEqual(idsOf(list));
        },
      ),
    );
  });

  it("8.7 a mechanical id depends only on file, original text and replacement", () => {
    fc.assert(
      fc.property(mechanical, mechanical, (a, b) => {
        const same =
          a.file === b.file && a.original === b.original && a.replacement === b.replacement;
        const idA = computeMutantId(a.file, a.original, a.replacement, 0);
        const idB = computeMutantId(b.file, b.original, b.replacement, 0);
        expect(idA === idB).toBe(same);
        expect(computeMutantId(a.file, a.original, a.replacement, 0)).toBe(idA);
      }),
    );
  });

  it("4.5 a spec mutant keeps the id from its file in a mixed list", () => {
    fc.assert(
      fc.property(fc.array(fc.oneof(mechanical, spec), { maxLength: 12 }), (list) => {
        for (const entry of list) {
          if (entry.kind === "spec") expect(idOf(entry)).toBe(entry.id);
          else
            expect(idOf(entry)).toBe(
              computeMutantId(entry.file, entry.original, entry.replacement, 0),
            );
        }
      }),
    );
  });

  it("8.7 shuffling the list changes no id", () => {
    fc.assert(
      fc.property(
        withPermutation(fc.array(fc.oneof(mechanical, spec), { maxLength: 12 })),
        ({ list, shuffled }) => {
          const byEntry = new Map<Entry, MutantId>(list.map((e) => [e, idOf(e) as MutantId]));
          for (const entry of shuffled) expect(idOf(entry)).toBe(byEntry.get(entry));
        },
      ),
    );
  });

  it("8.13 shuffling the input lists of buildMutationReport gives an equal report", () => {
    fc.assert(
      fc.property(withPermutation(reportMechanical), withPermutation(reportSpec), (mech, specs) => {
        const original = buildMutationReport({
          files: reportFiles,
          mechanical: mech.list,
          spec: specs.list,
        });
        const shuffled = buildMutationReport({
          files: reportFiles,
          mechanical: mech.shuffled,
          spec: specs.shuffled,
        });
        expect(shuffled).toEqual(original);
        expect(JSON.stringify(shuffled)).toBe(JSON.stringify(original));
      }),
    );
  });
});
