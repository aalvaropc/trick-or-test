import { describe, expect, it } from "vitest";
import { extractFailingTests, type VitestJson } from "../../src/core/suite-result.js";

describe("extractFailingTests", () => {
  it("5.9 a failed assertion is one Failing_Test named after the test", () => {
    const json: VitestJson = {
      testResults: [
        {
          name: "test/a.test.ts",
          status: "failed",
          assertionResults: [
            { fullName: "adds", status: "passed" },
            { fullName: "subtracts", status: "failed" },
          ],
        },
      ],
    };
    expect(extractFailingTests(json)).toEqual([{ name: "subtracts", filePath: "test/a.test.ts" }]);
  });

  it("3.15 a file that throws at import is one Failing_Test named after the file", () => {
    const json: VitestJson = {
      testResults: [{ name: "test/broken.test.ts", status: "failed", assertionResults: [] }],
    };
    expect(extractFailingTests(json)).toEqual([
      { name: "test/broken.test.ts", filePath: "test/broken.test.ts" },
    ]);
  });

  it("3.15 a file that fails at collection is one Failing_Test named after the file", () => {
    const json: VitestJson = {
      testResults: [
        {
          name: "test/ok.test.ts",
          status: "passed",
          assertionResults: [{ fullName: "x", status: "passed" }],
        },
        { name: "test/collect.test.ts", status: "failed", assertionResults: [] },
      ],
    };
    expect(extractFailingTests(json)).toEqual([
      { name: "test/collect.test.ts", filePath: "test/collect.test.ts" },
    ]);
  });

  it("5.10 a failed file with failed assertions yields only those assertions", () => {
    const json: VitestJson = {
      testResults: [
        {
          name: "test/a.test.ts",
          status: "failed",
          assertionResults: [
            { fullName: "one", status: "failed" },
            { fullName: "two", status: "passed" },
            { fullName: "three", status: "failed" },
          ],
        },
      ],
    };
    expect(extractFailingTests(json)).toEqual([
      { name: "one", filePath: "test/a.test.ts" },
      { name: "three", filePath: "test/a.test.ts" },
    ]);
  });

  it("5.9 a passing run has no Failing_Tests", () => {
    const json: VitestJson = {
      testResults: [
        {
          name: "test/a.test.ts",
          status: "passed",
          assertionResults: [
            { fullName: "one", status: "passed" },
            { fullName: "two", status: "skipped" },
          ],
        },
      ],
    };
    expect(extractFailingTests(json)).toEqual([]);
  });

  it("5.10 several failed files are listed in file order", () => {
    const json: VitestJson = {
      testResults: [
        { name: "test/b.test.ts", status: "failed", assertionResults: [] },
        {
          name: "test/a.test.ts",
          status: "failed",
          assertionResults: [{ fullName: "t", status: "failed" }],
        },
        { name: "test/c.test.ts", status: "failed", assertionResults: [] },
      ],
    };
    expect(extractFailingTests(json)).toEqual([
      { name: "test/b.test.ts", filePath: "test/b.test.ts" },
      { name: "t", filePath: "test/a.test.ts" },
      { name: "test/c.test.ts", filePath: "test/c.test.ts" },
    ]);
  });
});
