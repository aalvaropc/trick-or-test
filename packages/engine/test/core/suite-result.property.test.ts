// Property 21: Failing tests include file-level failures. Validates: Requirements 3.15, 5.9, 5.10
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  extractFailingTests,
  type FailingTest,
  type VitestJson,
} from "../../src/core/suite-result.js";

type TestStatus = "passed" | "failed" | "skipped";

type FileSpec =
  | { kind: "passed"; statuses: TestStatus[] }
  | { kind: "failedAssertions"; statuses: TestStatus[] }
  | { kind: "fileLevel" };

const okStatus = fc.constantFrom<TestStatus>("passed", "skipped");
const anyStatus = fc.constantFrom<TestStatus>("passed", "failed", "skipped");

const fileSpec: fc.Arbitrary<FileSpec> = fc.oneof(
  fc.record({
    kind: fc.constant("passed" as const),
    statuses: fc.array(okStatus, { minLength: 1, maxLength: 4 }),
  }),
  fc.record({
    kind: fc.constant("failedAssertions" as const),
    statuses: fc
      .tuple(fc.array(anyStatus, { maxLength: 3 }), fc.array(anyStatus, { maxLength: 3 }))
      .map(([before, after]) => [...before, "failed" as const, ...after]),
  }),
  fc.constant({ kind: "fileLevel" as const }),
);

const files = fc.array(fileSpec, { maxLength: 6 });

/** Builds the Vitest JSON and, by construction, the Failing_Tests it must yield. */
const build = (specs: FileSpec[]): { json: VitestJson; expected: FailingTest[] } => {
  const expected: FailingTest[] = [];
  const testResults = specs.map((spec, f) => {
    const name = `test/file-${f}.test.ts`;
    if (spec.kind === "fileLevel") {
      expected.push({ name, filePath: name });
      return { name, status: "failed", assertionResults: [] };
    }
    const assertionResults = spec.statuses.map((status, t) => {
      const fullName = `file ${f} test ${t}`;
      if (status === "failed") expected.push({ name: fullName, filePath: name });
      return { fullName, status };
    });
    return {
      name,
      status: spec.kind === "passed" ? "passed" : "failed",
      assertionResults,
    };
  });
  return { json: { testResults }, expected };
};

describe("extractFailingTests properties", () => {
  it("5.9 every failed test and every file-level failure is a Failing_Test, in file order", () => {
    fc.assert(
      fc.property(files, (specs) => {
        const { json, expected } = build(specs);
        expect(extractFailingTests(json)).toEqual(expected);
      }),
    );
  });

  it("3.15 a failed file without assertion results yields exactly one Failing_Test named after the file", () => {
    fc.assert(
      fc.property(files, (specs) => {
        const { json } = build(specs);
        const result = extractFailingTests(json);
        for (const file of json.testResults) {
          if (file.status === "failed" && file.assertionResults.length === 0) {
            const matches = result.filter((r) => r.filePath === file.name);
            expect(matches).toEqual([{ name: file.name, filePath: file.name }]);
          }
        }
      }),
    );
  });

  it("5.10 a failed file with failed assertions never yields its own path as a Failing_Test", () => {
    fc.assert(
      fc.property(files, (specs) => {
        const { json } = build(specs);
        const result = extractFailingTests(json);
        for (const file of json.testResults) {
          if (file.assertionResults.some((t) => t.status === "failed")) {
            expect(result.some((r) => r.name === file.name)).toBe(false);
          }
        }
      }),
    );
  });

  it("5.9 a result with no failed test and no failed file yields an empty list", () => {
    const passingOnly = fc.array(
      fc.record({
        kind: fc.constant("passed" as const),
        statuses: fc.array(okStatus, { maxLength: 4 }),
      }),
      { maxLength: 6 },
    );
    fc.assert(
      fc.property(passingOnly, (specs) => {
        expect(extractFailingTests(build(specs).json)).toEqual([]);
      }),
    );
  });
});
