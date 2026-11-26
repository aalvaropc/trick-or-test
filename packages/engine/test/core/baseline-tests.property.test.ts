// Property 31: Baseline tests. Validates: Requirements 6.3, 6.4, 6.5, 6.11, 6.12, 6.13
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  buildBaselineTests,
  type PassedTestInput,
  toTestId,
} from "../../src/core/baseline-tests.js";
import { classifyTest } from "../../src/core/test-classification.js";

const GLOBS = ["**/*.property.test.ts"];

const file = fc.constantFrom(
  "test/a.test.ts",
  "test/b.test.ts",
  "test/core/c.property.test.ts",
  "test/d.property.test.ts",
);

/** A small pool of names, so that equal full names occur inside one file. */
const fullName = fc.constantFrom("suite one", "suite two", "x", "suite one > nested", "a::b");

const body = fc.constantFrom(
  "expect(1 + 1).toBe(2);",
  "fc.assert(fc.property(fc.integer(), (n) => n === n));",
  "// fc.assert(fc.property(fc.nat(), () => true));\nexpect(true).toBe(true);",
  "test.prop([fc.integer()])('x', () => {});",
);

const status = fc.constantFrom("passed", "failed", "skipped", "todo") as fc.Arbitrary<
  PassedTestInput["status"]
>;

/** Start lines are unique per run, so equal ids are ordered by their line. */
const tests = fc.uniqueArray(fc.integer({ min: 1, max: 500 }), { maxLength: 25 }).chain((lines) =>
  fc.tuple(
    ...lines.map((startLine) =>
      fc.record({
        filePath: file,
        fullName,
        startLine: fc.constant(startLine),
        bodySource: body,
        status,
      }),
    ),
  ),
) as fc.Arbitrary<PassedTestInput[]>;

const shuffledTests = tests.chain((list) =>
  fc.tuple(
    fc.constant(list),
    fc.shuffledSubarray(list, { minLength: list.length, maxLength: list.length }),
  ),
);

describe("Property 31: Baseline tests", () => {
  it("6.11 has one entry per passed test and none for a failed, skipped or todo test", () => {
    fc.assert(
      fc.property(tests, (list) => {
        const passed = list.filter((t) => t.status === "passed").length;
        expect(buildBaselineTests(list, GLOBS)).toHaveLength(passed);
      }),
    );
  });

  it("6.11 builds each id as file::full name, and a killing test id appears in the list", () => {
    fc.assert(
      fc.property(tests, (list) => {
        const result = buildBaselineTests(list, GLOBS);
        const expectedIds = list
          .filter((t) => t.status === "passed")
          .map((t) => `${t.filePath}::${t.fullName}`)
          .sort();
        expect(result.map((t) => t.id as string).sort()).toEqual(expectedIds);
        for (const t of list.filter((x) => x.status === "passed")) {
          const killingId = toTestId(t.filePath, t.fullName);
          expect(result.some((entry) => entry.id === killingId)).toBe(true);
        }
      }),
    );
  });

  it("6.3 6.4 6.5 gives each entry the kind that classifyTest gives", () => {
    fc.assert(
      fc.property(tests, (list) => {
        const result = buildBaselineTests(list, GLOBS);
        const expectedKinds = list
          .filter((t) => t.status === "passed")
          .map((t) => `${t.filePath}::${t.fullName}=${classifyTest(t, GLOBS)}`)
          .sort();
        expect(result.map((t) => `${t.id}=${t.kind}`).sort()).toEqual(expectedKinds);
      }),
    );
  });

  it("6.12 sorts by id and then by start line", () => {
    fc.assert(
      fc.property(tests, (list) => {
        const result = buildBaselineTests(list, GLOBS);
        const ids = result.map((t) => t.id as string);
        expect(ids).toEqual([...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
        // Equal ids: the kinds follow the start lines of the passed tests with that id.
        for (const id of new Set(ids)) {
          const sameId = list
            .filter((t) => t.status === "passed" && toTestId(t.filePath, t.fullName) === id)
            .sort((a, b) => a.startLine - b.startLine)
            .map((t) => classifyTest(t, GLOBS));
          expect(result.filter((t) => t.id === id).map((t) => t.kind)).toEqual(sameId);
        }
      }),
    );
  });

  it("6.13 gives the same list for the same input in another order", () => {
    fc.assert(
      fc.property(shuffledTests, ([list, shuffled]) => {
        expect(buildBaselineTests(shuffled, GLOBS)).toEqual(buildBaselineTests(list, GLOBS));
      }),
    );
  });
});
