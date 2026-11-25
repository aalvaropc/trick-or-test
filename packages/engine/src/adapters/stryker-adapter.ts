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
