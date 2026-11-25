import { describe, expect, it } from "vitest";
import { CREATURE_CONFIG, SPECIES_LIST, VIEW_BOX } from "../../src/bestiary/creature.config.js";
import { creature } from "../../src/bestiary/creature.js";

const mutant = { file: "src/cart.ts", location: { start: { line: 12, column: 3 } } };

function parse(svg: string): Document {
  return new DOMParser().parseFromString(svg, "image/svg+xml");
}

function kinds(svg: string): string[] {
  return [...parse(svg).querySelectorAll("[data-kind]")].map(
    (e) => e.getAttribute("data-kind") ?? "",
  );
}

function curveNumbers(svg: string): number[][] {
  return [...parse(svg).querySelectorAll('[data-kind="curve"]')].map(
    (e) => (e.getAttribute("d") ?? "").match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [],
  );
}

describe("creature structure", () => {
  it("5.1 returns one SVG string with a single root svg, role img and viewBox", () => {
    const svg = creature("Borderling", "oath-1", "survivor", mutant);
    const doc = parse(svg);
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.documentElement.tagName).toBe("svg");
    expect(doc.querySelectorAll("svg")).toHaveLength(1);
    expect(doc.documentElement.getAttribute("role")).toBe("img");
    expect(doc.documentElement.getAttribute("viewBox")).toBe("0 0 200 200");
  });

  it("5.2 same arguments give the same string", () => {
    const a = creature("Miscount", "seed-a", "killed", mutant);
    const b = creature("Miscount", "seed-a", "killed", mutant);
    expect(b).toBe(a);
  });

  it("5.6 title names species, state, file and line", () => {
    const svg = creature("Hollow", "s", "survivor", mutant);
    expect(parse(svg).querySelector("title")?.textContent).toBe("Hollow, survivor: src/cart.ts:12");
  });

  it("5.15 title says unknown location when file and line are missing", () => {
    const svg = creature("Hollow", "s", "ghost", {});
    expect(parse(svg).querySelector("title")?.textContent).toBe("Hollow, ghost: unknown location");
  });

  it("5.15 title says unknown location when only the line is missing", () => {
    const svg = creature("Impostor", "s", "killed", { file: "a.ts" });
    expect(parse(svg).querySelector("title")?.textContent).toBe(
      "Impostor, killed: unknown location",
    );
  });

  it("5.4 curve points move at most 8% of the viewBox width from the base shape", () => {
    const limit = VIEW_BOX.width * 0.08;
    for (const species of SPECIES_LIST) {
      const base = CREATURE_CONFIG[species].filter((e) => e.kind === "curve");
      const drawn = curveNumbers(creature(species, "jitter-seed", "survivor", mutant));
      expect(drawn).toHaveLength(base.length);
      expect(base.length).toBeGreaterThanOrEqual(3);
      expect(base.length).toBeLessThanOrEqual(5);
      base.forEach((curve, i) => {
        const flat = curve.points.flat();
        expect(drawn[i]).toHaveLength(flat.length);
        flat.forEach((value, j) => {
          expect(Math.abs((drawn[i]?.[j] ?? Number.NaN) - value)).toBeLessThanOrEqual(limit + 0.1);
        });
      });
    }
  });

  it("5.5 different seeds give the same curve count and element-kind sequence", () => {
    for (const species of SPECIES_LIST) {
      const a = creature(species, "seed-one", "survivor", mutant);
      const b = creature(species, "seed-two", "survivor", mutant);
      expect(kinds(b)).toEqual(kinds(a));
      expect(kinds(a)).toEqual(CREATURE_CONFIG[species].map((e) => e.kind));
      expect(a).not.toBe(b);
    }
  });

  it("5.17 element-kind sequence differs by species but not by seed", () => {
    expect(kinds(creature("Hollow", "x", "ghost", {}))).toEqual(
      kinds(creature("Hollow", "y", "ghost", {})),
    );
  });

  it("5.14 escapes the file name in the title", () => {
    const svg = creature("Borderling", "s", "survivor", {
      file: `a<b>&"c'.ts`,
      location: { start: { line: 1 } },
    });
    expect(svg).toContain("a&lt;b&gt;&amp;&quot;c&#39;.ts:1");
    const doc = parse(svg);
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.querySelector("title")?.textContent).toBe(`Borderling, survivor: a<b>&"c'.ts:1`);
  });

  it("5.16 never throws when everything is missing", () => {
    expect(() => creature("Unclassified", "", "in-the-dark", {})).not.toThrow();
  });
});
