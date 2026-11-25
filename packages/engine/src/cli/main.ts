#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readdir, readFile, realpath } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createFileSystem } from "../adapters/file-system-adapter.js";
import { Git } from "../adapters/git-adapter.js";
import { removeLeftoverSandboxes, Sandbox } from "../adapters/sandbox.js";
import { MechanicalRunner } from "../adapters/stryker-adapter.js";
import { Typecheck } from "../adapters/typecheck-adapter.js";
import { SuiteRunner } from "../adapters/vitest-suite-runner.js";
import { WitnessRunner } from "../adapters/vitest-witness-runner.js";
import { err, ok } from "../core/result.js";
import type { CoverageStatus, RunMetadata } from "../core/types.js";
import { parseArgs, USAGE_TEXT } from "./args.js";
import {
  type LoadAdapters,
  type LoadStageError,
  loadProject,
  type MechanicalAdapters,
  type MechanicalStageError,
  type ReportAdapters,
  type ReportStageError,
  runBaselineAndMechanical,
  runSpecMutants,
  type SpecMutantAdapters,
  type SpecMutantStageError,
  writeReports,
} from "./orchestrate.js";

/** Everything the CLI touches outside the pure core, so tests can replace it. */
export interface CliDeps {
  readonly cwd: string;
  stdout(text: string): void;
  stderr(text: string): void;
  readonly fs: LoadAdapters["fs"] &
    ReportAdapters["fs"] &
    SpecMutantAdapters["fs"] &
    MechanicalAdapters["fs"];
  readonly suite: MechanicalAdapters["suite"] & SpecMutantAdapters["suite"];
  readonly mechanical: MechanicalAdapters["mechanical"];
  readonly git: MechanicalAdapters["git"];
  readonly typecheck: SpecMutantAdapters["typecheck"];
  readonly witness: SpecMutantAdapters["witness"];
  /** Sandboxes exclude the output directory, which is given relative to the project root. */
  sandbox(outputDir: string): SpecMutantAdapters["sandbox"];
  metadata(projectRoot: string): Promise<RunMetadata>;
  /** Removes leftover Sandboxes at startup (5.20). Absent in tests that need no cleanup. */
  removeLeftovers?(projectRoot: string): Promise<number>;
}

const formatLoadError = (error: LoadStageError): string => {
  const where = error.line === undefined ? error.filePath : `${error.filePath}:${error.line}`;
  const field = error.field === undefined ? "" : ` (${error.field})`;
  return `${where}${field}: ${error.message}`;
};

const formatMechanicalError = (error: MechanicalStageError): string => {
  switch (error.kind) {
    case "baseline-failed":
      return `The baseline run has failing tests:\n${error.failingTests.map((t) => `  ${t}`).join("\n")}`;
    case "baseline-error":
      return `The baseline run failed: ${error.message}`;
    case "git-error":
      return `Git error: ${error.message}`;
    case "stryker-error":
      return `StrykerJS error: ${error.message}`;
  }
};

const formatSpecError = (error: SpecMutantStageError): string => {
  const mutant = "mutant" in error && error.mutant !== undefined ? ` (${error.mutant})` : "";
  return `Spec mutant run failed${mutant}: ${error.message}`;
};

const formatReportError = (error: ReportStageError): string => error.message;

