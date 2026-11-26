// Feature: bestiary-viewer, Property V1: Deterministic creatures
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SPECIES_LIST } from "../../src/bestiary/creature.config.js";
import { type CreatureMutant, creature } from "../../src/bestiary/creature.js";
import type { CreatureState } from "../../src/bestiary/state.js";

const states: readonly CreatureState[] = ["survivor", "killed", "in-the-dark", "ghost"];

const mutantArb: fc.Arbitrary<CreatureMutant> = fc.record({
  file: fc.option(fc.string(), { nil: undefined }),
  location: fc.option(
    fc.record({ start: fc.record({ line: fc.integer({ min: 0, max: 100000 }) }) }),
    { nil: undefined },
  ),
  original: fc.option(fc.string(), { nil: undefined }),
  replacement: fc.option(fc.string(), { nil: undefined }),
});

describe("creature determinism", () => {
  it("5.2 5.18 two calls with the same arguments return byte-identical strings", () => {
    // **Validates: Requirements 5.2, 5.18**
    fc.assert(
      fc.property(
        fc.constantFrom(...SPECIES_LIST),
        fc.string(),
        fc.constantFrom(...states),
        mutantArb,
        (species, seed, state, mutant) => {
          expect(creature(species, seed, state, mutant)).toBe(
            creature(species, seed, state, mutant),
          );
        },
      ),
    );
  });
});
