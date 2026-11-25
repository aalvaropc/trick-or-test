// Property 11: Property-test classification. Validates: Requirements 6.3, 6.4, 6.5
import fc from "fast-check";
import { describe, it } from "vitest";
import { classifyTest } from "../../src/core/test-classification.js";

const GLOBS = ["**/*.property.test.ts", "test/props/**"];

const ident = fc.stringMatching(/^[a-z][a-z0-9]{0,8}$/);

const dir = fc.constantFrom("test", "test/core", "src/deep/dir", "pkg/test");

/** File paths that match none of the configured globs. */
const plainPath = fc.tuple(dir, ident).map(([d, n]) => `${d}/${n}.test.ts`);
/** File paths that match a configured glob. */
const globPath = fc.oneof(
  fc.tuple(dir, ident).map(([d, n]) => `${d}/${n}.property.test.ts`),
  ident.map((n) => `test/props/${n}.test.ts`),
);

/** Bodies whose own code calls fc.assert, fc.check or test.prop. */
const propertyBody = fc
  .tuple(
    fc.constantFrom(
      "fc.assert(fc.property(fc.integer(), (n) => n === n));",
      "fc.check(fc.property(fc.string(), () => true));",
      "fc.assert<[number]>(fc.property(fc.nat(), () => true));",
      "fc . assert (fc.property(fc.nat(), () => true));",
      "test.prop([fc.integer()])('x', (n) => { expect(n).toBe(n); });",
    ),
    ident,
  )
  .map(([call, name]) => `const ${name} = 1;\n${call}\nexpect(${name}).toBe(1);`);

/** Bodies with no call to those functions, including inert mentions. */
const exampleBody = fc
  .tuple(
    fc.constantFrom(
      "expect(1 + 1).toBe(2);",
      "expect(add(2, 3)).toBe(5);",
      "// fc.assert(fc.property(fc.nat(), () => true));\nexpect(true).toBe(true);",
      "/* test.prop([fc.nat()]) */ expect(1).toBe(1);",
      'const s = "fc.check(x)"; expect(s).toBe("fc.check(x)");',
      "const t = `fc.assert(1)`; expect(t).toBeTruthy();",
      "expect(myfc.assert(1)).toBe(1);",
      "const x = helperFc.check; expect(x).toBeDefined();",
      "runPropertyHelper(); expect(1).toBe(1);",
    ),
    ident,
  )
  .map(([stmt, name]) => `const ${name} = 1;\n${stmt}`);

describe("Property 11: Property-test classification", () => {
  it("6.4 a test whose own body calls fc.assert, fc.check or test.prop is a property test on any path", () => {
    fc.assert(
      fc.property(fc.oneof(plainPath, globPath), propertyBody, (filePath, bodySource) => {
        return classifyTest({ filePath, bodySource }, GLOBS) === "property";
      }),
    );
  });

  it("6.3 a test in a file matching a property-test glob is a property test whatever its body", () => {
    fc.assert(
      fc.property(globPath, fc.oneof(propertyBody, exampleBody), (filePath, bodySource) => {
        return classifyTest({ filePath, bodySource }, GLOBS) === "property";
      }),
    );
  });

  it("6.5 a test with no property call in its body and a non-matching path is an example test", () => {
    fc.assert(
      fc.property(plainPath, exampleBody, (filePath, bodySource) => {
        return classifyTest({ filePath, bodySource }, GLOBS) === "example";
      }),
    );
  });

  it("6.3 6.4 6.5 classification is property if and only if the body calls fast-check or the path matches a glob", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            inGlobFile: fc.boolean(),
            hasCall: fc.boolean(),
            path: fc.constant(null),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        fc.array(fc.tuple(plainPath, globPath, propertyBody, exampleBody), {
          minLength: 8,
          maxLength: 8,
        }),
        (flags, pool) =>
          flags.every((flag, i) => {
            const [plain, glob, prop, example] = pool[i] as [string, string, string, string];
            const filePath = flag.inGlobFile ? glob : plain;
            const bodySource = flag.hasCall ? prop : example;
            const expected = flag.inGlobFile || flag.hasCall ? "property" : "example";
            return classifyTest({ filePath, bodySource }, GLOBS) === expected;
          }),
      ),
    );
  });

  it("6.3 a file path matching any expansion of a brace glob is a property test with no fast-check call in its body", () => {
    const subDir = fc.constantFrom("", "core/", "deep/dir/");
    const braceCase = fc.uniqueArray(ident, { minLength: 2, maxLength: 4 }).chain((alts) =>
      fc.record({
        alts: fc.constant(alts),
        picked: fc.constantFrom(...alts),
        sub: subDir,
        name: ident,
      }),
    );
    fc.assert(
      fc.property(braceCase, exampleBody, ({ alts, picked, sub, name }, bodySource) => {
        const glob = `test/**/*.{${alts.join(",")}}.test.ts`;
        const filePath = `test/${sub}${name}.${picked}.test.ts`;
        return classifyTest({ filePath, bodySource }, [glob]) === "property";
      }),
    );
  });

  it("6.3 with no configured globs only the body decides", () => {
    fc.assert(
      fc.property(
        fc.oneof(plainPath, globPath),
        fc.boolean(),
        propertyBody,
        exampleBody,
        (filePath, hasCall, prop, example) =>
          classifyTest({ filePath, bodySource: hasCall ? prop : example }, []) ===
          (hasCall ? "property" : "example"),
      ),
    );
  });
});
