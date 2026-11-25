// Property 1: Replacement round trip. Validates: Requirements 5.2
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyMutation, revertMutation } from "../../src/core/mutation.js";
import type { SpecMutant } from "../../src/core/types.js";

const countOccurrences = (source: string, needle: string): number => {
  let count = 0;
  for (let at = source.indexOf(needle); at !== -1; at = source.indexOf(needle, at + 1)) count += 1;
  return count;
};

const text = fc.string({ maxLength: 30 });

const scenario = fc
  .record({
    prefix: text,
    original: fc.string({ minLength: 1, maxLength: 15 }),
    suffix: text,
    mutated: text,
  })
  .filter(
    ({ prefix, original, suffix }) => countOccurrences(prefix + original + suffix, original) === 1,
  );

const toMutant = (original: string, mutated: string): SpecMutant =>
  ({ original, mutated, file: "src/x.ts" }) as unknown as SpecMutant;

describe("Property 1: Replacement round trip", () => {
  it("5.2 revert after apply restores the original source exactly", () => {
    fc.assert(
      fc.property(scenario, ({ prefix, original, suffix, mutated }) => {
        const source = prefix + original + suffix;
        const mutant = toMutant(original, mutated);
        const applied = applyMutation(source, mutant);
        expect(applied.ok).toBe(true);
        if (!applied.ok) return;
        expect(revertMutation(applied.value.mutated, mutant, applied.value.span)).toBe(source);
      }),
    );
  });

  it("5.2 no character outside the replaced span changes", () => {
    fc.assert(
      fc.property(scenario, ({ prefix, original, suffix, mutated }) => {
        const source = prefix + original + suffix;
        const applied = applyMutation(source, toMutant(original, mutated));
        expect(applied.ok).toBe(true);
        if (!applied.ok) return;
        const { mutated: out, span } = applied.value;
        expect(out.slice(0, span.start)).toBe(prefix);
        expect(out.slice(span.start, span.end)).toBe(mutated);
        expect(out.slice(span.end)).toBe(suffix);
      }),
    );
  });
});
