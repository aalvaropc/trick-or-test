// Feature: bestiary-viewer, Property V2: Well-formed creatures
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SPECIES_LIST, VIEW_BOX } from "../../src/bestiary/creature.config.js";
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

const JITTER = VIEW_BOX.width * 0.08;
const MIN_X = VIEW_BOX.minX - JITTER;
const MAX_X = VIEW_BOX.minX + VIEW_BOX.width + JITTER;
const MIN_Y = VIEW_BOX.minY - JITTER;
const MAX_Y = VIEW_BOX.minY + VIEW_BOX.height + JITTER;

function parse(svg: string): Document {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
  return doc;
}

const kindsOf = (doc: Document): string[] =>
  Array.from(doc.querySelectorAll("[data-kind]")).map((e) => e.getAttribute("data-kind") ?? "");

/** Every (x, y) pair the drawing uses, read from the attributes of the parsed elements. */
function coordinates(doc: Document): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  const attr = (e: Element, name: string): number => Number(e.getAttribute(name));
  for (const e of Array.from(doc.querySelectorAll("path"))) {
    const nums = (e.getAttribute("d") ?? "").match(/-?\d+(?:\.\d+)?/g) ?? [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      pairs.push([Number(nums[i]), Number(nums[i + 1])]);
    }
  }
  for (const e of Array.from(doc.querySelectorAll("line[x1][y1]"))) {
    pairs.push([attr(e, "x1"), attr(e, "y1")], [attr(e, "x2"), attr(e, "y2")]);
  }
  for (const e of Array.from(doc.querySelectorAll("[cx]"))) {
    pairs.push([attr(e, "cx"), attr(e, "cy")]);
  }
  for (const e of Array.from(doc.querySelectorAll("rect"))) {
    pairs.push([attr(e, "x"), attr(e, "y")]);
  }
  return pairs;
}

describe("creature well-formedness", () => {
  it("5.15 creature never throws for any species, seed, state or missing part", () => {
    // **Validates: Requirements 5.15**
    fc.assert(
      fc.property(
        fc.constantFrom(...SPECIES_LIST),
        fc.string(),
        fc.constantFrom(...states),
        mutantArb,
        (species, seed, state, mutant) => {
          expect(() => creature(species, seed, state, mutant)).not.toThrow();
        },
      ),
    );
  });

  it("5.4 5.16 output is XML with one root svg, the fixed viewBox and a title child", () => {
    // **Validates: Requirements 5.4, 5.16**
    const viewBox = `${VIEW_BOX.minX} ${VIEW_BOX.minY} ${VIEW_BOX.width} ${VIEW_BOX.height}`;
    fc.assert(
      fc.property(
        fc.constantFrom(...SPECIES_LIST),
        fc.string(),
        fc.constantFrom(...states),
        mutantArb,
        (species, seed, state, mutant) => {
          const doc = parse(creature(species, seed, state, mutant));
          const root = doc.documentElement;
          expect(root.localName).toBe("svg");
          expect(doc.getElementsByTagName("svg")).toHaveLength(1);
          expect(root.getAttribute("viewBox")).toBe(viewBox);
          const titles = Array.from(root.children).filter((c) => c.localName === "title");
          expect(titles).toHaveLength(1);
        },
      ),
    );
  });

  it("5.5 5.17 every coordinate is finite and inside the viewBox allowing the jitter", () => {
    // **Validates: Requirements 5.5, 5.17**
    fc.assert(
      fc.property(
        fc.constantFrom(...SPECIES_LIST),
        fc.string(),
        fc.constantFrom(...states),
        mutantArb,
        (species, seed, state, mutant) => {
          const pairs = coordinates(parse(creature(species, seed, state, mutant)));
          expect(pairs.length).toBeGreaterThan(0);
          for (const [x, y] of pairs) {
            expect(Number.isFinite(x)).toBe(true);
            expect(Number.isFinite(y)).toBe(true);
            expect(x).toBeGreaterThanOrEqual(MIN_X);
            expect(x).toBeLessThanOrEqual(MAX_X);
            expect(y).toBeGreaterThanOrEqual(MIN_Y);
            expect(y).toBeLessThanOrEqual(MAX_Y);
          }
        },
      ),
    );
  });

  it("5.6 two seeds of the same species and state give the same element-kind sequence", () => {
    // **Validates: Requirements 5.6**
    fc.assert(
      fc.property(
        fc.constantFrom(...SPECIES_LIST),
        fc.string(),
        fc.string(),
        fc.constantFrom(...states),
        mutantArb,
        (species, seedA, seedB, state, mutant) => {
          const a = kindsOf(parse(creature(species, seedA, state, mutant)));
          const b = kindsOf(parse(creature(species, seedB, state, mutant)));
          expect(a.length).toBeGreaterThan(0);
          expect(a).toEqual(b);
        },
      ),
    );
  });
});
