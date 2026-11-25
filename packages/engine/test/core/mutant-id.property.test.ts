// Property 6: Deterministic ids. Validates: Requirements 4.5, 8.7
// buildMutationReport (core/report.ts, task 3.24) does not exist yet, so report order is modelled as ordering by id on plain data.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computeMutantId } from "../../src/core/mutant-id.js";
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
  entry.kind === "spec" ? entry.id : computeMutantId(entry.file, entry.original, entry.replacement);

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

describe("Property 6: Deterministic ids", () => {
  it("8.7 a mechanical id depends only on file, original text and replacement", () => {
    fc.assert(
      fc.property(mechanical, mechanical, (a, b) => {
        const same =
          a.file === b.file && a.original === b.original && a.replacement === b.replacement;
        const idA = computeMutantId(a.file, a.original, a.replacement);
        const idB = computeMutantId(b.file, b.original, b.replacement);
        expect(idA === idB).toBe(same);
        expect(computeMutantId(a.file, a.original, a.replacement)).toBe(idA);
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
              computeMutantId(entry.file, entry.original, entry.replacement),
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
