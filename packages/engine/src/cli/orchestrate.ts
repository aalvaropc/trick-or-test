import { isAbsolute, relative } from "node:path";
import type {
  MechanicalMutant,
  MechanicalRunOptions,
  MechanicalRunResult,
} from "../adapters/stryker-adapter.js";
import { extractTestBody } from "../adapters/test-body-extractor.js";
import type { CompileError } from "../adapters/typecheck-adapter.js";
import type { SuiteError, SuiteResult, SuiteRunOptions } from "../adapters/vitest-suite-runner.js";
import type {
  WitnessInput,
  WitnessRunError,
  WitnessRunOptions,
  WitnessRunResult,
} from "../adapters/vitest-witness-runner.js";
import { type ChangedRange, parseChangedRanges } from "../core/changed-ranges.js";
import { CONFIG_FILE_NAME, resolveConfigPaths, validateConfig } from "../core/config.js";
import { computeCoverage } from "../core/coverage.js";
import { computeKillClass } from "../core/kill-classification.js";
import { computeMutantId } from "../core/mutant-id.js";
import { applyMutation } from "../core/mutation.js";
import { assignOccurrenceIndexes } from "../core/occurrence.js";
import {
  buildHistoryRecord,
  buildMutationReport,
  buildVerdict,
  parseHistoryLines,
  type ReportMutantInput,
  type SpecReportMutantInput,
  serializeHistoryRecord,
  serializeVerdict,
} from "../core/report.js";
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
import type { Location } from "../core/stryker-output.js";
import { computeSuiteTimeLimit } from "../core/suite-time-limit.js";
import { classifyTest, type TestKind } from "../core/test-classification.js";
import type {
  Criterion,
  EngineConfig,
  HistoryRecord,
  MutantId,
  MutantResult,
  MutantStatus,
  RunMetadata,
  SpecMutant,
  TestId,
  Witness,
} from "../core/types.js";
import {
  compareOutcomes,
  matchesExpectation,
  type WitnessExpectation,
  type WitnessOutcome,
} from "../core/witness-compare.js";
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

/** Turns a resolved absolute path back into a path relative to the project root (8.17). */
const relativeToRoot = (root: string, path: string): string =>
  isAbsolute(path) ? relative(root, path) : path;

