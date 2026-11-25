/** The part of Vitest's JSON reporter output that decides pass or fail. */
export type VitestJson = {
  readonly testResults: readonly {
    readonly name: string;
    readonly status: string;
    readonly assertionResults: readonly {
      readonly fullName: string;
      readonly status: string;
    }[];
  }[];
};

export type FailingTest = {
  /** Test full name, or the file path for a file-level failure. */
  readonly name: string;
  readonly filePath: string;
};

/**
 * Failing_Tests of one Vitest run, in file order (Requirements 3.15, 5.9, 5.10).
 * A failed file without assertion results (import or collection error) counts as
 * one Failing_Test named after the file. A failed file with failed assertions
 * yields only those assertions.
 */
export const extractFailingTests = (json: VitestJson): FailingTest[] =>
  json.testResults.flatMap((file) => {
    const failed = file.assertionResults.filter((t) => t.status === "failed");
    if (failed.length > 0) return failed.map((t) => ({ name: t.fullName, filePath: file.name }));
    if (file.status === "failed" && file.assertionResults.length === 0) {
      return [{ name: file.name, filePath: file.name }];
    }
    return [];
  });
