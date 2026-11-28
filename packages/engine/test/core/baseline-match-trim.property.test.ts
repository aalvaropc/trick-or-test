// Property 39: Separator by Vitest version and trimmed key. Validates: Requirements 6.14, 6.17
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type BaselineTestSource,
  indexBaselineTests,
  matchBaselineTest,
} from "../../src/core/baseline-match.js";

const title = fc.constantFrom(
  "a",
  "case ",
  " lead",
  " both ",
  "",
  "   ",
  "é ü",
  "日本 ",
  "x > y",
  "p q",
  "\t",
);
const source: fc.Arbitrary<BaselineTestSource> = fc.record({
  file: fc.constantFrom("test/a.test.ts", "test/b.test.ts"),
  titles: fc.array(title, { minLength: 1, maxLength: 4 }),
  startLine: fc.integer({ min: 0, max: 9 }),
});
const separator = fc.constantFrom(" > " as const, " " as const);

describe("baseline-match trim properties", () => {
  it("39 the killer with the trimmed joined titles finds the test, with the untrimmed id", () => {
    fc.assert(
      fc.property(source, separator, (t, sep) => {
        const index = indexBaselineTests([t], sep);
        const id = `${t.file}::${t.titles.join(" ")}`;
        expect(matchBaselineTest(index, { file: t.file, name: t.titles.join(sep).trim() })).toBe(
          id,
        );
      }),
    );
  });

  it("39 the killer with the untrimmed joined titles finds the test, with the untrimmed id", () => {
    fc.assert(
      fc.property(source, separator, (t, sep) => {
        const index = indexBaselineTests([t], sep);
        const id = `${t.file}::${t.titles.join(" ")}`;
        expect(matchBaselineTest(index, { file: t.file, name: t.titles.join(sep) })).toBe(id);
      }),
    );
  });

  it("39 a trimmed name shared by two tests with other ids gives none, or the start line decides", () => {
    fc.assert(
      fc.property(source, separator, fc.constantFrom(" ", "  ", "\t"), (t, sep, pad) => {
        const other: BaselineTestSource = {
          ...t,
          titles: [...t.titles.slice(0, -1), `${t.titles.at(-1)?.trimEnd()}${pad}`],
          startLine: t.startLine + 100,
        };
        fc.pre(t.titles.join(" ") !== other.titles.join(" "));
        const index = indexBaselineTests([t, other], sep);
        const name = t.titles.join(sep).trim();
        fc.pre(name === other.titles.join(sep).trim());
        expect(matchBaselineTest(index, { file: t.file, name })).toBe("none");
        expect(matchBaselineTest(index, { file: t.file, name, startLine: other.startLine })).toBe(
          `${t.file}::${other.titles.join(" ")}`,
        );
      }),
    );
  });

  it("39 the id does not depend on the separator", () => {
    fc.assert(
      fc.property(source, (t) => {
        const a = matchBaselineTest(indexBaselineTests([t], " > "), {
          file: t.file,
          name: t.titles.join(" > ").trim(),
        });
        const b = matchBaselineTest(indexBaselineTests([t], " "), {
          file: t.file,
          name: t.titles.join(" ").trim(),
        });
        expect(a).toBe(b);
      }),
    );
  });
});
