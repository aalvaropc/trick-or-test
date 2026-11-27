import { describe, expect, it } from "vitest";
import { extractLeadingComments } from "../../src/core/claims.js";

describe("extractLeadingComments", () => {
  it("11.1 reads // lines directly above the start line in file order, markers removed", () => {
    const text = [
      "// Feature: cart-pricing, Property 9: Breakdown invariants",
      "// **Validates: Requirements 5.5, 7.3**",
      'it("x", () => {});',
    ].join("\n");
    expect(extractLeadingComments(text, 3)).toEqual([
      "Feature: cart-pricing, Property 9: Breakdown invariants",
      "**Validates: Requirements 5.5, 7.3**",
    ]);
  });

  it("11.1 reads a /* ... */ block", () => {
    const text = ["/*", "Feature: cart-pricing", "Validates: Requirements 4.1", "*/", "it();"].join(
      "\n",
    );
    expect(extractLeadingComments(text, 5)).toEqual([
      "",
      "Feature: cart-pricing",
      "Validates: Requirements 4.1",
      "",
    ]);
  });

  it("11.1 reads a JSDoc block with * markers", () => {
    const text = [
      "/**",
      " * Feature: cart-pricing",
      " * Validates: Requirements 4.1",
      " */",
      "it();",
    ].join("\n");
    expect(extractLeadingComments(text, 5)).toEqual([
      "",
      "Feature: cart-pricing",
      "Validates: Requirements 4.1",
      "",
    ]);
  });

  it("11.1 reads a one-line block comment", () => {
    expect(extractLeadingComments("/* Validates: Requirements 1.1 */\nit();", 2)).toEqual([
      "Validates: Requirements 1.1",
    ]);
  });

  it("11.1 a blank line ends the run", () => {
    const text = ["// above blank", "", "// kept", "it();"].join("\n");
    expect(extractLeadingComments(text, 4)).toEqual(["kept"]);
  });

  it("11.1 a line of code ends the run", () => {
    const text = ["// above code", "const a = 1;", "// kept", "it();"].join("\n");
    expect(extractLeadingComments(text, 4)).toEqual(["kept"]);
  });

  it("11.1 returns an empty list for start line 1, 0 and beyond the text", () => {
    const text = "// a\nit();";
    expect(extractLeadingComments(text, 1)).toEqual([]);
    expect(extractLeadingComments(text, 0)).toEqual([]);
    expect(extractLeadingComments(text, 3)).toEqual([]);
  });

  it("11.1 returns an empty list when the line above is code", () => {
    expect(extractLeadingComments("const a = 1;\nit();", 2)).toEqual([]);
  });

  it("11.8 a comment above a describe is not returned for a test inside the block", () => {
    const text = [
      "// Validates: Requirements 4.1",
      'describe("d", () => {',
      '  it("x", () => {});',
      "});",
    ].join("\n");
    expect(extractLeadingComments(text, 3)).toEqual([]);
    expect(extractLeadingComments(text, 2)).toEqual(["Validates: Requirements 4.1"]);
  });

  it("11.9 a comment above an it.each call is returned for the start line of that call", () => {
    const text = [
      "// Validates: Requirements 4.2",
      "it.each([1, 2])(",
      '  "case %s",',
      "  (n) => {},",
      ");",
    ].join("\n");
    expect(extractLeadingComments(text, 2)).toEqual(["Validates: Requirements 4.2"]);
  });

  it("11.7 other comment lines between the annotation and the call are returned with the rest", () => {
    const text = [
      "// Feature: cart-pricing",
      "// Validates: Requirements 4.1",
      "// some note about the test",
      "it();",
    ].join("\n");
    expect(extractLeadingComments(text, 4)).toEqual([
      "Feature: cart-pricing",
      "Validates: Requirements 4.1",
      "some note about the test",
    ]);
  });

  it("11.1 handles \\r\\n line ends", () => {
    const text = "// Feature: cart-pricing\r\n// Validates: Requirements 4.1\r\nit();\r\n";
    expect(extractLeadingComments(text, 3)).toEqual([
      "Feature: cart-pricing",
      "Validates: Requirements 4.1",
    ]);
  });
});
