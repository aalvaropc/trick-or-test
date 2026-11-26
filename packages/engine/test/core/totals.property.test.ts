// Property 30: Stryker counts come from the produced mutants. Validates: Requirements 8.22, 8.23, 8.24
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computeMutantCounts, computeStrykerCounts } from "../../src/core/totals.js";
import { dropTwins, type ReportableMutant } from "../../src/core/twins.js";
import type { MutantStatus } from "../../src/core/types.js";

const STATUSES: MutantStatus[] = [
  "Killed",
  "Survived",
  "Timeout",
  "Ghost",
  "InvalidWitness",
  "CompileError",
  "NotApplicable",
];

const statusArb = fc.constantFrom(...STATUSES);

type Item = ReportableMutant & { status: MutantStatus };

const at = (line: number) => ({ start: { line, column: 1 }, end: { line, column: 5 } });

// Few lines and replacements, so that mechanical mutants often make the same change as a spec mutant.
const itemArb = (kind: "spec" | "mechanical"): fc.Arbitrary<Item> =>
  fc
    .record({
      status: statusArb,
      line: fc.integer({ min: 1, max: 4 }),
      replacement: fc.constantFrom("a", "b"),
    })
    .map((r) => ({
      kind,
      file: "src/a.ts",
      location: at(r.line),
      replacement: r.replacement,
      status: r.status,
    }));

// A raw list as StrykerJS produced it, with spec mutants alongside; Twins occur by construction.
const rawArb = fc.record({
  mechanical: fc.array(itemArb("mechanical"), { maxLength: 30 }),
  spec: fc.array(itemArb("spec"), { maxLength: 8 }),
});

const statusListArb = fc.array(statusArb, { maxLength: 60 });

const countOf = (list: readonly { status: MutantStatus }[], ...wanted: MutantStatus[]): number =>
  list.filter((m) => wanted.includes(m.status)).length;

describe("Property 30: Stryker counts come from the produced mutants", () => {
  it("8.23 detected is Killed plus Timeout, undetected is Survived, total is the length", () => {
    fc.assert(
      fc.property(statusListArb, (statuses) => {
        const list = statuses.map((status) => ({ status }));
        const counts = computeStrykerCounts(list);
        expect(counts.detected).toBe(countOf(list, "Killed", "Timeout"));
        expect(counts.undetected).toBe(countOf(list, "Survived"));
        expect(counts.total).toBe(list.length);
      }),
    );
  });

  it("8.23 detected plus undetected never exceeds total", () => {
    fc.assert(
      fc.property(statusListArb, (statuses) => {
        const counts = computeStrykerCounts(statuses.map((status) => ({ status })));
        expect(counts.detected + counts.undetected).toBeLessThanOrEqual(counts.total);
      }),
    );
  });

  it("8.23 the counts are the same for the same list in any order", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ status: statusArb, key: fc.double({ min: 0, max: 1, noNaN: true }) }),
          {
            maxLength: 60,
          },
        ),
        (items) => {
          const original = items.map(({ status }) => ({ status }));
          const shuffled = [...items]
            .sort((a, b) => a.key - b.key)
            .map(({ status }) => ({ status }));
          expect(computeStrykerCounts(shuffled)).toEqual(computeStrykerCounts(original));
        },
      ),
    );
  });

  it("8.23 the counts do not change when the Twins are removed afterwards", () => {
    fc.assert(
      fc.property(rawArb, ({ mechanical, spec }) => {
        const before = computeStrykerCounts(mechanical);
        dropTwins([...spec, ...mechanical]);
        expect(computeStrykerCounts(mechanical)).toEqual(before);
        const { kept } = dropTwins([...spec, ...mechanical]);
        const keptMechanical = kept.filter((m) => m.kind === "mechanical");
        // The list after dropTwins is a different list: its total can only be smaller or equal.
        expect(computeStrykerCounts(keptMechanical).total).toBeLessThanOrEqual(before.total);
      }),
    );
  });

  it("8.22 8.24 strykerCounts.total exceeds the mechanical count of mutantCounts by exactly twinsMerged", () => {
    fc.assert(
      fc.property(rawArb, ({ mechanical, spec }) => {
        const stryker = computeStrykerCounts(mechanical);
        const { kept, twinsMerged } = dropTwins([...spec, ...mechanical]);
        const counts = computeMutantCounts(kept, twinsMerged, "full");
        const mechanicalInCounts = Object.values(counts.mechanical ?? {}).reduce(
          (sum, n) => sum + n,
          0,
        );
        expect(counts.twinsMerged).toBe(twinsMerged);
        expect(stryker.total).toBe(mechanicalInCounts + counts.twinsMerged);
      }),
    );
  });

  it("8.24 a list without Twins gives equal totals and twinsMerged 0", () => {
    fc.assert(
      fc.property(fc.array(itemArb("mechanical"), { maxLength: 30 }), (mechanical) => {
        const { kept, twinsMerged } = dropTwins(mechanical);
        const counts = computeMutantCounts(kept, twinsMerged, "full");
        const mechanicalInCounts = Object.values(counts.mechanical ?? {}).reduce(
          (sum, n) => sum + n,
          0,
        );
        expect(twinsMerged).toBe(0);
        expect(computeStrykerCounts(mechanical).total).toBe(mechanicalInCounts);
      }),
    );
  });
});