const COVERAGE_ORDER: readonly CoverageStatus[] = ["guarded", "unguarded", "unattacked", "skipped"];

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Runs one command and returns the process exit code (Requirements 9.1, 9.2, 9.6-9.10). */
export async function runCli(argv: readonly string[], deps: CliDeps): Promise<number> {
  const parsed = parseArgs(argv, deps.cwd);
  if (!parsed.ok) {
    deps.stderr(`${parsed.error.message}\n\n${USAGE_TEXT}`);
    return 1;
  }
  const fail = (message: string): number => {
    deps.stderr(`${message.replace(/\n$/, "")}\n`);
    return 1;
  };

  try {
    const options = { ...parsed.value, project: resolve(deps.cwd, parsed.value.project) };

    const loaded = await loadProject(options, {
      fs: deps.fs,
      ...(deps.removeLeftovers === undefined
        ? {}
        : { sandbox: { removeLeftovers: deps.removeLeftovers } }),
    });
    if (!loaded.ok) return fail(loaded.error.map(formatLoadError).join("\n"));
    const project =
      options.command === "measure" && options.output !== undefined
        ? {
            ...loaded.value,
            config: { ...loaded.value.config, outputDir: resolve(deps.cwd, options.output) },
          }
        : loaded.value;

    const metadata = await deps.metadata(options.project);

    const mechanical = await runBaselineAndMechanical(
      options,
      project,
      { typescriptVersion: metadata.typescriptVersion },
      { fs: deps.fs, suite: deps.suite, mechanical: deps.mechanical, git: deps.git },
    );
    if (!mechanical.ok) return fail(formatMechanicalError(mechanical.error));

    const relativeOutput = relative(options.project, project.config.outputDir);
    const specMutants = await runSpecMutants(
      options,
      project,
      project.specs.flatMap((s) => s.mutants.map((m) => m.mutant)),
      { baselineMs: mechanical.value.baselineMs },
      {
        fs: deps.fs,
        sandbox: deps.sandbox(relativeOutput.startsWith("..") ? "" : relativeOutput),
        typecheck: deps.typecheck,
        witness: deps.witness,
        suite: deps.suite,
      },
    );
    if (!specMutants.ok) return fail(formatSpecError(specMutants.error));

    const written = await writeReports(
      options,
      project,
      {
        mechanical: mechanical.value.mutants,
        specMutants: specMutants.value,
        ignoreStaticRetried: mechanical.value.ignoreStaticRetried,
        metadata,
      },
      { fs: deps.fs },
    );
    if (!written.ok) return fail(formatReportError(written.error));

    const { coverage, reportPath, verdictPath, historyPath } = written.value;
    const lines = [`Surviving spec mutants: ${coverage.survivingSpecMutants}`, "Criteria:"];
    for (const status of COVERAGE_ORDER) {
      const count = coverage.coverage.filter((c) => c.status === status).length;
      lines.push(`  ${status}: ${count}`);
    }
    lines.push(
      `Strays: ${coverage.strays}`,
      "Written:",
      `  ${reportPath}`,
      `  ${verdictPath}`,
      `  ${historyPath}`,
    );
    deps.stdout(`${lines.join("\n")}\n`);
    return 0;
  } catch (error) {
    return fail(messageOf(error));
  }
}

const readVersion = async (packageJson: string): Promise<string | undefined> => {
  try {
    const parsed: unknown = JSON.parse(await readFile(packageJson, "utf8"));
    const version = (parsed as { version?: unknown }).version;
    return typeof version === "string" ? version : undefined;
  } catch {
    return undefined;
  }
};

/** Version of an installed package, found by walking up the node_modules folders. */
const installedVersion = async (name: string, from: string): Promise<string> => {
  let dir = from;
  for (;;) {
    const found = await readVersion(join(dir, "node_modules", name, "package.json"));
    if (found !== undefined) return found;
    const parent = dirname(dir);
    if (parent === dir) return "unknown";
    dir = parent;
  }
};

const gitCommit = (cwd: string): Promise<string> =>
  new Promise((done) => {
    execFile("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }, (error, stdout) => {
      done(error ? "unknown" : String(stdout).trim());
    });
  });

const defaultMetadata = async (projectRoot: string): Promise<RunMetadata> => ({
  gitCommit: await gitCommit(projectRoot),
  seed: 0,
  engineVersion:
    (await readVersion(fileURLToPath(new URL("../../package.json", import.meta.url)))) ?? "unknown",
  nodeVersion: process.version,
  strykerVersion: await installedVersion("@stryker-mutator/core", projectRoot),
  vitestVersion: await installedVersion("vitest", projectRoot),
  typescriptVersion: await installedVersion("typescript", projectRoot),
  timestamp: new Date().toISOString(),
});

/** Production adapters. */
export const createDefaultDeps = (): CliDeps => {
  const base = createFileSystem();
  return {
    cwd: process.cwd(),
    stdout: (text) => {
      process.stdout.write(text);
    },
    stderr: (text) => {
      process.stderr.write(text);
    },
    fs: {
      readFile: (path) => base.readFile(path),
      writeFile: (path, content) => base.writeFile(path, content),
      exists: (path) => base.exists(path),
      listEntries: (root) => base.listEntries(root),
      async listDir(path) {
        try {
          return ok(await readdir(path));
        } catch (error) {
          return err(`Cannot list ${path}: ${messageOf(error)}`);
        }
      },
    },
    suite: SuiteRunner,
    mechanical: MechanicalRunner,
    git: { diff: (ref, cwd) => Git.diff(ref, cwd) },
    typecheck: Typecheck,
    witness: WitnessRunner,
    sandbox: (outputDir) => ({
      create: (root, id) => Sandbox.create(root, id, { outputDir }),
      destroy: (handle) => base.removeDir(handle.root),
    }),
    metadata: defaultMetadata,
    removeLeftovers: (projectRoot) => removeLeftoverSandboxes(projectRoot),
  };
};

const isEntryPoint = async (): Promise<boolean> => {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return (await realpath(entry)) === (await realpath(fileURLToPath(import.meta.url)));
  } catch {
    return false;
  }
};

if (await isEntryPoint()) {
  process.exitCode = await runCli(process.argv.slice(2), createDefaultDeps());
}
