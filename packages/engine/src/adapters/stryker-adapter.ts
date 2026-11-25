import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { err, ok, type Result } from "../core/result.js";
import {
  extractStrykerError,
  type Location,
  type Position,
  parseStrykerReport as parseStrykerOutput,
  shouldRetryWithIgnoreStatic,
} from "../core/stryker-output.js";
import { type ChangedRange, formatChangedRange } from "./git-adapter.js";

export const VITEST_RUNNER_PLUGIN = "@stryker-mutator/vitest-runner";
export const TRICKORTEST_DIR = ".trickortest";
export const STRYKER_TMP_DIR = ".stryker-tmp";
export const STRYKER_INCREMENTAL_FILE = `${TRICKORTEST_DIR}/stryker-incremental.json`;
export const STRYKER_REPORT_FILE = `${TRICKORTEST_DIR}/mutation.json`;
export const STRYKER_TEMP_DIR = `${TRICKORTEST_DIR}/stryker-tmp`;
/** A path that never exists, so StrykerJS cannot read a TypeScript 7 tsconfig. */
export const NONEXISTENT_TSCONFIG = `${TRICKORTEST_DIR}/no-such-tsconfig.json`;

export type StrykerOptionsInput = {
  /** Resolved TypeScript version of the Target_Project, e.g. "6.0.2" or "7.0.0-beta". */
  readonly typescriptVersion: string;
  /** When present (git ref given), mutation is restricted to these ranges. */
  readonly changedRanges?: readonly ChangedRange[];
  /**
   * Directories (relative to the project root) that are not part of the build.
   * Symlinked directories are included by the caller; they are excluded both as
   * the entry itself and as a subtree, since a symlink is not matched by `dir/**`.
   */
  readonly nonBuildDirs?: readonly string[];
  /** True only for the single retry after a static-mutant failure. */
  readonly ignoreStatic?: boolean;
};

export type StrykerOptions = {
  readonly plugins: readonly string[];
  readonly testRunner: "vitest";
  readonly incremental: true;
  readonly incrementalFile: string;
  readonly reporters: readonly string[];
  readonly jsonReporter: { readonly fileName: string };
  readonly tempDirName: string;
  readonly disableBail: true;
  readonly cleanTempDir: false;
  readonly tsconfigFile?: string;
  readonly mutate?: readonly string[];
  readonly ignorePatterns: readonly string[];
  readonly ignoreStatic?: true;
};

/** Major version of a semver-like string, or undefined when unparseable. */
const majorVersion = (version: string): number | undefined => {
  const match = /^\s*v?(\d+)/.exec(version);
  return match?.[1] === undefined ? undefined : Number.parseInt(match[1], 10);
};

