// Property 2: Uniqueness. Validates: Requirements 4.4, 5.2
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyMutation } from "../../src/core/mutation.js";
import type { MutantId, SpecMutant } from "../../src/core/types.js";

const countOccurrences = (source: string, needle: string): number => {
  let count = 0;
  for (let at = source.indexOf(needle); at !== -1; at = source.indexOf(needle, at + 1)) count += 1;
  return count;
};

const text = fc.string({ maxLength: 20 });
const original = fc.string({ minLength: 1, maxLength: 10 });
const mutated = fc.string({ maxLength: 10 });

type Scenario = { source: string; original: string; mutated: string };

const zero: fc.Arbitrary<Scenario> = fc
  .record({ source: fc.string({ maxLength: 60 }), original, mutated })
  .filter((s) => !s.source.includes(s.original));

const exactlyTwo: fc.Arbitrary<Scenario> = fc
  .record({ a: text, b: text, c: text, original, mutated })
  .map((s) => ({
    source: s.a + s.original + s.b + s.original + s.c,
    original: s.original,
    mutated: s.mutated,
  }))
  .filter((s) => countOccurrences(s.source, s.original) === 2);

const many: fc.Arbitrary<Scenario> = fc
  .record({
    parts: fc.array(text, { minLength: 4, maxLength: 8 }),
    original,
    mutated,
  })
  .map((s) => ({
    source: s.parts.join(s.original),
    original: s.original,
    mutated: s.mutated,
  }));

const toMutant = (s: Scenario): SpecMutant =>
  ({
    id: "oath-4.4-uniqueness" as MutantId,
    original: s.original,
    mutated: s.mutated,
    file: "src/x.ts",
  }) as unknown as SpecMutant;

const checkRejected = (scenario: fc.Arbitrary<Scenario>, minimum: number, maximum: number) =>
  fc.assert(
    fc.property(scenario, (s) => {
      const before = s.source;
      const mutant = toMutant(s);
      const result = applyMutation(s.source, mutant);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("NotApplicable");
      expect(result.error.mutant).toBe(mutant.id);
      expect(result.error.occurrences).toBe(countOccurrences(before, s.original));
      expect(result.error.occurrences).toBeGreaterThanOrEqual(minimum);
      expect(result.error.occurrences).toBeLessThanOrEqual(maximum);
      expect(s.source).toBe(before);
    }),
  );

describe("Property 2: Uniqueness", () => {
  it("4.4 original occurring zero times yields NotApplicable and leaves the source unchanged", () => {
    checkRejected(zero, 0, 0);
  });

  it("5.2 original occurring exactly twice yields NotApplicable and leaves the source unchanged", () => {
    checkRejected(exactlyTwo, 2, 2);
  });

  it("5.2 original occurring many times yields NotApplicable and leaves the source unchanged", () => {
    checkRejected(many, 3, Number.POSITIVE_INFINITY);
  });
});
