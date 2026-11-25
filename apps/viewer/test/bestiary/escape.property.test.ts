// Feature: bestiary-viewer, Property V11: Escaping is safe
import fc from "fast-check";
import { expect, it } from "vitest";
import { SPECIES_LIST } from "../../src/bestiary/creature.config.js";
import { creature } from "../../src/bestiary/creature.js";
import type { CreatureState } from "../../src/bestiary/state.js";

const states: readonly CreatureState[] = ["survivor", "killed", "in-the-dark", "ghost"];

// Strings that are full of markup characters and half-written entities.
const hostile = fc
  .array(
    fc.constantFrom("&", "<", ">", '"', "'", "&amp;", "&lt;", "&#39;", "amp", ";", "a", "/", " "),
    { maxLength: 12 },
  )
  .map((parts) => parts.join(""));

const anyText = fc.oneof(hostile, fc.string());

it("5.14 no markup character from a path, glyph text or id is left unescaped in the SVG", () => {
  // **Validates: Requirements 5.14, 10.9, 12.9**
  fc.assert(
    fc.property(
      fc.constantFrom(...SPECIES_LIST),
      anyText,
      fc.constantFrom(...states),
      anyText,
      anyText,
      anyText,
      fc.integer({ min: 1, max: 100000 }),
      (species, seed, state, file, original, replacement, line) => {
        const svg = creature(species, seed, state, {
          file,
          location: { start: { line } },
          original,
          replacement,
        });

        const title = /<title>([\s\S]*)<\/title>/.exec(svg);
        const glyph = /data-glyph="true"[^>]*>([\s\S]*)<\/text>/.exec(svg);
        expect(title).not.toBeNull();
        expect(glyph).not.toBeNull();

        for (const text of [title?.[1] ?? "", glyph?.[1] ?? ""]) {
          // No raw markup character survives inside the text nodes.
          expect(text).not.toMatch(/[<>"']/);
          // Every ampersand starts one of the five entities.
          expect(text).not.toMatch(/&(?!(?:amp|lt|gt|quot|#39);)/);
        }

        // The text nodes are the only place the inputs appear: the tag count is fixed
        // by the structure, so a raw `<` from an input would add one.
        const benign = creature(species, seed, state, {
          file: "a",
          location: { start: { line } },
          original: "a",
          replacement: "a",
        });
        expect(svg.split("<").length).toBe(benign.split("<").length);
      },
    ),
  );
});
