// Feature: bestiary-viewer, Property V3: The glyph is present
import fc from "fast-check";
import { expect, it } from "vitest";
import { SPECIES_LIST } from "../../src/bestiary/creature.config.js";
import { creature } from "../../src/bestiary/creature.js";
import { escapeXml } from "../../src/bestiary/escape-xml.js";
import { glyphFor } from "../../src/bestiary/glyph.js";
import type { CreatureState } from "../../src/bestiary/state.js";

const states: readonly CreatureState[] = ["survivor", "killed", "in-the-dark", "ghost"];

const maybeText = fc.option(fc.string({ minLength: 1 }), { nil: undefined });

it("5.11 5.14 the SVG contains the escaped glyph for any non-empty code change", () => {
  // **Validates: Requirements 5.11, 5.14**
  fc.assert(
    fc.property(
      fc.constantFrom(...SPECIES_LIST),
      fc.string(),
      fc.constantFrom(...states),
      fc
        .tuple(maybeText, maybeText)
        .filter(([original, replacement]) => original !== undefined || replacement !== undefined),
      (species, seed, state, [original, replacement]) => {
        const svg = creature(species, seed, state, { original, replacement });
        const glyph = escapeXml(glyphFor(species, original, replacement));
        expect(svg).toContain(`>${glyph}</text>`);
      },
    ),
  );
});