const normalizeDir = (dir: string): string => dir.replace(/^\.\//, "").replace(/\/+$/, "");

/** Builds the StrykerJS options object. Pure: no file system or process access. */
export const buildStrykerOptions = (input: StrykerOptionsInput): StrykerOptions => {
  const major = majorVersion(input.typescriptVersion);
  const dirs = [...new Set((input.nonBuildDirs ?? []).map(normalizeDir))]
    .filter((dir) => dir !== "")
    .sort();
  const ignorePatterns = [
    TRICKORTEST_DIR,
    `${TRICKORTEST_DIR}/**`,
    STRYKER_TMP_DIR,
    `${STRYKER_TMP_DIR}/**`,
    `**/${STRYKER_TMP_DIR}/**`,
    ...dirs.flatMap((dir) => [dir, `${dir}/**`]),
  ];
  return {
    plugins: [VITEST_RUNNER_PLUGIN],
    testRunner: "vitest",
    incremental: true,
    incrementalFile: STRYKER_INCREMENTAL_FILE,
    reporters: ["json"],
    jsonReporter: { fileName: STRYKER_REPORT_FILE },
    tempDirName: STRYKER_TEMP_DIR,
    disableBail: true,
    cleanTempDir: false,
    ...(major !== undefined && major >= 7 ? { tsconfigFile: NONEXISTENT_TSCONFIG } : {}),
    ...(input.changedRanges === undefined
      ? {}
      : { mutate: input.changedRanges.map(formatChangedRange) }),
    ignorePatterns,
    ...(input.ignoreStatic === true ? { ignoreStatic: true as const } : {}),
  };
};

export type MechanicalTest = {
  readonly id: string;
  readonly name: string;
  /** 1-based start line, when StrykerJS reports it. */
  readonly startLine?: number;
};

export type MechanicalMutant = {
  readonly id: string;
  readonly file: string;
  readonly mutatorName: string;
  readonly replacement: string;
  /** Source text covered by the mutant's location. */
  readonly original: string;
  /** Start and end line and column, 1-based, as StrykerJS reports them. */
  readonly location: Location;
  readonly startLine: number;
  readonly endLine: number;
  readonly status: string;
  /** Ids of the tests that killed the mutant, keys of `testFiles`' tests. */
  readonly killedBy: readonly string[];
};

export type MechanicalRunResult = {
  readonly mutants: readonly MechanicalMutant[];
  /** Tests per file, with the location of each test, for attributing kills. */
  readonly testFiles: Readonly<Record<string, readonly MechanicalTest[]>>;
  /** True when the run had to be repeated with `ignoreStatic`. */
  readonly ignoreStaticRetried: boolean;
};

export type MechanicalRunOptions = Omit<StrykerOptionsInput, "ignoreStatic"> & {
  /** Project root where StrykerJS runs. */
  readonly cwd: string;
  /** True when `--since` was given. With no changed range, no mutant is generated. */
  readonly since?: boolean;
};

type ProcessFailure = {
  readonly ok: false;
  readonly output: string;
  /** Exit code of the failed process. A failure without a code counts as exit code 1. */
  readonly exitCode?: number;
};
export type StrykerProcessResult = { readonly ok: true } | ProcessFailure;

/** Process boundary: starting StrykerJS and reading its JSON report. */
export interface StrykerProcess {
  run(options: StrykerOptions, cwd: string): Promise<StrykerProcessResult>;
  readReport(cwd: string, reportFile: string): Promise<Result<unknown, string>>;
}

const sourceSlice = (source: string, start: Position, end: Position): string => {
  const lines = source.split("\n");
  if (start.line === end.line) {
    return (lines[start.line - 1] ?? "").slice(start.column - 1, end.column - 1);
  }
  const first = (lines[start.line - 1] ?? "").slice(start.column - 1);
  const middle = lines.slice(start.line, end.line - 1);
  const last = (lines[end.line - 1] ?? "").slice(0, end.column - 1);
  return [first, ...middle, last].join("\n");
};

/** Parses the StrykerJS JSON report into mutants with `killedBy` and `testFiles`. */
export const parseStrykerReport = (
  json: unknown,
): Result<Omit<MechanicalRunResult, "ignoreStaticRetried">, string> => {
  const parsed = parseStrykerOutput(json);
  if (!parsed.ok) return err(parsed.error.message);
  const mutants: MechanicalMutant[] = [];
  for (const [file, entry] of Object.entries(parsed.value.files)) {
    for (const mutant of entry.mutants) {
      const { start, end } = mutant.location;
      mutants.push({
        id: mutant.id,
        file,
        mutatorName: mutant.mutatorName,
        replacement: mutant.replacement,
        original: sourceSlice(entry.source ?? "", start, end),
        location: mutant.location,
        startLine: start.line,
        endLine: end.line,
        status: mutant.status,
        killedBy: mutant.killedBy,
      });
    }
  }
  const testFiles = Object.fromEntries(
    Object.entries(parsed.value.testFiles).map(([file, tests]) => [
      file,
      tests.map((test) => ({
        id: test.id,
        name: test.name,
        ...(test.location === undefined ? {} : { startLine: test.location.start.line }),
      })),
    ]),
  );
  return ok({ mutants, testFiles });
};

const runOnce = async (
  process: StrykerProcess,
  options: MechanicalRunOptions,
  ignoreStatic: boolean,
): Promise<Result<Omit<MechanicalRunResult, "ignoreStaticRetried">, string> | ProcessFailure> => {
  const strykerOptions = buildStrykerOptions({ ...options, ignoreStatic });
  const outcome = await process.run(strykerOptions, options.cwd);
  if (!outcome.ok) return outcome;
  const report = await process.readReport(options.cwd, strykerOptions.jsonReporter.fileName);
  if (!report.ok) return err(report.error);
  return parseStrykerReport(report.value);
};

const isProcessFailure = (value: Awaited<ReturnType<typeof runOnce>>): value is ProcessFailure =>
  "output" in value;

export const nodeStrykerProcess: StrykerProcess = {
  async run(options, cwd) {
    const configFile = join(cwd, TRICKORTEST_DIR, "stryker.config.json");
    try {
      await mkdir(dirname(configFile), { recursive: true });
      await writeFile(configFile, JSON.stringify(options, null, 2), "utf8");
    } catch (error) {
      return { ok: false, output: (error as Error).message };
    }
    return new Promise((done) => {
      const child = spawn("npx", ["stryker", "run", configFile], {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      const collect = (chunk: string): void => {
        if (output.length < 256 * 1024) output += chunk;
      };
      child.stdout.setEncoding("utf8").on("data", collect);
      child.stderr.setEncoding("utf8").on("data", collect);
      child.on("error", (error) => done({ ok: false, output: error.message }));
      child.on("close", (code) =>
        done(code === 0 ? { ok: true } : { ok: false, output, exitCode: code ?? 1 }),
      );
    });
  },
  async readReport(cwd, reportFile) {
    try {
      return ok(JSON.parse(await readFile(join(cwd, reportFile), "utf8")) as unknown);
    } catch (error) {
      return err(`Cannot read the StrykerJS report: ${(error as Error).message}`);
    }
  },
};

export const MechanicalRunner = {
  /**
   * Runs StrykerJS. Starts nothing when `--since` selects no changed line. When the
   * initial test run (dry run) fails, runs once more with `ignoreStatic`. Any other
   * failure, including a failing retry, returns the first ERROR-level line.
   */
  async run(
    options: MechanicalRunOptions,
    process: StrykerProcess = nodeStrykerProcess,
  ): Promise<Result<MechanicalRunResult, string>> {
    if (options.since === true && (options.changedRanges ?? []).length === 0) {
      return ok({ mutants: [], testFiles: {}, ignoreStaticRetried: false });
    }
    let first = await runOnce(process, options, false);
    let retried = false;
    if (
      isProcessFailure(first) &&
      shouldRetryWithIgnoreStatic({ exitCode: first.exitCode ?? 1, output: first.output })
    ) {
      retried = true;
      first = await runOnce(process, options, true);
    }
    if (isProcessFailure(first)) return err(extractStrykerError(first.output));
    if (!first.ok) return err(first.error);
    return ok({ ...first.value, ignoreStaticRetried: retried });
  },
};