/** The configuration as written: no resolved absolute path leaves the process (8.17). */
const configAsWritten = (config: EngineConfig, root: string): EngineConfig => {
  const rel = (p: string) => relativeToRoot(root, p);
  const out: EngineConfig = {
    specDir: rel(config.specDir),
    sourceGlobs: config.sourceGlobs.map(rel),
    testGlobs: config.testGlobs.map(rel),
    propertyTestGlobs: config.propertyTestGlobs.map(rel),
    mutantsDir: rel(config.mutantsDir),
    outputDir: rel(config.outputDir),
  };
  return config.timeoutMs === undefined ? out : { ...out, timeoutMs: config.timeoutMs };
};

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
    /** Diff text against `ref`, limited to the Target_Project, with project-relative paths. */
    diff(ref: string, cwd: string): Promise<Result<string, string>>;
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
  /** Start and end line and column from StrykerJS, 1-based. */
  readonly location?: Location;
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
    file.tests
      .filter((t) => t.status === "failed")
      // A file-level failure is named after its file: report the path once (3.15).
      .map((t) => (t.name === file.path ? file.path : testIdOf(file.path, t.name))),
  );
  if (failingTests.length > 0) return err({ kind: "baseline-failed", failingTests });

  let changedRanges: ChangedRange[] | undefined;
  if (options.since !== undefined) {
    const diff = await adapters.git.diff(options.since, options.project);
    if (!diff.ok) return err({ kind: "git-error", message: diff.error });
    changedRanges = parseChangedRanges(
      diff.value,
      config.sourceGlobs.map((glob) => relativeToRoot(options.project, glob)),
    );
    // 3.10: no changed line in a source file gives zero mutants and no StrykerJS run.
    if (changedRanges.length === 0) {
      return ok({ baselineMs: baseline.value.durationMs, mutants: [], ignoreStaticRetried: false });
    }
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
  location: mutant.location,
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
      line: mutant.location.start.line,
      column: mutant.location.start.column,
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

/** The slice of the adapters the spec mutant stage needs. */
export interface SpecMutantAdapters {
  readonly fs: Pick<LoadFileSystem, "readFile"> & {
    writeFile(path: string, content: string): Promise<Result<void, string>>;
  };
  readonly sandbox: {
    create(projectRoot: string, id: string): Promise<Result<{ root: string }, string>>;
    destroy(handle: { root: string }): Promise<Result<void, string>>;
  };
  readonly typecheck: {
    run(sandboxRoot: string): Promise<Result<void, CompileError>>;
  };
  readonly witness: {
    run(
      sandboxRoot: string,
      witnesses: readonly WitnessInput[],
      options?: WitnessRunOptions,
    ): Promise<Result<WitnessRunResult, WitnessRunError>>;
  };
  readonly suite: {
    run(root: string, options: SuiteRunOptions): Promise<Result<SuiteResult, SuiteError>>;
  };
}

export interface SpecMutantStageInput {
  /** Duration of the Baseline_Run, from the mechanical stage. */
  readonly baselineMs: number;
}

/** A Spec_Mutant with its engine result and what the witness saw (Requirement 5.6). */
export interface SpecMutantOutcome {
  readonly mutant: SpecMutant;
  readonly result: MutantResult;
  /** Outcome of the witness on the original code, when it produced one. */
  readonly originalOutcome?: WitnessOutcome;
  /** Outcome of the witness on the mutated code, when it produced one. */
  readonly mutatedOutcome?: WitnessOutcome;
  /** First compiler error line (CompileError) or the reason a witness produced no outcome. */
  readonly message?: string;
}

/** Why the stage stopped. None of these writes a Verdict_File. */
export type SpecMutantStageError =
  | { readonly kind: "sandbox-error"; readonly message: string }
  | { readonly kind: "witness-error"; readonly message: string }
  | { readonly kind: "crash"; readonly mutant?: MutantId; readonly message: string };

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const witnessErrorMessage = (error: WitnessRunError): string =>
  error.kind === "Timeout" ? `witness run exceeded ${error.limitMs} ms` : error.message;

/** Result of one Spec_Mutant, before its status is final. */
const specResult = (
  mutant: SpecMutant,
  status: MutantStatus,
  killingTests: TestId[] = [],
): MutantResult => ({
  id: mutant.id,
  species: "Oathbreaker",
  status,
  requirement: mutant.requirement,
  killingTests,
});

/**
 * Third stage of the orchestration: runs every Spec_Mutant. One pristine sandbox runs all
 * witnesses on the original code; each mutant then gets its own sandbox, removed in a
 * `finally`. Mutants run in id order and keep the id from their file (Requirements 4.5,
 * 5.1-5.15, 6.2).
 */
export async function runSpecMutants(
  options: Pick<CliOptions, "project">,
  project: LoadedProject,
  mutants: readonly SpecMutant[],
  input: SpecMutantStageInput,
  adapters: SpecMutantAdapters,
): Promise<Result<SpecMutantOutcome[], SpecMutantStageError>> {
  const { config } = project;
  const ordered = [...mutants].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (ordered.length === 0) return ok([]);

  const timeLimitMs = computeSuiteTimeLimit(input.baselineMs, config.timeoutMs);

  const pristine = await originalOutcomes(options.project, ordered, timeLimitMs, adapters);
  if (!pristine.ok) return pristine;

  const outcomes: SpecMutantOutcome[] = [];
  for (const mutant of ordered) {
    const sandbox = await adapters.sandbox.create(options.project, mutant.id);
    if (!sandbox.ok) return err({ kind: "sandbox-error", message: sandbox.error });
    try {
      const outcome = await runOneSpecMutant(
        mutant,
        sandbox.value.root,
        pristine.value[mutant.id],
        timeLimitMs,
        config,
        adapters,
      );
      if (!outcome.ok) return outcome;
      outcomes.push(outcome.value);
    } catch (error) {
      return err({ kind: "crash", mutant: mutant.id, message: messageOf(error) });
    } finally {
      await adapters.sandbox.destroy(sandbox.value);
    }
  }
  return ok(outcomes);
}

type OriginalOutcome = Result<WitnessOutcome, { message: string }> | undefined;

async function originalOutcomes(
  projectRoot: string,
  mutants: readonly SpecMutant[],
  timeLimitMs: number,
  adapters: SpecMutantAdapters,
): Promise<Result<Record<string, OriginalOutcome>, SpecMutantStageError>> {
  const sandbox = await adapters.sandbox.create(projectRoot, "pristine");
  if (!sandbox.ok) return err({ kind: "sandbox-error", message: sandbox.error });
  try {
    const run = await adapters.witness.run(
      sandbox.value.root,
      mutants.map((m) => ({ id: m.id, witness: m.witness })),
      { timeLimitMs },
    );
    if (!run.ok) return err({ kind: "witness-error", message: witnessErrorMessage(run.error) });
    return ok(run.value as Record<string, OriginalOutcome>);
  } catch (error) {
    return err({ kind: "crash", message: messageOf(error) });
  } finally {
    await adapters.sandbox.destroy(sandbox.value);
  }
}

const expectationOf = (witness: SpecMutant["witness"]): WitnessExpectation =>
  "expectedError" in witness
    ? { expectedError: witness.expectedError }
    : { expected: witness.expected };

async function runOneSpecMutant(
  mutant: SpecMutant,
  root: string,
  original: OriginalOutcome,
  timeLimitMs: number,
  config: EngineConfig,
  adapters: SpecMutantAdapters,
): Promise<Result<SpecMutantOutcome, SpecMutantStageError>> {
  const done = (
    status: MutantStatus,
    extra: Omit<SpecMutantOutcome, "mutant" | "result"> = {},
    killingTests: TestId[] = [],
    killClass?: MutantResult["killClass"],
  ): Result<SpecMutantOutcome, SpecMutantStageError> => {
    const result = specResult(mutant, status, killingTests);
    if (killClass !== undefined) result.killClass = killClass;
    return ok({ mutant, result, ...extra });
  };

  // 5.2: the original text must appear exactly once.
  const path = joinPath(root, mutant.file);
  const source = await adapters.fs.readFile(path);
  if (!source.ok) return done("NotApplicable", { message: source.error });
  const applied = applyMutation(source.value, mutant);
  if (!applied.ok) {
    return done("NotApplicable", {
      message: `original text appears ${applied.error.occurrences} times in ${mutant.file}, expected 1`,
    });
  }
  const written = await adapters.fs.writeFile(path, applied.value.mutated);
  if (!written.ok) return err({ kind: "sandbox-error", message: written.error });

  // 5.3: type-check the mutated sandbox.
  const typed = await adapters.typecheck.run(root);
  if (!typed.ok) return done("CompileError", { message: typed.error.firstError });

  // 5.6: the original code must give the expected outcome.
  if (original === undefined || !original.ok) {
    return done("InvalidWitness", {
      message: original === undefined ? "witness produced no outcome" : original.error.message,
    });
  }
  // A timeout on the original code never matches the expectation.
  if (!matchesExpectation(mutant.witness, original.value)) {
    const invalid = done("InvalidWitness", { originalOutcome: original.value });
    if (invalid.ok) {
      // 5.6: the Verdict_File gets the expectation and what the original code produced.
      invalid.value.result.invalidWitness = {
        expected: expectationOf(mutant.witness),
        originalOutcome: original.value,
      };
    }
    return invalid;
  }

  // 5.7: the mutated code must change the outcome.
  const witnessRun = await adapters.witness.run(
    root,
    [{ id: mutant.id, witness: mutant.witness }],
    { timeLimitMs },
  );
  if (!witnessRun.ok) {
    if (witnessRun.error.kind === "Timeout") {
      return done("Timeout", { originalOutcome: original.value });
    }
    return err({ kind: "witness-error", message: witnessRun.error.message });
  }
  const mutatedRun = witnessRun.value[mutant.id];
  // A witness with no outcome on the mutated code (for example a failed import) is a change.
  const mutatedOutcome = mutatedRun?.ok ? mutatedRun.value : undefined;
  // 5.16: a timeout or a missing outcome on the mutated code is a difference, so the suite runs.
  if (mutatedOutcome !== undefined && compareOutcomes(original.value, mutatedOutcome) === "same") {
    return done("Ghost", { originalOutcome: original.value, mutatedOutcome });
  }
  const seen = {
    originalOutcome: original.value,
    ...(mutatedOutcome === undefined ? {} : { mutatedOutcome }),
  };

  // 5.8 - 5.11, 5.15: one suite run with the suite time limit.
  const suite = await adapters.suite.run(root, { timeLimitMs });
  if (!suite.ok) {
    if (suite.error.kind === "Timeout") return done("Timeout", seen);
    return err({ kind: "crash", mutant: mutant.id, message: suite.error.message });
  }

  const failing: { file: string; name: string; startLine: number }[] = [];
  for (const file of suite.value.files) {
    for (const t of file.tests) {
      if (t.status === "failed")
        failing.push({ file: file.path, name: t.name, startLine: t.startLine });
    }
  }
  if (failing.length === 0) return done("Survived", seen);

  // 6.2: kill class from the failing tests of this single run.
  const texts = new Map<string, string>();
  const kinds: { kind: TestKind }[] = [];
  for (const t of failing) {
    let text = texts.get(t.file);
    if (text === undefined) {
      const read = await adapters.fs.readFile(joinPath(root, t.file));
      text = read.ok ? read.value : "";
      texts.set(t.file, text);
    }
    kinds.push({
      kind: classifyTest(
        {
          filePath: t.file,
          // A file-level failure has no test body.
          bodySource: t.name === t.file ? "" : extractTestBody(text, t.startLine),
        },
        config.propertyTestGlobs,
      ),
    });
  }
  return done(
    "Killed",
    seen,
    // A file-level failure is named after its file: the path alone is the killing test (5.9).
    failing.map((t) => (t.name === t.file ? t.file : testIdOf(t.file, t.name)) as TestId),
    computeKillClass(kinds),
  );
}

/** The slice of the file system the reporting stage needs. */
export interface ReportAdapters {
  readonly fs: Pick<LoadFileSystem, "readFile" | "exists"> & {
    writeFile(path: string, content: string): Promise<Result<void, string>>;
  };
}

export interface ReportStageInput {
  readonly mechanical: readonly MechanicalOutcome[];
  readonly specMutants: readonly SpecMutantOutcome[];
  readonly ignoreStaticRetried: boolean;
  readonly metadata: RunMetadata;
}

export const REPORT_FILE_NAME = "mutation-report.json";
export const VERDICT_FILE_NAME = "verdict.json";
export const HISTORY_FILE_NAME = "history.jsonl";

/** Why the stage failed. `path` is the file at fault; `line` is 1-based for history errors. */
export interface ReportStageError {
  readonly kind: "history-error" | "write-error" | "build-error";
  readonly path?: string;
  readonly line?: number;
  readonly message: string;
}

export interface ReportStageResult {
  readonly reportPath: string;
  readonly verdictPath: string;
  readonly historyPath: string;
  readonly coverage: ReturnType<typeof computeCoverage>;
}

const positionIn = (source: string, offset: number): { line: number; column: number } => {
  const before = source.slice(0, Math.max(0, offset));
  const line = before.split("\n").length;
  return { line, column: offset - (before.lastIndexOf("\n") + 1) + 1 };
};

/**
 * Final stage of the orchestration: coverage, Mutation_Report, Verdict and history record,
 * then the three outputs. `history.jsonl` gets exactly one new line; earlier lines are kept
 * byte for byte (Requirements 8.1, 8.5, 8.8, 8.9, 8.13, 8.16). Nothing is written when the
 * existing history does not parse. Ids are passed to `report.ts` as data (Requirement 8.7).
 */
export async function writeReports(
  options: Pick<CliOptions, "project">,
  project: LoadedProject,
  input: ReportStageInput,
  adapters: ReportAdapters,
): Promise<Result<ReportStageResult, ReportStageError>> {
  const { fs } = adapters;
  const { config } = project;
  const criteria = project.specs.flatMap((s) => s.criteria);
  const skipEntries = project.specs.flatMap((s) => s.skipEntries.map((e) => e.entry));
  const results: MutantResult[] = [
    ...input.mechanical.map((m) => m.result),
    ...input.specMutants.map((m) => m.result),
  ];
  const coverage = computeCoverage(criteria, results, skipEntries);

  const witnesses: Record<MutantId, Witness> = {};
  for (const m of input.specMutants) witnesses[m.mutant.id] = m.mutant.witness;

  const verdict = buildVerdict({
    coverage: coverage.coverage,
    mutants: results,
    witnesses,
    ignoreStaticRetried: input.ignoreStaticRetried,
    metadata: input.metadata,
    projectRoot: options.project,
  });
  if (!verdict.ok) return err({ kind: "build-error", message: verdict.error });

  // Sources of every file the report mentions.
  const paths = [
    ...new Set([
      ...input.mechanical.map((m) => m.file),
      ...input.specMutants.map((m) => m.mutant.file),
    ]),
  ].sort();
  const sources = new Map<string, string>();
  for (const path of paths) {
    const read = await fs.readFile(joinPath(options.project, path));
    sources.set(path, read.ok ? read.value : "");
  }

  const mechanical: ReportMutantInput[] = input.mechanical.map((m) => ({
    id: m.result.id,
    file: m.file,
    location: m.location ?? {
      start: { line: Math.max(1, m.startLine), column: 1 },
      end: { line: Math.max(1, m.endLine), column: 1 },
    },
    replacement: m.replacement,
    status: m.result.status,
    mutatorName: m.mutatorName,
    killedBy: [...m.result.killingTests],
  }));
  const spec: SpecReportMutantInput[] = input.specMutants.map(({ mutant, result, message }) => {
    const source = sources.get(mutant.file) ?? "";
    const at = Math.max(0, source.indexOf(mutant.original));
    return {
      id: mutant.id,
      file: mutant.file,
      location: {
        start: positionIn(source, at),
        end: positionIn(source, at + mutant.original.length),
      },
      replacement: mutant.mutated,
      status: result.status,
      requirement: mutant.requirement,
      description: message === undefined ? mutant.why : `${mutant.why} (${message})`,
      killedBy: [...result.killingTests],
    };
  });
  const report = buildMutationReport({
    files: Object.fromEntries(
      paths.map((p) => [p, { language: "typescript", source: sources.get(p) ?? "" }]),
    ),
    mechanical,
    spec,
    ignoreStaticRetried: input.ignoreStaticRetried,
    projectRoot: options.project,
  });

  // History: read first, so a corrupt file stops the run before any write.
  const historyPath = joinPath(config.outputDir, HISTORY_FILE_NAME);
  let existing = "";
  let previousRecord: HistoryRecord | undefined;
  if (await fs.exists(historyPath)) {
    const read = await fs.readFile(historyPath);
    if (!read.ok) {
      return err({
        kind: "history-error",
        path: historyPath,
        message: `${historyPath} cannot be read: ${read.error}`,
      });
    }
    existing = read.value;
    const parsed = parseHistoryLines(existing);
    if (!parsed.ok) {
      return err({
        kind: "history-error",
        path: historyPath,
        line: parsed.error.line,
        message: `${historyPath}, line ${parsed.error.line}: ${parsed.error.message}`,
      });
    }
    previousRecord = parsed.value.at(-1);
  }
  const record = buildHistoryRecord(
    verdict.value,
    previousRecord,
    configAsWritten(config, options.project),
    options.project,
  );
  if (!record.ok) return err({ kind: "build-error", message: record.error });
  let line: string;
  try {
    line = serializeHistoryRecord(record.value);
  } catch (error) {
    return err({ kind: "build-error", message: messageOf(error) });
  }
  const separator = existing === "" || existing.endsWith("\n") ? "" : "\n";
  const history = `${existing}${separator}${line}\n`;

  const reportPath = joinPath(config.outputDir, REPORT_FILE_NAME);
  const verdictPath = joinPath(config.outputDir, VERDICT_FILE_NAME);
  const outputs: [string, string][] = [
    [reportPath, `${JSON.stringify(report, null, 2)}\n`],
    [verdictPath, serializeVerdict(verdict.value)],
    [historyPath, history],
  ];
  for (const [path, content] of outputs) {
    const written = await fs.writeFile(path, content);
    if (!written.ok) {
      return err({
        kind: "write-error",
        path,
        message: `${path} cannot be written: ${written.error}`,
      });
    }
  }
  return ok({ reportPath, verdictPath, historyPath, coverage });
}
