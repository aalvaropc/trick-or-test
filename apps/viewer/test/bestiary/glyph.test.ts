import type { Species } from "trick-or-test/report";
import { describe, expect, it } from "vitest";
import { glyphFor } from "../../src/bestiary/glyph.js";

describe("glyphFor", () => {
  it("5.11 Borderling shows the comparison operator of the replacement", () => {
    expect(glyphFor("Borderling", "a >= b", "a > b")).toBe(">");
  });

  it("5.11 Miscount shows the arithmetic operator of the replacement", () => {
    expect(glyphFor("Miscount", "a + b", "a - b")).toBe("-");
  });

  it("5.11 Two-Face shows && || true or false", () => {
    expect(glyphFor("Two-Face", "a && b", "a || b")).toBe("||");
    expect(glyphFor("Two-Face", "x > 1", "false")).toBe("false");
  });

  it("5.11 Hollow shows {} [] or an empty string literal", () => {
    expect(glyphFor("Hollow", "{ return 1; }", "{}")).toBe("{}");
    expect(glyphFor("Hollow", "[1, 2]", "[]")).toBe("[]");
    expect(glyphFor("Hollow", '"abc"', '""')).toBe('""');
  });

  it("5.11 Impostor shows the swapped call name pair", () => {
    expect(glyphFor("Impostor", "Math.min(a, b)", "Math.max(a, b)")).toBe("min → max");
  });

  it("5.11 Oathbreaker shows the criterion id", () => {
    expect(glyphFor("Oathbreaker", undefined, "4.3")).toBe("4.3");
  });

  it("5.11 Unclassified shows ?", () => {
    expect(glyphFor("Unclassified", "a", "b")).toBe("?");
  });

  it("5.15 missing original and replacement give ? for every species", () => {
    const all: Species[] = [
      "Borderling",
      "Miscount",
      "Two-Face",
      "Hollow",
      "Impostor",
      "Oathbreaker",
      "Unclassified",
    ];
    for (const s of all) expect(glyphFor(s, undefined, undefined)).toBe("?");
  });

  it("5.15 empty original and replacement give ? for every species", () => {
    const all: Species[] = [
      "Borderling",
      "Miscount",
      "Two-Face",
      "Hollow",
      "Impostor",
      "Oathbreaker",
      "Unclassified",
    ];
    for (const s of all) expect(glyphFor(s, "", "")).toBe("?");
  });

  it("5.15 a change with no recognisable token gives ?", () => {
    expect(glyphFor("Borderling", "foo", "bar")).toBe("?");
  });
});
