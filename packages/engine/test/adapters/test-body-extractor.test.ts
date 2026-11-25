import { describe, expect, it } from "vitest";
import { extractTestBody } from "../../src/adapters/test-body-extractor.js";

describe("extractTestBody", () => {
  it("6.2 extracts a simple test call from its start line to the closing bracket", () => {
    const text = ["it('a', () => {", "  expect(1).toBe(1);", "});", "it('b', () => {});"].join(
      "\n",
    );
    expect(extractTestBody(text, 1)).toBe("it('a', () => {\n  expect(1).toBe(1);\n})");
    expect(extractTestBody(text, 4)).toBe("it('b', () => {});".slice(0, -1));
  });

  it("6.2 ignores brackets inside strings, templates and comments", () => {
    const text = [
      "it('x', () => {",
      "  const a = '}))';",
      '  const b = "{[(";',
      "  const c = `${ '}' } ) ${`)`}`;",
      "  // ))) }",
      "  /* ) } */",
      "  expect(a).toBe(b);",
      "});",
      "after();",
    ].join("\n");
    const body = extractTestBody(text, 1);
    expect(body.endsWith("expect(a).toBe(b);\n})")).toBe(true);
    expect(body).not.toContain("after");
  });

  it("6.4 ignores brackets inside regular expression literals", () => {
    const text = [
      "it('r', () => {",
      "  expect(s).toMatch(/[)}]+\\/)/g);",
      "  const x = 4 / 2;",
      "});",
      "tail();",
    ].join("\n");
    const body = extractTestBody(text, 1);
    expect(body.endsWith("const x = 4 / 2;\n})")).toBe(true);
  });

  it("6.4 covers a whole nested describe block when started on the describe line", () => {
    const text = [
      "describe('d', () => {",
      "  it('i', () => {",
      "    f();",
      "  });",
      "});",
      "other();",
    ].join("\n");
    expect(extractTestBody(text, 1)).toBe(`${text.split("\n").slice(0, 4).join("\n")}\n})`);
    expect(extractTestBody(text, 2)).toBe("  it('i', () => {\n    f();\n  })");
  });

  it("6.2 returns an empty string when the start line is past the end of the file", () => {
    expect(extractTestBody("it('a', () => {});\n", 5)).toBe("");
    expect(extractTestBody("", 1)).toBe("");
  });
});
