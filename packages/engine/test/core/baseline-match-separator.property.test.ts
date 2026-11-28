// Property 39: Separator by Vitest version and trimmed key. Validates: Requirements 6.14, 6.16, 6.17
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type BaselineTestSource,
  indexBaselineTests,
  matchBaselineTest,
  strykerSeparatorFor,
} from "../../src/core/baseline-match.js";

const word = fc.constantFrom("a", "b", "one", "x y", "é");
const source: fc.Arbitrary<BaselineTestSource> = fc.record({
  file: fc.constantFrom("test/a.test.ts", "test/b.test.ts"),
  titles: fc.array(word, { minLength: 2, maxLength: 3 }),
  startLine: fc.integer({ min: 0, max: 9 }),
});
const major = fc.integer({ min: 0, max: 40 });
const tail = fc.constantFrom("", ".0.0", ".3.1", ".0.0-beta.1");

describe("baseline-match separator properties", () => {
  it("39 the separator is ' ' below version 5 and ' > ' from version 5", () => {
    fc.assert(
      fc.property(major, tail, (n, rest) => {
        expect(strykerSeparatorFor(`${n}${rest}`)).toBe(n >= 5 ? " > " : " ");
      }),
    );
  });

  it("39 a version with no leading number gives ' > '", () => {
    fc.assert(
      fc.property(fc.constantFrom("", "unknown", "v4.0.0", "x5"), (v) => {
        expect(strykerSeparatorFor(v)).toBe(" > ");
      }),
    );
  });

  it("39 a test is found by its titles joined with the chosen separator only", () => {
    fc.assert(
      fc.property(source, fc.constantFrom(" > " as const, " " as const), (t, sep) => {
        const other = sep === " " ? " > " : " ";
        const index = indexBaselineTests([t], sep);
        const id = `${t.file}::${t.titles.join(" ")}`;
        expect(matchBaselineTest(index, { file: t.file, name: t.titles.join(sep) })).toBe(id);
        // "x y" contains a space, so the other spelling may still equal the key by chance.
        if (t.titles.join(other) !== t.titles.join(sep)) {
          expect(matchBaselineTest(index, { file: t.file, name: t.titles.join(other) })).toBe(
            "none",
          );
        }
      }),
    );
  });
});
