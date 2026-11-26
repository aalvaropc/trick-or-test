import { describe, expect, it } from "vitest";
import { parseRules, readStyleSheets } from "./css-source.js";

describe("blocked attempt colour", () => {
  it("8.6 the .hunt__blocked rule sets the colour to var(--amber)", () => {
    const rules = Object.values(readStyleSheets()).flatMap((css) => parseRules(css));
    const colours = rules
      .filter((rule) => rule.selector === ".hunt__blocked")
      .map((rule) => rule.declarations.color)
      .filter((value) => value !== undefined);
    expect(colours).toContain("var(--amber)");
  });
});
