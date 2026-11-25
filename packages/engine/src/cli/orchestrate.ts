import { CONFIG_FILE_NAME, resolveConfigPaths, validateConfig } from "../core/config.js";
import { parseRequirements } from "../core/requirements.js";
import { err, ok, type Result } from "../core/result.js";
import {
  checkCrossFileRules,
  type LoadedSkipEntry,
  type LoadedSpecMutant,
  loadSpecMutants,
  validateSkipFile,
} from "../core/spec-mutants.js";
import type { Criterion, EngineConfig } from "../core/types.js";
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
