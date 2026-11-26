import { describe, expect, it } from "vitest";
import { type CssRule, parseRules, readStyleSheets } from "./css-source.js";

const sheets = readStyleSheets();
const allCss = Object.values(sheets).join("\n");
const rules: CssRule[] = parseRules(allCss);

const base = (selector: string): CssRule[] =>
  rules.filter((r) => r.selector === selector && r.context.length === 0);
const declared = (selector: string, property: string): string | undefined =>
  base(selector)
    .map((r) => r.declarations[property])
    .filter((v) => v !== undefined)
    .at(-1);

/** Custom properties declared on `:root`. */
const tokens: Record<string, string> = {};
for (const r of rules.filter((x) => x.selector === ":root")) {
  for (const [name, value] of Object.entries(r.declarations)) {
    if (name.startsWith("--")) tokens[name] = value;
  }
}

/** A length in CSS pixels. `clamp` and `min` yield their smallest argument, `var` is resolved. */
function toPx(value: string): number {
  const v = value.trim();
  const fn = /^(clamp|min)\((.*)\)$/.exec(v);
  if (fn !== null) {
    const args = (fn[2] ?? "").split(",").filter((a) => /(px|rem)\s*$/.test(a.trim()));
    return Math.min(...args.map(toPx));
  }
  const variable = /^var\((--[\w-]+)\)$/.exec(v);
  if (variable !== null) {
    const resolved = tokens[variable[1] ?? ""];
    if (resolved === undefined) throw new Error(`unknown token ${v}`);
    return toPx(resolved);
  }
  const px = /^(-?[\d.]+)px$/.exec(v);
  if (px !== null) return Number(px[1]);
  const rem = /^(-?[\d.]+)rem$/.exec(v);
  if (rem !== null) return Number(rem[1]) * 16;
  throw new Error(`cannot resolve length "${value}"`);
}

const SINGLE_COLUMN = /^(minmax\(0,\s*1fr\)|1fr)$/;
const MIN_WIDTH_768_OR_MORE = /^@media \(min-width: (768|1024)px\)$/;

describe("layout rules", () => {
  it("13.4 the page frame is centred with a maximum width of 80rem and side padding", () => {
    const frame = base(".page")[0]?.declarations;
    expect(frame?.["max-width"]).toBe("var(--page-max)");
    expect(frame?.margin).toMatch(/\bauto\b/);
    expect(frame?.padding).toContain("var(--page-pad)");
    expect(toPx("var(--page-max)")).toBe(1280);
    expect(toPx("var(--page-pad)")).toBe(24);
  });

  it("13.4 the page frame has 1rem side padding on a narrow screen", () => {
    const narrow = rules.filter(
      (r) => r.selector === ".page" && r.context.join() === "@media (max-width: 767px)",
    );
    expect(narrow).toHaveLength(1);
    expect(narrow[0]?.declarations["padding-left"]).toBe("1rem");
    expect(narrow[0]?.declarations["padding-right"]).toBe("1rem");
  });

  it("13.21 grids are one column by default and gain columns only from 768 px", () => {
    for (const selector of [".species-legend__list", ".specimen__witness", ".seal-grid"]) {
      expect(declared(selector, "grid-template-columns"), selector).toMatch(SINGLE_COLUMN);
      const wider = rules.filter(
        (r) =>
          r.selector === selector &&
          r.context.length > 0 &&
          r.declarations["grid-template-columns"] !== undefined,
      );
      for (const r of wider) {
        expect(r.context.join(), selector).toMatch(MIN_WIDTH_768_OR_MORE);
      }
    }
  });

  it("13.21 the headline counts are at most two columns until 1024 px", () => {
    expect(declared(".headline__counts", "grid-template-columns")).toBe(
      "repeat(2, minmax(0, 1fr))",
    );
  });

  it("13.21 the two-column areas wrap so that they stack on a narrow screen", () => {
    for (const selector of [".verdict__columns", ".specimen"]) {
      expect(declared(selector, "display"), selector).toBe("flex");
      expect(declared(selector, "flex-wrap"), selector).toBe("wrap");
    }
  });

  it("13.21 a wide table scrolls inside .table-scroll", () => {
    expect(declared(".table-scroll", "overflow-x")).toBe("auto");
    expect(declared(".table-scroll", "max-width")).toBe("100%");
  });

  it("13.18 no creature container sets a width above 320 px", () => {
    const containers = rules.filter((r) =>
      /(^|[\s.])(creature|seal__drawing|specimen__creature)(?![\w-])/.test(r.selector),
    );
    expect(containers.length).toBeGreaterThan(0);
    for (const r of containers) {
      for (const property of ["width", "min-width", "max-width", "flex-basis"]) {
        const value = r.declarations[property];
        if (value === undefined || /^(100%|auto)$/.test(value)) continue;
        for (const length of value.match(/-?[\d.]+(px|rem)/g) ?? []) {
          expect(toPx(length), `${r.selector} ${property}`).toBeLessThanOrEqual(320);
        }
      }
    }
  });

  it("13.18 creatures only scale down inside their container", () => {
    const scaled = rules.find((r) => r.selector === ".creature svg");
    expect(scaled?.declarations["max-width"]).toBe("100%");
    expect(scaled?.declarations.height).toBe("auto");
  });

  it("10.4 no font size is below 14 px", () => {
    const sizes: { selector: string; value: string }[] = [];
    for (const r of rules) {
      const value = r.declarations["font-size"];
      if (value !== undefined) sizes.push({ selector: r.selector, value });
    }
    for (const [name, value] of Object.entries(tokens)) {
      if (name.startsWith("--text-")) sizes.push({ selector: name, value });
    }
    expect(sizes.length).toBeGreaterThan(10);
    for (const { selector, value } of sizes) {
      expect(toPx(value), `${selector} ${value}`).toBeGreaterThanOrEqual(14);
    }
  });

  it("13.25 no style sheet uses a gradient, a filter or a shadow", () => {
    for (const [name, css] of Object.entries(sheets)) {
      expect(css, name).not.toMatch(/gradient\(/i);
      expect(css, name).not.toMatch(/filter\s*:/i);
      expect(css, name).not.toMatch(/box-shadow\s*:/i);
      expect(css, name).not.toMatch(/text-shadow\s*:/i);
      expect(css, name).not.toMatch(/drop-shadow\(/i);
    }
  });

  it("10.9 the style sheets reference no image", () => {
    expect(allCss).not.toMatch(/url\(/i);
  });
});
