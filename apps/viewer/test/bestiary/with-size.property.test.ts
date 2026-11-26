// Feature: bestiary-viewer, Property V12: Sizing keeps the creature intact
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SPECIES_LIST } from "../../src/bestiary/creature.config.js";
import { type CreatureMutant, creature } from "../../src/bestiary/creature.js";
import { CREATURE_SIZES } from "../../src/bestiary/creature-sizes.js";
import type { CreatureState } from "../../src/bestiary/state.js";
import { withSize } from "../../src/bestiary/with-size.js";

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

describe("withSize keeps the creature intact", () => {
  it("13.18 13.26 sizing sets width and height and changes nothing else", () => {
    // **Validates: Requirements 13.18, 13.26**
    fc.assert(
      fc.property(
        fc.constantFrom(...SPECIES_LIST),
        fc.string(),
        fc.constantFrom(...states),
        mutantArb,
        fc.constantFrom(...Object.values(CREATURE_SIZES)),
        (species, seed, state, mutant, size) => {
          const original = creature(species, seed, state, mutant);
          const sized = withSize(original, size);

          const doc = new DOMParser().parseFromString(sized, "image/svg+xml");
          expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
          expect(doc.documentElement.localName).toBe("svg");
          expect(doc.getElementsByTagName("svg")).toHaveLength(1);
          expect(doc.documentElement.getAttribute("width")).toBe(String(size));
          expect(doc.documentElement.getAttribute("height")).toBe(String(size));

          const stripped = sized.replace(` width="${size}"`, "").replace(` height="${size}"`, "");
          expect(stripped).toBe(original);
        },
      ),
    );
  });
});
