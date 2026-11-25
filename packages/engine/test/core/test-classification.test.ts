import { describe, expect, it } from "vitest";
import { classifyTest } from "../../src/core/test-classification.js";

const GLOBS = ["test/**/*.property.test.ts"];
const at = (filePath: string, bodySource: string) => ({ filePath, bodySource });

describe("classifyTest", () => {
  it("6.3 a file path matching a property-test glob is a property test", () => {
    const body = "it('x', () => { expect(1).toBe(1); });";
    expect(classifyTest(at("test/core/a.property.test.ts", body), GLOBS)).toBe("property");
  });

  it("6.3 every expansion of a brace group in a glob matches", () => {
    const globs = ["test/**/*.{property,prop}.test.ts"];
    const body = "it('x', () => {});";
    expect(classifyTest(at("test/a.property.test.ts", body), globs)).toBe("property");
    expect(classifyTest(at("test/a.prop.test.ts", body), globs)).toBe("property");
  });

  it("6.3 a name outside the brace group does not match", () => {
    const globs = ["test/**/*.{property,prop}.test.ts"];
    expect(classifyTest(at("test/a.other.test.ts", "it('x', () => {});"), globs)).toBe("example");
  });

  it("6.3 a glob without braces still works", () => {
    const body = "it('x', () => {});";
    expect(classifyTest(at("test/a.property.test.ts", body), GLOBS)).toBe("property");
    expect(classifyTest(at("test/a.prop.test.ts", body), GLOBS)).toBe("example");
  });

  it("6.4 a body calling fc.assert is a property test", () => {
    const body = "it('x', () => { fc.assert(fc.property(fc.integer(), (n) => n === n)); });";
    expect(classifyTest(at("test/a.test.ts", body), GLOBS)).toBe("property");
  });

  it("6.4 a body calling fc.check is a property test", () => {
    const body = "it('x', () => { fc.check(p); });";
    expect(classifyTest(at("test/a.test.ts", body), GLOBS)).toBe("property");
  });

  it("6.4 a body calling test.prop is a property test", () => {
    const body = "test.prop([fc.integer()])('x', (n) => { expect(n).toBe(n); });";
    expect(classifyTest(at("test/a.test.ts", body), GLOBS)).toBe("property");
  });

  it("6.4 mentions of the entry points in comments or strings do not count", () => {
    const body = [
      "it('x', () => {",
      "  // fc.assert(p)",
      "  /* fc.check(p) */",
      "  const s = 'fc.assert(p)';",
      '  const t = "test.prop(x)";',
      "  const u = `fc.check(p)`;",
      "  expect([s, t, u]).toHaveLength(3);",
      "});",
    ].join("\n");
    expect(classifyTest(at("test/a.test.ts", body), GLOBS)).toBe("example");
  });

  it("6.5 a plain body outside the globs is an example test", () => {
    const body = "it('x', () => { expect(price(cart)).toEqual(expected); });";
    expect(classifyTest(at("test/a.test.ts", body), GLOBS)).toBe("example");
  });

  it("6.5 a helper-only body is classified by its file glob alone", () => {
    const body = "it('x', () => { runPropertyHelper(arbitrary); });";
    expect(classifyTest(at("test/a.test.ts", body), GLOBS)).toBe("example");
    expect(classifyTest(at("test/a.property.test.ts", body), GLOBS)).toBe("property");
  });
});
