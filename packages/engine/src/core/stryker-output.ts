import { z } from "zod";
import { err, ok, type Result } from "./result.js";

/** 1-based, as in mutation-testing-report-schema and in StrykerJS output. */
export type Position = { readonly line: number; readonly column: number };
export type Location = { readonly start: Position; readonly end: Position };

export type StrykerMutant = {
  readonly id: string;
  readonly mutatorName: string;
  readonly replacement: string;
  readonly status: string;
  readonly location: Location;
  /** Ids of the tests that killed the mutant, keys of the tests in `testFiles`. */
  readonly killedBy: readonly string[];
};

export type StrykerFile = {
  /** Source text of the file, when StrykerJS includes it. */
  readonly source?: string;
  readonly mutants: readonly StrykerMutant[];
};

export type StrykerTest = {
  readonly id: string;
  readonly name: string;
  readonly location?: { readonly start: Position };
};

export type StrykerReport = {
  readonly files: Readonly<Record<string, StrykerFile>>;
  readonly testFiles: Readonly<Record<string, readonly StrykerTest[]>>;
};

export type ParseError = {
  readonly kind: "invalid-stryker-report";
  readonly filePath: string;
  /** Dotted path of the first invalid field, e.g. `files.src/a.ts.mutants.0.location`. */
  readonly field: string;
  readonly message: string;
};

const positionSchema = z.object({
  line: z.number().int().positive(),
  column: z.number().int().positive(),
});

const mutantSchema = z.object({
  id: z.string(),
  mutatorName: z.string(),
  replacement: z.string().optional(),
  status: z.string(),
  killedBy: z.array(z.string()).optional(),
  location: z.object({ start: positionSchema, end: positionSchema }),
});

// z.object strips unknown keys, so fields this engine does not read are accepted.
const reportSchema = z.object({
  files: z.record(
    z.string(),
    z.object({ source: z.string().optional(), mutants: z.array(mutantSchema) }),
  ),
  testFiles: z
    .record(
      z.string(),
      z.object({
        tests: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            location: z.object({ start: positionSchema }).optional(),
          }),
        ),
      }),
    )
    .optional(),
});

const DEFAULT_FILE = "StrykerJS report";

/**
 * Validates a StrykerJS JSON report (mutation-testing-report-schema) and keeps,
 * for each mutant, its location, mutator, replacement, status and killing tests
 * (Requirement 3.16). Pure: the caller reads the file.
 */
export const parseStrykerReport = (
  raw: unknown,
  filePath: string = DEFAULT_FILE,
): Result<StrykerReport, ParseError> => {
  const parsed = reportSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue === undefined || issue.path.length === 0 ? "" : issue.path.join(".");
    const detail = issue?.message ?? "is invalid";
    return err({
      kind: "invalid-stryker-report",
      filePath,
      field,
      message:
        field === ""
          ? `${filePath}: ${detail}`
          : `${filePath}: field "${field}" is invalid: ${detail}`,
    });
  }
  const files = Object.fromEntries(
    Object.entries(parsed.data.files).map(([file, entry]) => [
      file,
      {
        ...(entry.source === undefined ? {} : { source: entry.source }),
        mutants: entry.mutants.map(
          (mutant): StrykerMutant => ({
            id: mutant.id,
            mutatorName: mutant.mutatorName,
            replacement: mutant.replacement ?? "",
            status: mutant.status,
            location: {
              start: { line: mutant.location.start.line, column: mutant.location.start.column },
              end: { line: mutant.location.end.line, column: mutant.location.end.column },
            },
            killedBy: mutant.killedBy ?? [],
          }),
        ),
      },
    ]),
  );
  const testFiles = Object.fromEntries(
    Object.entries(parsed.data.testFiles ?? {}).map(([file, entry]) => [
      file,
      entry.tests.map(
        (test): StrykerTest => ({
          id: test.id,
          name: test.name,
          ...(test.location === undefined ? {} : { location: { start: test.location.start } }),
        }),
      ),
    ]),
  );
  return ok({ files, testFiles });
};
