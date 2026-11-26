import { describe, expect, it } from "vitest";
import { COLOR_TOKENS, LIT_EYE_COLOR, SPECIES_LIST } from "../../src/bestiary/creature.config.js";
import { creature } from "../../src/bestiary/creature.js";
import type { CreatureState } from "../../src/bestiary/state.js";

const mutant = { file: "src/cart.ts", location: { start: { line: 12 } } };
const STATES: CreatureState[] = ["survivor", "killed", "in-the-dark", "ghost"];

function parse(svg: string): Document {
  return new DOMParser().parseFromString(svg, "image/svg+xml");
}

function bodyPaths(svg: string): Element[] {
  return [...parse(svg).querySelectorAll('[data-kind="curve"]')];
}

describe("creature state styling", () => {
  it("5.7 survivor has full-ink stroke and fill and eyes in the lit-eye token", () => {
    const doc = parse(creature("Two-Face", "s", "survivor", mutant));
    for (const curve of doc.querySelectorAll('[data-kind="curve"]')) {
      expect(curve.getAttribute("stroke")).toBe(COLOR_TOKENS.bone);
      expect(curve.getAttribute("fill")).toBe(COLOR_TOKENS.ink);
      expect(curve.getAttribute("stroke-width")).toBe("3");
    }
    const eyes = [...doc.querySelectorAll('[data-kind="eye"]')];
    expect(eyes).toHaveLength(2);
    for (const eye of eyes) {
      expect(eye.getAttribute("fill")).toBe(LIT_EYE_COLOR);
    }
  });

  it("5.8 killed has bones only, thin stroke, no fill and no eyes", () => {
    const doc = parse(creature("Two-Face", "s", "killed", mutant));
    expect(doc.querySelectorAll('[data-kind="eye"]')).toHaveLength(0);
    const survivorWidth = Number(
      bodyPaths(creature("Two-Face", "s", "survivor", mutant))[0]?.getAttribute("stroke-width"),
    );
    const drawn = doc.querySelectorAll("[data-kind]");
    expect(drawn.length).toBeGreaterThan(0);
    for (const el of drawn) {
      expect(el.getAttribute("fill")).toBe("none");
      expect(Number(el.getAttribute("stroke-width"))).toBeLessThanOrEqual(survivorWidth / 2);
    }
  });

  it("5.9 in the dark is a single-colour filled silhouette with no eyes", () => {
    const doc = parse(creature("Hollow", "s", "in-the-dark", mutant));
    expect(doc.querySelectorAll('[data-kind="eye"]')).toHaveLength(0);
    const curves = [...doc.querySelectorAll('[data-kind="curve"]')];
    expect(curves.length).toBeGreaterThan(0);
    for (const curve of curves) {
      expect(curve.getAttribute("fill")).toBe(COLOR_TOKENS.bone);
      expect(curve.getAttribute("stroke")).toBe(COLOR_TOKENS.bone);
    }
  });

  it("5.10 ghost is a dashed outline with no fill at opacity exactly 0.4", () => {
    const doc = parse(creature("Miscount", "s", "ghost", mutant));
    expect(doc.documentElement.getAttribute("opacity")).toBe("0.4");
    const curves = [...doc.querySelectorAll('[data-kind="curve"]')];
    expect(curves.length).toBeGreaterThan(0);
    for (const curve of curves) {
      expect(curve.getAttribute("fill")).toBe("none");
      expect(curve.getAttribute("stroke-dasharray")).toBe("6 4");
    }
    expect(doc.querySelectorAll('[data-kind="eye"]')).toHaveLength(0);
  });

  it("5.13 shade is a pattern of parallel lines at a single angle", () => {
    const doc = parse(creature("Oathbreaker", "s", "survivor", mutant));
    const patterns = doc.querySelectorAll("pattern");
    expect(patterns).toHaveLength(1);
    const pattern = patterns[0] as Element;
    expect(pattern.getAttribute("patternTransform")).toBe("rotate(45)");
    const lines = [...pattern.querySelectorAll("line")];
    expect(lines.length).toBeGreaterThan(0);
    const angles = new Set(
      lines.map(
        (l) =>
          `${l.getAttribute("x1")},${l.getAttribute("y1")},${l.getAttribute("x2")},${l.getAttribute("y2")}`,
      ),
    );
    expect(angles.size).toBe(1);
    const shade = doc.querySelector('[data-kind="pattern-shade"]');
    expect(shade?.getAttribute("fill")).toBe(`url(#${pattern.getAttribute("id")})`);
  });

  it("5.12 no gradient, filter or shadow element and only token colours, for every species and state", () => {
    const tokens = new Set<string>(Object.values(COLOR_TOKENS));
    for (const species of SPECIES_LIST) {
      for (const state of STATES) {
        const svg = creature(species, "forbidden", state, mutant);
        expect(svg).not.toMatch(/linearGradient|radialGradient|<filter|drop-shadow|feDropShadow/i);
        for (const el of parse(svg).querySelectorAll("[fill], [stroke]")) {
          for (const attr of ["fill", "stroke"]) {
            const value = el.getAttribute(attr);
            if (value === null || value === "none" || value.startsWith("url(")) continue;
            expect(tokens.has(value)).toBe(true);
          }
        }
      }
    }
  });
});
