// Property 38: Unrun test files. Validates: Requirements 3.23
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { findUnrunTestFiles } from "../../src/core/unrun-test-files.js";

const segment = fc.constantFrom("a", "b", "extra", "test");
const path = fc
  .tuple(fc.array(segment, { maxLength: 2 }), fc.constantFrom("x.test.ts", "y.test.ts"))
  .map(([dirs, file]) => [...dirs, file].join("/"));
const paths = fc.array(path, { maxLength: 8 });

const sortedUnique = (values: string[]): string[] =>
  [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

describe("unrun test files properties", () => {
  it("3.23 paths are the sorted unique paths of the first list absent from the second", () => {
    fc.assert(
      fc.property(paths, paths, (first, second) => {
        const result = findUnrunTestFiles(first, second);
        const expected = sortedUnique(first.filter((p) => !second.includes(p)));
        expect(result.paths).toEqual(expected);
        expect(result.count).toBe(expected.length);
      }),
    );
  });

  it("3.23 the result ignores order and duplicates and leaves the inputs unchanged", () => {
    fc.assert(
      fc.property(paths, paths, (first, second) => {
        const firstCopy = [...first];
        const secondCopy = [...second];
        const result = findUnrunTestFiles(first, second);
        expect(first).toEqual(firstCopy);
        expect(second).toEqual(secondCopy);
        expect(
          findUnrunTestFiles([...first].reverse().concat(first), [...second].reverse()),
        ).toEqual(result);
      }),
    );
  });

  it("3.23 a subset gives no unrun file and a path only in the second never appears", () => {
    fc.assert(
      fc.property(paths, paths, (first, extra) => {
        expect(findUnrunTestFiles(first, [...first, ...extra]).count).toBe(0);
        const onlySecond = extra.filter((p) => !first.includes(p));
        const result = findUnrunTestFiles(first, extra);
        for (const p of onlySecond) expect(result.paths).not.toContain(p);
      }),
    );
  });
});
