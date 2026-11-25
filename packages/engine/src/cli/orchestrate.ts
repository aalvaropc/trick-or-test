import type { ChangedRange } from "../adapters/git-adapter.js";
import type {
  MechanicalMutant,
  MechanicalRunOptions,
  MechanicalRunResult,
} from "../adapters/stryker-adapter.js";
import { extractTestBody } from "../adapters/test-body-extractor.js";
import type { SuiteError, SuiteResult, SuiteRunOptions } from "../adapters/vitest-suite-runner.js";
import { CONFIG_FILE_NAME, resolveConfigPaths, validateConfig } from "../core/config.js";
import { computeKillClass } from "../core/kill-classification.js";
import { assignOccurrenceIndexes, computeMutantId } from "../core/mutant-id.js";
import { parseRequirements } from "../core/requirements.js";
import { err, ok, type Result } from "../core/result.js";
import {
  checkCrossFileRules,
  type LoadedSkipEntry,
  type LoadedSpecMutant,
  loadSpecMutants,
  validateSkipFile,
} from "../core/spec-mutants.js";
import { classifySpecies } from "../core/species.js";
import { classifyTest, type TestKind } from "../core/test-classification.js";
import type { Criterion, EngineConfig, MutantResult, MutantStatus, TestId } from "../core/types.js";
import type { CliOptions } from "./args.js";

/** The slice of the file system adapter the load stage needs. */
export interface LoadFileSystem {
  readFile(path: string): Promise<Result<string, string>>;
  exists(path: string): Promise<boolean>;
  /** Names (not paths) of the entries of a directory. */
  listDir(path: string): Promise<Result<string[], string>>;
}

export interface LoadAdapters {
  readonly fs: LoadFileSystem;
}

/** One structured error of the load stage; the CLI formats it (Requirements 9.5, 10.3). */
export interface LoadStageError {
  readonly filePath: string;
  readonly field?: string;
  readonly line?: number;
  readonly message: string;
}

export interface LoadedSpec {
  readonly name: string;
  readonly requirementsPath: string;
  readonly criteria: readonly Criterion[];
  /** Ordered by id. */
  readonly mutants: readonly LoadedSpecMutant[];
  readonly skipEntries: readonly LoadedSkipEntry[];
}

export interface LoadedProject {
  /** The configuration with every path resolved against the project root. */
  readonly config: EngineConfig;
  readonly specs: readonly LoadedSpec[];
}

export const REQUIREMENTS_FILE_NAME = "requirements.md";
export const SKIP_FILE_NAME = "skipped.json";

const joinPath = (...parts: string[]): string =>
  parts.map((p, i) => (i === 0 ? p.replace(/\/+$/, "") : p.replace(/^\/+|\/+$/g, ""))).join("/");

const failures = (errors: LoadStageError[]): Result<never, LoadStageError[]> => err(errors);

/**
 * First stage of the orchestration: read and validate the configuration, find the
 * specs, parse their requirements, load the mutants and the Skip_File and run the
 * cross-file rules. Every error returns here, before the baseline and before StrykerJS
 * (Requirements 4.4, 9.1, 9.5).
 */
export async function loadProject(
  options: Pick<CliOptions, "project" | "spec">,
  adapters: LoadAdapters,
): Promise<Result<LoadedProject, LoadStageError[]>> {
  const { fs } = adapters;

  const configPath = joinPath(options.project, CONFIG_FILE_NAME);
  let rawConfig: string | undefined;
  if (await fs.exists(configPath)) {
    const read = await fs.readFile(configPath);
    if (!read.ok) {
      return failures([{ filePath: CONFIG_FILE_NAME, message: `cannot be read: ${read.error}` }]);
    }
    rawConfig = read.value;
  }
  const validated = validateConfig(rawConfig);
  if (!validated.ok) return failures([validated.error]);
  const config = resolveConfigPaths(validated.value, options.project);

  const names = await findSpecNames(config.specDir, options.spec, fs);
  if (!names.ok) return failures(names.error);

  const errors: LoadStageError[] = [];
  const specs: LoadedSpec[] = [];
  for (const name of names.value) {
    const loaded = await loadSpec(name, config, fs);
    if (loaded.ok) specs.push(loaded.value);
    else errors.push(...loaded.error);
  }
  if (errors.length > 0) return failures(errors);
  return ok({ config, specs });
}

