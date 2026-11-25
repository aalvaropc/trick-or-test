import { describe, expect, it } from "vitest";
import type { WitnessFailure } from "../../src/adapters/vitest-witness-runner.js";
import {
  type LoadedProject,
  runSpecMutants,
  type SpecMutantAdapters,
  writeReports,
} from "../../src/cli/orchestrate.js";
import { verdictSchema } from "../../src/core/report.js";
import { err, ok, type Result } from "../../src/core/result.js";
import type { CriterionId, MutantId, RunMetadata, SpecMutant } from "../../src/core/types.js";
import type { WitnessOutcome } from "../../src/core/witness-compare.js";

const ROOT = "/proj";
const OUT = `${ROOT}/reports`;
const SOURCE = "export const f = (a: number) => a < 10;\n";

const project: LoadedProject = {
  config: {
    specDir: `${ROOT}/.kiro/specs`,
    sourceGlobs: ["src/**/*.ts"],
    testGlobs: ["test/**/*.test.ts"],
    propertyTestGlobs: ["test/**/*.property.test.ts"],
    mutantsDir: `${ROOT}/mutants`,
    outputDir: OUT,
  },
  specs: [
    {
      name: "demo",
      requirementsPath: `${ROOT}/.kiro/specs/demo/requirements.md`,
      criteria: [{ id: "1.1" as CriterionId, requirement: 1, criterion: 1, text: "a", line: 1 }],
      mutants: [],
      skipEntries: [],
    },
  ],
};

const metadata: RunMetadata = {
  gitCommit: "abc",
  seed: 1,
  engineVersion: "0.0.0",
  nodeVersion: "v24",
  strykerVersion: "10.1.1",
  vitestVersion: "5.1.0",
  typescriptVersion: "7.0.2",
  timestamp: "2026-01-01T00:00:00.000Z",
};

const mutant: SpecMutant = {
  id: "oath-1.1-a" as MutantId,
  requirement: "1.1" as CriterionId,
  file: "src/f.ts",
  original: "a < 10",
  mutated: "a <= 10",
  why: "boundary",
  witness: { from: "src/f.ts", export: "f", args: [10], expected: false },
};

/** Runs the spec mutant stage, then the Reporter, on one shared fake file system. */
const pipeline = async (original: WitnessOutcome) => {
  const written = new Map<string, string>([[`${ROOT}/src/f.ts`, SOURCE]]);
  const fs = {
    async readFile(path: string): Promise<Result<string, string>> {
      const text =
        written.get(path) ?? written.get(path.replace(/^.*\/sandboxes\/[^/]+\//, `${ROOT}/`));
      return text === undefined ? err(`ENOENT ${path}`) : ok(text);
    },
    async exists(path: string) {
      return written.has(path);
    },
    async writeFile(path: string, content: string) {
      written.set(path, content);
      return ok(undefined);
    },
  };
  const suiteLimits: number[] = [];
  const adapters: SpecMutantAdapters = {
    fs,
    sandbox: {
      async create(projectRoot, id) {
        return ok({ root: `${projectRoot}/.trickortest/sandboxes/${id}` });
      },
      async destroy() {
        return ok(undefined);
      },
    },
    typecheck: {
      async run() {
        return ok(undefined);
      },
    },
    witness: {
      async run(root, witnesses) {
        const pristine = root.endsWith("/pristine");
        const out: Record<string, Result<WitnessOutcome, WitnessFailure>> = {};
        for (const w of witnesses)
          out[w.id] = ok(pristine ? original : { kind: "value", value: true });
        return ok(out);
      },
    },
    suite: {
      async run(_root, options) {
        suiteLimits.push(options.timeLimitMs);
        return ok({ durationMs: 5, files: [] });
      },
    },
  };
  const stage = await runSpecMutants(
    { project: ROOT },
    project,
    [mutant],
    { baselineMs: 1000 },
    adapters,
  );
  if (!stage.ok) throw new Error(`stage failed: ${JSON.stringify(stage.error)}`);
  const reported = await writeReports(
    { project: ROOT },
    project,
    { mechanical: [], specMutants: stage.value, ignoreStaticRetried: false, metadata },
    { fs },
  );
  if (!reported.ok) throw new Error(`report failed: ${JSON.stringify(reported.error)}`);
  const text = written.get(`${OUT}/verdict.json`);
  if (text === undefined) throw new Error("verdict.json was not written");
  return { verdict: verdictSchema.parse(JSON.parse(text)), suiteLimits };
};

describe("InvalidWitness in the written verdict.json", () => {
  it("5.6 the written verdict holds status, expected and originalOutcome for a value", async () => {
    const { verdict, suiteLimits } = await pipeline({ kind: "value", value: true });
    const written = verdict.mutants.find((m) => m.id === mutant.id);
    expect(written?.status).toBe("InvalidWitness");
    expect(written?.invalidWitness).toEqual({
      expected: { expected: false },
      originalOutcome: { kind: "value", value: true },
    });
    expect(suiteLimits).toEqual([]);
  });

  it("5.6 the written verdict holds the original timeout outcome", async () => {
    const original: WitnessOutcome = { kind: "timeout", message: "witness exceeded 10000 ms" };
    const { verdict } = await pipeline(original);
    const written = verdict.mutants.find((m) => m.id === mutant.id);
    expect(written?.status).toBe("InvalidWitness");
    expect(written?.invalidWitness).toEqual({
      expected: { expected: false },
      originalOutcome: original,
    });
  });
});
