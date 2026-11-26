// Property 36: Killing-test match. Validates: Requirements 6.13, 6.14, 6.15
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type BaselineTestSource,
  indexBaselineTests,
  matchBaselineTest,
} from "../../src/core/baseline-match.js";

const file = fc.constantFrom("test/a.test.ts", "test/b.test.ts", "test/sub/c.test.ts");

const title = fc.constantFrom("a", "b", "a > b", "x y", "é 日本", "", "one", "a b");

const titles = fc.array(title, { minLength: 1, maxLength: 3 });

const source: fc.Arbitrary<BaselineTestSource> = fc.record({
  file,
  titles,
  startLine: fc.integer({ min: 0, max: 4 }),
});

const sources = fc.array(source, { minLength: 1, maxLength: 12 });

const idOf = (s: BaselineTestSource): string => `${s.file}::${s.titles.join(" ")}`;
const arrowOf = (s: BaselineTestSource): string => s.titles.join(" > ");

/** Other tests of the same file with the same ' > ' text but a different id. */
const sameTextOthers = (list: BaselineTestSource[], t: BaselineTestSource) =>
  list.filter((o) => o.file === t.file && arrowOf(o) === arrowOf(t) && idOf(o) !== idOf(t));

describe("baseline-match properties", () => {
  it("36 an unambiguous test is found by its ' > ' name, with or without a start line", () => {
    fc.assert(
      fc.property(sources, (list) => {
        const index = indexBaselineTests(list);
        for (const t of list) {
          if (sameTextOthers(list, t).length > 0) continue;
          const name = arrowOf(t);
          expect(matchBaselineTest(index, { file: t.file, name })).toBe(idOf(t));
          expect(matchBaselineTest(index, { file: t.file, name, startLine: t.startLine })).toBe(
            idOf(t),
          );
        }
      }),
    );
  });

  it("36 an ambiguous name is resolved only by a start line that selects one id", () => {
    fc.assert(
      fc.property(sources, fc.integer({ min: 0, max: 5 }), (list, line) => {
        const index = indexBaselineTests(list);
        for (const t of list) {
          if (sameTextOthers(list, t).length === 0) continue;
          const name = arrowOf(t);
          expect(matchBaselineTest(index, { file: t.file, name })).toBe("none");
          const atLine = list.filter(
            (o) => o.file === t.file && arrowOf(o) === name && o.startLine === line,
          );
          const ids = [...new Set(atLine.map(idOf))];
          expect(matchBaselineTest(index, { file: t.file, name, startLine: line })).toBe(
            ids.length === 1 ? ids[0] : "none",
          );
        }
      }),
    );
  });

  it("36 a name that is no test's ' > ' text gives none, and so does another file", () => {
    fc.assert(
      fc.property(sources, (list) => {
        const index = indexBaselineTests(list);
        expect(matchBaselineTest(index, { file: list[0]?.file ?? "", name: "never-a-title" })).toBe(
          "none",
        );
        expect(matchBaselineTest(index, { file: "test/elsewhere.test.ts", name: "a" })).toBe(
          "none",
        );
        for (const t of list) {
          const spaced = t.titles.join(" ");
          const known = list.some((o) => o.file === t.file && arrowOf(o) === spaced);
          if (!known) {
            expect(matchBaselineTest(index, { file: t.file, name: spaced })).toBe("none");
          }
        }
      }),
    );
  });

  it("36 two tests with the same file and titles give their one shared id", () => {
    fc.assert(
      fc.property(source, fc.integer({ min: 0, max: 9 }), (t, otherLine) => {
        const index = indexBaselineTests([t, { ...t, startLine: otherLine }]);
        expect(matchBaselineTest(index, { file: t.file, name: arrowOf(t) })).toBe(idOf(t));
      }),
    );
  });

  it("36 the result ignores input order and the call changes nothing", () => {
    fc.assert(
      fc.property(sources, fc.integer({ min: 0, max: 5 }), (list, line) => {
        const before = JSON.stringify(list);
        const forward = indexBaselineTests(list);
        const backward = indexBaselineTests([...list].reverse());
        for (const t of list) {
          const killer = { file: t.file, name: arrowOf(t), startLine: line };
          const killerBefore = JSON.stringify(killer);
          expect(matchBaselineTest(backward, killer)).toBe(matchBaselineTest(forward, killer));
          expect(JSON.stringify(killer)).toBe(killerBefore);
        }
        expect(JSON.stringify(list)).toBe(before);
      }),
    );
  });
});
