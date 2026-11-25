import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  extractStrykerError,
  type StrykerAttempt,
  shouldRetryWithIgnoreStatic,
} from "../../src/core/stryker-output.js";

// Real StrykerJS 10.1.1 output, see test/fixtures/stryker/PROVENANCE.md.
// The captures write the ESC byte as `^[`; decode it to get what the adapter receives.
const capture = (name: string): string =>
  readFileSync(new URL(`../fixtures/stryker/${name}`, import.meta.url), "utf8").replaceAll(
    "^[",
    "\u001b",
  );

const succeeded = capture("run-succeeded.txt");
const dryRunFailedModuleConstant = capture("dry-run-failed-module-constant.txt");
const dryRunFailedInlineLiteral = capture("dry-run-failed-inline-literal.txt");
const failedAfterDryRun = capture("failed-after-dry-run.txt");

const failed = (output: string): StrykerAttempt => ({ exitCode: 1, output });

const NO_OUTPUT_MESSAGE = "StrykerJS failed and printed no output";

describe("extractStrykerError", () => {
  it("3.6 a failed dry run reports its first ERROR-level line, without colour codes", () => {
    expect(extractStrykerError(dryRunFailedModuleConstant)).toBe(
      "16:00:30 (545566) ERROR DryRunExecutor One or more tests failed in the initial test run:",
    );
  });

  it("3.6 a failed dry run without a module constant reports its first ERROR-level line", () => {
    expect(extractStrykerError(dryRunFailedInlineLiteral)).toBe(
      "16:00:41 (547004) ERROR DryRunExecutor One or more tests failed in the initial test run:",
    );
  });

  it("3.6 a failure after a successful dry run reports its ERROR-level line, not a later INFO line", () => {
    expect(extractStrykerError(failedAfterDryRun)).toBe(
      "16:00:50 (548337) ERROR MutationTestReportHelper Final mutation score 50.00 under breaking threshold 100, setting exit code to 1 (failure).",
    );
  });

  it("3.6 an output without an ERROR-level line reports its last non-empty line", () => {
    expect(extractStrykerError(succeeded)).toBe(
      "16:00:58 (549613) INFO MutationTestExecutor Done in 2 seconds.",
    );
  });

  it("3.6 trailing blank lines do not hide the last non-empty line", () => {
    expect(extractStrykerError("first\nsecond\n\n  \n")).toBe("second");
  });

  it("3.6 an empty output returns a fixed message that names the missing output", () => {
    expect(extractStrykerError("")).toBe(NO_OUTPUT_MESSAGE);
  });

  it("3.6 an output with only blank lines returns the same fixed message", () => {
    expect(extractStrykerError("\n  \n\t\n\r\n")).toBe(NO_OUTPUT_MESSAGE);
  });

  it("10.12 an ERROR-level line is found in output with no colour codes", () => {
    expect(extractStrykerError("12:00:00 (1) INFO A ok\n12:00:01 (1) ERROR B broke\n")).toBe(
      "12:00:01 (1) ERROR B broke",
    );
  });
});

describe("shouldRetryWithIgnoreStatic", () => {
  it("3.5 a failed dry run with a module-level constant is retried", () => {
    expect(shouldRetryWithIgnoreStatic(failed(dryRunFailedModuleConstant))).toBe(true);
  });

  it("3.5 a failed dry run without a module-level constant is retried too", () => {
    expect(shouldRetryWithIgnoreStatic(failed(dryRunFailedInlineLiteral))).toBe(true);
  });

  it("3.5 the dry-run failure is recognised in output with no colour codes", () => {
    const plain = readFileSync(
      new URL("../fixtures/stryker/dry-run-failed-inline-literal.txt", import.meta.url),
      "utf8",
    ).replace(/\^\[\[\d+m/g, "");
    expect(plain).not.toContain("\u001b");
    expect(shouldRetryWithIgnoreStatic(failed(plain))).toBe(true);
  });

  it("3.17 a failure after a successful dry run is not retried", () => {
    expect(shouldRetryWithIgnoreStatic(failed(failedAfterDryRun))).toBe(false);
  });

  it("3.5 a successful run is not retried", () => {
    expect(shouldRetryWithIgnoreStatic({ exitCode: 0, output: succeeded })).toBe(false);
  });

  it("3.5 a run that exits 0 is not retried even when its output shows a failed dry run", () => {
    expect(shouldRetryWithIgnoreStatic({ exitCode: 0, output: dryRunFailedInlineLiteral })).toBe(
      false,
    );
  });

  it("3.17 a failure with empty output is not retried", () => {
    expect(shouldRetryWithIgnoreStatic(failed(""))).toBe(false);
  });

  it("3.17 a failure with only blank lines is not retried", () => {
    expect(shouldRetryWithIgnoreStatic(failed("\n \n"))).toBe(false);
  });
});