async function findSpecNames(
  specDir: string,
  only: string | undefined,
  fs: LoadFileSystem,
): Promise<Result<string[], LoadStageError[]>> {
  if (only !== undefined) {
    const path = joinPath(specDir, only, REQUIREMENTS_FILE_NAME);
    if (!(await fs.exists(path))) {
      return failures([{ filePath: path, message: "does not exist" }]);
    }
    return ok([only]);
  }

  const listing = await fs.listDir(specDir);
  if (!listing.ok) {
    return failures([{ filePath: specDir, message: `cannot be listed: ${listing.error}` }]);
  }
  const names: string[] = [];
  for (const name of [...listing.value].sort()) {
    // A directory without requirements.md is not a spec and is skipped.
    if (await fs.exists(joinPath(specDir, name, REQUIREMENTS_FILE_NAME))) names.push(name);
  }
  if (names.length === 0) {
    return failures([
      { filePath: specDir, message: `has no spec with a ${REQUIREMENTS_FILE_NAME}` },
    ]);
  }
  return ok(names);
}

async function loadSpec(
  name: string,
  config: EngineConfig,
  fs: LoadFileSystem,
): Promise<Result<LoadedSpec, LoadStageError[]>> {
  const requirementsPath = joinPath(config.specDir, name, REQUIREMENTS_FILE_NAME);
  const text = await fs.readFile(requirementsPath);
  if (!text.ok) {
    return failures([{ filePath: requirementsPath, message: `cannot be read: ${text.error}` }]);
  }
  const parsed = parseRequirements(text.value, requirementsPath);
  if (!parsed.ok) {
    const { error } = parsed;
    return failures([
      {
        filePath: error.filePath,
        ...("line" in error && { line: error.line }),
        ...("lines" in error && { line: error.lines[1] }),
        message: error.message,
      },
    ]);
  }
  const criteria = parsed.value;

  const errors: LoadStageError[] = [];
  const mutantsDir = joinPath(config.mutantsDir, name);

  const files: { filePath: string; raw: unknown }[] = [];
  if (await fs.exists(mutantsDir)) {
    const listing = await fs.listDir(mutantsDir);
    if (!listing.ok) {
      errors.push({ filePath: mutantsDir, message: `cannot be listed: ${listing.error}` });
    } else {
      const jsonNames = listing.value
        .filter((n) => n.endsWith(".json") && n !== SKIP_FILE_NAME)
        .sort();
      for (const fileName of jsonNames) {
        const filePath = joinPath(mutantsDir, fileName);
        const read = await fs.readFile(filePath);
        if (read.ok) files.push({ filePath, raw: read.value });
        else errors.push({ filePath, message: `cannot be read: ${read.error}` });
      }
    }
  }
  const loadedMutants = loadSpecMutants(files);
  errors.push(...loadedMutants.errors);

  const skipEntries: LoadedSkipEntry[] = [];
  const skipPath = joinPath(mutantsDir, SKIP_FILE_NAME);
  if (await fs.exists(skipPath)) {
    const read = await fs.readFile(skipPath);
    if (!read.ok) {
      errors.push({ filePath: skipPath, message: `cannot be read: ${read.error}` });
    } else {
      const skip = validateSkipFile(read.value, skipPath);
      if (!skip.ok) errors.push(skip.error);
      else {
        for (const [index, entry] of skip.value.entries()) {
          skipEntries.push({ filePath: skipPath, index, entry });
        }
      }
    }
  }

  errors.push(...checkCrossFileRules(loadedMutants.mutants, skipEntries, criteria));
  if (errors.length > 0) return failures(errors);

  return ok({
    name,
    requirementsPath,
    criteria,
    mutants: loadedMutants.mutants,
    skipEntries,
  });
}

