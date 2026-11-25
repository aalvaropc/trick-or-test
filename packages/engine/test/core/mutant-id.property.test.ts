// Property 6: Deterministic ids. Validates: Requirements 4.5, 8.7, 8.13
// buildMutationReport (core/report.ts, task 3.24) does not exist yet, so report order is modelled as ordering by id on plain data.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { assignOccurrenceIndexes, computeMutantId } from "../../src/core/mutant-id.js";
import type { MutantId } from "../../src/core/types.js";

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

const reportOrder = (entries: Entry[]): string[] => entries.map(idOf).sort();

const withPermutation = (entries: fc.Arbitrary<Entry[]>) =>
  entries.chain((list) =>
    fc
      .shuffledSubarray(
        list.map((_, i) => i),
        { minLength: list.length, maxLength: list.length },
      )
      .map((order) => ({ list, shuffled: order.map((i) => list[i] as Entry) })),
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

  it("8.7 shuffling the list changes no id and not the report order", () => {
    fc.assert(
      fc.property(
        withPermutation(fc.array(fc.oneof(mechanical, spec), { maxLength: 12 })),
        ({ list, shuffled }) => {
          const byEntry = new Map<Entry, MutantId>(list.map((e) => [e, idOf(e) as MutantId]));
          for (const entry of shuffled) expect(idOf(entry)).toBe(byEntry.get(entry));
          expect(reportOrder(shuffled)).toEqual(reportOrder(list));
        },
      ),
    );
  });
});
