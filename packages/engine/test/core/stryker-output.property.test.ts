// Property 23: StrykerJS error selection. Validates: Requirements 3.5, 3.6, 3.17
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  extractStrykerError,
  NO_STRYKER_OUTPUT_MESSAGE,
  shouldRetryWithIgnoreStatic,
} from "../../src/core/stryker-output.js";

const ESC = String.fromCharCode(27);

const ERROR_LEVEL = /^\S+ \(\d+\) ERROR\s/;

// Text without line breaks.
const inline = fc.string().map((s) => s.replace(/[\r\n]/g, " "));

const timestamp = fc
  .tuple(fc.nat({ max: 23 }), fc.nat({ max: 59 }), fc.nat({ max: 59 }))
  .map(([h, m, s]) => [h, m, s].map((n) => String(n).padStart(2, "0")).join(":"));
const pid = fc.integer({ min: 1, max: 99999 });

const logLine = (level: string) =>
  fc
    .tuple(timestamp, pid, fc.constantFrom("Stryker", "Instrumenter", "Sandbox"), inline)
    .map(([time, id, category, message]) => `${time} (${id}) ${level} ${category} ${message}`);

const errorLine = logLine("ERROR");
const infoLine = logLine("INFO");

const blankLine = fc.stringMatching(/^[ \t]{0,4}$/);

// Free text that is neither blank nor an ERROR-level log line.
const plainLine = inline.filter((line) => line.trim() !== "" && !ERROR_LEVEL.test(line.trimEnd()));

type Tagged = { readonly text: string; readonly kind: "error" | "blank" | "other" };

const taggedError = errorLine.map((text): Tagged => ({ text, kind: "error" }));
const taggedBlank = blankLine.map((text): Tagged => ({ text, kind: "blank" }));
const taggedOther = fc.oneof(infoLine, plainLine).map((text): Tagged => ({ text, kind: "other" }));

const lineEnding = fc.constantFrom("\n", "\r\n");
const join = (lines: readonly Tagged[], ending: string): string =>
  lines.map((line) => line.text).join(ending);

const withErrors = fc.array(fc.oneof(taggedError, taggedBlank, taggedOther), {
  minLength: 1,
  maxLength: 12,
});
const withoutErrors = fc.array(fc.oneof(taggedBlank, taggedOther), { maxLength: 12 });

const DRY_RUN_FAILED_LINES = [
  "One or more tests failed in the initial test run",
  "There were failed tests in the initial test run.",
] as const;
const dryRunFailedLine = fc
  .tuple(timestamp, pid, fc.constantFrom(0, 1))
  .map(([time, id, variant]) =>
    variant === 0
      ? `${time} (${id}) ERROR DryRunExecutor ${DRY_RUN_FAILED_LINES[0]}`
      : `${time} (${id}) ERROR Stryker ${DRY_RUN_FAILED_LINES[1]}`,
  );

// Failures that happen after a successful dry run, or for any other reason.
const dryRunSucceededLine = fc
  .tuple(timestamp, pid, fc.nat({ max: 500 }))
  .map(
    ([time, id, tests]) =>
      `${time} (${id}) INFO DryRunExecutor Initial test run succeeded. Ran ${tests} tests.`,
  );
const laterErrorLine = fc
  .tuple(timestamp, pid, fc.constantFrom("Stryker", "MutationTestExecutor", "Sandbox"), inline)
  .map(([time, id, category, message]) => `${time} (${id}) ERROR ${category} ${message}`)
  .filter((line) => !DRY_RUN_FAILED_LINES.some((marker) => line.includes(marker)));

const nonZeroExit = fc.integer({ min: -255, max: 255 }).filter((code) => code !== 0);

const lastNonBlank = (lines: readonly Tagged[]): string | undefined =>
  lines.findLast((line) => line.kind !== "blank")?.text.trimEnd();

describe("Property 23: StrykerJS error selection", () => {
  it("3.6 extractStrykerError never throws and always returns a non-empty string", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.string({ unit: "binary" })), (output) => {
        const line = extractStrykerError(output);
        expect(typeof line).toBe("string");
        expect(line).not.toBe("");
      }),
    );
  });

  it("3.6 the first ERROR-level line is returned when there is one", () => {
    fc.assert(
      fc.property(withErrors, lineEnding, (lines, ending) => {
        const first = lines.find((line) => line.kind === "error");
        fc.pre(first !== undefined);
        expect(extractStrykerError(join(lines, ending))).toBe(first?.text.trimEnd());
      }),
    );
  });

  it("3.6 colour codes around an ERROR-level line are removed", () => {
    fc.assert(
      fc.property(errorLine, infoLine, (error, info) => {
        const output = `${info}\n${ESC}[31m${error}${ESC}[39m\n`;
        expect(extractStrykerError(output)).toBe(error.trimEnd());
      }),
    );
  });

  it("3.6 the last non-empty line is returned when no line is ERROR-level", () => {
    fc.assert(
      fc.property(withoutErrors, lineEnding, (lines, ending) => {
        const expected = lastNonBlank(lines);
        fc.pre(expected !== undefined);
        expect(extractStrykerError(join(lines, ending))).toBe(expected);
      }),
    );
  });

  it("3.6 empty or whitespace-only output gives the fixed message", () => {
    fc.assert(
      fc.property(fc.array(blankLine, { maxLength: 6 }), lineEnding, (blanks, ending) => {
        expect(extractStrykerError(blanks.join(ending))).toBe(NO_STRYKER_OUTPUT_MESSAGE);
      }),
    );
  });

  it("3.5 a failed attempt whose output shows the failed dry run is retried", () => {
    fc.assert(
      fc.property(
        nonZeroExit,
        fc.array(fc.oneof(taggedBlank, taggedOther), { maxLength: 6 }),
        dryRunFailedLine,
        fc.array(fc.oneof(taggedBlank, taggedOther), { maxLength: 6 }),
        lineEnding,
        (exitCode, before, marker, after, ending) => {
          const lines = [...before, { text: marker, kind: "error" as const }, ...after];
          expect(shouldRetryWithIgnoreStatic({ exitCode, output: join(lines, ending) })).toBe(true);
        },
      ),
    );
  });

  it("3.5 a successful attempt is never retried, even when its output has the failed dry run line", () => {
    fc.assert(
      fc.property(dryRunFailedLine, fc.array(infoLine, { maxLength: 4 }), (marker, infos) => {
        const output = [...infos, marker].join("\n");
        expect(shouldRetryWithIgnoreStatic({ exitCode: 0, output })).toBe(false);
      }),
    );
  });

  it("3.17 a failure after a successful dry run is never retried", () => {
    fc.assert(
      fc.property(
        nonZeroExit,
        dryRunSucceededLine,
        fc.array(fc.oneof(infoLine, laterErrorLine, plainLine), { maxLength: 8 }),
        laterErrorLine,
        (exitCode, succeeded, middle, failure) => {
          const output = [succeeded, ...middle, failure].join("\n");
          expect(shouldRetryWithIgnoreStatic({ exitCode, output })).toBe(false);
        },
      ),
    );
  });

  it("3.17 arbitrary output without the failed dry run line is never retried", () => {
    fc.assert(
      fc.property(nonZeroExit, withErrors, lineEnding, (exitCode, lines, ending) => {
        const output = join(lines, ending);
        fc.pre(!DRY_RUN_FAILED_LINES.some((marker) => output.includes(marker)));
        expect(shouldRetryWithIgnoreStatic({ exitCode, output })).toBe(false);
      }),
    );
  });
});