/** The slice of the adapters the baseline and mechanical stage needs. */
export interface MechanicalAdapters {
  readonly fs: Pick<LoadFileSystem, "readFile">;
  readonly suite: {
    run(root: string, options: SuiteRunOptions): Promise<Result<SuiteResult, SuiteError>>;
  };
  readonly mechanical: {
    run(options: MechanicalRunOptions): Promise<Result<MechanicalRunResult, string>>;
  };
  readonly git: {
    changedRanges(ref: string, cwd: string): Promise<Result<ChangedRange[], string>>;
  };
}

/** Facts about the target project that the CLI gathers before this stage. */
export interface MechanicalStageInput {
  /** Resolved TypeScript version of the Target_Project. */
  readonly typescriptVersion: string;
  readonly nonBuildDirs?: readonly string[];
}

/** Why the stage stopped. None of these writes a Verdict_File (Requirements 3.6, 3.15). */
export type MechanicalStageError =
  | { readonly kind: "baseline-failed"; readonly failingTests: readonly string[] }
  | { readonly kind: "baseline-error"; readonly message: string }
  | { readonly kind: "git-error"; readonly message: string }
  | { readonly kind: "stryker-error"; readonly message: string };

/** A Mechanical_Mutant with its engine result and the data the report needs. */
export interface MechanicalOutcome {
  readonly result: MutantResult;
  readonly file: string;
  readonly mutatorName: string;
  readonly original: string;
  readonly replacement: string;
  readonly startLine: number;
  readonly endLine: number;
}

export interface MechanicalStageResult {
  readonly baselineMs: number;
  readonly mutants: readonly MechanicalOutcome[];
  readonly ignoreStaticRetried: boolean;
}

/** Upper bound for the baseline run, which has no baseline duration to derive a limit from. */
export const BASELINE_TIME_LIMIT_MS = 10 * 60 * 1000;

const testIdOf = (file: string, name: string): TestId => `${file}::${name}` as TestId;

/** StrykerJS status to engine status. Ignored and pending mutants never ran and are dropped. */
const toEngineStatus = (status: string): MutantStatus | undefined => {
  switch (status) {
    case "Killed":
    case "RuntimeError":
      return "Killed";
    case "Survived":
    case "NoCoverage":
      return "Survived";
    case "Timeout":
      return "Timeout";
    case "CompileError":
      return "CompileError";
    default:
      return undefined;
  }
};

/**
 * Second stage of the orchestration: the baseline run, then the mechanical run through
 * StrykerJS. A failing baseline or a StrykerJS error returns before anything is written
 * (Requirements 3.6, 3.15). Mechanical ids are content hashes with an Occurrence_Index
 * (Requirement 8.7); the species and kill class come from StrykerJS data (Requirements
 * 3.11, 6.1-6.9).
 */
