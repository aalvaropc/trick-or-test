/**
 * Baseline tests (Requirements 6.11, 6.12). Pure: no file system, no `node:` import.
 */
import { classifyTest } from "./test-classification.js";
import type { BaselineTest, TestId } from "./types.js";

export type PassedTestInput = {
  filePath: string;
  fullName: string;
  startLine: number;
  bodySource: string;
  status: "passed" | "failed" | "skipped" | "todo";
};

/** The one format of a test id, for killing tests and baseline tests: `<file>::<full name>`. */
export const toTestId = (file: string, fullName: string): TestId =>
  `${file}::${fullName}` as TestId;

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** One entry per passed test, sorted by id and then by start line; equal ids stay separate. */
export const buildBaselineTests = (
  tests: PassedTestInput[],
  propertyTestGlobs: string[],
): BaselineTest[] =>
  tests
    .filter((test) => test.status === "passed")
    .map((test) => ({
      id: toTestId(test.filePath, test.fullName),
      startLine: test.startLine,
      kind: classifyTest(test, propertyTestGlobs),
    }))
    .sort((a, b) => compareText(a.id, b.id) || a.startLine - b.startLine)
    .map(({ id, kind }) => ({ id, kind }));
