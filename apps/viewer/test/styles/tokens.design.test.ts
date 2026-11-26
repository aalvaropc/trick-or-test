import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const stylesDir = join(here, "..", "..", "src", "styles");

const tokens = readFileSync(join(stylesDir, "tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Every custom property declared in a :root block, with its value lower-cased. */
const declared = (): Map<string, string> => {
  const map = new Map<string, string>();
  for (const rule of tokens.matchAll(/:root\s*\{([^}]*)\}/g)) {
    for (const decl of (rule[1] ?? "").matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      if (decl[1] !== undefined && decl[2] !== undefined) {
        map.set(decl[1], decl[2].trim().toLowerCase());
      }
    }
  }
  return map;
};

describe("design tokens (Requirement 13)", () => {
  const values = declared();

  it("13.1 the six original colour tokens keep their values", () => {
    expect(values.get("ink")).toBe("#0c0e12");
    expect(values.get("bone")).toBe("#e9e2d0");
    expect(values.get("amber")).toBe("#f2b544");
    expect(values.get("verdigris")).toBe("#4cc38a");
    expect(values.get("mist")).toBe("#7a8699");
    expect(values.get("ember")).toBe("#e5484d");
  });

  it("13.1 the five Surface_Tokens exist with the listed values", () => {
    expect(values.get("rule")).toBe("#2a2f38");
    expect(values.get("panel")).toBe("#14161c");
    expect(values.get("plate")).toBe("#101218");
    expect(values.get("bone-dim")).toBe("#b9b3a6");
    expect(values.get("ghost")).toBe("#a9b2c0");
  });

  it("13.3 the type scale has the listed sizes", () => {
    expect(values.get("text-body")).toBe("0.9375rem");
    expect(values.get("text-small")).toBe("0.875rem");
    expect(values.get("text-h2")).toBe("1.75rem");
    expect(values.get("text-h3")).toBe("1.625rem");
    expect(values.get("text-title")).toBe("clamp(2.25rem, 5.2vw, 4.5rem)");
  });

  it("10.4 every size in the type scale is 14 px or more", () => {
    const sizes = [...values].filter(([name]) => name.startsWith("text-"));
    expect(sizes.length).toBeGreaterThanOrEqual(5);
    for (const [name, value] of sizes) {
      const lengths = [...value.matchAll(/([\d.]+)(px|rem)/g)];
      expect(lengths.length, name).toBeGreaterThan(0);
      for (const length of lengths) {
        const px = Number(length[1]) * (length[2] === "rem" ? 16 : 1);
        expect(px, `${name}: ${length[0]}`).toBeGreaterThanOrEqual(14);
      }
    }
  });

  it("13.4 the spacing tokens have the listed values", () => {
    expect(values.get("page-max")).toBe("80rem");
    expect(values.get("page-pad")).toBe("1.5rem");
    expect(values.get("section-gap")).toBe("2.5rem");
  });

  it("13.25 the tokens use no gradient, filter or image", () => {
    expect(tokens).not.toMatch(/gradient\(|filter|url\(/i);
  });
});