export async function runBaselineAndMechanical(
  options: Pick<CliOptions, "project" | "since">,
  project: LoadedProject,
  input: MechanicalStageInput,
  adapters: MechanicalAdapters,
): Promise<Result<MechanicalStageResult, MechanicalStageError>> {
  const { config } = project;

  const baseline = await adapters.suite.run(options.project, {
    timeLimitMs: config.timeoutMs ?? BASELINE_TIME_LIMIT_MS,
  });
  if (!baseline.ok) {
    const message =
      baseline.error.kind === "Timeout"
        ? `baseline run exceeded ${baseline.error.limitMs} ms`
        : baseline.error.message;
    return err({ kind: "baseline-error", message });
  }
  const failingTests = baseline.value.files.flatMap((file) =>
    file.tests.filter((t) => t.status === "failed").map((t) => testIdOf(file.path, t.name)),
  );
  if (failingTests.length > 0) return err({ kind: "baseline-failed", failingTests });

  let changedRanges: ChangedRange[] | undefined;
  if (options.since !== undefined) {
    const ranges = await adapters.git.changedRanges(options.since, options.project);
    if (!ranges.ok) return err({ kind: "git-error", message: ranges.error });
    changedRanges = ranges.value;
  }

  const run = await adapters.mechanical.run({
    typescriptVersion: input.typescriptVersion,
    cwd: options.project,
    ...(input.nonBuildDirs === undefined ? {} : { nonBuildDirs: input.nonBuildDirs }),
    ...(changedRanges === undefined ? {} : { changedRanges, since: true }),
  });
  if (!run.ok) return err({ kind: "stryker-error", message: run.error });

  const mutants = await toOutcomes(run.value, options.project, config, adapters.fs);
  return ok({
    baselineMs: baseline.value.durationMs,
    mutants,
    ignoreStaticRetried: run.value.ignoreStaticRetried,
  });
}

const toOutcome = (mutant: MechanicalMutant, result: MutantResult): MechanicalOutcome => ({
  result,
  file: mutant.file,
  mutatorName: mutant.mutatorName,
  original: mutant.original,
  replacement: mutant.replacement,
  startLine: mutant.startLine,
  endLine: mutant.endLine,
});

async function toOutcomes(
  run: MechanicalRunResult,
  projectRoot: string,
  config: EngineConfig,
  fs: Pick<LoadFileSystem, "readFile">,
): Promise<MechanicalOutcome[]> {
  const ran = run.mutants.flatMap((mutant) => {
    const status = toEngineStatus(mutant.status);
    return status === undefined ? [] : [{ mutant, status }];
  });
  const indexes = assignOccurrenceIndexes(
    ran.map(({ mutant }) => ({
      file: mutant.file,
      original: mutant.original,
      replacement: mutant.replacement,
      line: mutant.startLine,
      column: 0,
    })),
  );

  // StrykerJS test id -> its file, name and start line.
  const tests = new Map<string, { file: string; name: string; startLine?: number }>();
  for (const [file, list] of Object.entries(run.testFiles)) {
    for (const t of list) {
      tests.set(t.id, {
        file,
        name: t.name,
        ...(t.startLine === undefined ? {} : { startLine: t.startLine }),
      });
    }
  }
  const fileTexts = new Map<string, string>();
  const textOf = async (file: string): Promise<string> => {
    const cached = fileTexts.get(file);
    if (cached !== undefined) return cached;
    const read = await fs.readFile(joinPath(projectRoot, file));
    const text = read.ok ? read.value : "";
    fileTexts.set(file, text);
    return text;
  };

  const outcomes: MechanicalOutcome[] = [];
  for (const [i, { mutant, status }] of ran.entries()) {
    const id = computeMutantId(
      mutant.file,
      mutant.original,
      mutant.replacement,
      indexes[i] as number,
    );
    const result: MutantResult = {
      id,
      species: classifySpecies(mutant.mutatorName, mutant.replacement),
      status,
      killingTests: [],
    };
    if (status === "Killed") {
      const kinds: { kind: TestKind }[] = [];
      for (const killer of mutant.killedBy) {
        const test = tests.get(killer);
        if (test === undefined) continue;
        result.killingTests.push(testIdOf(test.file, test.name));
        const body =
          test.startLine === undefined
            ? ""
            : extractTestBody(await textOf(test.file), test.startLine);
        kinds.push({
          kind: classifyTest({ filePath: test.file, bodySource: body }, config.propertyTestGlobs),
        });
      }
      result.killClass = computeKillClass(kinds);
    }
    outcomes.push(toOutcome(mutant, result));
  }
  return outcomes;
}
