import type { Species } from "trick-or-test/report";
import { describe, expect, it } from "vitest";
import { SPECIES_LIST } from "../../src/bestiary/creature.config.js";
import { type CreatureMutant, creature } from "../../src/bestiary/creature.js";
import type { CreatureState } from "../../src/bestiary/state.js";

const STATES: CreatureState[] = ["survivor", "killed", "in-the-dark", "ghost"];
const place = { file: "src/cart.ts", location: { start: { line: 12 } } };

const CHANGES: Record<Species, { original?: string; replacement?: string; glyph: string }> = {
  Borderling: { original: "a >= b", replacement: "a > b", glyph: ">" },
  Miscount: { original: "a + b", replacement: "a - b", glyph: "-" },
  "Two-Face": { original: "a && b", replacement: "a || b", glyph: "||" },
  Hollow: { original: "[1]", replacement: "[]", glyph: "[]" },
  Impostor: { original: "Math.min(a)", replacement: "Math.max(a)", glyph: "min → max" },
  Oathbreaker: { replacement: "4.3", glyph: "4.3" },
  Unclassified: { original: "x", replacement: "y", glyph: "?" },
};

function glyphElement(svg: string): Element {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  expect(doc.querySelector("parsererror")).toBeNull();
  const found = doc.querySelectorAll("[data-glyph]");
  expect(found).toHaveLength(1);
  return found[0] as Element;
}

describe("creature glyph", () => {
  for (const species of SPECIES_LIST) {
    for (const state of STATES) {
      it(`5.11 ${species} in state ${state} draws its glyph inside the body`, () => {
        const { glyph, ...change } = CHANGES[species];
        const mutant: CreatureMutant = { ...place, ...change };
        const el = glyphElement(creature(species, "seed", state, mutant));
        expect(el.textContent).toBe(glyph);
        const x = Number(el.getAttribute("x"));
        const y = Number(el.getAttribute("y"));
        expect(x).toBeGreaterThanOrEqual(60);
        expect(x).toBeLessThanOrEqual(140);
        expect(y).toBeGreaterThanOrEqual(80);
        expect(y).toBeLessThanOrEqual(120);
      });
    }
  }

  it("5.14 a glyph with < and & is escaped and the SVG stays well-formed", () => {
    const svg = creature("Impostor", "seed", "survivor", {
      ...place,
      original: "a<b",
      replacement: "a&b",
    });
    expect(svg).toContain(">a&lt;b → a&amp;b</text>");
    expect(glyphElement(svg).textContent).toBe("a<b → a&b");
  });

  it("5.14 a comparison operator < is written as &lt;", () => {
    const svg = creature("Borderling", "seed", "killed", {
      ...place,
      original: "a >= b",
      replacement: "a < b",
    });
    expect(svg).toContain(">&lt;</text>");
  });

  it("5.15 a missing change gives ? as the glyph", () => {
    const svg = creature("Borderling", "seed", "survivor", place);
    expect(glyphElement(svg).textContent).toBe("?");
  });

  it("5.15 an empty change gives ? as the glyph", () => {
    const svg = creature("Miscount", "seed", "ghost", { ...place, original: "", replacement: "" });
    expect(glyphElement(svg).textContent).toBe("?");
  });
});
