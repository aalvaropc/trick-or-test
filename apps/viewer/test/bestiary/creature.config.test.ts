import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COLOR_TOKENS,
  CREATURE_CONFIG,
  LIT_EYE_COLOR,
  SPECIES_LIST,
  VIEW_BOX,
} from "../../src/bestiary/creature.config.js";
import { fnv1a32, mulberry32 } from "../../src/bestiary/prng.js";

const srcDir = resolve(__dirname, "../../src/bestiary");
const steeringPath = resolve(__dirname, "../../../../.kiro/steering/bestiary.md");

/** Reads the `| \`--name\` | \`#hex\` |` rows of the colour token table in bestiary.md. */
function steeringTokens(): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const line of readFileSync(steeringPath, "utf8").split("\n")) {
    const m = /^\|\s*`--([a-z]+)`\s*\|\s*`(#[0-9A-Fa-f]{6})`/.exec(line);
    if (m?.[1] && m[2]) tokens.set(m[1], m[2].toUpperCase());
  }
  return tokens;
}

describe("creature config", () => {
  it("5.4 every species has 3 to 5 body curves", () => {
    expect(SPECIES_LIST).toHaveLength(7);
    for (const species of SPECIES_LIST) {
      const curves = CREATURE_CONFIG[species].filter((e) => e.kind === "curve");
      expect(curves.length, species).toBeGreaterThanOrEqual(3);
      expect(curves.length, species).toBeLessThanOrEqual(5);
    }
  });

  it("5.4 each body curve has four control points", () => {
    for (const species of SPECIES_LIST) {
      for (const el of CREATURE_CONFIG[species]) {
        if (el.kind === "curve") expect(el.points, species).toHaveLength(4);
      }
    }
  });

  it("5.4 the viewBox is fixed and every base point leaves room for 8% jitter", () => {
    expect(VIEW_BOX).toEqual({ minX: 0, minY: 0, width: 200, height: 200 });
    const margin = VIEW_BOX.width * 0.08;
    for (const species of SPECIES_LIST) {
      for (const el of CREATURE_CONFIG[species]) {
        for (const [x, y] of el.points) {
          expect(x).toBeGreaterThanOrEqual(margin);
          expect(x).toBeLessThanOrEqual(VIEW_BOX.width - margin);
          expect(y).toBeGreaterThanOrEqual(margin);
          expect(y).toBeLessThanOrEqual(VIEW_BOX.height - margin);
        }
      }
    }
  });

  it("5.5 the element kinds of a species are a fixed sequence, curves first", () => {
    expect(CREATURE_CONFIG.Borderling.map((e) => e.kind)).toEqual([
      "curve",
      "curve",
      "curve",
      "limb",
      "eye",
      "eye",
      "pattern-shade",
    ]);
    for (const species of SPECIES_LIST) {
      const kinds = CREATURE_CONFIG[species].map((e) => e.kind);
      const firstOther = kinds.findIndex((k) => k !== "curve");
      expect(kinds.slice(firstOther).includes("curve"), species).toBe(false);
    }
  });

  it("5.12 the colour tokens equal the values in bestiary.md", () => {
    const doc = steeringTokens();
    expect(doc.size).toBe(6);
    expect(Object.keys(COLOR_TOKENS).sort()).toEqual([...doc.keys()].sort());
    for (const [name, value] of Object.entries(COLOR_TOKENS)) {
      expect(value.toUpperCase(), name).toBe(doc.get(name));
    }
    expect(Object.values(COLOR_TOKENS)).toContain(LIT_EYE_COLOR);
  });

  it("5.12 every colour value written in the config source is a bestiary.md token", () => {
    const allowed = new Set(steeringTokens().values());
    const source = readFileSync(resolve(srcDir, "creature.config.ts"), "utf8");
    const found = source.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? [];
    expect(found.length).toBeGreaterThan(0);
    for (const hex of found) expect(allowed.has(hex.toUpperCase()), hex).toBe(true);
    expect(source).not.toMatch(/\b(?:rgba?|hsla?)\(/);
  });
});

describe("prng", () => {
  it("5.3 fnv1a32 matches the published FNV-1a 32-bit test vectors", () => {
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("a")).toBe(0xe40c292c);
    expect(fnv1a32("foobar")).toBe(0xbf9cf968);
  });

  it("5.3 the same hash gives the same sequence", () => {
    const a = mulberry32(fnv1a32("oath-4.3-threshold-before-coupon"));
    const b = mulberry32(fnv1a32("oath-4.3-threshold-before-coupon"));
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("5.3 different ids give different sequences, all values in [0, 1)", () => {
    const a = mulberry32(fnv1a32("mutant-1"));
    const b = mulberry32(fnv1a32("mutant-2"));
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).not.toEqual(seqB);
    for (const v of [...seqA, ...seqB]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("5.3 the generator source reads no clock and no unseeded random source", () => {
    for (const file of ["prng.ts", "creature.config.ts"]) {
      const source = readFileSync(resolve(srcDir, file), "utf8");
      expect(source, file).not.toMatch(/Math\.random|\bDate\b|performance\.now|crypto/);
    }
  });

  it("5.3 the pure modules import no React", () => {
    for (const file of ["prng.ts", "creature.config.ts"]) {
      const source = readFileSync(resolve(srcDir, file), "utf8");
      expect(source, file).not.toMatch(/from\s+["']react/);
    }
  });
});
